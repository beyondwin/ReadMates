@file:Suppress("MaxLineLength")

package com.readmates.aigen.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.shared.cache.ReadCacheInvalidationPort
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.UUID

@ResourceLock("AiGenerationCommitRecoveryServiceLogger")
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
                fakeMetrics(),
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
            val results = service.recoverBatch()

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
