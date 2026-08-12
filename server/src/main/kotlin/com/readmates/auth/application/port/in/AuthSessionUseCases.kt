package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.model.IssuedAuthSession
import com.readmates.auth.application.model.StoredAuthSession

interface ManageAuthSessionUseCase {
    val sessionCookieName: String

    fun issueSession(
        userId: String,
        userAgent: String?,
        ipAddress: String?,
    ): IssuedAuthSession

    fun findValidSession(rawToken: String): StoredAuthSession?

    fun sessionCookie(rawToken: String): String

    fun clearedSessionCookie(): String
}

interface LogoutAuthSessionUseCase {
    val sessionCookieName: String

    fun logout(rawToken: String?): String

    fun clearedServletSessionCookie(): String
}
