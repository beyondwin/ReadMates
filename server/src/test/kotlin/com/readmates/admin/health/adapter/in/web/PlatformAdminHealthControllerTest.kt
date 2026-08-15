@file:Suppress("MaxLineLength")

package com.readmates.admin.health.adapter.`in`.web

import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.model.PlatformHealthRefreshState
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import com.readmates.admin.health.application.model.PlatformHealthView
import com.readmates.admin.health.application.port.`in`.ReadPlatformAdminHealthUseCase
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.HttpStatus
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

class PlatformAdminHealthControllerTest {
    private val now: Instant = Instant.parse("2026-05-26T00:00:00Z")
    private val ownerAdmin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            email = "owner@example.com",
            role = PlatformAdminRole.OWNER,
        )

    @Test
    fun `snapshot returns additive refresh metadata with schema generatedAt and all provider cards`() {
        val readUseCase = stubReadUseCase(deployAttemptsCard(), aiProviderCard())
        val mockMvc = buildMockMvc(readUseCase, StubCurrentPlatformAdminResolver(ownerAdmin))

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isOk() }
                jsonPath("$.schema") { value(PlatformHealthSnapshot.SCHEMA) }
                jsonPath("$.generatedAt") { value("2026-05-26T00:00:00Z") }
                jsonPath("$.cards.length()") { value(2) }
                jsonPath("$.cards[0].id") { value("deploy_attempts_strip") }
                jsonPath("$.cards[0].status") { value("OK") }
                jsonPath("$.cards[0].source") { value("FILE") }
                jsonPath("$.cards[0].lastCheckedAt") { value("2026-05-26T00:00:00Z") }
                jsonPath("$.cards[0].deployStrip[0].attemptId") { value("deploy-dev-001") }
                jsonPath("$.cards[0].deployStrip[0].finalStatus") { value("SUCCEEDED") }
                jsonPath("$.cards[0].deployStrip[0].imageTag") { value("readmates-api:dev-20260526") }
                jsonPath("$.cards[0].drill") { doesNotExist() }
                jsonPath("$.cards[1].id") { value("ai_provider_availability") }
                jsonPath("$.cards[1].status") { value("WARN") }
                jsonPath("$.cards[1].drill.kind") { value("ADMIN_ROUTE") }
                jsonPath("$.cards[1].drill.target") { value("/admin/ai-ops") }
                jsonPath("$.lastSuccessfulAt") { value("2026-05-26T00:00:00Z") }
                jsonPath("$.refreshState") { value("FRESH") }
                jsonPath("$.staleAgeSeconds") { value(0) }
            }
    }

    @Test
    fun `stale response preserves deterministic age and last successful time`() {
        val view =
            healthView(
                cards = listOf(deployAttemptsCard(), aiProviderCard()),
                lastSuccessfulAt = now.minusSeconds(125),
                refreshState = PlatformHealthRefreshState.STALE,
                staleAgeSeconds = 125,
            )
        val mockMvc = buildMockMvc(ReadPlatformAdminHealthUseCase { view }, StubCurrentPlatformAdminResolver(ownerAdmin))

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isOk() }
                jsonPath("$.schema") { value(PlatformHealthSnapshot.SCHEMA) }
                jsonPath("$.generatedAt") { value("2026-05-26T00:00:00Z") }
                jsonPath("$.cards.length()") { value(2) }
                jsonPath("$.lastSuccessfulAt") { value("2026-05-25T23:57:55Z") }
                jsonPath("$.refreshState") { value("STALE") }
                jsonPath("$.staleAgeSeconds") { value(125) }
            }
    }

    @Test
    fun `unavailable response serializes null last success and deterministic age`() {
        val view =
            healthView(
                cards = listOf(aiProviderCard().copy(status = HealthCardStatus.UNKNOWN, reason = "provider_timeout")),
                lastSuccessfulAt = null,
                refreshState = PlatformHealthRefreshState.UNAVAILABLE,
                staleAgeSeconds = 0,
            )
        val mockMvc = buildMockMvc(ReadPlatformAdminHealthUseCase { view }, StubCurrentPlatformAdminResolver(ownerAdmin))

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isOk() }
                content { string(containsString("\"lastSuccessfulAt\":null")) }
                jsonPath("$.refreshState") { value("UNAVAILABLE") }
                jsonPath("$.staleAgeSeconds") { value(0) }
            }
    }

    private fun stubReadUseCase(vararg cards: HealthCard): ReadPlatformAdminHealthUseCase =
        ReadPlatformAdminHealthUseCase { healthView(cards.toList()) }

    private fun healthView(
        cards: List<HealthCard>,
        lastSuccessfulAt: Instant? = now,
        refreshState: PlatformHealthRefreshState = PlatformHealthRefreshState.FRESH,
        staleAgeSeconds: Long = 0,
    ): PlatformHealthView =
        PlatformHealthView(
            snapshot =
                PlatformHealthSnapshot(
                    schema = PlatformHealthSnapshot.SCHEMA,
                    generatedAt = now,
                    cards = cards,
                ),
            lastSuccessfulAt = lastSuccessfulAt,
            refreshState = refreshState,
            staleAgeSeconds = staleAgeSeconds,
        )

    private fun deployAttemptsCard(): HealthCard =
        HealthCard(
            id = "deploy_attempts_strip",
            title = "Deploy attempts",
            status = HealthCardStatus.OK,
            metric = null,
            thresholds = null,
            lastCheckedAt = now,
            source = HealthCardSource.FILE,
            drill = null,
            reason = null,
            deployStrip =
                listOf(
                    DeployAttemptStripEntry(
                        attemptId = "deploy-dev-001",
                        startedAt = now,
                        endedAt = now.plusSeconds(120),
                        finalStatus = DeployAttemptFinalStatus.SUCCEEDED,
                        imageTag = "readmates-api:dev-20260526",
                        durationSeconds = 120,
                    ),
                ),
        )

    private fun aiProviderCard(): HealthCard =
        HealthCard(
            id = "ai_provider_availability",
            title = "AI",
            status = HealthCardStatus.WARN,
            metric = HealthCardMetric(value = 0.97, unit = "ratio", label = "min"),
            thresholds = HealthCardThresholds(warn = 0.99, crit = 0.95),
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = HealthCardDrill.AdminRoute("/admin/ai-ops"),
            reason = null,
        )

    @Test
    fun `provider throwing produces unknown card with provider_error reason in response`() {
        val readUseCase =
            stubReadUseCase(
                HealthCard(
                    id = "kafka_lag",
                    title = "kafka_lag",
                    status = HealthCardStatus.UNKNOWN,
                    metric = null,
                    thresholds = null,
                    lastCheckedAt = now,
                    source = HealthCardSource.IN_PROCESS,
                    drill = null,
                    reason = "provider_error",
                ),
                HealthCard(
                    id = "redis",
                    title = "Redis",
                    status = HealthCardStatus.OK,
                    metric = null,
                    thresholds = null,
                    lastCheckedAt = now,
                    source = HealthCardSource.IN_PROCESS,
                    drill = null,
                    reason = null,
                ),
            )
        val mockMvc = buildMockMvc(readUseCase, StubCurrentPlatformAdminResolver(ownerAdmin))

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isOk() }
                jsonPath("$.cards.length()") { value(2) }
                jsonPath("$.cards[0].id") { value("kafka_lag") }
                jsonPath("$.cards[0].status") { value("UNKNOWN") }
                jsonPath("$.cards[0].reason") { value("provider_error") }
                jsonPath("$.cards[1].id") { value("redis") }
                jsonPath("$.cards[1].status") { value("OK") }
            }
    }

    @Test
    fun `non-platform-admin caller receives 403 from the permission gate`() {
        val mockMvc = buildMockMvc(stubReadUseCase(), ForbiddenCurrentPlatformAdminResolver())

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isForbidden() }
            }
    }

    private fun buildMockMvc(
        readUseCase: ReadPlatformAdminHealthUseCase,
        adminResolver: HandlerMethodArgumentResolver,
    ): MockMvc =
        MockMvcBuilders
            .standaloneSetup(PlatformAdminHealthController(readUseCase))
            .setCustomArgumentResolvers(adminResolver)
            .build()
}

private class StubCurrentPlatformAdminResolver(
    private val admin: CurrentPlatformAdmin,
) : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.parameterType == CurrentPlatformAdmin::class.java

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any = admin
}

private class ForbiddenCurrentPlatformAdminResolver : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.parameterType == CurrentPlatformAdmin::class.java

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Any = throw ResponseStatusException(HttpStatus.FORBIDDEN)
}
