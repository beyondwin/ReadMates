package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedEvidenceExcerpt
import com.readmates.aigen.application.model.GroundedEvidenceTarget
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
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
        "spring.ai.model.chat=none",
        "spring.ai.google.genai.api-key=test-key",
        "spring.ai.openai.api-key=test-key",
        "spring.ai.anthropic.api-key=test-key",
    ],
)
@Tag("integration")
@Tag("container")
@Suppress("LargeClass")
class RedisAiGenerationJobStoreTest(
    @param:Autowired private val store: AiGenerationJobStore,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val properties: AiGenerationProperties,
) : ReadmatesRedisIntegrationTestSupport() {
    // The aigen Kafka adapter is gated on readmates.aigen.kafka.enabled; this integration
    // test only exercises the Redis JobStore adapter, so satisfy the orchestrator's queue
    // dependency with a mock so the context can load.
    @Suppress("UnusedPrivateProperty")
    @MockitoBean
    private lateinit var jobQueue: AiGenerationJobQueue

    @Test
    fun `grounded save persists validated membership turns in dedicated TTL payload`() {
        val membershipId = UUID.randomUUID()
        val turn =
            ValidatedTranscriptTurn(
                turnId = "t000001",
                speakerName = "가람",
                speakerMembershipId = membershipId,
                startSeconds = 0,
                text = "공개 테스트 발언입니다.",
            )
        val record =
            newRecord(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                validatedTurns = listOf(turn),
            )

        store.save(record)

        val turnsKey = "aigen:job:${record.jobId}:turns"
        assertThat(redisTemplate.hasKey(turnsKey)).isTrue()
        assertThat(redisTemplate.getExpire(turnsKey, TimeUnit.SECONDS))
            .isBetween(properties.job.redisTtl.seconds - 30, properties.job.redisTtl.seconds + 30)
        val loaded = store.load(record.jobId)!!
        assertThat(loaded.pipelineMode).isEqualTo(AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT)
        assertThat(loaded.validatedTurns).containsExactly(turn)
    }

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
    fun `load treats a pre-grounded raw hash as a legacy job`() {
        val record = newRecord()
        store.save(record)
        val hashKey = "aigen:job:${record.jobId}"

        redisTemplate.opsForHash<String, String>().delete(
            hashKey,
            "pipelineMode",
            "revision",
            "eligibleFallbackModels",
            "cleanupPending",
            "tokensCacheWrite",
        )
        redisTemplate.opsForHash<String, String>().put(hashKey, "tokensInput", "77")

        val loaded = store.load(record.jobId)!!

        assertThat(loaded.pipelineMode).isEqualTo(AiGenerationPipelineMode.LEGACY)
        assertThat(loaded.revision).isZero()
        assertThat(loaded.eligibleFallbackModels).isEmpty()
        assertThat(loaded.cleanupPending).isFalse()
        assertThat(loaded.transcript).isEqualTo(record.transcript)
        assertThat(loaded.tokens.nonCachedInputTokens).isEqualTo(77L)
        assertThat(loaded.tokens.cacheWriteInputTokens).isZero()
        assertThat(loaded.tokens.publicInputTokens).isEqualTo(77L)
    }

    @Test
    fun `save and load preserve all four token usage channels`() {
        val usage =
            TokenUsage(
                nonCachedInputTokens = 100,
                cacheWriteInputTokens = 25,
                cacheReadInputTokens = 50,
                outputTokens = 200,
            )
        val record = newRecord().copy(tokens = usage)

        store.save(record)

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.tokens).isEqualTo(usage)
        assertThat(loaded.tokens.publicInputTokens).isEqualTo(125L)
        assertThat(loaded.tokens.publicCachedInputTokens).isEqualTo(50L)
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

        store.saveResult(
            record.jobId,
            snapshot,
            TokenUsage(
                nonCachedInputTokens = 100,
                cacheWriteInputTokens = 25,
                cacheReadInputTokens = 50,
                outputTokens = 200,
            ),
            BigDecimal("0.01"),
        )

        val resultKey = "aigen:job:${record.jobId}:result"
        val resultJson = redisTemplate.opsForValue().get(resultKey)
        assertThat(resultJson).isNotNull
        assertThat(resultJson).contains("\"readmates-session-import:v1\"")

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.result).isNotNull
        assertThat(loaded.result!!.bookTitle).isEqualTo(snapshot.bookTitle)
        assertThat(loaded.tokens.nonCachedInputTokens).isEqualTo(100L)
        assertThat(loaded.tokens.cacheWriteInputTokens).isEqualTo(25L)
        assertThat(loaded.tokens.cacheReadInputTokens).isEqualTo(50L)
        assertThat(loaded.tokens.outputTokens).isEqualTo(200L)
        assertThat(loaded.tokens.publicInputTokens).isEqualTo(125L)
        assertThat(loaded.costAccumulatedUsd).isEqualByComparingTo(BigDecimal("0.01"))
    }

    @Test
    fun `patchItem atomically updates result and accumulates tokens plus cost`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(
            record.jobId,
            snapshot(),
            TokenUsage(
                nonCachedInputTokens = 100,
                cacheWriteInputTokens = 25,
                cacheReadInputTokens = 0,
                outputTokens = 200,
            ),
            BigDecimal("0.01"),
        )

        val patched = snapshot().copy(summary = "patched summary text")
        store.patchItem(
            record.jobId,
            GenerationItem.SUMMARY,
            patched,
            TokenUsage(
                nonCachedInputTokens = 20,
                cacheWriteInputTokens = 5,
                cacheReadInputTokens = 0,
                outputTokens = 30,
            ),
            BigDecimal("0.005"),
        )

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.result!!.summary).isEqualTo("patched summary text")
        assertThat(loaded.tokens.nonCachedInputTokens).isEqualTo(120L)
        assertThat(loaded.tokens.cacheWriteInputTokens).isEqualTo(30L)
        assertThat(loaded.tokens.outputTokens).isEqualTo(230L)
        assertThat(loaded.tokens.publicInputTokens).isEqualTo(150L)
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
    fun `job lifecycle refresh keeps provider attempt ledger aligned with job ttl`() {
        val record = newRecord()
        store.save(record)
        val ledgerKey = "aigen:job:${record.jobId}:provider-attempts"
        redisTemplate.opsForHash<String, String>().put(ledgerKey, "synthetic-attempt:state", "IN_FLIGHT")
        redisTemplate.expire(ledgerKey, java.time.Duration.ofSeconds(1))

        store.updateStatus(record.jobId, JobStatus.RUNNING, JobStage.VALIDATING, 80, null)

        val ttlSeconds = properties.job.redisTtl.seconds
        assertThat(redisTemplate.getExpire(ledgerKey, TimeUnit.SECONDS)).isBetween(ttlSeconds - 30, ttlSeconds + 30)
    }

    @Test
    fun `load returns null and deletes stale keys when transcript key is missing`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(
            record.jobId,
            snapshot(),
            TokenUsage(
                nonCachedInputTokens = 1,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 1,
            ),
            BigDecimal("0.001"),
        )
        redisTemplate.delete("aigen:job:${record.jobId}:transcript")

        val loaded = store.load(record.jobId)

        assertThat(loaded).isNull()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}")).isFalse()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:result")).isFalse()
    }

    @Test
    fun `saveResult refreshes transcript ttl with hash and result ttl`() {
        val record = newRecord()
        store.save(record)
        val transcriptKey = "aigen:job:${record.jobId}:transcript"
        redisTemplate.expire(transcriptKey, java.time.Duration.ofSeconds(1))

        store.saveResult(
            record.jobId,
            snapshot(),
            TokenUsage(
                nonCachedInputTokens = 100,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 200,
            ),
            BigDecimal("0.01"),
        )

        val ttlSeconds = properties.job.redisTtl.seconds
        val transcriptTtl = redisTemplate.getExpire(transcriptKey, TimeUnit.SECONDS)
        assertThat(transcriptTtl).isBetween(ttlSeconds - 30, ttlSeconds + 30)
    }

    @Test
    fun `grounded status transitions and call count refresh every transient payload ttl`() {
        val turn =
            ValidatedTranscriptTurn(
                "t000001",
                "가람",
                UUID.fromString("00000000-0000-0000-0000-000000000777"),
                0,
                "공개 테스트 발언입니다.",
            )
        val record =
            newRecord(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                validatedTurns = listOf(turn),
            )
        store.save(record)
        val sourcePayloadKeys =
            listOf(
                "aigen:job:${record.jobId}:transcript",
                "aigen:job:${record.jobId}:turns",
            )

        shortenPayloadTtls(sourcePayloadKeys)
        store.updateStatus(record.jobId, JobStatus.RUNNING, JobStage.VALIDATING, 80, null)
        assertPayloadTtlsRefreshed(sourcePayloadKeys)

        shortenPayloadTtls(sourcePayloadKeys)
        store.incrementLlmCallCount(record.jobId)
        assertPayloadTtlsRefreshed(sourcePayloadKeys)

        assertThat(store.saveGroundedResult(groundedResultCommand(record, expectedRevision = 0))).isTrue()
        assertPayloadTtlsRefreshed(payloadKeys(record.jobId))
    }

    @Test
    fun `patchItem refreshes transcript ttl with hash and result ttl`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(
            record.jobId,
            snapshot(),
            TokenUsage(
                nonCachedInputTokens = 1,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 1,
            ),
            BigDecimal("0.001"),
        )
        val transcriptKey = "aigen:job:${record.jobId}:transcript"
        redisTemplate.expire(transcriptKey, java.time.Duration.ofSeconds(1))

        store.patchItem(
            record.jobId,
            GenerationItem.SUMMARY,
            snapshot().copy(summary = "patched summary"),
            TokenUsage(
                nonCachedInputTokens = 20,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 30,
            ),
            BigDecimal("0.005"),
        )

        val ttlSeconds = properties.job.redisTtl.seconds
        val transcriptTtl = redisTemplate.getExpire(transcriptKey, TimeUnit.SECONDS)
        assertThat(transcriptTtl).isBetween(ttlSeconds - 30, ttlSeconds + 30)
    }

    @Test
    fun `delete removes hash, transcript, and result keys`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(
            record.jobId,
            snapshot(),
            TokenUsage(
                nonCachedInputTokens = 1,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 1,
            ),
            BigDecimal("0.001"),
        )
        val ledgerKey = "aigen:job:${record.jobId}:provider-attempts"
        redisTemplate.opsForHash<String, String>().put(ledgerKey, "synthetic-attempt:state", "UNKNOWN")

        store.delete(record.jobId)

        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}")).isFalse()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:transcript")).isFalse()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:result")).isFalse()
        assertThat(redisTemplate.hasKey(ledgerKey)).isFalse()
        assertThat(store.load(record.jobId)).isNull()
    }

    @Test
    fun `transitionStatus only updates when current status is expected`() {
        val record = newRecord()
        store.save(record)

        val first =
            store.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.PENDING),
                next = JobStatus.RUNNING,
                stage = JobStage.TRANSCRIPT_LOADED,
                progressPct = 5,
                error = null,
            )
        val second =
            store.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.PENDING),
                next = JobStatus.CANCELLED,
                stage = null,
                progressPct = 0,
                error = null,
            )

        val loaded = store.load(record.jobId)!!
        assertThat(first).isTrue()
        assertThat(second).isFalse()
        assertThat(loaded.status).isEqualTo(JobStatus.RUNNING)
        assertThat(loaded.stage).isEqualTo(JobStage.TRANSCRIPT_LOADED)
        assertThat(loaded.progressPct).isEqualTo(5)
    }

    @Test
    fun `saveResultIfStatus refuses to update when status changed`() {
        val record = newRecord()
        store.save(record)
        store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING),
            next = JobStatus.CANCELLED,
            stage = null,
            progressPct = 0,
            error = null,
        )

        val saved =
            store.saveResultIfStatus(
                jobId = record.jobId,
                expected = JobStatus.RUNNING,
                result = snapshot(),
                usage =
                    TokenUsage(
                        nonCachedInputTokens = 100,
                        cacheWriteInputTokens = 0,
                        cacheReadInputTokens = 0,
                        outputTokens = 100,
                    ),
                cost = BigDecimal("0.01"),
            )

        val loaded = store.load(record.jobId)!!
        assertThat(saved).isFalse()
        assertThat(loaded.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(loaded.result).isNull()
        assertThat(loaded.tokens.nonCachedInputTokens).isEqualTo(0L)
    }

    @Test
    fun `saveResultIfStatus persists actualModel and load round-trips it`() {
        val record = newRecord()
        store.save(record)
        store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING),
            next = JobStatus.RUNNING,
            stage = null,
            progressPct = 0,
            error = null,
        )
        val failoverModel = ModelId(Provider.OPENAI, "gpt-5.4-mini")

        val saved =
            store.saveResultIfStatus(
                jobId = record.jobId,
                expected = JobStatus.RUNNING,
                result = snapshot(),
                usage =
                    TokenUsage(
                        nonCachedInputTokens = 10,
                        cacheWriteInputTokens = 4,
                        cacheReadInputTokens = 0,
                        outputTokens = 20,
                    ),
                cost = BigDecimal("0.01"),
                actualModel = failoverModel,
            )

        val loaded = store.load(record.jobId)!!
        assertThat(saved).isTrue()
        assertThat(loaded.actualModel).isEqualTo(failoverModel)
        assertThat(loaded.tokens.cacheWriteInputTokens).isEqualTo(4L)
    }

    @Test
    fun `load returns null actualModel for a record saved without failover`() {
        val record = newRecord()
        store.save(record)
        store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING),
            next = JobStatus.RUNNING,
            stage = null,
            progressPct = 0,
            error = null,
        )

        store.saveResultIfStatus(
            jobId = record.jobId,
            expected = JobStatus.RUNNING,
            result = snapshot(),
            usage =
                TokenUsage(
                    nonCachedInputTokens = 10,
                    cacheWriteInputTokens = 0,
                    cacheReadInputTokens = 0,
                    outputTokens = 20,
                ),
            cost = BigDecimal("0.01"),
            actualModel = null,
        )

        assertThat(store.load(record.jobId)!!.actualModel).isNull()
    }

    @Test
    fun `deleteTransientPayload keeps terminal hash but removes transcript and result`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(
            record.jobId,
            snapshot(),
            TokenUsage(
                nonCachedInputTokens = 1,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 1,
            ),
            BigDecimal("0.001"),
        )
        store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING),
            next = JobStatus.COMMITTED,
            stage = null,
            progressPct = 100,
            error = null,
        )

        store.deleteTransientPayload(record.jobId)

        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}")).isTrue()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:transcript")).isFalse()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}:result")).isFalse()
        val loaded = store.load(record.jobId)!!
        assertThat(loaded.status).isEqualTo(JobStatus.COMMITTED)
        assertThat(loaded.result).isNull()
        assertThat(loaded.transcript).isEmpty()
    }

    @Test
    fun `non-terminal hash without transcript is treated as stale and deleted`() {
        val record = newRecord()
        store.save(record)
        redisTemplate.delete("aigen:job:${record.jobId}:transcript")

        val loaded = store.load(record.jobId)

        assertThat(loaded).isNull()
        assertThat(redisTemplate.hasKey("aigen:job:${record.jobId}")).isFalse()
    }

    @Test
    fun `committing job without transcript is loadable and not stale`() {
        val record = newRecord()
        store.save(record)
        store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING),
            next = JobStatus.COMMITTING,
            stage = JobStage.READY,
            progressPct = 100,
            error = null,
        )
        redisTemplate.delete("aigen:job:${record.jobId}:transcript")
        redisTemplate.delete("aigen:job:${record.jobId}:result")

        val loaded = store.load(record.jobId)

        assertThat(loaded).isNotNull
        assertThat(loaded!!.status).isEqualTo(JobStatus.COMMITTING)
        assertThat(loaded.result).isNull()
    }

    @Test
    fun `load preserves expiresAt stored on the hash`() {
        val record = newRecord()
        store.save(record)
        val first = store.load(record.jobId)!!.expiresAt
        Thread.sleep(20)
        val second = store.load(record.jobId)!!.expiresAt
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun `save indexes recent and active jobs with TTL`() {
        val record = newRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)

        store.save(record)

        assertThat(store.loadRecentForSession(record.sessionId).map { it.jobId }).containsExactly(record.jobId)
        assertThat(store.findJobById(record.jobId)?.jobId).isEqualTo(record.jobId)
        assertThat(store.loadActiveJobs().map { it.jobId }).contains(record.jobId)
        assertThat(redisTemplate.getExpire("aigen:session:${record.sessionId}:jobs", TimeUnit.SECONDS))
            .isBetween(properties.job.redisTtl.seconds - 30, properties.job.redisTtl.seconds + 30)
        assertThat(redisTemplate.getExpire("aigen:jobs:active", TimeUnit.SECONDS))
            .isBetween(properties.job.redisTtl.seconds - 30, properties.job.redisTtl.seconds + 30)
        assertThat(redisTemplate.getExpire("aigen:club:${record.clubId}:jobs:active", TimeUnit.SECONDS))
            .isBetween(properties.job.redisTtl.seconds - 30, properties.job.redisTtl.seconds + 30)
    }

    @Test
    fun `terminal transition removes active indexes but keeps session recent lookup`() {
        val record = newRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        store.save(record)

        store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.RUNNING),
            next = JobStatus.FAILED,
            stage = null,
            progressPct = 0,
            error = GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "retry later"),
        )

        val recent = store.loadRecentForSession(record.sessionId)
        assertThat(recent.map { it.jobId }).containsExactly(record.jobId)
        assertThat(recent.single().status).isEqualTo(JobStatus.FAILED)
        assertThat(store.loadActiveJobs().map { it.jobId }).doesNotContain(record.jobId)
    }

    @Test
    fun `delete removes indexed job references`() {
        val record = newRecord(status = JobStatus.RUNNING, stage = JobStage.TRANSCRIPT_LOADED)
        store.save(record)

        store.delete(record.jobId)

        assertThat(store.loadRecentForSession(record.sessionId)).isEmpty()
        assertThat(store.findJobById(record.jobId)).isNull()
        assertThat(store.loadActiveJobs().map { it.jobId }).doesNotContain(record.jobId)
    }

    @Test
    fun `load preserves createdAt and lastUpdatedAt stored on the hash`() {
        val record =
            newRecord(
                createdAt = Instant.parse("2026-05-16T10:00:00Z"),
                lastUpdatedAt = Instant.parse("2026-05-16T10:05:00Z"),
            )
        store.save(record)

        val loaded = store.load(record.jobId)!!

        assertThat(loaded.createdAt).isEqualTo(record.createdAt)
        assertThat(loaded.lastUpdatedAt).isEqualTo(record.lastUpdatedAt)
    }

    private fun newRecord(
        status: JobStatus = JobStatus.PENDING,
        stage: JobStage? = JobStage.QUEUED,
        createdAt: Instant = Instant.now(),
        lastUpdatedAt: Instant = createdAt,
        pipelineMode: AiGenerationPipelineMode = AiGenerationPipelineMode.LEGACY,
        validatedTurns: List<ValidatedTranscriptTurn> = emptyList(),
    ): JobRecord {
        val ttl = properties.job.redisTtl
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        return JobRecord(
            jobId = UUID.randomUUID(),
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = UUID.randomUUID(),
            model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            authorNameMode = AuthorNameMode.REAL,
            instructions = "be concise",
            transcript = "transcript body contents",
            sessionMeta =
                SessionMeta(
                    sessionId = sessionId,
                    clubId = clubId,
                    sessionNumber = 7,
                    bookTitle = "Test Book",
                    bookAuthor = "Author",
                    meetingDate = LocalDate.of(2026, 5, 16),
                    expectedAuthorNames = listOf("Alice", "Bob"),
                    authorNameMode = AuthorNameMode.REAL,
                ),
            status = status,
            stage = stage,
            progressPct = if (status == JobStatus.SUCCEEDED) 100 else 0,
            result = null,
            error = null,
            tokens =
                TokenUsage(
                    nonCachedInputTokens = 0,
                    cacheWriteInputTokens = 0,
                    cacheReadInputTokens = 0,
                    outputTokens = 0,
                ),
            costAccumulatedUsd = BigDecimal.ZERO,
            expiresAt = Instant.now().plusSeconds(ttl.seconds),
            createdAt = createdAt,
            lastUpdatedAt = lastUpdatedAt,
            pipelineMode = pipelineMode,
            validatedTurns = validatedTurns,
        )
    }

    private fun groundedResultCommand(
        record: JobRecord,
        expectedStatus: JobStatus = JobStatus.RUNNING,
        expectedRevision: Long,
    ): SaveGroundedResultCommand =
        SaveGroundedResultCommand(
            jobId = record.jobId,
            expectedStatus = expectedStatus,
            expectedRevision = expectedRevision,
            result = snapshot(),
            draft = groundedDraft(),
            evidence = evidence(expectedRevision + 1),
            usage =
                TokenUsage(
                    nonCachedInputTokens = 10,
                    cacheWriteInputTokens = 0,
                    cacheReadInputTokens = 0,
                    outputTokens = 20,
                ),
            cost = BigDecimal("0.01"),
            actualModel = record.model,
        )

    private fun groundedDraft(): GroundedGenerationDraft =
        GroundedGenerationDraft(
            "readmates-grounded-generation:v2",
            7,
            "Test Book",
            LocalDate.of(2026, 5, 16),
            emptyList(),
            emptyList(),
            emptyList(),
            "feedback.md",
            emptyList(),
        )

    private fun evidence(revision: Long): GroundedEvidenceBundle =
        GroundedEvidenceBundle(
            revision = revision,
            targets =
                listOf(
                    GroundedEvidenceTarget(
                        targetId = "r$revision:SUMMARY:0",
                        section = GenerationItem.SUMMARY,
                        ordinal = 0,
                        turnIds = listOf("t000001"),
                    ),
                ),
            excerpts =
                listOf(
                    GroundedEvidenceExcerpt(
                        turnId = "t000001",
                        speakerName = "Alice",
                        startSeconds = 0,
                        excerpt = "Public-safe source statement.",
                        truncated = false,
                    ),
                ),
        )

    private fun payloadKeys(jobId: UUID): List<String> =
        listOf(
            "aigen:job:$jobId:transcript",
            "aigen:job:$jobId:turns",
            "aigen:job:$jobId:result",
            "aigen:job:$jobId:evidence",
        )

    private fun shortenPayloadTtls(keys: List<String>) {
        keys.forEach { redisTemplate.expire(it, java.time.Duration.ofSeconds(60)) }
    }

    private fun assertPayloadTtlsRefreshed(keys: List<String>) {
        val ttlSeconds = properties.job.redisTtl.seconds
        keys.forEach { key ->
            assertThat(redisTemplate.getExpire(key, TimeUnit.SECONDS))
                .isBetween(ttlSeconds - 30, ttlSeconds + 30)
        }
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
