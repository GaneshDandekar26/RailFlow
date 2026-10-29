#pragma once
// Time handling for RailFlow.
//
// Representation: every time of day is stored as an int = minutes after
// midnight (00:00 -> 0, 08:15 -> 495, 23:59 -> 1439). The API accepts and
// returns "HH:MM" strings in 24-hour format.
//
// Limitation (documented, by design): all times belong to a single calendar
// day. A journey that crosses midnight (e.g. 23:30 -> 00:20) is rejected,
// because the "arrival is not earlier than the previous departure" rule
// cannot hold across the day boundary.

#include <string>

namespace railflow {
namespace timeutil {

constexpr int kMinutesPerDay = 24 * 60;

// True when 0 <= minutes < 1440.
bool isValidMinutes(int minutes);

// Strict parser for "HH:MM" (exactly two digits, a colon, two digits).
// Hours must be 00-23 and minutes 00-59. Returns false on any violation and
// leaves `minutesOut` untouched.
bool parseHHMM(const std::string& text, int& minutesOut);

// Formats minutes-after-midnight as "HH:MM". Out-of-range input yields "--:--".
std::string formatHHMM(int minutes);

}  // namespace timeutil
}  // namespace railflow
