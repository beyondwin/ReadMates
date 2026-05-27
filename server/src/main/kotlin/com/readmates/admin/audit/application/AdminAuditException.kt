package com.readmates.admin.audit.application

enum class AdminAuditError {
    INVALID_FILTER,
    INVALID_CURSOR,
}

class AdminAuditException(
    val error: AdminAuditError,
    message: String,
) : RuntimeException(message)
