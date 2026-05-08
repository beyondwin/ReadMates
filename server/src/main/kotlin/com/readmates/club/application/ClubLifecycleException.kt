package com.readmates.club.application

class ClubLifecycleException(
    val error: ClubLifecycleError,
    message: String,
) : RuntimeException(message)

enum class ClubLifecycleError {
    CLUB_NOT_FOUND,
    INVALID_TRANSITION,
}
