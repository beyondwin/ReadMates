package com.readmates.auth.infrastructure.security

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.club.application.port.out.ActiveClubDomainPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

class BffSecretFilterUnitTest {
    @Test
    fun `blank bff secret fails at startup when required`() {
        assertThrows(IllegalStateException::class.java) {
            BffSecretFilter("", noopAllowedOriginPort(), bffSecretRequired = true)
        }
    }

    @Test
    fun `blank bff secret fails at startup when required with whitespace`() {
        assertThrows(IllegalStateException::class.java) {
            BffSecretFilter("   ", noopAllowedOriginPort(), bffSecretRequired = true)
        }
    }

    @Test
    fun `blank bff secret remains allowed when explicitly optional`() {
        assertDoesNotThrow {
            BffSecretFilter(" ", noopAllowedOriginPort(), bffSecretRequired = false)
        }
    }

    @Test
    fun `blank dev secret lets api requests pass through`() {
        val filter = BffSecretFilter(" ", noopAllowedOriginPort(), bffSecretRequired = false)
        val request = MockHttpServletRequest("GET", "/api/auth/me")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `configured secret is trimmed before comparison`() {
        val filter = BffSecretFilter(" test-bff-secret ", noopAllowedOriginPort(), bffSecretRequired = true)
        val request = MockHttpServletRequest("GET", "/api/auth/me")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()
        request.addHeader("X-Readmates-Bff-Secret", "test-bff-secret")

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `app base url is the allowed origin fallback`() {
        val allowedOriginPort = staticAllowedOriginPort(
            allowedOrigins = "",
            appBaseUrl = "http://localhost:3000/app",
        )
        val filter = BffSecretFilter(
            expectedSecret = "test-bff-secret",
            allowedOriginPort = allowedOriginPort,
            bffSecretRequired = true,
        )
        val request = MockHttpServletRequest("POST", "/api/auth/logout")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()
        request.addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
        request.addHeader("Origin", "http://localhost:3000")

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `missing bff secret rejection logs method path and client ip only`() {
        val filter = BffSecretFilter("test-bff-secret", noopAllowedOriginPort(), bffSecretRequired = true)
        val request = MockHttpServletRequest("GET", "/api/auth/me").apply {
            servletPath = "/api/auth/me"
            remoteAddr = "203.0.113.10"
        }
        val response = MockHttpServletResponse()

        captureLogs(BffSecretFilter::class.java).use { logs ->
            filter.doFilter(request, response, MockFilterChain())

            assertEquals(401, response.status)
            val event = logs.events.single()
            assertEquals(Level.WARN, event.level)
            assertEquals("BFF secret rejected method={} path={} clientIp={}", event.message)
            assertThat(event.argumentArray.toList()).containsExactly("GET", "/api/auth/me", "203.0.113.10")
            assertThat(event.formattedMessage)
                .doesNotContain("test-bff-secret")
                .doesNotContain("X-Readmates-Bff-Secret")
        }
    }

    @Test
    fun `forbidden mutating origin rejection logs method path and client ip only`() {
        val allowedOriginPort = staticAllowedOriginPort(
            allowedOrigins = "https://app.example.com",
            appBaseUrl = "http://localhost:3000",
        )
        val filter = BffSecretFilter(
            expectedSecret = "test-bff-secret",
            allowedOriginPort = allowedOriginPort,
            bffSecretRequired = true,
        )
        val request = MockHttpServletRequest("POST", "/api/auth/logout").apply {
            servletPath = "/api/auth/logout"
            remoteAddr = "203.0.113.11"
            addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
            addHeader("Origin", "https://evil.example.com")
        }
        val response = MockHttpServletResponse()

        captureLogs(BffSecretFilter::class.java).use { logs ->
            filter.doFilter(request, response, MockFilterChain())

            assertEquals(403, response.status)
            val event = logs.events.single()
            assertEquals(Level.WARN, event.level)
            assertEquals("BFF mutating origin rejected method={} path={} clientIp={}", event.message)
            assertThat(event.argumentArray.toList()).containsExactly("POST", "/api/auth/logout", "203.0.113.11")
            assertThat(event.formattedMessage)
                .doesNotContain("test-bff-secret")
                .doesNotContain("evil.example.com")
        }
    }

    private fun noopAllowedOriginPort(): AllowedOriginPort = object : AllowedOriginPort {
        override fun isAllowed(origin: String) = false
    }

    private fun staticAllowedOriginPort(allowedOrigins: String, appBaseUrl: String): AllowedOriginPort {
        val noopActiveClubDomainPort = object : ActiveClubDomainPort {
            override fun isActiveOrigin(origin: String) = false
        }
        return StaticAndClubDomainAllowedOriginAdapter(
            allowedOrigins = allowedOrigins,
            appBaseUrl = appBaseUrl,
            activeClubDomainPort = noopActiveClubDomainPort,
        )
    }
}

private class LogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private fun captureLogs(loggerClass: Class<*>): LogCapture {
    val logger = LoggerFactory.getLogger(loggerClass) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return LogCapture(logger, appender)
}
