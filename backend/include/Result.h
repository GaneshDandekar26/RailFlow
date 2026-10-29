#pragma once
// Lightweight success/failure types used across the domain layer.
// They let the core classes report *why* something failed (and which input
// field was responsible) without using exceptions for ordinary validation.

#include <string>
#include <utility>

namespace railflow {

enum class ErrorCode {
    None,        // success
    BadRequest,  // malformed input (maps to HTTP 400)
    NotFound,    // train / station does not exist (404)
    Conflict,    // duplicate, or the action is not allowed in the current state (409)
    Validation   // input is well-formed but breaks a rule, e.g. times out of order (422)
};

struct Status {
    ErrorCode code = ErrorCode::None;
    std::string message;
    std::string field;  // optional: name of the offending input field

    bool ok() const { return code == ErrorCode::None; }
    explicit operator bool() const { return ok(); }

    static Status Ok() { return Status{}; }
    static Status Fail(ErrorCode c, std::string msg, std::string fld = {}) {
        Status s;
        s.code = c;
        s.message = std::move(msg);
        s.field = std::move(fld);
        return s;
    }
};

template <typename T>
struct Result : Status {
    T value{};

    Result() = default;
    // Implicit conversion so a failed Status can be returned directly.
    Result(const Status& s) : Status(s) {}

    static Result Ok(T v) {
        Result r;
        r.value = std::move(v);
        return r;
    }
    static Result Fail(ErrorCode c, std::string msg, std::string fld = {}) {
        Result r;
        static_cast<Status&>(r) = Status::Fail(c, std::move(msg), std::move(fld));
        return r;
    }
};

}  // namespace railflow
