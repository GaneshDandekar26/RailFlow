# RailFlow backend

C++17 REST API for RailFlow. The full project README (API reference, rules, design notes) is in `../README.md`.

## Build and run

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/railflow --seed            # http://127.0.0.1:8080, with sample trains
```

Options: `--port <n>`, `--host <addr>`, `--static <dir>` (serve a built frontend), `--seed`, `--help`.
Environment: `RAILFLOW_CORS_ORIGINS` (comma-separated browser origins to allow).

Targets: `railflow` (server), `railflow_tests` (unit tests), `railflow_core` (static library with the linked list, `Train`, `TrainManager`, `TimeUtils`).

## Source map

| File | Role |
|---|---|
| `include/Station.h` | The linked-list node |
| `include/Train.h`, `src/Train.cpp` | Owns the list; append, edit, remove, move, traversal, invariants |
| `include/TrainManager.h`, `src/TrainManager.cpp` | `unique_ptr<Train>` ownership, validation, events, stats, schedule and conflicts |
| `include/TimeUtils.h`, `src/TimeUtils.cpp` | Strict `HH:MM` parsing and formatting (minutes after midnight) |
| `include/Result.h` | `Status` / `Result<T>` carrying an error code, message and offending field |
| `src/Api.cpp` | Routes, JSON, CORS, error handling, optional static file serving |
| `tests/test_railflow.cpp` | 245 checks covering the list, validation, ownership and manager |

Third-party single headers in `third_party/`: cpp-httplib 0.18.3, nlohmann/json 3.11.3 (both MIT).
