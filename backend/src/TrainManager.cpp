#include "TrainManager.h"

#include <algorithm>
#include <chrono>
#include <ctime>

#include "TextUtils.h"
#include "TimeUtils.h"

namespace railflow {

using timeutil::formatHHMM;

namespace {

std::string isoTimestampNow() {
    const std::time_t t = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    std::tm utc{};
#ifdef _WIN32
    gmtime_s(&utc, &t);
#else
    gmtime_r(&t, &utc);
#endif
    char buf[32];
    std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", &utc);
    return buf;
}

// Train numbers are digit strings; compare by length first so "999" < "1000".
bool numberLess(const std::string& a, const std::string& b) {
    if (a.size() != b.size()) return a.size() < b.size();
    return a < b;
}

Status notFound(const std::string& number) {
    return Status::Fail(ErrorCode::NotFound, "Train " + number + " was not found.");
}

}  // namespace

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

Status TrainManager::validateTrainNumber(const std::string& rawNumber) {
    const std::string number = trim(rawNumber);
    if (number.empty()) {
        return Status::Fail(ErrorCode::Validation, "Train number is required.", "number");
    }
    if (!allDigits(number) || number.size() < 3 || number.size() > 6) {
        return Status::Fail(ErrorCode::Validation,
                            "Train number must be 3 to 6 digits (for example 12127).", "number");
    }
    return Status::Ok();
}

Status TrainManager::validateTrainName(const std::string& rawName) {
    const std::string name = trim(rawName);
    if (name.empty()) {
        return Status::Fail(ErrorCode::Validation, "Train name is required.", "name");
    }
    if (name.size() < 2) {
        return Status::Fail(ErrorCode::Validation, "Train name must be at least 2 characters.",
                            "name");
    }
    if (name.size() > Train::kMaxNameLength) {
        return Status::Fail(ErrorCode::Validation, "Train name must be at most 60 characters.",
                            "name");
    }
    if (hasControlChars(name)) {
        return Status::Fail(ErrorCode::Validation, "Train name contains invalid characters.",
                            "name");
    }
    return Status::Ok();
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Linear search over the trains (O(n)); the number is the unique key.
Train* TrainManager::findLocked(const std::string& number) const {
    const std::string wanted = trim(number);
    for (const auto& t : trains_) {
        if (t->number() == wanted) return t.get();
    }
    return nullptr;
}

TrainSummary TrainManager::summarize(const Train& train) {
    TrainSummary s;
    s.number = train.number();
    s.name = train.name();
    s.status = train.status();
    s.operational = train.operational();
    s.stationCount = train.stationCount();
    if (const Station* first = train.firstStation()) s.origin = first->name;
    if (const Station* last = train.lastStation()) s.destination = last->name;
    if (const Station* cur = train.currentStation()) s.currentStation = cur->name;
    if (const Station* nxt = train.nextStation()) s.nextStation = nxt->name;
    s.currentIndex = train.currentIndex();
    s.atFinalStation = train.isAtFinalStation();
    return s;
}

RouteView TrainManager::makeRouteView(const Train& train) {
    RouteView v;
    v.train = summarize(train);
    v.stations = train.routeView();
    return v;
}

void TrainManager::recordLocked(const std::string& type, const std::string& trainNumber,
                                const std::string& message) {
    Event e;
    e.id = nextEventId_++;
    e.type = type;
    e.trainNumber = trainNumber;
    e.message = message;
    e.timestamp = isoTimestampNow();
    events_.push_back(std::move(e));
    while (events_.size() > kMaxEvents) events_.pop_front();
}

// ---------------------------------------------------------------------------
// Trains
// ---------------------------------------------------------------------------

Result<TrainSummary> TrainManager::createTrain(const std::string& rawNumber,
                                               const std::string& rawName) {
    if (Status s = validateTrainNumber(rawNumber); !s) return s;
    if (Status s = validateTrainName(rawName); !s) return s;
    const std::string number = trim(rawNumber);
    const std::string name = trim(rawName);

    std::lock_guard<std::mutex> lock(mutex_);
    if (findLocked(number) != nullptr) {
        return Status::Fail(ErrorCode::Conflict, "Train number " + number + " already exists.",
                            "number");
    }
    trains_.push_back(std::make_unique<Train>(number, name));
    recordLocked("train_created", number, "Train " + number + " (" + name + ") was created.");
    return Result<TrainSummary>::Ok(summarize(*trains_.back()));
}

std::vector<TrainSummary> TrainManager::listTrains(const TrainQuery& query) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const std::string needle = trim(query.text);

    std::vector<TrainSummary> out;
    for (const auto& t : trains_) {
        if (!needle.empty() && !containsIgnoreCase(t->number(), needle) &&
            !containsIgnoreCase(t->name(), needle)) {
            continue;
        }
        if (query.status && t->status() != *query.status) continue;
        out.push_back(summarize(*t));
    }

    std::stable_sort(out.begin(), out.end(), [&](const TrainSummary& a, const TrainSummary& b) {
        if (query.sortBy == TrainQuery::SortField::Name) {
            const std::string an = toLower(a.name), bn = toLower(b.name);
            if (an != bn) return query.descending ? an > bn : an < bn;
            return numberLess(a.number, b.number);  // tie-break on number
        }
        return query.descending ? numberLess(b.number, a.number) : numberLess(a.number, b.number);
    });
    return out;
}

Result<TrainSummary> TrainManager::getTrain(const std::string& number) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const Train* t = findLocked(number);
    if (!t) return notFound(trim(number));
    return Result<TrainSummary>::Ok(summarize(*t));
}

Result<TrainSummary> TrainManager::updateTrain(const std::string& number,
                                               const TrainUpdate& update) {
    // Validate everything up front so the update is all-or-nothing.
    if (update.number) {
        if (Status s = validateTrainNumber(*update.number); !s) return s;
    }
    if (update.name) {
        if (Status s = validateTrainName(*update.name); !s) return s;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    Train* train = findLocked(number);
    if (!train) return notFound(trim(number));

    const std::string oldNumber = train->number();
    std::string newNumber = oldNumber;
    if (update.number) {
        newNumber = trim(*update.number);
        if (newNumber != oldNumber && findLocked(newNumber) != nullptr) {
            return Status::Fail(ErrorCode::Conflict,
                                "Train number " + newNumber + " already exists.", "number");
        }
    }

    // Everything is valid: apply the changes.
    std::vector<std::string> changes;
    if (update.name && trim(*update.name) != train->name()) {
        train->setName(trim(*update.name));
        changes.push_back("name");
    }
    if (newNumber != oldNumber) {
        train->setNumber(newNumber);
        changes.push_back("number");
    }
    if (update.operational && *update.operational != train->operational()) {
        train->setOperational(*update.operational);
        changes.push_back(std::string("status set to ") + toString(*update.operational));
    }

    if (!changes.empty()) {
        std::string detail;
        for (std::size_t i = 0; i < changes.size(); ++i) {
            detail += (i ? ", " : "") + changes[i];
        }
        std::string msg = "Train " + oldNumber + " updated (" + detail + ")";
        if (newNumber != oldNumber) msg += "; now numbered " + newNumber;
        recordLocked("train_updated", newNumber, msg + ".");
    }
    return Result<TrainSummary>::Ok(summarize(*train));
}

Status TrainManager::deleteTrain(const std::string& number) {
    std::lock_guard<std::mutex> lock(mutex_);
    const std::string wanted = trim(number);
    auto it = std::find_if(trains_.begin(), trains_.end(),
                           [&](const std::unique_ptr<Train>& t) { return t->number() == wanted; });
    if (it == trains_.end()) return notFound(wanted);

    const std::string name = (*it)->name();
    trains_.erase(it);  // unique_ptr destructor -> ~Train() -> every station node freed
    recordLocked("train_deleted", wanted, "Train " + wanted + " (" + name + ") was deleted.");
    return Status::Ok();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

Result<RouteView> TrainManager::getRoute(const std::string& number) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const Train* t = findLocked(number);
    if (!t) return notFound(trim(number));
    return Result<RouteView>::Ok(makeRouteView(*t));
}

Result<RouteView> TrainManager::addStation(const std::string& number,
                                           const std::string& stationName, int arrival,
                                           int departure) {
    std::lock_guard<std::mutex> lock(mutex_);
    Train* t = findLocked(number);
    if (!t) return notFound(trim(number));

    if (Status s = t->addStation(stationName, arrival, departure); !s) return s;
    recordLocked("station_added", t->number(),
                 "Station " + trim(stationName) + " (" + formatHHMM(arrival) + "-" +
                     formatHHMM(departure) + ") added to train " + t->number() + ".");
    return Result<RouteView>::Ok(makeRouteView(*t));
}

Result<StationView> TrainManager::getStation(const std::string& number, int index) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const Train* t = findLocked(number);
    if (!t) return notFound(trim(number));

    const auto view = t->routeView();
    if (index < 0 || index >= static_cast<int>(view.size())) {
        return Status::Fail(ErrorCode::NotFound,
                            "Station index " + std::to_string(index) + " does not exist on train " +
                                t->number() + ".");
    }
    return Result<StationView>::Ok(view[static_cast<std::size_t>(index)]);
}

Result<RouteView> TrainManager::updateStation(const std::string& number, int index,
                                              const std::string& stationName, int arrival,
                                              int departure) {
    std::lock_guard<std::mutex> lock(mutex_);
    Train* t = findLocked(number);
    if (!t) return notFound(trim(number));

    const Station* before = t->stationAt(index);
    const std::string oldName = before ? before->name : std::string();
    if (Status s = t->updateStation(index, stationName, arrival, departure); !s) return s;
    recordLocked("station_updated", t->number(),
                 "Station " + oldName + " on train " + t->number() + " was edited.");
    return Result<RouteView>::Ok(makeRouteView(*t));
}

Result<RouteView> TrainManager::removeStation(const std::string& number, int index) {
    std::lock_guard<std::mutex> lock(mutex_);
    Train* t = findLocked(number);
    if (!t) return notFound(trim(number));

    const Station* target = t->stationAt(index);
    const std::string stationName = target ? target->name : std::string();
    if (Status s = t->removeStation(index); !s) return s;
    recordLocked("station_removed", t->number(),
                 "Station " + stationName + " was removed from train " + t->number() + ".");
    return Result<RouteView>::Ok(makeRouteView(*t));
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

Result<RouteView> TrainManager::moveTrain(const std::string& number) {
    std::lock_guard<std::mutex> lock(mutex_);
    Train* t = findLocked(number);
    if (!t) return notFound(trim(number));

    const std::string from = t->currentStation() ? t->currentStation()->name : std::string();
    if (Status s = t->moveToNext(); !s) return s;

    const std::string to = t->currentStation()->name;
    recordLocked("train_moved", t->number(),
                 "Train " + t->number() + " moved from " + from + " to " + to + ".");
    if (t->isAtFinalStation()) {
        recordLocked("train_reached_final", t->number(),
                     "Train " + t->number() + " reached its final station, " + to + ".");
    }
    return Result<RouteView>::Ok(makeRouteView(*t));
}

Result<RouteView> TrainManager::resetTrain(const std::string& number) {
    std::lock_guard<std::mutex> lock(mutex_);
    Train* t = findLocked(number);
    if (!t) return notFound(trim(number));
    if (!t->hasRoute()) {
        return Status::Fail(ErrorCode::Conflict, "Train " + t->number() + " has no route to reset.");
    }
    t->resetToOrigin();
    recordLocked("train_reset", t->number(),
                 "Train " + t->number() + " was reset to its origin, " +
                     t->currentStation()->name + ".");
    return Result<RouteView>::Ok(makeRouteView(*t));
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

DashboardStats TrainManager::stats() const {
    std::lock_guard<std::mutex> lock(mutex_);
    DashboardStats s;
    for (const char* key : {"draft", "scheduled", "running", "completed", "stopped", "cancelled"}) {
        s.byStatus[key] = 0;
    }
    for (const auto& t : trains_) {
        ++s.totalTrains;
        const TrainStatus st = t->status();
        ++s.byStatus[toString(st)];
        if (st == TrainStatus::Scheduled || st == TrainStatus::Running) ++s.activeTrains;
        if (t->isAtFinalStation()) ++s.atFinalStation;
        s.totalStations += t->stationCount();
    }
    s.eventCount = static_cast<int>(events_.size());
    return s;
}

std::vector<Event> TrainManager::recentEvents(std::size_t limit) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<Event> out;
    for (auto it = events_.rbegin(); it != events_.rend() && out.size() < limit; ++it) {
        out.push_back(*it);
    }
    return out;
}

ScheduleReport TrainManager::schedule() const {
    std::lock_guard<std::mutex> lock(mutex_);
    ScheduleReport report;

    for (const auto& t : trains_) {
        const TrainStatus status = t->status();
        for (const StationView& v : t->routeView()) {
            ScheduleEntry e;
            e.trainNumber = t->number();
            e.trainName = t->name();
            e.station = v.name;
            e.stationIndex = v.index;
            e.arrival = v.arrival;
            e.departure = v.departure;
            e.state = v.state;
            e.trainStatus = status;
            report.entries.push_back(std::move(e));
        }
    }
    std::stable_sort(report.entries.begin(), report.entries.end(),
                     [](const ScheduleEntry& a, const ScheduleEntry& b) {
                         if (a.arrival != b.arrival) return a.arrival < b.arrival;
                         return numberLess(a.trainNumber, b.trainNumber);
                     });

    // Conflict detection: two different trains at the same station whose
    // [arrival, departure] windows overlap (or that arrive in the same minute).
    // Cancelled trains do not occupy platforms.
    std::map<std::string, std::vector<const ScheduleEntry*>> byStation;
    for (const auto& e : report.entries) {
        if (e.trainStatus == TrainStatus::Cancelled) continue;
        byStation[toLower(e.station)].push_back(&e);
    }
    for (const auto& [key, list] : byStation) {
        for (std::size_t i = 0; i < list.size(); ++i) {
            for (std::size_t j = i + 1; j < list.size(); ++j) {
                const ScheduleEntry& a = *list[i];
                const ScheduleEntry& b = *list[j];
                if (a.trainNumber == b.trainNumber) continue;
                const int start = std::max(a.arrival, b.arrival);
                const int end = std::min(a.departure, b.departure);
                if (start < end || a.arrival == b.arrival) {
                    ScheduleConflict c;
                    c.station = a.station;
                    c.a = a;
                    c.b = b;
                    c.overlapMinutes = std::max(0, end - start);
                    report.conflicts.push_back(std::move(c));
                }
            }
        }
    }
    return report;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

namespace {

struct SampleStop {
    const char* name;
    const char* arrival;
    const char* departure;
};

struct SampleTrain {
    const char* number;
    const char* name;
    std::vector<SampleStop> stops;
    int advanceBy;  // how many stations the sample train has already moved
};

}  // namespace

SeedReport TrainManager::seedSampleData() {
    const std::vector<SampleTrain> samples = {
        {"90101",
         "Mumbai-Pune Intercity",
         {{"Mumbai Central", "08:00", "08:15"},
          {"Thane", "09:00", "09:10"},
          {"Kalyan", "09:50", "10:00"},
          {"Lonavala", "11:00", "11:10"},
          {"Pune", "12:30", "12:45"}},
         0},
        {"90102",
         "Pune-Mumbai Express",
         {{"Pune", "06:30", "06:40"},
          {"Lonavala", "07:30", "07:35"},
          {"Kalyan", "08:45", "08:50"},
          {"Thane", "09:15", "09:20"},
          {"Mumbai Central", "10:00", "10:15"}},
         2},
        {"90201",
         "Capital Link Express",
         {{"New Delhi", "06:00", "06:15"},
          {"Mathura", "07:25", "07:27"},
          {"Agra Cantt", "08:05", "08:10"},
          {"Gwalior", "09:15", "09:20"},
          {"Jhansi", "10:20", "10:30"},
          {"Bhopal", "13:10", "13:25"}},
         1},
    };

    std::lock_guard<std::mutex> lock(mutex_);
    SeedReport report;
    for (const auto& sample : samples) {
        if (findLocked(sample.number) != nullptr) {
            ++report.skipped;
            continue;
        }
        auto train = std::make_unique<Train>(sample.number, sample.name);
        for (const auto& stop : sample.stops) {
            int arr = 0, dep = 0;
            timeutil::parseHHMM(stop.arrival, arr);
            timeutil::parseHHMM(stop.departure, dep);
            train->addStation(stop.name, arr, dep);
        }
        for (int i = 0; i < sample.advanceBy; ++i) train->moveToNext();
        trains_.push_back(std::move(train));
        ++report.created;
    }
    if (report.created > 0) {
        recordLocked("sample_data", "",
                     std::to_string(report.created) + " sample train(s) loaded.");
    }
    return report;
}

}  // namespace railflow
