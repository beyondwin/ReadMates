# Platform Admin Service Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/health`, `/admin/notifications`, `/admin/ai-ops`를 관측 근거·전체 결과 탐색·안전 명령 영수증·origin-to-effect 수렴을 갖춘 일관된 서비스 운영 영역으로 완성한다.

**Architecture:** Health는 기존 provider snapshot과 partial-source 모델을 시각적으로 정돈한다. Notifications는 기존 V48 durable preview/atomic confirm을 유지하며 cursor 페이지와 immutable receipt/convergence 표현을 강화한다. AI는 force-cancel/retry-commit을 preview/confirm + shared idempotency + CAS + domain receipt로 전환하고, 정확한 BFF/CSRF method-path matcher를 full security chain으로 검증한다.

**Tech Stack:** React, TypeScript, TanStack Query, Playwright, Kotlin, Spring Boot, JDBC, MySQL 8, Flyway V59, Testcontainers, Micrometer.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: update — ADR-0039, ADR-0040 (including the V59 typed-receipt refinement); constraining reference — ADR-0028, ADR-0029, ADR-0031, ADR-0033

## Global Constraints

- Prerequisite: Service Spine Tasks 1–4, Safe Command Tasks 1–3, and the final Club Control Tasks 3–4/V58 stack; V52–V58 exist before V59. Stop and rebase if migration history or the shared claim/receipt ports differ.
- V59 owns only the service receipt/convergence schema and its Flyway tests. Notification and AI writers start after that schema contract is reviewed; `SecurityConfig.kt` and `PlatformAdminBffSecurityTest.kt` have one sequential owner at a time.
- Health reads never become dangerous command endpoints. A drill-down may link to the owning service page but never silently mutate.
- Notification V48 preview/confirm atomicity and selection semantics remain authoritative. Strengthen in place; do not create a competing replay engine.
- AI and notification pages paginate until the operator stops; first-page-only data must not be labeled “전체”.
- `unavailable`, `disabled`, `partial`, and `empty` are distinct. Disabled is configured absence, not an error.
- L3 commands expose `originStatus` separately from `effectStatus` and retain the same user-intent identity for resume.
- No live AI generation, provider cancellation, or email dispatch smoke runs without separate authorization. Use fakes/stubs in all planned tests.
- Provider payload, prompt, member content, email, raw error text, raw HMAC/key, token, or URL never enter receipt DTO/log/metric tag. Versioned 32-byte request HMAC evidence and non-secret key version may exist only in DB evidence.
- Existing bounded metric tags and provider circuit-breaker behavior stay intact.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Health evidence and partial-state UX | 1 |
| Service command receipts/convergence schema | 2 |
| Notification full-result workflow and replay proof | 3 |
| AI safe actions and exact security boundary | 4 |
| Unified service-area UI | 5 |
| No-billable acceptance | 6 |

## Dependency Order

`2 → 3`; `2 → 4`; `1 + 3 + 4 → 5 → 6`. Task 1 may run before V59. Tasks 3 and 4 may run in parallel only when they do not share `SecurityConfig.kt`, `PlatformAdminBffSecurityTest.kt`, the Flyway test, a DB container, or build output; otherwise serialize those files under one integrator.

---

### Task 1: Make health evidence explicit without changing read semantics

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-health-model.ts`
- Modify: `front/features/platform-admin/api/platform-admin-health-contracts.ts`
- Modify: `front/features/platform-admin/route/admin-health-route.tsx`
- Modify: `front/features/platform-admin/route/admin-health-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-card.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-card.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-health.spec.ts`

Each card shows state, primary reading, source, last evidence time, freshness, and one relevant drill. Page status aggregates cards as ready/partial/unavailable/disabled without collapsing card-level evidence.

- [ ] **Step 1: Write RED rendering tests.** Cover fresh/stale, partial sources, all unavailable, disabled Redis/Kafka/provider, missing deploy ledger, one-card retry, generated-at labeling, keyboard drill-down, loading skeleton, and zero misleading green states.
- [ ] **Step 2: Run RED.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/route/admin-health-route.test.tsx features/platform-admin/ui/admin-health-grid.test.tsx features/platform-admin/ui/admin-health-card.test.tsx features/platform-admin/ui/admin-health-deploy-strip.test.tsx`; expected FAIL on the complete page grammar.
- [ ] **Step 3: Refactor onto `AdminPageFrame` and `AdminStatePanel`.** Preserve existing provider IDs and transport contracts; do not synthesize unavailable readings.
- [ ] **Step 4: Run GREEN and e2e.** Run the Task 1 command and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-health.spec.ts`; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(admin): clarify service health evidence`

### Task 2: Add service command receipt and convergence evidence

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V59__platform_admin_service_command_receipts.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Schema responsibilities:**

- Treat V48 `admin_notification_replay_confirmations.id` and new `ai_generation_admin_command_receipts.id` as two typed receipt parents. `admin_service_command_convergence` has nullable notification/AI receipt snapshot columns with exactly-one XOR, real `ON DELETE RESTRICT` FKs, and effect mapping `NOTIFICATION_REPLAY|AI_JOB_CANCEL|AI_COMMIT_RETRY`; a FK-less polymorphic receipt string is forbidden.
- Strengthen notification confirmations with command/target snapshot, actor role/capabilities, origin outcome, stable selected/skipped counts, unique `platform_audit_event_id_snapshot`, and identity mode. Legacy V48 rows keep their deterministic lowercase-hex SHA as `LEGACY_SELECTION_SHA` with null canonical schema/key/HMAC; new rows are `HMAC` with null legacy SHA and non-null schema/key version/32-byte request HMAC. A DB CHECK enforces the XOR and never labels legacy SHA as HMAC.
- Add append-only `ai_generation_admin_command_previews` with actor role/capabilities, job UUID/status/revision snapshot, action, HMAC, bounded safe impact JSON, expiry and paired receipt consumption.
- Add append-only `ai_generation_admin_command_receipts` with actor role/capabilities, job/club UUID snapshots, action, before/after status/revision, origin outcome, request HMAC/key version, safe reason code/result JSON, unique audit snapshot and timestamp.
- Add `effect_target_id_snapshot CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`: notification uses the fixed confirmation/target-set identity and AI uses the job UUID snapshot. Enforce one receipt/effect/target and typed receipt/effect compatibility.
- Add mutable `admin_service_command_convergence` with `PENDING|SUCCEEDED|FAILED`, attempt/next-attempt, bounded lease owner/expiry, `available_at`, and nullable strict safe error code `^[A-Z][A-Z0-9_]{0,63}$`. Terminal rows require at least one started attempt; PENDING may retain the last retryable safe code.
- Add append-only `admin_service_command_convergence_events`. Each attempt has seq-0 PENDING start and at most one seq-1 terminal observation; a generated start-event sequence self-FK proves the matching start. Composite RESTRICT FKs include convergence ID, typed receipt parent, effect and target snapshots so event history cannot orphan or drift.
- Receipt snapshots have no destructive FK to deletable notification preview/event/delivery, AI job, user or club rows. The V48 confirmation `preview_id` becomes a snapshot so bounded preview/target cleanup and later user deletion do not erase or block the receipt. JSON type/count/byte bounds and column allowlists exclude prompt, provider/body/email/token/URL/free-text/raw error data.

- [ ] **Step 1: Write RED migration tests.** Cover fresh and V48 legacy upgrade, deterministic receipt identity, legacy-SHA/HMAC XOR, actor role/capabilities and unique audit snapshot, notification/AI typed parent XOR/FKs, receipt/effect/target mismatch negatives, paired preview consumption, JSON/HMAC/error-code bounds, terminal attempt count, start-event self-FK, PENDING retry continuity, source/user/club hard delete, and absence of prompt/provider payload/email/token/URL/free-text/raw-error columns. Assert no V58 rewrite and exact Flyway counts.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`; expected FAIL.
- [ ] **Step 3: Implement V59 without rewriting V48 or V58.** Alter V48 evidence additively, drop only destructive receipt-to-preview/actor/club/audit FKs that violate snapshot retention, break the preview/confirmation FK cycle while keeping paired consumption checks, backfill legacy rows without inventing HMAC/key metadata, and create the typed AI/convergence/current-event schema. Do not change baseline or seed migrations.
- [ ] **Step 4: Run GREEN.** Run the Task 2 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(server): add service command receipts`

### Task 3: Complete notification pagination, warnings, and replay reconciliation

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationReplayPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationReplayConvergencePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayConvergenceService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduling/AdminNotificationReplayConvergenceScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationReplayAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/config/NotificationRuntimeProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationReplayServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationReplayConvergenceServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/AdminNotificationReplayTransactionIntegrationTest.kt`
- Modify: `front/features/platform-admin/api/platform-admin-notifications-api.ts`
- Modify: `front/features/platform-admin/model/platform-admin-notifications-model.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-notifications-queries.ts`
- Modify: `front/features/platform-admin/route/admin-notifications-data.ts`
- Modify: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/features/platform-admin/route/admin-notifications-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.test.tsx`
- Modify: `front/tests/e2e/admin-notifications.spec.ts`

Confirm request adds an idempotency key while retaining V48 `previewId` and selection verification. Response becomes `{receiptId, replayedCount, skippedCount, skippedReasonCounts, originStatus, effectStatus, effectAvailability, convergenceId}`. Existing cursor/status/channel/club filters stay on the server. TanStack queries become infinite queries and flatten pages with ID de-duplication.

Origin confirm fixes the exact replayed delivery IDs under the notification receipt and creates one `PENDING`
`NOTIFICATION_REPLAY` convergence row in the same transaction. The observer never enqueues or sends a delivery. It reads
only that fixed set from the existing delivery engine: any `PENDING|SENDING|FAILED` target remains convergence `PENDING`;
all `SENT|SKIPPED` is `SUCCEEDED`; once every target is terminal, any `DEAD` makes it `FAILED` with an allowlisted safe
code. Ambiguous source read or transient DB failure appends a retryable observation, keeps `PENDING`, preserves the prior
safe code, and schedules bounded backoff. Exhaustion may transition to terminal `FAILED`; absence of one selected target is
corrupt evidence and fails closed rather than silently shrinking the denominator.

When `readmates.notifications.enabled=false`, the scheduler does not claim a row, does not call a mail/dispatch adapter,
does not increment an attempt, and does not mark success. API/UI expose `effectAvailability=DISABLED` separately from the
still-`PENDING` effect. Re-enabling resumes the same receipt/convergence identity.

- [ ] **Step 1: Write RED server tests.** Cover HMAC preview identity, legacy SHA isolation, V48 atomic selection, preview expiry/consume/mismatch, same-key replay, different-request conflict, selected/skipped reason counts, response loss, receipt/audit/convergence rollback, current authorization on receipt replay, and unique audit link. For convergence cover fixed target set, `PENDING|SENDING|FAILED` retry, all-`SENT|SKIPPED` success, terminal `DEAD` failure only after all targets settle, missing target fail-closed, stale lease/CAS, crash between start/outcome, bounded exhaustion, and notifications-disabled zero claim/send/attempt with `PENDING + DISABLED`.
- [ ] **Step 2: Write RED frontend tests.** Cover multi-page events/deliveries, filters resetting cursors, duplicate boundary row, estimated-status/warning visibility, partial snapshot with usable lists, empty vs unavailable, preview review, receipt counts, convergence retry, and correct failure copy.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.service.AdminNotificationReplayServiceTest --tests com.readmates.notification.application.service.AdminNotificationReplayConvergenceServiceTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.notification.api.AdminNotificationReplayTransactionIntegrationTest`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/route/admin-notifications-route.test.tsx features/platform-admin/ui/admin-notifications-page.test.tsx`

  Expected: FAIL on missing receipt/convergence UI and first-page-only queries.
- [ ] **Step 4: Implement server receipt strengthening without replacing V48 atomicity.** Complete shared claim, immutable notification receipt, audit snapshot and convergence insert inside the existing replay transaction. After commit the scheduler uses short lease/start and outcome-CAS transactions to observe the fixed delivery set; it never calls the replay/dispatch engine or sends a second notification itself, and disabled configuration leaves work untouched.
- [ ] **Step 5: Implement infinite queries and receipt-oriented UI.** Preserve non-sensitive filters in URL; never place selected event IDs in URL or storage.
- [ ] **Step 6: Run GREEN and e2e.** Run the Task 3 commands and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-notifications.spec.ts`; expected PASS.
- [ ] **Step 7: Commit.** Commit: `feat(admin): complete notification operations workflow`

### Task 4: Convert AI force-cancel and retry-commit into safe actions

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoveryScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAdminCommandPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAdminCommandRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationAdminCommandConvergenceService.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationAdminCommandConvergenceScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoverySchedulerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerationOpsCommandDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`

**API contracts:**

- `POST /api/admin/ai-generation/jobs/{jobId}/force-cancel/preview`
- `POST /api/admin/ai-generation/jobs/{jobId}/force-cancel/confirm`
- `POST /api/admin/ai-generation/jobs/{jobId}/retry-commit/preview`
- `POST /api/admin/ai-generation/jobs/{jobId}/retry-commit/confirm`

Preview captures job status/revision, allowed transition, effect category, safe impact codes, expiry, and fingerprint prefix. Confirm accepts preview ID, idempotency key, expected job revision, and explicit confirmation. Task 4 adds the new server path without changing the current frontend or claiming the old path is `410`; Task 5 performs the frontend/server cutover atomically.

`force-cancel` creates effect `AI_JOB_CANCEL`. Current code conditionally changes the Redis job state to `CANCELLED` and
deletes transient payload; there is no provider cancellation port or proof that a provider request was cancelled. Receipt,
copy, tests and metrics must not claim provider cancellation.

`AI_COMMIT_RETRY` is commit reconciliation, not a second commit implementation. Its convergence worker delegates the exact
job ID to existing `AiGenerationCommitRecoveryService.recover(jobId)` and observes the existing persistence receipt plus
Redis CAS. `AiGenerationCommitRecoveryScheduler` may race that request, so both paths converge through the existing
recovery contract and job revision/CAS; the admin worker must not reproduce persistence completion or lease-recovery logic.
Origin confirm commits preview consumption, shared claim completion, immutable receipt, audit snapshot and one PENDING
convergence row before either Redis/job recovery effect is attempted.

- [ ] **Step 1: Add the exact RED security-chain cases first.** Prove both current one-click POSTs are presently rejected by CSRF/BFF configuration, then prove the four new exact method/path matchers accept only a valid same-origin BFF request. Test suffixes, encoded slash, wrong method, missing/wrong secret, foreign Origin/Referer, inactive actor, SUPPORT, and OPERATOR/OWNER capability mapping. Do not add the legacy `410` matcher yet.
- [ ] **Step 2: Write RED state/concurrency tests.** Cover allowed/forbidden job states, stale revision, two-admin race, preview expiry/mismatch/consume, same/different idempotency key, response loss, origin rollback/receipt/audit/convergence, current receipt reauthorization, and sanitized evidence. For `AI_JOB_CANCEL`, cover conditional Redis transition, payload cleanup, missing/expired job, stale lease/CAS, retry/terminal safe failure, and zero provider-cancel calls. For `AI_COMMIT_RETRY`, cover delegation to the existing recovery service, complete receipt, expired commit lease, concurrent scheduled/admin recovery, exactly-once business completion, crash/resume and no second recovery engine.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest --tests com.readmates.aigen.application.service.AiGenerationOpsServiceTest --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest --tests com.readmates.aigen.adapter.in.scheduling.AiGenerationCommitRecoverySchedulerTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerationOpsCommandDbTest`

  Expected: FAIL, including explicit proof of the current matcher defect before the fix.
- [ ] **Step 4: Add minimal exact matchers and domain-owned origin transactions.** Do not broaden CSRF ignore to `/api/admin/**`. Preview/claim/receipt/audit/convergence origin complete in one MySQL transaction. After commit, short lease/start and outcome-CAS transactions either perform the conditional Redis `AI_JOB_CANCEL` transition or delegate `AI_COMMIT_RETRY` to existing commit recovery. Never pretend Redis/provider/recovery effects are atomic with MySQL, and never record a terminal current row without an append-only attempt outcome.
- [ ] **Step 5: Run GREEN.** Run both Task 4 commands; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): harden ai operations commands`

### Task 5: Finish AI workflow and unify the service area UI

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-data.ts`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/platform-admin-ai-ops.spec.ts`
- Modify: `front/tests/e2e/admin-ai-ops-drilldown.spec.ts`

This task is the only legacy cutover owner. In one integrated change it moves every frontend action to preview/confirm,
removes the old one-click client calls, and changes the two exact legacy POST handlers/security matchers to return
`410 SAFE_CONFIRM_REQUIRED` without invoking `AiGenerationOpsService`, Redis, recovery, audit, receipt or convergence.
Before this task merges, Task 4's additive server endpoints coexist with the still-unchanged frontend. After it merges,
there is no executable legacy business path. Near-miss method/path remains protected rather than inheriting the `410` rule.

- [ ] **Step 1: Write RED infinite-list/state tests.** Cover multiple cursor pages, filter/window reset, duplicate boundary row, feature disabled `404` vs unavailable `5xx`, empty results, partial summary/list, capability gating, deep-linked job drill-down, and 320px layout.
- [ ] **Step 2: Write RED preview/receipt and atomic-cutover tests.** Cover focus-safe review dialog, explicit confirm, pending receipt, response-loss retry with same key, stale refresh, convergence retry, safe reason codes, and removal of one-click calls. Server/security tests assert both exact legacy paths return `410 SAFE_CONFIRM_REQUIRED` only for an otherwise valid same-origin BFF request and invoke every mutation/effect port zero times; missing trust/capability and near-miss paths still fail closed.
- [ ] **Step 3: Run RED.** Run `./server/gradlew -p server unitTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest --tests com.readmates.aigen.adapter.in.web.AiGenerationOpsControllerTest` and `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/platform-admin-ai-ops-model.test.ts features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx features/platform-admin/route/admin-ai-ops-route.test.tsx features/platform-admin/ui/platform-admin-ai-ops.test.tsx`; expected FAIL on legacy server cutover and frontend safe-action flow.
- [ ] **Step 4: Implement infinite queries, discriminated errors, safe action dialogs, and the server `410` cutover in the same commit.** Check API errors by normalized `status/code`, never `error instanceof Response`. Do not land a server-only `410` before the frontend client has moved.
- [ ] **Step 5: Run GREEN and e2e.** Run both Task 5 unit commands and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/platform-admin-ai-ops.spec.ts tests/e2e/admin-ai-ops-drilldown.spec.ts`; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): complete ai operations workflow`

### Task 6: Verify service operations without external effects

**Files:**
- Modify only if operator-visible behavior changed: `CHANGELOG.md`

- [ ] **Step 1: Run frontend gates.** Run: `npx --yes corepack@0.35.0 pnpm --dir front lint`, `npx --yes corepack@0.35.0 pnpm --dir front test`, and `npx --yes corepack@0.35.0 pnpm --dir front build`; expected PASS.
- [ ] **Step 2: Run server gates.** Run: `./scripts/server-ci-check.sh` and focused Testcontainers suites from Tasks 2–4; expected PASS.
- [ ] **Step 3: Run service browser suite.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-health.spec.ts tests/e2e/admin-notifications.spec.ts tests/e2e/platform-admin-ai-ops.spec.ts tests/e2e/admin-ai-ops-drilldown.spec.ts`; expected PASS.
- [ ] **Step 4: Run stubbed convergence matrix.** Exercise origin failure, origin success/effect pending, eventual success, terminal failure, response loss, and same-identity resume for notification and AI. Assert fake adapter invocation counts exactly; make no provider or mail network call.
- [ ] **Step 5: Inspect 320/768/1440px, keyboard, reduced-motion, and 200% zoom states.** Verify bottom-safe actions and no horizontal page overflow.
- [ ] **Step 6: Run hygiene and safety scans.** Run: `git diff --check`, `python3 scripts/agent-preflight.py --paths front/features/platform-admin --paths server/src/main/kotlin/com/readmates/aigen --paths server/src/main/kotlin/com/readmates/notification`, and targeted scans for prompt/provider payload/raw errors; expected clean.
- [ ] **Step 7: Commit acceptance-only changes if any.** Commit: `test(admin): verify service operations workspace`
