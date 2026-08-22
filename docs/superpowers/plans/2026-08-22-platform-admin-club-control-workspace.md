# Platform Admin Club Control Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/clubs`와 `/admin/clubs/:clubId`를 전체 클럽 규모에서도 정확히 탐색하고, 메타데이터·공개 상태·도메인·첫 호스트 온보딩을 안전하게 검토·실행·복구할 수 있는 운영 워크스페이스로 완성한다.

**Architecture:** Club registry는 서버 검색과 signed cursor를 사용하고 detail은 독립 by-ID aggregate를 조회한다. L1 메타데이터 수정은 `adminRevision` CAS, L2 공개 상태는 durable preview와 immutable receipt, L3 도메인/온보딩은 origin receipt와 delivery/provisioning convergence를 사용한다. React는 공통 admin page grammar를 사용하되 명령 DTO·receipt는 club 도메인이 소유한다.

**Tech Stack:** React, TypeScript, TanStack Query, Playwright, Kotlin, Spring Boot, JDBC, MySQL 8, Flyway V57, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: implements proposed ADR-0039 and ADR-0040; constraining reference — ADR-0019, ADR-0022, ADR-0029, ADR-0033

## Global Constraints

- Prerequisite: Service Spine Tasks 1–4 and Safe Command Tasks 1–3 are complete. V52–V56 must exist; otherwise stop and rebase the migration number.
- Existing `/admin/clubs` and `/admin/clubs/:clubId` URLs remain canonical. Slug is read-only in this release.
- List search, lifecycle/public/domain/onboarding filters, ordering, and pagination are server-owned; the browser never downloads all clubs to filter locally.
- Detail fetch is authoritative by club UUID and does not depend on the current list page or cursor.
- Metadata/public/domain/onboarding panels fail independently. A failed secondary panel does not erase a successful club identity header.
- Public visibility, domain provisioning, and first-host delivery never claim success from an origin row alone; convergence is visible and recoverable.
- `acceptUrl`, invitation token, DNS secret, raw domain verification payload, names/emails, and free-text reasons never enter receipt DTOs, URL, logs, or committed fixtures.
- Emergency public takedown is excluded and remains owned by ADR-0037/V54–V55.
- All commands reauthorize the current ACTIVE platform admin before original execution and receipt replay.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Server search/cursor and authoritative detail | 1 |
| Club command schema, revisions, receipts, convergence | 2 |
| Metadata/public/domain safe command APIs | 3 |
| Durable onboarding preview/commit/reconciliation | 4 |
| Registry/detail/onboarding UI | 5 |
| Cross-device and server acceptance | 6 |

## Dependency Order

`1 → 5`; `2 → 3 → 5`; `2 → 4 → 5`; `5 → 6`. Tasks 1 and 2 can proceed in parallel after prerequisites.

---

### Task 1: Add server-owned club registry pagination and by-ID detail

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`
- Create: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubRegistryCursorDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubResponseTest.kt`

**Interfaces:**

```kotlin
data class PlatformAdminClubListQuery(
    val search: String?, val lifecycle: ClubLifecycleState?,
    val visibility: PublicVisibility?, val domainStatus: PlatformAdminDomainStatus?,
    val onboardingState: FirstHostOnboardingState?, val cursor: String?, val limit: Int,
)
data class PlatformAdminClubList(val items: List<PlatformAdminClubListItem>, val nextCursor: String?)
data class PlatformAdminClubDetail(/* identity, adminRevision, public state, domains, onboarding summary */)
```

Ordering is `(normalized_name ASC, club_id ASC)`. The opaque cursor binds schema version, normalized filters/search, last tuple, issue/expiry, and HMAC key version. `GET /api/admin/clubs/{clubId}` returns the aggregate regardless of list position; missing is `404`, unauthorized is `403`.

- [ ] **Step 1: Write RED query/cursor tests.** Cover Unicode/case/whitespace search normalization, each filter and conjunction, equal normalized names, page boundary no gaps/duplicates, cursor filter mismatch/tamper/expiry, limit bounds, empty result, >100 clubs, and exact by-ID lookup outside page one.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.club.api.PlatformAdminClubRegistryCursorDbTest` and `./server/gradlew -p server unitTest --tests com.readmates.club.application.service.PlatformAdminClubRegistryServiceTest`; expected FAIL.
- [ ] **Step 3: Implement query object, signed cursor, SQL pushdown, and detail mapping.** Use parameterized SQL and an index-compatible search strategy; do not use `%` string interpolation.
- [ ] **Step 4: Run GREEN and query plan check.** Run the Task 1 commands plus `./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest`; expected PASS without an unbounded full result materialization.
- [ ] **Step 5: Commit.** Commit: `feat(admin): add scalable club registry queries`

### Task 2: Add club admin revisions, previews, receipts, and convergence schema

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V57__platform_admin_club_command_receipts.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Schema responsibilities:**

- Add `clubs.admin_revision BIGINT NOT NULL DEFAULT 0` with a non-negative check.
- Add `platform_admin_club_command_previews`: UUID, command type, actor UUID snapshot, target club or `new-club` slot, versioned HMAC, sanitized impact JSON, expiry/consumed timestamp.
- Add append-only `platform_admin_club_command_receipts`: receipt UUID, command type, actor UUID snapshot, club UUID snapshot, before/after admin revision, outcome, request HMAC/key version, origin timestamp, safe result JSON.
- Add `platform_admin_club_command_convergence`: receipt UUID snapshot, effect type `HOST_INVITATION|DOMAIN_PROVISIONING`, state `PENDING|SUCCEEDED|FAILED`, attempt count, last safe error code, next attempt, timestamps.
- No immutable row has a destructive FK to a deletable club. Mutable convergence may refer to receipt by copied UUID without cascading receipt deletion.

- [ ] **Step 1: Write RED migration tests.** Cover legacy backfill, checks/indexes, preview single-consumption, immutable receipt update/delete prevention at application port level, convergence transitions, hard club deletion with redacted evidence retained, and no token/URL/text columns.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`; expected FAIL.
- [ ] **Step 3: Implement V57 without altering earlier migrations.** Use binary UUID and JSON schema checks consistent with current migrations.
- [ ] **Step 4: Run GREEN.** Run the Task 2 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(server): add club admin command evidence`

### Task 3: Make metadata, visibility, and domain commands safe

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubCommandDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`

**API contracts:**

- `PATCH /api/admin/clubs/{clubId}/metadata` accepts `expectedAdminRevision` and returns the new detail; stale is `409 REVISION_CONFLICT`.
- `POST /api/admin/clubs/{clubId}/visibility/preview` returns `previewId`, expiry, current/target visibility, impact codes, and request fingerprint prefix.
- `POST /api/admin/clubs/{clubId}/visibility/confirm` accepts preview ID, idempotency key, expected revision, and explicit confirmation; returns immutable receipt.
- Domain creation and provisioning recheck remain domain-owned paths but accept idempotency key/expected state and return receipt plus convergence status. Recheck is L1 and uses a lease; target-domain creation is L2/L3.

- [ ] **Step 1: Write RED service/DB tests.** Use two admins from one revision and assert one metadata/public winner; stale/conflict produces no domain/audit/receipt effect. Cover preview expiry/consumption/request mismatch, same-key response loss, different request conflict, public prerequisites, domain duplicate, recheck lease, partial external failure, and receipt replay reauthorization.
- [ ] **Step 2: Extend the RED full security matrix.** Add exact methods/paths for every new mutation; assert wrong method, suffix, encoded slash, cross-origin, missing BFF secret, inactive actor, and insufficient capability fail closed.
- [ ] **Step 3: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.club.api.PlatformAdminClubCommandDbTest` and `./server/gradlew -p server unitTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest`; expected FAIL.
- [ ] **Step 4: Implement application-owned transactions and conditional JDBC.** Use the shared claim service inside the same transaction as revision update, receipt, audit, and origin convergence row.
- [ ] **Step 5: Run GREEN.** Run both Task 3 commands; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): harden club control commands`

### Task 4: Replace ephemeral onboarding with durable preview and receipt reconciliation

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/mail/PlatformAdminHostInvitationMailAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`
- Create: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminOnboardingCommandDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryServiceTest.kt`

Preview returns only normalized public-safe labels, impact/prerequisite codes, matched identity category, `previewId`, HMAC fingerprint prefix, and TTL. Confirm accepts `previewId`, idempotency key, and explicit phrase/code; response is `{receiptId, club, originStatus, invitationDelivery}` and excludes `acceptUrl` or token. The same identity can resume delivery convergence without creating a second club/membership/invitation.

- [ ] **Step 1: Write RED onboarding tests.** Cover valid, duplicate slug/domain/email, preview expiry/consume/mismatch, actor switch, same/different idempotency key, concurrent confirm, transaction rollback, response loss, mail unavailable, worker retry success/failure, receipt lookup reauthorization, and no secret in DTO/log/audit.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.club.api.PlatformAdminOnboardingCommandDbTest` and `./server/gradlew -p server unitTest --tests com.readmates.club.application.service.PlatformAdminClubRegistryServiceTest`; expected FAIL.
- [ ] **Step 3: Implement durable preview, atomic origin, immutable receipt, and convergence worker.** Invitation delivery happens after the origin transaction through the convergence row; never hold a DB transaction open around mail I/O.
- [ ] **Step 4: Run GREEN.** Run the Task 4 commands; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(admin): make club onboarding recoverable`

### Task 5: Build the registry, detail, and onboarding workflows

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- Modify: `front/features/platform-admin/route/admin-clubs-data.ts`
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Modify: `front/features/platform-admin/route/admin-clubs-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-data.ts`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-club-registry.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-club-detail.tsx`
- Modify: `front/features/platform-admin/ui/domain-provisioning-panel.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx`
- Modify: `front/features/platform-admin/ui/admin-onboarding-modal.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-clubs-triage.spec.ts`
- Modify: `front/tests/e2e/admin-club-operations.spec.ts`

- [ ] **Step 1: Write RED list/detail tests.** Cover debounced server search, filters, infinite load, URL-safe list filters, reset on filter change, list partial errors, by-ID deep link outside page one, invalid/missing club, independent detail panels, read-only slug, stale revision recovery, capability-hidden actions, and 320px card layout.
- [ ] **Step 2: Write RED command UI tests.** Cover preview review, explicit confirmation, pending/receipt/convergence states, retry with same identity, conflict refresh, expired preview restart, unsaved-close guard, keyboard/focus behavior, and redaction of URL/token.
- [ ] **Step 3: Run RED.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/queries/platform-admin-queries.test.tsx features/platform-admin/route/admin-clubs-route.test.tsx features/platform-admin/route/admin-club-detail-route.test.tsx features/platform-admin/ui/admin-onboarding-modal.test.tsx`

  Expected: FAIL on client-only filtering, list-derived detail, and ephemeral commands.
- [ ] **Step 4: Implement infinite registry and independent detail queries.** Only non-sensitive search/filter/cursor state enters the URL. Use per-panel retries and common action dock/state components.
- [ ] **Step 5: Implement preview/confirm/receipt UI.** Generate one idempotency key per user intent in memory and retain it across response-loss retry; a changed draft creates a new identity.
- [ ] **Step 6: Run GREEN and browser tests.**

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/queries/platform-admin-queries.test.tsx features/platform-admin/route/admin-clubs-route.test.tsx features/platform-admin/route/admin-club-detail-route.test.tsx features/platform-admin/ui/admin-onboarding-modal.test.tsx`

  Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-clubs-triage.spec.ts tests/e2e/admin-club-operations.spec.ts`

  Expected: PASS on desktop and mobile.
- [ ] **Step 7: Commit.** Commit: `feat(admin): rebuild club control workspace`

### Task 6: Verify club-control acceptance

**Files:**
- Modify only if operator-visible behavior changed: `CHANGELOG.md`

- [ ] **Step 1: Run frontend gates.** Run: `npx --yes corepack@0.35.0 pnpm --dir front lint`, `npx --yes corepack@0.35.0 pnpm --dir front test`, and `npx --yes corepack@0.35.0 pnpm --dir front build`; expected PASS.
- [ ] **Step 2: Run server gates.** Run: `./scripts/server-ci-check.sh` and `./server/gradlew -p server integrationTest --tests com.readmates.club.api.PlatformAdminClubRegistryCursorDbTest --tests com.readmates.club.api.PlatformAdminClubCommandDbTest --tests com.readmates.club.api.PlatformAdminOnboardingCommandDbTest`; expected PASS.
- [ ] **Step 3: Run club browser suite.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-clubs-triage.spec.ts tests/e2e/admin-club-operations.spec.ts`; expected PASS.
- [ ] **Step 4: Inspect convergence without billable effects.** Use stubbed mail/domain adapters only. Prove origin success + pending, eventual success, terminal safe failure, and same-identity resume. Do not send real mail or change DNS.
- [ ] **Step 5: Run public-safety and hygiene scans.** Run: `git diff --check`, `python3 scripts/agent-preflight.py --paths front/features/platform-admin --paths server/src/main/kotlin/com/readmates/club`, and targeted scans for invitation tokens/private domains/raw email fixtures; expected clean.
- [ ] **Step 6: Commit acceptance-only changes if any.** Commit: `test(admin): verify club control workspace`
