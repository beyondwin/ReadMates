package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.shared.cache.RateLimitProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class RateLimitFilterTest {
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
        val filter = RateLimitFilter(port, RateLimitProperties(enabled = true))
        val request = MockHttpServletRequest("GET", "/api/invitations/raw-token")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(429, response.status)
        assertEquals("60", response.getHeader("Retry-After"))
        assertTrue(port.checks.single().key.startsWith("rl:ip:"))
        assertTrue(port.checks.single().key.contains(":invite-preview:"))
        assertFalse(port.checks.single().key.contains("raw-token"))
        assertFalse(response.contentAsString.contains("raw-token"))
        assertFalse(response.contentAsString.contains("rl:"))
    }

    @Test
    fun `uses trusted bff client ip header for anonymous rate limit key`() {
        val port = RecordingRateLimitPort(RateLimitDecision.allowed())
        val filter = RateLimitFilter(port, RateLimitProperties(enabled = true), "test-bff-secret")
        val firstRequest = invitationPreviewRequest("raw-token").apply {
            remoteAddr = "198.51.100.10"
            addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
            addHeader("X-Readmates-Client-IP", "203.0.113.10")
        }
        val secondRequest = invitationPreviewRequest("raw-token").apply {
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
        val filter = RateLimitFilter(port, RateLimitProperties(enabled = true), "test-bff-secret")
        val missingSecretRequest = invitationPreviewRequest("raw-token").apply {
            remoteAddr = "198.51.100.10"
            addHeader("X-Readmates-Client-IP", "203.0.113.10")
        }
        val wrongSecretRequest = invitationPreviewRequest("raw-token").apply {
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

    private fun invitationPreviewRequest(token: String) =
        MockHttpServletRequest("GET", "/api/invitations/$token")

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
