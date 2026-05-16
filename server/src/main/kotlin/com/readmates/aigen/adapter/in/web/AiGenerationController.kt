package com.readmates.aigen.adapter.`in`.web

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.port.`in`.CancelGenerationUseCase
import com.readmates.aigen.application.port.`in`.CommitGenerationUseCase
import com.readmates.aigen.application.port.`in`.GetJobUseCase
import com.readmates.aigen.application.port.`in`.RegenerateItemUseCase
import com.readmates.aigen.application.port.`in`.StartGenerationCommand
import com.readmates.aigen.application.port.`in`.StartGenerationUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.shared.security.CurrentMember
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

private const val MAX_TRANSCRIPT_BYTES: Int = 1024 * 1024

/**
 * REST adapter for the AI session-generation flow (spec §7).
 *
 * Endpoint contract:
 *  - POST   /jobs               start a generation job (multipart)
 *  - GET    /jobs/{jobId}       fetch job status / result
 *  - POST   /jobs/{jobId}/regenerate  partial regeneration (sync)
 *  - POST   /jobs/{jobId}/commit      commit validated result
 *  - DELETE /jobs/{jobId}       cancel a job
 *
 * Every endpoint short-circuits to 503 [ErrorCode.AI_DISABLED] when the
 * `readmates.aigen.enabled` kill switch is off, before any auth or
 * use-case work, so the feature can be killed without restarting.
 */
@RestController
@RequestMapping("/api/host/sessions/{sessionId}/ai-generate")
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@Suppress("LongParameterList")
class AiGenerationController(
    private val start: StartGenerationUseCase,
    private val getJob: GetJobUseCase,
    private val regen: RegenerateItemUseCase,
    private val commitUc: CommitGenerationUseCase,
    private val cancel: CancelGenerationUseCase,
    private val auth: AiGenerationAuthorizationPolicy,
    private val props: AiGenerationProperties,
) {
    private val bodyMapper: ObjectMapper = ObjectMapper().findAndRegisterModules()

    @PostMapping("/jobs", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun startJob(
        @PathVariable sessionId: UUID,
        @RequestPart("transcript") transcript: MultipartFile,
        @RequestPart("body") body: MultipartFile,
        member: CurrentMember,
    ): StartGenerationResponse {
        ensureEnabled()
        if (transcript.size > MAX_TRANSCRIPT_BYTES) {
            throw TranscriptTooLargeException()
        }
        val meta = auth.requireHostAccess(sessionId, member)
        val request = bodyMapper.readValue(body.bytes, StartGenerationRequest::class.java)
        val command =
            StartGenerationCommand(
                sessionId = sessionId,
                clubId = meta.clubId,
                hostUserId = member.userId,
                transcript = transcript.bytes.toString(Charsets.UTF_8),
                model = request.model,
                authorNameMode = parseAuthorNameMode(request.authorNameMode),
                instructions = request.instructions,
                sessionMeta = meta,
            )
        val result = start.start(command)
        return StartGenerationResponse(
            jobId = result.jobId,
            status = result.status.name,
            expiresAt = result.expiresAt.toString(),
        )
    }

    @GetMapping("/jobs/{jobId}")
    fun getJobStatus(
        @PathVariable sessionId: UUID,
        @PathVariable jobId: UUID,
        member: CurrentMember,
    ): JobStatusResponse {
        ensureEnabled()
        auth.requireHostAccess(sessionId, member)
        val view = getJob.get(sessionId, jobId)
        return JobStatusResponse(
            jobId = view.jobId,
            status = view.status.name,
            stage = view.stage?.name,
            progressPct = view.progressPct,
            model = view.model.name,
            result = view.result?.toJson(),
            error = view.error?.let { GenerationErrorJson(it.code.name, it.message) },
            tokens =
                view.tokens?.let {
                    TokenUsageJson(it.inputTokens, it.cachedInputTokens, it.outputTokens)
                },
            costEstimateUsd = view.costEstimateUsd.toPlainString(),
            warnings = view.warnings,
        )
    }

    @PostMapping("/jobs/{jobId}/regenerate", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun regenerate(
        @PathVariable sessionId: UUID,
        @PathVariable jobId: UUID,
        @RequestBody request: RegenerateRequest,
        member: CurrentMember,
    ): RegenerateResponse {
        ensureEnabled()
        auth.requireHostAccess(sessionId, member)
        val item = parseGenerationItem(request.item)
        val outcome =
            regen.regenerate(
                sessionId = sessionId,
                jobId = jobId,
                item = item,
                model = request.model,
                instructions = request.instructions,
            )
        return RegenerateResponse(
            item = outcome.item.name,
            value = outcome.value,
            tokens =
                TokenUsageJson(
                    outcome.tokens.inputTokens,
                    outcome.tokens.cachedInputTokens,
                    outcome.tokens.outputTokens,
                ),
            costEstimateUsd = outcome.costEstimateUsd.toPlainString(),
            warnings = outcome.warnings,
        )
    }

    @PostMapping("/jobs/{jobId}/commit", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun commit(
        @PathVariable sessionId: UUID,
        @PathVariable jobId: UUID,
        @RequestBody request: CommitRequest,
        member: CurrentMember,
    ): SessionImportCommitResult {
        ensureEnabled()
        auth.requireHostAccess(sessionId, member)
        return commitUc.commit(
            host = member,
            sessionId = sessionId,
            jobId = jobId,
            recordVisibility = request.recordVisibility,
            overrideResult = request.result?.toSnapshot(),
        )
    }

    @DeleteMapping("/jobs/{jobId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun cancelJob(
        @PathVariable sessionId: UUID,
        @PathVariable jobId: UUID,
        member: CurrentMember,
    ): ResponseEntity<Void> {
        ensureEnabled()
        auth.requireHostAccess(sessionId, member)
        cancel.cancel(sessionId, jobId, member.userId)
        return ResponseEntity.noContent().build()
    }

    private fun ensureEnabled() {
        if (!props.enabled) {
            throw AiGenerationException(ErrorCode.AI_DISABLED, "AI generation is disabled")
        }
    }

    private fun parseAuthorNameMode(value: String): AuthorNameMode =
        when (value.lowercase()) {
            "real" -> AuthorNameMode.REAL
            "alias" -> AuthorNameMode.ALIAS
            else -> throw AiGenerationException(
                ErrorCode.SCHEMA_INVALID,
                "Unknown authorNameMode: $value",
            )
        }

    private fun parseGenerationItem(value: String): GenerationItem =
        runCatching { GenerationItem.valueOf(value.uppercase()) }
            .getOrElse {
                throw AiGenerationException(
                    ErrorCode.SCHEMA_INVALID,
                    "Unknown regeneration item: $value",
                )
            }
}

/**
 * Thrown when an uploaded transcript exceeds the 1MB cap (spec §7.1).
 * The error handler maps this to 400.
 */
class TranscriptTooLargeException : RuntimeException("Transcript exceeds 1MB limit")
