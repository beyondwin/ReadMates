package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.`in`.ClearHostAuthorityContextUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class VerifiedHostAuthorityContext(
    val clubId: UUID,
)

@Component
class HostAuthorityContextCookie(
    @Value("\${readmates.auth.return-state-secret}")
    secret: String,
    @param:Value("\${readmates.auth.session-cookie-secure:true}")
    private val secureCookie: Boolean = false,
    @param:Value("\${readmates.auth.session-cookie-domain:}")
    private val sessionCookieDomain: String = "",
) : ClearHostAuthorityContextUseCase {
    private val signingKey =
        secret
            .trim()
            .also {
                require(it.isNotEmpty()) {
                    "readmates.auth.return-state-secret must be set before host authority context cookies can be issued"
                }
            }.toByteArray(Charsets.UTF_8)

    fun issue(
        sessionId: String,
        expiresAt: OffsetDateTime,
        clubId: UUID,
    ): String =
        buildCookie(
            signedValue(sessionId, expiresAt, clubId),
            Duration.between(now(), expiresAt).coerceAtLeast(Duration.ZERO),
        )

    fun clear(): String = buildCookie("", Duration.ZERO)

    override fun clearedHostAuthorityContextCookie(): String = clear()

    internal fun signedValue(
        session: StoredAuthSession,
        clubId: UUID,
    ): String = signedValue(session.id, session.expiresAt, clubId)

    private fun signedValue(
        sessionId: String,
        expiresAt: OffsetDateTime,
        clubId: UUID,
    ): String {
        val payload = "$sessionId|$clubId|${expiresAt.toEpochSecond()}"
        val encodedPayload = ENCODER.encodeToString(payload.toByteArray(Charsets.UTF_8))
        val authenticatedPayload = "$VERSION.$encodedPayload"
        val signature = signature(authenticatedPayload)
        return "$authenticatedPayload.${ENCODER.encodeToString(signature)}"
    }

    internal fun verify(
        rawValue: String?,
        session: StoredAuthSession,
    ): VerifiedHostAuthorityContext? =
        rawValue?.let {
            runCatching {
                val parts = it.split('.').also { tokenParts -> require(tokenParts.size == TOKEN_PART_COUNT) }
                require(parts[0] == VERSION)
                val authenticatedPayload = "${parts[0]}.${parts[1]}"
                val providedSignature = requireNotNull(decode(parts[2]))
                require(MessageDigest.isEqual(signature(authenticatedPayload), providedSignature))
                val payload = requireNotNull(decode(parts[1])).toString(Charsets.UTF_8).split('|')
                require(payload.size == PAYLOAD_PART_COUNT && payload[0] == session.id)
                val clubId = UUID.fromString(payload[1])
                val expiresAt = requireNotNull(payload[2].toLongOrNull())
                require(expiresAt == session.expiresAt.toEpochSecond() && expiresAt > now().toEpochSecond())
                VerifiedHostAuthorityContext(clubId)
            }.getOrNull()
        }

    private fun buildCookie(
        value: String,
        maxAge: Duration,
    ): String {
        val parts =
            mutableListOf(
                "$COOKIE_NAME=$value",
                "Path=/",
                "Max-Age=${maxAge.seconds.coerceAtLeast(0)}",
            )
        sessionCookieDomain.trim().takeIf { it.isNotEmpty() }?.let { parts += "Domain=$it" }
        if (secureCookie) {
            parts += "Secure"
        }
        parts += "HttpOnly"
        parts += "SameSite=Lax"
        return parts.joinToString("; ")
    }

    private fun decode(value: String): ByteArray? = runCatching { DECODER.decode(value) }.getOrNull()

    private fun signature(authenticatedPayload: String): ByteArray {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(signingKey, HMAC_ALGORITHM))
        mac.update(PURPOSE_PREFIX)
        return mac.doFinal(authenticatedPayload.toByteArray(Charsets.UTF_8))
    }

    private fun now(): OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)

    companion object {
        const val COOKIE_NAME = "readmates_host_authority"
        private const val VERSION = "v1"
        private const val TOKEN_PART_COUNT = 3
        private const val PAYLOAD_PART_COUNT = 3
        private const val HMAC_ALGORITHM = "HmacSHA256"
        private val PURPOSE_PREFIX = "readmates:host-authority-context:v1\u0000".toByteArray(StandardCharsets.UTF_8)
        private val ENCODER = Base64.getUrlEncoder().withoutPadding()
        private val DECODER = Base64.getUrlDecoder()
    }
}
