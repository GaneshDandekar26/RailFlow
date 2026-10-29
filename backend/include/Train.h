#pragma once
// Train: owns a singly linked list of Station nodes (its route) and a pointer
// to the node where the train currently is.
//
//   head_ ---> [A] ---> [B] ---> [C] ---> [D] ---> nullptr
//                        ^                 ^
//                    current_            tail_
//
// Invariants (verified by checkInvariants(), which the unit tests call):
//   1. head_/tail_/current_ are all nullptr  <=> the route is empty.
//   2. tail_ is the last node reachable from head_ (tail_->next == nullptr).
//   3. current_ points at a node that is part of the list, at index position_.
//   4. size_ equals the number of nodes reachable from head_.
//   5. Along the route, arrival <= departure at each stop and each stop's
//      arrival is not earlier than the previous stop's departure.
//   6. Station names are unique (case-insensitive) within one route.

#include <iosfwd>
#include <string>
#include <vector>

#include "Result.h"
#include "Station.h"

namespace railflow {

// Manual override applied by an operator on top of the route-derived status.
enum class Operational { Normal, Stopped, Cancelled };

enum class TrainStatus { Draft, Scheduled, Running, Completed, Stopped, Cancelled };

enum class StationState { Visited, Current, Upcoming };

const char* toString(Operational o);
const char* toString(TrainStatus s);
const char* toString(StationState s);
bool parseOperational(const std::string& text, Operational& out);
bool parseTrainStatus(const std::string& text, TrainStatus& out);

// Read-only snapshot of one stop, produced by traversing the list.
struct StationView {
    int index = 0;
    std::string name;
    int arrival = 0;    // minutes after midnight
    int departure = 0;  // minutes after midnight
    StationState state = StationState::Upcoming;
    bool isOrigin = false;
    bool isFinal = false;
    // Minutes between the previous stop's departure and this stop's arrival;
    // -1 for the origin, which has no previous stop.
    int travelFromPrevious = -1;
};

class Train {
public:
    static constexpr std::size_t kMaxNameLength = 60;

    Train(std::string number, std::string name);
    ~Train();  // frees every Station node

    // The list is owned through raw pointers, so a compiler-generated copy
    // would alias the nodes and double-delete them. Copying is disabled;
    // moving transfers ownership and leaves the source empty.
    Train(const Train&) = delete;
    Train& operator=(const Train&) = delete;
    Train(Train&& other) noexcept;
    Train& operator=(Train&& other) noexcept;

    // ----- identity / metadata -------------------------------------------
    const std::string& number() const { return number_; }
    const std::string& name() const { return name_; }
    void setNumber(std::string number) { number_ = std::move(number); }
    void setName(std::string name) { name_ = std::move(name); }
    Operational operational() const { return operational_; }
    void setOperational(Operational o) { operational_ = o; }

    // ----- route building / editing --------------------------------------
    // Appends a stop at the END of the list (O(1) thanks to tail_).
    Status addStation(const std::string& name, int arrival, int departure);
    // Edits the stop at `index` (0-based) after checking it against both neighbours.
    Status updateStation(int index, const std::string& name, int arrival, int departure);
    // Unlinks and deletes the stop at `index`. The station the train is
    // currently at can never be removed, so current_ cannot dangle.
    Status removeStation(int index);

    // ----- movement -------------------------------------------------------
    // Advances current_ to current_->next.
    Status moveToNext();
    // Puts the train back at the first station.
    void resetToOrigin();

    // ----- queries (all traversals are O(n)) ------------------------------
    int stationCount() const { return size_; }
    bool hasRoute() const { return head_ != nullptr; }
    int currentIndex() const { return position_; }  // -1 when the route is empty
    const Station* currentStation() const { return current_; }
    const Station* nextStation() const { return current_ ? current_->next : nullptr; }
    const Station* firstStation() const { return head_; }
    const Station* lastStation() const { return tail_; }
    const Station* stationAt(int index) const;
    const Station* findStation(const std::string& name) const;  // case-insensitive
    // True once the train sits on the last node of a route with >= 2 stops.
    bool isAtFinalStation() const;
    TrainStatus status() const;

    // Snapshot of the whole route, in order, with visited/current/upcoming flags.
    std::vector<StationView> routeView() const;
    // Human-readable route, e.g. "Mumbai -> [Thane] -> Kalyan" (brackets mark current).
    void displayRoute(std::ostream& out) const;
    std::string routeString() const;

    // Verifies the invariants listed at the top of this file.
    bool checkInvariants(std::string* reason = nullptr) const;

private:
    void clear() noexcept;
    Status validateStationFields(const std::string& trimmedName, int arrival, int departure) const;

    std::string number_;
    std::string name_;
    Operational operational_ = Operational::Normal;

    Station* head_ = nullptr;     // first station
    Station* tail_ = nullptr;     // last station (makes append O(1))
    Station* current_ = nullptr;  // where the train is right now
    int size_ = 0;
    int position_ = -1;           // 0-based index of current_
};

}  // namespace railflow
