package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsAdminCommandPreview
import com.readmates.aigen.application.model.AiOpsAdminCommandReceipt
import com.readmates.aigen.application.model.AiOpsCostTrend
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsDeltaDirection
import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.aigen.application.model.AiOpsTrendAvailability
import com.readmates.aigen.application.model.ConfirmAiOpsAdminCommand
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.`in`.ConfirmAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.application.port.`in`.PreviewAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
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
    private val retry = FakeRetryCommitUseCase()
    private val safeCommands = FakeAiAdminCommands()
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
                        retryCommitUseCase = retry,
                        previewAdminCommandUseCase = safeCommands,
                        confirmAdminCommandUseCase = safeCommands,
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
                costTrend =
                    AiOpsCostTrend(
                        window = AiOpsCostWindow.LAST_30D,
                        currentCostUsd = BigDecimal.ZERO,
                        priorCostUsd = BigDecimal.ZERO,
                        currentJobCount = 0,
                        priorJobCount = 0,
                        deltaDirection = AiOpsDeltaDirection.NONE,
                        availability = AiOpsTrendAvailability.NOT_ENOUGH_DATA,
                    ),
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
    fun `admin summary parses window param and serializes cost trend`() {
        summary.result =
            AiOpsSummary(
                activeJobCount = 2,
                failedLast24h = 1,
                monthToDateCostEstimateUsd = BigDecimal("0.2000"),
                failureCodes = emptyList(),
                providerCosts = emptyList(),
                staleCandidateCount = 0,
                costTrend =
                    AiOpsCostTrend(
                        window = AiOpsCostWindow.LAST_7D,
                        currentCostUsd = BigDecimal("2.0000"),
                        priorCostUsd = BigDecimal("1.0000"),
                        currentJobCount = 5,
                        priorJobCount = 4,
                        deltaDirection = AiOpsDeltaDirection.UP,
                        availability = AiOpsTrendAvailability.AVAILABLE,
                    ),
            )

        mockMvc
            .get("/api/admin/ai-generation/summary?window=7d")
            .andExpect {
                status { isOk() }
                jsonPath("$.costTrend.window") { value("7d") }
                jsonPath("$.costTrend.currentCostUsd") { value("2.0000") }
                jsonPath("$.costTrend.priorCostUsd") { value("1.0000") }
                jsonPath("$.costTrend.currentJobCount") { value(5) }
                jsonPath("$.costTrend.priorJobCount") { value(4) }
                jsonPath("$.costTrend.deltaDirection") { value("UP") }
                jsonPath("$.costTrend.availability") { value("AVAILABLE") }
            }

        assertThat(summary.lastWindow).isEqualTo(AiOpsCostWindow.LAST_7D)
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

    @Test
    fun `retry commit delegates to use case`() {
        retry.result = AiOpsAdminActionResult(sampleJobId, JobStatus.COMMITTING, JobStatus.SUCCEEDED)

        mockMvc
            .post("/api/admin/ai-generation/jobs/$sampleJobId/retry-commit")
            .andExpect {
                status { isOk() }
                jsonPath("$.jobId") { value(sampleJobId.toString()) }
                jsonPath("$.previousStatus") { value("COMMITTING") }
                jsonPath("$.nextStatus") { value("SUCCEEDED") }
            }

        assertThat(retry.calls).containsExactly(admin to sampleJobId)
    }

    @Test
    fun `safe preview returns revision effect and fingerprint contract`() {
        mockMvc
            .post("/api/admin/ai-generation/jobs/$sampleJobId/force-cancel/preview")
            .andExpect {
                status { isOk() }
                jsonPath("$.jobId") { value(sampleJobId.toString()) }
                jsonPath("$.action") { value("FORCE_CANCEL") }
                jsonPath("$.jobStatus") { value("RUNNING") }
                jsonPath("$.jobRevision") { value(7) }
                jsonPath("$.effectType") { value("AI_JOB_CANCEL") }
                jsonPath("$.impactCodes[1]") { value("DELETE_TRANSIENT_PAYLOAD") }
                jsonPath("$.fingerprintPrefix") { value("00112233") }
            }

        assertThat(safeCommands.previewCalls.single().third).isEqualTo(AiOpsAction.FORCE_CANCEL)
    }

    @Test
    fun `safe confirm accepts exact bounded body and returns origin and effect projection`() {
        val previewId = UUID.fromString("00000000-0000-4000-8000-000000000040")

        mockMvc
            .post("/api/admin/ai-generation/jobs/$sampleJobId/retry-commit/confirm") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId":"$previewId",
                      "idempotencyKey":"safe-command-key",
                      "expectedJobRevision":7,
                      "confirmed":true
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.action") { value("RETRY_COMMIT") }
                jsonPath("$.originStatus") { value("ACCEPTED") }
                jsonPath("$.effectStatus") { value("PENDING") }
                jsonPath("$.beforeJobRevision") { value(7) }
                jsonPath("$.afterJobRevision") { value(7) }
            }

        assertThat(
            safeCommands.confirmCalls
                .single()
                .command.previewId,
        ).isEqualTo(previewId)
        assertThat(safeCommands.confirmCalls.single().action).isEqualTo(AiOpsAction.RETRY_COMMIT)
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

private data class SafeConfirmCall(
    val actor: PlatformActor,
    val jobId: UUID,
    val action: AiOpsAction,
    val command: ConfirmAiOpsAdminCommand,
)

private class FakeAiAdminCommands :
    PreviewAiOpsAdminCommandUseCase,
    ConfirmAiOpsAdminCommandUseCase {
    val previewCalls = mutableListOf<Triple<PlatformActor, UUID, AiOpsAction>>()
    val confirmCalls = mutableListOf<SafeConfirmCall>()

    override fun previewAdminCommand(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
    ): AiOpsAdminCommandPreview {
        previewCalls += Triple(admin, jobId, action)
        return AiOpsAdminCommandPreview(
            UUID.fromString("00000000-0000-4000-8000-000000000040"),
            jobId,
            action,
            JobStatus.RUNNING,
            7,
            if (action == AiOpsAction.FORCE_CANCEL) "AI_JOB_CANCEL" else "AI_COMMIT_RETRY",
            listOf("CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD"),
            Instant.parse("2026-05-18T00:10:00Z"),
            "00112233",
        )
    }

    override fun confirmAdminCommand(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
        command: ConfirmAiOpsAdminCommand,
    ): AiOpsAdminCommandReceipt {
        confirmCalls += SafeConfirmCall(admin, jobId, action, command)
        val status = if (action == AiOpsAction.FORCE_CANCEL) JobStatus.RUNNING else JobStatus.COMMIT_RETRY
        return AiOpsAdminCommandReceipt(
            UUID.fromString("00000000-0000-4000-8000-000000000041"),
            command.previewId,
            jobId,
            action,
            status,
            command.expectedJobRevision,
            status,
            command.expectedJobRevision,
            "ACCEPTED",
            "PENDING",
            null,
        )
    }
}

private class FakeSummaryUseCase : GetAiOpsSummaryUseCase {
    lateinit var result: AiOpsSummary
    var lastWindow: AiOpsCostWindow? = null

    override fun summary(
        admin: CurrentPlatformAdmin,
        window: AiOpsCostWindow,
    ): AiOpsSummary {
        lastWindow = window
        return result
    }
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

private class FakeRetryCommitUseCase : RetryAiOpsJobCommitUseCase {
    lateinit var result: AiOpsAdminActionResult
    val calls = mutableListOf<Pair<CurrentPlatformAdmin, UUID>>()

    override fun retryCommit(
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
