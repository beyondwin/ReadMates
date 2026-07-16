@file:Suppress("MaxLineLength")

package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.SectionReviewStatus
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.aigen.application.port.out.AiGenerationMembershipChangedException
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportCommittedFeedbackDocument
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentPreview
import com.readmates.sessionimport.application.model.SessionImportIssue
import com.readmates.sessionimport.application.model.SessionImportPublicationPreview
import com.readmates.sessionimport.application.port.`in`.CommitValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportInput
import com.readmates.sessionimport.application.service.InvalidSessionImportException
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.AbstractPlatformTransactionManager
import org.springframework.transaction.support.DefaultTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

class AiGenerationCommitServiceTest {
    @Test
    fun `grounded identical snapshot requires all grounded-reviewed sections and commits with participant count`() {
        val ctx = GroundedContext()
        val record = ctx.record()
        ctx.jobStore.save(record)

        val result =
            ctx.service.commit(
                ctx.host,
                ctx.sessionId,
                record.jobId,
                SessionRecordVisibility.MEMBER,
                record.result,
                record.revision,
                groundedReviews(),
            )

        assertThat(result.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(result.participantUpdatesCount).isEqualTo(2)
        assertThat(ctx.persistence.upsertCalls).isEqualTo(1)
        assertThat(ctx.delegate.invocations).hasSize(1)
        assertThat(
            ctx.delegate.invocations
                .single()
                .authorMembershipIdsByName.keys,
        ).containsExactlyInAnyOrder("Alice", "Bob")
    }

    @Test
    fun `grounded edited section requires user-edited confirmation while unchanged stay grounded-reviewed`() {
        val ctx = GroundedContext()
        val record = ctx.record()
        ctx.jobStore.save(record)
        val edited = record.result!!.copy(summary = "Edited summary")
        val reviews =
            groundedReviews().toMutableMap().apply {
                this[GenerationItem.SUMMARY] = SectionReviewStatus.USER_EDITED_CONFIRMED
            }

        ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, edited, 2, reviews)

        assertThat(ctx.jobStore.load(record.jobId)?.result).isNull()
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.pipelineVersion).isEqualTo("grounded-session-generation-v2")
        assertThat(audit.reviewedSectionCount).isEqualTo(4)
        assertThat(audit.userEditedSectionCount).isEqualTo(1)
        assertThat(audit.inputTurnCount).isEqualTo(2)
        assertThat(audit.speakerCount).isEqualTo(2)
    }

    @Test
    fun `grounded receipt and success audit are written in the same database transaction`() {
        val ctx = GroundedContext()
        val record = ctx.record()
        ctx.jobStore.save(record)
        ctx.auditPort.onInsert = { assertThat(ctx.transactionManager.active).isTrue() }

        ctx.service.commit(
            ctx.host,
            ctx.sessionId,
            record.jobId,
            SessionRecordVisibility.MEMBER,
            record.result,
            record.revision,
            groundedReviews(),
        )

        assertThat(ctx.auditPort.entries).hasSize(1)
        assertThat(ctx.persistence.receipt).isNotNull()
    }

    @Test
    fun `grounded rejects false review claims and missing sections before lease`() {
        listOf(
            groundedReviews().toMutableMap().apply { this[GenerationItem.SUMMARY] = SectionReviewStatus.USER_EDITED_CONFIRMED },
            groundedReviews().filterKeys { it != GenerationItem.FEEDBACK_DOCUMENT },
        ).forEach { reviews ->
            val ctx = GroundedContext()
            val record = ctx.record()
            ctx.jobStore.save(record)

            assertThatThrownBy {
                ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, record.result, 2, reviews)
            }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { assertThat(it.code).isEqualTo(ErrorCode.SCHEMA_INVALID) }
            assertThat(ctx.jobStore.load(record.jobId)?.status).isEqualTo(JobStatus.SUCCEEDED)
            assertThat(ctx.persistence.upsertCalls).isZero()
        }
    }

    @Test
    fun `grounded stale revision rejects before lease and database`() {
        val ctx = GroundedContext()
        val record = ctx.record()
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, record.result, 1, groundedReviews())
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.STALE_GENERATION_REVISION)
            assertThat(it.currentRevision).isEqualTo(2)
        }
        assertThat(ctx.persistence.upsertCalls).isZero()
    }

    @Test
    fun `grounded validates author edits against persisted transcript speakers not legacy participants`() {
        val ctx = GroundedContext()
        ctx.validator.resultProvider = { snapshot, meta ->
            val authors = (snapshot.highlights + snapshot.oneLineReviews).map { it.authorName }
            if (authors.all { it in meta.expectedAuthorNames }) {
                ValidationResult.Ok
            } else {
                ValidationResult.Violation(ErrorCode.AUTHOR_NAME_MISMATCH)
            }
        }
        val record = ctx.record()
        ctx.jobStore.save(record)
        val injected =
            record.result!!.copy(
                highlights = listOf(SessionImportV1Snapshot.AuthoredText("Outside", "Edited")),
            )
        val reviews =
            groundedReviews().toMutableMap().apply {
                this[GenerationItem.HIGHLIGHTS] = SectionReviewStatus.USER_EDITED_CONFIRMED
            }

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, injected, 2, reviews)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { assertThat(it.code).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH) }
        assertThat(
            ctx.validator.calls
                .single()
                .second.expectedAuthorNames,
        ).containsExactly("Alice", "Bob")
    }

    @Test
    fun `grounded membership change moves lease to commit retry and retains payload`() {
        val ctx = GroundedContext()
        ctx.persistence.failure = AiGenerationMembershipChangedException()
        val record = ctx.record()
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, record.result, 2, groundedReviews())
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { assertThat(it.code).isEqualTo(ErrorCode.MEMBERSHIP_CHANGED) }
        assertThat(ctx.jobStore.load(record.jobId)?.status).isEqualTo(JobStatus.COMMIT_RETRY)
        assertThat(ctx.jobStore.load(record.jobId)?.result).isNotNull()
    }

    @Test
    fun `grounded repeated committed request uses receipt without reimport`() {
        val ctx = GroundedContext()
        val record = ctx.record()
        ctx.jobStore.save(record)
        ctx.service.commit(
            ctx.host,
            ctx.sessionId,
            record.jobId,
            SessionRecordVisibility.MEMBER,
            record.result,
            2,
            groundedReviews(),
        )

        val recovered =
            ctx.service.commit(
                ctx.host,
                ctx.sessionId,
                record.jobId,
                SessionRecordVisibility.MEMBER,
                null,
                2,
                groundedReviews(),
            )

        assertThat(recovered.recovered).isTrue()
        assertThat(ctx.delegate.invocations).hasSize(1)
    }

    private fun groundedReviews(): Map<GenerationItem, SectionReviewStatus> =
        GenerationItem.entries.associateWith { SectionReviewStatus.AI_GROUNDED_REVIEWED }

    @Test
    fun `commit throws JobNotFoundException when record missing`() {
        val ctx = TestContext()
        assertThatThrownBy {
            ctx.service.commit(
                host = ctx.host,
                sessionId = ctx.sessionId,
                jobId = UUID.randomUUID(),
                recordVisibility = SessionRecordVisibility.MEMBER,
                overrideResult = null,
            )
        }.isInstanceOf(JobNotFoundException::class.java)
    }

    private class TestContext {
        val sessionId: UUID = UUID.randomUUID()
        val host: AiGenerationActor =
            AiGenerationActor(
                userId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                clubSlug = "test-club",
                isHost = true,
            )

        val jobStore = FakeJobStore()
        val auditPort = FakeAuditPort()
        val validator = FakeValidator()
        val delegate = FakeCommitValidatedUseCase()
        val clock = FakeClock(AiGenerationTestFixtures.NOW)

        val service =
            AiGenerationCommitService(
                jobStore = jobStore,
                auditPort = auditPort,
                validator = validator,
                commitDelegate = delegate,
                clock = clock,
                transitionPolicy = AiGenerationJobTransitionPolicy(),
            )
    }

    private class FakeCommitValidatedUseCase : CommitValidatedSessionImportUseCase {
        val invocations: MutableList<ValidatedSessionImportInput> = mutableListOf()
        var exception: RuntimeException? = null

        override fun commitValidated(input: ValidatedSessionImportInput): SessionImportCommitResult {
            exception?.let { throw it }
            invocations += input
            val command: SessionImportCommand = input.command
            return SessionImportCommitResult(
                sessionId = command.sessionId.toString(),
                publication = SessionImportPublicationPreview(command.publication.summary),
                highlights = emptyList(),
                oneLineReviews = emptyList(),
                feedbackDocument =
                    SessionImportCommittedFeedbackDocument(
                        uploaded = true,
                        fileName = command.feedbackDocument.fileName,
                        title = "title",
                        uploadedAt = "2026-05-16T10:00:00Z",
                    ),
            )
        }
    }

    private class GroundedContext {
        val sessionId = UUID.randomUUID()
        val host = AiGenerationActor(UUID.randomUUID(), UUID.randomUUID(), "test-club", true)
        val jobStore = FakeJobStore()
        val auditPort = FakeAuditPort()
        val validator = FakeValidator()
        val delegate = FakeCommitValidatedUseCase()
        val persistence = RecordingCommitPersistence()
        val transactionManager = RecordingTransactionManager()
        private val cleanup = AiGenerationPostCommitCleanupService(jobStore, ReadCacheInvalidationPort.Noop())
        val service =
            AiGenerationCommitService(
                jobStore,
                auditPort,
                validator,
                delegate,
                FakeClock(AiGenerationTestFixtures.NOW),
                AiGenerationJobTransitionPolicy(),
                persistence,
                TransactionTemplate(transactionManager),
                cleanup,
            )

        fun record() =
            AiGenerationTestFixtures
                .jobRecord(
                    sessionId = sessionId,
                    clubId = host.clubId,
                    hostUserId = host.userId,
                    status = JobStatus.SUCCEEDED,
                    result = AiGenerationTestFixtures.snapshot(),
                    sessionMeta = AiGenerationTestFixtures.sessionMeta(sessionId, host.clubId, expectedAuthorNames = emptyList()),
                ).copy(
                    revision = 2,
                    validatedTurns =
                        listOf(
                            ValidatedTranscriptTurn("turn-0001", "Alice", UUID.randomUUID(), 0, "Public safe statement"),
                            ValidatedTranscriptTurn("turn-0002", "Bob", UUID.randomUUID(), 10, "Another public safe statement"),
                        ),
                )
    }

    private class RecordingCommitPersistence : AiGenerationCommitPersistencePort {
        var upsertCalls = 0
        var receipt: AiGenerationCommitReceipt? = null
        var failure: RuntimeException? = null

        override fun upsertTranscriptSpeakersAsParticipants(
            clubId: UUID,
            sessionId: UUID,
            validatedTurns: List<ValidatedTranscriptTurn>,
        ): Int {
            upsertCalls += 1
            failure?.let { throw it }
            return validatedTurns.map { it.speakerMembershipId }.distinct().size
        }

        override fun findReceipt(
            jobId: UUID,
            revision: Long,
        ) = receipt?.takeIf { it.jobId == jobId && it.revision == revision }

        override fun insertReceipt(receipt: AiGenerationCommitReceipt): Boolean {
            if (this.receipt != null) return false
            this.receipt = receipt
            return true
        }
    }

    private class RecordingTransactionManager : AbstractPlatformTransactionManager() {
        var active = false

        override fun doGetTransaction(): Any = Any()

        override fun doBegin(
            transaction: Any,
            definition: org.springframework.transaction.TransactionDefinition,
        ) {
            active = true
        }

        override fun doCommit(status: DefaultTransactionStatus) {
            active = false
        }

        override fun doRollback(status: DefaultTransactionStatus) {
            active = false
        }
    }
}
