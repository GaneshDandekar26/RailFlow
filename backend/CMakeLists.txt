cmake_minimum_required(VERSION 3.16)
project(RailFlow VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(RAILFLOW_SANITIZE "Build with AddressSanitizer + UndefinedBehaviorSanitizer" OFF)
option(RAILFLOW_BUILD_TESTS "Build the unit-test executable" ON)

find_package(Threads REQUIRED)

# ---- core library: linked list, Train, TrainManager, time utilities --------
add_library(railflow_core STATIC
  src/Train.cpp
  src/TrainManager.cpp
  src/TimeUtils.cpp
)
target_include_directories(railflow_core PUBLIC include)
target_compile_features(railflow_core PUBLIC cxx_std_17)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(railflow_core PRIVATE -Wall -Wextra -Wpedantic)
endif()
if(RAILFLOW_SANITIZE AND CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(railflow_core PUBLIC -fsanitize=address,undefined -fno-omit-frame-pointer -g)
  target_link_options(railflow_core PUBLIC -fsanitize=address,undefined)
endif()

# ---- HTTP server executable ---------------------------------------------------
add_executable(railflow src/main.cpp src/Api.cpp)
# third_party holds the vendored single-header libraries (cpp-httplib, nlohmann/json).
target_include_directories(railflow PRIVATE third_party)
target_link_libraries(railflow PRIVATE railflow_core Threads::Threads)

# ---- unit tests ---------------------------------------------------------------
if(RAILFLOW_BUILD_TESTS)
  enable_testing()
  add_executable(railflow_tests tests/test_railflow.cpp)
  target_link_libraries(railflow_tests PRIVATE railflow_core Threads::Threads)
  add_test(NAME railflow_unit_tests COMMAND railflow_tests)
endif()
