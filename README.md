# RailFlow: Train Scheduling and Route Management

A full-stack web app for building train routes and following trains along them.

- **Backend:** C++17 with [cpp-httplib](https://github.com/yhirose/cpp-httplib) (REST) and [nlohmann/json](https://github.com/nlohmann/json), built with CMake. Both libraries are vendored in `backend/third_party`, so nothing needs downloading to build.
- **Frontend:** React 18, Vite, Tailwind CSS, Lucide icons, Recharts, React Router.
- **The core idea:** every train's route is a **singly linked list** of `Station` nodes, written by hand in C++ with `new`/`delete`. The train's current location is a pointer into that list, and moving the train advances the pointer (`current = current->next`).

```
head ──► [Mumbai] ──► [Thane] ──► [Kalyan] ──► [Pune] ──► nullptr
                         ▲                        ▲
                      current                    tail
```

Data is kept **in memory only**. Stopping the backend clears all trains, stations and events.

## Quick start (Ubuntu / Debian)

```bash
# 1. One-time: install g++, CMake and Node.js
./scripts/install-deps-ubuntu.sh

# 2. Terminal A: build and start the backend on http://localhost:8080
./scripts/run-backend.sh --seed        # --seed preloads 3 sample trains (optional)

# 3. Terminal B: start the UI on http://localhost:5173
./scripts/run-frontend.sh
```

Open <http://localhost:5173>. If you started without `--seed`, use **Load sample trains** on the Overview or About page, or add your own.

Other ways to run:

| Command | What it does |
|---|---|
| `./scripts/run-all.sh` | Starts backend and frontend together (Ctrl+C stops both). |
| `./scripts/build-single-server.sh` | Builds the UI and lets the C++ server serve it, so one process on <http://localhost:8080> gives you everything. |
| `./backend/build/railflow --help` | Lists server options (`--port`, `--host`, `--static`, `--seed`). |

Manual equivalents, if you prefer:

```bash
cd backend && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j && ./build/railflow
cd frontend && npm install && npm run dev
```

Requirements: g++ 9+ (C++17), CMake 3.16+, Node.js 18+. Tested with g++ 13, CMake 3.28, Node 22.

## What you can do

| Page | Features |
|---|---|
| **Overview** | Four live metrics (total trains, active trains, trains at final stations, stations across routes), a route track for each train, a status chart, recent activity. |
| **Train Management** | Search by number or name, filter by status, sort, add / edit / delete (with confirmation), jump to a route. Becomes cards on phones. |
| **Route Management** | Vertical timeline with visited, current (with a CURRENT LOCATION badge), upcoming and final stations. Add stations one after another, edit or remove a station, view station details, move the train or reset it to its origin. |
| **Live Tracking** | Every train's position and next stop, with move/reset buttons and an optional auto-advance that makes real API calls every 5 seconds. |
| **Scheduling** | All stops across all trains in time order, "departs in N min" hints (from your device clock), and **platform conflict** detection when two trains occupy one station at overlapping times. |
| **About** | How routes are stored, backend address and connection test, sample data. |

### Status meanings

| Status | Meaning |
|---|---|
| Draft | Fewer than two stations, so there is no journey yet. |
| Scheduled | At the origin, not yet moved. |
| Running | Between the origin and the final station. |
| Completed | At the final station. |
| Stopped / Cancelled | Set by an operator under *Edit train*. These trains can't move. |

"Active trains" counts Scheduled plus Running.

## Rules and limitations

- **Times** are 24-hour `HH:MM` (`00:00` to `23:59`), stored internally as minutes after midnight.
- A station's **departure can't be earlier than its arrival**, and each station's **arrival can't be earlier than the previous departure**.
- **Journeys can't cross midnight.** Everything belongs to one calendar day (a deliberate simplification of this version).
- Train numbers are **3 to 6 digits and unique**. Station names are unique within a route (case-insensitive).
- Stations are **appended at the end** of the route. Existing stations can be edited or removed.
- The station a train is **currently at can't be removed**, so the current pointer can never dangle. Move the train first.
- Data resets whenever the backend restarts.

## Project layout

```
railflow/
├── backend/
│   ├── CMakeLists.txt
│   ├── include/   Station.h  Train.h  TrainManager.h  TimeUtils.h  Result.h  TextUtils.h  Api.h
│   ├── src/       Train.cpp  TrainManager.cpp  TimeUtils.cpp  Api.cpp  main.cpp
│   ├── tests/     test_railflow.cpp          (245 checks, no framework needed)
│   └── third_party/  httplib.h  json.hpp     (vendored single-header libraries)
├── frontend/
│   └── src/  pages/  components/  context/  lib/
└── scripts/   install-deps-ubuntu.sh  run-backend.sh  run-frontend.sh  run-all.sh  build-single-server.sh
```

## How the linked list is implemented

- `Station` (`Station.h`) holds `name`, `arrivalTime`, `departureTime` and `Station* next`. Copying a node is disabled, because a copy would share `next`.
- `Train` (`Train.h`, `Train.cpp`) owns the nodes through `head_`, `tail_` and `current_` raw pointers, plus `size_` and `position_`.
  - **Append** is O(1) thanks to `tail_`. **Search, edit, remove and traversal** are O(n).
  - **Remove** unlinks the node using its predecessor, fixes `head_`/`tail_`, shifts `position_` when the removed node was before the current one, and refuses to remove the current node.
  - The **destructor** walks the list, saving `next` before each `delete`. `Train` is **non-copyable** and **movable**, with a move that leaves the source empty.
  - `checkInvariants()` verifies the list (tail, current, position, size, time order, unique names). The unit tests call it after every mutation.
- `TrainManager` holds `std::vector<std::unique_ptr<Train>>`, so deleting a train frees its whole list. It is mutex-protected (the HTTP server is multithreaded) and returns value snapshots, never raw pointers.

## REST API

Base URL `http://localhost:8080/api`. Bodies are JSON; times are `"HH:MM"`. Errors look like
`{"error": {"code": "VALIDATION_ERROR", "message": "…", "field": "arrival"}}` with status 400 (malformed), 404 (not found), 409 (duplicate / not allowed now) or 422 (rule violation).

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET /stats` | Dashboard figures: totals, active, at final station, stations, counts by status |
| `GET /events?limit=` | Recent activity, newest first |
| `GET /schedule` | All stops sorted by arrival, plus platform conflicts |
| `POST /seed` | Load sample trains |
| `GET /trains?q=&status=&sort=number\|name&order=asc\|desc` | List, search, filter, sort |
| `POST /trains` `{number, name}` | Create a train |
| `GET /trains/:number` | Train summary |
| `PATCH /trains/:number` `{number?, name?, operational?}` | Update (`operational`: `normal`, `stopped`, `cancelled`) |
| `DELETE /trains/:number` | Delete a train and free its route |
| `GET /trains/:number/route` | Train plus its stations in order |
| `POST /trains/:number/stations` `{name, arrival, departure}` | Append a station |
| `GET /trains/:number/stations/:index` | Station details |
| `PUT /trains/:number/stations/:index` | Edit a station (checked against both neighbours) |
| `DELETE /trains/:number/stations/:index` | Remove a station (not the current one) |
| `POST /trains/:number/move` | Advance to the next station |
| `POST /trains/:number/reset` | Return to the origin |

Quick try:

```bash
curl -X POST localhost:8080/api/trains -H 'Content-Type: application/json' -d '{"number":"12127","name":"Demo Express"}'
curl -X POST localhost:8080/api/trains/12127/stations -H 'Content-Type: application/json' \
     -d '{"name":"Mumbai","arrival":"08:00","departure":"08:15"}'
```

CORS allows `localhost` and `127.0.0.1` on ports 5173, 4173 and 3000. To allow other origins, set `RAILFLOW_CORS_ORIGINS="https://example.com,http://192.168.1.5:5173"` before starting the backend.

## Tests

```bash
cd backend
cmake -S . -B build && cmake --build build -j
./build/railflow_tests                       # 245 checks

# optional: also check for leaks and invalid memory use
cmake -S . -B build-asan -DRAILFLOW_SANITIZE=ON -DCMAKE_BUILD_TYPE=Debug
cmake --build build-asan -j && ./build-asan/railflow_tests
```

## Troubleshooting

| Problem | Fix |
|---|---|
| UI shows "The backend isn't responding" | Start the backend (`./scripts/run-backend.sh`). If it runs elsewhere, set its address on the **About** page. |
| `could not listen on 127.0.0.1:8080` | Another program uses the port. Use `--port 9000`, then set the new address on the **About** page. |
| Backend runs in a VM or container but the browser is outside | Start it with `--host 0.0.0.0` and add the browser's origin to `RAILFLOW_CORS_ORIGINS`. |
| Blank page after `build-single-server.sh` | Open <http://localhost:8080> (not :5173) and clear any saved API address on the About page. |
