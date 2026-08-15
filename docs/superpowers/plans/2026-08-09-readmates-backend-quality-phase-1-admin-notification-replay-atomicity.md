# ReadMates Backend Quality Phase 1 — Admin Notification Replay Atomicity

> **Execution:** Use subagent-driven development in this session. Run one fresh implementer and one independent reviewer per task, sequentially. Keep the plan ledger, task briefs, reports, and review packages in the dedicated SDD workspace. Do not begin the following AI Kafka plan until this plan is approved.

**Goal:** Make platform-admin notification replay preview/confirm deterministic, exact-target, transactional, idempotent, and auditable without changing the existing REST/BFF/frontend contract or creating a second notification event.

**Plan base:** Notification runtime reliability final approved HEAD `69fec7492e6bd52dcc323b530f4f526a6db64d35` plus this plan commit.

**Approved source:** `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md` §8.3, §8.4, Wave 3, validation strategy, and final acceptance criteria.

**Architecture:** `AdminNotificationOperationsService` owns role, reason, expiry, selection-hash, and transaction policy. A replay-specific output port and JDBC adapter own exact target snapshots, preview row locks, confirmation receipts, and delivery compare-and-set SQL. Existing delivery rows remain the recovery primitive; confirm resets only snapshotted `FAILED`/`DEAD` EMAIL deliveries to `PENDING`. The existing delivery worker, lease, retry, terminal classification, metrics, controller routes, and response DTOs remain authoritative. The existing platform audit adapter participates in the same Spring transaction.

**Technology:** Kotlin 2.4, Spring Boot 4 / Spring Framework 7, JDBC/MySQL 8.4, Flyway, JUnit 5, AssertJ, Testcontainers.

## Scope and fixed decisions

- Preserve `/api/admin/notifications/replay-preview` and `/api/admin/notifications/replay-confirm`, their request/response JSON, BFF/frontend behavior, and OWNER/OPERATOR authorization. SUPPORT remains denied.
- Preserve global replay when `clubId` is absent and club-scoped replay when it is present. Persist the scope on the preview and confirmation so audit filtering remains truthful.
- Replay delivery rows directly. Do not create a new `notification_event_outbox` row, republish the source event, add a DLT, or change recipient planning.
- A preview snapshots the exact delivery identities and expected states. Confirm never executes the stored filter against live rows.
- The selection hash is SHA-256 over one canonical UTF-8 byte sequence, not serializer output: fixed-order filter fields (`clubId`, `channel`, `deliveryStatus`) with explicit `-` null markers, followed by target tuples sorted by delivery UUID and encoded in fixed field order (`deliveryId|clubId|status|attemptCount|failureCode|updatedAt`). UUIDs are lowercase canonical text and timestamps are UTC ISO-8601 with exactly six fractional digits. Same-cardinality target substitution must change the hash.
- Eligible targets have byte-exact uppercase ASCII channel `EMAIL`, status `FAILED|DEAD`, and bounded `last_error` `MAIL_RETRYABLE|MAIL_PERMANENT`. Eligibility, exclusion classification, target persistence, v2 role/status/code checks, and confirm CAS use byte/case-sensitive comparison; inherited case-insensitive `utf8mb4_0900_ai_ci` comparison is forbidden. Every requested filter is conjunctive. `channel=IN_APP`, `deliveryStatus=PENDING`, `deliveryStatus=SENT`, or another ineligible status matches zero; it must not broaden to both failed statuses. `MAIL_AMBIGUOUS`, `DELIVERY_EXPIRED`, `DELIVERY_CONTENT_INVALID`, null/blank, lowercase/mixed-case/padded lookalikes in channel/status/code, and unknown/legacy codes are excluded, counted, and represented only by fixed warning categories. They never enter target rows or confirmation CAS.
- A preview contains at most `max-targets` eligible rows. Default `1000`, valid range `1..5000`. Query `max-targets + 1` and fail closed with a stable typed error before writing a preview when the cap is exceeded; the operator must narrow by club/status. Confirmation therefore has a bounded target/lock/undo footprint.
- Confirm uses compare-and-set semantics against the snapshotted status, attempt count, and `updatedAt`. A changed target is skipped. A new failure after preview is excluded. An active `SENDING` lease is never reset.
- Confirm is one Spring transaction: validate current role/reason → lock preview → validate actor and command hash → return a matching existing receipt even after TTL expiry, or validate open-preview expiry → update exact targets → write audit → insert receipt → consume preview → commit. Receipt lookup never bypasses role, actor, reason, or hash validation.
- Two concurrent confirms of one preview return the same stored `replayedCount`, `skippedCount`, and selection hash. Exactly one delivery transition set, confirmation receipt, and confirmed audit event commits.
- A failure in target update, audit insert, receipt insert, or consume rolls back all replay effects.
- Use one injected UTC `Clock` instant for preview creation/expiry and one for confirmation/audit/consume. Normalize each instant to microsecond precision before hashing, returning, or persisting it so API, hash, and MySQL `datetime(6)` evidence are identical. Expiry equality is expired.
- Add validated `readmates.notifications.admin-replay.preview-ttl`, default `10m`, minimum `1m`, maximum `1h`, exact whole-millisecond precision, and `max-targets`, default `1000`, range `1..5000`. Render both values through `.env.example` and deployment sync; invalid configuration fails startup.
- Add one forward-only V48 migration. Never edit V35, V39, or another historical migration.
- Preserve existing consumed V35 rows safely. V48 introduces an explicit preview contract version: legacy version 1 rows remain readable historical evidence; every newly created version 2 preview must satisfy the paired consumed-at/confirmation invariant. Do not invent replay counts for legacy consumed rows.
- Store no raw recipient, email, provider response, SMTP body, token, or reason in target/receipt rows. A trimmed reason is valid only when it contains `1..500` Unicode code points and at most `1000` UTF-8 bytes; otherwise reject it with a stable typed 4xx error before locking/mutation. The protected audit write may retain that validated reason, but public audit projection must not expose it.
- No live SMTP, real provider, real member data, remote push, PR, tag, or deploy.

## V48 schema contract

Create `V48__make_admin_notification_replay_atomic.sql` with additive changes only.

Extend `admin_notification_replay_previews` with:

- `contract_version` (`1` for migrated legacy rows; new application rows use `2`);
- `actor_platform_role` as non-padding case-sensitive ASCII for truthful byte-exact `OWNER|OPERATOR` evidence on v2 rows;
- nullable scoped `club_id` (`null` means global);
- nullable `consumed_confirmation_id`.

Create `admin_notification_replay_preview_targets`:

- `preview_id`, `delivery_id`, `club_id`;
- `expected_status` as non-padding case-sensitive ASCII limited byte-exactly to `FAILED|DEAD`;
- nonnegative `expected_attempt_count`;
- `expected_failure_code` as a non-padding case-sensitive ASCII/binary value limited byte-exactly to `MAIL_RETRYABLE|MAIL_PERMANENT`;
- `expected_updated_at`;
- primary key `(preview_id, delivery_id)` and an index suitable for confirm lookup;
- preview foreign key with `ON DELETE CASCADE` cleanup;
- no delivery foreign key, so retained previews cannot block delivery retention/cleanup.

Create `admin_notification_replay_confirmations`:

- generated `id`, unique `preview_id`;
- actor user and non-padding case-sensitive ASCII role, plus nullable scoped club;
- selection hash;
- nonnegative replayed/skipped counts;
- platform audit event ID;
- one confirmation timestamp;
- restrictive preview and actor foreign keys, nullable club foreign key, and restrictive platform-audit foreign key.

Add the preview → confirmation foreign key and a versioned check:

- version 1 accepts the historical V35 consumed shape without a fabricated receipt;
- version 2 requires `(consumed_at, consumed_confirmation_id)` to be both null or both non-null;
- version 2 requires actor role and valid selection hash.

Create tables in this exact order: alter preview with non-cyclic columns/default contract version → create targets → create confirmations with preview/actor/club/audit foreign keys → alter preview to add `consumed_confirmation_id` foreign key and versioned consumed check. This deliberately follows the V39 create-dependent-table-then-alter pattern. Fixture cleanup must first reset v2 preview consumption to both null, then delete confirmation/audit, then delete preview; target rows cascade from preview. Do not use cascading deletes across the preview/confirmation cycle.

When adding `contract_version`, existing rows are assigned `1` and the database default remains `1` permanently so the old binary continues to create valid legacy previews during a rolling migration. The final application must send `2` explicitly on every new atomic preview insert. The v2 check restricts actor role byte-exactly to `OWNER|OPERATOR`, while v1 keeps nullable role/scope for migration safety. Use ASCII binary/non-padding column semantics or explicit binary checks for every new status, role, and failure-code invariant.

The migration must pass clean install and supported V42/V44 upgrade fixtures. The Flyway immutability checker must report 40 historical migrations unchanged and V48 as the single forward addition.

## Transaction and recovery contract

```text
preview:
  validate role/filter
  now = Clock.instant().truncatedTo(MICROS)
  load at most maxTargets + 1 allowlisted target tuples and count excluded failure categories
  if eligible targets exceed maxTargets -> fail before persistence
  hash(canonical UTF-8 filter + sorted canonical tuples)
  insert v2 preview + all target rows in one transaction

confirm:
  validate current role and bounded reason
  SELECT preview FOR UPDATE
  now = Clock.instant().truncatedTo(MICROS)
  validate actor and command hash
  if contractVersion != 2 -> fail with stable re-preview-required error
  if matching v2 receipt exists -> return stored result even when now >= expiresAt
  validate open preview expiresAt <= now
  CAS reset only exact target tuples still FAILED/DEAD as previewed
  replayed = affected rows
  skipped = snapshotted target count - replayed
  insert one platform audit event at now
  insert one confirmation receipt
  set consumed_at + consumed_confirmation_id at now
  commit
```

The HTTP response may be lost after commit. Repeating the same confirm must return the persisted receipt without re-resetting rows or writing another audit.

---

### Task 1: Deterministic Replay Configuration, Clock, And Filter Semantics

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/application/config/AdminNotificationReplayProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/config/NotificationWorkerConfiguration.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `.github/workflows/sync-config.yml`
- Modify: `docs/operations/runbooks/secrets-management.md`
- Modify the existing deploy configuration documentation that lists notification runtime variables
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/NotificationApplicationException.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationErrorHandler.kt`
- Modify only the current replay predicate in `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/application/config/AdminNotificationReplayPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapterTest.kt`

**RED scenarios:**

1. `preview-ttl` zero, negative, below `1m`, above `1h`, or non-whole-millisecond fails startup with the property path; `max-targets` outside `1..5000` fails; defaults are exactly `10m` and `1000`.
2. A non-microsecond-aligned fixed `Clock` is normalized once; returned and stored expiry are identical at six fractional digits. Confirm succeeds one microsecond before expiry, and equality is expired.
3. Another actor cannot confirm a preview before any mutation. SUPPORT cannot preview or confirm.
4. `channel=IN_APP`, `deliveryStatus=PENDING`, and `deliveryStatus=SENT` each match zero. EMAIL + FAILED/DEAD and optional club filters remain conjunctive.
5. Empty reason, 501 code points, and a value within 500 code points but above 1000 UTF-8 bytes fail with the stable typed error before persistence; exact 500-code-point and 1000-byte boundaries pass.
6. One preview/confirm transition observes one injected normalized instant; no `OffsetDateTime.now`, `Instant.now`, hardcoded ten-minute TTL, or adapter-owned business timestamp remains in the touched path.
7. `.env.example`, deployment sync, application defaults, and active runbook agree on TTL and target cap without private values.

**GREEN:**

- Register immutable validated replay properties and inject `Clock` explicitly.
- Validate target cap and reason bounds without truncating or storing rejected input.
- Make expiry equality terminal with `expiresAt <= now`.
- Reject or return an empty estimate for ineligible filter combinations without broadening SQL.
- Pass explicit `now`/`expiresAt` to persistence methods; keep UUID generation adapter-local.
- Preserve public success DTOs and existing error mappings; add only the stable bounded-reason and too-many-targets mappings required by this plan.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.application.config.AdminNotificationReplayPropertiesTest \
  --tests com.readmates.notification.application.service.AdminNotificationOperationsServiceTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationOperationsAdapterTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `fix(server): make admin replay previews deterministic`

---

### Task 2: V48 Atomic Replay Schema And Migration Safety

**Files:**

- Create: `server/src/main/resources/db/mysql/migration/V48__make_admin_notification_replay_atomic.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify only forward-upgrade fixtures if V48 schema assertions require them; do not edit historical production migrations

**RED scenarios:**

1. Clean install and V42/V44 supported upgrades create V48 columns, tables, indexes, exact foreign keys, and versioned legacy/v2 checks.
2. Pre-V48 open and consumed previews upgrade as contract version 1 with no fabricated confirmation/counts and remain queryable as legacy evidence. The database default stays `1`, and an old-binary preview insert after V48 succeeds as v1 during rolling migration.
3. V2 open and consumed fixtures enforce the paired null/non-null confirmation invariant and actor/hash/count/status checks.
4. Migration-level fixtures prove lowercase, mixed-case, and trailing-space `actor_platform_role`, `expected_status`, and `expected_failure_code` values are rejected by V48 byte-exact checks/column semantics.
5. Fixture cleanup follows the explicit cycle-safe order and leaves no target/receipt/audit rows.
6. The Flyway immutability checker accepts V48 while still proving all 40 base migrations byte-identical.

**GREEN:**

- Add schema only; do not change replay port/service ownership or remove the legacy confirmation path in this commit.
- Preserve legacy consumed v1 rows without fabricating confirmations.
- Prove the circular receipt relation is operable with the explicit update/delete order before application code switches to v2.

**Focused GREEN:**

```bash
python3 -B scripts/check-flyway-migration-immutability.py --self-test
python3 -B scripts/check-flyway-migration-immutability.py --base-ref 69fec7492e6bd52dcc323b530f4f526a6db64d35
./server/gradlew -p server integrationTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `feat(server): add admin notification replay receipts`

---

### Task 3: Exact Snapshot And Atomic Idempotent Confirmation

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationReplayPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationAuditPort.kt` or the current colocated port so an inserted audit ID and timestamp can join the receipt transaction
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationReplayAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt` only to remove obsolete replay/audit mutation code
- Create: `server/src/test/kotlin/com/readmates/notification/api/AdminNotificationReplayTransactionIntegrationTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationReplayAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/PlatformAdminNotificationControllerTest.kt`

**RED scenarios:**

1. Same filter/count/status totals but different delivery IDs change the canonical hash. Changing status, attempt count, or microsecond `updatedAt` also changes it; equivalent filters and target order do not.
2. Only byte-exact uppercase ASCII `EMAIL` + `FAILED|DEAD` + `MAIL_RETRYABLE|MAIL_PERMANENT` rows become targets. `MAIL_AMBIGUOUS`, `DELIVERY_EXPIRED`, `DELIVERY_CONTENT_INVALID`, null/blank, lowercase, mixed-case, trailing-space, and unknown legacy channel/status/code values increment `excludedCount`, map to fixed warnings, and can never be reset. Status/code/role columns use binary/ascii-bin non-padding semantics; the allowlisted code is part of the target tuple, hash, and byte-exact confirmation CAS.
3. `max-targets + 1` eligible rows fails before preview/target insert; `max-targets` rows succeed with bounded query/index evidence.
4. A failure appearing after preview is not replayed. A snapshotted row whose status, attempt count, `updatedAt`, or lease state changed is skipped.
5. Two concurrent confirms return the same result and commit one receipt/audit; delivery attempts reset once.
6. Same actor/hash v2 retry after expiry returns the stored receipt. Wrong actor, wrong hash, or downgraded SUPPORT is denied after consumption without leaking the receipt. Both open and consumed v1 previews fail with the stable re-preview-required error and never create targets, a receipt, or replay counts.
7. Audit, receipt, target insert/update, or consume failure rolls back all companion rows and delivery resets.
8. A false consume/receipt conflict never returns success without a stored receipt. Two overlapping previews cannot overwrite an active lease or a transition already won by the other preview.
9. Preview creation inserts v2 preview plus exact targets atomically. Confirm uses one microsecond timestamp for delivery `next_attempt_at`/`updated_at`, audit, receipt, and consume.
10. A confirm blocked on the preview row lock reads `Clock` only after acquiring the lock. If the open preview expires while waiting, it is rejected with no delivery/audit/receipt/consume mutation; a matching stored receipt remains retryable after expiry.

**GREEN:**

- Put `@Transactional` on the application confirmation boundary and use `SELECT ... FOR UPDATE` on the preview. Read and normalize the single confirmation `Clock` instant immediately after the row lock, never before a potentially blocking query.
- Put preview snapshot query/hash/insert under a transaction and query at most `max-targets + 1` eligible rows.
- Define pure target/receipt models and canonical UTF-8 encoder in application code; give the replay-specific adapter all snapshot/lock/CAS/receipt SQL.
- Validate role/actor/hash before returning an existing v2 receipt; bypass expiry only for that matching stored receipt.
- Update only joined preview targets whose byte-exact channel/status/failure-code tuple, attempt count, and `updatedAt` still match and whose `locked_at` is null. Use explicit binary comparison against the inherited delivery channel/status/`last_error` collations; do not rely on default `=`/`IN` semantics.
- Persist one bounded audit event, confirmation receipt, and paired preview consumption in the same transaction.
- Calculate `skippedCount` from immutable target count minus committed CAS updates.
- Preserve response/error DTOs, delivery retry defaults, and worker behavior.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.application.service.AdminNotificationOperationsServiceTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationReplayAdapterTest \
  --tests com.readmates.notification.api.AdminNotificationReplayTransactionIntegrationTest \
  --tests com.readmates.notification.api.PlatformAdminNotificationControllerTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `fix(server): make admin notification replay atomic`

---

### Task 4: Truthful Audit Projection, Operator Contract, And Public Safety

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/admin/audit/adapter/out/persistence/JdbcAdminAuditLedgerAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerService.kt` only if a bounded new action/outcome mapping is required
- Modify: `server/src/test/kotlin/com/readmates/admin/audit/api/PlatformAdminAuditControllerTest.kt`
- Modify: `docs/development/architecture.md`
- Modify: `docs/operations/observability/operator-guide.md`
- Modify: `docs/case-studies/02-notification-pipeline-with-outbox.md`
- Modify: `CHANGELOG.md`
- Modify public candidate fixtures/build allowlists only if a changed public artifact is otherwise omitted

**RED scenarios and factual checks:**

1. OPERATOR preview/confirm projects OPERATOR, not OWNER.
2. A scoped preview/confirmation appears under the matching audit club filter; a global replay remains global.
3. Preview rows remain preparation/consumption evidence and never project a confirmed action. `platform_audit_events.ADMIN_NOTIFICATION_REPLAY_CONFIRMED` is the sole confirmed outcome, so one confirm yields exactly one confirmed audit item. Legacy v1 consumed rows remain explicitly legacy rather than fabricated success.
4. Audit/public API metadata excludes raw reason, email, recipient, provider response, and delivery ID lists; only bounded counts, selection hash, scope, action, and timestamp are exposed.
5. Active docs describe exact target snapshot, skipped changed rows, transactional receipt/audit, idempotent retry, and direct delivery requeue—not an outbox event.
6. Operator recovery keeps AMBIGUOUS SMTP evidence gate and accepted-before-commit residual; replay is not described as exactly-once email.
7. Every changed public artifact is included byte-identically in a candidate with no `.git`, symlink, local path, private domain, or secret-shaped value.

**Focused GREEN:**

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.admin.audit.api.PlatformAdminAuditControllerTest \
  --tests com.readmates.notification.api.PlatformAdminNotificationControllerTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
git diff --check -- CHANGELOG.md docs/development/architecture.md docs/operations/observability/operator-guide.md docs/case-studies/02-notification-pipeline-with-outbox.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

**Commit:** `fix(server): make admin replay audit truthful`

---

### Task 5: Canonical Closeout And Plan Review

**Review before gates:**

- Re-read every task report and inspect the final source for exact snapshot/hash, versioned migration safety, transaction ownership, row lock, CAS, receipt idempotency, audit scope, and data hygiene.
- Verify no compatibility constructor, live-filter confirm, ignored Boolean CAS, hardcoded clock/TTL, baseline/allowlist/suppression growth, historical migration change, raw recipient/error evidence, or new outbox event remains.
- Verify existing notification runtime reliability gates, duplicate Kafka delivery, delivery claim/lease, and publish-mark-loss tests remain load-bearing.
- Frontend E2E is not required unless the public API/auth/frontend contract changed; if a diff shows such a change, restore the contract or add exact E2E evidence.

**Canonical gates, sequentially at final HEAD:**

```bash
python3 -B scripts/check-flyway-migration-immutability.py --self-test
python3 -B scripts/check-flyway-migration-immutability.py --check-workflow .github/workflows/ci.yml
python3 -B scripts/check-flyway-migration-immutability.py --base-ref 69fec7492e6bd52dcc323b530f4f526a6db64d35
./server/gradlew -p server compileKotlin --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --rerun-tasks --no-build-cache --no-configuration-cache
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Record foreground integration exit code/duration, fresh XML suite/test/failure/error/skip totals, named replay/Flyway/notification suites, V48-only migration addition, full changed-file candidate byte identity, and gitleaks output. Write an ignored closeout report; commit only a factual correction if required.

**Commit:** verification-only unless a source-backed factual correction is necessary.

## Plan-level review contract

After every task implementer and reviewer approve, generate a full review package from this plan base through final HEAD. Request an independent strongest reviewer over the complete branch range, not the latest task only. The reviewer must issue separate plan compliance, code-quality, and next-plan readiness verdicts and inspect at minimum:

- deterministic TTL and equality;
- exact target hash and same-cardinality substitution resistance;
- migration upgrade/backfill/versioned invariant safety;
- preview and confirmation transaction boundaries;
- row-lock/concurrent confirm/idempotent lost-response recovery;
- audit failure rollback and club/role truth;
- active-lease protection and changed-target skips;
- no event re-emission, authorization/API drift, raw evidence, migration rewrite, baseline/allowlist/suppression growth;
- public candidate and operator recovery truth.

Bundle any material findings into one fresh-implementer correction wave, rerun all relevant focused and canonical gates, and request scoped plus whole-plan re-review. Do not begin the AI Kafka plan until this plan is approved and the tracked tree is clean.

## Acceptance mapping

- **Async/cache/provider:** exact snapshot, concurrent confirmation, idempotent recovery, active lease protection, no duplicate source event.
- **Persistence/migration:** V48 forward-only schema, clean/V42/V44 upgrades, row lock, CAS, rollback, versioned legacy safety.
- **Authorization/actor:** OWNER/OPERATOR only, SUPPORT denial, actor binding, scoped club audit.
- **Operations/public:** truthful receipt/audit/recovery docs, candidate inclusion, gitleaks and sensitive scans.
- **Architecture:** application transaction policy, replay-specific port/adapter, read-adapter responsibility reduction, no transport types in application.
- **API/frontend:** preserved contracts; E2E excluded unless final diff proves otherwise.

## Explicit residual and excluded scope

- SMTP accepted-before-`SENT`/commit can still duplicate after lease reclaim; provider idempotency is required to close it.
- Global replay execution is bounded by `max-targets`; preview/target retention cleanup scheduling remains a separate approved policy. V48 uses explicit cycle-safe cleanup and target ownership so a future retention job can delete safely.
- Legacy version 1 consumed previews cannot recover an exact historical receipt that was never stored; do not fabricate counts or audit success.
- AI Kafka generic exhaustion, Redis job clock/config/restart recovery, and queue false-zero are the following plan.
- Public-cache invalidation stale exposure and rate-limit fail-open remain separate explicit policies.
- Live SMTP, production mutation, remote Alertmanager routing, push/PR/tag/deploy are excluded.
