# Platform Admin Review Workbenches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/support`, `/admin/audit`, `/admin/analytics`를 최소권한 지원, 누락 없는 통합 evidence, 정의가 일치하는 분석·내보내기를 갖춘 검토 영역으로 완성한다.

**Architecture:** Support는 body-based subject search와 domain-owned preview/confirm receipts를 사용하고 DB uniqueness로 동시 active grant를 막는다. Audit는 first-page snapshot과 filter fingerprint를 서명한 source-aware cursor로 각 source SQL에 continuation/filter를 push down한 뒤 안정적으로 k-way merge한다. Analytics는 동일 aggregate contract에서 화면과 server-generated CSV를 만들고 capability별 export를 분리한다.

**Tech Stack:** React, TypeScript, TanStack Query, Playwright, Kotlin, Spring Boot, JDBC, MySQL 8, Flyway V60, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: update — ADR-0039, ADR-0040, ADR-0042, ADR-0043; constraining reference — ADR-0029, ADR-0030, ADR-0031, ADR-0033, ADR-0035

## Global Constraints

- Prerequisite for V60: Service Spine Tasks 1–4, Safe Command Tasks 1–3, final Club Control V58, and Service Operations Task 2/V59. Stop and rebase V60 if migration history or shared receipt/claim interfaces differ.
- Support name/email free text, subject user UUID, bounded reason note, preview ID, and idempotency key remain in-memory only in the browser. They never enter route URL, history, Referer, local/session storage, analytics, or client logs.
- Support browser URL may retain only share-safe club/status/time scope. Subject search uses a JSON request body and `Cache-Control: no-store`.
- New support writes persist/expose only ADR-0043's allowlisted reason category, `notePresent`, request HMAC and key version. Optional note has zero durable retention and never enters a separate digest/encrypted store. V60 redacts legacy plaintext in place and retains only count evidence.
- Platform-admin support access never creates or persists a normal club membership. Existing active `HOST_SUPPORT_READ` request-local `ROLE_HOST` synthesis remains the authorization adapter; it is not exposed as persisted membership and cannot expand write authority.
- Audit applies every filter before each source limit. `occurredAt DESC → sourceRank ASC → immutableSourceId DESC` is the exact global order.
- Audit continuation cursor follows ADR-0042: purpose-separated V57 current-only issue/current+previous constant-time verify, positive TTL strictly below the fresh retirement buffer, and startup fail-closed. It binds snapshot upper bound, lower bound, all normalized filters, excluded sources, last visible tuple, schema/key version, issued time and expiry. Cursor from another filter/snapshot fails closed; no new secret is added.
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

`Service Operations Task 2/V59 → 1 → 2 → 3`. Task 4 begins only after every audit writer is stable: Club Control Tasks 3–4, Service Operations Tasks 3–4, and this plan's Task 2; then `4 → 5`. Task 6 may run in parallel only after actor/capability DTOs are stable and must not share the host integration branch's analytics/CSS files. `3 + 5 + 6 → 7`.

`MySqlFlywayMigrationTest.kt` is serialized V58 → V59 → V60. `SecurityConfig.kt` and
`PlatformAdminBffSecurityTest.kt` are serialized Service notification/AI → Review support → Review audit. Frontend
`globals.css`, platform-admin E2E fixtures, and host analytics files have one integrator; independent worktrees may own
feature-local model/route/UI files only.

---

### Task 1: Add support preview, immutable receipt, and active-grant uniqueness

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V60__platform_admin_support_command_receipts.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Schema responsibilities:**

- Add `active_slot TINYINT NULL` to `support_access_grants`. In one deterministic cleanup, keep the newest valid row by `(created_at DESC, id DESC)` at slot `1`, set older valid duplicates to revoked at the single migration timestamp with `active_slot=NULL`, and set expired/revoked rows to `NULL`. Then add unique `(club_id, grantee_user_id, scope, active_slot)`.
- Add count-only `platform_admin_support_migration_evidence` keyed by migration version with `duplicate_active_grants_revoked_count`, `legacy_reasons_redacted_count`, and recorded time. It contains no grant/club/user ID or source value.
- Replace free-text reason storage with uppercase ASCII `reason_category` and `note_present`. V60 maps every old row to `LEGACY_UNCLASSIFIED/true`, overwrites the old value with a fixed redaction sentinel, and makes the compatibility column incapable of storing arbitrary text; it may be dropped only after all old readers are gone. New writes allow only `INCIDENT_INVESTIGATION|MEMBER_ASSISTANCE|DATA_CORRECTION|SECURITY_REVIEW`; `LEGACY_UNCLASSIFIED` is migration-only.
- Add `platform_admin_support_command_previews`: preview UUID, `CREATE|REVOKE`, actor role/capability snapshot, grant/club or opaque create-slot snapshot, scope/expiry, reason category, `note_present`, request HMAC/key version, bounded safe impact JSON, expiry and paired receipt consumption. Confirm repeats the full normalized command; no grantee UUID, note, note HMAC or encrypted payload is persisted in preview evidence.
- Add append-only `platform_admin_support_command_receipts`: receipt UUID, command, actor role/capability and grant/club target snapshots, scope/expiry, reason category, `note_present`, before/after status, outcome, request HMAC/key version, unique global audit snapshot and created time. Receipt/audit evidence does not duplicate email/name/grantee member identity.
- Immutable preview/receipt evidence has no destructive FK to club/user/grant rows. Operational `support_access_grants` keeps the grantee/club FK needed for live authorization; cleanup/revoke precedes source hard delete while immutable redacted evidence remains.

Tasks 1, 2, and 3 may be reviewed as separate commits but are one release unit. No intermediate commit is deployable:
V60 intentionally rejects the legacy free-text create writer and its revoke path does not clear `active_slot`, while the
legacy request has no allowlisted category that can be synthesized honestly. Drain/stop support writers, run Flyway, start
the Task 2 canonical writer together with the Task 3 frontend and exact legacy `410` cutover, verify startup, and only then
restore write traffic. The sentinel-only CHECK makes an accidentally surviving old writer fail closed. Rollback never
restores redacted plaintext; it rolls application behavior forward on the V60 schema.

- [ ] **Step 1: Write RED migration tests.** Cover fresh and legacy upgrades, valid/expired/revoked rows, same-timestamp duplicate tie-break, deterministic revoke/slot cleanup, count-only evidence, unique race guard, new-category allowlist, migration-only legacy category, immediate raw-value redaction and fixed-sentinel compatibility, preview TTL/paired consumption, actor role/capability and unique audit snapshots, receipt immutability, source cleanup/user deletion with redacted evidence retained, and absence of note/note-HMAC/encrypted payload/email/name/member-identity reason columns. Assert exact Flyway counts and no V59/baseline/seed rewrite.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`; expected FAIL.
- [ ] **Step 3: Implement V60.** Use one migration timestamp for duplicate revocation, redact legacy reason values before narrowing the compatibility column, record count-only evidence, then add checks/indexes and immutable evidence tables. Do not create a plaintext retention table or application-port claims in SQL comments.
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
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify only if authority mapping needs adaptation: `server/src/main/kotlin/com/readmates/auth/application/service/DefaultAuthoritySynthesisService.kt`
- Modify only if request attachment needs adaptation: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/SupportAccessGrantServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminSupportCommandDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminSupportWorkbenchControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/application/service/DefaultAuthoritySynthesisServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`

**Canonical API:**

- `POST /api/admin/support/search` with `{query, clubId?}` body; no-store response.
- `GET /api/admin/support/grants?clubId=&status=&cursor=` for cursor ledger without subject query.
- `POST /api/admin/support/grants/preview` and `/confirm`.
- `POST /api/admin/support/grants/{grantId}/revoke/preview` and `/revoke/confirm`.

Confirm takes preview ID, idempotency key, allowlisted reason category, optional bounded note, and explicit confirmation. The
full normalized note participates in request HMAC comparison but is discarded before persistence; response contains only
reason category and `notePresent`. Completed same-key/same-request lookup runs before expired/consumed preview rejection and
reauthorizes the current actor/receipt-read capability. Same-key/different-request and committed in-progress fail closed;
only a new claim proceeds to preview, eligibility, capability and active-slot checks.

Create locks the `(club, grantee, scope)` operational identity, clears expired/revoked slots, inserts the one active slot,
and writes grant, immutable receipt, unique audit snapshot, preview consumption and claim completion in the application
service transaction. Revoke locks the current grant, sets `revoked_at` and `active_slot=NULL`, and commits the same evidence
atomically. A DB unique violation maps to the typed active-grant conflict, never an unhandled SQL error.

Task 2 adds canonical endpoints and leaves legacy one-click responses unchanged while the current frontend still calls that
path. Task 3 alone owns the atomic frontend/server `410` cutover. Read compatibility may delegate to the canonical ledger
but no controller may auto-preview/auto-confirm or create a second business path.

This compatibility is source-level only. The V60 + Task 2 intermediate state is not deployable or a whole-gate target;
Task 3 must land in the same release unit. Do not invent a reason category for a legacy request or adapt it through an
automatic preview/confirm flow.

- [ ] **Step 1: Write RED search/privacy tests.** Reject GET query search, oversize/blank input, wildcard abuse, and unauthorized sensitive projection. Prove response masks email and hides user UUID/note according to capability; assert `no-store`. Scan request/receipt/audit/DTO/log/query cache evidence for raw note/email/name and reason metadata member identity.
- [ ] **Step 2: Write RED command/concurrency tests.** Cover category allowlist/case, note normalization/length, note-present HMAC difference, create/revoke preview, eligibility recheck, actor/capability loss, expiry, Completed replay-before-preview rejection, same-key/different-request conflict, committed in-progress, two-admin duplicate race, expired-slot cleanup, DB uniqueness translation, response loss, atomic grant/receipt/audit/claim rollback, and receipt replay reauthorization. Auth regressions must prove active exact-club `HOST_SUPPORT_READ` still creates request-local `ROLE_HOST` without a membership row/DTO, while wrong scope/club, expiry and revoke do not synthesize or grant writes.
- [ ] **Step 3: Extend RED exact security-chain matrix.** Cover every new POST path, including near misses and insufficient capability. Characterize the legacy paths but do not change them to `410` in this task.
- [ ] **Step 4: Run RED.** Run `./server/gradlew -p server unitTest --tests com.readmates.club.application.service.SupportAccessGrantServiceTest --tests com.readmates.club.api.PlatformAdminSupportWorkbenchControllerTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest --tests com.readmates.auth.application.service.DefaultAuthoritySynthesisServiceTest --tests com.readmates.auth.infrastructure.security.MemberAuthoritiesFilterTest --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest` and `./server/gradlew -p server integrationTest --tests com.readmates.club.api.PlatformAdminSupportCommandDbTest`; expected FAIL.
- [ ] **Step 5: Implement one transaction-owning application-service path.** Both controllers may adapt reads during transition, but no duplicate create/revoke logic or synthetic auto-confirm is allowed. Preserve request-local support authority synthesis as an adapter; never persist or expose it as membership.
- [ ] **Step 6: Run GREEN.** Run the Task 2 commands; expected PASS.
- [ ] **Step 7: Commit.** Commit: `feat(admin): make support grants reviewable and idempotent`

### Task 3: Rebuild the privacy-safe support workbench

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/SupportAccessGrantController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
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

This task is the only legacy cutover owner. One integrated commit moves every frontend create/revoke call to canonical
preview/confirm and makes exact legacy one-click `POST|DELETE /api/admin/support-access-grants/**` and
`POST|DELETE /api/admin/support/grants/**` return `410 SAFE_CONFIRM_REQUIRED` without invoking a grant mutation, audit,
receipt or claim port. Missing trust/capability and near-miss method/path remain protected. Read compatibility may continue
to delegate to the canonical ledger.

- [ ] **Step 1: Write RED privacy tests.** Enter name/email, select a subject, type note, preview, navigate/back/refresh, and inspect `location`, history state, local/session storage, query keys, mutation cache and client logging spies. Assert sensitive values are absent and are purged on `401|403`; receipt/history renders category and `notePresent` only.
- [ ] **Step 2: Write RED workflow/state and cutover tests.** Cover accessible search label, independent search/ledger/mutation errors, preserved input on validation/transport failure, no result, ineligible target, active/expiring/expired/revoked filters, cursor accumulation/dedupe, capability states, create/revoke preview, expired preview, same-key retry, immutable receipt, and 320px bottom-safe completion. Assert the frontend makes zero legacy calls; exact legacy server paths return `410` only after cutover and every mutation/effect spy remains at zero.
- [ ] **Step 3: Run RED.** Run `./server/gradlew -p server unitTest --tests com.readmates.club.api.SupportAccessGrantControllerTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest` and `npx --yes corepack@0.35.0 pnpm --dir front test --run features/platform-admin/model/platform-admin-support-model.test.ts features/platform-admin/route/admin-support-route.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx`; expected FAIL on exact legacy server cutover and the frontend canonical flow.
- [ ] **Step 4: Implement ephemeral controller state and body-based search.** Query keys use only a non-reversible per-session request sequence, not raw subject text/UUID. Disable TanStack persistence for these queries and remove them immediately when selection is cleared.
- [ ] **Step 5: Implement preview/confirm/receipt UI, cursor ledger, and exact legacy `410` server cutover in the same commit.** Revoke uses the same review rigor as create. Keep selected club URL-safe; all subject and note state stays in memory. Do not land the server `410` before the frontend client migration.
- [ ] **Step 6: Run GREEN and browser tests.** Run both Task 3 unit commands and `npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-club-operations.spec.ts`; expected PASS.
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
- Create: `server/src/main/kotlin/com/readmates/admin/audit/config/AdminAuditCursorProperties.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditCursorSigner.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/audit/config/AdminAuditCursorPropertiesTest.kt`
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
    val keyVersion: Int, val issuedAt: OffsetDateTime, val expiresAt: OffsetDateTime,
)
data class AdminAuditSourceQuery(
    val filter: AdminAuditFilter, val snapshotTo: OffsetDateTime,
    val after: AdminAuditTuple?, val limit: Int,
)
```

Task 4 must not begin from placeholder schemas. Its review gate requires committed Club V58 origin/convergence writers, V59
notification and AI receipt/convergence writers, and V60 support writers. Sources then include platform audit, club audit,
operation-case events, club receipts/convergence attempts, notification confirmations/convergence attempts, AI admin
receipts/convergence attempts, support receipts, and ADR-0037 events when present. Each L2/L3 receipt is joined by its unique
`platform_audit_event_id_snapshot`; the audit adapter treats this as a logical snapshot link, not a destructive source FK,
and proves one projection per receipt even after deletable domain source cleanup.

The service maps semantic action/outcome/source filters into exact per-source SQL predicates before `limit + 1`. Each source
query applies global continuation logic relative to its fixed rank, then the service performs a deterministic k-way merge. A
source unavailable on page one is pinned in `excludedSources` for that snapshot and disclosed on every continuation; restart
is required to include it after recovery. If a source that was included later fails, that continuation fails retriably and
does not advance the cursor, preventing a silent hole.

Each adapter encodes its immutable ID with a source discriminator and parses it back to the native SQL type for continuation comparison; numeric IDs are compared numerically and UUID/binary IDs with their native database ordering, never as decimal-looking strings.

`GET /api/admin/audit/events` remains the share-safe filter endpoint and rejects user-target filter fields. `POST /api/admin/audit/events/search` accepts the same normalized filter contract plus an in-memory sensitive target in its JSON body, returns `Cache-Control: no-store`, and is protected by an exact same-origin BFF/CSRF matcher and `VIEW_SENSITIVE_AUDIT`. Both endpoints delegate to the same use case and cursor signer.

`AdminAuditCursorSigner` uses existing `AdminCommandIdentityProperties` key material with fixed purpose
`readmates:platform-admin-audit-cursor:v1`; it does not call command request canonicalization or add a secret. New cursors
use current key/version only. Verification accepts the pinned current or configured previous version and compares the
expected 32-byte MAC in constant time; unknown/removed versions fail closed. Canonical cursor bytes contain only the fields
above with length-prefixed boundaries. Sensitive body target/name/email/member UUID is represented only inside the filter
HMAC and is absent from the payload and logs.

`AdminAuditCursorProperties.cursorTtl` defaults to one hour and startup validation requires
`Duration.ZERO < cursorTtl < AdminCommandIdempotencyProperties.previousKeyRolloutBuffer`. This shares V57's
DB-backed configured/current/previous validation and fresh post-drain retirement buffer. Rotation invalidates the previous
key's old zero-reference timestamp; current-only issue plus strict TTL proves every old-current cursor expires before key
removal. If the invariant is ever relaxed, unexpired cursors must become durable key references or receive a separate key
lifecycle before that change ships.

- [ ] **Step 1: Write RED cursor/key-lifecycle tests.** Cover byte-exact purpose/length-prefix schema, current-only issue, current/previous verify, every field/MAC mutation, expiry, unknown/removed key, NFC filter canonicalization, constant-time comparison path, and safe logging. Assert sensitive target/name/email/member UUID is absent from encoded bytes. Property/startup tests cover zero/negative TTL, equality with the rollout buffer, longer TTL, valid shorter TTL, overlap timestamp invalidation, old-current cursor verification until expiry and fresh-buffer-only key removal.
- [ ] **Step 2: Write RED DB completeness tests after all writer commits are present.** Seed matching events older than more than one page of non-matching rows in every source; assert no omission. Cover equal microsecond timestamps across ranks and native numeric/UUID IDs, page boundaries, new event after snapshot, page-one source exclusion, continuation source failure/retry, target/action/category/outcome/actor/club filters, every club/notification/AI/support receipt and attempt source, unique audit-snapshot join, deleted domain source with immutable receipt retained, and no duplicate/gap.
- [ ] **Step 3: Assert cursor and security correctness.** The second request continues after the last visible row; filter/snapshot mismatch is `400 INVALID_CURSOR`; inserts newer than `snapshotTo` do not disturb the run; unavailable source remains disclosed on every page. Prove sensitive target fields are rejected on GET and accepted only by the exact same-origin, secret-bearing, capability-authorized POST path; near-miss paths fail closed.
- [ ] **Step 4: Run RED.** Run `./server/gradlew -p server unitTest --tests com.readmates.admin.audit.config.AdminAuditCursorPropertiesTest --tests com.readmates.admin.audit.application.service.AdminAuditCursorSignerTest --tests com.readmates.admin.audit.application.service.AdminAuditLedgerServiceTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest` and `./server/gradlew -p server integrationTest --tests com.readmates.admin.audit.adapter.out.persistence.AdminAuditLedgerCursorDbTest`; expected FAIL on current cursor ignore/post-limit filtering and missing signed POST boundary.
- [ ] **Step 5: Implement purpose-separated signed cursor, startup TTL validation, source predicates, and k-way merge.** Replace generic `CursorCodec.decode` trust with authenticated parsing. Keep source ranks versioned and immutable within cursor schema v1. Reuse V57 keys/configuration only; do not add a cursor secret, durable cursor table, or key value to logs/DTOs.
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

Do not start this task on a branch that still carries the host workspace's edits to the same analytics model/tests,
`globals.css`, or E2E fixtures. First integrate that branch, then give this task exclusive ownership of the listed shared
files. Server-only CSV work may proceed independently once actor/capability projection contracts from Tasks 2 and 4 are
stable.

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
- [ ] **Step 5: Run cross-source audit proof without external effects.** Seed the committed club, notification, AI, support, and operation-case receipt/event schemas through test adapters or SQL fixtures; do not fake away the audit writer contract. Page/filter through every source and prove unique audit-snapshot joins, stable ordering, no omissions, dedupe, partial disclosure, source hard-delete survival, and receipt drill-down. Mail/provider adapters remain fakes and receive zero network calls.
- [ ] **Step 6: Inspect 320/768/1440px, keyboard-only, reduced-motion, and 200% zoom states.** Verify filters, ledgers, inspectors, preview dialogs, action docks, and export completion.
- [ ] **Step 7: Run hygiene.** Run: `git diff --check` and `python3 scripts/agent-preflight.py --paths front/features/platform-admin --paths server/src/main/kotlin/com/readmates/admin --paths server/src/main/kotlin/com/readmates/club`; expected clean.
- [ ] **Step 8: Commit acceptance-only changes if any.** Commit: `test(admin): verify review workbenches`
