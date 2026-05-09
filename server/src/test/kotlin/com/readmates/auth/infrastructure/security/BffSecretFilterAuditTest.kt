package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.auth.application.port.out.BffSecretRotationAuditPort
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference

class BffSecretFilterAuditTest {

    // AllowedOriginPort is a regular interface (NOT fun interface) — must use object literal
    private fun noopAllowedOriginPort(): AllowedOriginPort = object : AllowedOriginPort {
        override fun isAllowed(origin: String) = false
    }

    /**
     * Creates a BffSecretRotationAuditPort spy that records calls to recordUsage
     * and stores the alias in the provided AtomicReference.
     */
    private fun capturingAuditPort(capturedAlias: AtomicReference<String>): BffSecretRotationAuditPort =
        object : BffSecretRotationAuditPort {
            override fun recordUsage(secretAlias: String, clientIpHash: String?, requestPath: String?) {
                capturedAlias.set(secretAlias)
            }
        }

    @Test
    fun `successful match calls audit port once with correct alias`() {
        val capturedAlias = AtomicReference<String>()
        val filter = BffSecretFilter(
            configuredSecretsRaw = "secret1,secret2",
            legacyExpectedSecret = "",
            bffSecretRequired = true,
            allowedOriginPort = noopAllowedOriginPort(),
            ipHashBaseSecret = "test-base-secret",
            auditPort = capturingAuditPort(capturedAlias),
        )
        val request = MockHttpServletRequest("GET", "/api/auth/me").apply {
            servletPath = "/api/auth/me"
            remoteAddr = "127.0.0.1"
            addHeader(BffSecretFilter.BFF_SECRET_HEADER, "secret2")
        }

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        await().atMost(Duration.ofSeconds(2)).until { capturedAlias.get() != null }
        assertEquals("secondary", capturedAlias.get())
    }

    @Test
    fun `primary secret records primary alias`() {
        val capturedAlias = AtomicReference<String>()
        val filter = BffSecretFilter(
            configuredSecretsRaw = "secret1,secret2",
            legacyExpectedSecret = "",
            bffSecretRequired = true,
            allowedOriginPort = noopAllowedOriginPort(),
            ipHashBaseSecret = "",
            auditPort = capturingAuditPort(capturedAlias),
        )
        val request = MockHttpServletRequest("GET", "/api/something").apply {
            servletPath = "/api/something"
            addHeader(BffSecretFilter.BFF_SECRET_HEADER, "secret1")
        }

        filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

        await().atMost(Duration.ofSeconds(2)).until { capturedAlias.get() != null }
        assertEquals("primary", capturedAlias.get())
    }

    @Test
    fun `failed auth does not call audit port`() {
        val auditPort = Mockito.mock(BffSecretRotationAuditPort::class.java)
        val filter = BffSecretFilter(
            configuredSecretsRaw = "secret1",
            legacyExpectedSecret = "",
            bffSecretRequired = true,
            allowedOriginPort = noopAllowedOriginPort(),
            ipHashBaseSecret = "",
            auditPort = auditPort,
        )
        val request = MockHttpServletRequest("GET", "/api/auth/me").apply {
            servletPath = "/api/auth/me"
            addHeader(BffSecretFilter.BFF_SECRET_HEADER, "wrong-secret")
        }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(401, response.status)
        // Give a short grace period, then verify no interaction
        Thread.sleep(100)
        Mockito.verifyNoInteractions(auditPort)
    }

    @Test
    fun `audit port exception does not affect response`() {
        val auditPort: BffSecretRotationAuditPort = object : BffSecretRotationAuditPort {
            override fun recordUsage(secretAlias: String, clientIpHash: String?, requestPath: String?) {
                throw RuntimeException("db down")
            }
        }
        val filter = BffSecretFilter(
            configuredSecretsRaw = "secret1",
            legacyExpectedSecret = "",
            bffSecretRequired = true,
            allowedOriginPort = noopAllowedOriginPort(),
            ipHashBaseSecret = "",
            auditPort = auditPort,
        )
        val request = MockHttpServletRequest("GET", "/api/auth/me").apply {
            servletPath = "/api/auth/me"
            addHeader(BffSecretFilter.BFF_SECRET_HEADER, "secret1")
        }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `no audit port bean - filter still works normally`() {
        val filter = BffSecretFilter(
            configuredSecretsRaw = "secret1",
            legacyExpectedSecret = "",
            bffSecretRequired = true,
            allowedOriginPort = noopAllowedOriginPort(),
            ipHashBaseSecret = "",
            auditPort = null,
        )
        val request = MockHttpServletRequest("GET", "/api/auth/me").apply {
            servletPath = "/api/auth/me"
            addHeader(BffSecretFilter.BFF_SECRET_HEADER, "secret1")
        }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }
}
