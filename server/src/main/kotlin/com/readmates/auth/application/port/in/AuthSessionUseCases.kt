package com.readmates.auth.application.port.`in`

interface LogoutAuthSessionUseCase {
    val sessionCookieName: String

    fun logout(rawToken: String?): String

    fun clearedServletSessionCookie(): String
}
