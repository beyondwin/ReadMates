package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedEvidenceExcerpt
import com.readmates.aigen.application.model.GroundedEvidenceTarget
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingStatus
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
import com.readmates.aigen.application.port.out.CommitLeaseResult
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.LlmCallReservation
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
import java.time.Duration
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
class RedisGroundedAiGenerationJobStoreTest(
    @param:Autowired private val store: AiGenerationJobStore,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val properties: AiGenerationProperties,
) : ReadmatesRedisIntegrationTestSupport() {
    private val payloadSuffixes = listOf("transcript", "turns", "result", "evidence")

    @Suppress("UnusedPrivateProperty")
    @MockitoBean
    private lateinit var jobQueue: AiGenerationJobQueue

    @Test
    fun `grounded hash is metadata only and source context stays in the turns payload`() {
        val record = groundedRecord()

        store.save(record)

        val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(record.jobId))
        val hashJson = hash.toString()
        assertThat(hash.keys).doesNotContain("sessionMeta", "instructions")
        assertThat(hashJson)
            .doesNotContain(record.transcript)
            .doesNotContain(record.validatedTurns.single().speakerName)
            .doesNotContain(record.validatedTurns.single().text)
            .doesNotContain(record.instructions)
        val sourceJson = redisTemplate.opsForValue().get("${hashKey(record.jobId)}:turns")
        assertThat(sourceJson).contains("validatedTurns", "sessionMeta", "instructions")
        val loaded = store.load(record.jobId)
        assertThat(loaded?.toSessionMeta()).isEqualTo(record.toSessionMeta())
        assertThat(loaded?.groundingStatus).isEqualTo(GroundingStatus.PENDING)
    }

    @Test
    fun `grounded save changes RUNNING to SUCCEEDED and revision zero to one atomically`() {
        val record = groundedRecord(JobStatus.RUNNING, JobStage.GENERATING_SUMMARY)
        store.save(record)

        val saved = store.saveGroundedResult(resultCommand(record, expectedRevision = 0))
        val duplicate = store.saveGroundedResult(resultCommand(record, expectedRevision = 0))

        assertThat(saved).isTrue()
        assertThat(duplicate).isFalse()
        val loaded = store.load(record.jobId)!!
        assertThat(loaded.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(loaded.revision).isEqualTo(1)
        assertThat(loaded.result).isEqualTo(snapshot())
        assertThat(loaded.evidence).isEqualTo(evidence(1))
    }

    @Test
    fun `call reservation is atomic with running status and hard cap`() {
        val record = groundedRecord(JobStatus.RUNNING, JobStage.GENERATING_RECORD)
        store.save(record)

        assertThat(store.reserveLlmCall(record.jobId, JobStatus.RUNNING, 1))
            .isEqualTo(LlmCallReservation.RESERVED)
        assertThat(store.reserveLlmCall(record.jobId, JobStatus.RUNNING, 1))
            .isEqualTo(LlmCallReservation.CAP_EXCEEDED)
        assertThat(store.transitionStatus(record.jobId, setOf(JobStatus.RUNNING), JobStatus.CANCELLED, null, 0, null))
            .isTrue()
        assertThat(store.reserveLlmCall(record.jobId, JobStatus.RUNNING, 3))
            .isEqualTo(LlmCallReservation.STATE_CHANGED)
        assertThat(store.load(record.jobId)?.llmCallCount).isEqualTo(1)
    }

    @Test
    fun `regeneration requires expected revision and increments it once`() {
        val record = groundedRecord(JobStatus.RUNNING, JobStage.GENERATING_SUMMARY)
        store.save(record)
        assertThat(store.saveGroundedResult(resultCommand(record, expectedRevision = 0))).isTrue()
        val regenerated = snapshot().copy(summary = "regenerated public-safe summary")
        val command =
            resultCommand(record, JobStatus.SUCCEEDED, expectedRevision = 1)
                .copy(result = regenerated, evidence = evidence(2))

        assertThat(store.saveGroundedResult(command)).isTrue()
        assertThat(store.saveGroundedResult(command)).isFalse()
        val loaded = store.load(record.jobId)!!
        assertThat(loaded.revision).isEqualTo(2)
        assertThat(loaded.result?.summary).isEqualTo(regenerated.summary)
        assertThat(loaded.evidence?.revision).isEqualTo(2)
    }

    @Test
    fun `only one commit caller acquires the same revision lease`() {
        val record = succeededRecord()
        val now = Instant.parse("2026-07-14T10:00:00Z")

        val first = store.acquireCommitLease(record.jobId, 1, now, Duration.ofMinutes(2))
        val second = store.acquireCommitLease(record.jobId, 1, now.plusSeconds(1), Duration.ofMinutes(2))

        assertThat(first).isEqualTo(CommitLeaseResult.Acquired(1))
        assertThat(second).isInstanceOf(CommitLeaseResult.AlreadyCommitting::class.java)
        assertThat(store.acquireCommitLease(record.jobId, 0, now, Duration.ofMinutes(2)))
            .isEqualTo(CommitLeaseResult.RevisionConflict)
    }

    @Test
    fun `commit lease retry with missing review payload expires the whole job`() {
        val record = succeededRecord()
        val now = Instant.parse("2026-07-14T10:00:00Z")
        assertThat(store.acquireCommitLease(record.jobId, 1, now, Duration.ofMinutes(2)))
            .isEqualTo(CommitLeaseResult.Acquired(1))
        redisTemplate.delete("${hashKey(record.jobId)}:evidence")

        assertThat(store.acquireCommitLease(record.jobId, 1, now.plusSeconds(1), Duration.ofMinutes(2)))
            .isEqualTo(CommitLeaseResult.Expired)
        assertThat(redisTemplate.hasKey(hashKey(record.jobId))).isFalse()
        payloadKeys(record.jobId).forEach { key -> assertThat(redisTemplate.hasKey(key)).isFalse() }
    }

    @Test
    fun `expired commit lease moves to COMMIT_RETRY without deleting payloads`() {
        val record = succeededRecord()
        val now = Instant.parse("2026-07-14T10:00:00Z")
        assertThat(store.acquireCommitLease(record.jobId, 1, now, Duration.ofSeconds(30)))
            .isEqualTo(CommitLeaseResult.Acquired(1))

        assertThat(store.recoverExpiredCommitLease(record.jobId, now.plusSeconds(31))).isTrue()

        val loaded = store.load(record.jobId)!!
        assertThat(loaded.status).isEqualTo(JobStatus.COMMIT_RETRY)
        assertThat(loaded.commitLeaseExpiresAt).isNull()
        assertThat(loaded.result).isNotNull
        assertThat(loaded.evidence).isNotNull
    }

    @Test
    fun `expired commit lease with missing payload deletes stale job`() {
        val record = succeededRecord()
        val now = Instant.parse("2026-07-14T10:00:00Z")
        store.acquireCommitLease(record.jobId, 1, now, Duration.ofSeconds(30))
        redisTemplate.delete("${hashKey(record.jobId)}:result")

        assertThat(store.recoverExpiredCommitLease(record.jobId, now.plusSeconds(31))).isFalse()
        assertThat(redisTemplate.hasKey(hashKey(record.jobId))).isFalse()
        payloadKeys(record.jobId).forEach { key -> assertThat(redisTemplate.hasKey(key)).isFalse() }
    }

    @Test
    fun `commit lease expiration uses numeric time across fractional precision`() {
        val record = succeededRecord()
        val now = Instant.parse("2026-07-14T10:00:00.500Z")
        assertThat(store.acquireCommitLease(record.jobId, 1, now, Duration.ofMillis(100)))
            .isEqualTo(CommitLeaseResult.Acquired(1))

        assertThat(store.recoverExpiredCommitLease(record.jobId, now.plusMillis(50))).isFalse()
        assertThat(store.recoverExpiredCommitLease(record.jobId, now.plusMillis(100))).isTrue()
        assertThat(store.load(record.jobId)?.status).isEqualTo(JobStatus.COMMIT_RETRY)
    }

    @Test
    fun `commit cleanup state is revision guarded and idempotent`() {
        val record = succeededRecord()
        val now = Instant.parse("2026-07-14T10:00:00Z")
        store.acquireCommitLease(record.jobId, 1, now, Duration.ofMinutes(2))
        redisTemplate.opsForHash<String, String>().put(hashKey(record.jobId), "sessionMeta", "legacy-sensitive")
        redisTemplate.opsForHash<String, String>().put(hashKey(record.jobId), "instructions", "legacy-sensitive")

        assertThat(store.markCommittedForCleanup(record.jobId, 0)).isFalse()
        assertThat(store.markCommittedForCleanup(record.jobId, 1)).isTrue()
        assertThat(store.markCommittedForCleanup(record.jobId, 1)).isFalse()
        assertThat(store.load(record.jobId)?.cleanupPending).isTrue()
        assertThat(redisTemplate.opsForHash<String, String>().hasKey(hashKey(record.jobId), "sessionMeta")).isFalse()
        assertThat(redisTemplate.opsForHash<String, String>().hasKey(hashKey(record.jobId), "instructions")).isFalse()

        store.deleteTransientPayload(record.jobId)
        assertThat(store.markCleanupComplete(record.jobId, 1)).isTrue()
        assertThat(store.markCleanupComplete(record.jobId, 1)).isFalse()
        assertThat(store.load(record.jobId)?.cleanupPending).isFalse()
    }

    @Test
    fun `all four grounded payloads share six hour ttl and cleanup removes each`() {
        val record = succeededRecord()
        val keys = payloadKeys(record.jobId)
        redisTemplate.opsForHash<String, String>().put(hashKey(record.jobId), "sessionMeta", "legacy-sensitive")
        redisTemplate.opsForHash<String, String>().put(hashKey(record.jobId), "instructions", "legacy-sensitive")

        keys.forEach { key ->
            assertThat(redisTemplate.hasKey(key)).isTrue()
            assertThat(redisTemplate.getExpire(key, TimeUnit.SECONDS))
                .isBetween(properties.job.redisTtl.seconds - 30, properties.job.redisTtl.seconds + 30)
        }

        store.deleteTransientPayload(record.jobId)

        keys.forEach { key -> assertThat(redisTemplate.hasKey(key)).isFalse() }
        assertThat(redisTemplate.hasKey(hashKey(record.jobId))).isTrue()
        assertThat(redisTemplate.opsForHash<String, String>().hasKey(hashKey(record.jobId), "sessionMeta")).isFalse()
        assertThat(redisTemplate.opsForHash<String, String>().hasKey(hashKey(record.jobId), "instructions")).isFalse()
    }

    @Test
    fun `succeeded grounded job with expired evidence fails closed without partial exposure`() {
        val record = succeededRecord()
        redisTemplate.delete("${hashKey(record.jobId)}:evidence")

        assertThat(store.load(record.jobId)).isNull()
        assertThat(redisTemplate.hasKey(hashKey(record.jobId))).isFalse()
        payloadKeys(record.jobId).forEach { key -> assertThat(redisTemplate.hasKey(key)).isFalse() }
    }

    @Test
    fun `pending and terminal loads do not parse payloads outside their state`() {
        val record = groundedRecord()
        val key = hashKey(record.jobId)
        store.save(record)
        redisTemplate.opsForValue().set("$key:result", "not-json")
        redisTemplate.opsForValue().set("$key:evidence", "not-json")
        assertThat(store.load(record.jobId)).isNotNull

        store.updateStatus(record.jobId, JobStatus.COMMITTED, null, 100, null)
        redisTemplate.opsForValue().set("$key:turns", "not-json")
        redisTemplate.opsForValue().set("$key:transcript", "still-private")
        assertThat(store.load(record.jobId)?.status).isEqualTo(JobStatus.COMMITTED)
    }

    @Test
    fun `metadata reads never materialize grounded payloads`() {
        val record = succeededRecord()
        payloadKeys(record.jobId).forEach { key -> redisTemplate.opsForValue().set(key, "not-json") }

        val direct = store.findJobById(record.jobId)
        val active = store.loadActiveJobs().single { it.jobId == record.jobId }

        assertThat(direct?.transcript).isEmpty()
        assertThat(direct?.validatedTurns).isEmpty()
        assertThat(direct?.result).isNull()
        assertThat(direct?.evidence).isNull()
        assertThat(active.transcript).isEmpty()
        assertThat(redisTemplate.hasKey(hashKey(record.jobId))).isTrue()
    }

    @Test
    fun `metadata reads reject preterminal job with a missing required payload`() {
        val record = succeededRecord()
        redisTemplate.delete("${hashKey(record.jobId)}:evidence")

        assertThat(store.findJobById(record.jobId)).isNull()
        assertThat(store.loadActiveJobs().map { it.jobId }).doesNotContain(record.jobId)
        assertThat(redisTemplate.hasKey(hashKey(record.jobId))).isFalse()
    }

    private fun succeededRecord(): JobRecord {
        val record = groundedRecord(JobStatus.RUNNING, JobStage.GENERATING_SUMMARY)
        store.save(record)
        check(store.saveGroundedResult(resultCommand(record, expectedRevision = 0)))
        return record
    }

    private fun groundedRecord(
        status: JobStatus = JobStatus.PENDING,
        stage: JobStage? = JobStage.QUEUED,
    ): JobRecord {
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val now = Instant.now()
        return JobRecord(
            jobId = UUID.randomUUID(),
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = UUID.randomUUID(),
            model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            authorNameMode = AuthorNameMode.REAL,
            instructions = "be concise",
            transcript = "public-safe transcript body",
            sessionMeta =
                SessionMeta(
                    sessionId,
                    clubId,
                    7,
                    "Public Test Book",
                    "Public Author",
                    LocalDate.of(2026, 7, 14),
                    listOf("Alice"),
                    AuthorNameMode.REAL,
                ),
            status = status,
            stage = stage,
            progressPct = 0,
            result = null,
            error = null,
            tokens = TokenUsage(0, 0, 0),
            costAccumulatedUsd = BigDecimal.ZERO,
            expiresAt = now.plus(properties.job.redisTtl),
            createdAt = now,
            lastUpdatedAt = now,
            pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
            validatedTurns =
                listOf(
                    ValidatedTranscriptTurn(
                        "t000001",
                        "Alice",
                        UUID.fromString("00000000-0000-0000-0000-000000000777"),
                        0,
                        "Public-safe source statement.",
                    ),
                ),
        )
    }

    private fun resultCommand(
        record: JobRecord,
        expectedStatus: JobStatus = JobStatus.RUNNING,
        expectedRevision: Long,
    ): SaveGroundedResultCommand =
        SaveGroundedResultCommand(
            record.jobId,
            expectedStatus,
            expectedRevision,
            snapshot(),
            groundedDraft(),
            evidence(expectedRevision + 1),
            TokenUsage(10, 0, 20),
            BigDecimal("0.01"),
            record.model,
        )

    private fun groundedDraft(): GroundedGenerationDraft =
        GroundedGenerationDraft(
            "readmates-grounded-generation:v2",
            7,
            "Public Test Book",
            LocalDate.of(2026, 7, 14),
            emptyList(),
            emptyList(),
            emptyList(),
            "feedback.md",
            emptyList(),
        )

    private fun evidence(revision: Long): GroundedEvidenceBundle =
        GroundedEvidenceBundle(
            revision,
            listOf(GroundedEvidenceTarget("r$revision:SUMMARY:0", GenerationItem.SUMMARY, 0, listOf("t000001"))),
            listOf(GroundedEvidenceExcerpt("t000001", "Alice", 0, "Public-safe source statement.", false)),
        )

    private fun snapshot(): SessionImportV1Snapshot =
        SessionImportV1Snapshot(
            "readmates-session-import:v1",
            7,
            "Public Test Book",
            LocalDate.of(2026, 7, 14),
            "Public-safe summary",
            emptyList(),
            emptyList(),
            "feedback.md",
            "# feedback",
        )

    private fun hashKey(jobId: UUID) = "aigen:job:$jobId"

    private fun payloadKeys(jobId: UUID) = payloadSuffixes.map { suffix -> "${hashKey(jobId)}:$suffix" }
}
