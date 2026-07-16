# Task 4 Report: Atomic Provider Call And Cost Reservation

## Status

Implemented the approved Task 4 physical-call ledger and worst-case cost reservation contract on the
single-node Redis assumption. The provider-call coordinator remains Task 6 scope; this task adds the
reservation/reconciliation port and Redis implementation without routing provider callers early.

## RED evidence

1. `./server/gradlew -p server integrationTest --tests '*RedisProviderCallReservationAdapterTest'`
   - Failed in `compileTestKotlin` because `ProviderAttempt`, reservation/reconciliation commands and
     results, the port, fail-closed exception, adapter, and scripts did not exist.
2. Focused `RedisGenerationCostCountersTest.initial admission leaves monthly cost decision and accounting
   to provider reservation`
   - Failed at line 90 because the legacy admission guard still rejected at the monthly cap.
3. Focused `RedisAiGenerationJobStoreTest` ledger lifecycle tests
   - Two failures: update/status indexing did not refresh the attempt-ledger TTL and job deletion did not
     remove the ledger key.
4. Review-driven accounting-integrity tests added five independent RED failures:
   - foreign-club reserve and reconciliation were not bound to the job hash's persisted club;
   - missing and non-expiring monthly counters allowed reconciliation to terminalize;
   - reusing an attempt ID returned `Reserved`, which could permit caller transport re-entry.
5. Final stale-recovery review added two RED failures: missing and non-expiring monthly counters still let
   recovery terminalize `IN_FLIGHT` attempts as `ESTIMATED_UNKNOWN` after their reserved cost was lost.

All RED failures were behavior/contract failures rather than fixture or container failures.

## GREEN evidence

Command:

```text
./server/gradlew -p server integrationTest \
  --tests '*RedisProviderCallReservationAdapterTest' \
  --tests '*RedisGenerationCostCountersTest' \
  --tests '*RedisAiGenerationJobStoreTest'
```

Result: `BUILD SUCCESSFUL` in 21s, 60 tests, 0 failures/errors/skips; `detekt` passed in the same invocation.

- `RedisProviderCallReservationAdapterTest`: 20/20.
- `RedisGenerationCostCountersTest`: 13/13.
- `RedisAiGenerationJobStoreTest`: 27/27.
- Call-cap race: 64 concurrent requests produced exactly 3 reservations and 61 call-cap rejections.
- Monthly-cap race: 64 concurrent requests at USD 0.40 with USD 1.00 cap produced exactly 2 reservations,
  62 monthly-cap rejections, and USD 0.80 reserved total.
- `detekt`: passed after resolving all Task 4 findings.
- `git diff --check`: passed.

`./scripts/server-ci-check.sh` also executed unit and architecture lanes successfully (unit: 899 tests,
0 failures/errors, 3 skipped; architecture: 21/21). The wrapper exited non-zero only because Gradle's
ktlint source input also included four concurrently modified files in the parent/root checkout outside this
worktree. Those external paths reported a package-name issue at line 1; no Task 4 file remained in either
ktlint report.

## Implemented invariants

- One reserve Lua checks job/status, admission ownership plus positive TTL, call cap, monthly cap, then
  attempt-id existence in that exact order before any write.
- Reserve and reconciliation atomically bind the command club to the job hash's persisted `clubId`; a
  foreign-club command cannot select another club's lease or monthly counter.
- A successful reserve increments `llmCallCount`, reserves maximum cost, assigns a 1-based ordinal, writes
  content-free `IN_FLIGHT` metadata, renews the owning admission, and applies the exact TTL rules.
- Reconciliation applies `actual - reserved` once for complete usage and records `ACTUAL`; uncertain usage
  keeps the maximum and records `ESTIMATED_UNKNOWN`. It requires the reserved monthly counter to exist with
  a positive TTL before any terminal write. Terminal attempts cannot transition again.
- Stale recovery changes only current `IN_FLIGHT` entries to `UNKNOWN`; it never adds a slot, changes cost,
  or invents a second attempt. It atomically revalidates the job/club binding and the positive-TTL monthly
  counter before terminalizing any entry.
- Redis errors surface as `ProviderCallReservationUnavailableException`; callers cannot proceed as though
  reservation succeeded.
- Ledger payload stores no admission/session/club/user ID and no prompt/schema/transcript/completion/evidence
  or raw provider error. Club/admission values remain command-only Redis key-selection inputs.
- The legacy guard now owns initial daily/per-minute admission only. Temporary usage recording and lease
  renewal APIs are deprecated for Task 6 removal; warning lookup remains.
- Existing four-channel Redis token writes, including `tokensCacheWrite`, remain unchanged. Task 3's
  `ProviderCallMode` and `CostBasis` values remain intact.

## Changed files

- `server/src/main/kotlin/com/readmates/aigen/application/model/ProviderCallModels.kt`
- `server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallReservationPort.kt`
- `server/src/main/kotlin/com/readmates/aigen/application/port/out/GenerationCostGuard.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/ProviderCallReservationRedisScripts.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisIndexes.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt`
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`

## Self-review and concerns

- Reserve/reconcile/recovery scripts were checked against every ordered design invariant and reject path.
- No automatic pre-transport or uncertain-outcome release path was added.
- The temporary deprecated cost APIs still compile for existing callers and must be removed only after Task 6
  routes every physical call through the new port.
- `ESTIMATED_UNKNOWN` intentionally can close the monthly cap early; operator adjustment remains future
  audited work, not an automatic release.
- Container shutdown logs include the existing local OTLP connection-refused warning; it did not fail tests.
- Aggregate ktlint should be rerun after the parent/root checkout's concurrent package edits settle.
- Independent read-only re-review after all accounting fixes returned READY with no Critical, Important, or
  Minor findings.

## Formatting follow-up

- Corrected only the Kotlin continuation indentation of the stale-recovery `redisTemplate.execute(...)`
  chain; runtime behavior and Redis arguments are unchanged.
- `./server/gradlew -p server ktlintMainSourceSetCheck` no longer reports the reservation adapter. The task
  remains non-zero only for the two known parent/root checkout package-line findings outside this worktree.
- `./server/gradlew -p server compileKotlin integrationTest --tests
  '*RedisProviderCallReservationAdapterTest'` completed successfully; the adapter suite remains 20/20.
- `git diff --check` passed before the formatting-only commit.
