package com.readmates.auth.infrastructure.security

import org.springframework.beans.factory.annotation.Value
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.net.URI
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Component
class OAuthReturnState(
    @Value("\${readmates.auth.return-state-secret:dev-return-state-secret}")
    secret: String,
    @Value("\${readmates.app-base-url:http://localhost:3000}")
    appBaseUrl: String,
    @param:Value("\${readmates.auth.return-state-ttl:10m}")
    private val ttl: Duration,
    @Value("\${readmates.auth.session-cookie-domain:}")
    sessionCookieDomain: String,
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    private val normalizedSecret = secret.trim().ifEmpty { "dev-return-state-secret" }
    private val appOrigin = readmatesAppOrigin(appBaseUrl)
    private val primaryAppHost = URI.create(appOrigin).host.lowercase(Locale.ROOT)
    private val sharedSessionCookieDomain = sessionCookieDomain
        .trim()
        .trimStart('.')
        .trimEnd('.')
        .lowercase(Locale.ROOT)
        .takeIf { it.isNotEmpty() }
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val decoder = Base64.getUrlDecoder()
    private val signingKey = SecretKeySpec(normalizedSecret.toByteArray(Charsets.UTF_8), HMAC_ALGORITHM)

    fun signReturnTarget(returnTo: String?): String? =
        signReturnTarget(returnTo, Instant.now().plus(ttl))

    fun signReturnTarget(returnTo: String?, expiresAt: Instant): String? {
        val trustedReturnTo = trustedReturnTarget(returnTo) ?: return null
        val expiresAtEpochSeconds = expiresAt.epochSecond
        val encodedReturnTo = encoder.encodeToString(trustedReturnTo.toByteArray(Charsets.UTF_8))
        val signature = signature(trustedReturnTo, expiresAtEpochSeconds)
        return "$encodedReturnTo.$expiresAtEpochSeconds.$signature"
    }

    fun validatedReturnTarget(signedState: String?, fallback: String = DEFAULT_RETURN_TARGET): String {
        val trustedReturnTo = verifiedReturnTarget(signedState)
        return trustedReturnTo ?: fallback
    }

    fun inviteReturnTarget(clubSlug: String, inviteToken: String): String =
        "/clubs/$clubSlug/invite/$inviteToken"

    fun inviteClubSlugFromReturnState(signedState: String?, inviteToken: String): String? {
        val returnTarget = verifiedReturnTarget(signedState) ?: return null
        return inviteClubSlug(returnTarget, inviteToken)
    }

    fun inviteReturnTargetFromState(signedState: String?, clubSlug: String, inviteToken: String): String? {
        val returnTarget = verifiedReturnTarget(signedState) ?: return null
        return returnTarget.takeIf { inviteReturnTargetMatchesClub(it, clubSlug, inviteToken) }
    }

    fun redirectUrl(returnTarget: String): String =
        if (returnTarget.startsWith("/")) {
            "$appOrigin$returnTarget"
        } else {
            returnTarget
        }

    private fun verifiedReturnTarget(signedState: String?): String? {
        val parts = signedState
            ?.trim()
            ?.split(".")
            ?.takeIf { it.size == 3 }
            ?: return null
        val returnTo = decode(parts[0]) ?: return null
        val expiresAtEpochSeconds = parts[1].toLongOrNull() ?: return null
        if (Instant.now().epochSecond > expiresAtEpochSeconds) {
            return null
        }
        val expectedSignature = signature(returnTo, expiresAtEpochSeconds)
        if (!MessageDigest.isEqual(expectedSignature.toByteArray(Charsets.UTF_8), parts[2].toByteArray(Charsets.UTF_8))) {
            return null
        }
        return trustedReturnTarget(returnTo)
    }

    private fun trustedReturnTarget(returnTo: String?): String? {
        val candidate = returnTo
            ?.trim()
            ?.takeIf { it.isNotEmpty() && it.length <= MAX_RETURN_TO_LENGTH }
            ?.takeIf { it.none(Char::isISOControl) }
            ?: return null

        return if (candidate.startsWith("/")) {
            candidate.takeIf { !it.startsWith("//") && !it.contains('\\') }
        } else {
            trustedAbsoluteReturnTarget(candidate)
        }
    }

    private fun trustedAbsoluteReturnTarget(candidate: String): String? {
        val uri = try {
            URI.create(candidate)
        } catch (_: IllegalArgumentException) {
            return null
        }
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        if (scheme != "http" && scheme != "https") {
            return null
        }
        if (uri.rawUserInfo != null) {
            return null
        }
        val host = uri.host?.trimEnd('.')?.lowercase(Locale.ROOT) ?: return null
        if (!isTrustedHost(host)) {
            return null
        }
        return candidate
    }

    private fun isTrustedHost(host: String): Boolean =
        host == primaryAppHost ||
            host == PAGES_PREVIEW_HOST ||
            (isCoveredBySharedSessionCookieDomain(host) && isActiveClubDomain(host))

    private fun isCoveredBySharedSessionCookieDomain(host: String): Boolean {
        val cookieDomain = sharedSessionCookieDomain ?: return false
        return host == cookieDomain || host.endsWith(".$cookieDomain")
    }

    private fun isActiveClubDomain(host: String): Boolean {
        return activeClubSlugForDomain(host) != null
    }

    private fun inviteClubSlug(returnTarget: String, inviteToken: String): String? {
        val uri = try {
            URI.create(returnTarget)
        } catch (_: IllegalArgumentException) {
            return null
        }
        val path = uri.path ?: return null
        val scopedMatch = CLUB_INVITE_PATH.matchEntire(path)
        if (scopedMatch != null) {
            return scopedMatch.groupValues[1].takeIf { scopedMatch.groupValues[2] == inviteToken }
        }
        val legacyMatch = LEGACY_INVITE_PATH.matchEntire(path) ?: return null
        if (legacyMatch.groupValues[1] != inviteToken || returnTarget.startsWith("/")) {
            return null
        }
        val host = uri.host?.trimEnd('.')?.lowercase(Locale.ROOT) ?: return null
        return activeClubSlugForDomain(host)
    }

    private fun inviteReturnTargetMatchesClub(returnTarget: String, clubSlug: String, inviteToken: String): Boolean {
        val uri = try {
            URI.create(returnTarget)
        } catch (_: IllegalArgumentException) {
            return false
        }
        val path = uri.path ?: return false
        val scopedMatch = CLUB_INVITE_PATH.matchEntire(path)
        if (scopedMatch != null) {
            val pathSlug = scopedMatch.groupValues[1]
            if (pathSlug != clubSlug || scopedMatch.groupValues[2] != inviteToken) {
                return false
            }
            if (returnTarget.startsWith("/")) {
                return true
            }
            val host = uri.host?.trimEnd('.')?.lowercase(Locale.ROOT) ?: return false
            val hostClubSlug = activeClubSlugForDomain(host)
            return hostClubSlug == null || hostClubSlug == clubSlug
        }

        val legacyMatch = LEGACY_INVITE_PATH.matchEntire(path) ?: return false
        if (legacyMatch.groupValues[1] != inviteToken || returnTarget.startsWith("/")) {
            return false
        }
        val host = uri.host?.trimEnd('.')?.lowercase(Locale.ROOT) ?: return false
        return activeClubSlugForDomain(host) == clubSlug
    }

    private fun activeClubSlugForDomain(host: String): String? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select clubs.slug
            from club_domains
            join clubs on clubs.id = club_domains.club_id
            where lower(hostname) = ?
              and club_domains.status = 'ACTIVE'
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("slug") },
            host,
        ).firstOrNull()
    }

    private fun signature(returnTo: String, expiresAtEpochSeconds: Long): String {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(signingKey)
        return encoder.encodeToString(mac.doFinal("$returnTo|$expiresAtEpochSeconds".toByteArray(Charsets.UTF_8)))
    }

    private fun decode(value: String): String? =
        try {
            String(decoder.decode(value), Charsets.UTF_8)
        } catch (_: IllegalArgumentException) {
            null
        }

    companion object {
        const val SESSION_ATTRIBUTE = "READMATES_OAUTH_RETURN_STATE"
        const val DEFAULT_RETURN_TARGET = "/app"
        private const val HMAC_ALGORITHM = "HmacSHA256"
        private const val PAGES_PREVIEW_HOST = "readmates.pages.dev"
        private const val MAX_RETURN_TO_LENGTH = 2048
        private val CLUB_INVITE_PATH = Regex("^/clubs/([^/]+)/invite/([^/]+)$")
        private val LEGACY_INVITE_PATH = Regex("^/invite/([^/]+)$")
    }
}
