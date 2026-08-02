package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.security.ClientIpHashingProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class RateLimitFilterTest {
    private val testIpHashingProperties = ClientIpHashingProperties(baseSecret = "test-ip-hash-secret")

    @Test
    fun `does not rate limit when disabled`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter = RateLimitFilter(port, RateLimitProperties(enabled = false))
        val request = MockHttpServletRequest("GET", "/api/invitations/raw-token")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
        assertEquals(emptyList<RateLimitCheck>(), port.checks)
    }

    @Test
    fun `returns 429 when invitation preview is denied`() {
        val port = RecordingRateLimitPort(RateLimitDecision.denied(retryAfterSeconds = 60))
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )
        val request = MockHttpServletRequest("GET", "/api/invitations/raw-token")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(429, response.status)
        assertEquals("60", response.getHeader("Retry-After"))
        assertTrue(
            port.checks
                .single()
                .key
                .startsWith("rl:ip:"),
        )
        assertTrue(
            port.checks
                .single()
                .key
                .contains(":invite-preview:"),
        )
        assertFalse(
            port.checks
                .single()
                .key
                .contains("raw-token"),
        )
        assertFalse(response.contentAsString.contains("raw-token"))
        assertFalse(response.contentAsString.contains("rl:"))
    }

    @Test
    fun `rate limits club scoped invitation endpoints without leaking slug or token`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )

        filter.doFilter(
            MockHttpServletRequest("GET", "/api/clubs/reading-sai/invitations/raw-token"),
            MockHttpServletResponse(),
            MockFilterChain(),
        )
        filter.doFilter(
            MockHttpServletRequest("POST", "/api/clubs/reading-sai/invitations/raw-token/accept"),
            MockHttpServletResponse(),
            MockFilterChain(),
        )

        assertEquals(2, port.checks.size)
        assertTrue(port.checks[0].key.contains(":invite-preview:"))
        assertTrue(port.checks[1].key.contains(":invite-accept:"))
        assertFalse(port.checks.any { it.key.contains("reading-sai") })
        assertFalse(port.checks.any { it.key.contains("raw-token") })
    }

    @Test
    fun `guest browse is rate limited by hashed ip and club`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )
        val request =
            MockHttpServletRequest("GET", "/api/public/clubs/reading-sai/browse/archive").apply {
                remoteAddr = "203.0.113.10"
            }

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        val check = port.checks.single()
        assertEquals(120, check.limit)
        assertEquals(java.time.Duration.ofMinutes(1), check.window)
        assertTrue(check.key.startsWith("rl:ip:"))
        assertTrue(check.key.contains(":guest-browse:"))
        assertFalse(check.key.contains("203.0.113.10"))
        assertFalse(check.key.contains("reading-sai"))
        assertFalse(check.sensitive)
    }

    @Test
    fun `guest browse rate limit isolates clubs without exposing either slug`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )

        listOf("reading-sai", "other-books").forEach { slug ->
            filter.doFilter(
                MockHttpServletRequest("GET", "/api/public/clubs/$slug/browse"),
                MockHttpServletResponse(),
                MockFilterChain(),
            )
        }

        val distinctKeys =
            port.checks
                .map { it.key }
                .distinct()
        assertEquals(2, distinctKeys.size)
        assertFalse(port.checks.any { it.key.contains("reading-sai") || it.key.contains("other-books") })
    }

    @Test
    fun `invalid plain guest browse slugs are rejected without reaching rate limit storage`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )

        listOf("Reading-sai", "reading_sai", "a".repeat(41)).forEach { invalidSlug ->
            val response = MockHttpServletResponse()

            filter.doFilter(
                MockHttpServletRequest("GET", "/api/public/clubs/$invalidSlug/browse/archive"),
                response,
                MockFilterChain(),
            )

            assertInvalidGuestBrowseResponse(response, invalidSlug)
        }

        assertTrue(port.checks.isEmpty())
    }

    @Test
    fun `encoded guest browse slug is rejected without exposing the raw segment`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )
        val invalidSlug = "reading-sai%2Foutside"
        val response = MockHttpServletResponse()

        filter.doFilter(
            MockHttpServletRequest("GET", "/api/public/clubs/$invalidSlug/browse/archive"),
            response,
            MockFilterChain(),
        )

        assertInvalidGuestBrowseResponse(response, invalidSlug)
        assertTrue(port.checks.isEmpty())
    }

    @Test
    fun `denied guest browse response is no-store and public safe`() {
        val port = RecordingRateLimitPort(RateLimitDecision.denied(retryAfterSeconds = 60))
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                ipHashingProperties = testIpHashingProperties,
            )
        val request =
            MockHttpServletRequest("GET", "/api/public/clubs/reading-sai/browse/archive").apply {
                remoteAddr = "203.0.113.10"
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(429, response.status)
        assertEquals("60", response.getHeader("Retry-After"))
        assertEquals("no-store", response.getHeader("Cache-Control"))
        assertNoSensitiveVary(response)
        assertEquals("""{"code":"RATE_LIMITED","message":"Too many requests"}""", response.contentAsString)
        assertFalse(response.contentAsString.contains("reading-sai"))
        assertFalse(response.contentAsString.contains("203.0.113.10"))
        assertFalse(response.contentAsString.contains("rl:"))
    }

    @Test
    fun `uses trusted bff client ip header for anonymous rate limit key`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                legacyExpectedBffSecret = "test-bff-secret",
                ipHashingProperties = testIpHashingProperties,
            )
        val firstRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("X-Readmates-Client-IP", "203.0.113.10")
            }
        val secondRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("X-Readmates-Client-IP", "203.0.113.20")
            }

        filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
        filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

        val keys = port.checks.map { it.key }
        assertEquals(2, keys.distinct().size)
        assertFalse(keys.any { it.contains("203.0.113") })
    }

    @Test
    fun `ignores client ip header when bff secret is missing or wrong`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                legacyExpectedBffSecret = "test-bff-secret",
                ipHashingProperties = testIpHashingProperties,
            )
        val missingSecretRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Client-IP", "203.0.113.10")
            }
        val wrongSecretRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "wrong-secret")
                addHeader("X-Readmates-Client-IP", "203.0.113.20")
            }

        filter.doFilter(missingSecretRequest, MockHttpServletResponse(), MockFilterChain())
        filter.doFilter(wrongSecretRequest, MockHttpServletResponse(), MockFilterChain())

        val keys = port.checks.map { it.key }
        assertEquals(1, keys.distinct().size)
        assertFalse(keys.any { it.contains("203.0.113") })
        assertFalse(keys.any { it.contains("198.51.100.10") })
    }

    @Test
    fun `uses configured primary bff secret for trusted client ip header`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                legacyExpectedBffSecret = "",
                ipHashingProperties = testIpHashingProperties,
                configuredBffSecretsRaw = "primary-bff-test,secondary-bff-test",
            )
        val firstRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "primary-bff-test")
                addHeader("X-Readmates-Client-IP", "203.0.113.10")
            }
        val secondRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "primary-bff-test")
                addHeader("X-Readmates-Client-IP", "203.0.113.20")
            }

        filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
        filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

        val keys = port.checks.map { it.key }
        assertEquals(2, keys.distinct().size)
        assertFalse(keys.any { it.contains("203.0.113") })
    }

    @Test
    fun `uses configured secondary bff secret for trusted client ip header`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                legacyExpectedBffSecret = "",
                ipHashingProperties = testIpHashingProperties,
                configuredBffSecretsRaw = "primary-bff-test,secondary-bff-test",
            )
        val firstRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "secondary-bff-test")
                addHeader("X-Readmates-Client-IP", "203.0.113.10")
            }
        val secondRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "secondary-bff-test")
                addHeader("X-Readmates-Client-IP", "203.0.113.20")
            }

        filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
        filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

        val keys = port.checks.map { it.key }
        assertEquals(2, keys.distinct().size)
        assertFalse(keys.any { it.contains("203.0.113") })
    }

    @Test
    fun `configured bff secret list takes priority over legacy bff secret`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter =
            RateLimitFilter(
                rateLimitPort = port,
                properties = RateLimitProperties(enabled = true),
                legacyExpectedBffSecret = "legacy-bff-test",
                ipHashingProperties = testIpHashingProperties,
                configuredBffSecretsRaw = "primary-bff-test",
            )
        val firstRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "legacy-bff-test")
                addHeader("X-Readmates-Client-IP", "203.0.113.10")
            }
        val secondRequest =
            invitationPreviewRequest("raw-token").apply {
                remoteAddr = "198.51.100.10"
                addHeader("X-Readmates-Bff-Secret", "legacy-bff-test")
                addHeader("X-Readmates-Client-IP", "203.0.113.20")
            }

        filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
        filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

        val keys = port.checks.map { it.key }
        assertEquals(1, keys.distinct().size)
        assertFalse(keys.any { it.contains("203.0.113") })
    }

    private fun invitationPreviewRequest(token: String) = MockHttpServletRequest("GET", "/api/invitations/$token")

    private fun assertInvalidGuestBrowseResponse(
        response: MockHttpServletResponse,
        rawSlug: String,
    ) {
        assertEquals(400, response.status)
        assertEquals("application/json", response.contentType)
        assertEquals("no-store", response.getHeader("Cache-Control"))
        assertNoSensitiveVary(response)
        assertEquals("""{"code":"INVALID_REQUEST","message":"Invalid request"}""", response.contentAsString)
        assertFalse(response.contentAsString.contains(rawSlug))
        assertFalse(response.contentAsString.contains("rl:"))
    }

    private fun assertNoSensitiveVary(response: MockHttpServletResponse) {
        val varyTokens =
            response
                .getHeaders("Vary")
                .flatMap { it.split(',') }
                .map { it.trim().lowercase() }
        assertFalse("cookie" in varyTokens)
        assertFalse("authorization" in varyTokens)
    }

    private class RecordingRateLimitPort(
        private val decision: RateLimitDecision,
    ) : RateLimitPort {
        val checks = mutableListOf<RateLimitCheck>()

        override fun check(check: RateLimitCheck): RateLimitDecision {
            checks += check
            return decision
        }
    }
}
