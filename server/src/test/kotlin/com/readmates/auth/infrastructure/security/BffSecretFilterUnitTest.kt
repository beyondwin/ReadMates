package com.readmates.auth.infrastructure.security

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.club.application.port.out.ActiveClubDomainPort
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import jakarta.servlet.FilterChain
import jakarta.servlet.ServletRequest
import jakarta.servlet.ServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.util.stream.Stream

@Suppress("LargeClass")
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

    @Test
    fun `required v2 client contract rejects legacy host mutation with problem response`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort =
                    staticAllowedOriginPort(
                        allowedOrigins = "https://app.example.com",
                        appBaseUrl = "http://localhost:3000",
                    ),
                hostClientContractProperties = HostClientContractProperties(required = true),
            )
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions/session-1/session-import/commit").apply {
                servletPath = "/api/host/sessions/session-1/session-import/commit"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("Origin", "https://app.example.com")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(409, response.status)
        assertThat(response.contentType).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE)
        assertThat(response.contentAsString)
            .contains("\"code\":\"HOST_CLIENT_UPGRADE_REQUIRED\"")
            .doesNotContain("session-1")
    }

    @Test
    fun `required v2 client contract accepts trusted host mutation`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort =
                    staticAllowedOriginPort(
                        allowedOrigins = "https://app.example.com",
                        appBaseUrl = "http://localhost:3000",
                    ),
                hostClientContractProperties = HostClientContractProperties(required = true),
            )
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions/session-1/session-import/commit").apply {
                servletPath = "/api/host/sessions/session-1/session-import/commit"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("X-Readmates-Client-Contract", "v2")
                addHeader("Origin", "https://app.example.com")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `invalid bff secret is rejected before host client contract`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort = noopAllowedOriginPort(),
                hostClientContractProperties = HostClientContractProperties(required = true),
            )
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions").apply {
                servletPath = "/api/host/sessions"
                addHeader("X-Readmates-Bff-Secret", "wrong-secret")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(401, response.status)
    }

    @Test
    fun `required v2 client contract does not block host reads or member mutations`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort =
                    staticAllowedOriginPort(
                        allowedOrigins = "https://app.example.com",
                        appBaseUrl = "http://localhost:3000",
                    ),
                hostClientContractProperties = HostClientContractProperties(required = true),
            )
        val hostRead =
            MockHttpServletRequest("GET", "/api/host/sessions").apply {
                servletPath = "/api/host/sessions"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
            }
        val memberMutation =
            MockHttpServletRequest("POST", "/api/sessions/current/rsvp").apply {
                servletPath = "/api/sessions/current/rsvp"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("Origin", "https://app.example.com")
            }

        val hostReadResponse = MockHttpServletResponse()
        val memberMutationResponse = MockHttpServletResponse()
        filter.doFilter(hostRead, hostReadResponse, MockFilterChain())
        filter.doFilter(memberMutation, memberMutationResponse, MockFilterChain())

        assertEquals(200, hostReadResponse.status)
        assertEquals(200, memberMutationResponse.status)
    }

    @Test
    fun `optional client contract keeps legacy host mutation compatible outside production`() {
        val filter =
            BffSecretFilter(
                configuredSecretsRaw = "",
                legacyExpectedSecret = "test-bff-secret",
                bffSecretRequired = true,
                allowedOriginPort =
                    staticAllowedOriginPort(
                        allowedOrigins = "https://app.example.com",
                        appBaseUrl = "http://localhost:3000",
                    ),
                hostClientContractProperties = HostClientContractProperties(required = false),
            )
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions/session-1/session-import/commit").apply {
                servletPath = "/api/host/sessions/session-1/session-import/commit"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("Origin", "https://app.example.com")
            }
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertEquals(200, response.status)
    }

    @Test
    fun `legacy required false maps to disabled and required true maps to v2 only`() {
        assertEquals(
            HostClientContractMode.DISABLED,
            HostClientContractProperties(required = false).effectiveMode(),
        )
        assertEquals(
            HostClientContractMode.V2_ONLY,
            HostClientContractProperties(required = true).effectiveMode(),
        )
        assertEquals(
            HostClientContractMode.V2_ONLY,
            HostClientContractProperties(required = true, mode = "  ").effectiveMode(),
        )
    }

    @Test
    fun `typed host client contract mode takes precedence over legacy required`() {
        assertEquals(
            HostClientContractMode.DISABLED,
            HostClientContractProperties(required = true, mode = "DISABLED").effectiveMode(),
        )
        assertEquals(
            HostClientContractMode.SUPPORT_V2_V3,
            HostClientContractProperties(required = false, mode = "SUPPORT_V2_V3").effectiveMode(),
        )
        assertEquals(
            HostClientContractMode.ENFORCE_V3,
            HostClientContractProperties(required = true, mode = "enforce_v3").effectiveMode(),
        )
    }

    @Test
    fun `unknown typed host client contract mode fails closed`() {
        val ex =
            assertThrows(IllegalStateException::class.java) {
                HostClientContractProperties(mode = "V4").effectiveMode()
            }
        assertThat(ex.message).contains("readmates.security.host-write-client-contract.mode")
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("hostClientContractMatrix")
    fun `host write client contract matrix`(case: HostClientContractCase) {
        val chain = InvocationTrackingFilterChain()
        val response = MockHttpServletResponse()

        hostFilter(case.mode).doFilter(hostMutation(case.header), response, chain)

        assertEquals(case.expectedStatus, response.status)
        assertEquals(case.chainInvoked, chain.invoked)
        if (case.expectedCode == null) {
            assertThat(response.contentAsString).isEmpty()
        } else {
            assertThat(response.contentType).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE)
            assertThat(response.contentAsString)
                .contains("\"code\":\"${case.expectedCode}\"")
                .contains("\"status\":${case.expectedStatus}")
                .doesNotContain("session-1")
                .doesNotContain("/api/host")
        }
    }

    @ParameterizedTest(name = "{0} keeps host reads and member mutations available")
    @MethodSource("allHostClientContractModes")
    fun `host client contract modes do not block host reads or member mutations`(mode: HostClientContractMode) {
        val filter = hostFilter(mode)
        val hostRead =
            MockHttpServletRequest("GET", "/api/host/sessions").apply {
                servletPath = "/api/host/sessions"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
            }
        val memberMutation =
            MockHttpServletRequest("POST", "/api/sessions/current/rsvp").apply {
                servletPath = "/api/sessions/current/rsvp"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("Origin", "https://app.example.com")
            }
        val hostReadResponse = MockHttpServletResponse()
        val memberMutationResponse = MockHttpServletResponse()
        val hostReadChain = InvocationTrackingFilterChain()
        val memberMutationChain = InvocationTrackingFilterChain()

        filter.doFilter(hostRead, hostReadResponse, hostReadChain)
        filter.doFilter(memberMutation, memberMutationResponse, memberMutationChain)

        assertEquals(200, hostReadResponse.status)
        assertEquals(200, memberMutationResponse.status)
        assertTrue(hostReadChain.invoked)
        assertTrue(memberMutationChain.invoked)
    }

    @Test
    fun `invalid bff secret is rejected before enforce v3 client contract`() {
        val chain = InvocationTrackingFilterChain()
        val response = MockHttpServletResponse()
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions").apply {
                servletPath = "/api/host/sessions"
                addHeader("X-Readmates-Bff-Secret", "wrong-secret")
                addHeader("X-Readmates-Client-Contract", "v2")
            }

        hostFilter(HostClientContractMode.ENFORCE_V3).doFilter(request, response, chain)

        assertEquals(401, response.status)
        assertFalse(chain.invoked)
        assertThat(response.contentAsString).doesNotContain("CLIENT_UPDATE_REQUIRED")
    }

    @Test
    fun `forbidden origin is rejected before support v2 v3 client contract`() {
        val chain = InvocationTrackingFilterChain()
        val response = MockHttpServletResponse()
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions").apply {
                servletPath = "/api/host/sessions"
                remoteAddr = "203.0.113.11"
                addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                addHeader("X-Readmates-Client-Contract", "v3")
                addHeader("Origin", "https://evil.example.com")
            }

        hostFilter(HostClientContractMode.SUPPORT_V2_V3).doFilter(request, response, chain)

        assertEquals(403, response.status)
        assertFalse(chain.invoked)
        assertThat(response.contentAsString).isEmpty()
    }

    @Test
    fun `support and enforce modes record bounded generation metrics`() {
        val registry = SimpleMeterRegistry()
        val support = hostFilter(HostClientContractMode.SUPPORT_V2_V3, registry)
        val enforce = hostFilter(HostClientContractMode.ENFORCE_V3, registry)

        support.doFilter(hostMutation("v2"), MockHttpServletResponse(), MockFilterChain())
        support.doFilter(hostMutation("v3"), MockHttpServletResponse(), MockFilterChain())
        support.doFilter(hostMutation(null), MockHttpServletResponse(), MockFilterChain())
        support.doFilter(hostMutation("v9"), MockHttpServletResponse(), MockFilterChain())
        enforce.doFilter(hostMutation("v2"), MockHttpServletResponse(), MockFilterChain())
        enforce.doFilter(hostMutation("v3"), MockHttpServletResponse(), MockFilterChain())

        assertEquals(1.0, hostContractCount(registry, "v2", "support"))
        assertEquals(1.0, hostContractCount(registry, "v3", "support"))
        assertEquals(1.0, hostContractCount(registry, "missing", "support"))
        assertEquals(1.0, hostContractCount(registry, "unknown", "support"))
        assertEquals(1.0, hostContractCount(registry, "v2", "enforce"))
        assertEquals(1.0, hostContractCount(registry, "v3", "enforce"))
        assertThat(registry.meters.filter { meter -> meter.id.name == HOST_CLIENT_CONTRACT_METRIC })
            .isNotEmpty
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.key } }.toSet())
            .containsExactlyInAnyOrder("generation", "mode")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.value } }.toSet())
            .containsExactlyInAnyOrder("v2", "v3", "missing", "unknown", "support", "enforce")
    }

    @Test
    fun `disabled and v2 only modes do not record residue metrics`() {
        val registry = SimpleMeterRegistry()

        hostFilter(HostClientContractMode.DISABLED, registry)
            .doFilter(hostMutation("v2"), MockHttpServletResponse(), MockFilterChain())
        hostFilter(HostClientContractMode.V2_ONLY, registry)
            .doFilter(hostMutation("v2"), MockHttpServletResponse(), MockFilterChain())
        hostFilter(HostClientContractMode.SUPPORT_V2_V3, registry)
            .doFilter(
                MockHttpServletRequest("GET", "/api/host/sessions").apply {
                    servletPath = "/api/host/sessions"
                    addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
                    addHeader("X-Readmates-Client-Contract", "v2")
                },
                MockHttpServletResponse(),
                MockFilterChain(),
            )

        assertThat(registry.find(HOST_CLIENT_CONTRACT_METRIC).meters()).isEmpty()
    }

    @Test
    fun `secret rejection does not record host client contract metrics`() {
        val registry = SimpleMeterRegistry()
        val request =
            MockHttpServletRequest("POST", "/api/host/sessions").apply {
                servletPath = "/api/host/sessions"
                addHeader("X-Readmates-Bff-Secret", "wrong-secret")
                addHeader("X-Readmates-Client-Contract", "v3")
            }

        hostFilter(HostClientContractMode.ENFORCE_V3, registry)
            .doFilter(request, MockHttpServletResponse(), MockFilterChain())

        assertThat(registry.find(HOST_CLIENT_CONTRACT_METRIC).meters()).isEmpty()
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

    private fun hostFilter(
        mode: HostClientContractMode,
        meterRegistry: SimpleMeterRegistry? = null,
    ): BffSecretFilter =
        BffSecretFilter(
            configuredSecretsRaw = "",
            legacyExpectedSecret = "test-bff-secret",
            bffSecretRequired = true,
            allowedOriginPort =
                staticAllowedOriginPort(
                    allowedOrigins = "https://app.example.com",
                    appBaseUrl = "http://localhost:3000",
                ),
            hostClientContractProperties = HostClientContractProperties(mode = mode.name),
            meterRegistry = meterRegistry,
        )

    private fun hostMutation(contract: String?): MockHttpServletRequest =
        MockHttpServletRequest("POST", "/api/host/sessions").apply {
            servletPath = "/api/host/sessions"
            addHeader("X-Readmates-Bff-Secret", "test-bff-secret")
            addHeader("Origin", "https://app.example.com")
            if (contract != null) {
                addHeader("X-Readmates-Client-Contract", contract)
            }
        }

    private fun hostContractCount(
        registry: SimpleMeterRegistry,
        generation: String,
        mode: String,
    ): Double =
        registry
            .find(HOST_CLIENT_CONTRACT_METRIC)
            .tag("generation", generation)
            .tag("mode", mode)
            .counter()
            ?.count() ?: 0.0

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

    companion object {
        private const val HOST_CLIENT_CONTRACT_METRIC = "readmates.host.client_contract"

        @JvmStatic
        fun allHostClientContractModes(): Stream<HostClientContractMode> = HostClientContractMode.entries.stream()

        @JvmStatic
        fun hostClientContractMatrix(): Stream<Arguments> {
            val upgrade = "HOST_CLIENT_UPGRADE_REQUIRED"
            val update = "CLIENT_UPDATE_REQUIRED"
            return listOf(
                HostClientContractCase(HostClientContractMode.DISABLED, null, 200, null, true),
                HostClientContractCase(HostClientContractMode.DISABLED, "v2", 200, null, true),
                HostClientContractCase(HostClientContractMode.DISABLED, "v3", 200, null, true),
                HostClientContractCase(HostClientContractMode.DISABLED, "v1", 200, null, true),
                HostClientContractCase(HostClientContractMode.V2_ONLY, "v2", 200, null, true),
                HostClientContractCase(HostClientContractMode.V2_ONLY, "v3", 409, upgrade, false),
                HostClientContractCase(HostClientContractMode.V2_ONLY, null, 409, upgrade, false),
                HostClientContractCase(HostClientContractMode.V2_ONLY, "v1", 409, upgrade, false),
                HostClientContractCase(HostClientContractMode.SUPPORT_V2_V3, "v2", 200, null, true),
                HostClientContractCase(HostClientContractMode.SUPPORT_V2_V3, "v3", 200, null, true),
                HostClientContractCase(HostClientContractMode.SUPPORT_V2_V3, null, 409, upgrade, false),
                HostClientContractCase(HostClientContractMode.SUPPORT_V2_V3, "v1", 409, upgrade, false),
                HostClientContractCase(HostClientContractMode.ENFORCE_V3, "v3", 200, null, true),
                HostClientContractCase(HostClientContractMode.ENFORCE_V3, "v2", 428, update, false),
                HostClientContractCase(HostClientContractMode.ENFORCE_V3, null, 428, update, false),
                HostClientContractCase(HostClientContractMode.ENFORCE_V3, "v1", 428, update, false),
            ).stream().map { case -> Arguments.of(case) }
        }
    }
}

data class HostClientContractCase(
    val mode: HostClientContractMode,
    val header: String?,
    val expectedStatus: Int,
    val expectedCode: String?,
    val chainInvoked: Boolean,
) {
    override fun toString(): String {
        val headerLabel = header ?: "missing"
        val outcome = if (chainInvoked) "allow" else expectedCode ?: expectedStatus.toString()
        return "${mode.name} header=$headerLabel $outcome"
    }
}

private class InvocationTrackingFilterChain : FilterChain {
    var invoked: Boolean = false
        private set

    override fun doFilter(
        request: ServletRequest?,
        response: ServletResponse?,
    ) {
        invoked = true
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
