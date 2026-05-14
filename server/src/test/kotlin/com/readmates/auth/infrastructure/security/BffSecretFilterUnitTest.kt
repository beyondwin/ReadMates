package com.readmates.auth.infrastructure.security

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.club.application.port.out.ActiveClubDomainPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
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
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        }
    }

    @Test
    fun `blank bff secret fails at startup when required with whitespace`() {
        assertThrows(IllegalStateException::class.java) {
            BffSecretFilter(
                configuredSecretsRaw = "   ",
                legacyExpectedSecret = "   ",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        }
    }

    @Test
    fun `blank bff secret remains allowed when explicitly optional`() {
        assertDoesNotThrow {
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = " ",
                bffSecretRequired = false,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        }
    }

    @Test
    fun `blank dev secret lets api requests pass through`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = " ",
                bffSecretRequired = false,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request = MockHttpServletRequest("GET", "/api/auth/me")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `configured secret is trimmed before comparison`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = " test-bff-secret ",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request = MockHttpServletRequest("GET", "/api/auth/me")
        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()
        request.addHeader("X-Readmates-Bff-Secret", "test-bff-secret")

        filter.doFilter(request, response, filterChain)

        assertEquals(200, response.status)
    }

    @Test
    fun `app base url is the allowed origin fallback`() {
        val allowedOriginPort =
            staticAllowedOriginPort(
                allowedOrigins = "",
                appBaseUrl = "http://localhost:3000/app",
            )
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort = allowedOriginPort,
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
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
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
        val allowedOriginPort =
            staticAllowedOriginPort(
                allowedOrigins = "https://app.example.com",
                appBaseUrl = "http://localhost:3000",
            )
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort = allowedOriginPort,
            )
        val request =
            MockHttpServletRequest("POST", "/api/auth/logout").apply {
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

    // --- New scenarios for REQ-R-003a-9 ---

    @Test
    fun `primary secret from secrets list passes`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "secret1,secret2",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "secret1")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `secondary secret from secrets list passes`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "secret1,secret2",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "secret2")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `unknown secret is rejected with 401`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "secret1,secret2",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "unknown-secret")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(401, response.status)
    }

    @Test
    fun `blank entries in comma-separated list are ignored`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = ",a,,b,",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "a")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `empty secrets with bff-secret-required false passes through`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "",
                bffSecretRequired = false,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `empty secrets with bff-secret-required true fails at startup with exact message`() {
        val ex =
            assertThrows(IllegalStateException::class.java) {
                BffSecretFilter(
                    configuredSecretsRaw = "",
                    legacyExpectedSecret = "",
                    bffSecretRequired = true,
                    allowedOriginPort = noopAllowedOriginPort(),
                )
            }
        assertEquals(
            "readmates.security.bff.secrets must contain at least one entry when readmates.bff-secret-required is true",
            ex.message,
        )
    }

    @Test
    fun `legacy single bff-secret backward compat returns 200`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "legacy-secret",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        val request =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "legacy-secret")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `configuredSecretsRaw takes priority over legacyExpectedSecret`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "primary-secret",
                legacyExpectedSecret = "legacy-secret",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        // primary secret works
        val requestPrimary =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "primary-secret")
            }
        val responsePrimary = MockHttpServletResponse()
        filter.doFilter(requestPrimary, responsePrimary, MockFilterChain())
        assertEquals(200, responsePrimary.status)

        // legacy secret does NOT work when configuredSecretsRaw is non-empty
        val requestLegacy =
            MockHttpServletRequest("GET", "/api/auth/me").apply {
                servletPath = "/api/auth/me"
                addHeader("X-Readmates-Bff-Secret", "legacy-secret")
            }
        val responseLegacy = MockHttpServletResponse()
        filter.doFilter(requestLegacy, responseLegacy, MockFilterChain())
        assertEquals(401, responseLegacy.status)
    }

    @Test
    fun `aliasFor returns primary for first configured secret`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "primary-bff-test,secondary-bff-test,tertiary-bff-test",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        assertEquals("primary", filter.aliasFor("primary-bff-test"))
    }

    @Test
    fun `aliasFor returns secondary for second configured secret`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "primary-bff-test,secondary-bff-test,tertiary-bff-test",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        assertEquals("secondary", filter.aliasFor("secondary-bff-test"))
    }

    @Test
    fun `aliasFor returns indexed alias for third or later configured secret`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "primary-bff-test,secondary-bff-test,tertiary-bff-test",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        assertEquals("index_2", filter.aliasFor("tertiary-bff-test"))
    }

    @Test
    fun `aliasFor returns null for unknown secret`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "primary-bff-test,secondary-bff-test",
                legacyExpectedSecret = "",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
            )
        assertEquals(null, filter.aliasFor("nope"))
    }

    private fun noopAllowedOriginPort(): AllowedOriginPort =
        object : AllowedOriginPort {
            override fun isAllowed(origin: String) = false
        }

    private fun staticAllowedOriginPort(
        allowedOrigins: String,
        appBaseUrl: String,
    ): AllowedOriginPort {
        val noopActiveClubDomainPort =
            object : ActiveClubDomainPort {
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
