@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.util.UUID

class PlatformAdminAiGenerationCapabilitiesControllerTest {
    @Test
    fun `returns disabled capability without invoking disabled AI Ops endpoints`() {
        val mockMvc = mockMvc(enabled = false)

        mockMvc
            .get("/api/admin/ai-generation/capabilities")
            .andExpect {
                status { isOk() }
                jsonPath("$.enabled") { value(false) }
            }
    }

    private fun mockMvc(enabled: Boolean): MockMvc =
        MockMvcBuilders
            .standaloneSetup(
                PlatformAdminAiGenerationCapabilitiesController(
                    AiGenerationProperties(enabled = enabled),
                ),
            ).setCustomArgumentResolvers(PlatformAdminResolver)
            .build()

    private object PlatformAdminResolver : HandlerMethodArgumentResolver {
        private val supportedType = CurrentPlatformAdmin::class.java

        override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.parameterType == supportedType

        override fun resolveArgument(
            parameter: MethodParameter,
            mavContainer: ModelAndViewContainer?,
            webRequest: NativeWebRequest,
            binderFactory: WebDataBinderFactory?,
        ): CurrentPlatformAdmin =
            CurrentPlatformAdmin(
                userId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                email = "owner@example.com",
                role = PlatformAdminRole.OWNER,
            )
    }
}
