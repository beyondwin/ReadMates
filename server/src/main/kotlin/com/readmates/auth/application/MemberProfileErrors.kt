package com.readmates.auth.application

class MemberProfileException(
    val error: MemberProfileError,
) : RuntimeException(error.code)

enum class MemberProfileError {
    AUTHENTICATION_REQUIRED,
    HOST_ROLE_REQUIRED,
    MEMBERSHIP_NOT_ALLOWED,
    MEMBER_NOT_FOUND,
    DISPLAY_NAME_REQUIRED,
    DISPLAY_NAME_TOO_LONG,
    DISPLAY_NAME_INVALID,
    DISPLAY_NAME_RESERVED,
    DISPLAY_NAME_DUPLICATE,
    AVATAR_KEY_REQUIRED,
    AVATAR_KEY_INVALID,
    ;

    val code: String
        get() = name
}
