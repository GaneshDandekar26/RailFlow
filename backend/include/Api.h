#pragma once
// HTTP layer: wires REST routes (cpp-httplib) to TrainManager and serialises
// results as JSON (nlohmann/json).

#include <string>

#include "TrainManager.h"

namespace railflow {

struct ServerConfig {
    std::string host = "127.0.0.1";
    int port = 8080;
    // Optional: directory containing a built frontend (index.html, assets/...).
    // When set, the backend also serves the UI, so a single process is enough.
    std::string staticDir;
};

// Blocks until the server stops (Ctrl+C / SIGTERM). Returns a process exit code.
int runServer(const ServerConfig& config, TrainManager& manager);

}  // namespace railflow
