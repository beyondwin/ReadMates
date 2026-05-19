package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class AiGenerationOpsControllerTest {
    private val summary = FakeSummaryUseCase()
    private val list = FakeListUseCase()
    private val get = FakeGetUseCase()
    private val cancel = FakeForceCancelUseCase()
    private val admin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            email = "owner@example.com",
            role = PlatformAdminRole.OWNER,
        )

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        mockMvc =
            MockMvcBuilders
                .standaloneSetup(
                    AiGenerationOpsController(
                        summaryUseCase = summary,
                        listUseCase = list,
                        getUseCase = get,
                        forceCancelUseCase = cancel,
                    ),
                ).setControllerAdvice(AiGenerationErrorHandler())
                .setCustomArgumentResolvers(StubCurrentPlatformAdminResolver(admin))
                .build()
    }

    @Test
    fun `admin summary returns safe aggregate fields`() {
        summary.result =
            AiOpsSummary(
                activeJobCount = 2,
                failedLast24h = 1,
                monthToDateCostEstimateUsd = BigDecimal("0.2000"),
                failureCodes = listOf(AiOpsFailureCodeCount("PROVIDER_RATE_LIMITED", 1)),
                providerCosts = listOf(AiOpsProviderCost(Provider.OPENAI, "gpt-model", BigDecimal("0.2000"))),
                staleCandidateCount = 1,
            )

        mockMvc
            .get("/api/admin/ai-generation/summary")
            .andExpect {
                status { isOk() }
                jsonPath("$.activeJobCount") { value(2) }
                jsonPath("$.failedLast24h") { value(1) }
                jsonPath("$.monthToDateCostEstimateUsd") { value("0.2000") }
                jsonPath("$.providerCosts[0].model") { value("gpt-model") }
            }
    }

    @Test
    fun `admin job list omits transcript result instructions and feedback body fields`() {
        list.result = AiOpsJobList(items = listOf(sampleJob()), nextCursor = null)

        val response =
            mockMvc
                .get("/api/admin/ai-generation/jobs")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.items[0].jobId") { value(sampleJobId.toString()) }
                    jsonPath("$.items[0].club.clubId") { value(sampleClubId.toString()) }
                    jsonPath("$.items[0].session.sessionId") { value(sampleSessionId.toString()) }
                    jsonPath("$.items[0].availableActions[0]") { value("FORCE_CANCEL") }
                }.andReturn()
                .response
                .contentAsString

        assertThat(response).doesNotContain("transcript")
        assertThat(response).doesNotContain("instructions")
        assertThat(response).doesNotContain("feedbackDocumentMarkdown")
        assertThat(response).doesNotContain("result")
    }

    @Test
    fun `force cancel delegates to use case`() {
        cancel.result = AiOpsAdminActionResult(sampleJobId, JobStatus.RUNNING, JobStatus.CANCELLED)

        mockMvc
            .post("/api/admin/ai-generation/jobs/$sampleJobId/force-cancel")
            .andExpect {
                status { isOk() }
                jsonPath("$.jobId") { value(sampleJobId.toString()) }
                jsonPath("$.previousStatus") { value("RUNNING") }
                jsonPath("$.nextStatus") { value("CANCELLED") }
            }

        assertThat(cancel.calls).containsExactly(admin to sampleJobId)
    }

    private companion object {
        val sampleJobId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000010")
        val sampleClubId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000020")
        val sampleSessionId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000030")

        fun sampleJob(): AiOpsJobListItem =
            AiOpsJobListItem(
                jobId = sampleJobId,
                clubId = sampleClubId,
                clubSlug = "club",
                clubName = "Club",
                sessionId = sampleSessionId,
                sessionNumber = 7,
                bookTitle = "Book",
                status = JobStatus.RUNNING,
                stage = JobStage.GENERATING_SUMMARY,
                provider = Provider.CLAUDE,
                model = "claude-sonnet-4-6",
                errorCode = null,
                safeErrorMessage = null,
                costEstimateUsd = BigDecimal("0.1200"),
                createdAt = Instant.parse("2026-05-18T00:00:00Z"),
                lastUpdatedAt = Instant.parse("2026-05-18T00:01:00Z"),
                expiresAt = Instant.parse("2026-05-18T06:00:00Z"),
                staleCandidate = false,
                availableActions = setOf(com.readmates.aigen.application.model.AiOpsAction.FORCE_CANCEL),
            )
    }
}

private class FakeSummaryUseCase : GetAiOpsSummaryUseCase {
    lateinit var result: AiOpsSummary

    override fun summary(admin: CurrentPlatformAdmin): AiOpsSummary = result
}

private class FakeListUseCase : ListAiOpsJobsUseCase {
    var result: AiOpsJobList = AiOpsJobList(emptyList(), null)
    var lastFilters: AiOpsJobFilters? = null

    override fun list(
        admin: CurrentPlatformAdmin,
        filters: AiOpsJobFilters,
    ): AiOpsJobList {
        lastFilters = filters
        return result
    }
}

private class FakeGetUseCase : GetAiOpsJobUseCase {
    lateinit var result: AiOpsJobListItem

    override fun get(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsJobListItem = result
}

private class FakeForceCancelUseCase : ForceCancelAiOpsJobUseCase {
    lateinit var result: AiOpsAdminActionResult
    val calls = mutableListOf<Pair<CurrentPlatformAdmin, UUID>>()

    override fun forceCancel(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        calls += admin to jobId
        return result
    }
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
