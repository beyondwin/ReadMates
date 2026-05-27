package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.CommitGenerationUseCase
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.port.`in`.CommitValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportInput
import com.readmates.sessionimport.application.service.InvalidSessionImportException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.time.Clock
import java.util.UUID

/**
 * Implements the AI-generated session commit flow (spec §7.4).
 *
 * Steps:
 *  1. Load and verify the JobRecord (sessionId match, result present).
 *  2. If [overrideResult] supplied, persist it via [AiGenerationJobStore.saveResult]
 *     (so the snapshot to validate is identical to the one persisted in Redis).
 *  3. Validate via [SessionImportV1Validator] — Violation → FAILED audit + throw.
 *  4. Convert to a [SessionImportCommand] and delegate to
 *     [CommitValidatedSessionImportUseCase.commitValidated].
 *  5. Delete transient Redis payload, write a COMMIT SUCCESS audit row, return the result.
 *
 * Trust boundary: the validator runs here, so the downstream `commitValidated`
 * skips schema validation but still loads the target and replaces records.
 */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationCommitService(
    private val jobStore: AiGenerationJobStore,
    private val auditPort: AiGenerationAuditPort,
    private val validator: SessionImportV1Validator,
    private val commitDelegate: CommitValidatedSessionImportUseCase,
    private val clock: Clock,
    private val transitionPolicy: AiGenerationJobTransitionPolicy,
) : CommitGenerationUseCase {
    @Suppress("LongMethod", "SwallowedException")
    override fun commit(
        host: AiGenerationActor,
        sessionId: UUID,
        jobId: UUID,
        recordVisibility: SessionRecordVisibility,
        overrideResult: SessionImportV1Snapshot?,
    ): SessionImportCommitResult {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        transitionPolicy.requireCommit(record.status, record.jobId)
        val snapshot =
            overrideResult
                ?: record.result
                ?: throw AiGenerationException.IllegalGenerationState(
                    jobId = jobId,
                    currentStatus = record.status.name,
                    attemptedAction = "commit",
                )

        // Validate BEFORE persisting any override. Otherwise a bad client-supplied
        // override would pollute the Redis result before validation could reject it.
        // See spec §9.3: validation is the trust boundary between aigen and
        // sessionimport.commitValidated.
        val sessionMeta = record.toSessionMeta()
        when (val outcome = validator.validate(snapshot, sessionMeta)) {
            is ValidationResult.Ok -> Unit
            is ValidationResult.Violation -> failCommit(record, outcome)
        }

        val beganCommit =
            jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.SUCCEEDED),
                next = JobStatus.COMMITTING,
                stage = JobStage.READY,
                progressPct = 100,
                error = null,
            )
        if (!beganCommit) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = record.jobId,
                currentStatus = jobStore.load(record.jobId)?.status?.name ?: "MISSING",
                attemptedAction = "commit",
            )
        }

        if (overrideResult != null) {
            val overrideSaved =
                jobStore.saveResultIfStatus(
                    jobId = jobId,
                    expected = JobStatus.COMMITTING,
                    result = overrideResult,
                    usage = TokenUsage(0, 0, 0),
                    cost = BigDecimal.ZERO,
                )
            if (!overrideSaved) {
                jobStore.transitionStatus(
                    jobId = record.jobId,
                    expected = setOf(JobStatus.COMMITTING),
                    next = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    progressPct = 100,
                    error = null,
                )
                throw AiGenerationException.IllegalGenerationState(
                    jobId = record.jobId,
                    currentStatus = jobStore.load(record.jobId)?.status?.name ?: "MISSING",
                    attemptedAction = "commit",
                )
            }
        }

        val command = toSessionImportCommand(host, snapshot, sessionId, recordVisibility)
        val result =
            try {
                commitDelegate.commitValidated(ValidatedSessionImportInput(command))
            } catch (error: InvalidSessionImportException) {
                jobStore.transitionStatus(
                    jobId = record.jobId,
                    expected = setOf(JobStatus.COMMITTING),
                    next = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    progressPct = 100,
                    error = null,
                )
                failCommit(
                    record,
                    ValidationResult.Violation(
                        ErrorCode.SCHEMA_INVALID,
                        "Generated session import failed validation",
                    ),
                )
            } catch (
                @Suppress("TooGenericExceptionCaught") error: RuntimeException,
            ) {
                jobStore.transitionStatus(
                    jobId = record.jobId,
                    expected = setOf(JobStatus.COMMITTING),
                    next = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    progressPct = 100,
                    error = null,
                )
                auditPort.insert(
                    AuditLogEntry(
                        jobId = record.jobId,
                        sessionId = record.sessionId,
                        clubId = record.clubId,
                        hostUserId = record.hostUserId,
                        kind = AuditKind.COMMIT,
                        item = null,
                        provider = record.model.provider,
                        model = record.model.name,
                        transcriptSha256 = null,
                        usage = record.tokens,
                        costEstimateUsd = record.costAccumulatedUsd,
                        status = AuditStatus.FAILED,
                        errorCode = ErrorCode.UNKNOWN,
                        errorMessage = "Commit delegate failed; status restored to SUCCEEDED",
                        latencyMs = 0,
                        createdAt = clock.instant(),
                    ),
                )
                throw error
            }

        jobStore.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.COMMITTING),
            next = JobStatus.COMMITTED,
            stage = null,
            progressPct = 100,
            error = null,
        )
        jobStore.deleteTransientPayload(jobId)
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.COMMIT,
                item = null,
                provider = record.model.provider,
                model = record.model.name,
                transcriptSha256 = null,
                usage = record.tokens,
                costEstimateUsd = record.costAccumulatedUsd,
                status = AuditStatus.SUCCESS,
                errorCode = null,
                errorMessage = null,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        return result
    }

    private fun toSessionImportCommand(
        host: AiGenerationActor,
        snapshot: SessionImportV1Snapshot,
        sessionId: UUID,
        visibility: SessionRecordVisibility,
    ): SessionImportCommand =
        SessionImportCommand(
            host = host,
            sessionId = sessionId,
            recordVisibility = visibility,
            format = snapshot.format,
            session =
                SessionImportSessionCommand(
                    number = snapshot.sessionNumber,
                    bookTitle = snapshot.bookTitle,
                    meetingDate = snapshot.meetingDate,
                ),
            publication = SessionImportPublicationCommand(summary = snapshot.summary),
            highlights = snapshot.highlights.map { SessionImportRecordCommand(it.authorName, it.text) },
            oneLineReviews = snapshot.oneLineReviews.map { SessionImportRecordCommand(it.authorName, it.text) },
            feedbackDocument =
                SessionImportFeedbackDocumentCommand(
                    fileName = snapshot.feedbackDocumentFileName,
                    markdown = snapshot.feedbackDocumentMarkdown,
                ),
        )

    private fun failCommit(
        record: JobRecord,
        violation: ValidationResult.Violation,
    ): Nothing {
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.COMMIT,
                item = null,
                provider = record.model.provider,
                model = record.model.name,
                transcriptSha256 = null,
                usage = record.tokens,
                costEstimateUsd = record.costAccumulatedUsd,
                status = AuditStatus.FAILED,
                errorCode = violation.code,
                errorMessage = violation.message,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        throw AiGenerationException.Coded(violation.code, violation.message)
    }
}
