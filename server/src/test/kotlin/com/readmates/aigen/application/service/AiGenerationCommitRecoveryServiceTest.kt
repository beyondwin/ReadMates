@file:Suppress("MaxLineLength")

package com.readmates.aigen.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.aigen.application.model.AiGenerationJobListOperation
import com.readmates.aigen.application.model.AiGenerationJobListResult
import com.readmates.aigen.application.model.AiGenerationJobListUnavailableException
import com.readmates.aigen.application.model.AiGenerationJobListUnavailableReason
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.shared.cache.ReadCacheInvalidationPort
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.UUID

@ResourceLock("AiGenerationCommitRecoveryServiceLogger")
class AiGenerationCommitRecoveryServiceTest {
    @Test
    fun `commit receipt wins over the lease and repeated recovery converges without importing twice`() {
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
        persistence.receipt =
            AiGenerationCommitReceipt(
                record.jobId,
                2,
                record.sessionId,
                record.clubId,
                AiGenerationTestFixtures.NOW,
                draftRevision = 1,
                baseLiveRevision = 0,
                requestSha256 = "a".repeat(64),
            )
        assertThat(store.loadMetadata(record.jobId)?.status).isEqualTo(JobStatus.COMMITTING)
        assertThat(store.loadMetadata(record.jobId)?.commitLeaseExpiresAt)
            .isEqualTo(AiGenerationTestFixtures.NOW.plusSeconds(60))
        val service =
            AiGenerationCommitRecoveryService(
                store,
                persistence,
                AiGenerationPostCommitCleanupService(store, ReadCacheInvalidationPort.Noop()),
                FakeClock(AiGenerationTestFixtures.NOW),
                fakeMetrics(),
            )

        val first = service.recover(record.jobId)
        val repeated = service.recover(record.jobId)

        assertThat(first.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(first.recovered).isTrue()
        assertThat(repeated.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(repeated.recovered).isTrue()
        val terminal = store.loadMetadata(record.jobId)
        assertThat(terminal?.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(terminal?.commitLeaseExpiresAt).isNull()
        assertThat(terminal?.cleanupPending).isFalse()
        assertThat(terminal?.result).isNull()
        assertThat(terminal?.transcript).isEmpty()
        assertThat(store.transientPayloadDeleted).containsExactly(record.jobId)
        assertThat(persistence.findReceiptCalls).isEqualTo(2)
        assertThat(persistence.importCalls).isZero()
        assertThat(persistence.insertReceiptCalls).isZero()
        assertThat(persistence.receipt?.requestSha256).isEqualTo("a".repeat(64))
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
                fakeMetrics(),
            )

        assertThat(service.recover(record.jobId).status).isEqualTo(JobStatus.COMMIT_RETRY)
        assertThat(store.load(record.jobId)?.result).isNotNull()
    }

    @Test
    fun `batch recovery records content-free warning and continues after one job fails`() {
        val store = FakeJobStore()
        val failingRecord =
            AiGenerationTestFixtures
                .jobRecord(
                    status = JobStatus.COMMIT_RETRY,
                    transcript = "SECRET-TRANSCRIPT-MARKER",
                    lastUpdatedAt = AiGenerationTestFixtures.NOW.minusSeconds(1),
                ).copy(revision = 2)
        val healthyRecord =
            AiGenerationTestFixtures
                .jobRecord(status = JobStatus.COMMIT_RETRY, lastUpdatedAt = AiGenerationTestFixtures.NOW)
                .copy(revision = 2)
        store.save(failingRecord)
        store.save(healthyRecord)
        val registry = SimpleMeterRegistry()
        val service =
            AiGenerationCommitRecoveryService(
                store,
                SelectiveFailingCommitPersistence(failingRecord.jobId),
                AiGenerationPostCommitCleanupService(store, ReadCacheInvalidationPort.Noop()),
                FakeClock(AiGenerationTestFixtures.NOW),
                AiGenerationMetrics(registry),
            )

        captureCommitRecoveryLogs().use { logs ->
            val results = service.recoverBatch(50)

            assertThat(results.map { it.jobId }).containsExactly(healthyRecord.jobId)
            val warning = logs.events.single()
            assertThat(warning.level).isEqualTo(Level.WARN)
            assertThat(warning.message)
                .isEqualTo("AI generation commit recovery failed jobId={} status={} errorType={}")
            assertThat(warning.argumentArray.toList()).containsExactly(
                failingRecord.jobId,
                JobStatus.COMMIT_RETRY,
                IllegalStateException::class.simpleName,
            )
            assertThat(warning.formattedMessage)
                .doesNotContain("SECRET-TRANSCRIPT-MARKER")
                .doesNotContain("private recovery failure")
        }

        val counter = registry.find("readmates.aigen.commit.recovery.failures").counter()
        assertThat(counter?.count()).isEqualTo(1.0)
        assertThat(counter?.id?.tags).isEmpty()
    }

    @Test
    fun `batch recovery treats available empty as success and unavailable scan as a safe failure`() {
        val store = FakeJobStore()
        val registry = SimpleMeterRegistry()
        val service =
            AiGenerationCommitRecoveryService(
                store,
                FakeCommitPersistence(),
                AiGenerationPostCommitCleanupService(store, ReadCacheInvalidationPort.Noop()),
                FakeClock(AiGenerationTestFixtures.NOW),
                AiGenerationMetrics(registry),
            )
        store.commitRecoveryJobsResult = AiGenerationJobListResult.Available(emptyList())

        assertThat(service.recoverBatch(50)).isEmpty()
        assertThat(registry.find("readmates.aigen.commit.recovery.failures").counter()).isNull()

        store.commitRecoveryJobsResult =
            AiGenerationJobListResult.Unavailable(
                AiGenerationJobListOperation.COMMIT_RECOVERY,
                AiGenerationJobListUnavailableReason.STORE_READ_FAILED,
            )

        assertThatThrownBy { service.recoverBatch(50) }
            .isInstanceOfSatisfying(AiGenerationJobListUnavailableException::class.java) {
                assertThat(it.operation).isEqualTo(AiGenerationJobListOperation.COMMIT_RECOVERY)
                assertThat(it.message).isEqualTo("AI generation job list unavailable")
                assertThat(it.cause).isNull()
            }
        assertThat(registry.find("readmates.aigen.commit.recovery.failures").counter()?.count()).isEqualTo(1.0)
    }
}

private class FakeCommitPersistence : AiGenerationCommitPersistencePort {
    var receipt: AiGenerationCommitReceipt? = null
    var findReceiptCalls = 0
    var importCalls = 0
    var insertReceiptCalls = 0

    override fun upsertTranscriptSpeakersAsParticipants(
        clubId: UUID,
        sessionId: UUID,
        validatedTurns: List<ValidatedTranscriptTurn>,
    ): Int {
        importCalls += 1
        return 0
    }

    override fun findReceipt(
        jobId: UUID,
        revision: Long,
    ): AiGenerationCommitReceipt? {
        findReceiptCalls += 1
        return receipt?.takeIf { it.jobId == jobId && it.revision == revision }
    }

    override fun insertReceipt(receipt: AiGenerationCommitReceipt): Boolean {
        insertReceiptCalls += 1
        return if (this.receipt == null) {
            this.receipt = receipt
            true
        } else {
            false
        }
    }
}

private class SelectiveFailingCommitPersistence(
    private val failingJobId: UUID,
) : AiGenerationCommitPersistencePort {
    override fun upsertTranscriptSpeakersAsParticipants(
        clubId: UUID,
        sessionId: UUID,
        validatedTurns: List<ValidatedTranscriptTurn>,
    ) = 0

    override fun findReceipt(
        jobId: UUID,
        revision: Long,
    ): AiGenerationCommitReceipt? {
        if (jobId == failingJobId) throw IllegalStateException("private recovery failure")
        return null
    }

    override fun insertReceipt(receipt: AiGenerationCommitReceipt) = true
}

private class CommitRecoveryLogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private fun captureCommitRecoveryLogs(): CommitRecoveryLogCapture {
    val logger = LoggerFactory.getLogger(AiGenerationCommitRecoveryService::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return CommitRecoveryLogCapture(logger, appender)
}
