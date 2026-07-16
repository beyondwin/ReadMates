@file:Suppress("MaxLineLength")

package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GROUNDED_PIPELINE_VERSION
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.SectionReviewStatus
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.port.`in`.CommitGenerationResult
import com.readmates.aigen.application.port.`in`.CommitGenerationUseCase
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationMembershipChangedException
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.CommitLeaseResult
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.port.`in`.CommitValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportInput
import com.readmates.sessionimport.application.service.InvalidSessionImportException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
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
    private val commitPersistence: AiGenerationCommitPersistencePort? = null,
    private val transactionTemplate: TransactionTemplate? = null,
    private val postCommitCleanup: AiGenerationPostCommitCleanupService? = null,
) : CommitGenerationUseCase {
    @Suppress("LongMethod", "SwallowedException", "ThrowsCount")
    override fun commit(
        host: AiGenerationActor,
        sessionId: UUID,
        jobId: UUID,
        recordVisibility: SessionRecordVisibility,
        overrideResult: SessionImportV1Snapshot?,
        expectedRevision: Long?,
        sectionReviews: Map<GenerationItem, SectionReviewStatus>?,
    ): CommitGenerationResult {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        return commitGrounded(
            host,
            record,
            recordVisibility,
            overrideResult,
            expectedRevision,
            sectionReviews,
        )
    }

    @Suppress(
        "LongMethod",
        "TooGenericExceptionCaught",
        "ThrowsCount",
        "ReturnCount",
        "CyclomaticComplexMethod",
        "ComplexCondition",
    )
    private fun commitGrounded(
        host: AiGenerationActor,
        record: JobRecord,
        recordVisibility: SessionRecordVisibility,
        submittedResult: SessionImportV1Snapshot?,
        expectedRevision: Long?,
        sectionReviews: Map<GenerationItem, SectionReviewStatus>?,
    ): CommitGenerationResult {
        val persistence = requireNotNull(commitPersistence) { "Grounded commit persistence is unavailable" }
        val transactions = requireNotNull(transactionTemplate) { "Grounded commit transaction manager is unavailable" }
        val cleanup = requireNotNull(postCommitCleanup) { "Grounded commit cleanup is unavailable" }
        val revision =
            expectedRevision
                ?: throw AiGenerationException.Coded(ErrorCode.STALE_GENERATION_REVISION, currentRevision = record.revision)
        if (revision != record.revision) {
            throw AiGenerationException.Coded(ErrorCode.STALE_GENERATION_REVISION, currentRevision = record.revision)
        }
        if (record.status == JobStatus.COMMITTED) {
            requireMatchingReceipt(persistence, record, revision)
            if (record.cleanupPending) cleanup.cleanup(record.jobId, revision, record.clubId)
            return CommitGenerationResult(
                record.sessionId,
                JobStatus.COMMITTED,
                recovered = true,
                participantUpdatesCount = null,
            )
        }
        transitionPolicy.requireCommit(record.status, record.jobId)
        val base =
            record.result
                ?: throw AiGenerationException.IllegalGenerationState(record.jobId, record.status.name, "commit")
        val submitted = submittedResult ?: base
        validateGroundedReview(base, submitted, sectionReviews)
        val transcriptNames = record.validatedTurns.map { it.speakerName }.distinct()
        val trustedMeta = record.toSessionMeta().copy(expectedAuthorNames = transcriptNames)
        when (val outcome = validator.validate(submitted, trustedMeta)) {
            is ValidationResult.Ok -> Unit
            is ValidationResult.Violation -> failCommit(record, outcome)
        }

        when (val lease = jobStore.acquireCommitLease(record.jobId, revision, clock.instant(), COMMIT_LEASE_DURATION)) {
            is CommitLeaseResult.Acquired -> Unit
            is CommitLeaseResult.RevisionConflict ->
                throw AiGenerationException.Coded(
                    ErrorCode.STALE_GENERATION_REVISION,
                    currentRevision = jobStore.loadMetadata(record.jobId)?.revision,
                )
            is CommitLeaseResult.AlreadyCommitting ->
                throw AiGenerationException.IllegalGenerationState(record.jobId, JobStatus.COMMITTING.name, "commit")
            CommitLeaseResult.Expired -> throw JobNotFoundException(record.jobId)
            CommitLeaseResult.NotReady ->
                throw AiGenerationException.IllegalGenerationState(record.jobId, record.status.name, "commit")
        }

        persistence.findReceipt(record.jobId, revision)?.let { receipt ->
            requireReceiptMatches(receipt, record)
            finalizeGroundedCommit(record, revision, cleanup)
            return CommitGenerationResult(record.sessionId, JobStatus.COMMITTED, recovered = true, participantUpdatesCount = null)
        }

        val transactionResult =
            try {
                transactions.execute {
                    val participantUpdates =
                        persistence.upsertTranscriptSpeakersAsParticipants(record.clubId, record.sessionId, record.validatedTurns)
                    commitDelegate.commitValidated(
                        ValidatedSessionImportInput(
                            command = toSessionImportCommand(host, submitted, record.sessionId, recordVisibility),
                            authorMembershipIdsByName =
                                record.validatedTurns.associate { it.speakerName to it.speakerMembershipId },
                        ),
                    )
                    check(
                        persistence.insertReceipt(
                            AiGenerationCommitReceipt(record.jobId, revision, record.sessionId, record.clubId, clock.instant()),
                        ),
                    ) { "Grounded commit receipt already exists" }
                    writeCommitAudit(record, sectionReviews.orEmpty(), AuditStatus.SUCCESS, null)
                    participantUpdates
                }
            } catch (error: RuntimeException) {
                val committedReceipt = persistence.findReceipt(record.jobId, revision)
                if (committedReceipt != null) {
                    requireReceiptMatches(committedReceipt, record)
                    finalizeGroundedCommit(record, revision, cleanup)
                    return CommitGenerationResult(record.sessionId, JobStatus.COMMITTED, recovered = true, participantUpdatesCount = null)
                }
                jobStore.releaseCommitLeaseForRetry(record.jobId, revision)
                if (error is AiGenerationMembershipChangedException) {
                    throw AiGenerationException.Coded(ErrorCode.MEMBERSHIP_CHANGED)
                }
                if (error is InvalidSessionImportException) {
                    throw AiGenerationException.Coded(ErrorCode.SCHEMA_INVALID)
                }
                throw error
            }

        finalizeGroundedCommit(record, revision, cleanup)
        return CommitGenerationResult(record.sessionId, JobStatus.COMMITTED, recovered = false, participantUpdatesCount = transactionResult)
    }

    @Suppress("ComplexCondition")
    private fun validateGroundedReview(
        base: SessionImportV1Snapshot,
        submitted: SessionImportV1Snapshot,
        reviews: Map<GenerationItem, SectionReviewStatus>?,
    ) {
        if (base.format != submitted.format || base.sessionNumber != submitted.sessionNumber ||
            base.bookTitle != submitted.bookTitle || base.meetingDate != submitted.meetingDate ||
            reviews?.keys != GenerationItem.entries.toSet()
        ) {
            throw AiGenerationException.Coded(ErrorCode.SCHEMA_INVALID)
        }
        val changed =
            mapOf(
                GenerationItem.SUMMARY to (base.summary != submitted.summary),
                GenerationItem.HIGHLIGHTS to (base.highlights != submitted.highlights),
                GenerationItem.ONE_LINE_REVIEWS to (base.oneLineReviews != submitted.oneLineReviews),
                GenerationItem.FEEDBACK_DOCUMENT to
                    (
                        base.feedbackDocumentFileName != submitted.feedbackDocumentFileName ||
                            base.feedbackDocumentMarkdown != submitted.feedbackDocumentMarkdown
                    ),
            )
        changed.forEach { (section, edited) ->
            val expected = if (edited) SectionReviewStatus.USER_EDITED_CONFIRMED else SectionReviewStatus.AI_GROUNDED_REVIEWED
            if (reviews[section] != expected) throw AiGenerationException.Coded(ErrorCode.SCHEMA_INVALID)
        }
    }

    private fun finalizeGroundedCommit(
        record: JobRecord,
        revision: Long,
        cleanup: AiGenerationPostCommitCleanupService,
    ) {
        val current = jobStore.loadMetadata(record.jobId)
        if (current?.status != JobStatus.COMMITTED) {
            check(jobStore.markCommittedForCleanup(record.jobId, revision)) { "Unable to finalize grounded commit" }
        }
        cleanup.cleanup(record.jobId, revision, record.clubId)
    }

    private fun requireMatchingReceipt(
        persistence: AiGenerationCommitPersistencePort,
        record: JobRecord,
        revision: Long,
    ) {
        val receipt =
            persistence.findReceipt(record.jobId, revision)
                ?: throw AiGenerationException.IllegalGenerationState(record.jobId, record.status.name, "commit")
        requireReceiptMatches(receipt, record)
    }

    private fun requireReceiptMatches(
        receipt: AiGenerationCommitReceipt,
        record: JobRecord,
    ) {
        if (receipt.sessionId != record.sessionId || receipt.clubId != record.clubId) {
            throw AiGenerationException.IllegalGenerationState(record.jobId, record.status.name, "commit")
        }
    }

    private fun writeCommitAudit(
        record: JobRecord,
        sectionReviews: Map<GenerationItem, SectionReviewStatus>,
        status: AuditStatus,
        errorCode: ErrorCode?,
    ) {
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
                status = status,
                errorCode = errorCode,
                errorMessage = null,
                latencyMs = 0,
                createdAt = clock.instant(),
                pipelineVersion = GROUNDED_PIPELINE_VERSION,
                inputTurnCount = record.validatedTurns.size,
                speakerCount =
                    record.validatedTurns
                        .map { it.speakerMembershipId }
                        .distinct()
                        .size,
                groundingStatus = record.groundingStatus?.name,
                reviewedSectionCount = sectionReviews.size,
                userEditedSectionCount = sectionReviews.values.count { it == SectionReviewStatus.USER_EDITED_CONFIRMED },
            ),
        )
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
                errorMessage = null,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        throw AiGenerationException.Coded(violation.code)
    }

    private companion object {
        val COMMIT_LEASE_DURATION: Duration = Duration.ofMinutes(2)
    }
}
