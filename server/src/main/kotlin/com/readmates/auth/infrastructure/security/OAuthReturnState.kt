package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.TrustedReturnHostPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.io.ByteArrayOutputStream
import java.net.URI
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Component
class OAuthReturnState(
    @Value("\${readmates.auth.return-state-secret}")
    secret: String,
    @Value("\${readmates.app-base-url:http://localhost:3000}")
    appBaseUrl: String,
    @param:Value("\${readmates.auth.return-state-ttl:10m}")
    private val ttl: Duration,
    @Value("\${readmates.auth.session-cookie-domain:}")
    sessionCookieDomain: String,
    private val trustedReturnHostPort: TrustedReturnHostPort,
) {
    private val normalizedSecret =
        secret.trim().also {
            require(it.isNotEmpty()) {
                "readmates.auth.return-state-secret must be set via READMATES_AUTH_RETURN_STATE_SECRET"
            }
        }
    private val appOrigin = readmatesAppOrigin(appBaseUrl)
    private val primaryAppHost = URI.create(appOrigin).host.lowercase(Locale.ROOT)
    private val sharedSessionCookieDomain =
        sessionCookieDomain
            .trim()
            .trimStart('.')
            .trimEnd('.')
            .lowercase(Locale.ROOT)
            .takeIf { it.isNotEmpty() }
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val decoder = Base64.getUrlDecoder()
    private val signingKey = SecretKeySpec(normalizedSecret.toByteArray(Charsets.UTF_8), HMAC_ALGORITHM)

    fun signReturnTarget(returnTo: String?): String? = signReturnTarget(returnTo, Instant.now().plus(ttl))

    fun signReturnTarget(
        returnTo: String?,
        expiresAt: Instant,
    ): String? {
        val trustedReturnTo = trustedReturnTarget(returnTo) ?: return null
        val expiresAtEpochSeconds = expiresAt.epochSecond
        val encodedReturnTo = encoder.encodeToString(trustedReturnTo.toByteArray(Charsets.UTF_8))
        val signature = signature(trustedReturnTo, expiresAtEpochSeconds)
        return "$encodedReturnTo.$expiresAtEpochSeconds.$signature"
    }

    fun validatedReturnTarget(
        signedState: String?,
        fallback: String = DEFAULT_RETURN_TARGET,
    ): String {
        val trustedReturnTo = verifiedReturnTarget(signedState)
        return trustedReturnTo ?: fallback
    }

    fun loginRetryReturnTarget(signedState: String?): String? =
        verifiedReturnTarget(signedState)
            ?.takeIf { it.startsWith("/") }
            ?.let { target ->
                canonicalRoutePath(target)?.let { canonicalPath ->
                    target.takeIf {
                        canonicalPath != "/" &&
                            LOGIN_RETRY_EXCLUDED_PATHS.none { pattern -> pattern.containsMatchIn(canonicalPath) }
                    }
                }
            }

    fun inviteReturnTarget(
        clubSlug: String,
        inviteToken: String,
    ): String = "/clubs/$clubSlug/invite/$inviteToken"

    fun inviteClubSlugFromReturnState(
        signedState: String?,
        inviteToken: String,
    ): String? {
        val returnTarget = verifiedReturnTarget(signedState) ?: return null
        return inviteClubSlug(returnTarget, inviteToken)
    }

    fun inviteReturnTargetFromState(
        signedState: String?,
        clubSlug: String,
        inviteToken: String,
    ): String? {
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
        val parts =
            signedState
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
        // Not delegated to SecretComparator: this is HMAC signature verification (two computed digests),
        // not multi-candidate secret matching. Timing-safe comparison is still preserved via MessageDigest.isEqual.
        if (!MessageDigest.isEqual(expectedSignature.toByteArray(Charsets.UTF_8), parts[2].toByteArray(Charsets.UTF_8))) {
            return null
        }
        return trustedReturnTarget(returnTo)
    }

    private fun trustedReturnTarget(returnTo: String?): String? {
        val candidate =
            returnTo
                ?.trim()
                ?.takeIf { it.isNotEmpty() && it.length <= MAX_RETURN_TO_LENGTH }
                ?.takeIf { it.none(Char::isISOControl) }
                ?.takeIf(::hasOnlyValidPercentEscapes)
                ?: return null

        return if (candidate.startsWith("/")) {
            candidate.takeIf { !it.startsWith("//") && !it.contains('\\') }
        } else {
            trustedAbsoluteReturnTarget(candidate)
        }
    }

    private fun trustedAbsoluteReturnTarget(candidate: String): String? {
        val uri =
            try {
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

    private fun isActiveClubDomain(host: String): Boolean = activeClubSlugForDomain(host) != null

    private fun canonicalRoutePath(target: String): String? {
        val rawPath = target.substringBeforeAny('?', '#')
        val canonicalSegments = mutableListOf<String>()
        var valid = true
        for (rawSegment in rawPath.split('/').drop(1)) {
            val decodedSegment = decodeRouteSegment(rawSegment)
            if (decodedSegment == null || decodedSegment.contains('\\') || decodedSegment.any(Char::isISOControl)) {
                valid = false
                break
            }
            when (decodedSegment) {
                "." -> Unit
                ".." -> if (canonicalSegments.isNotEmpty()) canonicalSegments.removeLast()
                else -> canonicalSegments += decodedSegment.replace("/", "%2F")
            }
        }
        return if (valid) "/${canonicalSegments.joinToString("/")}" else null
    }

    private fun decodeRouteSegment(segment: String): String? {
        val decoded = StringBuilder()
        var index = 0
        var valid = true
        while (index < segment.length && valid) {
            if (segment[index] != '%') {
                decoded.append(segment[index])
                index += 1
                continue
            }

            val encodedBytes = ByteArrayOutputStream()
            while (index < segment.length && segment[index] == '%' && valid) {
                val byteValue = segment.hexByteAt(index)
                if (byteValue == null) {
                    valid = false
                } else {
                    encodedBytes.write(byteValue)
                    index += PERCENT_ESCAPE_WIDTH
                }
            }
            if (valid) {
                val decodedBytes = encodedBytes.toByteArray().decodeUtf8OrNull()
                if (decodedBytes == null) {
                    valid = false
                } else {
                    decoded.append(decodedBytes)
                }
            }
        }
        return decoded.toString().takeIf { valid }
    }

    private fun hasOnlyValidPercentEscapes(value: String): Boolean {
        var index = 0
        while (index < value.length) {
            if (value[index] == '%') {
                if (value.hexByteAt(index) == null) return false
                index += PERCENT_ESCAPE_WIDTH
            } else {
                index += 1
            }
        }
        return true
    }

    private fun inviteClubSlug(
        returnTarget: String,
        inviteToken: String,
    ): String? {
        val uri =
            try {
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

    private fun inviteReturnTargetMatchesClub(
        returnTarget: String,
        clubSlug: String,
        inviteToken: String,
    ): Boolean {
        val uri =
            try {
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

    private fun activeClubSlugForDomain(host: String): String? = trustedReturnHostPort.activeClubSlugForHost(host)

    private fun signature(
        returnTo: String,
        expiresAtEpochSeconds: Long,
    ): String {
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
        private val LOGIN_RETRY_EXCLUDED_PATHS =
            listOf(
                Regex("^/login(?:[/?#]|$)", RegexOption.IGNORE_CASE),
                Regex("^/oauth2(?:[/?#]|$)", RegexOption.IGNORE_CASE),
                Regex("^/login/oauth2(?:[/?#]|$)", RegexOption.IGNORE_CASE),
                Regex("^/reset-password(?:[/?#]|$)", RegexOption.IGNORE_CASE),
                Regex("^/invite(?:[/?#]|$)", RegexOption.IGNORE_CASE),
                Regex("^/clubs/[^/]+/invite(?:[/?#]|$)", RegexOption.IGNORE_CASE),
            )
        private val CLUB_INVITE_PATH = Regex("^/clubs/([^/]+)/invite/([^/]+)$")
        private val LEGACY_INVITE_PATH = Regex("^/invite/([^/]+)$")
    }
}

private fun String.substringBeforeAny(vararg delimiters: Char): String {
    val end = indexOfFirst { it in delimiters }
    return if (end == -1) this else substring(0, end)
}

private fun String.hexByteAt(percentIndex: Int): Int? {
    val high = getOrNull(percentIndex + 1)?.digitToIntOrNull(HEX_RADIX)
    val low = getOrNull(percentIndex + 2)?.digitToIntOrNull(HEX_RADIX)
    return if (getOrNull(percentIndex) == '%' && high != null && low != null) {
        (high shl BITS_PER_HEX_DIGIT) or low
    } else {
        null
    }
}

private fun ByteArray.decodeUtf8OrNull(): String? =
    try {
        StandardCharsets.UTF_8
            .newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(this))
            .toString()
    } catch (_: CharacterCodingException) {
        null
    }

private const val PERCENT_ESCAPE_WIDTH = 3
private const val HEX_RADIX = 16
private const val BITS_PER_HEX_DIGIT = 4
