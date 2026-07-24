# ReadMates Test Suite Server Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify all 61 server effectiveness candidates, close the R03–R09 server-side gaps with the lowest truthful test layer, and reduce only proven duplication or infrastructure cost without weakening regression detection.

**Architecture:** Phase 2 is server-only and consumes the immutable Phase 1 inventory, candidate ledger, baseline report, and approved design. It first restores the previously missing Testcontainers evidence, then records a file-level semantic decision before changing tests, strengthens the security/data/lifecycle/transaction/cache/AI/notification boundaries, and finally proves the same candidate HEAD with focused and complete server gates.

**Tech Stack:** Kotlin 2.4, Spring Boot, JDK 25, Gradle 9.6.1, JUnit 5, AssertJ, MockK, MySQL 8.4, Flyway, Testcontainers, Redis, Kafka, JaCoCo, Bash, Git.

**Review Status:** `APPROVED_FOR_EXECUTION` after the Phase 1 candidate; execute before Phase 3.

## Global Constraints

- Do not change product behavior, public API contracts, production migrations, coverage thresholds, retries, timeouts, sleeps, workers, Gradle forks, heap defaults, or Testcontainers reuse policy.
- Keep the server JaCoCo line minimum at `0.23`; a test deletion or consolidation must not lower the measured line coverage without an explained layer move.
- A Phase 1 static flag is a review prompt, not a deletion decision. `oversized`, `mock-heavy`, and `assertion-signal-missing` may be false positives.
- Do not delete or merge a test unless its production branch, assertion observation point, test-double boundary, duplicate relationship, and replacement failure-mode evidence are recorded.
- New behavior tests use the lowest layer that can observe the real risk. SQL, transaction, Flyway, Redis, Kafka, and cross-club persistence semantics remain integration tests.
- A missing Docker daemon is `UNVERIFIED_ENV` and blocks deletion, consolidation, runtime, flake, and performance conclusions for integration candidates.
- Do not add real member data, private domains, secrets, deployment identifiers, local absolute paths, token-shaped examples, or raw provider content to fixtures, logs, reports, or commits.
- Preserve the Phase 1 source commit and reports. Do not rewrite `docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md`.
- Every task ends in a focused passing command and a single-purpose commit. Stop on a production defect instead of weakening the new assertion.

---

## Scope And Dependency Check

This is plan 2 of 5. It starts from the Phase 1 candidate `184e524336d4b72d2f0e72c7dc704a4e3a696535` and must finish before Phase 3.

```text
Task 1 environment and runtime baseline
  -> Task 2 61-file semantic decisions
  -> Tasks 3-7 risk closure
  -> Task 8 candidate cleanup
  -> Task 9 full server verification and handoff
```

Owned risks:

| Risk | Required Phase 2 outcome |
| --- | --- |
| R03 | Cross-club resource-ID denial matrix exists at API/DB boundaries |
| R04 | PUBLIC, MEMBER, ATTENDEE, and HOST_ONLY visibility denial is runtime-verified |
| R05 | Forbidden lifecycle and duplicate-command behavior is explicit |
| R06 | Transaction rollback and existing-schema Flyway upgrade are integration-verified |
| R07 | Real Redis stale-read and post-commit invalidation failure behavior is verified |
| R08 | Redis reservation/concurrency/recovery behavior is runtime-verified |
| R09 | Outbox reclaim and Kafka partial-delivery/idempotency behavior is runtime-verified |

R01 Spring filter behavior is reviewed here when a server test changes, but Phase 3 owns the end-to-end BFF/OAuth contract.

## File Structure Map

| Path | Responsibility |
| --- | --- |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv` | One row for each of the 61 server candidate paths |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-report.md` | Runtime, coverage, timing, changes, retained candidates, and residual risk |
| `server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt` | R03 membership/role denial |
| `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt` | R03/R04 club scope and viewer/attendee visibility |
| `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt` | R04 public visibility matrix |
| `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt` | R05 lifecycle/idempotency and post-commit invalidation orchestration |
| `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt` | R03/R05 API/DB denial and duplicate command evidence |
| `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt` | R06 unit rollback orchestration |
| `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt` | R06 actual transaction rollback |
| `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt` | R06 baseline and upgrade-path schema evidence |
| `server/src/test/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt` | R07 real Redis invalidation |
| `server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt` | R07 public stale-read contract |
| `server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt` | R07 notes stale-read contract |
| `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt` | R08 atomic call/cost reservations |
| `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt` | R08 receipt/lease convergence |
| `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt` | R08 authorization and API failure evidence |
| `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt` | R09 outbox lease/reclaim/idempotency |
| `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt` | R09 sent/retry/dead decisions |
| `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt` | R09 Kafka delivery and metadata |

Other server tests may change only when they are members of the reproducible 61-file candidate set and their decision row authorizes that exact change.

## Decision Ledger Interface

The TSV header is fixed:

```text
path	lane	flags	production_target	failure_mode	observation	test_double	duplicate_of	decision	destination	rationale
```

`decision` is exactly one of `retain`, `strengthen`, `consolidate`, `delete`, `move-layer`, or `split`. `duplicate_of` and `destination` use `-` when not applicable. Every path is repo-relative.

---

### Task 1: Restore The Server Runtime Baseline

**Files:**
- Create, do not commit: `.tmp/test-suite-phase-2/server-ci-before.log`
- Create, do not commit: `.tmp/test-suite-phase-2/server-integration-before.log`

**Interfaces:**
- Consumes: Phase 1 server baseline and the current Docker/Testcontainers environment.
- Produces: a trustworthy before-state for all server decisions.

- [ ] **Step 1: Verify the immutable input and toolchain**

Run:

```bash
git status --short --branch
git rev-parse HEAD
test -s docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-1-report.md
java -version
./server/gradlew -p server --version
docker info
```

Expected: clean worktree; the Phase 1 reports exist; JDK 25 is selected; `docker info` exits 0. If Docker is unavailable, repair/start the local Docker provider and rerun this step. Do not continue with `UNVERIFIED_ENV`.

- [ ] **Step 2: Record one clean PR-level and integration baseline**

Run:

```bash
mkdir -p .tmp/test-suite-phase-2
/usr/bin/time -p ./scripts/server-ci-check.sh \
  > .tmp/test-suite-phase-2/server-ci-before.log 2>&1
/usr/bin/time -p ./server/gradlew -p server integrationTest \
  > .tmp/test-suite-phase-2/server-integration-before.log 2>&1
```

Expected: both commands exit 0. Record test counts, real time, JaCoCo values, retry/re-execution signals, and any Testcontainers warnings for the Task 9 report. Do not commit `.tmp`.

---

### Task 2: Classify All 61 Server Candidates

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv`

**Interfaces:**
- Consumes: Phase 1 inventory/candidate ledger, current production code, current assertions, and Task 1 runtime evidence.
- Produces: the only authorization source for Task 8 cleanup.

- [ ] **Step 1: Prove and freeze the candidate set**

Run:

```bash
phase2_tmp=.tmp/test-suite-phase-2
awk -F '\t' '
  NR==FNR && FNR>1 { lane[$1]=$2; next }
  FNR>1 && lane[$1] ~ /^server-/ { print $1 }
' docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv \
  | sort -u > "$phase2_tmp/server-candidates.txt"

test "$(wc -l < "$phase2_tmp/server-candidates.txt" | tr -d ' ')" -eq 61
```

Expected: exactly 61 unique repo-relative paths.

- [ ] **Step 2: Review production target and assertion semantics**

For each path in `server-candidates.txt`, read the whole test file and the production classes it invokes. Record one ledger row per path. A row cannot be `delete` or `consolidate` merely because the file is large, uses mocks, or contains a static assertion-signal flag.

Required evidence:

```text
production_target: exact source class or migration
failure_mode: the regression the test must catch
observation: return/error/HTTP/DB/Redis/Kafka/log/metric evidence
test_double: none, fake port, MockK, Spring mock, container, or other exact boundary
duplicate_of: exact path protecting the same failure mode, otherwise -
decision: retain/strengthen/consolidate/delete/move-layer/split
destination: exact surviving or new test path, otherwise -
rationale: why regression detection is preserved or improved
```

- [ ] **Step 3: Validate and commit the ledger**

Run:

```bash
test "$(tail -n +2 docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv | wc -l | tr -d ' ')" -eq 61
test "$(tail -n +2 docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv | cut -f1 | sort -u | wc -l | tr -d ' ')" -eq 61
git diff --check -- docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv
git add docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv
git commit -m "docs: classify server test effectiveness candidates"
```

Expected: one docs-only commit with 61 complete decision rows.

---

### Task 3: Close Tenant, Visibility, And Lifecycle Gaps

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`
- Modify if required by the recorded failure mode: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

**Interfaces:**
- Consumes: R03–R05 and current `ClubContextResolver`, `SecurityConfig`, `PublicQueryService`, `ClubPublicVisibility`, and `HostSessionLifecycleService`.
- Produces: explicit denial matrices without changing the product contract.

- [ ] **Step 1: Add cross-club resource-ID denial**

Add integration cases that authenticate in club A, submit a session/record/member identifier owned by club B, and assert the documented denial status plus zero DB mutation. Cover at least one read and one mutation endpoint.

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.auth.api.AuthenticatedMemberSecurityTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: PASS; the new cases observe HTTP denial and unchanged rows, not only a mocked service call.

- [ ] **Step 2: Complete the visibility matrix**

Add table-driven or clearly separated integration cases for `PUBLIC`, `MEMBER`, `ATTENDEE`, and `HOST_ONLY`, covering anonymous, active non-attendee member, attendee, host, and cross-club principal where applicable. Preserve existing unpublished and removed-author cases.

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest
```

Expected: PASS; each denied visibility combination is absent or rejected at the public/member endpoint.

- [ ] **Step 3: Make forbidden and duplicate lifecycle commands explicit**

Add focused service/API cases for invalid invitation/publication/session transitions and duplicate replay. Assert both the returned application error/result and absence of a second write, outbox event, cache eviction, or audit transition.

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.session.application.service.HostSessionServicesTest
./server/gradlew -p server integrationTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: PASS with no timeout/retry changes.

- [ ] **Step 4: Commit the R03–R05 evidence**

Run:

```bash
git add server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt \
  server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git diff --cached --check
git commit -m "test(server): strengthen tenant visibility lifecycle denial"
```

Expected: only tests and test fixtures change.

---

### Task 4: Prove Transaction Rollback And Flyway Upgrade

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Create only if a reusable old-schema fixture is necessary: `server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql`

**Interfaces:**
- Consumes: current record apply transaction, operational migrations under `server/src/main/resources/db/mysql/migration`.
- Produces: R06 rollback and existing-schema upgrade evidence.

- [ ] **Step 1: Add a real mid-transaction rollback case**

Use a test-only failure seam already available in the application/persistence boundary, or a DB constraint failure after the first write. Assert that live record replacement, immutable revision, draft deletion, and outbox rows all remain at their pre-command values.

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest
./server/gradlew -p server integrationTest \
  --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest
```

Expected: PASS; the integration assertion queries every affected table after the failure.

- [ ] **Step 2: Add an existing-schema-to-latest Flyway fixture**

Construct a public-safe schema/data state representing the last meaningful pre-latest migration boundary, run the normal migration chain, and assert preserved rows plus latest constraints/indexes. Do not edit production migrations or use destructive production data.

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: PASS from both empty baseline and the checked-in upgrade fixture.

- [ ] **Step 3: Commit R06**

Run:

```bash
git add server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt \
  server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
if test -f server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql; then
  git add server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql
fi
git diff --cached --check
git commit -m "test(server): cover rollback and flyway upgrade paths"
```

Expected: no production migration changes.

---

### Task 5: Close Real Redis Invalidation And Stale-Read Risk

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt`
- Modify if post-commit orchestration needs a focused assertion: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`

**Interfaces:**
- Consumes: `ReadCacheInvalidationPort` and real Redis adapters.
- Produces: R07 evidence that unrelated club keys survive, target keys disappear after commit, and invalidation failure cannot create a false fresh read.

- [ ] **Step 1: Add post-commit invalidation and stale-read cases**

Seed real Redis values for target and unrelated clubs, perform the host mutation through the application boundary, trigger transaction completion, and assert target miss/refetch plus unrelated hit. Add a failure-path assertion for metrics/logging without surfacing cached private data.

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.shared.adapter.out.redis.RedisReadCacheInvalidationAdapterTest
./server/gradlew -p server unitTest \
  --tests com.readmates.publication.application.service.PublicQueryServiceCacheTest \
  --tests com.readmates.note.application.service.NotesFeedServiceCacheTest \
  --tests com.readmates.session.application.service.HostSessionServicesTest
```

Expected: PASS with real Redis used for adapter semantics and fakes used only for service orchestration.

- [ ] **Step 2: Commit R07**

Run:

```bash
git add server/src/test/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt \
  server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt \
  server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt \
  server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt
git diff --cached --check
git commit -m "test(server): verify redis invalidation and stale reads"
```

---

### Task 6: Close AI Reservation And Recovery Runtime Risk

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`

**Interfaces:**
- Consumes: durable call/cost reservation, receipt, lease, cancel, expiry, and recovery behavior.
- Produces: R08 runtime evidence with no external provider call and no generated content in logs.

- [ ] **Step 1: Add the missing interleaving matrix**

Cover at least cancel-versus-reserve, expiry-versus-reconcile, duplicate delivery after provider response, and recovery after commit receipt. Use barriers/latches or controlled clocks already present in tests; do not add sleeps or expand timeouts. Assert physical call count, monthly cost, attempt terminal state, lease ownership, and content-free audit data.

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapterTest \
  --tests com.readmates.aigen.api.AiGenerateApiIntegrationTest
./server/gradlew -p server unitTest \
  --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest
```

Expected: PASS; no network provider is invoked.

- [ ] **Step 2: Commit R08**

Run:

```bash
git add server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt \
  server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt
git diff --cached --check
git commit -m "test(server): verify ai reservation recovery races"
```

---

### Task 7: Close Outbox And Kafka Partial-Delivery Risk

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`

**Interfaces:**
- Consumes: outbox leases, retry/dead decisions, Kafka producer/consumer metadata.
- Produces: R09 evidence for crash/reclaim/redelivery without duplicate side effects.

- [ ] **Step 1: Add partial-delivery and reclaim cases**

Cover publication success followed by local mark failure, stale publishing lease reclaim, Kafka redelivery with the same event ID, and failed delivery transition to retry/dead. Assert one logical dispatch, preserved request/event metadata, bounded sanitized error text, and correct DB state.

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest
```

Expected: PASS without increasing Awaitility or latch deadlines.

- [ ] **Step 2: Commit R09**

Run:

```bash
git add server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt \
  server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt \
  server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt
git diff --cached --check
git commit -m "test(server): cover outbox partial delivery recovery"
```

---

### Task 8: Apply Only Ledger-Approved Candidate Cleanup

**Files:**
- Modify/delete/create: only exact paths authorized by `docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv`.

**Interfaces:**
- Consumes: all 61 decision rows and the risk tests from Tasks 3–7.
- Produces: smaller or clearer tests only where regression detection is preserved.

- [ ] **Step 1: Process safe decisions in this order**

Apply `split`, then `move-layer`, then `consolidate`, and finally `delete`. Retained and strengthened files stay in place. Preserve JUnit tags so every resulting file remains in exactly one Phase 1 lane.

For each changed group:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest
./server/gradlew -p server architectureTest
```

Expected: all three lanes PASS with the same failure mode asserted at the surviving destination.

- [ ] **Step 2: Prove inventory reachability after moves/splits**

Run:

```bash
./server/gradlew -p server unitTest --dry-run
./server/gradlew -p server integrationTest --dry-run
./server/gradlew -p server architectureTest --dry-run
rg -n '@Tag\("(integration|container|architecture)"\)' server/src/test/kotlin
```

Expected: every changed test class is selected by exactly one intended task; no default `test` task is enabled.

- [ ] **Step 3: Commit cleanup**

Run:

```bash
git add server/src/test docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv
git diff --cached --check
git commit -m "test(server): apply evidence-backed suite cleanup"
```

If no decision authorizes a cleanup, do not create an empty commit; record that all candidates were retained/strengthened in Task 9.

---

### Task 9: Verify And Report Phase 2

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-report.md`

**Interfaces:**
- Consumes: all Phase 2 commits and Task 1 before-state.
- Produces: the Phase 3 input and same-HEAD server acceptance evidence.

- [ ] **Step 1: Run focused-risk suites three times for flake/timing evidence**

Run the exact focused class set from Tasks 3–7 three times without changing forks, heap, retries, or timeouts. Record real time and min/median/max:

```bash
for phase2_run in 1 2 3; do
  /usr/bin/time -p ./server/gradlew -p server unitTest \
    --tests com.readmates.session.application.service.HostSessionServicesTest \
    --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest \
    --tests com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest
  /usr/bin/time -p ./server/gradlew -p server integrationTest \
    --tests com.readmates.publication.api.PublicControllerDbTest \
    --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
    --tests com.readmates.support.MySqlFlywayMigrationTest \
    --tests com.readmates.shared.adapter.out.redis.RedisReadCacheInvalidationAdapterTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapterTest \
    --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
    --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
done
```

Expected: all six commands exit 0 with no retry or nondeterministic failure.

- [ ] **Step 2: Run the complete server gates once on the final candidate**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
git diff --check
```

Expected: PASS; JaCoCo minimum remains `0.23`; no production or migration file changed.

- [ ] **Step 3: Write the Phase 2 report**

Record:

- before/after test file and case counts by server lane;
- all 61 decisions and counts by disposition;
- R03–R09 exact tests and runtime status;
- deleted/consolidated/split/moved files and surviving failure mode;
- JaCoCo before/after;
- before/after full-lane and three-run focused timing;
- flake/retry observation;
- any remaining server risk;
- explicit statement that product code, migrations, thresholds, retries, timeouts, workers, and forks were unchanged.

- [ ] **Step 4: Commit and seal the handoff**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-report.md
git diff --cached --check
git commit -m "docs: report server test suite optimization"
git status --short --branch
git log --oneline --decorate -8
```

Expected: clean worktree. Phase 3 may start only from this committed HEAD.
