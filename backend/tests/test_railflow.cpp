// Self-contained unit tests (no framework needed). Run: ./railflow_tests
// Build with -DRAILFLOW_SANITIZE=ON to also check for leaks / invalid memory use.

#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "TimeUtils.h"
#include "Train.h"
#include "TrainManager.h"

using namespace railflow;

static int g_checks = 0;
static int g_failures = 0;

#define CHECK(cond)                                                                   \
    do {                                                                              \
        ++g_checks;                                                                   \
        if (!(cond)) {                                                                \
            ++g_failures;                                                             \
            std::cerr << "  FAIL " << __FILE__ << ":" << __LINE__ << "  " #cond "\n"; \
        }                                                                             \
    } while (0)

#define RUN(fn)                                  \
    do {                                         \
        std::cout << "- " #fn "\n";              \
        fn();                                    \
    } while (0)

static int T(const char* hhmm) {
    int m = -1;
    timeutil::parseHHMM(hhmm, m);
    return m;
}

static void expectInvariants(const Train& t) {
    std::string why;
    const bool ok = t.checkInvariants(&why);
    if (!ok) std::cerr << "  invariant broken: " << why << "\n";
    CHECK(ok);
}

static Train makeRoute() {
    Train t("12345", "Test Express");
    CHECK(t.addStation("Mumbai", T("08:00"), T("08:15")).ok());
    CHECK(t.addStation("Thane", T("09:00"), T("09:10")).ok());
    CHECK(t.addStation("Kalyan", T("09:50"), T("10:00")).ok());
    CHECK(t.addStation("Pune", T("12:30"), T("12:45")).ok());
    return t;  // exercises the move constructor
}

// ---------------------------------------------------------------- time utils
static void test_time_parsing() {
    int m = -1;
    CHECK(timeutil::parseHHMM("00:00", m) && m == 0);
    CHECK(timeutil::parseHHMM("08:15", m) && m == 495);
    CHECK(timeutil::parseHHMM("23:59", m) && m == 1439);
    m = -1;
    for (const char* bad : {"24:00", "12:60", "8:15", "08:5", "0815", "08-15", "ab:cd", "", "08:15:00",
                            " 8:15", "-1:00", "99:99"}) {
        CHECK(!timeutil::parseHHMM(bad, m));
    }
    CHECK(m == -1);  // untouched on failure
    CHECK(timeutil::formatHHMM(495) == "08:15");
    CHECK(timeutil::formatHHMM(0) == "00:00");
    CHECK(timeutil::formatHHMM(1439) == "23:59");
    CHECK(timeutil::formatHHMM(-1) == "--:--");
    CHECK(timeutil::formatHHMM(1440) == "--:--");
}

// ---------------------------------------------------------- linked list core
static void test_append_builds_list() {
    Train t = makeRoute();
    CHECK(t.stationCount() == 4);
    CHECK(t.firstStation()->name == "Mumbai");
    CHECK(t.lastStation()->name == "Pune");
    CHECK(t.currentStation() == t.firstStation());  // starts at origin
    CHECK(t.currentIndex() == 0);
    CHECK(t.routeString() == "[Mumbai] -> Thane -> Kalyan -> Pune");
    // traversal order matches insertion order
    const auto view = t.routeView();
    CHECK(view.size() == 4 && view[2].name == "Kalyan");
    expectInvariants(t);
}

static void test_empty_train() {
    Train t("100", "Empty");
    CHECK(t.stationCount() == 0);
    CHECK(t.currentStation() == nullptr);
    CHECK(t.currentIndex() == -1);
    CHECK(t.status() == TrainStatus::Draft);
    CHECK(!t.moveToNext().ok());
    CHECK(!t.removeStation(0).ok());
    CHECK(t.routeString() == "(no stations)");
    expectInvariants(t);
}

static void test_move_advances_pointer() {
    Train t = makeRoute();
    CHECK(t.status() == TrainStatus::Scheduled);
    CHECK(t.moveToNext().ok());
    CHECK(t.currentStation()->name == "Thane");
    CHECK(t.currentIndex() == 1);
    CHECK(t.status() == TrainStatus::Running);
    CHECK(t.nextStation()->name == "Kalyan");
    CHECK(t.moveToNext().ok());
    CHECK(t.moveToNext().ok());
    CHECK(t.currentStation()->name == "Pune");
    CHECK(t.isAtFinalStation());
    CHECK(t.status() == TrainStatus::Completed);
    CHECK(t.nextStation() == nullptr);
    const Status past = t.moveToNext();
    CHECK(!past.ok() && past.code == ErrorCode::Conflict);
    CHECK(t.currentStation()->name == "Pune");  // unchanged after failed move
    expectInvariants(t);
}

static void test_route_view_states() {
    Train t = makeRoute();
    t.moveToNext();
    t.moveToNext();  // at Kalyan
    const auto v = t.routeView();
    CHECK(v[0].state == StationState::Visited && v[0].isOrigin);
    CHECK(v[1].state == StationState::Visited);
    CHECK(v[2].state == StationState::Current);
    CHECK(v[3].state == StationState::Upcoming && v[3].isFinal);
    // travel time = arrival minus the previous stop's departure
    CHECK(v[0].travelFromPrevious == -1);   // origin
    CHECK(v[1].travelFromPrevious == 45);   // 09:00 - 08:15
    CHECK(v[2].travelFromPrevious == 40);   // 09:50 - 09:10
    CHECK(v[3].travelFromPrevious == 150);  // 12:30 - 10:00
}

static void test_reset_to_origin() {
    Train t = makeRoute();
    t.moveToNext();
    t.moveToNext();
    t.resetToOrigin();
    CHECK(t.currentStation() == t.firstStation());
    CHECK(t.currentIndex() == 0);
    expectInvariants(t);
}

static void test_single_station_is_draft() {
    Train t("101", "One");
    t.addStation("Solo", T("10:00"), T("10:05"));
    CHECK(t.status() == TrainStatus::Draft);
    CHECK(!t.isAtFinalStation());
    CHECK(!t.moveToNext().ok());
}

static void test_find_station() {
    Train t = makeRoute();
    CHECK(t.findStation("thane") != nullptr);
    CHECK(t.findStation("  KALYAN ") != nullptr);
    CHECK(t.findStation("Nowhere") == nullptr);
    CHECK(t.stationAt(3)->name == "Pune");
    CHECK(t.stationAt(4) == nullptr && t.stationAt(-1) == nullptr);
}

// ------------------------------------------------------------- validation
static void test_add_station_validation() {
    Train t("200", "Validation");
    Status s = t.addStation("   ", T("08:00"), T("08:10"));
    CHECK(!s.ok() && s.field == "name");
    s = t.addStation(std::string(61, 'x'), T("08:00"), T("08:10"));
    CHECK(!s.ok() && s.field == "name");
    s = t.addStation("A", T("08:10"), T("08:00"));  // departs before arriving
    CHECK(!s.ok() && s.field == "departure");
    s = t.addStation("A", 1440, 1440);
    CHECK(!s.ok());
    CHECK(t.stationCount() == 0);  // nothing was added by failed calls

    CHECK(t.addStation("  A  ", T("08:00"), T("08:10")).ok());  // trimmed
    CHECK(t.firstStation()->name == "A");
    s = t.addStation("B", T("08:05"), T("08:20"));  // arrives before previous departure
    CHECK(!s.ok() && s.field == "arrival" && s.code == ErrorCode::Validation);
    s = t.addStation("a", T("09:00"), T("09:10"));  // duplicate, case-insensitive
    CHECK(!s.ok() && s.code == ErrorCode::Conflict && s.field == "name");
    CHECK(t.addStation("B", T("08:10"), T("08:10")).ok());  // equal times are allowed
    CHECK(t.stationCount() == 2);
    expectInvariants(t);
}

static void test_midnight_crossing_rejected() {
    Train t("201", "Night");
    CHECK(t.addStation("Late", T("23:30"), T("23:55")).ok());
    const Status s = t.addStation("After", T("00:20"), T("00:30"));
    CHECK(!s.ok() && s.field == "arrival");
    CHECK(s.message.find("midnight") != std::string::npos);
}

// ------------------------------------------------------------ edit / remove
static void test_update_station() {
    Train t = makeRoute();
    CHECK(t.updateStation(1, "Thane West", T("09:05"), T("09:12")).ok());
    CHECK(t.stationAt(1)->name == "Thane West");
    // would arrive before Mumbai departs (08:15)
    CHECK(!t.updateStation(1, "Thane", T("08:00"), T("09:00")).ok());
    // would depart after Kalyan arrives (09:50)
    CHECK(!t.updateStation(1, "Thane", T("09:00"), T("09:55")).ok());
    // duplicate of another station
    CHECK(t.updateStation(1, "kalyan", T("09:00"), T("09:10")).code == ErrorCode::Conflict);
    // renaming a station to its own name (different case) is fine
    CHECK(t.updateStation(1, "THANE WEST", T("09:00"), T("09:10")).ok());
    CHECK(!t.updateStation(9, "X", T("10:00"), T("10:00")).ok());
    expectInvariants(t);
}

static void test_remove_middle_before_current_shifts_position() {
    Train t = makeRoute();
    t.moveToNext();
    t.moveToNext();  // at Kalyan, index 2
    CHECK(t.removeStation(1).ok());  // remove Thane (before current)
    CHECK(t.stationCount() == 3);
    CHECK(t.currentStation()->name == "Kalyan");
    CHECK(t.currentIndex() == 1);  // shifted left by one
    expectInvariants(t);
}

static void test_remove_after_current_keeps_position() {
    Train t = makeRoute();
    t.moveToNext();  // at Thane
    CHECK(t.removeStation(2).ok());  // remove Kalyan (after current)
    CHECK(t.currentStation()->name == "Thane" && t.currentIndex() == 1);
    CHECK(t.nextStation()->name == "Pune");
    expectInvariants(t);
}

static void test_remove_tail_updates_tail() {
    Train t = makeRoute();
    CHECK(t.removeStation(3).ok());  // remove Pune
    CHECK(t.lastStation()->name == "Kalyan");
    CHECK(t.addStation("Lonavala", T("11:00"), T("11:05")).ok());  // append after new tail
    CHECK(t.lastStation()->name == "Lonavala");
    CHECK(t.routeString() == "[Mumbai] -> Thane -> Kalyan -> Lonavala");
    expectInvariants(t);
}

static void test_remove_head_when_train_moved_on() {
    Train t = makeRoute();
    t.moveToNext();                  // at Thane
    CHECK(t.removeStation(0).ok());  // remove old head (Mumbai)
    CHECK(t.firstStation()->name == "Thane");
    CHECK(t.currentStation() == t.firstStation() && t.currentIndex() == 0);
    expectInvariants(t);
}

static void test_cannot_remove_current_station() {
    Train t = makeRoute();
    t.moveToNext();  // at Thane
    const Status s = t.removeStation(1);
    CHECK(!s.ok() && s.code == ErrorCode::Conflict);
    CHECK(t.stationCount() == 4 && t.currentStation()->name == "Thane");
    CHECK(t.removeStation(0).ok());  // origin is not current any more -> allowed
    expectInvariants(t);
}

static void test_remove_until_empty_and_rebuild() {
    Train t("300", "Shrink");
    t.addStation("A", T("08:00"), T("08:05"));
    t.addStation("B", T("09:00"), T("09:05"));
    t.moveToNext();                   // at B
    CHECK(t.removeStation(0).ok());   // remove A
    CHECK(!t.removeStation(0).ok());  // B is current: blocked
    CHECK(t.stationCount() == 1);
    expectInvariants(t);
}

// ------------------------------------------------------ ownership / moving
static void test_move_semantics_transfer_ownership() {
    Train a = makeRoute();
    a.moveToNext();
    Train b(std::move(a));
    CHECK(b.stationCount() == 4 && b.currentStation()->name == "Thane");
    CHECK(a.stationCount() == 0 && a.currentStation() == nullptr && a.firstStation() == nullptr);
    expectInvariants(a);
    expectInvariants(b);

    Train c("999", "Other");
    c.addStation("Solo", T("01:00"), T("01:05"));
    c = std::move(b);  // must free c's old list, then take b's
    CHECK(c.stationCount() == 4 && c.currentStation()->name == "Thane");
    CHECK(b.stationCount() == 0);
    expectInvariants(b);
    expectInvariants(c);

    Train& self = c;
    c = std::move(self);  // self-move must be harmless
    CHECK(c.stationCount() == 4);
}

static void test_copy_is_disabled() {
    static_assert(!std::is_copy_constructible<Train>::value, "Train must not be copyable");
    static_assert(!std::is_copy_assignable<Train>::value, "Train must not be copy-assignable");
    static_assert(!std::is_copy_constructible<Station>::value, "Station must not be copyable");
    CHECK(true);
}

// ----------------------------------------------------------------- manager
static void test_manager_create_and_unique_numbers() {
    TrainManager m;
    auto r = m.createTrain("12345", "Alpha");
    CHECK(r.ok() && r.value.number == "12345");
    auto dup = m.createTrain("12345", "Beta");
    CHECK(!dup.ok() && dup.code == ErrorCode::Conflict && dup.field == "number");
    CHECK(!m.createTrain("12", "Short").ok());      // too short
    CHECK(!m.createTrain("12a45", "Letters").ok());  // not digits
    CHECK(!m.createTrain("1234567", "Long").ok());
    CHECK(!m.createTrain("55555", "  ").ok());       // empty name
    CHECK(m.createTrain(" 22222 ", " Trimmed ").ok());
    CHECK(m.getTrain("22222").value.name == "Trimmed");
    CHECK(m.listTrains().size() == 2);
}

static void test_manager_not_found_errors() {
    TrainManager m;
    CHECK(m.getTrain("1").code == ErrorCode::NotFound);
    CHECK(m.getRoute("99999").code == ErrorCode::NotFound);
    CHECK(m.addStation("99999", "X", 0, 0).code == ErrorCode::NotFound);
    CHECK(m.moveTrain("99999").code == ErrorCode::NotFound);
    CHECK(m.deleteTrain("99999").code == ErrorCode::NotFound);
    CHECK(m.updateTrain("99999", TrainUpdate{}).code == ErrorCode::NotFound);
    m.createTrain("12345", "A");
    CHECK(m.getStation("12345", 0).code == ErrorCode::NotFound);
}

static void test_manager_flow_and_events() {
    TrainManager m;
    m.createTrain("12345", "Alpha");
    CHECK(m.addStation("12345", "A", T("08:00"), T("08:10")).ok());
    CHECK(m.addStation("12345", "B", T("09:00"), T("09:10")).ok());
    auto moved = m.moveTrain("12345");
    CHECK(moved.ok() && moved.value.train.currentStation == "B");
    CHECK(moved.value.train.atFinalStation);
    CHECK(moved.value.stations[1].state == StationState::Current);
    CHECK(!m.moveTrain("12345").ok());  // already final

    const auto ev = m.recentEvents(10);
    // newest first: reached_final, moved, station_added x2, created
    CHECK(ev.size() == 5);
    CHECK(ev[0].type == "train_reached_final");
    CHECK(ev[1].type == "train_moved");
    CHECK(ev[4].type == "train_created");
    CHECK(ev[0].id > ev[1].id);
    CHECK(m.recentEvents(2).size() == 2);
}

static void test_manager_update_train() {
    TrainManager m;
    m.createTrain("11111", "One");
    m.createTrain("22222", "Two");
    TrainUpdate u;
    u.number = "22222";
    CHECK(m.updateTrain("11111", u).code == ErrorCode::Conflict);  // duplicate number
    u = {};
    u.number = "33333";
    u.name = "Renamed";
    auto r = m.updateTrain("11111", u);
    CHECK(r.ok() && r.value.number == "33333" && r.value.name == "Renamed");
    CHECK(m.getTrain("11111").code == ErrorCode::NotFound);
    CHECK(m.getTrain("33333").ok());
    u = {};
    u.name = "x";  // invalid: too short; must not change anything
    CHECK(!m.updateTrain("33333", u).ok());
    CHECK(m.getTrain("33333").value.name == "Renamed");
}

static void test_manager_operational_override() {
    TrainManager m;
    m.createTrain("12345", "Alpha");
    m.addStation("12345", "A", T("08:00"), T("08:10"));
    m.addStation("12345", "B", T("09:00"), T("09:10"));
    TrainUpdate u;
    u.operational = Operational::Stopped;
    CHECK(m.updateTrain("12345", u).value.status == TrainStatus::Stopped);
    CHECK(m.moveTrain("12345").code == ErrorCode::Conflict);  // cannot move while stopped
    u.operational = Operational::Normal;
    CHECK(m.updateTrain("12345", u).value.status == TrainStatus::Scheduled);
    CHECK(m.moveTrain("12345").ok());
}

static void test_manager_delete_frees_train() {
    TrainManager m;
    m.createTrain("12345", "Alpha");
    m.addStation("12345", "A", T("08:00"), T("08:10"));
    m.addStation("12345", "B", T("09:00"), T("09:10"));
    CHECK(m.deleteTrain("12345").ok());
    CHECK(m.listTrains().empty());
    CHECK(m.stats().totalStations == 0);
    CHECK(m.createTrain("12345", "Again").ok());  // number is free again
}

static void test_manager_remove_station_flow() {
    TrainManager m;
    m.createTrain("12345", "Alpha");
    m.addStation("12345", "A", T("08:00"), T("08:10"));
    m.addStation("12345", "B", T("09:00"), T("09:10"));
    m.addStation("12345", "C", T("10:00"), T("10:10"));
    CHECK(m.removeStation("12345", 0).code == ErrorCode::Conflict);  // current station
    auto r = m.removeStation("12345", 1);
    CHECK(r.ok() && r.value.stations.size() == 2 && r.value.stations[1].name == "C");
    CHECK(m.removeStation("12345", 7).code == ErrorCode::NotFound);
}

static void test_manager_search_filter_sort() {
    TrainManager m;
    m.createTrain("200", "Zeta Express");
    m.createTrain("1000", "alpha Mail");
    m.createTrain("30", "Mid Local");  // invalid (too short) -> not created
    m.createTrain("300", "Mid Local");

    TrainQuery q;
    auto all = m.listTrains(q);
    CHECK(all.size() == 3);
    CHECK(all[0].number == "200" && all[1].number == "300" && all[2].number == "1000");  // numeric order
    q.descending = true;
    CHECK(m.listTrains(q)[0].number == "1000");
    q = {};
    q.sortBy = TrainQuery::SortField::Name;
    CHECK(m.listTrains(q)[0].name == "alpha Mail");  // case-insensitive
    q = {};
    q.text = "EXPRESS";
    CHECK(m.listTrains(q).size() == 1);
    q.text = "00";  // matches numbers 200, 300, 1000
    CHECK(m.listTrains(q).size() == 3);
    q = {};
    q.status = TrainStatus::Running;
    CHECK(m.listTrains(q).empty());
    q.status = TrainStatus::Draft;
    CHECK(m.listTrains(q).size() == 3);
}

static void test_manager_stats() {
    TrainManager m;
    CHECK(m.stats().totalTrains == 0);
    m.seedSampleData();
    const auto s = m.stats();
    CHECK(s.totalTrains == 3);
    CHECK(s.totalStations == 5 + 5 + 6);
    CHECK(s.activeTrains == 3);
    CHECK(s.atFinalStation == 0);
    CHECK(s.byStatus.at("scheduled") == 1 && s.byStatus.at("running") == 2);
    CHECK(m.seedSampleData().created == 0);  // idempotent
    CHECK(m.seedSampleData().skipped == 3);
}

static void test_manager_schedule_conflicts() {
    TrainManager m;
    m.createTrain("111", "One");
    m.createTrain("222", "Two");
    m.createTrain("333", "Three");
    m.addStation("111", "Hub", T("09:00"), T("09:10"));
    m.addStation("222", "hub", T("09:05"), T("09:15"));  // overlaps train 111 at Hub
    m.addStation("333", "Hub", T("09:10"), T("09:20"));  // touches (09:10) but no overlap with 111
    auto rep = m.schedule();
    CHECK(rep.entries.size() == 3);
    CHECK(rep.entries[0].trainNumber == "111");  // sorted by arrival
    // 111/222 overlap, 222/333 overlap; 111/333 only touch at 09:10 -> not a conflict
    CHECK(rep.conflicts.size() == 2);

    TrainUpdate u;
    u.operational = Operational::Cancelled;
    m.updateTrain("222", u);
    CHECK(m.schedule().conflicts.empty());  // cancelled trains free the platform
}

static void test_manager_concurrent_access() {
    TrainManager m;
    m.createTrain("12345", "Alpha");
    m.addStation("12345", "A", T("00:00"), T("00:00"));
    std::vector<std::thread> workers;
    for (int w = 0; w < 4; ++w) {
        workers.emplace_back([&m, w] {
            for (int i = 0; i < 200; ++i) {
                m.listTrains();
                m.stats();
                m.getRoute("12345");
                m.createTrain(std::to_string(1000 + w * 1000 + i), "Concurrent");
            }
        });
    }
    for (auto& t : workers) t.join();
    CHECK(m.stats().totalTrains == 1 + 4 * 200);
}

int main() {
    std::cout << "RailFlow unit tests\n";
    RUN(test_time_parsing);
    RUN(test_append_builds_list);
    RUN(test_empty_train);
    RUN(test_move_advances_pointer);
    RUN(test_route_view_states);
    RUN(test_reset_to_origin);
    RUN(test_single_station_is_draft);
    RUN(test_find_station);
    RUN(test_add_station_validation);
    RUN(test_midnight_crossing_rejected);
    RUN(test_update_station);
    RUN(test_remove_middle_before_current_shifts_position);
    RUN(test_remove_after_current_keeps_position);
    RUN(test_remove_tail_updates_tail);
    RUN(test_remove_head_when_train_moved_on);
    RUN(test_cannot_remove_current_station);
    RUN(test_remove_until_empty_and_rebuild);
    RUN(test_move_semantics_transfer_ownership);
    RUN(test_copy_is_disabled);
    RUN(test_manager_create_and_unique_numbers);
    RUN(test_manager_not_found_errors);
    RUN(test_manager_flow_and_events);
    RUN(test_manager_update_train);
    RUN(test_manager_operational_override);
    RUN(test_manager_delete_frees_train);
    RUN(test_manager_remove_station_flow);
    RUN(test_manager_search_filter_sort);
    RUN(test_manager_stats);
    RUN(test_manager_schedule_conflicts);
    RUN(test_manager_concurrent_access);

    std::cout << "\n" << g_checks << " checks, " << g_failures << " failed\n";
    return g_failures == 0 ? 0 : 1;
}
