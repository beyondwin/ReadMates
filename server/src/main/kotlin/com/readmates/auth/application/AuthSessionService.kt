package com.readmates.auth.application

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.`in`.LogoutAuthSessionUseCase
import com.readmates.auth.application.port.out.AuthSessionStorePort
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

data class IssuedAuthSession(
    val rawToken: String,
    val storedTokenHash: String,
    val userId: String,
    val expiresAt: OffsetDateTime,
)

@Service
class AuthSessionService(
    private val authSessionStore: AuthSessionStorePort,
    @param:Value("\${readmates.auth.session-cookie-secure:true}")
    private val secureCookie: Boolean = false,
) : LogoutAuthSessionUseCase {
    private val secureRandom = SecureRandom()

    override val sessionCookieName: String = COOKIE_NAME

    fun issueSession(userId: String, userAgent: String?, ipAddress: String?): IssuedAuthSession {
        val rawToken = generateToken()
        val tokenHash = hashToken(rawToken)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plus(SESSION_TTL)

        authSessionStore.create(
            StoredAuthSession(
                id = UUID.randomUUID().toString(),
                userId = UUID.fromString(userId).toString(),
                sessionTokenHash = tokenHash,
                createdAt = now,
                lastSeenAt = now,
                expiresAt = expiresAt,
                userAgent = userAgent?.take(MAX_USER_AGENT_LENGTH),
                ipHash = ipAddress?.trim()?.takeIf { it.isNotEmpty() }?.let(::hashToken),
            ),
        )

        return IssuedAuthSession(
            rawToken = rawToken,
            storedTokenHash = tokenHash,
            userId = userId,
            expiresAt = expiresAt,
        )
    }

    fun findValidSession(rawToken: String): StoredAuthSession? {
        val tokenHash = hashToken(rawToken)
        val session = authSessionStore.findValidByTokenHash(tokenHash) ?: return null
        authSessionStore.touchByTokenHash(tokenHash)
        return session
    }

    fun revokeSession(rawToken: String) {
        authSessionStore.revokeByTokenHash(hashToken(rawToken))
    }

    fun revokeAllForUser(userId: String) {
        authSessionStore.revokeAllForUser(userId)
    }

    override fun logout(rawToken: String?): String {
        rawToken
            ?.takeIf { it.isNotBlank() }
            ?.let(::revokeSession)
        return clearedSessionCookie()
    }

    fun sessionCookie(rawToken: String): String =
        cookieBuilder(rawToken, SESSION_TTL).build().toString()

    fun clearedSessionCookie(): String =
        cookieBuilder("", Duration.ZERO).build().toString()

    fun hashToken(rawToken: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(rawToken.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }

    private fun generateToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun cookieBuilder(value: String, maxAge: Duration): ResponseCookie.ResponseCookieBuilder =
        ResponseCookie
            .from(COOKIE_NAME, value)
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(maxAge)

    companion object {
        const val COOKIE_NAME = "readmates_session"
        private val SESSION_TTL: Duration = Duration.ofDays(14)
        private const val MAX_USER_AGENT_LENGTH = 500
    }
}
