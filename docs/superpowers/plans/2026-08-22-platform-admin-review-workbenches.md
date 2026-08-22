# Platform Admin Review Workbenches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/support`, `/admin/audit`, `/admin/analytics`를 최소권한 지원, 누락 없는 통합 evidence, 정의가 일치하는 분석·내보내기를 갖춘 검토 영역으로 완성한다.

**Architecture:** Support는 body-based subject search와 domain-owned preview/confirm receipts를 사용하고 DB uniqueness로 동시 active grant를 막는다. Audit는 first-page snapshot과 filter fingerprint를 서명한 source-aware cursor로 각 source SQL에 continuation/filter를 push down한 뒤 안정적으로 k-way merge한다. Analytics는 동일 aggregate contract에서 화면과 server-generated CSV를 만들고 capability별 export를 분리한다.

**Tech Stack:** React, TypeScript, TanStack Query, Playwright, Kotlin, Spring Boot, JDBC, MySQL 8, Flyway V59, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: implements proposed ADR-0039 and ADR-0040; constraining reference — ADR-0029, ADR-0030, ADR-0031, ADR-0033, ADR-0035

## Global Constraints

- Prerequisite: Service Spine Tasks 1–4, Safe Command Tasks 1–3, and V52–V58. Stop and rebase V59 if the migration sequence differs.
- Support name/email free text, subject user UUID, bounded reason note, preview ID, and idempotency key remain in-memory only in the browser. They never enter route URL, history, Referer, local/session storage, analytics, or client logs.
- Support browser URL may retain only share-safe club/status/time scope. Subject search uses a JSON request body and `Cache-Control: no-store`.
- Reason category may be durable; bounded note is redacted, has explicit retention, and is returned only with `VIEW_SENSITIVE_AUDIT`.
- Platform-admin support access never creates, persists, or exposes a normal club membership or host role.
- Audit applies every filter before each source limit. `occurredAt DESC → sourceRank ASC → immutableSourceId DESC` is the exact global order.
- Audit continuation cursor binds snapshot upper bound, lower bound, all normalized filters, last visible tuple, schema/key version, and expiry. Cursor from another filter/snapshot fails closed.
- Load more appends and deduplicates; it never replaces prior rows. `nextCursor` is encoded from the last returned visible row, not the first hidden row.
- Audit DTOs contain only safe actor/target labels, state codes, reason category, receipt/correlation reference, and bounded safe metadata—never deleted content, raw JSON, provider error, email, prompt, or note.
- Analytics zero, insufficient data, and measurement unavailable remain distinct. Screen and CSV use one typed projection and identical metric definitions.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Support uniqueness, previews, receipts | 1–2 |
| Support privacy-safe workbench | 3 |
| Source-aware audit cursor and complete coverage | 4 |
| Audit UI accumulation and safe detail | 5 |
| Analytics consistency and export | 6 |
| Cross-workbench acceptance | 7 |

## Dependency Order

`1 → 2 → 3`; `1 + prior domain receipts → 4 → 5`; `6` can run in parallel; `3 + 5 + 6 → 7`.

---

### Task 1: Add support preview, immutable receipt, and active-grant uniqueness

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V59__platform_admin_support_command_receipts.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Schema responsibilities:**

- Add `active_slot TINYINT NULL` to `support_access_grants`, backfill `1` for unrevoked/unexpired rows and `NULL` otherwise, and add unique `(club_id, grantee_user_id, scope, active_slot)`. Application transitions expired/revoked rows to `NULL` before insert; uniqueness is the final concurrent-create guard.
- Add `platform_admin_support_command_previews`: preview UUID, `CREATE|REVOKE`, actor UUID snapshot, grant/club/subject UUID snapshots, scope, reason category, bounded-note HMAC only, request HMAC/key version, safe impact JSON, expiry/consumed time.
- Add append-only `platform_admin_support_command_receipts`: receipt UUID, command, actor/club/subject/grant UUID snapshots, scope, reason category, before/after status, outcome, request HMAC/key version, created time.
- Add a separately encrypted/retained bounded-note store only if the current retention policy requires operator retrieval; otherwise retain its HMAC and `notePresent` only. No receipt/audit row contains the note.
- Immutable rows do not have destructive FKs to club/user/grant rows.

- [ ] **Step 1: Write RED migration tests.** Cover legacy active/expired/revoked backfill, duplicate cleanup policy, unique race guard, state checks, preview TTL, receipt immutability, subject/user deletion with redacted evidence retained, and absence of raw reason/email/name columns.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`; expected FAIL.
- [ ] **Step 3: Implement V59.** Before adding the unique index, deterministically retain the newest valid active row and mark older duplicates inactive while recording a migration-safe audit count, never private values.
- [ ] **Step 4: Run GREEN.** Run the Task 1 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(server): add support command evidence`

### Task 2: Consolidate support APIs around preview/confirm

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/SupportAccessGrantModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/SupportAccessGrantUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/SupportAccessGrantPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcSupportAccessGrantAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminSupportWorkbenchController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/SupportAccessGrantController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/SupportAccessGrantServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminSupportCommandDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminSupportWorkbenchControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`

**Canonical API:**

- `POST /api/admin/support/search` with `{query, clubId?}` body; no-store response.
- `GET /api/admin/support/grants?clubId=&status=&cursor=` for cursor ledger without subject query.
- `POST /api/admin/support/grants/preview` and `/confirm`.
- `POST /api/admin/support/grants/{grantId}/revoke/preview` and `/revoke/confirm`.

Confirm takes preview ID, idempotency key, reason category, optional bounded note, and explicit confirmation. Response is a safe receipt summary. After frontend and internal callers migrate, legacy one-click `POST|DELETE /api/admin/support-access-grants/**` and `POST|DELETE /api/admin/support/grants/**` return `410 SAFE_CONFIRM_REQUIRED`; read compatibility delegates to the canonical ledger without a second business path.

- [ ] **Step 1: Write RED search/privacy tests.** Reject GET query search, oversize/blank input, wildcard abuse, and unauthorized sensitive projection. Prove response masks email and hides user UUID/note according to capability; assert `no-store`.
- [ ] **Step 2: Write RED command/concurrency tests.** Cover create/revoke preview, eligibility recheck, expiry, actor switch, same/different idempotency key, two-admin duplicate race, DB uniqueness translation, response loss, receipt replay reauthorization, expired grant transition, atomic audit/receipt, and no synthesized membership.
- [ ] **Step 3: Extend RED exact security-chain matrix.** Cover every new POST path and legacy one-click denial, including near misses and insufficient capability.
- [ ] **Step 4: Run RED.** Run: `./server/gradlew -p server unitTest --tests com.readmates.club.application.service.SupportAccessGrantServiceTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest` and `./server/gradlew -p server integrationTest --tests com.readmates.club.api.PlatformAdminSupportCommandDbTest`; expected FAIL.
- [ ] **Step 5: Implement one application-service path.** Both controllers may adapt reads during transition, but no duplicate create/revoke logic or synthetic auto-confirm is allowed.
- [ ] **Step 6: Run GREEN.** Run the Task 2 commands; expected PASS.
- [ ] **Step 7: Commit.** Commit: `feat(admin): make support grants reviewable and idempotent`

### Task 3: Rebuild the privacy-safe support workbench

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-support-api.ts`
- Modify: `front/features/platform-admin/model/platform-admin-support-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-support-model.test.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-support-queries.ts`
- Modify: `front/features/platform-admin/route/admin-support-data.ts`
- Modify: `front/features/platform-admin/route/admin-support-route.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.ct.tsx`
- Modify: `front/features/platform-admin/ui/support-access-grants-panel.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-support.spec.ts`
- Modify: `front/tests/e2e/admin-club-operations.spec.ts`

- [ ] **Step 1: Write RED privacy tests.** Enter name/email, select a subject, type note, preview, navigate/back/refresh, and inspect `location`, history state, local/session storage, query keys, and client logging spies. Assert sensitive values are absent and are purged on `401|403`.
- [ ] **Step 2: Write RED workflow/state tests.** Cover accessible search label, independent search/ledger/mutation errors, preserved input on validation/transport failure, no result, ineligible target, active/expiring/expired/revoked filters, cursor accumulation/dedupe, capability states, create/revoke preview, expired preview, same-key retry, immutable receipt, and 320px bottom-safe completion.
- [ ] **Step 3: Run RED.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/platform-admin-support-model.test.ts features/platform-admin/route/admin-support-route.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx`; expected FAIL.
- [ ] **Step 4: Implement ephemeral controller state and body-based search.** Query keys use only a non-reversible per-session request sequence, not raw subject text/UUID. Disable TanStack persistence for these queries and remove them immediately when selection is cleared.
- [ ] **Step 5: Implement preview/confirm/receipt UI and cursor ledger.** Revoke uses the same review rigor as create. Keep selected club URL-safe; all subject and reason state stays in memory.
- [ ] **Step 6: Run GREEN and browser tests.** Run the Task 3 command and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-club-operations.spec.ts`; expected PASS.
- [ ] **Step 7: Commit.** Commit: `feat(admin): rebuild support access workbench`

### Task 4: Implement a complete source-aware audit ledger

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/application/model/AdminAuditModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/application/port/in/ListAdminAuditLedgerUseCase.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/application/port/out/AdminAuditLedgerReadPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerService.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/adapter/out/persistence/JdbcAdminAuditLedgerAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/audit/adapter/in/web/PlatformAdminAuditController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditCursorSigner.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/audit/application/service/AdminAuditCursorSignerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/audit/api/PlatformAdminAuditControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/audit/adapter/out/persistence/AdminAuditLedgerCursorDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`

**Interfaces:**

```kotlin
data class AdminAuditCursor(
    val schemaVersion: Int, val snapshotTo: OffsetDateTime, val from: OffsetDateTime,
    val filterFingerprint: ByteArray, val excludedSources: Set<AdminAuditSourceType>,
    val occurredAt: OffsetDateTime,
    val sourceRank: Int, val immutableSourceId: String,
    val keyVersion: Int, val expiresAt: OffsetDateTime,
)
data class AdminAuditSourceQuery(
    val filter: AdminAuditFilter, val snapshotTo: OffsetDateTime,
    val after: AdminAuditTuple?, val limit: Int,
)
```

Sources include platform audit, club audit, operation-case events, club command receipts, notification preview/confirm and target outcomes, AI admin action receipts/execution rounds, support receipts, and later ADR-0037 events when present. The service maps semantic action/outcome/source filters into exact per-source SQL predicates before `limit + 1`. Each source query applies global continuation logic relative to its fixed rank, then the service performs a deterministic k-way merge. A source unavailable on page one is pinned in `excludedSources` for that snapshot and disclosed on every continuation; restart is required to include it after recovery. If a source that was included later fails, that continuation fails retriably and does not advance the cursor, preventing a silent hole.

Each adapter encodes its immutable ID with a source discriminator and parses it back to the native SQL type for continuation comparison; numeric IDs are compared numerically and UUID/binary IDs with their native database ordering, never as decimal-looking strings.

`GET /api/admin/audit/events` remains the share-safe filter endpoint and rejects user-target filter fields. `POST /api/admin/audit/events/search` accepts the same normalized filter contract plus an in-memory sensitive target in its JSON body, returns `Cache-Control: no-store`, and is protected by an exact same-origin BFF/CSRF matcher and `VIEW_SENSITIVE_AUDIT`. Both endpoints delegate to the same use case and cursor signer.

- [ ] **Step 1: Write RED cursor signer tests.** Cover snapshot/filter binding, every field/MAC mutation, expiry, current/previous key rotation, unknown/retired key, NFC filter canonicalization, constant-time verification path, and safe logging.
- [ ] **Step 2: Write RED DB completeness tests.** Seed matching events older than more than one page of non-matching rows in every source; assert no omission. Cover equal microsecond timestamps across ranks and native numeric/UUID IDs, page boundaries, new event after snapshot, page-one source exclusion, continuation source failure/retry, target/action/category/outcome/actor/club filters, all required source types, and no duplicate/gap.
- [ ] **Step 3: Assert cursor and security correctness.** The second request continues after the last visible row; filter/snapshot mismatch is `400 INVALID_CURSOR`; inserts newer than `snapshotTo` do not disturb the run; unavailable source remains disclosed on every page. Prove sensitive target fields are rejected on GET and accepted only by the exact same-origin, secret-bearing, capability-authorized POST path; near-miss paths fail closed.
- [ ] **Step 4: Run RED.** Run: `./server/gradlew -p server unitTest --tests com.readmates.admin.audit.application.service.AdminAuditCursorSignerTest --tests com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest` and `./server/gradlew -p server integrationTest --tests com.readmates.admin.audit.adapter.out.persistence.AdminAuditLedgerCursorDbTest`; expected FAIL on current cursor ignore/post-limit filtering.
- [ ] **Step 5: Implement signed cursor, source predicates, and k-way merge.** Replace generic `CursorCodec.decode` trust with authenticated parsing. Keep source ranks versioned and immutable within cursor schema v1.
- [ ] **Step 6: Run GREEN and query-plan test.** Run Task 4 commands plus `./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest`; expected PASS.
- [ ] **Step 7: Commit.** Commit: `feat(admin): make audit ledger complete and stable`

### Task 5: Make audit filtering, accumulation, and detail operational

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-audit-api.ts`
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.test.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-audit-queries.ts`
- Modify: `front/features/platform-admin/route/admin-audit-data.ts`
- Modify: `front/features/platform-admin/route/admin-audit-route.tsx`
- Modify: `front/features/platform-admin/route/admin-audit-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-audit.spec.ts`
- Modify: `front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts`

Share-safe time/club/actor-type/source/category/action/outcome filters remain in the route URL. Sensitive target search and selected user target stay in memory and use a body-based search request; only non-user club/job/event/receipt IDs may be deep-linked.

- [ ] **Step 1: Write RED URL/filter tests.** Cover every filter, reset, invalid normalization, sensitive target exclusion, first snapshot preservation, and filter change creating a fresh snapshot.
- [ ] **Step 2: Write RED infinite-ledger tests.** Cover append/dedupe, selected row retention, source partial state per page, load-more error preserving prior rows, empty vs filtered empty, actor/target/reason category/before-after/receipt/correlation fields, sensitive capability redaction, keyboard row navigation, mobile drill-in/back restore, and 200% zoom.
- [ ] **Step 3: Run RED.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/platform-admin-audit-model.test.ts features/platform-admin/route/admin-audit-route.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx`; expected FAIL on page replacement and reduced filters.
- [ ] **Step 4: Convert to infinite query and complete inspector.** Never place cursor itself in the share URL; query owns it as snapshot continuation. Preserve prior pages on retry.
- [ ] **Step 5: Run GREEN and e2e.** Run the Task 5 command and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-audit.spec.ts tests/e2e/admin-audit-ai-ops-drilldown.spec.ts`; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): complete audit evidence workflow`

### Task 6: Align analytics screen, definitions, and CSV export

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsController.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsCsvExporter.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsCsvExporterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt`
- Modify: `front/features/platform-admin/api/platform-admin-analytics-api.ts`
- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`
- Modify: `front/features/platform-admin/route/admin-analytics-route.tsx`
- Modify: `front/features/platform-admin/route/admin-analytics-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-analytics.spec.ts`

`GET /api/admin/analytics/export.csv?window=` requires `EXPORT_ANALYTICS`, returns `text/csv; charset=utf-8`, attachment filename, `no-store`, and the same generated projection schema as the screen. CSV contains KPI current/prior/delta/availability, every series point, and every displayed benchmark metric; spreadsheet formula prefixes `= + - @` are escaped.

- [ ] **Step 1: Write RED metric/CSV parity tests.** For available, zero, insufficient, and measurement-unavailable fixtures, parse the CSV and compare every screen projection field. Cover Korean/quote/comma/newline names, formula injection, deterministic columns, filename, capability denial, and no-store.
- [ ] **Step 2: Write RED UI tests.** Cover unavailable vs zero, series with non-aligned buckets, benchmark responsive/card alternative, keyboard period selection, export pending/success/failure, object URL cleanup, no client data URI, and 200% zoom.
- [ ] **Step 3: Run RED.** Run: `./server/gradlew -p server unitTest --tests com.readmates.admin.analytics.application.service.AdminAnalyticsCsvExporterTest --tests com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest --tests com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest` and `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/platform-admin-analytics-model.test.ts features/platform-admin/route/admin-analytics-route.test.tsx features/platform-admin/ui/admin-analytics-overview.test.tsx`; expected FAIL on current browser-built incomplete CSV.
- [ ] **Step 4: Implement one typed projection and server export.** Keep current metric definitions unless a separately reviewed KPI ADR changes them; label definitions and generated time in both formats.
- [ ] **Step 5: Run GREEN and e2e.** Run Task 6 commands and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts`; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(admin): align analytics review and export`

### Task 7: Verify the complete review area

**Files:**
- Modify only if operator/API behavior changed: `CHANGELOG.md`

- [ ] **Step 1: Run frontend gates.** Run: `npx --yes corepack@0.35.0 pnpm --dir front lint`, `npx --yes corepack@0.35.0 pnpm --dir front test`, and `npx --yes corepack@0.35.0 pnpm --dir front build`; expected PASS.
- [ ] **Step 2: Run server gates.** Run: `./scripts/server-ci-check.sh` and focused Testcontainers suites from Tasks 1, 2, and 4; expected PASS.
- [ ] **Step 3: Run review browser suite.** Run: `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-audit.spec.ts tests/e2e/admin-audit-ai-ops-drilldown.spec.ts tests/e2e/admin-analytics.spec.ts`; expected PASS.
- [ ] **Step 4: Run privacy probes.** Search browser URL/history/storage/query-cache serialization/client logs after support and sensitive-audit workflows; assert no name/email/user UUID/note/preview/idempotency key. Inspect server DTO/log fixtures for raw private content.
- [ ] **Step 5: Run cross-source audit proof.** Create only fake/stub domain receipts for club, notification, AI, support, and operation-case events; page/filter through all sources and prove stable ordering, no omissions, dedupe, partial disclosure, and receipt drill-down.
- [ ] **Step 6: Inspect 320/768/1440px, keyboard-only, reduced-motion, and 200% zoom states.** Verify filters, ledgers, inspectors, preview dialogs, action docks, and export completion.
- [ ] **Step 7: Run hygiene.** Run: `git diff --check` and `python3 scripts/agent-preflight.py --paths front/features/platform-admin --paths server/src/main/kotlin/com/readmates/admin --paths server/src/main/kotlin/com/readmates/club`; expected clean.
- [ ] **Step 8: Commit acceptance-only changes if any.** Commit: `test(admin): verify review workbenches`
