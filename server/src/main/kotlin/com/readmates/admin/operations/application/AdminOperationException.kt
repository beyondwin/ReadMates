package com.readmates.admin.operations.application

enum class AdminOperationError {
    CASE_NOT_FOUND,
    PERMISSION_DENIED,
    INVALID_SNOOZE_WINDOW,
    CASE_VERSION_CONFLICT,
    CASE_STILL_ACTIVE,
    CASE_SOURCE_UNAVAILABLE,
    INVALID_REASON_CODE,
    INVALID_CURSOR,
    INVALID_FILTER,
}

class AdminOperationException(
    val error: AdminOperationError,
) : RuntimeException(error.name)
