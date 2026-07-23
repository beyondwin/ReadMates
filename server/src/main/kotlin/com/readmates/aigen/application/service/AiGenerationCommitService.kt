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
import com.readmates.sessionimport.application.port.`in`.SaveValidatedSessionRecordDraftUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportDraftInput
import com.readmates.sessionimport.application.service.InvalidSessionImportException
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.shared.security.Sha256
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
 *  4. Convert to a [SessionImportCommand] and save a shared validated draft.
 *  5. Delete transient Redis payload, write a COMMIT SUCCESS audit row, return the result.
 *
 * Trust boundary: transcript/evidence remain transient. Only the final canonical
 * record snapshot reaches MySQL through the shared draft contract.
 */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationCommitService(
    private val jobStore: AiGenerationJobStore,
    private val auditPort: AiGenerationAuditPort,
    private val validator: SessionImportV1Validator,
    private val commitDelegate: SaveValidatedSessionRecordDraftUseCase,
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
        expectedDraftRevision: Long?,
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
            expectedDraftRevision,
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
        expectedDraftRevision: Long?,
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
        val requestSha256 =
            commitRequestSha256(
                recordVisibility,
                submittedResult,
                revision,
                sectionReviews,
                expectedDraftRevision,
            )
        if (record.status == JobStatus.COMMITTED) {
            val receipt = requireMatchingReceipt(persistence, record, revision, requestSha256)
            if (record.cleanupPending) cleanup.cleanup(record.jobId, revision, record.clubId)
            return CommitGenerationResult(
                record.sessionId,
                JobStatus.COMMITTED,
                recovered = true,
                participantUpdatesCount = null,
                draftRevision = receipt.draftRevision,
                baseLiveRevision = receipt.baseLiveRevision,
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
            requireReceiptMatches(receipt, record, requestSha256)
            finalizeGroundedCommit(record, revision, cleanup)
            return CommitGenerationResult(
                record.sessionId,
                JobStatus.COMMITTED,
                recovered = true,
                participantUpdatesCount = null,
                draftRevision = receipt.draftRevision,
                baseLiveRevision = receipt.baseLiveRevision,
            )
        }

        val transactionResult =
            try {
                transactions.execute {
                    val participantUpdates =
                        persistence.upsertTranscriptSpeakersAsParticipants(record.clubId, record.sessionId, record.validatedTurns)
                    val draft =
                        commitDelegate.saveValidated(
                            ValidatedSessionImportDraftInput(
                                command = toSessionImportCommand(host, submitted, record.sessionId, recordVisibility),
                                authorMembershipIdsByName =
                                    record.validatedTurns.associate { it.speakerName to it.speakerMembershipId },
                                source = SessionRecordDraftSource.AI_GENERATED,
                                expectedDraftRevision = expectedDraftRevision,
                            ),
                        )
                    check(
                        persistence.insertReceipt(
                            AiGenerationCommitReceipt(
                                record.jobId,
                                revision,
                                record.sessionId,
                                record.clubId,
                                clock.instant(),
                                draft.draftRevision,
                                draft.baseLiveRevision,
                                requestSha256,
                            ),
                        ),
                    ) { "Grounded commit receipt already exists" }
                    writeCommitAudit(record, sectionReviews.orEmpty(), AuditStatus.SUCCESS, null)
                    CommitTransactionResult(
                        participantUpdates = participantUpdates,
                        draftRevision = draft.draftRevision,
                        baseLiveRevision = draft.baseLiveRevision,
                    )
                }
            } catch (error: RuntimeException) {
                val committedReceipt = persistence.findReceipt(record.jobId, revision)
                if (committedReceipt != null) {
                    requireReceiptMatches(committedReceipt, record, requestSha256)
                    finalizeGroundedCommit(record, revision, cleanup)
                    return CommitGenerationResult(
                        record.sessionId,
                        JobStatus.COMMITTED,
                        recovered = true,
                        participantUpdatesCount = null,
                        draftRevision = committedReceipt.draftRevision,
                        baseLiveRevision = committedReceipt.baseLiveRevision,
                    )
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
        return CommitGenerationResult(
            sessionId = record.sessionId,
            status = JobStatus.COMMITTED,
            recovered = false,
            participantUpdatesCount = transactionResult.participantUpdates,
            draftRevision = transactionResult.draftRevision,
            baseLiveRevision = transactionResult.baseLiveRevision,
        )
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
        requestSha256: String,
    ): AiGenerationCommitReceipt {
        val receipt =
            persistence.findReceipt(record.jobId, revision)
                ?: throw AiGenerationException.IllegalGenerationState(record.jobId, record.status.name, "commit")
        requireReceiptMatches(receipt, record, requestSha256)
        return receipt
    }

    private fun requireReceiptMatches(
        receipt: AiGenerationCommitReceipt,
        record: JobRecord,
        requestSha256: String,
    ) {
        val matches =
            listOf(
                receipt.sessionId == record.sessionId,
                receipt.clubId == record.clubId,
                receipt.requestSha256 == requestSha256,
                receipt.draftRevision != null,
                receipt.baseLiveRevision != null,
            ).all { it }
        if (!matches) {
            throw AiGenerationException.IllegalGenerationState(record.jobId, record.status.name, "commit")
        }
    }

    private fun commitRequestSha256(
        visibility: SessionRecordVisibility,
        submittedResult: SessionImportV1Snapshot?,
        revision: Long,
        sectionReviews: Map<GenerationItem, SectionReviewStatus>?,
        expectedDraftRevision: Long?,
    ): String =
        Sha256.hex(
            buildString {
                append("aigen-commit:v1\n")
                append(visibility.name).append('\n')
                append(revision).append('\n')
                append(expectedDraftRevision?.toString() ?: "none").append('\n')
                append(submittedResult?.toString() ?: "server-result").append('\n')
                GenerationItem.entries.forEach { item ->
                    append(item.name).append('=').append(sectionReviews?.get(item)?.name ?: "missing").append('\n')
                }
            },
        )

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

    private data class CommitTransactionResult(
        val participantUpdates: Int,
        val draftRevision: Long,
        val baseLiveRevision: Long,
    )
}
