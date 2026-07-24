package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.TrustedReturnHostPort
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.Base64

class OAuthReturnStateTest {
    private val trustedReturnHostPort =
        object : TrustedReturnHostPort {
            override fun activeClubSlugForHost(host: String): String? = CLUB_SLUG.takeIf { host == ACTIVE_CLUB_HOST }
        }
    private val returnState =
        OAuthReturnState(
            secret = TEST_SECRET,
            appBaseUrl = APP_ORIGIN,
            ttl = Duration.ofMinutes(10),
            sessionCookieDomain = COOKIE_DOMAIN,
            trustedReturnHostPort = trustedReturnHostPort,
        )

    @Test
    fun `fails fast when return state secret is blank`() {
        assertThatThrownBy {
            OAuthReturnState(
                secret = "   ",
                appBaseUrl = "http://localhost:3000",
                ttl = Duration.ofMinutes(10),
                sessionCookieDomain = "",
                trustedReturnHostPort = trustedReturnHostPort,
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("readmates.auth.return-state-secret")
    }

    @Test
    fun `valid relative return target round trips through deterministic signed state`() {
        val returnTarget = "/clubs/$CLUB_SLUG/app?tab=current"
        val signedState = returnState.signReturnTarget(returnTarget, VALID_EXPIRY)

        assertNotNull(signedState)
        assertEquals(returnTarget, returnState.validatedReturnTarget(signedState))
    }

    @Test
    fun `tampered payload and signature fall back without exposing invite state`() {
        val signedState = requireNotNull(returnState.signReturnTarget("/app", VALID_EXPIRY))
        val parts = signedState.split(".")
        val tamperedPayload =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString("/admin".toByteArray(Charsets.UTF_8))
        val payloadTamperedState = "$tamperedPayload.${parts[1]}.${parts[2]}"
        val replacement = if (parts[2].last() == 'a') 'b' else 'a'
        val signatureTamperedState = "${parts[0]}.${parts[1]}.${parts[2].dropLast(1)}$replacement"

        assertInvalidState(payloadTamperedState)
        assertInvalidState(signatureTamperedState)
    }

    @Test
    fun `expired malformed and base64 invalid state fall back without exposing invite state`() {
        val expiredState = requireNotNull(returnState.signReturnTarget("/app", EXPIRED_AT))

        listOf(
            expiredState,
            "not-a-state",
            "***.${VALID_EXPIRY.epochSecond}.invalid-signature",
        ).forEach(::assertInvalidState)
    }

    @Test
    fun `unsafe return targets are rejected before signing`() {
        listOf(
            "//external.example/app",
            "/\\external.example/app",
            "https://user@app.example.test/app",
            "ftp://app.example.test/app",
            "https://external.example/app",
            "https://inactive-club.example.test/app",
        ).forEach { unsafeTarget ->
            assertNull(returnState.signReturnTarget(unsafeTarget, VALID_EXPIRY))
        }
    }

    @Test
    fun `app preview and active club hosts round trip through signed state`() {
        listOf(
            "$APP_ORIGIN/app",
            "https://readmates.pages.dev/app",
            "https://$ACTIVE_CLUB_HOST/app",
        ).forEach { trustedTarget ->
            val signedState = returnState.signReturnTarget(trustedTarget, VALID_EXPIRY)

            assertNotNull(signedState)
            assertEquals(trustedTarget, returnState.validatedReturnTarget(signedState))
        }
    }

    @Test
    fun `invite token and club mismatches return null`() {
        val scopedTarget = returnState.inviteReturnTarget(CLUB_SLUG, INVITE_TOKEN)
        val scopedState = requireNotNull(returnState.signReturnTarget(scopedTarget, VALID_EXPIRY))
        val clubHostTarget = "https://$ACTIVE_CLUB_HOST/invite/$INVITE_TOKEN"
        val clubHostState = requireNotNull(returnState.signReturnTarget(clubHostTarget, VALID_EXPIRY))

        assertEquals(CLUB_SLUG, returnState.inviteClubSlugFromReturnState(scopedState, INVITE_TOKEN))
        assertEquals(
            scopedTarget,
            returnState.inviteReturnTargetFromState(scopedState, CLUB_SLUG, INVITE_TOKEN),
        )
        assertNull(returnState.inviteClubSlugFromReturnState(scopedState, "wrong-invite"))
        assertNull(returnState.inviteReturnTargetFromState(scopedState, CLUB_SLUG, "wrong-invite"))
        assertNull(returnState.inviteReturnTargetFromState(scopedState, "other-club", INVITE_TOKEN))
        assertNull(returnState.inviteReturnTargetFromState(clubHostState, "other-club", INVITE_TOKEN))
    }

    private fun assertInvalidState(signedState: String) {
        assertEquals(
            OAuthReturnState.DEFAULT_RETURN_TARGET,
            returnState.validatedReturnTarget(signedState),
        )
        assertNull(returnState.inviteClubSlugFromReturnState(signedState, INVITE_TOKEN))
        assertNull(returnState.inviteReturnTargetFromState(signedState, CLUB_SLUG, INVITE_TOKEN))
    }

    companion object {
        private const val TEST_SECRET = "public-test-only-return-state-key"
        private const val APP_ORIGIN = "https://app.example.test"
        private const val COOKIE_DOMAIN = ".example.test"
        private const val CLUB_SLUG = "reading-club"
        private const val ACTIVE_CLUB_HOST = "$CLUB_SLUG.example.test"
        private const val INVITE_TOKEN = "test-invite"
        private val VALID_EXPIRY: Instant = Instant.parse("2099-01-01T00:00:00Z")
        private val EXPIRED_AT: Instant = Instant.parse("2000-01-01T00:00:00Z")
    }
}
