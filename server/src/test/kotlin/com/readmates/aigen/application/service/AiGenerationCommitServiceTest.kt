package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.auth.domain.MembershipRole
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
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationCommitServiceTest {
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

        assertThat(result.sessionId).isEqualTo(ctx.sessionId.toString())
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
        assertThat(audit.errorMessage).doesNotContain("Private Name")
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
        val host: CurrentMember =
            CurrentMember(
                userId = UUID.randomUUID(),
                membershipId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                clubSlug = "test-club",
                email = "host@example.com",
                displayName = "Host User",
                accountName = "host",
                role = MembershipRole.HOST,
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
}
