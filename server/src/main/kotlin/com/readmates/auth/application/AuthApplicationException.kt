package com.readmates.auth.application

class AuthApplicationException(
    val error: AuthApplicationError,
    message: String,
) : RuntimeException(message)

enum class AuthApplicationError {
    AUTHENTICATION_REQUIRED,
    HOST_REQUIRED,
    MEMBER_NOT_FOUND,
    MEMBER_CONFLICT,
    VIEWER_MEMBER_NOT_FOUND,
    PENDING_APPROVAL_REQUIRED,
    CLUB_NOT_FOUND,
}

class InvitationDomainException(
    val code: String,
    val error: InvitationDomainError,
    message: String,
) : RuntimeException(message)

enum class InvitationDomainError {
    BAD_REQUEST,
    FORBIDDEN,
    NOT_FOUND,
    CONFLICT,
    STORAGE_UNAVAILABLE,
}
