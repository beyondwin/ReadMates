@file:Suppress("MaxLineLength")

package com.readmates.admin.health.adapter.`in`.web

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import com.readmates.admin.health.application.service.HealthCardProvider
import com.readmates.admin.health.application.service.PlatformAdminHealthService
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
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
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class PlatformAdminHealthControllerTest {
    private val now: Instant = Instant.parse("2026-05-26T00:00:00Z")
    private val clock: Clock = Clock.fixed(now, ZoneOffset.UTC)

    private val ownerAdmin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            email = "owner@example.com",
            role = PlatformAdminRole.OWNER,
        )

    @Test
    fun `snapshot returns schema generatedAt and all provider cards`() {
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        StaticCardProvider(
                            HealthCard(
                                id = "redis",
                                title = "Redis",
                                status = HealthCardStatus.OK,
                                metric = HealthCardMetric(value = 0.0, unit = "ms", label = "ping"),
                                thresholds = HealthCardThresholds(warn = 50.0, crit = 200.0),
                                lastCheckedAt = now,
                                source = HealthCardSource.IN_PROCESS,
                                drill = null,
                                reason = null,
                            ),
                        ),
                        StaticCardProvider(
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
                            ),
                        ),
                    ),
                clock = clock,
            )
        val mockMvc = buildMockMvc(service, StubCurrentPlatformAdminResolver(ownerAdmin))

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isOk() }
                jsonPath("$.schema") { value(PlatformHealthSnapshot.SCHEMA) }
                jsonPath("$.generatedAt") { value("2026-05-26T00:00:00Z") }
                jsonPath("$.cards.length()") { value(2) }
                jsonPath("$.cards[0].id") { value("redis") }
                jsonPath("$.cards[0].status") { value("OK") }
                jsonPath("$.cards[0].source") { value("IN_PROCESS") }
                jsonPath("$.cards[0].metric.value") { value(0.0) }
                jsonPath("$.cards[0].metric.unit") { value("ms") }
                jsonPath("$.cards[0].thresholds.warn") { value(50.0) }
                jsonPath("$.cards[0].drill") { doesNotExist() }
                jsonPath("$.cards[1].id") { value("ai_provider_availability") }
                jsonPath("$.cards[1].status") { value("WARN") }
                jsonPath("$.cards[1].drill.kind") { value("ADMIN_ROUTE") }
                jsonPath("$.cards[1].drill.target") { value("/admin/ai-ops") }
            }
    }

    @Test
    fun `provider throwing produces unknown card with provider_error reason in response`() {
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        ThrowingCardProvider("kafka_lag"),
                        StaticCardProvider(
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
                        ),
                    ),
                clock = clock,
            )
        val mockMvc = buildMockMvc(service, StubCurrentPlatformAdminResolver(ownerAdmin))

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
        val service = PlatformAdminHealthService(providers = emptyList(), clock = clock)
        val mockMvc = buildMockMvc(service, ForbiddenCurrentPlatformAdminResolver())

        mockMvc
            .get("/api/admin/health/snapshot")
            .andExpect {
                status { isForbidden() }
            }
    }

    private fun buildMockMvc(
        service: PlatformAdminHealthService,
        adminResolver: HandlerMethodArgumentResolver,
    ): MockMvc =
        MockMvcBuilders
            .standaloneSetup(PlatformAdminHealthController(service))
            .setCustomArgumentResolvers(adminResolver)
            .build()
}

private class StaticCardProvider(
    private val card: HealthCard,
) : HealthCardProvider {
    override val cardId: String = card.id

    override fun compute(): HealthCard = card
}

private class ThrowingCardProvider(
    override val cardId: String,
) : HealthCardProvider {
    override fun compute(): HealthCard = error("provider $cardId exploded")
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
