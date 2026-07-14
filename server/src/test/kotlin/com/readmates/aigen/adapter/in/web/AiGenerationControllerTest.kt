package com.readmates.aigen.adapter.`in`.web

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.JobView
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.AvailableGenerationModel
import com.readmates.aigen.application.port.`in`.CancelGenerationUseCase
import com.readmates.aigen.application.port.`in`.CommitGenerationUseCase
import com.readmates.aigen.application.port.`in`.GetJobUseCase
import com.readmates.aigen.application.port.`in`.GetRecentSessionGenerationJobUseCase
import com.readmates.aigen.application.port.`in`.ListGenerationModelsUseCase
import com.readmates.aigen.application.port.`in`.RegenerateItemUseCase
import com.readmates.aigen.application.port.`in`.RegenerationResult
import com.readmates.aigen.application.port.`in`.StartGenerationCommand
import com.readmates.aigen.application.port.`in`.StartGenerationResult
import com.readmates.aigen.application.port.`in`.StartGenerationUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportCommittedFeedbackDocument
import com.readmates.sessionimport.application.model.SessionImportPublicationPreview
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class AiGenerationControllerTest {
    private val sessionId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000010")
    private val clubId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000020")
    private val hostUserId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000030")
    private val jobId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000040")
    private val expiresAt: Instant = Instant.parse("2026-05-17T10:00:00Z")
    private val createdAt: Instant = Instant.parse("2026-05-17T09:00:00Z")
    private val lastUpdatedAt: Instant = Instant.parse("2026-05-17T09:30:00Z")

    private val currentMember =
        CurrentMember(
            userId = hostUserId,
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000050"),
            clubId = clubId,
            clubSlug = "club",
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private val sessionMeta =
        SessionMeta(
            sessionId = sessionId,
            clubId = clubId,
            sessionNumber = 1,
            bookTitle = "Title",
            bookAuthor = null,
            meetingDate = LocalDate.of(2026, 5, 16),
            expectedAuthorNames = listOf("Alice", "Bob"),
            authorNameMode = AuthorNameMode.REAL,
        )

    private val startUseCase = FakeStartUseCase()
    private val getJobUseCase = FakeGetJobUseCase()
    private val recentJobUseCase = FakeRecentJobUseCase()
    private val regenerateUseCase = FakeRegenerateUseCase()
    private val commitUseCase = FakeCommitUseCase()
    private val cancelUseCase = FakeCancelUseCase()
    private val listModelsUseCase = FakeListModelsUseCase()
    private val authPolicy = FakeAuthPolicy(sessionMeta)
    private val properties = AiGenerationProperties(enabled = true)

    private val mapper: ObjectMapper = jacksonObjectMapper()

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        mockMvc =
            MockMvcBuilders
                .standaloneSetup(
                    AiGenerationController(
                        start = startUseCase,
                        getJob = getJobUseCase,
                        recentJob = recentJobUseCase,
                        regen = regenerateUseCase,
                        commitUc = commitUseCase,
                        cancel = cancelUseCase,
                        listModels = listModelsUseCase,
                        auth = authPolicy,
                        props = properties,
                    ),
                ).setControllerAdvice(AiGenerationErrorHandler())
                .setCustomArgumentResolvers(StubCurrentMemberResolver(currentMember))
                .build()
    }

    @Test
    fun `POST jobs happy path returns 202 with jobId`() {
        startUseCase.result =
            StartGenerationResult(
                jobId = jobId,
                status = JobStatus.PENDING,
                expiresAt = expiresAt,
            )
        val transcript =
            MockMultipartFile(
                "transcript",
                "transcript.txt",
                "text/plain",
                "hello world".toByteArray(),
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":"claude-sonnet-4-6","authorNameMode":"real","instructions":null}""".toByteArray(),
            )
        mockMvc
            .multipart("/api/host/sessions/$sessionId/ai-generate/jobs") {
                file(transcript)
                file(body)
                with(authedUser())
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.jobId") { value(jobId.toString()) }
                jsonPath("$.status") { value("PENDING") }
                jsonPath("$.expiresAt") { value(expiresAt.toString()) }
            }
    }

    @Test
    fun `POST jobs when kill switch off returns 503 AI_DISABLED`() {
        // override properties to disabled
        mockMvc =
            MockMvcBuilders
                .standaloneSetup(
                    AiGenerationController(
                        start = startUseCase,
                        getJob = getJobUseCase,
                        recentJob = recentJobUseCase,
                        regen = regenerateUseCase,
                        commitUc = commitUseCase,
                        cancel = cancelUseCase,
                        listModels = listModelsUseCase,
                        auth = authPolicy,
                        props = AiGenerationProperties(enabled = false),
                    ),
                ).setControllerAdvice(AiGenerationErrorHandler())
                .setCustomArgumentResolvers(StubCurrentMemberResolver(currentMember))
                .build()

        val transcript =
            MockMultipartFile(
                "transcript",
                "transcript.txt",
                "text/plain",
                "hello".toByteArray(),
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":null,"authorNameMode":"real","instructions":null}""".toByteArray(),
            )
        mockMvc
            .multipart("/api/host/sessions/$sessionId/ai-generate/jobs") {
                file(transcript)
                file(body)
                with(authedUser())
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("AI_DISABLED") }
                jsonPath("$.status") { value(503) }
            }
    }

    @Test
    fun `POST jobs authorizes before validating transcript filename or bytes`() {
        authPolicy.denyWith = AccessDeniedException("denied")

        postTranscript("not-a-transcript.json", byteArrayOf(0xC3.toByte(), 0x28)).andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("PERMISSION_DENIED") }
        }
        assertThat(startUseCase.commands).isEmpty()
    }

    @Test
    fun `POST jobs with transcript larger than 1MB returns 400`() {
        val tooBig = ByteArray(1024 * 1024 + 1) { 0x41 }
        val transcript =
            MockMultipartFile(
                "transcript",
                "big.txt",
                "text/plain",
                tooBig,
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":null,"authorNameMode":"real","instructions":null}""".toByteArray(),
            )
        mockMvc
            .multipart("/api/host/sessions/$sessionId/ai-generate/jobs") {
                file(transcript)
                file(body)
                with(authedUser())
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("TRANSCRIPT_TOO_LARGE") }
            }
        assertThat(startUseCase.commands).isEmpty()
    }

    @Test
    fun `POST jobs accepts case insensitive txt suffix and exact one MiB`() {
        val prefix = "가람 00:00\n".toByteArray()
        val exactLimit = prefix + ByteArray(1024 * 1024 - prefix.size) { 'a'.code.toByte() }

        postTranscript("public-fixture.TXT", exactLimit).andExpect { status { isAccepted() } }

        val submittedCommand = startUseCase.commands.single()
        val submittedBytes = submittedCommand.transcript.toByteArray()
        assertThat(submittedBytes).hasSize(1024 * 1024)
    }

    @Test
    fun `POST jobs rejects missing or other suffix regardless of claimed MIME type`() {
        listOf(null, "public-fixture", "public-fixture.json").forEach { filename ->
            postTranscript(filename, "공개 테스트".toByteArray(), "text/plain").andExpect {
                status { isUnprocessableEntity() }
                jsonPath("$.code") { value("TRANSCRIPT_FORMAT_INVALID") }
            }
        }

        assertThat(startUseCase.commands).isEmpty()
    }

    @Test
    fun `POST jobs rejects empty upload before starting a job`() {
        postTranscript("public-fixture.txt", byteArrayOf()).andExpect {
            status { isUnprocessableEntity() }
            jsonPath("$.code") { value("TRANSCRIPT_EMPTY") }
        }

        assertThat(startUseCase.commands).isEmpty()
    }

    @Test
    fun `POST jobs rejects malformed UTF-8 without echoing bytes`() {
        postTranscript("public-fixture.txt", byteArrayOf(0xC3.toByte(), 0x28)).andExpect {
            status { isUnprocessableEntity() }
            jsonPath("$.code") { value("TRANSCRIPT_FORMAT_INVALID") }
            jsonPath("$.detail") { value("reason=UTF8_REQUIRED") }
        }

        assertThat(startUseCase.commands).isEmpty()
    }

    @Test
    fun `POST jobs strictly decodes BOM and CRLF UTF-8 input`() {
        val raw = "\uFEFF가람 00:00\r\n공개 테스트 발언입니다."

        postTranscript("public-fixture.txt", raw.toByteArray()).andExpect { status { isAccepted() } }

        assertThat(startUseCase.commands.single().transcript).isEqualTo(raw)
    }

    @Test
    fun `POST jobs returns typed invalid speaker labels without member candidates`() {
        startUseCase.error =
            AiGenerationException.InvalidTranscriptSpeakers(
                ErrorCode.TRANSCRIPT_SPEAKER_NOT_MEMBER,
                listOf("없는이름"),
            )

        postTranscript("public-fixture.txt", "없는이름 00:00\n공개 테스트 발언입니다.".toByteArray()).andExpect {
            status { isUnprocessableEntity() }
            jsonPath("$.code") { value("TRANSCRIPT_SPEAKER_NOT_MEMBER") }
            jsonPath("$.invalidSpeakerLabels[0]") { value("없는이름") }
            jsonPath("$.membershipId") { doesNotExist() }
            jsonPath("$.candidateMembers") { doesNotExist() }
        }
    }

    @Test
    fun `GET jobs jobId returns JobStatusResponse JSON`() {
        getJobUseCase.view = sampleJobView()

        mockMvc
            .get("/api/host/sessions/$sessionId/ai-generate/jobs/$jobId") {
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.jobId") { value(jobId.toString()) }
                jsonPath("$.status") { value("SUCCEEDED") }
                jsonPath("$.model") { value("claude-sonnet-4-6") }
                jsonPath("$.result.bookTitle") { value("Title") }
                jsonPath("$.costEstimateUsd") { value("0.12") }
                jsonPath("$.tokens.input") { value(100) }
            }
    }

    @Test
    fun `grounded model list returns only safe enabled capable models and default`() {
        listModelsUseCase.models =
            listOf(
                AvailableGenerationModel("gpt-5.4-mini", Provider.OPENAI, true),
                AvailableGenerationModel("claude-sonnet-4-6", Provider.CLAUDE, false),
                AvailableGenerationModel("gemini-3-flash-preview", Provider.GEMINI, false),
            )

        mockMvc
            .get("/api/host/sessions/$sessionId/ai-generate/models") {
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.models[0].id") { value("gpt-5.4-mini") }
                jsonPath("$.models[0].provider") { value("OPENAI") }
                jsonPath("$.models[0].default") { value(true) }
                jsonPath("$.models[1].id") { value("claude-sonnet-4-6") }
                jsonPath("$.models[2].id") { value("gemini-3-flash-preview") }
            }
    }

    @Test
    fun `GET recent job returns safe recoverable job metadata without generated result payload`() {
        recentJobUseCase.view = sampleJobView()

        mockMvc
            .get("/api/host/sessions/$sessionId/ai-generate/jobs/recent") {
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.jobId") { value(jobId.toString()) }
                jsonPath("$.status") { value("SUCCEEDED") }
                jsonPath("$.stage") { value("READY") }
                jsonPath("$.model") { value("claude-sonnet-4-6") }
                jsonPath("$.result") { doesNotExist() }
                jsonPath("$.tokens") { doesNotExist() }
                jsonPath("$.costEstimateUsd") { value("0.12") }
                jsonPath("$.expiresAt") { value(expiresAt.toString()) }
                jsonPath("$.createdAt") { value(createdAt.toString()) }
                jsonPath("$.lastUpdatedAt") { value(lastUpdatedAt.toString()) }
                jsonPath("$.availableActions[0]") { value("POLL") }
                jsonPath("$.availableActions[1]") { value("COMMIT_RETRY") }
            }
    }

    @Test
    fun `GET recent COMMIT_RETRY job permits poll and explicit safe retry only`() {
        recentJobUseCase.view = sampleJobView().copy(status = JobStatus.COMMIT_RETRY)

        mockMvc
            .get("/api/host/sessions/$sessionId/ai-generate/jobs/recent") {
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("COMMIT_RETRY") }
                jsonPath("$.availableActions[0]") { value("POLL") }
                jsonPath("$.availableActions[1]") { value("COMMIT_RETRY") }
                jsonPath("$.availableActions.length()") { value(2) }
            }
    }

    @Test
    fun `GET recent job returns 204 when no recoverable job exists`() {
        recentJobUseCase.view = null

        mockMvc
            .get("/api/host/sessions/$sessionId/ai-generate/jobs/recent") {
                with(authedUser())
            }.andExpect {
                status { isNoContent() }
            }
    }

    @Test
    fun `POST regenerate happy path returns 200`() {
        regenerateUseCase.result =
            RegenerationResult(
                item = GenerationItem.SUMMARY,
                value = "regenerated summary",
                tokens = TokenUsage(50, 0, 25),
                costEstimateUsd = BigDecimal("0.05"),
                warnings = emptyList(),
            )

        mockMvc
            .post("/api/host/sessions/$sessionId/ai-generate/jobs/$jobId/regenerate") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"item":"SUMMARY","model":null,"instructions":"sharpen"}"""
                with(authedUser())
            }.andExpect {
                status { isOk() }
                jsonPath("$.item") { value("SUMMARY") }
                jsonPath("$.value") { value("regenerated summary") }
                jsonPath("$.tokens.output") { value(25) }
                jsonPath("$.costEstimateUsd") { value("0.05") }
            }
    }

    @Test
    fun `POST commit without override result delegates without override`() {
        commitUseCase.result = sampleCommitResult()

        mockMvc
            .post("/api/host/sessions/$sessionId/ai-generate/jobs/$jobId/commit") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"recordVisibility":"MEMBER","result":null}"""
                with(authedUser())
            }.andExpect {
                status { isOk() }
            }
        assert(commitUseCase.lastOverride == null) {
            "expected null override, got ${commitUseCase.lastOverride}"
        }
        assert(commitUseCase.lastVisibility == SessionRecordVisibility.MEMBER)
    }

    @Test
    fun `POST commit with override result passes snapshot to use case`() {
        commitUseCase.result = sampleCommitResult()
        val resultJson =
            mapper.writeValueAsString(
                SessionImportV1Json(
                    format = "readmates-session-import:v1",
                    sessionNumber = 7,
                    bookTitle = "Override Title",
                    meetingDate = "2026-05-16",
                    summary = "summary",
                    highlights = listOf(SessionImportV1Json.AuthoredTextJson("Alice", "h")),
                    oneLineReviews = listOf(SessionImportV1Json.AuthoredTextJson("Alice", "r")),
                    feedbackDocumentFileName = "feedback.md",
                    feedbackDocumentMarkdown = "# title",
                ),
            )

        mockMvc
            .post("/api/host/sessions/$sessionId/ai-generate/jobs/$jobId/commit") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content = """{"recordVisibility":"PUBLIC","result":$resultJson}"""
                with(authedUser())
            }.andExpect {
                status { isOk() }
            }
        val override = commitUseCase.lastOverride
        assert(override != null) { "expected override snapshot, was null" }
        assert(override!!.bookTitle == "Override Title")
        assert(commitUseCase.lastVisibility == SessionRecordVisibility.PUBLIC)
    }

    @Test
    fun `DELETE jobs jobId returns 204`() {
        mockMvc
            .delete("/api/host/sessions/$sessionId/ai-generate/jobs/$jobId") {
                with(authedUser())
            }.andExpect {
                status { isNoContent() }
            }
        assert(cancelUseCase.calls.size == 1)
    }

    @Test
    fun `endpoints return 403 when authorization policy denies access`() {
        authPolicy.denyWith = AccessDeniedException("nope")

        mockMvc
            .get("/api/host/sessions/$sessionId/ai-generate/jobs/$jobId") {
                with(authedUser())
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("PERMISSION_DENIED") }
            }
    }

    private fun sampleJobView(): JobView =
        JobView(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            status = JobStatus.SUCCEEDED,
            stage = JobStage.READY,
            progressPct = 100,
            model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            result =
                SessionImportV1Snapshot(
                    format = "readmates-session-import:v1",
                    sessionNumber = 1,
                    bookTitle = "Title",
                    meetingDate = LocalDate.of(2026, 5, 16),
                    summary = "Summary",
                    highlights = listOf(SessionImportV1Snapshot.AuthoredText("Alice", "h")),
                    oneLineReviews = listOf(SessionImportV1Snapshot.AuthoredText("Bob", "r")),
                    feedbackDocumentFileName = "feedback.md",
                    feedbackDocumentMarkdown = "# Feedback",
                ),
            error = null,
            tokens = TokenUsage(100, 0, 50),
            costEstimateUsd = BigDecimal("0.12"),
            warnings = emptyList(),
            expiresAt = expiresAt,
            createdAt = createdAt,
            lastUpdatedAt = lastUpdatedAt,
        )

    private fun sampleCommitResult(): SessionImportCommitResult =
        SessionImportCommitResult(
            sessionId = sessionId.toString(),
            publication = SessionImportPublicationPreview(summary = "s"),
            highlights = emptyList(),
            oneLineReviews = emptyList(),
            feedbackDocument =
                SessionImportCommittedFeedbackDocument(
                    uploaded = true,
                    fileName = "feedback.md",
                    title = "Title",
                    uploadedAt = null,
                ),
        )

    private fun authedUser(): RequestPostProcessor =
        RequestPostProcessor { request ->
            request.userPrincipal =
                UsernamePasswordAuthenticationToken(currentMember.email, "password", emptyList())
            request
        }

    private fun postTranscript(
        filename: String?,
        bytes: ByteArray,
        contentType: String = "application/octet-stream",
    ) = mockMvc.multipart("/api/host/sessions/$sessionId/ai-generate/jobs") {
        file(MockMultipartFile("transcript", filename, contentType, bytes))
        file(
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":null,"authorNameMode":"real","instructions":null}""".toByteArray(),
            ),
        )
        with(authedUser())
    }

    private class FakeStartUseCase : StartGenerationUseCase {
        var result: StartGenerationResult =
            StartGenerationResult(
                jobId = UUID.randomUUID(),
                status = JobStatus.PENDING,
                expiresAt = Instant.EPOCH,
            )
        val commands = mutableListOf<StartGenerationCommand>()
        var error: RuntimeException? = null

        override fun start(command: StartGenerationCommand): StartGenerationResult {
            commands += command
            error?.let { throw it }
            return result
        }
    }

    private class FakeGetJobUseCase : GetJobUseCase {
        lateinit var view: JobView

        override fun get(
            sessionId: UUID,
            jobId: UUID,
        ): JobView = view
    }

    private class FakeRecentJobUseCase : GetRecentSessionGenerationJobUseCase {
        var view: JobView? = null

        override fun recent(sessionId: UUID): JobView? = view
    }

    private class FakeRegenerateUseCase : RegenerateItemUseCase {
        lateinit var result: RegenerationResult
        var lastItem: GenerationItem? = null

        override fun regenerate(
            sessionId: UUID,
            jobId: UUID,
            item: GenerationItem,
            model: String?,
            instructions: String?,
            expectedRevision: Long?,
        ): RegenerationResult {
            lastItem = item
            return result
        }
    }

    private class FakeCommitUseCase : CommitGenerationUseCase {
        lateinit var result: SessionImportCommitResult
        var lastOverride: SessionImportV1Snapshot? = null
        var lastVisibility: SessionRecordVisibility? = null

        override fun commit(
            host: AiGenerationActor,
            sessionId: UUID,
            jobId: UUID,
            recordVisibility: SessionRecordVisibility,
            overrideResult: SessionImportV1Snapshot?,
        ): SessionImportCommitResult {
            lastOverride = overrideResult
            lastVisibility = recordVisibility
            return result
        }
    }

    private class FakeCancelUseCase : CancelGenerationUseCase {
        val calls = mutableListOf<Triple<UUID, UUID, UUID>>()

        override fun cancel(
            sessionId: UUID,
            jobId: UUID,
            hostUserId: UUID,
        ) {
            calls += Triple(sessionId, jobId, hostUserId)
        }
    }

    private class FakeListModelsUseCase : ListGenerationModelsUseCase {
        var models: List<AvailableGenerationModel> = emptyList()

        override fun list(
            sessionId: UUID,
            clubId: UUID,
        ): List<AvailableGenerationModel> = models
    }

    private class FakeAuthPolicy(
        private val meta: SessionMeta,
    ) : AiGenerationAuthorizationPolicy {
        var denyWith: AccessDeniedException? = null

        override fun requireHostAccess(
            sessionId: UUID,
            member: CurrentMember,
        ): SessionMeta {
            denyWith?.let { throw it }
            return meta
        }
    }

    private class StubCurrentMemberResolver(
        private val member: CurrentMember,
    ) : HandlerMethodArgumentResolver {
        override fun supportsParameter(parameter: MethodParameter): Boolean = isAigenCurrentMember(parameter)

        override fun resolveArgument(
            parameter: MethodParameter,
            mavContainer: ModelAndViewContainer?,
            webRequest: NativeWebRequest,
            binderFactory: WebDataBinderFactory?,
        ): Any = member
    }
}

private fun isAigenCurrentMember(p: MethodParameter): Boolean = p.parameterType == CurrentMember::class.java
