@file:Suppress("MaxLineLength")

package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.AiGenerationPipelineMode
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
        assertThat(audit.pipelineVersion).isEqualTo("GROUNDED_WHOLE_TRANSCRIPT")
        assertThat(audit.reviewedSectionCount).isEqualTo(4)
        assertThat(audit.userEditedSectionCount).isEqualTo(1)
        assertThat(audit.inputTurnCount).isEqualTo(2)
        assertThat(audit.speakerCount).isEqualTo(2)
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
    fun `commit happy path delegates to CommitValidatedSessionImportUseCase and deletes the job`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        val result =
            ctx.service.commit(
                host = ctx.host,
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                recordVisibility = SessionRecordVisibility.MEMBER,
                overrideResult = null,
            )

        assertThat(result.sessionId).isEqualTo(ctx.sessionId)
        assertThat(result.status).isEqualTo(JobStatus.COMMITTED)
        val delegateCalls = ctx.delegate.invocations
        assertThat(delegateCalls).hasSize(1)
        val deliveredCommand = delegateCalls.single().command
        assertThat(deliveredCommand.host).isSameAs(ctx.host)
        assertThat(deliveredCommand.sessionId).isEqualTo(ctx.sessionId)
        assertThat(deliveredCommand.recordVisibility).isEqualTo(SessionRecordVisibility.MEMBER)
        assertThat(deliveredCommand.session.bookTitle).isEqualTo(record.result!!.bookTitle)
        assertThat(deliveredCommand.publication.summary).isEqualTo(record.result!!.summary)
        assertThat(ctx.jobStore.transientPayloadDeleted).containsExactly(record.jobId)
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.COMMIT)
        assertThat(audit.status).isEqualTo(AuditStatus.SUCCESS)
    }

    @Test
    fun `commit with overrideResult validates and then overwrites Redis snapshot`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot("auto-generated"),
            )
        ctx.jobStore.save(record)
        val edited = AiGenerationTestFixtures.snapshot("user-edited summary")

        ctx.service.commit(
            host = ctx.host,
            sessionId = ctx.sessionId,
            jobId = record.jobId,
            recordVisibility = SessionRecordVisibility.MEMBER,
            overrideResult = edited,
        )

        // The validator must have seen the user-edited snapshot.
        val validatedSnapshot =
            ctx.validator.calls
                .single()
                .first
        assertThat(validatedSnapshot.summary).isEqualTo("user-edited summary")
        // And the delegate command must have summary from the override.
        val command =
            ctx.delegate.invocations
                .single()
                .command
        assertThat(command.publication.summary).isEqualTo("user-edited summary")
    }

    @Test
    fun `commit throws when validator returns Violation and writes FAILED audit row`() {
        val ctx = TestContext()
        ctx.validator.result = ValidationResult.Violation(ErrorCode.AUTHOR_NAME_MISMATCH)
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(
                host = ctx.host,
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                recordVisibility = SessionRecordVisibility.MEMBER,
                overrideResult = null,
            )
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH)
        }

        assertThat(ctx.delegate.invocations).isEmpty()
        assertThat(ctx.jobStore.deleted).isEmpty()
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH)
    }

    @Test
    fun `commit does not persist override when validator rejects it`() {
        val ctx = TestContext()
        ctx.validator.result = ValidationResult.Violation(ErrorCode.AUTHOR_NAME_MISMATCH)
        val original = AiGenerationTestFixtures.snapshot("auto-generated original")
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = original,
            )
        ctx.jobStore.save(record)
        val badOverride = AiGenerationTestFixtures.snapshot("user-edited bad summary")

        assertThatThrownBy {
            ctx.service.commit(
                host = ctx.host,
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                recordVisibility = SessionRecordVisibility.MEMBER,
                overrideResult = badOverride,
            )
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH)
        }

        // Redis result MUST be unchanged on failed validation — the trust boundary
        // requires validation BEFORE we mutate the persisted snapshot.
        val current = ctx.jobStore.load(record.jobId)!!.result!!
        assertThat(current.summary).isEqualTo("auto-generated original")
        assertThat(ctx.delegate.invocations).isEmpty()
    }

    @Test
    fun `commit override validates authors against original session metadata`() {
        val ctx = TestContext()
        val originalMeta =
            AiGenerationTestFixtures.sessionMeta(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                expectedAuthorNames = listOf("Real Host"),
            )
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
                sessionMeta = originalMeta,
            )
        ctx.jobStore.save(record)
        val injectedOverride =
            AiGenerationTestFixtures.snapshot().copy(
                highlights =
                    listOf(
                        SessionImportV1Snapshot.AuthoredText("Injected Person", "Untrusted edit."),
                    ),
                oneLineReviews =
                    listOf(
                        SessionImportV1Snapshot.AuthoredText("Injected Person", "Untrusted review."),
                    ),
            )
        ctx.validator.resultProvider = { _, meta ->
            if ("Injected Person" in meta.expectedAuthorNames) {
                ValidationResult.Ok
            } else {
                ValidationResult.Violation(ErrorCode.AUTHOR_NAME_MISMATCH, "unknown author")
            }
        }

        assertThatThrownBy {
            ctx.service.commit(
                host = ctx.host,
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                recordVisibility = SessionRecordVisibility.MEMBER,
                overrideResult = injectedOverride,
            )
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.AUTHOR_NAME_MISMATCH)
        }

        val validatedMeta =
            ctx.validator.calls
                .single()
                .second
        assertThat(validatedMeta.expectedAuthorNames).containsExactly("Real Host")
        assertThat(ctx.delegate.invocations).isEmpty()
    }

    @Test
    fun `commit maps downstream invalid import to safe AI schema error`() {
        val ctx = TestContext()
        ctx.delegate.exception =
            InvalidSessionImportException(
                listOf(SessionImportIssue("AUTHOR_NOT_FOUND", "작성자 'Private Name'을 찾을 수 없습니다.")),
            )
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(
                host = ctx.host,
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                recordVisibility = SessionRecordVisibility.MEMBER,
                overrideResult = null,
            )
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.SCHEMA_INVALID)
            assertThat(it.message).doesNotContain("Private Name")
        }

        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorMessage).isNull()
    }

    @Test
    fun `commit transitions succeeded to committing to committed and deletes transient payload`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, null)

        val stored = ctx.jobStore.load(record.jobId)!!
        assertThat(stored.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(stored.result).isNull()
        assertThat(stored.transcript).isEmpty()
        assertThat(ctx.jobStore.transientPayloadDeleted).containsExactly(record.jobId)
        assertThat(ctx.jobStore.statusTransitions.map { it.second to it.third })
            .containsExactly(JobStatus.SUCCEEDED to JobStatus.COMMITTING, JobStatus.COMMITTING to JobStatus.COMMITTED)

        assertThat(ctx.jobStore.mutationOrder)
            .containsSubsequence("transition:COMMITTED", "deleteTransient")
    }

    @Test
    fun `commit delegate failure restores job to succeeded for retry`() {
        val ctx = TestContext()
        ctx.delegate.exception =
            InvalidSessionImportException(
                listOf(SessionImportIssue("INVALID", "safe validation failure")),
            )
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, null)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.SCHEMA_INVALID)
        }

        val stored = ctx.jobStore.load(record.jobId)!!
        assertThat(stored.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(stored.result).isNotNull
        assertThat(ctx.jobStore.transientPayloadDeleted).isEmpty()
    }

    @Test
    fun `commit rejects when job is not succeeded`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.COMMITTING,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, null)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.delegate.invocations).isEmpty()
    }

    @Test
    fun `second commit for the same job is rejected after committed transition`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, null)

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, null)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.delegate.invocations).hasSize(1)
    }

    @Test
    fun `commit delegate runtime failure restores job to succeeded and rethrows`() {
        val ctx = TestContext()
        ctx.delegate.exception = IllegalStateException("downstream transient failure")
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.host.clubId,
                hostUserId = ctx.host.userId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.commit(ctx.host, ctx.sessionId, record.jobId, SessionRecordVisibility.MEMBER, null)
        }.isInstanceOf(IllegalStateException::class.java)

        val stored = ctx.jobStore.load(record.jobId)!!
        assertThat(stored.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(ctx.jobStore.transientPayloadDeleted).isEmpty()
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.COMMIT)
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.UNKNOWN)
    }

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
                TransactionTemplate(NoOpTransactionManager()),
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
                    pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
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

    private class NoOpTransactionManager : AbstractPlatformTransactionManager() {
        override fun doGetTransaction(): Any = Any()

        override fun doBegin(
            transaction: Any,
            definition: org.springframework.transaction.TransactionDefinition,
        ) = Unit

        override fun doCommit(status: DefaultTransactionStatus) = Unit

        override fun doRollback(status: DefaultTransactionStatus) = Unit
    }
}
