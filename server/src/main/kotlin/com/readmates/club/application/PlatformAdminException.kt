package com.readmates.club.application

class PlatformAdminException(
    val error: PlatformAdminError,
    message: String,
) : RuntimeException(message)

enum class PlatformAdminError {
    INVALID_DOMAIN,
    CLUB_DOMAIN_NOT_FOUND,
    CLUB_DOMAIN_CONFLICT,
    GRANT_NOT_FOUND,
    GRANT_REASON_REQUIRED,
}
