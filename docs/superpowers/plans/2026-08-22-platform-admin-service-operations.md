# Platform Admin Service Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/health`, `/admin/notifications`, `/admin/ai-ops`를 관측 근거·전체 결과 탐색·안전 명령 영수증·origin-to-effect 수렴을 갖춘 일관된 서비스 운영 영역으로 완성한다.

**Architecture:** Health는 기존 provider snapshot과 partial-source 모델을 시각적으로 정돈한다. Notifications는 기존 V48 durable preview/atomic confirm을 유지하며 cursor 페이지와 immutable receipt/convergence 표현을 강화한다. AI는 force-cancel/retry-commit을 preview/confirm + shared idempotency + CAS + domain receipt로 전환하고, 정확한 BFF/CSRF method-path matcher를 full security chain으로 검증한다.

**Tech Stack:** React, TypeScript, TanStack Query, Playwright, Kotlin, Spring Boot, JDBC, MySQL 8, Flyway V59, Testcontainers, Micrometer.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: implements proposed ADR-0039 and ADR-0040; constraining reference — ADR-0028, ADR-0029, ADR-0031, ADR-0033

## Global Constraints

- Prerequisite: Service Spine Tasks 1–4 and Safe Command Tasks 1–3; V52–V58 exist before V59. Stop and rebase if the sequence differs.
- Health reads never become dangerous command endpoints. A drill-down may link to the owning service page but never silently mutate.
- Notification V48 preview/confirm atomicity and selection semantics remain authoritative. Strengthen in place; do not create a competing replay engine.
- AI and notification pages paginate until the operator stops; first-page-only data must not be labeled “전체”.
- `unavailable`, `disabled`, `partial`, and `empty` are distinct. Disabled is configured absence, not an error.
- L3 commands expose `originStatus` separately from `effectStatus` and retain the same user-intent identity for resume.
- No live AI generation, provider cancellation, or email dispatch smoke runs without separate authorization. Use fakes/stubs in all planned tests.
- Provider payload, prompt, member content, email, raw error text, HMAC/key, and token never enter receipt DTO/log/metric tag.
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

`1 → 5`; `2 → 3 → 5`; `2 → 4 → 5`; `5 → 6`. Tasks 1, 3, and 4 may be independently implemented after Task 2 where applicable.

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

- Extend notification replay confirmations with public `receipt_id`, HMAC schema/key version, origin outcome, and stable selected/skipped counts while preserving V48 rows.
- Add append-only `ai_generation_admin_command_previews` with actor/job snapshot, action, job status/revision snapshot, HMAC, safe impact JSON, expiry/consumption.
- Add append-only `ai_generation_admin_command_receipts` with actor/job/club UUID snapshots, action, before/after status and revision, origin outcome, request HMAC/key version, safe reason code, timestamp.
- Add mutable `admin_service_command_convergence` keyed by domain receipt ID and effect type `NOTIFICATION_REPLAY|AI_PROVIDER_CANCEL|AI_COMMIT_RETRY`, with pending/success/failed state, attempts, bounded error code, and next attempt.
- Immutable evidence does not hold destructive FKs to notification events or AI jobs.

- [ ] **Step 1: Write RED migration tests.** Cover V48 backfill with deterministic receipt IDs, uniqueness/checks, AI preview TTL, receipt immutability, convergence transitions, deletable source jobs/events, and absence of prompt/provider payload/error text columns.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`; expected FAIL.
- [ ] **Step 3: Implement V59 without rewriting V48 or V34.** Backfill legacy selection hashes as legacy schema evidence; new commands use versioned HMAC.
- [ ] **Step 4: Run GREEN.** Run the Task 2 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(server): add service command receipts`

### Task 3: Complete notification pagination, warnings, and replay reconciliation

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/AdminNotificationOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationReplayPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayConvergenceService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduling/AdminNotificationReplayConvergenceScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationReplayAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/PlatformAdminNotificationWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationReplayServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/AdminNotificationReplayTransactionIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Modify: `front/features/platform-admin/api/platform-admin-notifications-api.ts`
- Modify: `front/features/platform-admin/model/platform-admin-notifications-model.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-notifications-queries.ts`
- Modify: `front/features/platform-admin/route/admin-notifications-data.ts`
- Modify: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/features/platform-admin/route/admin-notifications-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.test.tsx`
- Modify: `front/tests/e2e/admin-notifications.spec.ts`

Confirm request adds an idempotency key while retaining V48 `previewId` and selection verification. Response becomes `{receiptId, replayedCount, skippedCount, skippedReasonCounts, originStatus, effectStatus, convergenceId}`. Existing cursor/status/channel/club filters stay on the server. TanStack queries become infinite queries and flatten pages with ID de-duplication.

- [ ] **Step 1: Write RED server tests.** Cover HMAC preview identity, V48 atomic selection, preview expiry/consume/mismatch, same-key replay, different request conflict, selected/skipped reason counts, response loss, pending convergence, worker success/terminal failure, current authorization on receipt replay, and audit link.
- [ ] **Step 2: Write RED frontend tests.** Cover multi-page events/deliveries, filters resetting cursors, duplicate boundary row, estimated-status/warning visibility, partial snapshot with usable lists, empty vs unavailable, preview review, receipt counts, convergence retry, and correct failure copy.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.service.AdminNotificationReplayServiceTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.notification.api.AdminNotificationReplayTransactionIntegrationTest`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/route/admin-notifications-route.test.tsx features/platform-admin/ui/admin-notifications-page.test.tsx`

  Expected: FAIL on missing receipt/convergence UI and first-page-only queries.
- [ ] **Step 4: Implement server receipt strengthening without replacing V48 atomicity.** Complete shared claim inside the existing replay transaction. The convergence scheduler reads durable delivery state after origin commit and updates the receipt-linked convergence row; it never sends a second notification itself.
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
- Create: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerationOpsCommandDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`

**API contracts:**

- `POST /api/admin/ai-generation/jobs/{jobId}/force-cancel/preview`
- `POST /api/admin/ai-generation/jobs/{jobId}/force-cancel/confirm`
- `POST /api/admin/ai-generation/jobs/{jobId}/retry-commit/preview`
- `POST /api/admin/ai-generation/jobs/{jobId}/retry-commit/confirm`

Preview captures job status/revision, allowed transition, effect category, safe impact codes, expiry, and fingerprint prefix. Confirm accepts preview ID, idempotency key, expected job revision, and explicit confirmation. Current one-click endpoints return `410` after the frontend cutover; do not leave two executable paths.

- [ ] **Step 1: Add the exact RED security-chain cases first.** Prove both current one-click POSTs are presently rejected by CSRF/BFF configuration, then prove the four new exact method/path matchers accept only a valid same-origin BFF request. Test suffixes, encoded slash, wrong method, missing/wrong secret, foreign Origin/Referer, inactive actor, SUPPORT, and OPERATOR/OWNER capability mapping.
- [ ] **Step 2: Write RED state/concurrency tests.** Cover allowed/forbidden job states, stale revision, two-admin race, preview expiry/mismatch/consume, same/different idempotency key, response loss, origin receipt, provider cancel pending/success/failure, retry-commit exactly once, receipt reauthorization, and sanitized audit metadata.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest --tests com.readmates.aigen.application.service.AiGenerationOpsServiceTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.aigen.api.AiGenerationOpsCommandDbTest`

  Expected: FAIL, including explicit proof of the current matcher defect before the fix.
- [ ] **Step 4: Add minimal exact matchers and domain-owned origin transactions.** Do not broaden CSRF ignore to `/api/admin/**`. Preview/claim/receipt/convergence origin complete in one MySQL transaction; the convergence worker later performs the conditional Redis transition and records the attempt. Never pretend the Redis effect is atomic with MySQL.
- [ ] **Step 5: Run GREEN.** Run both Task 4 commands; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): harden ai operations commands`

### Task 5: Finish AI workflow and unify the service area UI

**Files:**
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

- [ ] **Step 1: Write RED infinite-list/state tests.** Cover multiple cursor pages, filter/window reset, duplicate boundary row, feature disabled `404` vs unavailable `5xx`, empty results, partial summary/list, capability gating, deep-linked job drill-down, and 320px layout.
- [ ] **Step 2: Write RED preview/receipt tests.** Cover focus-safe review dialog, explicit confirm, pending receipt, response-loss retry with same key, stale refresh, convergence retry, safe reason codes, and removal of one-click action.
- [ ] **Step 3: Run RED.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/platform-admin-ai-ops-model.test.ts features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx features/platform-admin/route/admin-ai-ops-route.test.tsx features/platform-admin/ui/platform-admin-ai-ops.test.tsx`; expected FAIL.
- [ ] **Step 4: Implement infinite queries, discriminated errors, and safe action dialogs.** Check API errors by normalized `status/code`, never `error instanceof Response`.
- [ ] **Step 5: Run GREEN and e2e.** Run the Task 5 command and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/platform-admin-ai-ops.spec.ts tests/e2e/admin-ai-ops-drilldown.spec.ts`; expected PASS.
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
