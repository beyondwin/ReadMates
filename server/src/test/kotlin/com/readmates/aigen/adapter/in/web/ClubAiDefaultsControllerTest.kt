package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.`in`.ClubAiDefaultsView
import com.readmates.aigen.application.port.`in`.GetClubAiDefaultsUseCase
import com.readmates.aigen.application.port.`in`.UpdateClubAiDefaultsUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.MediaType
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.util.UUID

class ClubAiDefaultsControllerTest {
    private val clubSlug = "club-1"

    private val currentMember =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-0000000000b0"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-0000000000c0"),
            clubId = UUID.fromString("00000000-0000-0000-0000-0000000000a0"),
            clubSlug = clubSlug,
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private val getUseCase = FakeGetUseCase()
    private val updateUseCase = FakeUpdateUseCase()
    private val properties = AiGenerationProperties(enabled = true)

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        mockMvc = buildMockMvc(properties)
    }

    private fun buildMockMvc(props: AiGenerationProperties): MockMvc =
        MockMvcBuilders
            .standaloneSetup(
                ClubAiDefaultsController(
                    getUc = getUseCase,
                    updateUc = updateUseCase,
                    props = props,
                ),
            ).setControllerAdvice(AiGenerationErrorHandler())
            .setCustomArgumentResolvers(StubCurrentMemberResolver(currentMember))
            .build()

    @Test
    fun `GET returns 200 with defaultModel JSON when defaults exist`() {
        getUseCase.view = ClubAiDefaultsView(defaultModel = "claude-sonnet-4-6")

        mockMvc
            .get("/api/host/clubs/$clubSlug/ai-defaults") {
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.defaultModel") { value("claude-sonnet-4-6") }
            }
    }

    @Test
    fun `GET returns 200 with null defaultModel JSON when no row`() {
        getUseCase.view = ClubAiDefaultsView(defaultModel = null)

        mockMvc
            .get("/api/host/clubs/$clubSlug/ai-defaults") {
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.defaultModel") { value(null) }
            }
    }

    @Test
    fun `GET returns 503 AI_DISABLED when kill switch is off`() {
        mockMvc = buildMockMvc(AiGenerationProperties(enabled = false))

        mockMvc
            .get("/api/host/clubs/$clubSlug/ai-defaults") {
                with(authedUser())
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("AI_DISABLED") }
            }
    }

    @Test
    fun `PUT with valid body returns 200 and delegates to use case`() {
        mockMvc
            .put("/api/host/clubs/$clubSlug/ai-defaults") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"defaultModel":"claude-sonnet-4-6"}"""
                with(authedUser())
            }.andExpect {
                status { isOk() }
            }
        assert(updateUseCase.calls.size == 1) {
            "expected 1 update call, got ${updateUseCase.calls.size}"
        }
        val (slug, model) = updateUseCase.calls.single()
        assert(slug == clubSlug)
        assert(model == "claude-sonnet-4-6")
    }

    @Test
    fun `PUT with non-allowlisted model returns 503 AI_DISABLED`() {
        // Service-level rule: non-allowlisted models surface as AI_DISABLED
        // per spec; error handler maps that to 503.
        updateUseCase.error = AiGenerationException.Coded(ErrorCode.AI_DISABLED, "model not allowlisted")

        mockMvc
            .put("/api/host/clubs/$clubSlug/ai-defaults") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"defaultModel":"gpt-4o"}"""
                with(authedUser())
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("AI_DISABLED") }
            }
    }

    @Test
    fun `PUT returns 403 when access is denied`() {
        updateUseCase.error = AccessDeniedException("not host")

        mockMvc
            .put("/api/host/clubs/$clubSlug/ai-defaults") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"defaultModel":"claude-sonnet-4-6"}"""
                with(authedUser())
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("PERMISSION_DENIED") }
            }
    }

    @Test
    fun `PUT returns 503 AI_DISABLED when kill switch is off`() {
        mockMvc = buildMockMvc(AiGenerationProperties(enabled = false))

        mockMvc
            .put("/api/host/clubs/$clubSlug/ai-defaults") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"defaultModel":"claude-sonnet-4-6"}"""
                with(authedUser())
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("AI_DISABLED") }
            }
    }

    private fun authedUser(): RequestPostProcessor =
        RequestPostProcessor { request ->
            request.userPrincipal =
                UsernamePasswordAuthenticationToken(currentMember.email, "password", emptyList())
            request
        }

    private class FakeGetUseCase : GetClubAiDefaultsUseCase {
        var view: ClubAiDefaultsView = ClubAiDefaultsView(defaultModel = null)
        var error: RuntimeException? = null

        override fun get(
            clubSlug: String,
            member: CurrentMember,
        ): ClubAiDefaultsView {
            error?.let { throw it }
            return view
        }
    }

    private class FakeUpdateUseCase : UpdateClubAiDefaultsUseCase {
        val calls = mutableListOf<Pair<String, String>>()
        var error: RuntimeException? = null

        override fun update(
            clubSlug: String,
            defaultModel: String,
            member: CurrentMember,
        ) {
            error?.let { throw it }
            calls += clubSlug to defaultModel
        }
    }

    private class StubCurrentMemberResolver(
        private val member: CurrentMember,
    ) : HandlerMethodArgumentResolver {
        override fun supportsParameter(parameter: MethodParameter): Boolean = isClubDefaultsCurrentMember(parameter)

        override fun resolveArgument(
            parameter: MethodParameter,
            mavContainer: ModelAndViewContainer?,
            webRequest: NativeWebRequest,
            binderFactory: WebDataBinderFactory?,
        ): Any = member
    }
}

private fun isClubDefaultsCurrentMember(p: MethodParameter): Boolean = p.parameterType == CurrentMember::class.java
