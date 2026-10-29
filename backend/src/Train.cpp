#include "Train.h"

#include <ostream>
#include <sstream>

#include "TextUtils.h"
#include "TimeUtils.h"

namespace railflow {

using timeutil::formatHHMM;

// ---------------------------------------------------------------------------
// Enum helpers
// ---------------------------------------------------------------------------

const char* toString(Operational o) {
    switch (o) {
        case Operational::Normal: return "normal";
        case Operational::Stopped: return "stopped";
        case Operational::Cancelled: return "cancelled";
    }
    return "normal";
}

const char* toString(TrainStatus s) {
    switch (s) {
        case TrainStatus::Draft: return "draft";
        case TrainStatus::Scheduled: return "scheduled";
        case TrainStatus::Running: return "running";
        case TrainStatus::Completed: return "completed";
        case TrainStatus::Stopped: return "stopped";
        case TrainStatus::Cancelled: return "cancelled";
    }
    return "draft";
}

const char* toString(StationState s) {
    switch (s) {
        case StationState::Visited: return "visited";
        case StationState::Current: return "current";
        case StationState::Upcoming: return "upcoming";
    }
    return "upcoming";
}

bool parseOperational(const std::string& text, Operational& out) {
    const std::string t = toLower(trim(text));
    if (t == "normal") out = Operational::Normal;
    else if (t == "stopped") out = Operational::Stopped;
    else if (t == "cancelled") out = Operational::Cancelled;
    else return false;
    return true;
}

bool parseTrainStatus(const std::string& text, TrainStatus& out) {
    const std::string t = toLower(trim(text));
    if (t == "draft") out = TrainStatus::Draft;
    else if (t == "scheduled") out = TrainStatus::Scheduled;
    else if (t == "running") out = TrainStatus::Running;
    else if (t == "completed") out = TrainStatus::Completed;
    else if (t == "stopped") out = TrainStatus::Stopped;
    else if (t == "cancelled") out = TrainStatus::Cancelled;
    else return false;
    return true;
}

// ---------------------------------------------------------------------------
// Construction, destruction, move semantics
// ---------------------------------------------------------------------------

Train::Train(std::string number, std::string name)
    : number_(std::move(number)), name_(std::move(name)) {}

Train::~Train() { clear(); }

// Walks the list once, deleting each node. `next` is saved BEFORE the delete,
// otherwise we would read freed memory.
void Train::clear() noexcept {
    Station* node = head_;
    while (node != nullptr) {
        Station* following = node->next;
        delete node;
        node = following;
    }
    head_ = tail_ = current_ = nullptr;
    size_ = 0;
    position_ = -1;
}

Train::Train(Train&& other) noexcept
    : number_(std::move(other.number_)),
      name_(std::move(other.name_)),
      operational_(other.operational_),
      head_(other.head_),
      tail_(other.tail_),
      current_(other.current_),
      size_(other.size_),
      position_(other.position_) {
    // The source no longer owns anything; its destructor will free nothing.
    other.head_ = other.tail_ = other.current_ = nullptr;
    other.size_ = 0;
    other.position_ = -1;
}

Train& Train::operator=(Train&& other) noexcept {
    if (this != &other) {
        clear();  // release what we own first
        number_ = std::move(other.number_);
        name_ = std::move(other.name_);
        operational_ = other.operational_;
        head_ = other.head_;
        tail_ = other.tail_;
        current_ = other.current_;
        size_ = other.size_;
        position_ = other.position_;
        other.head_ = other.tail_ = other.current_ = nullptr;
        other.size_ = 0;
        other.position_ = -1;
    }
    return *this;
}

// ---------------------------------------------------------------------------
// Validation shared by addStation / updateStation
// ---------------------------------------------------------------------------

Status Train::validateStationFields(const std::string& name, int arrival, int departure) const {
    if (name.empty()) {
        return Status::Fail(ErrorCode::Validation, "Station name cannot be empty.", "name");
    }
    if (name.size() > kMaxNameLength) {
        return Status::Fail(ErrorCode::Validation,
                            "Station name must be at most 60 characters.", "name");
    }
    if (hasControlChars(name)) {
        return Status::Fail(ErrorCode::Validation,
                            "Station name contains invalid characters.", "name");
    }
    if (!timeutil::isValidMinutes(arrival)) {
        return Status::Fail(ErrorCode::Validation,
                            "Arrival time must be between 00:00 and 23:59.", "arrival");
    }
    if (!timeutil::isValidMinutes(departure)) {
        return Status::Fail(ErrorCode::Validation,
                            "Departure time must be between 00:00 and 23:59.", "departure");
    }
    if (departure < arrival) {
        return Status::Fail(ErrorCode::Validation,
                            "Departure time cannot be earlier than arrival time.", "departure");
    }
    return Status::Ok();
}

// ---------------------------------------------------------------------------
// Route building
// ---------------------------------------------------------------------------

Status Train::addStation(const std::string& rawName, int arrival, int departure) {
    const std::string name = trim(rawName);
    if (Status s = validateStationFields(name, arrival, departure); !s) return s;

    if (findStation(name) != nullptr) {
        return Status::Fail(ErrorCode::Conflict,
                            "\"" + name + "\" is already on this route.", "name");
    }
    if (tail_ != nullptr && arrival < tail_->departureTime) {
        return Status::Fail(
            ErrorCode::Validation,
            "Arrival at " + name + " (" + formatHHMM(arrival) +
                ") cannot be earlier than the departure from " + tail_->name + " (" +
                formatHHMM(tail_->departureTime) +
                "). Journeys crossing midnight are not supported.",
            "arrival");
    }

    // Allocate first: if `new` throws, no train state has been touched yet.
    Station* node = new Station(name, arrival, departure);

    if (head_ == nullptr) {
        // First stop: list was empty, so head, tail and current all become this node.
        head_ = tail_ = current_ = node;
        position_ = 0;
    } else {
        tail_->next = node;  // link after the old last node ...
        tail_ = node;        // ... and make the new node the last one
    }
    ++size_;
    return Status::Ok();
}

Status Train::updateStation(int index, const std::string& rawName, int arrival, int departure) {
    if (index < 0 || index >= size_) {
        return Status::Fail(ErrorCode::NotFound, "Station index " + std::to_string(index) +
                                                      " does not exist on this route.");
    }
    const std::string name = trim(rawName);
    if (Status s = validateStationFields(name, arrival, departure); !s) return s;

    // Walk to the node, remembering the one before it.
    Station* prev = nullptr;
    Station* node = head_;
    for (int i = 0; i < index; ++i) {
        prev = node;
        node = node->next;
    }

    // Name must stay unique among the OTHER stations.
    for (const Station* it = head_; it != nullptr; it = it->next) {
        if (it != node && equalsIgnoreCase(it->name, name)) {
            return Status::Fail(ErrorCode::Conflict,
                                "\"" + name + "\" is already on this route.", "name");
        }
    }
    if (prev != nullptr && arrival < prev->departureTime) {
        return Status::Fail(ErrorCode::Validation,
                            "Arrival (" + formatHHMM(arrival) +
                                ") cannot be earlier than the departure from " + prev->name +
                                " (" + formatHHMM(prev->departureTime) + ").",
                            "arrival");
    }
    if (node->next != nullptr && departure > node->next->arrivalTime) {
        return Status::Fail(ErrorCode::Validation,
                            "Departure (" + formatHHMM(departure) +
                                ") cannot be later than the arrival at " + node->next->name +
                                " (" + formatHHMM(node->next->arrivalTime) + ").",
                            "departure");
    }

    node->name = name;
    node->arrivalTime = arrival;
    node->departureTime = departure;
    return Status::Ok();
}

Status Train::removeStation(int index) {
    if (index < 0 || index >= size_) {
        return Status::Fail(ErrorCode::NotFound, "Station index " + std::to_string(index) +
                                                      " does not exist on this route.");
    }

    Station* prev = nullptr;
    Station* node = head_;
    for (int i = 0; i < index; ++i) {
        prev = node;
        node = node->next;
    }

    // Safety rule: never delete the node current_ points at.
    if (node == current_) {
        return Status::Fail(ErrorCode::Conflict,
                            "Cannot remove " + node->name +
                                " because the train is currently there. Move the train to "
                                "another station first.");
    }

    // Unlink the node.
    if (prev == nullptr) {
        head_ = node->next;  // removing the first node
    } else {
        prev->next = node->next;
    }
    if (node == tail_) {
        tail_ = prev;  // removing the last node: prev becomes the tail
    }
    // A removal BEFORE the current node shifts the current node one index left.
    if (index < position_) {
        --position_;
    }
    --size_;
    delete node;
    return Status::Ok();
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

Status Train::moveToNext() {
    if (operational_ != Operational::Normal) {
        return Status::Fail(ErrorCode::Conflict,
                            std::string("Train is ") + toString(operational_) +
                                ". Set it back to normal operation before moving it.");
    }
    if (size_ < 2) {
        return Status::Fail(ErrorCode::Conflict,
                            "The route needs at least two stations before the train can move.");
    }
    if (current_->next == nullptr) {
        return Status::Fail(ErrorCode::Conflict,
                            "Train has already reached its final station (" + current_->name +
                                ").");
    }
    current_ = current_->next;  // the heart of the simulation: advance the pointer
    ++position_;
    return Status::Ok();
}

void Train::resetToOrigin() {
    current_ = head_;
    position_ = head_ ? 0 : -1;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const Station* Train::stationAt(int index) const {
    if (index < 0 || index >= size_) return nullptr;
    const Station* node = head_;
    for (int i = 0; i < index; ++i) node = node->next;
    return node;
}

const Station* Train::findStation(const std::string& name) const {
    const std::string wanted = trim(name);
    for (const Station* node = head_; node != nullptr; node = node->next) {
        if (equalsIgnoreCase(node->name, wanted)) return node;
    }
    return nullptr;
}

bool Train::isAtFinalStation() const {
    return size_ >= 2 && current_ != nullptr && current_->next == nullptr;
}

TrainStatus Train::status() const {
    if (operational_ == Operational::Cancelled) return TrainStatus::Cancelled;
    if (operational_ == Operational::Stopped) return TrainStatus::Stopped;
    if (size_ < 2) return TrainStatus::Draft;
    if (isAtFinalStation()) return TrainStatus::Completed;
    if (position_ == 0) return TrainStatus::Scheduled;
    return TrainStatus::Running;
}

std::vector<StationView> Train::routeView() const {
    std::vector<StationView> out;
    out.reserve(static_cast<std::size_t>(size_));
    int index = 0;
    const Station* previous = nullptr;
    for (const Station* node = head_; node != nullptr; previous = node, node = node->next, ++index) {
        StationView v;
        v.index = index;
        v.name = node->name;
        v.arrival = node->arrivalTime;
        v.departure = node->departureTime;
        v.isOrigin = (index == 0);
        v.isFinal = (node->next == nullptr);
        v.travelFromPrevious = previous ? node->arrivalTime - previous->departureTime : -1;
        if (index < position_) v.state = StationState::Visited;
        else if (index == position_) v.state = StationState::Current;
        else v.state = StationState::Upcoming;
        out.push_back(std::move(v));
    }
    return out;
}

void Train::displayRoute(std::ostream& out) const {
    if (head_ == nullptr) {
        out << "(no stations)";
        return;
    }
    for (const Station* node = head_; node != nullptr; node = node->next) {
        if (node == current_) out << '[' << node->name << ']';
        else out << node->name;
        if (node->next != nullptr) out << " -> ";
    }
}

std::string Train::routeString() const {
    std::ostringstream oss;
    displayRoute(oss);
    return oss.str();
}

bool Train::checkInvariants(std::string* reason) const {
    auto fail = [&](const std::string& why) {
        if (reason) *reason = why;
        return false;
    };

    if (head_ == nullptr) {
        if (tail_ != nullptr || current_ != nullptr) return fail("empty list but tail/current set");
        if (size_ != 0 || position_ != -1) return fail("empty list but size/position wrong");
        return true;
    }
    if (tail_ == nullptr || current_ == nullptr) return fail("non-empty list missing tail/current");

    int count = 0;
    int currentAt = -1;
    const Station* last = nullptr;
    std::vector<std::string> names;
    for (const Station* node = head_; node != nullptr; node = node->next) {
        if (++count > size_ + 1) return fail("cycle or size mismatch while traversing");
        if (node == current_) currentAt = count - 1;
        if (node->departureTime < node->arrivalTime) return fail("departure before arrival");
        if (last != nullptr && node->arrivalTime < last->departureTime)
            return fail("arrival before previous departure");
        for (const auto& n : names) {
            if (equalsIgnoreCase(n, node->name)) return fail("duplicate station name");
        }
        names.push_back(node->name);
        last = node;
    }
    if (count != size_) return fail("size_ does not match node count");
    if (last != tail_) return fail("tail_ is not the last node");
    if (currentAt < 0) return fail("current_ is not part of the list");
    if (currentAt != position_) return fail("position_ does not match current_");
    return true;
}

}  // namespace railflow
