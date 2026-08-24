package com.readmates.auth.api

import com.readmates.auth.adapter.`in`.web.PlatformAdminCapabilitiesController
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
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
import tools.jackson.databind.json.JsonMapper
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class PlatformAdminCapabilitiesControllerTest {
    private val objectMapper = JsonMapper.builder().findAndAddModules().build()
    private val clock = Clock.fixed(GENERATED_AT, ZoneOffset.UTC)

    @Test
    fun `owner projection is schema v1 active utc no-store sorted allowlist`() {
        val body = getCapabilities(PlatformAdminRole.OWNER)

        assertContractMetadata(body)
        assertThat(capabilitiesOf(body)).containsExactly(*OWNER_CAPABILITIES)
        assertThat(capabilitiesOf(body)).doesNotHaveDuplicates()
        assertThat(capabilitiesOf(body)).isSortedAccordingTo(declarationOrder)
        assertNoHostOrMemberAuthorities(body)
    }

    @Test
    fun `operator projection is the exact operational allowlist`() {
        val body = getCapabilities(PlatformAdminRole.OPERATOR)

        assertContractMetadata(body)
        assertThat(jsonText(body, "role")).isEqualTo("OPERATOR")
        assertThat(capabilitiesOf(body)).containsExactly(*OPERATOR_CAPABILITIES)
        assertThat(capabilitiesOf(body)).doesNotHaveDuplicates()
        assertThat(capabilitiesOf(body)).isSortedAccordingTo(declarationOrder)
        assertNoHostOrMemberAuthorities(body)
    }

    @Test
    fun `support projection is view-only`() {
        val body = getCapabilities(PlatformAdminRole.SUPPORT)

        assertContractMetadata(body)
        assertThat(jsonText(body, "role")).isEqualTo("SUPPORT")
        assertThat(capabilitiesOf(body)).containsExactly(*SUPPORT_CAPABILITIES)
        assertThat(capabilitiesOf(body)).doesNotHaveDuplicates()
        assertThat(capabilitiesOf(body)).isSortedAccordingTo(declarationOrder)
        assertThat(capabilitiesOf(body)).doesNotContain(
            "REPLAY_NOTIFICATIONS",
            "MANAGE_AI_OPERATIONS",
            "VIEW_SENSITIVE_AUDIT",
            "EXPORT_ANALYTICS",
            "CREATE_CLUB",
            "MANAGE_CLUBS",
            "MANAGE_CLUB_DOMAINS",
            "MANAGE_SUPPORT_ACCESS",
            "MANAGE_PLATFORM_ADMINS",
        )
        assertNoHostOrMemberAuthorities(body)
    }

    @Test
    fun `non-platform-admin caller receives 403 from the permission gate`() {
        val mockMvc =
            MockMvcBuilders
                .standaloneSetup(PlatformAdminCapabilitiesController(clock))
                .setCustomArgumentResolvers(ForbiddenCurrentPlatformAdminResolver)
                .build()

        mockMvc
            .get("/api/admin/capabilities")
            .andExpect {
                status { isForbidden() }
            }
    }

    private fun getCapabilities(role: PlatformAdminRole): String {
        val admin =
            CurrentPlatformAdmin(
                userId = ADMIN_USER_ID,
                email = ADMIN_EMAIL,
                role = role,
            )
        val mockMvc = mockMvc(admin)
        val result =
            mockMvc
                .get("/api/admin/capabilities")
                .andExpect {
                    status { isOk() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$.schemaVersion") { value(1) }
                    jsonPath("$.status") { value("ACTIVE") }
                    jsonPath("$.role") { value(role.name) }
                    jsonPath("$.generatedAt") { value(GENERATED_AT_JSON) }
                }.andReturn()
        return result.response.contentAsString
    }

    private fun mockMvc(admin: CurrentPlatformAdmin): MockMvc =
        MockMvcBuilders
            .standaloneSetup(PlatformAdminCapabilitiesController(clock))
            .setCustomArgumentResolvers(StubCurrentPlatformAdminResolver(admin))
            .build()

    private fun assertContractMetadata(body: String) {
        val json = objectMapper.readTree(body)
        assertThat(json.get("schemaVersion").intValue()).isEqualTo(1)
        assertThat(json.get("status").stringValue()).isEqualTo("ACTIVE")
        val generatedAt = OffsetDateTime.parse(json.get("generatedAt").stringValue())
        assertThat(generatedAt.offset).isEqualTo(ZoneOffset.UTC)
        assertThat(json.get("generatedAt").stringValue()).endsWith("Z")
        assertThat(json.get("generatedAt").stringValue()).isEqualTo(GENERATED_AT_JSON)
    }

    private fun assertNoHostOrMemberAuthorities(body: String) {
        assertThat(capabilitiesOf(body))
            .doesNotContainAnyElementsOf(ClubCapability.entries.map { it.name })
            .doesNotContain(
                "ROLE_HOST",
                "ROLE_MEMBER",
                "ROLE_VIEWER",
                "MANAGE_MEMBERS",
                "MANAGE_INVITATIONS",
                "BROWSE_MEMBER_CONTENT",
            )
    }

    private fun capabilitiesOf(body: String): List<String> {
        val node = objectMapper.readTree(body).get("capabilities")
        return (0 until node.size()).map { index -> node.get(index).stringValue() }
    }

    private fun jsonText(
        body: String,
        field: String,
    ): String = objectMapper.readTree(body).get(field).stringValue()

    private class StubCurrentPlatformAdminResolver(
        private val admin: CurrentPlatformAdmin,
    ) : HandlerMethodArgumentResolver {
        override fun supportsParameter(parameter: MethodParameter): Boolean = isAdminParam(parameter)

        override fun resolveArgument(
            parameter: MethodParameter,
            mavContainer: ModelAndViewContainer?,
            webRequest: NativeWebRequest,
            binderFactory: WebDataBinderFactory?,
        ): CurrentPlatformAdmin = admin
    }

    private object ForbiddenCurrentPlatformAdminResolver : HandlerMethodArgumentResolver {
        override fun supportsParameter(parameter: MethodParameter): Boolean = isAdminParam(parameter)

        override fun resolveArgument(
            parameter: MethodParameter,
            mavContainer: ModelAndViewContainer?,
            webRequest: NativeWebRequest,
            binderFactory: WebDataBinderFactory?,
        ): CurrentPlatformAdmin = throw ResponseStatusException(HttpStatus.FORBIDDEN)
    }

    private companion object {
        val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        const val ADMIN_EMAIL = "admin@example.com"
        val GENERATED_AT: Instant = Instant.parse("2026-08-22T00:00:00Z")
        const val GENERATED_AT_JSON = "2026-08-22T00:00:00Z"
        val OWNER_CAPABILITIES =
            arrayOf(
                "VIEW_TODAY",
                "VIEW_CLUBS",
                "VIEW_CLUB_OPERATIONS",
                "VIEW_SERVICE_HEALTH",
                "VIEW_NOTIFICATION_OPERATIONS",
                "REPLAY_NOTIFICATIONS",
                "VIEW_AI_OPERATIONS",
                "MANAGE_AI_OPERATIONS",
                "VIEW_SUPPORT",
                "MANAGE_SUPPORT_ACCESS",
                "VIEW_AUDIT",
                "VIEW_SENSITIVE_AUDIT",
                "VIEW_ANALYTICS",
                "EXPORT_ANALYTICS",
                "CREATE_CLUB",
                "MANAGE_CLUBS",
                "MANAGE_CLUB_DOMAINS",
                "MANAGE_PLATFORM_ADMINS",
                "EMERGENCY_PUBLIC_TAKEDOWN",
            )
        val OPERATOR_CAPABILITIES =
            arrayOf(
                "VIEW_TODAY",
                "VIEW_CLUBS",
                "VIEW_CLUB_OPERATIONS",
                "VIEW_SERVICE_HEALTH",
                "VIEW_NOTIFICATION_OPERATIONS",
                "REPLAY_NOTIFICATIONS",
                "VIEW_AI_OPERATIONS",
                "MANAGE_AI_OPERATIONS",
                "VIEW_SUPPORT",
                "VIEW_AUDIT",
                "VIEW_SENSITIVE_AUDIT",
                "VIEW_ANALYTICS",
                "EXPORT_ANALYTICS",
                "CREATE_CLUB",
                "MANAGE_CLUBS",
                "MANAGE_CLUB_DOMAINS",
                "EMERGENCY_PUBLIC_TAKEDOWN",
            )
        val SUPPORT_CAPABILITIES =
            arrayOf(
                "VIEW_TODAY",
                "VIEW_CLUBS",
                "VIEW_CLUB_OPERATIONS",
                "VIEW_SERVICE_HEALTH",
                "VIEW_NOTIFICATION_OPERATIONS",
                "VIEW_AI_OPERATIONS",
                "VIEW_SUPPORT",
                "VIEW_AUDIT",
                "VIEW_ANALYTICS",
            )
        val declarationOrder: Comparator<String> =
            Comparator.comparingInt { name -> PlatformCapability.valueOf(name).ordinal }
    }
}

private fun isAdminParam(p: MethodParameter): Boolean = p.parameterType == CurrentPlatformAdmin::class.java
