# ReadMates AI Generation Job/Commit State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI generation jobs use explicit `COMMITTING` and `COMMITTED` lifecycle states with atomic Redis-backed transitions so worker, regenerate, commit, and cancel paths cannot overwrite each other.

**Architecture:** Keep the existing `aigen` clean-architecture slice. Add a pure transition policy under `application/service`, extend the `AiGenerationJobStore` port with compare-and-set transition methods, implement those methods in the Redis adapter with Lua scripts, then update application services and frontend state handling to use the new lifecycle. No DB migration is required.

**Tech Stack:** Kotlin 2.2, Spring Boot 4, Redis `StringRedisTemplate` + Lua scripts, JUnit 5, AssertJ, React 19, TanStack Query v5, Vitest, Testing Library.

---

## Source Spec

- Spec: `docs/superpowers/specs/2026-05-18-readmates-aigen-job-commit-state-machine-design.md`
- Surface guides read before planning: `docs/agents/docs.md`, `docs/agents/server.md`, `docs/agents/front.md`

## Code Review Adjustments (2026-05-18)

After cross-checking against `server/src/main/kotlin/com/readmates/aigen/**` and `front/features/host/aigen/**`, the spec was updated with a "코드 검토 결과 발견된 추가 결함과 결정" section and this plan was revised to reflect those decisions. Specifically:

- Commit lifecycle (Task 5)
  - Override is persisted via `saveResultIfStatus(expected = COMMITTING)` AFTER the `SUCCEEDED -> COMMITTING` transition, never before, to prevent a cancel race from leaking host PII into a `CANCELLED` hash.
  - Delegate failures are recovered for the full `RuntimeException` surface, not only `InvalidSessionImportException`, so transient downstream errors cannot leave the job stuck in `COMMITTING` until TTL.
  - Order on the success path is `transition COMMITTING -> COMMITTED` first, THEN `deleteTransientPayload(jobId)`, so `load()` polls cannot observe a "non-terminal + payload missing" stale window.
- Redis adapter (Task 3)
  - `PAYLOAD_OPTIONAL_STATUSES` includes `COMMITTING` in addition to terminals, closing the same polling window from the read side as a defense-in-depth measure.
  - A new Step 6b persists `expiresAt` on the hash and reads it back in `fromHash`, so `GET /jobs/{jobId}` no longer reports a moving target on each poll.
- Worker (Task 4)
  - `AiGenerationJobTransitionPolicy` is NOT injected into `AiGenerationWorker`. The CAS already enforces the lifecycle, and policy calls on the stale local `record.status` would have been dead code. The policy remains for commit/regenerate/orchestrator (where it gates before any CAS) and for unit-pinning the status/action matrix.
  - `costGuard.recordUsage(...)` runs BEFORE `saveResultIfStatus(...)` so cancel-during-running does not silently drop club/host monthly cost accounting after a paid provider call.
- Regeneration (Task 6)
  - Race-loss audit uses `ErrorCode.JOB_EXPIRED` (lifecycle effectively ended) instead of `UNKNOWN` (500 mapping) so audit grep keeps semantic meaning.

## File Structure

Create:

- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt`  
  Pure lifecycle policy. Defines which actions are allowed from each `JobStatus`.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicyTest.kt`  
  Pins the status/action matrix from the spec.

Modify:

- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`  
  Add `COMMITTING` and `COMMITTED` to `JobStatus`.
- `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`  
  Add compare-and-set transition, conditional result save, and transient payload deletion methods.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt`  
  Keep service tests fast by mirroring the new store port in `FakeJobStore`.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`  
  Implement atomic transition/result-save scripts, terminal hash loading, and transient payload deletion.
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`  
  Cover transition scripts, terminal hash behavior, stale non-terminal cleanup, and stable `expiresAt`.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`  
  Guard provider call and result persistence with status transitions.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt`  
  Add worker/cancel race regressions.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`  
  Add `SUCCEEDED -> COMMITTING -> COMMITTED` flow and failure recovery.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`  
  Add commit transition, duplicate commit, and delegate failure recovery tests.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`  
  Require `SUCCEEDED` and conditionally persist patched snapshots.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt`  
  Add non-`SUCCEEDED` and race-after-provider tests.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`  
  Change cancel to transition to `CANCELLED` and delete transient payload instead of deleting the whole hash.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`  
  Update cancel expectations and add disallowed cancel status tests.
- `front/features/host/aigen/api/aigen-contracts.ts`  
  Add `COMMITTING` and `COMMITTED` to `AiGenerationStatus`.
- `front/features/host/aigen/hooks/useAiGenerationJob.ts`  
  Stop polling on `COMMITTED`; keep polling on `COMMITTING`.
- `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`  
  Add polling tests for `COMMITTING` and `COMMITTED`.
- `front/features/host/aigen/ui/AiGenerateTab.tsx`  
  Show saving state for `COMMITTING`, complete state for `COMMITTED`, and delete draft on server-side committed status.
- `front/features/host/aigen/ui/AiGenerateTab.test.tsx`  
  Add state-machine tests for `COMMITTING` and `COMMITTED`.

## Task 1: Add Status Contract and Transition Policy

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicyTest.kt`

- [ ] **Step 1: Write the failing transition policy test**

Create `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicyTest.kt`:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.JobStatus
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationJobTransitionPolicyTest {
    private val policy = AiGenerationJobTransitionPolicy()
    private val jobId = UUID.fromString("00000000-0000-0000-0000-000000000001")

    @Test
    fun `worker may only start from PENDING`() {
        assertAllowed { policy.requireWorkerStart(JobStatus.PENDING, jobId) }

        listOf(
            JobStatus.RUNNING,
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "worker start") {
                policy.requireWorkerStart(status, jobId)
            }
        }
    }

    @Test
    fun `worker completion may only persist from RUNNING`() {
        assertAllowed { policy.requireWorkerCompletion(JobStatus.RUNNING, jobId) }

        listOf(
            JobStatus.PENDING,
            JobStatus.SUCCEEDED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "worker completion") {
                policy.requireWorkerCompletion(status, jobId)
            }
        }
    }

    @Test
    fun `regenerate and commit may only start from SUCCEEDED`() {
        assertAllowed { policy.requireRegenerate(JobStatus.SUCCEEDED, jobId) }
        assertAllowed { policy.requireCommit(JobStatus.SUCCEEDED, jobId) }

        listOf(
            JobStatus.PENDING,
            JobStatus.RUNNING,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "regenerate") {
                policy.requireRegenerate(status, jobId)
            }
            assertRejected(status, "commit") {
                policy.requireCommit(status, jobId)
            }
        }
    }

    @Test
    fun `cancel is allowed before terminal and before commit starts`() {
        listOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED).forEach { status ->
            assertAllowed { policy.requireCancel(status, jobId) }
        }

        listOf(
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.COMMITTING,
            JobStatus.COMMITTED,
        ).forEach { status ->
            assertRejected(status, "cancel") {
                policy.requireCancel(status, jobId)
            }
        }
    }

    private fun assertAllowed(block: () -> Unit) {
        assertThatCode(block).doesNotThrowAnyException()
    }

    private fun assertRejected(
        status: JobStatus,
        action: String,
        block: () -> Unit,
    ) {
        assertThatThrownBy(block)
            .isInstanceOfSatisfying(AiGenerationException.IllegalGenerationState::class.java) { error ->
                org.assertj.core.api.Assertions.assertThat(error.currentStatus).isEqualTo(status.name)
                org.assertj.core.api.Assertions.assertThat(error.attemptedAction).isEqualTo(action)
            }
    }
}
```

- [ ] **Step 2: Run the failing policy test**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationJobTransitionPolicyTest'
```

Expected: compile failure because `COMMITTING`, `COMMITTED`, and `AiGenerationJobTransitionPolicy` do not exist.

- [ ] **Step 3: Add the two statuses**

In `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`, replace the current `JobStatus` enum with:

```kotlin
enum class JobStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    COMMITTING,
    COMMITTED,
    FAILED,
    CANCELLED,
}
```

- [ ] **Step 4: Implement the transition policy**

Create `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt`:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.JobStatus
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class AiGenerationJobTransitionPolicy {
    fun requireWorkerStart(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "worker start", JobStatus.PENDING)
    }

    fun requireWorkerCompletion(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "worker completion", JobStatus.RUNNING)
    }

    fun requireRegenerate(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "regenerate", JobStatus.SUCCEEDED)
    }

    fun requireCommit(
        status: JobStatus,
        jobId: UUID,
    ) {
        requireStatus(jobId, status, "commit", JobStatus.SUCCEEDED)
    }

    fun requireCancel(
        status: JobStatus,
        jobId: UUID,
    ) {
        if (status !in CANCELLABLE_STATUSES) {
            throw illegalState(jobId, status, "cancel")
        }
    }

    private fun requireStatus(
        jobId: UUID,
        actual: JobStatus,
        attemptedAction: String,
        expected: JobStatus,
    ) {
        if (actual != expected) {
            throw illegalState(jobId, actual, attemptedAction)
        }
    }

    private fun illegalState(
        jobId: UUID,
        status: JobStatus,
        attemptedAction: String,
    ): AiGenerationException.IllegalGenerationState =
        AiGenerationException.IllegalGenerationState(
            jobId = jobId,
            currentStatus = status.name,
            attemptedAction = attemptedAction,
        )

    private companion object {
        val CANCELLABLE_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)
    }
}
```

- [ ] **Step 5: Run the policy test**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationJobTransitionPolicyTest'
```

Expected: pass.

- [ ] **Step 6: Commit the policy slice**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicy.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationJobTransitionPolicyTest.kt
git commit -m "feat(aigen): add job transition policy"
```

## Task 2: Extend JobStore Port and Test Fake

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt`

- [ ] **Step 1: Add the new port methods**

In `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`, add these methods to `AiGenerationJobStore` after `patchItem(...)`:

```kotlin
    /**
     * Atomically change status only when the current status belongs to [expected].
     * Returns false when the job is missing or a competing transition already won.
     */
    fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ): Boolean

    /**
     * Atomically save the full result only when the job is still in [expected].
     * Returns false when commit/cancel/another worker transition already won.
     */
    fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
    ): Boolean

    /**
     * Delete transient PII/result payload keys while keeping the safe job hash for
     * terminal status reads until the hash TTL expires.
     */
    fun deleteTransientPayload(jobId: UUID): Unit
```

Keep the existing `delete(jobId)` method; queue-publish compensation and stale cleanup can still remove the full job.

- [ ] **Step 2: Update `FakeJobStore` with deterministic behavior**

In `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt`, add fields to `FakeJobStore`:

```kotlin
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
```

Add these method implementations before `incrementLlmCallCount(...)`:

```kotlin
    override fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ): Boolean {
        val current = records[jobId] ?: return false
        if (current.status !in expected) return false
        records[jobId] = current.copy(
            status = next,
            stage = stage,
            progressPct = progressPct,
            error = error,
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
    ): Boolean {
        if (failNextConditionalSave) {
            failNextConditionalSave = false
            return false
        }
        val current = records[jobId] ?: return false
        if (current.status != expected) return false
        records[jobId] = current.copy(
            result = result,
            tokens = TokenUsage(
                current.tokens.inputTokens + usage.inputTokens,
                current.tokens.cachedInputTokens + usage.cachedInputTokens,
                current.tokens.outputTokens + usage.outputTokens,
            ),
            costAccumulatedUsd = current.costAccumulatedUsd.add(cost),
        )
        return true
    }

    override fun deleteTransientPayload(jobId: UUID) {
        transientPayloadDeleted += jobId
        mutationOrder += "deleteTransient"
        val current = records[jobId] ?: return
        records[jobId] = current.copy(
            transcript = "",
            result = null,
        )
    }
```

- [ ] **Step 3: Run a compile check for service tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationOrchestratorTest'
```

Expected: pass. If the compiler reports unimplemented interface methods, verify `FakeJobStore` implements all three new methods.

- [ ] **Step 4: Commit the port/fake slice**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt
git commit -m "feat(aigen): extend job store lifecycle port"
```

## Task 3: Implement Redis Atomic Transitions

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`

- [ ] **Step 1: Add failing Redis transition tests**

Append these tests to `RedisAiGenerationJobStoreTest` before helper methods:

```kotlin
    @Test
    fun `transitionStatus only updates when current status is expected`() {
        val record = newRecord()
        store.save(record)

        val first = store.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING),
            next = JobStatus.RUNNING,
            stage = JobStage.TRANSCRIPT_LOADED,
            progressPct = 5,
            error = null,
        )
        val second = store.transitionStatus(
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

        val saved = store.saveResultIfStatus(
            jobId = record.jobId,
            expected = JobStatus.RUNNING,
            result = snapshot(),
            usage = TokenUsage(100, 0, 100),
            cost = BigDecimal("0.01"),
        )

        val loaded = store.load(record.jobId)!!
        assertThat(saved).isFalse()
        assertThat(loaded.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(loaded.result).isNull()
        assertThat(loaded.tokens.inputTokens).isEqualTo(0L)
    }

    @Test
    fun `deleteTransientPayload keeps terminal hash but removes transcript and result`() {
        val record = newRecord()
        store.save(record)
        store.saveResult(record.jobId, snapshot(), TokenUsage(1, 0, 1), BigDecimal("0.001"))
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
```

- [ ] **Step 2: Run the failing Redis tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest'
```

Expected: compile failure because the Redis adapter does not implement the new port methods.

- [ ] **Step 3: Implement `transitionStatus`**

In `RedisAiGenerationJobStore`, add this method after `patchItem(...)`:

```kotlin
    override fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ): Boolean =
        runCatching {
            val result = redisTemplate.execute(
                TRANSITION_STATUS_SCRIPT,
                listOf(hashKey(jobId)),
                expected.joinToString(",") { it.name },
                next.name,
                stage?.name.orEmpty(),
                progressPct.toString(),
                error?.code?.name.orEmpty(),
                error?.message?.take(MAX_ERROR_MESSAGE_LEN).orEmpty(),
            )
            result == 1L
        }.onFailure { recordFailure("transitionStatus") }.getOrThrow()
```

- [ ] **Step 4: Implement `saveResultIfStatus`**

Add this method after `transitionStatus(...)`:

```kotlin
    override fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
    ): Boolean =
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val resultJson = objectMapper.writeValueAsString(result)
            val saved = redisTemplate.execute(
                SAVE_RESULT_IF_STATUS_SCRIPT,
                listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId)),
                expected.name,
                resultJson,
                usage.inputTokens.toString(),
                usage.cachedInputTokens.toString(),
                usage.outputTokens.toString(),
                cost.toPlainString(),
                ttlSeconds.toString(),
            )
            saved == 1L
        }.onFailure { recordFailure("saveResultIfStatus") }.getOrThrow()
```

- [ ] **Step 5: Implement `deleteTransientPayload`**

Add this method before `delete(jobId)`:

```kotlin
    override fun deleteTransientPayload(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                DELETE_TRANSIENT_PAYLOAD_SCRIPT,
                listOf(transcriptKey(jobId), resultKey(jobId)),
            )
        }.onFailure { recordFailure("deleteTransientPayload") }.getOrThrow()
    }
```

- [ ] **Step 6: Make terminal hashes load without transcript**

Replace the transcript lookup in `load(jobId)` with this block:

```kotlin
            val status = hash["status"]?.let { JobStatus.valueOf(it) }
            val transcript = redisTemplate.opsForValue().get(transcriptKey(jobId))
            if (transcript == null && status !in PAYLOAD_OPTIONAL_STATUSES) {
                return@runCatching deleteStaleJob(jobId)
            }
            val resultJson = redisTemplate.opsForValue().get(resultKey(jobId))
            val result =
                resultJson?.let { objectMapper.readValue(it, SessionImportV1Snapshot::class.java) }

            fromHash(jobId, hash, transcript.orEmpty(), result)
```

Add this set to the companion object. `COMMITTING` is intentionally payload-optional: the commit success path performs `transition COMMITTING -> COMMITTED` then `deleteTransientPayload`, but `transcript`/`result` keys can also TTL-expire independently of the hash. Including `COMMITTING` here closes the polling race window where a host poll could otherwise see 410 `JOB_EXPIRED` for a few milliseconds.

```kotlin
        val PAYLOAD_OPTIONAL_STATUSES =
            setOf(JobStatus.COMMITTING, JobStatus.COMMITTED, JobStatus.CANCELLED, JobStatus.FAILED)
```

Also add an integration test pinning the new payload-optional case for `COMMITTING`:

```kotlin
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
```

- [ ] **Step 6b: Persist `expiresAt` on the hash for stable poll responses**

Spec §"Redis adapter" requires `expiresAt` to be stored on the hash so that `GET /jobs/{jobId}` does not drift with each load. Without this step the integration assertion "stored `expiresAt` is preserved" (Task 8 verification) cannot pass.

In `toHash(job)`, add:

```kotlin
                "expiresAt" to job.expiresAt.toString(),
```

In `fromHash`, replace `val expiresAt = Instant.now().plus(properties.job.redisTtl)` with:

```kotlin
        val expiresAt =
            hash["expiresAt"]
                ?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: Instant.now().plus(properties.job.redisTtl)
```

Add an integration test:

```kotlin
    @Test
    fun `load preserves expiresAt stored on the hash`() {
        val record = newRecord()
        store.save(record)
        val first = store.load(record.jobId)!!.expiresAt
        Thread.sleep(20)
        val second = store.load(record.jobId)!!.expiresAt
        assertThat(second).isEqualTo(first)
    }
```

- [ ] **Step 7: Add Lua scripts**

Add these scripts to the companion object:

```kotlin
        /**
         * KEYS[1]=hashKey
         * ARGV[1]=comma-separated expected statuses, ARGV[2]=next status,
         * ARGV[3]=stage or "", ARGV[4]=progressPct,
         * ARGV[5]=errorCode or "", ARGV[6]=errorMessage or "".
         */
        val TRANSITION_STATUS_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                if redis.call('EXISTS', KEYS[1]) == 0 then
                  return 0
                end
                local current = redis.call('HGET', KEYS[1], 'status')
                local expected = ',' .. ARGV[1] .. ','
                if string.find(expected, ',' .. current .. ',', 1, true) == nil then
                  return 0
                end
                redis.call('HSET', KEYS[1], 'status', ARGV[2])
                if ARGV[3] == '' then
                  redis.call('HDEL', KEYS[1], 'stage')
                else
                  redis.call('HSET', KEYS[1], 'stage', ARGV[3])
                end
                redis.call('HSET', KEYS[1], 'progressPct', ARGV[4])
                if ARGV[5] == '' then
                  redis.call('HDEL', KEYS[1], 'errorCode', 'errorMessage')
                else
                  redis.call('HSET', KEYS[1], 'errorCode', ARGV[5])
                  redis.call('HSET', KEYS[1], 'errorMessage', ARGV[6])
                end
                return 1
                """.trimIndent(),
                Long::class.java,
            )

        /**
         * KEYS[1]=hashKey, KEYS[2]=resultKey, KEYS[3]=transcriptKey
         * ARGV[1]=expected status, ARGV[2]=resultJson, ARGV[3..5]=token deltas,
         * ARGV[6]=cost delta, ARGV[7]=ttlSeconds.
         */
        val SAVE_RESULT_IF_STATUS_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                if redis.call('EXISTS', KEYS[1]) == 0 then
                  return 0
                end
                if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then
                  return 0
                end
                redis.call('SET', KEYS[2], ARGV[2])
                redis.call('EXPIRE', KEYS[2], ARGV[7])
                redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[3])
                redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[4])
                redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[5])
                redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[6])
                redis.call('EXPIRE', KEYS[1], ARGV[7])
                if redis.call('EXISTS', KEYS[3]) == 1 then
                  redis.call('EXPIRE', KEYS[3], ARGV[7])
                end
                return 1
                """.trimIndent(),
                Long::class.java,
            )

        /** KEYS[1]=transcriptKey, KEYS[2]=resultKey; deletes transient payload only. */
        val DELETE_TRANSIENT_PAYLOAD_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                return redis.call('DEL', KEYS[1], KEYS[2])
                """.trimIndent(),
                Long::class.java,
            )
```

- [ ] **Step 8: Run Redis tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest'
```

Expected: pass.

- [ ] **Step 9: Commit Redis lifecycle storage**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt
git commit -m "feat(aigen): add atomic Redis job transitions"
```

## Task 4: Update Worker Lifecycle

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt`

- [ ] **Step 1: Add worker race tests**

Append these tests to `AiGenerationWorkerTest`:

```kotlin
    @Test
    fun `process returns without provider call when pending to running transition loses`() {
        val ctx = TestContext()
        val record = ctx.savedRecord().copy(status = JobStatus.CANCELLED, stage = null)
        ctx.jobStore.save(record)

        ctx.worker.process(record.jobId)

        assertThat(ctx.generator.calls).isEmpty()
        assertThat(ctx.auditPort.entries).isEmpty()
    }

    @Test
    fun `process does not persist success when status changes before result save`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.jobStore.failNextConditionalSave = true
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(100, 0, 200),
            ),
        )

        ctx.worker.process(record.jobId)

        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.result).isNull()
        assertThat(updated.status).isEqualTo(JobStatus.RUNNING)
        assertThat(ctx.auditPort.entries).isEmpty()
    }
```

- [ ] **Step 2: Run the failing worker tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationWorkerTest'
```

Expected: at least one new test fails because `process` still calls provider after loading a non-`PENDING` record or persists result without conditional status save.

- [ ] **Step 3: Skip policy injection in the worker**

`AiGenerationJobTransitionPolicy` is a pure unit-test surface (spec §"코드 검토 결과 발견된 추가 결함과 결정"). After a successful `transitionStatus(PENDING -> RUNNING)` the in-memory `record.status` is still the stale `PENDING`, so a `policy.requireWorkerStart(record.status, ...)` call would always pass and is dead code. The worker enforces lifecycle through Redis CAS only.

Do not add a `transitionPolicy` constructor argument to `AiGenerationWorker`. Keep `AiGenerationWorkerTest`'s `TestContext` unchanged for the worker. The policy remains a separately-tested artifact for `AiGenerationCommitService`, `AiGenerationRegenerationService`, and `AiGenerationOrchestrator` (where the `requireX` calls run on freshly-loaded `record.status` and gate before any CAS).

- [ ] **Step 4: Guard worker start**

At the start of `process(jobId)`, replace:

```kotlin
        val record = jobStore.load(jobId) ?: return // expired / already cleaned
        val start = clock.instant()
        val generator = resolveGenerator(record, start) ?: return
```

with:

```kotlin
        val record = jobStore.load(jobId) ?: return // expired / already cleaned
        val start = clock.instant()
        if (!jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.PENDING),
                next = JobStatus.RUNNING,
                stage = JobStage.TRANSCRIPT_LOADED,
                progressPct = PROGRESS_PROVIDER_RUNNING_PCT,
                error = null,
            )
        ) {
            return
        }
        val runningRecord = record.copy(
            status = JobStatus.RUNNING,
            stage = JobStage.TRANSCRIPT_LOADED,
            progressPct = PROGRESS_PROVIDER_RUNNING_PCT,
        )
        val generator = resolveGenerator(runningRecord, start) ?: return
```

Then pass `runningRecord` into `runGenerationWithValidationRetry`, `succeed`, and `failJob`:

```kotlin
        when (val outcome = runGenerationWithValidationRetry(runningRecord, generator)) {
            is Outcome.Success -> succeed(runningRecord, outcome.snapshot, outcome.usage, start)
            is Outcome.Failure -> failJob(runningRecord, outcome.error.code, outcome.error.message, start)
        }
```

- [ ] **Step 5: Stop `resolveGenerator` from flipping status**

In `resolveGenerator`, remove the `jobStore.updateStatus(...)` block that writes `RUNNING`. Keep the model/provider availability checks.

- [ ] **Step 6: Persist success conditionally with cost recorded first**

`costGuard.recordUsage(...)` must run BEFORE the conditional save. The provider call has already executed by the time we reach `succeed(...)`, so the cost was incurred regardless of whether cancel won the race. Recording cost before the CAS preserves club/host monthly accounting (see spec §"비용 회계 정책").

In `succeed(...)`, replace this block:

```kotlin
        jobStore.saveResult(record.jobId, snapshot, usage, cost)
        // Record cost BEFORE the visible status flip so a cost-guard
        // counter outage cannot leave a SUCCEEDED job without its
        // accumulated cost recorded (task_1_7 finding #8). recordUsage
        // failures must not fail the job — log and swallow so the
        // host still sees the result.
        try {
            costGuard.recordUsage(record.hostUserId, record.clubId, cost)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: RuntimeException,
        ) {
            logger.warn(
                "costGuard.recordUsage failed for jobId={}; status flip will proceed",
                record.jobId,
                failure,
            )
        }
        jobStore.updateStatus(record.jobId, JobStatus.SUCCEEDED, JobStage.READY, PROGRESS_COMPLETE_PCT, null)
```

with:

```kotlin
        // Cost was incurred by the provider call regardless of cancel race.
        // Record BEFORE the CAS so cancel-during-running does not silently
        // drop club/host monthly accounting (spec §"비용 회계 정책").
        // recordUsage failures must not fail the job — log and swallow.
        try {
            costGuard.recordUsage(record.hostUserId, record.clubId, cost)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: RuntimeException,
        ) {
            logger.warn(
                "costGuard.recordUsage failed for jobId={}; status flip will proceed",
                record.jobId,
                failure,
            )
        }
        val saved = jobStore.saveResultIfStatus(record.jobId, JobStatus.RUNNING, snapshot, usage, cost)
        if (!saved) {
            return  // cancel/commit/another worker won the race
        }
        if (!jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.RUNNING),
                next = JobStatus.SUCCEEDED,
                stage = JobStage.READY,
                progressPct = PROGRESS_COMPLETE_PCT,
                error = null,
            )
        ) {
            return  // cancel won the race
        }
```

Add a worker test pinning the cost-accounting invariant:

```kotlin
    @Test
    fun `succeed records cost even when conditional result save loses to cancel`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.jobStore.failNextConditionalSave = true
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(100, 0, 200),
            ),
        )

        ctx.worker.process(record.jobId)

        assertThat(ctx.costGuard.recorded).hasSize(1)
        assertThat(ctx.jobStore.load(record.jobId)!!.result).isNull()
        assertThat(ctx.auditPort.entries).isEmpty()
    }
```

- [ ] **Step 7: Make failures conditional**

In `failJob(...)`, replace `jobStore.updateStatus(...)` with:

```kotlin
        val transitioned = jobStore.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING, JobStatus.RUNNING),
            next = JobStatus.FAILED,
            stage = null,
            progressPct = 0,
            error = GenerationError(code, message),
        )
        if (!transitioned) {
            return
        }
```

Keep metrics/audit after this conditional transition.

- [ ] **Step 8: Run worker tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationWorkerTest'
```

Expected: pass.

- [ ] **Step 9: Commit worker lifecycle**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt
git commit -m "fix(aigen): guard worker job transitions"
```

## Task 5: Update Commit Lifecycle

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`

- [ ] **Step 1: Add commit transition tests**

Append these tests to `AiGenerationCommitServiceTest`:

```kotlin
    @Test
    fun `commit transitions succeeded to committing to committed and deletes transient payload`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
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

        // Spec §"코드 검토 결과 발견된 추가 결함과 결정": transition to COMMITTED MUST
        // happen before deleteTransientPayload so a concurrent /get poll never sees
        // "non-terminal + payload missing" and 410s.
        // Implementation note: extend `FakeJobStore` with a unified ordering log,
        // e.g. `val mutationOrder: MutableList<String> = mutableListOf()`, push
        // "transition:${next.name}" inside `transitionStatus` (when it returns true)
        // and "deleteTransient" inside `deleteTransientPayload`. Then assert:
        assertThat(ctx.jobStore.mutationOrder)
            .containsSubsequence("transition:COMMITTED", "deleteTransient")
    }

    @Test
    fun `commit delegate failure restores job to succeeded for retry`() {
        val ctx = TestContext()
        ctx.delegate.exception = InvalidSessionImportException(
            listOf(SessionImportIssue("INVALID", "safe validation failure")),
        )
        val record = AiGenerationTestFixtures.jobRecord(
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
        val record = AiGenerationTestFixtures.jobRecord(
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
        val record = AiGenerationTestFixtures.jobRecord(
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
```

- [ ] **Step 2: Run the failing commit tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationCommitServiceTest'
```

Expected: failures because commit still deletes the whole job and does not use `COMMITTING`.

- [ ] **Step 3: Inject transition policy**

Add constructor dependency in `AiGenerationCommitService`:

```kotlin
    private val transitionPolicy: AiGenerationJobTransitionPolicy,
```

Update `TestContext` construction:

```kotlin
            transitionPolicy = AiGenerationJobTransitionPolicy(),
```

- [ ] **Step 4: Require `SUCCEEDED` before resolving snapshot**

After session mismatch check in `commit(...)`, add:

```kotlin
        transitionPolicy.requireCommit(record.status, record.jobId)
```

- [ ] **Step 5: Transition to `COMMITTING` BEFORE persisting any override**

Spec §"코드 검토 결과 발견된 추가 결함과 결정" requires that override never be written to a non-`COMMITTING` hash. The existing code persists override via `saveResult` (no status check) which leaks host PII to a `CANCELLED` hash if cancel sneaks in between validation and transition.

Restructure `commit(...)` so the order is: precheck policy → validate snapshot → CAS to `COMMITTING` → conditional override save → delegate → terminal transition. Remove the existing unconditional `jobStore.saveResult(jobId, overrideResult, ...)` call. Replace it with the block below, placed immediately after the validation `when` branch:

```kotlin
        val beganCommit = jobStore.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.SUCCEEDED),
            next = JobStatus.COMMITTING,
            stage = JobStage.READY,
            progressPct = 100,
            error = null,
        )
        if (!beganCommit) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = record.jobId,
                currentStatus = jobStore.load(record.jobId)?.status?.name ?: "MISSING",
                attemptedAction = "commit",
            )
        }

        if (overrideResult != null) {
            val overrideSaved = jobStore.saveResultIfStatus(
                jobId = jobId,
                expected = JobStatus.COMMITTING,
                result = overrideResult,
                usage = TokenUsage(0, 0, 0),
                cost = BigDecimal.ZERO,
            )
            if (!overrideSaved) {
                jobStore.transitionStatus(
                    jobId = record.jobId,
                    expected = setOf(JobStatus.COMMITTING),
                    next = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    progressPct = 100,
                    error = null,
                )
                throw AiGenerationException.IllegalGenerationState(
                    jobId = record.jobId,
                    currentStatus = jobStore.load(record.jobId)?.status?.name ?: "MISSING",
                    attemptedAction = "commit",
                )
            }
        }
```

Add imports for `JobStage` and `JobStatus`.

- [ ] **Step 6: Recover from ALL delegate failures, not just `InvalidSessionImportException`**

Spec §"코드 검토 결과 발견된 추가 결함과 결정" calls out the production risk: any other `RuntimeException` from `commitValidated` would leave the job stuck in `COMMITTING` forever (until TTL). Use a structured try/catch that recovers status on every throw path while preserving the existing masking for `InvalidSessionImportException`.

Replace the existing `try { commitDelegate.commitValidated(...) } catch (InvalidSessionImportException) { ... }` block with:

```kotlin
        val result =
            try {
                commitDelegate.commitValidated(ValidatedSessionImportInput(command))
            } catch (error: InvalidSessionImportException) {
                jobStore.transitionStatus(
                    jobId = record.jobId,
                    expected = setOf(JobStatus.COMMITTING),
                    next = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    progressPct = 100,
                    error = null,
                )
                failCommit(
                    record,
                    ValidationResult.Violation(
                        ErrorCode.SCHEMA_INVALID,
                        "Generated session import failed validation",
                    ),
                )
            } catch (
                @Suppress("TooGenericExceptionCaught") error: RuntimeException,
            ) {
                jobStore.transitionStatus(
                    jobId = record.jobId,
                    expected = setOf(JobStatus.COMMITTING),
                    next = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    progressPct = 100,
                    error = null,
                )
                auditPort.insert(
                    AuditLogEntry(
                        jobId = record.jobId,
                        sessionId = record.sessionId,
                        clubId = record.clubId,
                        hostUserId = record.hostUserId,
                        kind = AuditKind.COMMIT,
                        item = null,
                        provider = record.model.provider,
                        model = record.model.name,
                        transcriptSha256 = null,
                        usage = record.tokens,
                        costEstimateUsd = record.costAccumulatedUsd,
                        status = AuditStatus.FAILED,
                        errorCode = ErrorCode.UNKNOWN,
                        errorMessage = "Commit delegate failed; status restored to SUCCEEDED",
                        latencyMs = 0,
                        createdAt = clock.instant(),
                    ),
                )
                throw error
            }
```

Add a test pinning the broader recovery:

```kotlin
    @Test
    fun `commit delegate runtime failure restores job to succeeded and rethrows`() {
        val ctx = TestContext()
        ctx.delegate.exception = IllegalStateException("downstream transient failure")
        val record = AiGenerationTestFixtures.jobRecord(
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
```

(If `FakeCommitDelegate` does not yet expose a generic `exception: Throwable?`, extend it from the existing `InvalidSessionImportException`-only field — see Task 2's fake updates pattern.)

- [ ] **Step 7: Transition to `COMMITTED` FIRST, then delete transient payload**

Order matters: the spec mandates `transition → deleteTransientPayload`. The reverse order opens a window where `load()` sees `COMMITTING + transcript missing` and (depending on the `PAYLOAD_OPTIONAL_STATUSES` set) could return 410.

Replace:

```kotlin
        jobStore.delete(jobId)
```

with:

```kotlin
        jobStore.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.COMMITTING),
            next = JobStatus.COMMITTED,
            stage = null,
            progressPct = 100,
            error = null,
        )
        jobStore.deleteTransientPayload(jobId)
```

- [ ] **Step 8: Run commit tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationCommitServiceTest'
```

Expected: pass.

- [ ] **Step 9: Commit commit lifecycle**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt
git commit -m "fix(aigen): make commit lifecycle explicit"
```

## Task 6: Update Regenerate and Cancel Lifecycles

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`

- [ ] **Step 1: Add regenerate lifecycle tests**

Append to `AiGenerationRegenerationServiceTest`:

```kotlin
    @Test
    fun `regenerate rejects jobs that are not succeeded`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.COMMITTING,
            result = AiGenerationTestFixtures.snapshot(),
        )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.regenerate(ctx.sessionId, record.jobId, GenerationItem.SUMMARY, null, null)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.regenerator.calls).isEmpty()
    }

    @Test
    fun `regenerate does not patch when status changes before conditional save`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.SUCCEEDED,
            result = AiGenerationTestFixtures.snapshot("original"),
        )
        ctx.jobStore.save(record)
        ctx.jobStore.failNextConditionalSave = true
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "patched",
                usage = TokenUsage(1, 0, 1),
            ),
        )

        assertThatThrownBy {
            ctx.service.regenerate(ctx.sessionId, record.jobId, GenerationItem.SUMMARY, null, null)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.jobStore.load(record.jobId)!!.result!!.summary).isEqualTo("original")
        val failedAudit = ctx.auditPort.entries.single()
        assertThat(failedAudit.status).isEqualTo(AuditStatus.FAILED)
        // Spec §"코드 검토 결과 발견된 추가 결함과 결정": race-loss uses JOB_EXPIRED
        // (job lifecycle effectively ended), not UNKNOWN — UNKNOWN maps to 500 and
        // hides the semantic in audit grep.
        assertThat(failedAudit.errorCode).isEqualTo(ErrorCode.JOB_EXPIRED)
    }
```

- [ ] **Step 2: Add cancel lifecycle tests**

Replace the `cancel deletes job record and writes CANCEL audit row` test in `AiGenerationOrchestratorTest` with:

```kotlin
    @Test
    fun `cancel marks job cancelled and deletes transient payload while keeping hash`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.RUNNING,
            stage = JobStage.GENERATING_SUMMARY,
            result = AiGenerationTestFixtures.snapshot(),
        )
        ctx.jobStore.save(record)

        ctx.orchestrator.cancel(ctx.sessionId, record.jobId, ctx.hostUserId)

        val stored = ctx.jobStore.load(record.jobId)!!
        assertThat(stored.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(stored.result).isNull()
        assertThat(ctx.jobStore.transientPayloadDeleted).containsExactly(record.jobId)
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.CANCEL)
        assertThat(audit.status).isEqualTo(AuditStatus.CANCELLED)
    }
```

Add this test after the host mismatch test:

```kotlin
    @Test
    fun `cancel rejects committed job`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.COMMITTED,
            stage = null,
        )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.orchestrator.cancel(ctx.sessionId, record.jobId, ctx.hostUserId)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.auditPort.entries).isEmpty()
    }
```

- [ ] **Step 3: Run failing regenerate/cancel tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationRegenerationServiceTest' --tests 'com.readmates.aigen.application.service.AiGenerationOrchestratorTest'
```

Expected: failures because regenerate and cancel still use the old lifecycle behavior.

- [ ] **Step 4: Inject policy into regeneration service**

Add constructor dependency in `AiGenerationRegenerationService`:

```kotlin
    private val transitionPolicy: AiGenerationJobTransitionPolicy,
```

Update its test `TestContext` construction:

```kotlin
            transitionPolicy = AiGenerationJobTransitionPolicy(),
```

- [ ] **Step 5: Require `SUCCEEDED` before regenerate**

After loading the record and session mismatch check in `regenerate(...)`, add:

```kotlin
        transitionPolicy.requireRegenerate(record.status, record.jobId)
```

- [ ] **Step 6: Persist regenerate conditionally**

In `persistAndAuditRegenSuccess(...)`, replace:

```kotlin
        jobStore.patchItem(record.jobId, item, patchedSnapshot, output.usage, cost)
```

with:

```kotlin
        val saved = jobStore.saveResultIfStatus(record.jobId, JobStatus.SUCCEEDED, patchedSnapshot, output.usage, cost)
        if (!saved) {
            auditPort.insert(
                AuditLogEntry(
                    jobId = record.jobId,
                    sessionId = record.sessionId,
                    clubId = record.clubId,
                    hostUserId = record.hostUserId,
                    kind = AuditKind.REGENERATE,
                    item = item,
                    provider = modelId.provider,
                    model = modelId.name,
                    transcriptSha256 = null,
                    usage = TokenUsage(0, 0, 0),
                    costEstimateUsd = BigDecimal.ZERO,
                    status = AuditStatus.FAILED,
                    // Race-loss uses JOB_EXPIRED — the job's editable lifecycle has effectively
                    // ended (cancelled, committed, or moved past SUCCEEDED). Avoid UNKNOWN
                    // because it maps to 500 and obscures the cause in audit greps.
                    errorCode = ErrorCode.JOB_EXPIRED,
                    errorMessage = "Job state changed before regeneration result could be saved",
                    latencyMs = 0,
                    createdAt = clock.instant(),
                ),
            )
            throw AiGenerationException.IllegalGenerationState(
                jobId = record.jobId,
                currentStatus = jobStore.load(record.jobId)?.status?.name ?: "MISSING",
                attemptedAction = "regenerate",
            )
        }
```

Keep cost usage and success audit after the conditional save.

- [ ] **Step 7: Inject policy into orchestrator**

Add constructor dependency in `AiGenerationOrchestrator`:

```kotlin
    private val transitionPolicy: AiGenerationJobTransitionPolicy,
```

Update `AiGenerationOrchestratorTest` construction:

```kotlin
            transitionPolicy = AiGenerationJobTransitionPolicy(),
```

- [ ] **Step 8: Change cancel implementation**

In `cancel(...)`, replace:

```kotlin
        jobStore.delete(jobId)
```

with:

```kotlin
        transitionPolicy.requireCancel(record.status, record.jobId)
        val cancelled = jobStore.transitionStatus(
            jobId = record.jobId,
            expected = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED),
            next = JobStatus.CANCELLED,
            stage = null,
            progressPct = 0,
            error = null,
        )
        if (!cancelled) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = jobId,
                currentStatus = jobStore.load(jobId)?.status?.name ?: "MISSING",
                attemptedAction = "cancel",
            )
        }
        jobStore.deleteTransientPayload(jobId)
```

- [ ] **Step 9: Run regenerate/cancel tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationRegenerationServiceTest' --tests 'com.readmates.aigen.application.service.AiGenerationOrchestratorTest'
```

Expected: pass.

- [ ] **Step 10: Commit regenerate/cancel lifecycle**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationServiceTest.kt \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt
git commit -m "fix(aigen): enforce regenerate and cancel lifecycle"
```

## Task 7: Update Frontend Status Handling

**Files:**
- Modify: `front/features/host/aigen/api/aigen-contracts.ts`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.ts`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`

- [ ] **Step 1: Extend frontend status type**

In `front/features/host/aigen/api/aigen-contracts.ts`, replace `AiGenerationStatus` with:

```typescript
export type AiGenerationStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "COMMITTING"
  | "COMMITTED"
  | "FAILED"
  | "CANCELLED";
```

- [ ] **Step 2: Add polling tests**

In `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`, add:

```typescript
  it("continues polling when status is COMMITTING", async () => {
    vi.useFakeTimers();
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTING"));
    const { Wrapper } = createWrapper();
    renderHook(() => useAiGenerationJob("s1", "j1"), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(2));
  });

  it("stops polling when status is COMMITTED", async () => {
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTED"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", "j1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("COMMITTED");
    });

    const callsAfterSettle = mockedGetJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetJob.mock.calls.length).toBe(callsAfterSettle);
  });
```

- [ ] **Step 3: Update terminal status set**

In `front/features/host/aigen/hooks/useAiGenerationJob.ts`, replace the comment and set with:

```typescript
 * - Terminal statuses (FAILED / CANCELLED / COMMITTED): stop polling.
```

```typescript
const TERMINAL_STATUSES: ReadonlySet<AiGenerationJobResponse["status"]> = new Set([
  "FAILED",
  "CANCELLED",
  "COMMITTED",
]);
```

- [ ] **Step 4: Add UI tests for COMMITTING and COMMITTED**

In `front/features/host/aigen/ui/AiGenerateTab.test.tsx`, add:

```typescript
  it("shows saving state when poll returns COMMITTING", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTING"));

    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={() => {}} />
      </Wrapper>,
    );

    await screen.findByText("AI로 세션 기록 생성");
    const file = new File(["t"], "transcript.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });
    });
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(await screen.findByRole("status")).toHaveTextContent("AI 기록을 저장하는 중입니다.");
    expect(screen.queryByRole("button", { name: /기록 저장/ })).not.toBeInTheDocument();
  });

  it("treats server COMMITTED status as completed and calls onCommitted once", async () => {
    mockedStart.mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      expiresAt: "2026-05-16T18:00:00Z",
    });
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTED"));

    const onCommitted = vi.fn();
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <AiGenerateTab sessionId="s1" clubSlug="club-a" onCommitted={onCommitted} />
      </Wrapper>,
    );

    await screen.findByText("AI로 세션 기록 생성");
    const file = new File(["t"], "transcript.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/대본 파일/), { target: { files: [file] } });
    });
    const submit = screen.getByRole("button", { name: /생성 시작/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(await screen.findByRole("status")).toHaveTextContent("AI 기록 저장을 완료했습니다.");
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 5: Update `AiGenerateTab` render logic**

In `AiGenerateTab.tsx`, add this effect after the `CANCELLED` effect:

```typescript
  useEffect(() => {
    if (stage.tag !== "active") return;
    if (jobStatus !== "COMMITTED") return;
    clearAigenDraft(stage.jobId);
    adoptedForJobRef.current = null;
    setEditedSnapshot(null);
    setStage({ tag: "committed" });
    onCommitted();
  }, [stage, jobStatus, onCommitted]);
```

In the active render block, before the `FAILED` branch, add:

```typescript
    if (jobStatus === "COMMITTING") {
      return (
        <div className="small" role="status">
          AI 기록을 저장하는 중입니다.
        </div>
      );
    }
```

- [ ] **Step 6: Run frontend AI tests**

Run:

```bash
pnpm --dir front test -- aigen
```

Expected: pass.

- [ ] **Step 7: Commit frontend lifecycle UI**

Run:

```bash
git add front/features/host/aigen/api/aigen-contracts.ts \
  front/features/host/aigen/hooks/useAiGenerationJob.ts \
  front/features/host/aigen/hooks/useAiGenerationJob.test.tsx \
  front/features/host/aigen/ui/AiGenerateTab.tsx \
  front/features/host/aigen/ui/AiGenerateTab.test.tsx
git commit -m "feat(front): handle committed AI generation jobs"
```

## Task 8: Final Verification and Documentation Check

**Files:**
- Verify only unless implementation exposes a doc mismatch.

- [ ] **Step 1: Run targeted backend AI tests**

Run:

```bash
./server/gradlew -p server unitTest --tests '*AiGeneration*'
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest'
```

Expected: pass.

- [ ] **Step 2: Run architecture and quality gates**

Run:

```bash
./server/gradlew -p server architectureTest
./server/gradlew -p server check
```

Expected: pass.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
pnpm --dir front test -- aigen
pnpm --dir front test
pnpm --dir front lint
pnpm --dir front build
```

Expected: pass.

- [ ] **Step 4: Run workflow-level E2E if local services are available**

Run:

```bash
pnpm --dir front test:e2e -- aigen
```

Expected: pass when the local E2E backend/database setup is available. If local E2E services are not running, record the skip reason in the final implementation report.

- [ ] **Step 5: Run public-safety scans before shipping**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: pass. If scanner output points at pre-existing historical `docs/superpowers` content outside this work, report it separately and verify this implementation did not introduce the finding.

- [ ] **Step 6: Review changed docs for current-behavior drift**

Run:

```bash
git diff --check
rg -n "COMMITTING|COMMITTED|JOB_EXPIRED|aigen" docs/development README.md CHANGELOG.md
```

Expected: no whitespace errors. If implementation changes current behavior documented in `docs/development/architecture.md` or README, update those docs in the same branch with public-safe wording. If no current-behavior docs mention AI job terminal states, no doc update is required beyond this plan/spec.

- [ ] **Step 7: Commit verification/doc updates**

If docs changed in Step 6, run:

```bash
git add docs/development/architecture.md README.md CHANGELOG.md
git commit -m "docs: align AI generation lifecycle docs"
```

If no docs changed, do not create an empty commit.
