package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
class RedisAiGenerationJobStoreTest(
    @param:Autowired private val store: AiGenerationJobStore,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val properties: AiGenerationProperties,
) : ReadmatesRedisIntegrationTestSupport() {
    @Test
    fun `save stores hash, transcript, result keys with 6h TTL`() {
        val record = newRecord()

        store.save(record)

        val hashKey = "aigen:job:${record.jobId}"
        val transcriptKey = "aigen:job:${record.jobId}:transcript"
        val resultKey = "aigen:job:${record.jobId}:result"

        assertThat(redisTemplate.hasKey(hashKey)).isTrue()
        assertThat(redisTemplate.hasKey(transcriptKey)).isTrue()
        // result is null on save → result key not created yet
        assertThat(redisTemplate.hasKey(resultKey)).isFalse()

        val ttlSeconds = properties.job.redisTtl.seconds
        val hashTtl = redisTemplate.getExpire(hashKey, TimeUnit.SECONDS)
        val transcriptTtl = redisTemplate.getExpire(transcriptKey, TimeUnit.SECONDS)
        assertThat(hashTtl).isBetween(ttlSeconds - 30, ttlSeconds + 30)
        assertThat(transcriptTtl).isBetween(ttlSeconds - 30, ttlSeconds + 30)
    }

    @Test
    fun `load returns the saved record with same identity fields`() {
        val record = newRecord()
        store.save(record)

        val loaded = store.load(record.jobId)

        assertThat(loaded).isNotNull
        assertThat(loaded!!.jobId).isEqualTo(record.jobId)
        assertThat(loaded.sessionId).isEqualTo(record.sessionId)
        assertThat(loaded.clubId).isEqualTo(record.clubId)
        assertThat(loaded.hostUserId).isEqualTo(record.hostUserId)
        assertThat(loaded.model).isEqualTo(record.model)
        assertThat(loaded.authorNameMode).isEqualTo(record.authorNameMode)
        assertThat(loaded.transcript).isEqualTo(record.transcript)
        assertThat(loaded.status).isEqualTo(record.status)
        assertThat(loaded.stage).isEqualTo(record.stage)
        assertThat(loaded.progressPct).isEqualTo(record.progressPct)
    }

    @Test
    fun `load returns null when job does not exist`() {
        val loaded = store.load(UUID.randomUUID())

        assertThat(loaded).isNull()
    }

    @Test
    fun `saveResult writes result JSON under the result key and accumulates usage`() {
        val record = newRecord()
        store.save(record)
        val snapshot = snapshot()

        store.saveResult(record.jobId, snapshot, TokenUsage(100, 50, 200), BigDecimal("0.01"))

        val resultKey = "aigen:job:${record.jobId}:result"
        val resultJson = redisTemplate.opsForValue().get(resultKey)
        assertThat(resultJson).isNotNull
        assertThat(resultJson).contains("\"readmates-session-import:v1\"")

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.result).isNotNull
        assertThat(loaded.result!!.bookTitle).isEqualTo(snapshot.bookTitle)
        assertThat(loaded.tokens.inputTokens).isEqualTo(100L)
        assertThat(loaded.tokens.cachedInputTokens).isEqualTo(50L)
        assertThat(loaded.tokens.outputTokens).isEqualTo(200L)
        assertThat(loaded.costAccumulatedUsd).isEqualByComparingTo(BigDecimal("0.01"))
    }

    @Test
    fun `patchItem atomically updates result and accumulates tokens plus cost`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(record.jobId, snapshot(), TokenUsage(100, 0, 200), BigDecimal("0.01"))

        val patched = snapshot().copy(summary = "patched summary text")
        store.patchItem(record.jobId, GenerationItem.SUMMARY, patched, TokenUsage(20, 0, 30), BigDecimal("0.005"))

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.result!!.summary).isEqualTo("patched summary text")
        assertThat(loaded.tokens.inputTokens).isEqualTo(120L)
        assertThat(loaded.tokens.outputTokens).isEqualTo(230L)
        assertThat(loaded.costAccumulatedUsd).isEqualByComparingTo(BigDecimal("0.015"))
    }

    @Test
    fun `updateStatus persists new status, stage, progress, error`() {
        val record = newRecord()
        store.save(record)

        store.updateStatus(record.jobId, JobStatus.RUNNING, JobStage.GENERATING_SUMMARY, 25, null)

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.status).isEqualTo(JobStatus.RUNNING)
        assertThat(loaded.stage).isEqualTo(JobStage.GENERATING_SUMMARY)
        assertThat(loaded.progressPct).isEqualTo(25)
        assertThat(loaded.error).isNull()
    }

    @Test
    fun `delete removes hash, transcript, and result keys`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(record.jobId, snapshot(), TokenUsage(1, 0, 1), BigDecimal("0.001"))

        store.delete(record.jobId)

        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}")).isFalse()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:transcript")).isFalse()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:result")).isFalse()
        assertThat(store.load(record.jobId)).isNull()
    }

    private fun newRecord(): JobRecord {
        val ttl = properties.job.redisTtl
        return JobRecord(
            jobId = UUID.randomUUID(),
            sessionId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            hostUserId = UUID.randomUUID(),
            model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            authorNameMode = AuthorNameMode.REAL,
            instructions = "be concise",
            transcript = "transcript body contents",
            status = JobStatus.PENDING,
            stage = JobStage.QUEUED,
            progressPct = 0,
            result = null,
            error = null,
            tokens = TokenUsage(0, 0, 0),
            costAccumulatedUsd = BigDecimal.ZERO,
            expiresAt = Instant.now().plusSeconds(ttl.seconds),
        )
    }

    private fun snapshot(): SessionImportV1Snapshot =
        SessionImportV1Snapshot(
            format = "readmates-session-import:v1",
            sessionNumber = 1,
            bookTitle = "Test Book",
            meetingDate = LocalDate.of(2026, 5, 16),
            summary = "initial summary",
            highlights = emptyList(),
            oneLineReviews = emptyList(),
            feedbackDocumentFileName = "feedback.md",
            feedbackDocumentMarkdown = "# feedback",
        )
}
