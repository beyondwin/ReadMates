package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.security.emailOrNull
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.util.HexFormat

@Component
class RateLimitFilter(
    private val rateLimitPort: RateLimitPort,
    private val properties: RateLimitProperties,
    @param:Value("\${readmates.bff-secret:}")
    private val expectedBffSecret: String = "",
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val check = if (properties.enabled) request.toRateLimitCheck() else null
        if (check != null) {
            val decision = rateLimitPort.check(check)
            if (!decision.allowed) {
                decision.retryAfterSeconds?.let { response.setHeader("Retry-After", it.toString()) }
                response.status = HTTP_TOO_MANY_REQUESTS
                response.contentType = "application/json"
                response.writer.write("""{"code":"RATE_LIMITED","message":"Too many requests"}""")
                return
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun HttpServletRequest.toRateLimitCheck(): RateLimitCheck? {
        val path = requestURI
        val ipHash = stableHash(rateLimitIdentifier())

        return when {
            method == "GET" && path.startsWith("/oauth2/authorization/") ->
                RateLimitCheck("rl:ip:$ipHash:oauth-start", 20, Duration.ofMinutes(1), sensitive = false)

            method == "GET" && path.startsWith("/login/oauth2/code/") ->
                RateLimitCheck("rl:ip:$ipHash:oauth-callback", 30, Duration.ofMinutes(1), sensitive = false)

            method == "GET" && INVITATION_PREVIEW.matches(path) -> {
                val token = INVITATION_PREVIEW.matchEntire(path)!!.groupValues[1]
                RateLimitCheck(
                    "rl:ip:$ipHash:invite-preview:${stableHash(token).take(12)}",
                    30,
                    Duration.ofMinutes(10),
                    sensitive = false,
                )
            }

            method == "GET" && CLUB_INVITATION_PREVIEW.matches(path) -> {
                val token = CLUB_INVITATION_PREVIEW.matchEntire(path)!!.groupValues[2]
                RateLimitCheck(
                    "rl:ip:$ipHash:invite-preview:${stableHash(token).take(12)}",
                    30,
                    Duration.ofMinutes(10),
                    sensitive = false,
                )
            }

            method == "POST" && INVITATION_ACCEPT.matches(path) -> {
                val token = INVITATION_ACCEPT.matchEntire(path)!!.groupValues[1]
                RateLimitCheck(
                    "rl:ip:$ipHash:invite-accept:${stableHash(token).take(12)}",
                    10,
                    Duration.ofMinutes(10),
                    sensitive = true,
                )
            }

            method == "POST" && CLUB_INVITATION_ACCEPT.matches(path) -> {
                val token = CLUB_INVITATION_ACCEPT.matchEntire(path)!!.groupValues[2]
                RateLimitCheck(
                    "rl:ip:$ipHash:invite-accept:${stableHash(token).take(12)}",
                    10,
                    Duration.ofMinutes(10),
                    sensitive = true,
                )
            }

            method in MUTATING_METHODS && path.startsWith("/api/host/") -> {
                val subject = SecurityContextHolder.getContext().authentication.emailOrNull()
                    ?.let(::stableHash)
                    ?: ipHash
                val feedbackUpload = FEEDBACK_UPLOAD.matches(path)
                RateLimitCheck(
                    key = if (feedbackUpload) {
                        val sessionId = FEEDBACK_UPLOAD.matchEntire(path)!!.groupValues[1]
                        "rl:user:$subject:feedback-upload:${stableHash(sessionId).take(12)}"
                    } else {
                        "rl:user:$subject:host-mutation"
                    },
                    limit = if (feedbackUpload) 10 else 60,
                    window = if (feedbackUpload) Duration.ofMinutes(10) else Duration.ofMinutes(1),
                    sensitive = feedbackUpload,
                )
            }

            else -> null
        }
    }

    private fun stableHash(value: String): String =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)))

    private fun HttpServletRequest.rateLimitIdentifier(): String =
        trustedClientIp()
            ?: remoteAddr.trimmedIdentifier()
            ?: "unknown"

    private fun HttpServletRequest.trustedClientIp(): String? {
        val expected = expectedBffSecret.trim()
        if (expected.isBlank()) {
            return null
        }

        val provided = getHeader(BFF_SECRET_HEADER) ?: return null
        if (!secretMatches(provided, expected)) {
            return null
        }

        return getHeader(CLIENT_IP_HEADER).trimmedIdentifier()
    }

    private fun secretMatches(provided: String, expected: String): Boolean =
        MessageDigest.isEqual(
            provided.toByteArray(StandardCharsets.UTF_8),
            expected.toByteArray(StandardCharsets.UTF_8),
        )

    private fun String?.trimmedIdentifier(): String? =
        this
            ?.trim()
            ?.take(MAX_IDENTIFIER_LENGTH)
            ?.takeIf { it.isNotEmpty() }

    private companion object {
        const val HTTP_TOO_MANY_REQUESTS = 429
        const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
        const val CLIENT_IP_HEADER = "X-Readmates-Client-IP"
        const val MAX_IDENTIFIER_LENGTH = 128
        val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")
        val INVITATION_PREVIEW = Regex("^/api/invitations/([^/]+)$")
        val INVITATION_ACCEPT = Regex("^/api/invitations/([^/]+)/accept$")
        val CLUB_INVITATION_PREVIEW = Regex("^/api/clubs/([^/]+)/invitations/([^/]+)$")
        val CLUB_INVITATION_ACCEPT = Regex("^/api/clubs/([^/]+)/invitations/([^/]+)/accept$")
        val FEEDBACK_UPLOAD = Regex("^/api/host/sessions/([^/]+)/feedback-document$")
    }
}
