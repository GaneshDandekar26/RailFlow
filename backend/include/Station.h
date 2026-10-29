#pragma once
// A single node of a train's route: one station stop.
//
// A route is a SINGLY LINKED LIST of these nodes:
//
//   head -> [Mumbai] -> [Thane] -> [Kalyan] -> [Pune] -> nullptr
//
// Nodes are allocated with `new` by Train and released by Train's destructor;
// Station itself never deletes `next`, so ownership stays in exactly one place.

#include <string>
#include <utility>

namespace railflow {

struct Station {
    std::string name;
    int arrivalTime;    // minutes after midnight
    int departureTime;  // minutes after midnight
    Station* next;      // next stop on the route, or nullptr at the final station

    Station(std::string n, int arrival, int departure)
        : name(std::move(n)), arrivalTime(arrival), departureTime(departure), next(nullptr) {}

    // A copied node would share `next` with the original and lead to double
    // deletion, so nodes are neither copyable nor movable.
    Station(const Station&) = delete;
    Station& operator=(const Station&) = delete;
};

}  // namespace railflow
