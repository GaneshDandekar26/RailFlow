#include "Api.h"

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <optional>
#include <set>
#include <sstream>
#include <thread>

#include "TextUtils.h"
#include "TimeUtils.h"
#include "httplib.h"
#include "json.hpp"

namespace railflow {

using json = nlohmann::json;

namespace {

// ---------------------------------------------------------------------------
// JSON serialisation
// ---------------------------------------------------------------------------

std::string statusLabel(TrainStatus s) {
    switch (s) {
        case TrainStatus::Draft: return "Draft";
        case TrainStatus::Scheduled: return "Scheduled";
        case TrainStatus::Running: return "Running";
        case TrainStatus::Completed: return "Completed";
        case TrainStatus::Stopped: return "Stopped";
        case TrainStatus::Cancelled: return "Cancelled";
    }
    return "Draft";
}

json nullableString(const std::string& s) { return s.empty() ? json(nullptr) : json(s); }

json toJson(const TrainSummary& t) {
    json progress = nullptr;
    if (t.stationCount >= 2 && t.currentIndex >= 0) {
        progress = static_cast<double>(t.currentIndex) / static_cast<double>(t.stationCount - 1);
    }
    return json{{"number", t.number},
                {"name", t.name},
                {"status", toString(t.status)},
                {"statusLabel", statusLabel(t.status)},
                {"operational", toString(t.operational)},
                {"stationCount", t.stationCount},
                {"origin", nullableString(t.origin)},
                {"destination", nullableString(t.destination)},
                {"currentStation", nullableString(t.currentStation)},
                {"nextStation", nullableString(t.nextStation)},
                {"currentIndex", t.currentIndex},
                {"atFinalStation", t.atFinalStation},
                {"progress", progress}};
}

json toJson(const StationView& v) {
    json travel = nullptr;
    if (v.travelFromPrevious >= 0) travel = v.travelFromPrevious;
    return json{{"index", v.index},
                {"name", v.name},
                {"arrival", timeutil::formatHHMM(v.arrival)},
                {"departure", timeutil::formatHHMM(v.departure)},
                {"arrivalMinutes", v.arrival},
                {"departureMinutes", v.departure},
                {"dwellMinutes", v.departure - v.arrival},
                {"travelMinutesFromPrevious", travel},
                {"state", toString(v.state)},
                {"isOrigin", v.isOrigin},
                {"isFinal", v.isFinal}};
}

json toJson(const RouteView& r) {
    json stations = json::array();
    for (const auto& station : r.stations) stations.push_back(toJson(station));
    return json{{"train", toJson(r.train)}, {"stations", stations}};
}

json toJson(const Event& e) {
    return json{{"id", e.id},
                {"type", e.type},
                {"trainNumber", nullableString(e.trainNumber)},
                {"message", e.message},
                {"timestamp", e.timestamp}};
}

json toJson(const ScheduleEntry& e) {
    return json{{"trainNumber", e.trainNumber},
                {"trainName", e.trainName},
                {"station", e.station},
                {"stationIndex", e.stationIndex},
                {"arrival", timeutil::formatHHMM(e.arrival)},
                {"departure", timeutil::formatHHMM(e.departure)},
                {"arrivalMinutes", e.arrival},
                {"departureMinutes", e.departure},
                {"state", toString(e.state)},
                {"trainStatus", toString(e.trainStatus)}};
}

json toJson(const DashboardStats& s) {
    json by = json::object();
    for (const auto& [k, v] : s.byStatus) by[k] = v;
    return json{{"totalTrains", s.totalTrains},
                {"activeTrains", s.activeTrains},
                {"atFinalStation", s.atFinalStation},
                {"totalStations", s.totalStations},
                {"byStatus", by},
                {"eventCount", s.eventCount}};
}

// ---------------------------------------------------------------------------
// Response / request helpers
// ---------------------------------------------------------------------------

const char* codeName(ErrorCode c) {
    switch (c) {
        case ErrorCode::BadRequest: return "BAD_REQUEST";
        case ErrorCode::NotFound: return "NOT_FOUND";
        case ErrorCode::Conflict: return "CONFLICT";
        case ErrorCode::Validation: return "VALIDATION_ERROR";
        case ErrorCode::None: break;
    }
    return "ERROR";
}

int httpStatusFor(ErrorCode c) {
    switch (c) {
        case ErrorCode::BadRequest: return 400;
        case ErrorCode::NotFound: return 404;
        case ErrorCode::Conflict: return 409;
        case ErrorCode::Validation: return 422;
        case ErrorCode::None: break;
    }
    return 500;
}

void sendJson(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json; charset=utf-8");
}

void sendError(httplib::Response& res, const Status& s) {
    json err = {{"code", codeName(s.code)}, {"message", s.message}};
    if (!s.field.empty()) err["field"] = s.field;
    sendJson(res, httpStatusFor(s.code), json{{"error", err}});
}

void sendError(httplib::Response& res, ErrorCode code, const std::string& message,
               const std::string& field = {}) {
    sendError(res, Status::Fail(code, message, field));
}

// Parses the request body as a JSON object; writes a 400 and returns false on failure.
bool parseJsonObject(const httplib::Request& req, httplib::Response& res, json& out) {
    out = json::parse(req.body, nullptr, /*allow_exceptions=*/false);
    if (out.is_discarded() || !out.is_object()) {
        sendError(res, ErrorCode::BadRequest, "Request body must be a valid JSON object.");
        return false;
    }
    return true;
}

// Reads a string field. Integers are accepted too (handy for train numbers via curl).
Status readString(const json& body, const char* key, const char* label, bool required,
                  std::optional<std::string>& out) {
    out.reset();
    auto it = body.find(key);
    if (it == body.end() || it->is_null()) {
        if (required) {
            return Status::Fail(ErrorCode::Validation, std::string(label) + " is required.", key);
        }
        return Status::Ok();
    }
    if (it->is_string()) {
        out = it->get<std::string>();
    } else if (it->is_number_integer()) {
        out = std::to_string(it->get<long long>());
    } else {
        return Status::Fail(ErrorCode::Validation, std::string(label) + " must be text.", key);
    }
    return Status::Ok();
}

Status readTime(const json& body, const char* key, const char* label, int& out) {
    std::optional<std::string> text;
    if (Status s = readString(body, key, label, true, text); !s) return s;
    if (!timeutil::parseHHMM(trim(*text), out)) {
        return Status::Fail(ErrorCode::Validation,
                            std::string(label) +
                                " must be a 24-hour time in HH:MM format (00:00 - 23:59).",
                            key);
    }
    return Status::Ok();
}

std::optional<int> parseIndex(const std::string& text) {
    if (!allDigits(text) || text.size() > 6) return std::nullopt;
    return std::stoi(text);
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

std::set<std::string> loadAllowedOrigins() {
    std::set<std::string> origins = {"http://localhost:5173",  "http://127.0.0.1:5173",
                                     "http://localhost:4173",  "http://127.0.0.1:4173",
                                     "http://localhost:3000",  "http://127.0.0.1:3000"};
    if (const char* env = std::getenv("RAILFLOW_CORS_ORIGINS")) {
        origins.clear();  // an explicit list replaces the defaults
        std::stringstream ss(env);
        std::string item;
        while (std::getline(ss, item, ',')) {
            item = trim(item);
            if (!item.empty()) origins.insert(item);
        }
    }
    return origins;
}

// ---------------------------------------------------------------------------
// Shutdown handling
// ---------------------------------------------------------------------------

volatile std::sig_atomic_t g_stopRequested = 0;
void onSignal(int) { g_stopRequested = 1; }

std::string readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

}  // namespace

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

int runServer(const ServerConfig& config, TrainManager& manager) {
    httplib::Server svr;
    svr.set_payload_max_length(64 * 1024);

    // ----- CORS ------------------------------------------------------------
    const std::set<std::string> allowedOrigins = loadAllowedOrigins();
    svr.set_pre_routing_handler([allowedOrigins](const httplib::Request& req,
                                                 httplib::Response& res) {
        const std::string origin = req.get_header_value("Origin");
        if (!origin.empty()) {
            if (allowedOrigins.count("*") || allowedOrigins.count(origin)) {
                res.set_header("Access-Control-Allow-Origin",
                               allowedOrigins.count("*") ? "*" : origin);
                res.set_header("Vary", "Origin");
                res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
                res.set_header("Access-Control-Allow-Headers", "Content-Type, Accept");
                res.set_header("Access-Control-Max-Age", "600");
            }
        }
        if (req.method == "OPTIONS") {
            res.status = 204;
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    // ----- Static frontend (optional) ---------------------------------------
    std::string indexHtml;
    if (!config.staticDir.empty()) {
        indexHtml = readFile(config.staticDir + "/index.html");
        if (indexHtml.empty()) {
            std::cerr << "Warning: no index.html found in " << config.staticDir << "\n";
        } else if (!svr.set_mount_point("/", config.staticDir)) {
            std::cerr << "Warning: could not mount static directory " << config.staticDir << "\n";
        }
    }

    // ----- Error handling ---------------------------------------------------
    svr.set_error_handler([indexHtml](const httplib::Request& req, httplib::Response& res) {
        const bool isApi = req.path.rfind("/api", 0) == 0;
        // Single-page-app fallback: unknown non-API GET paths get index.html.
        if (!isApi && res.status == 404 && req.method == "GET" && !indexHtml.empty()) {
            res.status = 200;
            res.set_content(indexHtml, "text/html; charset=utf-8");
            return;
        }
        if (res.body.empty()) {
            std::string msg = res.status == 404 ? "Endpoint not found."
                              : res.status == 405 ? "Method not allowed."
                                                  : "Request failed.";
            ErrorCode code = res.status == 404 ? ErrorCode::NotFound : ErrorCode::BadRequest;
            json err = {{"code", codeName(code)}, {"message", msg}};
            res.set_content(json{{"error", err}}.dump(), "application/json; charset=utf-8");
        }
    });
    svr.set_exception_handler(
        [](const httplib::Request&, httplib::Response& res, std::exception_ptr ep) {
            std::string what = "Unexpected server error.";
            try {
                if (ep) std::rethrow_exception(ep);
            } catch (const std::exception& e) {
                std::cerr << "Unhandled exception: " << e.what() << "\n";
            } catch (...) {
            }
            json err = {{"code", "INTERNAL_ERROR"}, {"message", what}};
            sendJson(res, 500, json{{"error", err}});
        });
    svr.set_logger([](const httplib::Request& req, const httplib::Response& res) {
        std::cerr << req.method << " " << req.path << " -> " << res.status << "\n";
    });

    // =======================================================================
    // Routes
    // =======================================================================
    const std::string kNum = R"(([0-9A-Za-z_-]+))";  // train number path segment
    const std::string kIdx = R"(([0-9]+))";           // station index path segment

    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        sendJson(res, 200, json{{"status", "ok"}, {"service", "railflow"}});
    });

    svr.Get("/api/stats", [&](const httplib::Request&, httplib::Response& res) {
        sendJson(res, 200, toJson(manager.stats()));
    });

    svr.Get("/api/events", [&](const httplib::Request& req, httplib::Response& res) {
        std::size_t limit = 20;
        if (req.has_param("limit")) {
            auto n = parseIndex(req.get_param_value("limit"));
            if (!n || *n < 1 || *n > 200) {
                return sendError(res, ErrorCode::BadRequest, "limit must be between 1 and 200.");
            }
            limit = static_cast<std::size_t>(*n);
        }
        json arr = json::array();
        for (const auto& e : manager.recentEvents(limit)) arr.push_back(toJson(e));
        sendJson(res, 200, json{{"events", arr}});
    });

    svr.Get("/api/schedule", [&](const httplib::Request&, httplib::Response& res) {
        const ScheduleReport report = manager.schedule();
        json entries = json::array();
        for (const auto& e : report.entries) entries.push_back(toJson(e));
        json conflicts = json::array();
        for (const auto& c : report.conflicts) {
            conflicts.push_back(json{{"station", c.station},
                                     {"a", toJson(c.a)},
                                     {"b", toJson(c.b)},
                                     {"overlapMinutes", c.overlapMinutes}});
        }
        sendJson(res, 200, json{{"entries", entries}, {"conflicts", conflicts}});
    });

    svr.Post("/api/seed", [&](const httplib::Request&, httplib::Response& res) {
        const SeedReport r = manager.seedSampleData();
        sendJson(res, 200, json{{"created", r.created}, {"skipped", r.skipped}});
    });

    // ----- trains -----------------------------------------------------------
    svr.Get("/api/trains", [&](const httplib::Request& req, httplib::Response& res) {
        TrainQuery q;
        q.text = req.get_param_value("q");
        if (req.has_param("status") && !req.get_param_value("status").empty() &&
            req.get_param_value("status") != "all") {
            TrainStatus st;
            if (!parseTrainStatus(req.get_param_value("status"), st)) {
                return sendError(res, ErrorCode::BadRequest,
                                 "status must be one of draft, scheduled, running, completed, "
                                 "stopped, cancelled.");
            }
            q.status = st;
        }
        if (req.has_param("sort")) {
            const std::string sort = toLower(req.get_param_value("sort"));
            if (sort == "name") q.sortBy = TrainQuery::SortField::Name;
            else if (sort == "number" || sort.empty()) q.sortBy = TrainQuery::SortField::Number;
            else return sendError(res, ErrorCode::BadRequest, "sort must be 'number' or 'name'.");
        }
        if (req.has_param("order")) {
            const std::string order = toLower(req.get_param_value("order"));
            if (order == "desc") q.descending = true;
            else if (order != "asc" && !order.empty()) {
                return sendError(res, ErrorCode::BadRequest, "order must be 'asc' or 'desc'.");
            }
        }
        json arr = json::array();
        for (const auto& t : manager.listTrains(q)) arr.push_back(toJson(t));
        sendJson(res, 200, json{{"trains", arr}, {"count", arr.size()}});
    });

    svr.Post("/api/trains", [&](const httplib::Request& req, httplib::Response& res) {
        json body;
        if (!parseJsonObject(req, res, body)) return;
        std::optional<std::string> number, name;
        if (Status s = readString(body, "number", "Train number", true, number); !s)
            return sendError(res, s);
        if (Status s = readString(body, "name", "Train name", true, name); !s)
            return sendError(res, s);
        auto result = manager.createTrain(*number, *name);
        if (!result) return sendError(res, result);
        sendJson(res, 201, json{{"train", toJson(result.value)}});
    });

    svr.Get("/api/trains/" + kNum, [&](const httplib::Request& req, httplib::Response& res) {
        auto result = manager.getTrain(req.matches[1]);
        if (!result) return sendError(res, result);
        sendJson(res, 200, json{{"train", toJson(result.value)}});
    });

    svr.Patch("/api/trains/" + kNum, [&](const httplib::Request& req, httplib::Response& res) {
        json body;
        if (!parseJsonObject(req, res, body)) return;
        TrainUpdate update;
        std::optional<std::string> text;
        if (Status s = readString(body, "number", "Train number", false, text); !s)
            return sendError(res, s);
        update.number = text;
        if (Status s = readString(body, "name", "Train name", false, text); !s)
            return sendError(res, s);
        update.name = text;
        if (Status s = readString(body, "operational", "Operational status", false, text); !s)
            return sendError(res, s);
        if (text) {
            Operational op;
            if (!parseOperational(*text, op)) {
                return sendError(res, ErrorCode::Validation,
                                 "Operational status must be normal, stopped or cancelled.",
                                 "operational");
            }
            update.operational = op;
        }
        if (!update.number && !update.name && !update.operational) {
            return sendError(res, ErrorCode::BadRequest,
                             "Provide at least one of: number, name, operational.");
        }
        auto result = manager.updateTrain(req.matches[1], update);
        if (!result) return sendError(res, result);
        sendJson(res, 200, json{{"train", toJson(result.value)}});
    });

    svr.Delete("/api/trains/" + kNum, [&](const httplib::Request& req, httplib::Response& res) {
        Status s = manager.deleteTrain(req.matches[1]);
        if (!s) return sendError(res, s);
        sendJson(res, 200, json{{"deleted", true}});
    });

    // ----- routes -----------------------------------------------------------
    svr.Get("/api/trains/" + kNum + "/route",
            [&](const httplib::Request& req, httplib::Response& res) {
                auto result = manager.getRoute(req.matches[1]);
                if (!result) return sendError(res, result);
                sendJson(res, 200, toJson(result.value));
            });

    svr.Post("/api/trains/" + kNum + "/stations",
             [&](const httplib::Request& req, httplib::Response& res) {
                 json body;
                 if (!parseJsonObject(req, res, body)) return;
                 std::optional<std::string> name;
                 int arrival = 0, departure = 0;
                 if (Status s = readString(body, "name", "Station name", true, name); !s)
                     return sendError(res, s);
                 if (Status s = readTime(body, "arrival", "Arrival time", arrival); !s)
                     return sendError(res, s);
                 if (Status s = readTime(body, "departure", "Departure time", departure); !s)
                     return sendError(res, s);
                 auto result = manager.addStation(req.matches[1], *name, arrival, departure);
                 if (!result) return sendError(res, result);
                 sendJson(res, 201, toJson(result.value));
             });

    svr.Get("/api/trains/" + kNum + "/stations/" + kIdx,
            [&](const httplib::Request& req, httplib::Response& res) {
                auto index = parseIndex(req.matches[2]);
                if (!index) return sendError(res, ErrorCode::BadRequest, "Invalid station index.");
                auto result = manager.getStation(req.matches[1], *index);
                if (!result) return sendError(res, result);
                sendJson(res, 200, json{{"station", toJson(result.value)}});
            });

    svr.Put("/api/trains/" + kNum + "/stations/" + kIdx,
            [&](const httplib::Request& req, httplib::Response& res) {
                auto index = parseIndex(req.matches[2]);
                if (!index) return sendError(res, ErrorCode::BadRequest, "Invalid station index.");
                json body;
                if (!parseJsonObject(req, res, body)) return;
                std::optional<std::string> name;
                int arrival = 0, departure = 0;
                if (Status s = readString(body, "name", "Station name", true, name); !s)
                    return sendError(res, s);
                if (Status s = readTime(body, "arrival", "Arrival time", arrival); !s)
                    return sendError(res, s);
                if (Status s = readTime(body, "departure", "Departure time", departure); !s)
                    return sendError(res, s);
                auto result =
                    manager.updateStation(req.matches[1], *index, *name, arrival, departure);
                if (!result) return sendError(res, result);
                sendJson(res, 200, toJson(result.value));
            });

    svr.Delete("/api/trains/" + kNum + "/stations/" + kIdx,
               [&](const httplib::Request& req, httplib::Response& res) {
                   auto index = parseIndex(req.matches[2]);
                   if (!index)
                       return sendError(res, ErrorCode::BadRequest, "Invalid station index.");
                   auto result = manager.removeStation(req.matches[1], *index);
                   if (!result) return sendError(res, result);
                   sendJson(res, 200, toJson(result.value));
               });

    // ----- movement ---------------------------------------------------------
    svr.Post("/api/trains/" + kNum + "/move",
             [&](const httplib::Request& req, httplib::Response& res) {
                 auto result = manager.moveTrain(req.matches[1]);
                 if (!result) return sendError(res, result);
                 sendJson(res, 200, toJson(result.value));
             });

    svr.Post("/api/trains/" + kNum + "/reset",
             [&](const httplib::Request& req, httplib::Response& res) {
                 auto result = manager.resetTrain(req.matches[1]);
                 if (!result) return sendError(res, result);
                 sendJson(res, 200, toJson(result.value));
             });

    // =======================================================================
    // Run
    // =======================================================================
    std::signal(SIGINT, onSignal);
    std::signal(SIGTERM, onSignal);
    std::atomic<bool> finished{false};
    std::thread watcher([&] {
        while (!finished && !g_stopRequested) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        if (g_stopRequested) svr.stop();
    });

    std::cout << "RailFlow API listening on http://" << config.host << ":" << config.port << "\n";
    if (!config.staticDir.empty()) {
        std::cout << "Serving frontend from " << config.staticDir << "\n";
    }
    std::cout << "Data is stored in memory only and resets when the server stops.\n"
              << "Press Ctrl+C to stop.\n";

    const bool ok = svr.listen(config.host, config.port);
    finished = true;
    watcher.join();
    if (!ok && !g_stopRequested) {
        std::cerr << "Error: could not listen on " << config.host << ":" << config.port
                  << " (is the port already in use?)\n";
        return 1;
    }
    std::cout << "\nServer stopped.\n";
    return 0;
}

}  // namespace railflow
