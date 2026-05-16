package com.readmates.club.application

class PlatformAdminException(
    val error: PlatformAdminError,
    message: String,
) : RuntimeException(message)

enum class PlatformAdminError {
    INVALID_DOMAIN,
    INVALID_CLUB,
    CLUB_NOT_FOUND,
    CLUB_PUBLISH_NOT_ALLOWED,
    CLUB_HOST_REQUIRED,
    CLUB_SLUG_CONFLICT,
    EXISTING_USER_CONFIRMATION_REQUIRED,
    CLUB_DOMAIN_NOT_FOUND,
    CLUB_DOMAIN_CONFLICT,
    GRANT_NOT_FOUND,
    GRANT_REASON_REQUIRED,
}
