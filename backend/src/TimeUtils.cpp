#include "TimeUtils.h"

#include <cctype>
#include <cstdio>

namespace railflow {
namespace timeutil {

bool isValidMinutes(int minutes) { return minutes >= 0 && minutes < kMinutesPerDay; }

bool parseHHMM(const std::string& text, int& minutesOut) {
    if (text.size() != 5 || text[2] != ':') return false;
    for (int i : {0, 1, 3, 4}) {
        if (!std::isdigit(static_cast<unsigned char>(text[i]))) return false;
    }
    const int hours = (text[0] - '0') * 10 + (text[1] - '0');
    const int minutes = (text[3] - '0') * 10 + (text[4] - '0');
    if (hours > 23 || minutes > 59) return false;
    minutesOut = hours * 60 + minutes;
    return true;
}

std::string formatHHMM(int minutes) {
    if (!isValidMinutes(minutes)) return "--:--";
    char buf[16];
    std::snprintf(buf, sizeof buf, "%02d:%02d", minutes / 60, minutes % 60);
    return buf;
}

}  // namespace timeutil
}  // namespace railflow
