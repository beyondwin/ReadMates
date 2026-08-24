package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.AiGenerationCommitRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceAcquisition
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceLease
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceOutcome
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandPort
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandReceiptRecord
import com.readmates.aigen.application.port.out.LoadAiGenerationAdminCommandPreviewResult
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOrigin
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOriginResult
import com.readmates.aigen.application.port.out.StoredAiGenerationAdminCommandPreview
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import org.mockito.Mockito.`when` as whenever

@Suppress("MaxLineLength")
class AiGenerationAdminCommandConvergenceServiceTest {
    private val jobStore = FakeJobStore()
    private val port = ConvergencePort()
    private val recovery = mock(AiGenerationCommitRecoveryService::class.java)
    private val service =
        AiGenerationAdminCommandConvergenceService(
            commandPort = port,
            jobStore = jobStore,
            commitRecoveryService = recovery,
            clock = Clock.fixed(NOW, ZoneOffset.UTC),
        )

    @Test
    fun `force cancel applies revision CAS payload cleanup and succeeds without provider cancel`() {
        val job =
            AiGenerationTestFixtures
                .jobRecord(status = JobStatus.RUNNING, stage = JobStage.GENERATING_RECORD)
                .copy(revision = 7)
        jobStore.save(job)
        port.lease = lease(job.jobId, AiOpsAction.FORCE_CANCEL, expectedRevision = 7, attemptNo = 1)

        service.process(CONVERGENCE_ID)

        assertThat(jobStore.loadMetadata(job.jobId)?.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(jobStore.loadMetadata(job.jobId)?.revision).isEqualTo(8)
        assertThat(jobStore.transientPayloadDeleted).containsExactly(job.jobId)
        assertThat(port.outcomes.single().state).isEqualTo("SUCCEEDED")
        assertThat(port.outcomes.single().safeErrorCode).isNull()
    }

    @Test
    fun `retry commit delegates exact job to existing recovery service`() {
        val job =
            AiGenerationTestFixtures
                .jobRecord(status = JobStatus.COMMIT_RETRY, stage = JobStage.READY)
                .copy(revision = 4)
        jobStore.save(job)
        port.lease = lease(job.jobId, AiOpsAction.RETRY_COMMIT, expectedRevision = 4, attemptNo = 1)
        whenever(recovery.recover(job.jobId))
            .thenReturn(AiGenerationCommitRecoveryResult(job.jobId, JobStatus.COMMITTED, true))

        service.process(CONVERGENCE_ID)

        assertThat(port.outcomes.single().state).isEqualTo("SUCCEEDED")
    }

    @Test
    fun `transient cancel failure retries then terminalizes at the bounded third attempt`() {
        val job =
            AiGenerationTestFixtures
                .jobRecord(status = JobStatus.RUNNING, stage = JobStage.GENERATING_RECORD)
                .copy(revision = 7)
        jobStore.save(job)
        port.lease = lease(job.jobId, AiOpsAction.FORCE_CANCEL, expectedRevision = 7, attemptNo = 3)
        jobStore.records.remove(job.jobId)

        service.process(CONVERGENCE_ID)

        assertThat(port.outcomes.single().state).isEqualTo("FAILED")
        assertThat(port.outcomes.single().safeErrorCode).isEqualTo("JOB_EXPIRED")
        assertThat(port.outcomes.single().availableAt).isNull()
    }

    private fun lease(
        jobId: UUID,
        action: AiOpsAction,
        expectedRevision: Long,
        attemptNo: Int,
    ) = AiGenerationAdminCommandConvergenceLease(
        CONVERGENCE_ID,
        RECEIPT_ID,
        if (action == AiOpsAction.FORCE_CANCEL) "AI_JOB_CANCEL" else "AI_COMMIT_RETRY",
        jobId,
        action,
        expectedRevision,
        attemptNo,
    )

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T03:00:00Z")
        val CONVERGENCE_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000021")
        val RECEIPT_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000022")
    }
}

@Suppress("MaxLineLength")
private class ConvergencePort : AiGenerationAdminCommandPort {
    lateinit var lease: AiGenerationAdminCommandConvergenceLease
    val outcomes = mutableListOf<AiGenerationAdminCommandConvergenceOutcome>()

    override fun savePreview(preview: StoredAiGenerationAdminCommandPreview) = Unit

    override fun loadPreview(previewId: UUID) = LoadAiGenerationAdminCommandPreviewResult.Missing

    override fun storeOrigin(command: StoreAiGenerationAdminCommandOrigin) = StoreAiGenerationAdminCommandOriginResult.PreviewConsumed

    override fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        jobId: UUID,
        action: AiOpsAction,
    ): AiGenerationAdminCommandReceiptRecord? = null

    override fun loadAvailableConvergenceIds(
        now: Instant,
        limit: Int,
    ) = listOf(lease.convergenceId)

    override fun tryAcquireConvergence(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ) = AiGenerationAdminCommandConvergenceAcquisition.Acquired(lease)

    override fun finishConvergence(
        lease: AiGenerationAdminCommandConvergenceLease,
        leaseOwner: String,
        outcome: AiGenerationAdminCommandConvergenceOutcome,
        completedAt: Instant,
    ): Boolean {
        outcomes += outcome
        return true
    }
}
