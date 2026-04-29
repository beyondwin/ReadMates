package com.readmates.auth.application

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.`in`.LogoutAuthSessionUseCase
import com.readmates.auth.application.port.out.AuthSessionCacheSnapshot
import com.readmates.auth.application.port.out.AuthSessionCachePort
import com.readmates.auth.application.port.out.AuthSessionStorePort
import com.readmates.shared.cache.AuthSessionCacheProperties
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
    private val authSessionCache: AuthSessionCachePort = AuthSessionCachePort.Noop(),
    private val cacheProperties: AuthSessionCacheProperties = AuthSessionCacheProperties(),
    @param:Value("\${readmates.auth.session-cookie-secure:true}")
    private val secureCookie: Boolean = false,
    @param:Value("\${readmates.auth.session-cookie-domain:}")
    private val sessionCookieDomain: String = "",
) : LogoutAuthSessionUseCase {
    private val secureRandom = SecureRandom()

    override val sessionCookieName: String = COOKIE_NAME

    fun issueSession(userId: String, userAgent: String?, ipAddress: String?): IssuedAuthSession {
        val rawToken = generateToken()
        val tokenHash = hashToken(rawToken)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plus(SESSION_TTL)
        val storedSession = StoredAuthSession(
            id = UUID.randomUUID().toString(),
            userId = UUID.fromString(userId).toString(),
            sessionTokenHash = tokenHash,
            createdAt = now,
            lastSeenAt = now,
            expiresAt = expiresAt,
            userAgent = userAgent?.take(MAX_USER_AGENT_LENGTH),
            ipHash = ipAddress?.trim()?.takeIf { it.isNotEmpty() }?.let(::hashToken),
        )

        authSessionStore.create(storedSession)
        warmCache(tokenHash, storedSession, now)

        return IssuedAuthSession(
            rawToken = rawToken,
            storedTokenHash = tokenHash,
            userId = userId,
            expiresAt = expiresAt,
        )
    }

    fun findValidSession(rawToken: String): StoredAuthSession? {
        val tokenHash = hashToken(rawToken)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val cached = authSessionCache.find(tokenHash)
            ?.takeIf { it.expiresAt.isAfter(now) }
        val sourceOfTruth = authSessionStore.findValidByTokenHash(tokenHash)
            ?.takeIf { !it.revoked && it.expiresAt.isAfter(now) }
            ?: return null
        val session = cached
            ?.takeIf { it.matches(sourceOfTruth) }
            ?.toStoredAuthSession(tokenHash, now)
            ?: sourceOfTruth.also { warmCache(tokenHash, it, now) }

        if (authSessionCache.shouldTouch(tokenHash, cacheProperties.touchThrottleTtl)) {
            authSessionStore.touchByTokenHash(tokenHash)
        }
        return session
    }

    fun revokeSession(rawToken: String) {
        val tokenHash = hashToken(rawToken)
        authSessionStore.revokeByTokenHash(tokenHash)
        authSessionCache.evict(tokenHash)
    }

    fun revokeAllForUser(userId: String) {
        val normalizedUserId = UUID.fromString(userId).toString()
        authSessionStore.revokeAllForUser(normalizedUserId)
        authSessionCache.evictAllForUser(normalizedUserId)
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

    override fun clearedServletSessionCookie(): String =
        ResponseCookie
            .from(SERVLET_SESSION_COOKIE_NAME, "")
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ZERO)
            .build()
            .toString()

    fun hashToken(rawToken: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(rawToken.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }

    private fun generateToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun warmCache(tokenHash: String, session: StoredAuthSession, now: OffsetDateTime) {
        val ttl = cacheTtlFor(session.expiresAt, now)
        if (ttl <= Duration.ZERO) {
            return
        }
        authSessionCache.store(
            tokenHash,
            AuthSessionCacheSnapshot(
                sessionId = session.id,
                userId = session.userId,
                expiresAt = session.expiresAt,
            ),
            ttl,
        )
        authSessionCache.rememberUserSession(session.userId, tokenHash, ttl)
    }

    private fun AuthSessionCacheSnapshot.toStoredAuthSession(
        tokenHash: String,
        now: OffsetDateTime,
    ) = StoredAuthSession(
        id = sessionId,
        userId = userId,
        sessionTokenHash = tokenHash,
        createdAt = now,
        lastSeenAt = now,
        expiresAt = expiresAt,
        revoked = false,
        userAgent = null,
        ipHash = null,
    )

    private fun AuthSessionCacheSnapshot.matches(session: StoredAuthSession) =
        sessionId == session.id && userId == session.userId && expiresAt.isEqual(session.expiresAt)

    private fun cacheTtlFor(expiresAt: OffsetDateTime, now: OffsetDateTime): Duration {
        val remaining = Duration.between(now, expiresAt)
        if (remaining <= Duration.ZERO) {
            return Duration.ZERO
        }
        return minOf(cacheProperties.sessionTtl, remaining)
    }

    private fun cookieBuilder(value: String, maxAge: Duration): ResponseCookie.ResponseCookieBuilder {
        val builder = ResponseCookie
            .from(COOKIE_NAME, value)
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(maxAge)
        val normalizedDomain = sessionCookieDomain.trim().takeIf { it.isNotEmpty() }
        if (normalizedDomain != null) {
            builder.domain(normalizedDomain)
        }
        return builder
    }

    companion object {
        const val COOKIE_NAME = "readmates_session"
        private const val SERVLET_SESSION_COOKIE_NAME = "JSESSIONID"
        private val SESSION_TTL: Duration = Duration.ofDays(14)
        private const val MAX_USER_AGENT_LENGTH = 500
    }
}
