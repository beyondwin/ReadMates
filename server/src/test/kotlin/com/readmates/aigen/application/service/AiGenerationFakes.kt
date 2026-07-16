package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.RegenerationOutput
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.ClubDefault
import com.readmates.aigen.application.port.out.CommitLeaseResult
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.LlmCallReservation
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.application.port.out.SessionContentGenerator
import com.readmates.aigen.application.port.out.SessionContentRegenerator
import com.readmates.aigen.config.AiGenerationProperties
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

internal class FakeJobStore : AiGenerationJobStore {
    val records: MutableMap<UUID, JobRecord> = mutableMapOf()
    val deleted: MutableList<UUID> = mutableListOf()
    val transientPayloadDeleted: MutableList<UUID> = mutableListOf()
    val statusTransitions: MutableList<Triple<UUID, JobStatus, JobStatus>> = mutableListOf()

    /**
     * Unified order log for ordering invariants — e.g. "commit must transition to
     * COMMITTED BEFORE calling deleteTransientPayload". Push `"transition:${next.name}"`
     * inside `transitionStatus` (when it returns true) and `"deleteTransient"` inside
     * `deleteTransientPayload`. Asserted with `containsSubsequence(...)`.
     */
    val mutationOrder: MutableList<String> = mutableListOf()
    var failNextConditionalSave: Boolean = false
    var beforeReserveLlmCall: (() -> Unit)? = null

    override fun save(job: JobRecord) {
        records[job.jobId] = job
    }

    override fun load(jobId: UUID): JobRecord? = records[jobId]

    override fun loadRecentForSession(
        sessionId: UUID,
        limit: Int,
    ): List<JobRecord> =
        records
            .values
            .filter { it.sessionId == sessionId }
            .sortedByDescending { it.lastUpdatedAt }
            .take(limit)

    override fun loadActiveJobs(limit: Int): List<JobRecord> =
        records
            .values
            .filter { it.status in ACTIVE_JOB_STATUSES }
            .sortedByDescending { it.lastUpdatedAt }
            .take(limit)

    override fun saveResult(
        jobId: UUID,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
    ) {
        val current = records.getValue(jobId)
        records[jobId] =
            current.copy(
                result = result,
                tokens = current.tokens + usage,
                costAccumulatedUsd = current.costAccumulatedUsd.add(cost),
            )
    }

    override fun patchItem(
        jobId: UUID,
        item: GenerationItem,
        value: Any,
        usage: TokenUsage,
        cost: BigDecimal,
    ) {
        require(value is SessionImportV1Snapshot) {
            "FakeJobStore.patchItem requires value: SessionImportV1Snapshot (mirrors Redis contract)"
        }
        val current = records.getValue(jobId)
        records[jobId] =
            current.copy(
                result = value,
                tokens = current.tokens + usage,
                costAccumulatedUsd = current.costAccumulatedUsd.add(cost),
            )
    }

    override fun updateStatus(
        jobId: UUID,
        status: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ) {
        val current = records.getValue(jobId)
        records[jobId] =
            current.copy(
                status = status,
                stage = stage,
                progressPct = progressPct,
                error = error,
            )
    }

    override fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
        groundingStatus: com.readmates.aigen.application.model.GroundingStatus?,
    ): Boolean {
        val current = records[jobId]?.takeIf { it.status in expected } ?: return false
        records[jobId] =
            current.copy(
                status = next,
                stage = stage,
                progressPct = progressPct,
                error = error,
                groundingStatus = groundingStatus ?: current.groundingStatus,
            )
        statusTransitions += Triple(jobId, current.status, next)
        mutationOrder += "transition:${next.name}"
        return true
    }

    override fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId?,
    ): Boolean {
        val current =
            when {
                failNextConditionalSave -> {
                    failNextConditionalSave = false
                    null
                }
                else -> records[jobId]?.takeIf { it.status == expected }
            } ?: return false
        records[jobId] =
            current.copy(
                result = result,
                actualModel = actualModel ?: current.actualModel,
                tokens = current.tokens + usage,
                costAccumulatedUsd = current.costAccumulatedUsd.add(cost),
            )
        return true
    }

    override fun saveGroundedResult(command: SaveGroundedResultCommand): Boolean {
        val current =
            when {
                failNextConditionalSave -> {
                    failNextConditionalSave = false
                    null
                }
                else ->
                    records[command.jobId]?.takeIf {
                        it.status == command.expectedStatus && it.revision == command.expectedRevision
                    }
            } ?: return false
        records[command.jobId] =
            current.copy(
                status = JobStatus.SUCCEEDED,
                stage = JobStage.READY,
                progressPct = 100,
                result = command.result,
                groundedDraft = command.draft,
                evidence = command.evidence,
                revision = current.revision + 1,
                groundingStatus = com.readmates.aigen.application.model.GroundingStatus.VALID,
                actualModel = command.actualModel,
                tokens = current.tokens + command.usage,
                costAccumulatedUsd = current.costAccumulatedUsd.add(command.cost),
            )
        return true
    }

    override fun acquireCommitLease(
        jobId: UUID,
        expectedRevision: Long,
        now: Instant,
        leaseDuration: Duration,
    ): CommitLeaseResult {
        val current = records[jobId]
        return when {
            current == null -> CommitLeaseResult.NotReady
            current.revision != expectedRevision -> CommitLeaseResult.RevisionConflict
            current.status == JobStatus.COMMITTING ->
                CommitLeaseResult.AlreadyCommitting(requireNotNull(current.commitLeaseExpiresAt))
            current.status !in setOf(JobStatus.SUCCEEDED, JobStatus.COMMIT_RETRY) -> CommitLeaseResult.NotReady
            else -> {
                records[jobId] =
                    current.copy(status = JobStatus.COMMITTING, commitLeaseExpiresAt = now.plus(leaseDuration))
                CommitLeaseResult.Acquired(current.revision)
            }
        }
    }

    override fun recoverExpiredCommitLease(
        jobId: UUID,
        now: Instant,
    ): Boolean {
        val current =
            records[jobId]?.takeIf {
                it.status == JobStatus.COMMITTING && it.commitLeaseExpiresAt?.isAfter(now) == false
            } ?: return false
        records[jobId] = current.copy(status = JobStatus.COMMIT_RETRY, commitLeaseExpiresAt = null)
        return true
    }

    override fun releaseCommitLeaseForRetry(
        jobId: UUID,
        revision: Long,
    ): Boolean {
        val current =
            records[jobId]?.takeIf {
                it.status == JobStatus.COMMITTING && it.revision == revision
            } ?: return false
        records[jobId] = current.copy(status = JobStatus.COMMIT_RETRY, commitLeaseExpiresAt = null)
        return true
    }

    override fun loadCommitRecoveryJobs(limit: Int): List<JobRecord> =
        records.values
            .filter {
                it.status == JobStatus.COMMITTING || it.status == JobStatus.COMMIT_RETRY ||
                    (it.status == JobStatus.COMMITTED && it.cleanupPending)
            }.sortedBy { it.lastUpdatedAt }
            .take(limit)

    override fun markCommittedForCleanup(
        jobId: UUID,
        revision: Long,
    ): Boolean {
        val current =
            records[jobId]?.takeIf {
                it.status in setOf(JobStatus.COMMITTING, JobStatus.COMMIT_RETRY) && it.revision == revision
            } ?: return false
        records[jobId] =
            current.copy(status = JobStatus.COMMITTED, cleanupPending = true, commitLeaseExpiresAt = null)
        return true
    }

    override fun markCleanupComplete(
        jobId: UUID,
        revision: Long,
    ): Boolean {
        val current =
            records[jobId]?.takeIf {
                it.status == JobStatus.COMMITTED && it.revision == revision && it.cleanupPending
            } ?: return false
        records[jobId] = current.copy(cleanupPending = false)
        return true
    }

    override fun deleteTransientPayload(jobId: UUID) {
        transientPayloadDeleted += jobId
        mutationOrder += "deleteTransient"
        val current = records[jobId] ?: return
        records[jobId] =
            current.copy(
                transcript = "",
                result = null,
                evidence = null,
                validatedTurns = emptyList(),
            )
    }

    override fun incrementLlmCallCount(jobId: UUID): Int {
        val current = records.getValue(jobId)
        val next = current.llmCallCount + 1
        records[jobId] = current.copy(llmCallCount = next)
        return next
    }

    override fun reserveLlmCall(
        jobId: UUID,
        expectedStatus: JobStatus,
        maxCalls: Int,
    ): LlmCallReservation {
        beforeReserveLlmCall?.also { beforeReserveLlmCall = null }?.invoke()
        val current = records[jobId]
        return when {
            current == null || current.status != expectedStatus -> LlmCallReservation.STATE_CHANGED
            current.llmCallCount >= maxCalls -> LlmCallReservation.CAP_EXCEEDED
            else -> {
                records[jobId] = current.copy(llmCallCount = current.llmCallCount + 1)
                LlmCallReservation.RESERVED
            }
        }
    }

    override fun delete(jobId: UUID) {
        records.remove(jobId)
        deleted += jobId
    }

    private companion object {
        val ACTIVE_JOB_STATUSES =
            setOf(
                JobStatus.PENDING,
                JobStatus.RUNNING,
                JobStatus.SUCCEEDED,
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
            )
    }
}

internal class FakeJobQueue : AiGenerationJobQueue {
    data class Published(
        val jobId: UUID,
        val sessionId: UUID,
        val clubId: UUID,
        val hostUserId: UUID,
        val provider: Provider,
        val model: String,
        val kind: JobKind,
    )

    val published: MutableList<Published> = mutableListOf()

    /**
     * When non-null, [publish] will throw this exception instead of recording.
     * Used by the queue-compensation regression test.
     */
    var throwOnPublish: Throwable? = null

    override fun publish(command: AiGenerationJobPublishCommand) {
        throwOnPublish?.let { throw it }
        published +=
            Published(
                command.jobId,
                command.sessionId,
                command.clubId,
                command.hostUserId,
                command.provider,
                command.model,
                command.kind,
            )
    }
}

internal class FakeAuditPort : AiGenerationAuditPort {
    val entries: MutableList<AuditLogEntry> = mutableListOf()
    var onInsert: ((AuditLogEntry) -> Unit)? = null

    override fun insert(entry: AuditLogEntry) {
        onInsert?.invoke(entry)
        entries += entry
    }
}

internal class FakeCostGuard(
    var decision: GuardDecision = GuardDecision.Allow,
    var clubMonthly: BigDecimal = BigDecimal.ZERO,
) : GenerationCostGuard {
    val recorded: MutableList<Triple<UUID, UUID, BigDecimal>> = mutableListOf()
    val checked: MutableList<Pair<UUID, UUID>> = mutableListOf()
    val released: MutableList<Triple<UUID, UUID, UUID>> = mutableListOf()
    val renewed: MutableList<Triple<UUID, UUID, UUID>> = mutableListOf()
    val renewDecisions: ArrayDeque<Boolean> = ArrayDeque()
    var renewAllowed: Boolean = true

    override fun checkBeforeCall(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): GuardDecision {
        checked += hostId to clubId
        return decision
    }

    override fun recordUsage(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
        cost: BigDecimal,
    ) {
        recorded += Triple(hostId, clubId, cost)
    }

    override fun releaseAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ) {
        released += Triple(hostId, clubId, admissionId)
    }

    override fun renewAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): Boolean {
        renewed += Triple(hostId, clubId, admissionId)
        return renewDecisions.removeFirstOrNull() ?: renewAllowed
    }

    override fun clubMonthlyCost(clubId: UUID): BigDecimal = clubMonthly
}

internal class FakeClubDefaultPort(
    private val defaults: MutableMap<UUID, ClubDefault> = mutableMapOf(),
) : AiGenerationClubDefaultPort {
    override fun load(clubId: UUID): ClubDefault? = defaults[clubId]

    override fun upsert(
        clubId: UUID,
        defaultModel: String,
        updatedBy: UUID,
    ) {
        defaults[clubId] =
            ClubDefault(
                clubId = clubId,
                defaultModel = defaultModel,
                updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
                updatedBy = updatedBy,
            )
    }

    fun set(
        clubId: UUID,
        defaultModel: String,
    ) {
        defaults[clubId] =
            ClubDefault(
                clubId = clubId,
                defaultModel = defaultModel,
                updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
                updatedBy = UUID.randomUUID(),
            )
    }
}

internal class FakeModelCatalog(
    private val pricing: Map<ModelId, ModelPricing>,
    private val enabled: Set<ModelId>,
) : ModelCatalog {
    override fun allowlisted(): List<ModelId> = enabled.toList()

    override fun pricing(id: ModelId): ModelPricing = pricing[id] ?: error("No pricing for $id")

    override fun resolveAlias(alias: String): ModelId? = enabled.firstOrNull { it.name == alias }

    override fun isEnabled(id: ModelId): Boolean = id in enabled
}

internal class FakeContentGenerator(
    override val provider: Provider,
    private val responses: ArrayDeque<Response> = ArrayDeque(),
) : SessionContentGenerator {
    sealed class Response {
        data class Success(
            val output: GenerationOutput,
        ) : Response()

        data class Failure(
            val error: GenerationError,
        ) : Response()
    }

    val calls: MutableList<GenerationInput> = mutableListOf()

    fun enqueueSuccess(output: GenerationOutput) {
        responses.addLast(Response.Success(output))
    }

    fun enqueueFailure(error: GenerationError) {
        responses.addLast(Response.Failure(error))
    }

    override fun generateFull(input: GenerationInput): GenerationOutput {
        calls += input
        val response =
            responses.removeFirstOrNull()
                ?: error("FakeContentGenerator: no more queued responses (call #${calls.size})")
        return when (response) {
            is Response.Success -> response.output
            is Response.Failure ->
                throw com.readmates.aigen.adapter.out.llm.common
                    .LlmGenerationException(response.error)
        }
    }
}

internal class FakeContentRegenerator(
    override val provider: Provider,
    private val responses: ArrayDeque<Response> = ArrayDeque(),
) : SessionContentRegenerator {
    sealed class Response {
        data class Success(
            val output: RegenerationOutput,
        ) : Response()

        data class Failure(
            val error: GenerationError,
        ) : Response()
    }

    val calls: MutableList<RegenerationInput> = mutableListOf()

    fun enqueueSuccess(output: RegenerationOutput) {
        responses.addLast(Response.Success(output))
    }

    fun enqueueFailure(error: GenerationError) {
        responses.addLast(Response.Failure(error))
    }

    override fun regenerateItem(input: RegenerationInput): RegenerationOutput {
        calls += input
        val response =
            responses.removeFirstOrNull()
                ?: error("FakeContentRegenerator: no more queued responses")
        return when (response) {
            is Response.Success -> response.output
            is Response.Failure ->
                throw com.readmates.aigen.adapter.out.llm.common
                    .LlmGenerationException(response.error)
        }
    }
}

internal class FakeValidator(
    var result: ValidationResult = ValidationResult.Ok,
) : SessionImportV1Validator {
    val calls: MutableList<Pair<SessionImportV1Snapshot, SessionMeta>> = mutableListOf()
    var resultProvider: ((SessionImportV1Snapshot, SessionMeta) -> ValidationResult)? = null

    override fun validate(
        snapshot: SessionImportV1Snapshot,
        sessionMeta: SessionMeta,
    ): ValidationResult {
        calls += snapshot to sessionMeta
        return resultProvider?.invoke(snapshot, sessionMeta) ?: result
    }
}

internal class FakeLatencyNotification : AiGenerationLatencyNotification {
    data class Notified(
        val jobId: UUID,
        val sessionId: UUID,
        val clubId: UUID,
        val hostUserId: UUID,
    )

    val notified: MutableList<Notified> = mutableListOf()

    override fun notifyLongGeneration(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) {
        notified += Notified(jobId, sessionId, clubId, hostUserId)
    }
}

internal class FakeSleeper : Sleeper {
    val sleeps: MutableList<Duration> = mutableListOf()

    override fun sleep(duration: Duration) {
        sleeps += duration
    }
}

internal class FakeClock(
    private val ticks: ArrayDeque<Instant>,
    private val fixedZone: java.time.ZoneId = ZoneOffset.UTC,
) : Clock() {
    constructor(vararg instants: Instant) : this(ArrayDeque(instants.toList()))

    override fun getZone(): java.time.ZoneId = fixedZone

    override fun withZone(zone: java.time.ZoneId): Clock = FakeClock(ticks, zone)

    override fun instant(): Instant = if (ticks.size > 1) ticks.removeFirst() else ticks.first()
}

/**
 * Returns a real [AiGenerationMetrics] backed by an in-memory [SimpleMeterRegistry]
 * so the label-allowlist invariants in [AiGenerationMetrics.aigenMeter] run during
 * each service-level test (no behaviour change, just observability).
 */
internal fun fakeMetrics(): AiGenerationMetrics = AiGenerationMetrics(SimpleMeterRegistry())

internal object AiGenerationTestFixtures {
    val CLAUDE_MODEL = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")
    val CLAUDE_FALLBACK = ModelId(Provider.CLAUDE, "claude-sonnet-fallback")
    val CLAUDE_PRICING =
        ModelPricing(
            inputPerMTokenUsd = BigDecimal("3"),
            cacheWriteInputPerMTokenUsd = BigDecimal("3"),
            cachedInputPerMTokenUsd = BigDecimal("0.30"),
            outputPerMTokenUsd = BigDecimal("15"),
        )
    val NOW: Instant = Instant.parse("2026-05-16T10:00:00Z")

    fun defaultProperties(
        fallback: String = CLAUDE_FALLBACK.name,
        notificationThreshold: Duration = Duration.ofSeconds(60),
    ): AiGenerationProperties =
        AiGenerationProperties(
            enabled = true,
            mock = false,
            enabledProviders = setOf("CLAUDE"),
            fallbackDefaultModel = fallback,
            caps =
                AiGenerationProperties.Caps(
                    hostDailyCalls = 10,
                    clubMonthlyCostUsd = BigDecimal("20.00"),
                    hostPerMinuteCalls = 5,
                    softWarningRatio = BigDecimal("0.80"),
                ),
            job =
                AiGenerationProperties.Job(
                    redisTtl = Duration.ofHours(6),
                    notificationLatencyThreshold = notificationThreshold,
                    maxLlmCallsPerJob = 3,
                ),
            pricing = emptyMap(),
        )

    fun defaultModelCatalog(enabled: Set<ModelId> = setOf(CLAUDE_MODEL, CLAUDE_FALLBACK)): FakeModelCatalog =
        FakeModelCatalog(
            pricing = enabled.associateWith { CLAUDE_PRICING },
            enabled = enabled,
        )

    fun sessionMeta(
        sessionId: UUID = UUID.randomUUID(),
        clubId: UUID = UUID.randomUUID(),
        expectedAuthorNames: List<String> = listOf("Alice", "Bob"),
    ): SessionMeta =
        SessionMeta(
            sessionId = sessionId,
            clubId = clubId,
            sessionNumber = 7,
            bookTitle = "Test Book",
            bookAuthor = "Author Author",
            meetingDate = LocalDate.of(2026, 5, 16),
            expectedAuthorNames = expectedAuthorNames,
            authorNameMode = AuthorNameMode.REAL,
        )

    fun snapshot(summary: String = "An interesting discussion."): SessionImportV1Snapshot =
        SessionImportV1Snapshot(
            format = "readmates-session-import:v1",
            sessionNumber = 7,
            bookTitle = "Test Book",
            meetingDate = LocalDate.of(2026, 5, 16),
            summary = summary,
            highlights =
                listOf(
                    SessionImportV1Snapshot.AuthoredText("Alice", "I liked this line."),
                ),
            oneLineReviews =
                listOf(
                    SessionImportV1Snapshot.AuthoredText("Alice", "Wonderful."),
                    SessionImportV1Snapshot.AuthoredText("Bob", "Solid."),
                ),
            feedbackDocumentFileName = "feedback.md",
            feedbackDocumentMarkdown = "<!-- readmates-feedback:v1 -->\n# 독서모임 7차 피드백\n",
        )

    @Suppress("LongParameterList")
    fun jobRecord(
        jobId: UUID = UUID.randomUUID(),
        sessionId: UUID = UUID.randomUUID(),
        clubId: UUID = UUID.randomUUID(),
        hostUserId: UUID = UUID.randomUUID(),
        model: ModelId = CLAUDE_MODEL,
        status: JobStatus = JobStatus.PENDING,
        stage: JobStage? = JobStage.QUEUED,
        result: SessionImportV1Snapshot? = null,
        error: GenerationError? = null,
        instructions: String? = null,
        transcript: String = "transcript text",
        sessionMeta: SessionMeta = sessionMeta(sessionId = sessionId, clubId = clubId),
        expiresAt: Instant = NOW.plusSeconds(21_600L),
        createdAt: Instant = NOW,
        lastUpdatedAt: Instant = createdAt,
    ): JobRecord =
        JobRecord(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            model = model,
            authorNameMode = AuthorNameMode.REAL,
            instructions = instructions,
            transcript = transcript,
            sessionMeta = sessionMeta,
            status = status,
            stage = stage,
            progressPct = if (status == JobStatus.SUCCEEDED) 100 else 0,
            result = result,
            error = error,
            tokens =
                TokenUsage(
                    nonCachedInputTokens = 0,
                    cacheWriteInputTokens = 0,
                    cacheReadInputTokens = 0,
                    outputTokens = 0,
                ),
            costAccumulatedUsd = BigDecimal.ZERO,
            expiresAt = expiresAt,
            createdAt = createdAt,
            lastUpdatedAt = lastUpdatedAt,
        )

    fun providerError(code: ErrorCode): GenerationError = GenerationError(code, code.name)

    fun snapshotOutput(
        summary: String = "An interesting discussion.",
        usage: TokenUsage =
            TokenUsage(
                nonCachedInputTokens = 100,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 200,
            ),
    ): GenerationOutput = GenerationOutput(snapshot(summary), usage)
}
