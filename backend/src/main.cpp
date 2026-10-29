#include <cstdlib>
#include <iostream>
#include <string>

#include "Api.h"
#include "TrainManager.h"

namespace {

void printUsage(const char* program) {
    std::cout << "RailFlow backend - Train Scheduling and Route Management\n\n"
              << "Usage: " << program << " [options]\n\n"
              << "Options:\n"
              << "  --port <n>      Port to listen on (default 8080)\n"
              << "  --host <addr>   Address to bind (default 127.0.0.1; use 0.0.0.0 for all interfaces)\n"
              << "  --static <dir>  Also serve a built frontend from <dir> (e.g. ../frontend/dist)\n"
              << "  --seed          Start with a few sample trains already loaded\n"
              << "  --help          Show this help\n\n"
              << "Environment:\n"
              << "  RAILFLOW_CORS_ORIGINS  Comma-separated list of allowed browser origins\n"
              << "                         (default: localhost/127.0.0.1 on ports 5173, 4173, 3000)\n";
}

}  // namespace

int main(int argc, char** argv) {
    railflow::ServerConfig config;
    bool seed = false;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        auto needValue = [&](const char* name) -> const char* {
            if (i + 1 >= argc) {
                std::cerr << "Missing value for " << name << "\n";
                std::exit(2);
            }
            return argv[++i];
        };
        if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return 0;
        } else if (arg == "--port") {
            const std::string value = needValue("--port");
            try {
                config.port = std::stoi(value);
            } catch (...) {
                config.port = -1;
            }
            if (config.port < 1 || config.port > 65535) {
                std::cerr << "Invalid port: " << value << "\n";
                return 2;
            }
        } else if (arg == "--host") {
            config.host = needValue("--host");
        } else if (arg == "--static") {
            config.staticDir = needValue("--static");
        } else if (arg == "--seed") {
            seed = true;
        } else {
            std::cerr << "Unknown option: " << arg << "\n\n";
            printUsage(argv[0]);
            return 2;
        }
    }

    railflow::TrainManager manager;
    if (seed) {
        const auto report = manager.seedSampleData();
        std::cout << "Loaded " << report.created << " sample train(s).\n";
    }
    return railflow::runServer(config, manager);
}
