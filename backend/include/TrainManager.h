#pragma once
// TrainManager: the in-memory "database" of RailFlow.
//
// * Owns every Train through std::unique_ptr, so deleting a train from the
//   container frees its whole linked list via ~Train().
// * Is thread-safe: the HTTP server handles requests on a thread pool, so
//   every public method takes a mutex. Methods hand out value snapshots
//   (never raw Train pointers), which stay valid after the lock is released.
// * Keeps a bounded in-memory event log for the dashboard.
//
// Data lives only in memory and is lost when the process exits.

#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include "Result.h"
#include "Train.h"

namespace railflow {

struct TrainSummary {
    std::string number;
    std::string name;
    TrainStatus status = TrainStatus::Draft;
    Operational operational = Operational::Normal;
    int stationCount = 0;
    std::string origin;       // empty when there are no stations
    std::string destination;  // empty when there are no stations
    std::string currentStation;
    std::string nextStation;
    int currentIndex = -1;
    bool atFinalStation = false;
};

struct RouteView {
    TrainSummary train;
    std::vector<StationView> stations;
};

struct TrainQuery {
    std::string text;                  // substring of number or name (case-insensitive)
    std::optional<TrainStatus> status; // exact status filter
    enum class SortField { Number, Name } sortBy = SortField::Number;
    bool descending = false;
};

struct TrainUpdate {
    std::optional<std::string> number;
    std::optional<std::string> name;
    std::optional<Operational> operational;
};

struct DashboardStats {
    int totalTrains = 0;
    int activeTrains = 0;       // scheduled + running
    int atFinalStation = 0;     // trains sitting on the last node of their route
    int totalStations = 0;      // sum of linked-list lengths across all trains
    std::map<std::string, int> byStatus;
    int eventCount = 0;
};

struct Event {
    long long id = 0;
    std::string type;  // train_created, station_added, train_moved, ...
    std::string trainNumber;
    std::string message;
    std::string timestamp;  // ISO-8601 UTC
};

struct ScheduleEntry {
    std::string trainNumber;
    std::string trainName;
    std::string station;
    int stationIndex = 0;
    int arrival = 0;
    int departure = 0;
    StationState state = StationState::Upcoming;
    TrainStatus trainStatus = TrainStatus::Draft;
};

// Two different trains occupying the same station at overlapping times.
struct ScheduleConflict {
    std::string station;
    ScheduleEntry a;
    ScheduleEntry b;
    int overlapMinutes = 0;
};

struct ScheduleReport {
    std::vector<ScheduleEntry> entries;  // sorted by arrival time
    std::vector<ScheduleConflict> conflicts;
};

struct SeedReport {
    int created = 0;
    int skipped = 0;
};

class TrainManager {
public:
    static constexpr std::size_t kMaxEvents = 200;

    TrainManager() = default;
    TrainManager(const TrainManager&) = delete;
    TrainManager& operator=(const TrainManager&) = delete;

    // ----- trains ---------------------------------------------------------
    Result<TrainSummary> createTrain(const std::string& number, const std::string& name);
    std::vector<TrainSummary> listTrains(const TrainQuery& query = {}) const;
    Result<TrainSummary> getTrain(const std::string& number) const;
    Result<TrainSummary> updateTrain(const std::string& number, const TrainUpdate& update);
    Status deleteTrain(const std::string& number);

    // ----- routes ---------------------------------------------------------
    Result<RouteView> getRoute(const std::string& number) const;
    Result<RouteView> addStation(const std::string& number, const std::string& stationName,
                                 int arrival, int departure);
    Result<StationView> getStation(const std::string& number, int index) const;
    Result<RouteView> updateStation(const std::string& number, int index,
                                    const std::string& stationName, int arrival, int departure);
    Result<RouteView> removeStation(const std::string& number, int index);

    // ----- movement -------------------------------------------------------
    Result<RouteView> moveTrain(const std::string& number);
    Result<RouteView> resetTrain(const std::string& number);

    // ----- reporting ------------------------------------------------------
    DashboardStats stats() const;
    std::vector<Event> recentEvents(std::size_t limit) const;  // newest first
    ScheduleReport schedule() const;

    // Loads a few clearly-labelled sample trains (skips numbers that exist).
    SeedReport seedSampleData();

    // Validation helpers (also used by tests).
    static Status validateTrainNumber(const std::string& number);
    static Status validateTrainName(const std::string& name);

private:
    // The *Locked helpers assume mutex_ is already held by the caller.
    Train* findLocked(const std::string& number) const;
    static TrainSummary summarize(const Train& train);
    static RouteView makeRouteView(const Train& train);
    void recordLocked(const std::string& type, const std::string& trainNumber,
                      const std::string& message);

    mutable std::mutex mutex_;
    std::vector<std::unique_ptr<Train>> trains_;  // insertion order
    std::deque<Event> events_;
    long long nextEventId_ = 1;
};

}  // namespace railflow
