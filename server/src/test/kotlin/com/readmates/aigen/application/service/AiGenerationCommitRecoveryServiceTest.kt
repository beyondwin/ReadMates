@file:Suppress("MaxLineLength")

package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class AiGenerationCommitRecoveryServiceTest {
    @Test
    fun `receipt backed committing job converges to committed cleanup without import`() {
        val store = FakeJobStore()
        val record =
            AiGenerationTestFixtures
                .jobRecord(
                    status = JobStatus.SUCCEEDED,
                    result = AiGenerationTestFixtures.snapshot(),
                ).copy(revision = 2)
        store.save(record)
        store.acquireCommitLease(record.jobId, 2, AiGenerationTestFixtures.NOW, java.time.Duration.ofMinutes(1))
        val persistence = FakeCommitPersistence()
        persistence.receipt = AiGenerationCommitReceipt(record.jobId, 2, record.sessionId, record.clubId, AiGenerationTestFixtures.NOW)
        val service =
            AiGenerationCommitRecoveryService(
                store,
                persistence,
                AiGenerationPostCommitCleanupService(store, ReadCacheInvalidationPort.Noop()),
                FakeClock(AiGenerationTestFixtures.NOW),
            )

        val result = service.recover(record.jobId)

        assertThat(result.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(store.loadMetadata(record.jobId)?.cleanupPending).isFalse()
    }

    @Test
    fun `expired lease without receipt becomes commit retry and retains payload`() {
        val store = FakeJobStore()
        val record =
            AiGenerationTestFixtures
                .jobRecord(
                    status = JobStatus.SUCCEEDED,
                    result = AiGenerationTestFixtures.snapshot(),
                ).copy(revision = 2)
        store.save(record)
        store.acquireCommitLease(record.jobId, 2, AiGenerationTestFixtures.NOW.minusSeconds(120), java.time.Duration.ofSeconds(1))
        val service =
            AiGenerationCommitRecoveryService(
                store,
                FakeCommitPersistence(),
                AiGenerationPostCommitCleanupService(store, ReadCacheInvalidationPort.Noop()),
                FakeClock(AiGenerationTestFixtures.NOW),
            )

        assertThat(service.recover(record.jobId).status).isEqualTo(JobStatus.COMMIT_RETRY)
        assertThat(store.load(record.jobId)?.result).isNotNull()
    }
}

private class FakeCommitPersistence : AiGenerationCommitPersistencePort {
    var receipt: AiGenerationCommitReceipt? = null

    override fun upsertTranscriptSpeakersAsParticipants(
        clubId: UUID,
        sessionId: UUID,
        validatedTurns: List<ValidatedTranscriptTurn>,
    ) = 0

    override fun findReceipt(
        jobId: UUID,
        revision: Long,
    ) = receipt?.takeIf { it.jobId == jobId && it.revision == revision }

    override fun insertReceipt(receipt: AiGenerationCommitReceipt) =
        if (this.receipt == null) {
            this.receipt = receipt
            true
        } else {
            false
        }
}
