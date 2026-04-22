package com.readmates.auth.infrastructure.security

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class BffSecretFilterUnitTest {
    @Test
    fun `blank bff secret fails at startup by default without active profile`() {
        assertThrows(IllegalStateException::class.java) {
            BffSecretFilter("")
        }
    }

    @Test
    fun `prod profile rejects blank bff secret at startup`() {
        val environment = mockEnvironment("prod")

        assertThrows(IllegalStateException::class.java) {
            BffSecretFilter("   ", environment)
        }
    }

    @Test
    fun `production profile rejects blank bff secret at startup`() {
        val environment = mockEnvironment("production")

        assertThrows(IllegalStateException::class.java) {
            BffSecretFilter("", environment)
        }
    }

    @Test
    fun `blank bff secret remains allowed when explicitly optional`() {
        val environment = mockEnvironment("dev")

        assertDoesNotThrow {
            BffSecretFilter(" ", environment, bffSecretRequired = false)
        }
    }

    @Test
    fun `blank dev secret lets api requests pass through`() {
        val filter = BffSecretFilter(" ", bffSecretRequired = false)
        val request = MockHttpServletRequest("GET", "/api/auth/me")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `configured secret is trimmed before comparison`() {
        val filter = BffSecretFilter(" test-bff-secret ")
        val request = MockHttpServletRequest("GET", "/api/auth/me")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()
        request.addHeader("X-Readmates-Bff-Secret", "test-bff-secret")

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `app base url is the allowed origin fallback`() {
        val filter = BffSecretFilter(
            expectedSecret = "test-bff-secret",
            appBaseUrl = "http://localhost:3000/app",
        )
        val request = MockHttpServletRequest("POST", "/api/auth/logout")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()
        request.addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
        request.addHeader("Origin", "http://localhost:3000")

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    private fun mockEnvironment(vararg activeProfiles: String) =
        MockEnvironment().apply {
            setActiveProfiles(*activeProfiles)
        }
}
