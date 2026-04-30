package com.readmates.archive.application

class ArchiveApplicationException(
    val error: ArchiveApplicationError,
    message: String,
) : RuntimeException(message)

enum class ArchiveApplicationError {
    MEMBER_APP_ACCESS_REQUIRED,
    REVIEW_BODY_REQUIRED,
    SESSION_NOT_FOUND,
}
