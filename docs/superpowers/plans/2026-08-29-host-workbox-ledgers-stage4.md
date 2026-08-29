# Host Workbox and Auxiliary Ledgers Stage 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 모임 밖 업무를 잃지 않는 `지금 · 보류 · 완료` 작업함과 일정/사람/기록/초대·설정 목적지를 완성한다.

**Architecture:** cross-domain work item projection과 user-controlled deferral만 새 server `hostworkspace` feature가 소유한다. source completion은 memberships, schedule seen, record closing, invitations, notification receipts에서 계산하며 별도 mutable completed flag로 복제하지 않는다. deferral은 stable source key에 묶어 저장하고 source가 해결되면 completed projection이 된다. frontend는 aggregate workbox query를 운영실에 사용하고 각 ledger는 기존 domain query를 재사용한다.

**Tech Stack:** Kotlin clean feature package/JdbcTemplate/Flyway, React Router/TanStack Query/Zod, Vitest/Playwright.

**Spec:** ADR-0048, design §3–7/9, approved 10–14/17.

ADR impact: **ADR-0048 already updated during pre-SDD reconciliation** with stable work-item identity, derived completion, deferral expiry and 30-day completed retention. Re-open it only if repository reality contradicts that accepted program authority.

## Global Constraints

- v1 sources: `SCHEDULE_UNSEEN`, `MEMBER_APPROVAL`, `RECORD_CLOSING`, `INVITATION_EXPIRY`, `NOTIFICATION_FAILURE`.
- source completion is authoritative. Deferral never marks a source solved and expires back to NOW.
- completed shows resolved source/operation receipts from the last 30 days; no raw email, provider body, token or page history.
- `대상과 문구 검토` always opens preview and never sends automatically.
- people detail separates Stage 1 `lastClubAccessAt`, schedule seen, RSVP and attendance; none substitutes for another.
- cursor collections use server continuation; do not client-slice partial collections.
- all new mutating routes are added to `SecurityConfig.kt` exact CSRF/trusted-BFF policy and security tests.
- Stage 3 registers `hostworkspace` before its first inbound package. Stage 4 verifies that registration and adds only the approved one-way source dependencies; it never adds a reverse dependency or imports a foreign persistence adapter.

## Five-source contract

| Type | Owner symbol/path | Resource identity + generation | NOW predicate | COMPLETED predicate / resolvedAt | dueAt | Receipt allowlist / partial failure |
| --- | --- | --- | --- | --- | --- | --- |
| `SCHEDULE_UNSEEN` | new session input port `GetHostScheduleSeenWorkSourceUseCase`, implemented from `session_participants` and `sessions.schedule_revision` | session ID + exact `scheduleRevision` | availability `AVAILABLE` and eligible `STALE|UNSEEN` count > 0 | same revision's eligible count reaches 0; max exact-revision `seen_schedule_at` | session start | optional manual-dispatch ID/status and aggregate target/delivery counts only; source failure is `SCHEDULE_SOURCE_UNAVAILABLE` |
| `MEMBER_APPROVAL` | `ManageMemberApprovalsUseCase.listViewers` / `MemberApprovalService` | membership ID + approval request `createdAt` generation | lifecycle is pending `VIEWER` approval | membership leaves pending approval; lifecycle transition time | request `createdAt` | action/result/status only; no userId/email; source failure is `MEMBER_SOURCE_UNAVAILABLE` |
| `RECORD_CLOSING` | `GetHostSessionClosingStatusUseCase` / `SessionClosingStatusService` | session ID + canonical hash of session/record/publication version vector | server closing status has an actionable/blocking incomplete step | same generation reaches published/resolved closing outcome; authoritative apply/publish time | session end/close time | record-apply/publication receipt ID, state, safe summary; source failure is `RECORD_SOURCE_UNAVAILABLE` |
| `INVITATION_EXPIRY` | new auth `ManageHostInvitationLinksUseCase` | named link ID + monotonic `linkRevision` | ACTIVE link expires within 7 days and has remaining uses | old revision is extended/stopped/expired; link audit timestamp | `expiresAt` | link action/status/uses/maxUses only; no token/URL/email; source failure is `INVITATION_SOURCE_UNAVAILABLE` |
| `NOTIFICATION_FAILURE` | `HostNotificationOperationsService` over delivery ledger | delivery ID + attempt ordinal | `FAILED|DEAD` and unresolved | same delivery reaches allowlisted resolved delivery state; delivery `updatedAt` | `nextRetryAt` or failure time | event type, channel, status, attempt count, safe error code only; no recipient/provider body; source failure is `NOTIFICATION_SOURCE_UNAVAILABLE` |

Zero eligible source rows means no item, not a fabricated completed item. First-page evaluation runs the five source ports in the fixed table order inside one MySQL `REPEATABLE_READ` transaction, with one captured `evaluatedAt`. Each source returns typed availability plus its full v1 actionable/recent-resolved allowlist projection; expected partial failure is data, while an unexpected SQL/transaction failure aborts the snapshot. The service stores that ordered, privacy-safe projection as an immutable 15-minute `host_workbox_snapshot`; its UUID plus schema version is the equivalent snapshot generation bound as `sourceSetEpoch`. Continuations page only that snapshot, so concurrent source mutation cannot create a gap or duplicate; a fresh first page sees the mutation. Expired, deleted, cross-club/host/state/filter or retired-key cursors fail closed and require restart.

## Source ownership and allowed dependency direction

Each source feature owns its business predicate and returns a feature-local DTO through the named input port. `hostworkspace` owns only normalization, ordering, snapshotting, deferral and paging. Its `adapter/out/source` adapters translate source DTOs to `HostWorkSourceResult`; they may import the named application input ports but never another feature's persistence adapter.

| Source | Source-owned input/service/query paths | Hostworkspace translator |
| --- | --- | --- |
| `SCHEDULE_UNSEEN` | `session/application/port/in/GetHostScheduleSeenWorkSourceUseCase.kt`, `session/application/service/HostScheduleSeenWorkSourceService.kt`, `session/application/port/out/HostScheduleSeenWorkSourceQueryPort.kt`, `session/adapter/out/persistence/JdbcHostScheduleSeenWorkSourceAdapter.kt` | `hostworkspace/adapter/out/source/SessionScheduleUnseenWorkSourceAdapter.kt` |
| `MEMBER_APPROVAL` | `auth/application/port/in/GetHostMemberApprovalWorkSourceUseCase.kt`, `auth/application/service/HostMemberApprovalWorkSourceService.kt`, `auth/application/port/out/HostMemberApprovalWorkSourceQueryPort.kt`, `auth/adapter/out/persistence/JdbcHostMemberApprovalWorkSourceAdapter.kt` | `hostworkspace/adapter/out/source/MemberApprovalWorkSourceAdapter.kt` |
| `RECORD_CLOSING` | `sessionclosing/application/port/in/GetHostRecordClosingWorkSourceUseCase.kt`, `sessionclosing/application/service/HostRecordClosingWorkSourceService.kt`, `sessionclosing/application/port/out/HostRecordClosingWorkSourceQueryPort.kt`, `sessionclosing/adapter/out/persistence/JdbcHostRecordClosingWorkSourceAdapter.kt` | `hostworkspace/adapter/out/source/RecordClosingWorkSourceAdapter.kt` |
| `INVITATION_EXPIRY` | `auth/application/port/in/GetHostInvitationExpiryWorkSourceUseCase.kt`, `auth/application/service/HostInvitationExpiryWorkSourceService.kt`, `auth/application/port/out/HostInvitationExpiryWorkSourceQueryPort.kt`, `auth/adapter/out/persistence/JdbcHostInvitationExpiryWorkSourceAdapter.kt` | `hostworkspace/adapter/out/source/InvitationExpiryWorkSourceAdapter.kt` |
| `NOTIFICATION_FAILURE` | `notification/application/port/in/GetHostNotificationFailureWorkSourceUseCase.kt`, `notification/application/service/HostNotificationFailureWorkSourceService.kt`, `notification/application/port/out/HostNotificationFailureWorkSourceQueryPort.kt`, `notification/adapter/out/persistence/JdbcHostNotificationFailureWorkSourceAdapter.kt` | `hostworkspace/adapter/out/source/NotificationFailureWorkSourceAdapter.kt` |

All five translations live outside `hostworkspace.application`; therefore Stage 4 adds no application feature edge and does not edit either architecture debt baseline. `architectureTest` must prove the baseline edge set is unchanged, no reverse application edge exists, and no adapter-to-adapter import appears.

---

### Task 0: Verify the Proposed ADR and inventory source facts

**Files:**
- Verify: `docs/development/adr/0048-host-lifecycle-operating-room-composition.md`
- Read: manual notification, membership approval, invitation, session closing and Stage 1 contracts.

- [ ] **Step 1:** Confirm the fixed source types, key `{type}:{resourceId}:{revision-or-version}`, derived completion, deferral expiry, 30-day retention and privacy allowlist still match the repository. If they do not, stop the code task and report the authority conflict instead of silently changing the ADR.
- [ ] **Step 2:** Run `git diff --check` on the ADR before code.
- [ ] **Step 3:** Run `command -v corepack || true`; use and record `npx --yes corepack@0.35.0 pnpm` when it is absent, as in the reviewed checkout.

### Task 1: Register architecture and persist work-item deferrals

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V62__host_workbox_deferrals_and_snapshots.sql`. Recheck the migration tail before implementation; if another merged migration already owns V62, renumber this file to the next free integer and update the plan in the same commit.
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/domain/HostWorkItem.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostWorkboxModels.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/in/HostWorkboxUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostWorkboxPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostWorkboxAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/domain/HostWorkItemTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostWorkboxAdapterTest.kt`

**Schema core:**

```sql
create table host_work_item_deferrals (
  club_id char(36) not null,
  host_membership_id char(36) not null,
  work_item_key varchar(255) character set ascii collate ascii_bin not null,
  deferred_until datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (club_id, host_membership_id, work_item_key),
  key host_work_item_deferrals_expiry_idx (club_id, host_membership_id, deferred_until),
  constraint host_work_item_deferrals_club_fk
    foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_work_item_deferrals_host_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id) on delete cascade,
  constraint host_work_item_deferrals_key_check
    check (char_length(work_item_key) between 1 and 255)
);

create table host_workbox_snapshots (
  id char(36) primary key,
  club_id char(36) not null,
  host_membership_id char(36) not null,
  state varchar(20) not null,
  filter_fingerprint char(64) character set ascii collate ascii_bin not null,
  schema_version int not null,
  evaluated_at datetime(6) not null,
  source_availability_json json not null,
  expires_at datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  key host_workbox_snapshots_expiry_idx (expires_at),
  constraint host_workbox_snapshots_host_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id) on delete cascade
);

create table host_workbox_snapshot_items (
  snapshot_id char(36) not null,
  ordinal int not null,
  work_item_key varchar(255) character set ascii collate ascii_bin not null,
  projection_json json not null,
  primary key (snapshot_id, ordinal),
  unique key host_workbox_snapshot_item_key (snapshot_id, work_item_key),
  constraint host_workbox_snapshot_items_snapshot_fk
    foreign key (snapshot_id) references host_workbox_snapshots(id) on delete cascade
);
```

- [ ] **Step 1:** RED architecture inventory verifies Stage 3's `hostworkspace` workflow/read aggregate, requires its application/domain packages to have zero cross-feature imports, and forbids foreign persistence-adapter imports. Assert both application feature-dependency debt baselines remain byte-for-byte unchanged.
- [ ] **Step 2:** RED tests for valid authoritative keys, max length, future-only defer, exact club+host membership ownership, overwrite, expiry and cross-club isolation.
- [ ] **Step 3:** Add the exact deferral and immutable snapshot tables/FKs/checks above. The persistence adapter deletes expired deferrals older than 30 days and snapshots after expiry in bounded indexed batches; `deferred_until <= evaluatedAt` is returned as NOW even before physical cleanup.
- [ ] **Step 4:** Run `architectureTest` and the two named migration/domain tests; implement persistence ports/adapters and commit. Deferral routes do not exist until Task 5, so their security registration/tests belong there.

### Task 2: Extend manual notifications with editable, snapshot-bound copy

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V63__manual_notification_custom_copy_snapshot.sql` after rechecking the migration tail.
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationAudienceQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationPreviewStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationConfirmStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `front/features/host/api/host-contracts.ts`, `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-notification-composer-controller.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer.tsx`, `manual-notification-preview.tsx`, `manual-notification-workbench.tsx`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`
- Modify: `front/features/host/api/host-api.test.ts`, `front/features/host/ui/notifications/host-notification-composer.test.tsx`, `manual-notification-preview.test.tsx`, `manual-notification-workbench.test.tsx`, `front/features/host/route/host-notification-composer-controller.test.tsx`, and `front/tests/e2e/manual-notifications.spec.ts`.
- Modify: `front/scripts/export-zod-fixtures.ts`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
- Create/update: `front/tests/unit/__fixtures__/zod-schemas/manual-notification-options.json`, `manual-notification-preview.json`, `manual-notification-confirm.json`, and `manual-notification-dispatch-list.json`.

- [ ] **Step 1:** RED contract/service/persistence tests for editable subject/body validation, canonical content hash, exact copy echoed in preview receipt, `scheduleRevision`, selected target snapshot revision/hash, preview expiry and no-send-on-preview.
- [ ] **Step 2:** Extend `ManualNotificationSelection` additively; preview persists exact subject/body, content hash, schedule revision, target membership snapshot and eligibility fingerprint without email/token/provider body.
- [ ] **Step 3:** Confirm locks/re-reads current schedule revision and ACTIVE/eligible selected memberships. Drift returns controlled `409 MANUAL_NOTIFICATION_PREVIEW_STALE` without outbox/dispatch and requires a new preview.
- [ ] **Step 4:** Preserve duplicate/resend, idempotency, unknown outcome and reconciliation. Opening, selecting or editing never sends.
- [ ] **Step 5:** Run `HostManualNotificationServiceTest`, `JdbcManualNotificationDispatchAdapterTest`, `HostNotificationControllerTest`, composer/UI tests and local-safe E2E; commit. Actual external email is not run.

### Task 3: Add dedicated privacy-safe person detail API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostPersonDetailModels.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/in/GetHostPersonDetailUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostPersonDetailQueryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostPersonDetailService.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostPersonDetailAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostPersonDetailController.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostPersonCursorCodec.kt`
- Create: the three exact server tests below plus `front/features/host/api/host-person-api.test.ts` and `front/features/host/queries/host-person-queries.test.ts`.
- Create: `front/features/host/api/host-person-contracts.ts`, `host-person-api.ts`
- Create: `front/features/host/queries/host-person-queries.ts`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostPersonDetailServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/api/HostPersonDetailControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostPersonDetailAdapterTest.kt`
- Create: `front/tests/unit/__fixtures__/host-person-detail.json`
- Create: `front/tests/unit/__fixtures__/zod-schemas/host-person-detail.json`
- Modify: `front/scripts/export-zod-fixtures.ts`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`

**API:**

```text
GET /api/host/people/{membershipId}?attendanceCursor=...&limit=20
```

The allowlist is membership ID, displayName, avatarKey, membership status/role, coarse `lastClubAccessAt`, current schedule state/revision/time, RSVP, and a server-cursor attendance page. It excludes userId, email, auth sessions and page history.

- [ ] **Step 1:** RED active-HOST, URL club scope, cross-club/not-found/authority-loss, inactive lifecycle, forbidden-key and no client-list-scan tests.
- [ ] **Step 2:** Add purpose-signed attendance cursor tests for first/continuation/last, tamper, club/host/person mismatch, expiry/key rotation and no-gap/no-duplicate.
- [ ] **Step 3:** Implement the aggregate through hostworkspace-owned query ports/JDBC, not foreign persistence adapters, and add generic BFF GET proof.
- [ ] **Step 4:** Export/update strict fixtures and commit.

### Task 4: Implement named invitation links and club settings vertical slices

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V64__named_host_invitation_links.sql` and `V65__host_club_settings_and_commands.sql` after rechecking the migration tail.
- Create: `server/src/main/kotlin/com/readmates/auth/application/model/HostInvitationLinkModels.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/ManageHostInvitationLinksUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/HostInvitationLinkStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/service/HostInvitationLinkService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcHostInvitationLinkStoreAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/HostInvitationLinkController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthWebUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/InviteTokenFormat.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthFlowContextRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/model/HostClubSettingsModels.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/in/ManageHostClubSettingsUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/HostClubSettingsStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/HostClubSettingsService.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcHostClubSettingsAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/HostClubSettingsController.kt`
- Modify: auth membership lifecycle ports/services for co-host management.
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt` and focused security tests.
- Create: `front/features/host/api/host-invitation-link-contracts.ts`, `host-invitation-link-api.ts`, `host-club-settings-contracts.ts`, `host-club-settings-api.ts`
- Create: `front/features/host/queries/host-invitation-link-queries.ts`, `host-club-settings-queries.ts`
- Create: `front/features/host/route/host-settings-route.tsx`
- Create: `front/features/host/ui/settings/host-invitation-links.tsx`, `host-club-settings.tsx`, `host-club-close-dialog.tsx`
- Create: colocated frontend tests plus `server/src/test/kotlin/com/readmates/auth/application/service/HostInvitationLinkServiceTest.kt`, `server/src/test/kotlin/com/readmates/auth/api/HostInvitationLinkControllerTest.kt`, `server/src/test/kotlin/com/readmates/club/application/service/HostClubSettingsServiceTest.kt`, and `server/src/test/kotlin/com/readmates/club/api/HostClubSettingsControllerTest.kt`.
- Modify: `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`, `server/src/test/kotlin/com/readmates/auth/application/AcceptInvitationUseCaseTest.kt`, and OAuth return/success-handler tests.
- Modify: `front/features/auth/api/auth-api.ts`, `front/features/auth/model/invite-oauth.ts`, `front/features/auth/route/invite-route.tsx`, and their tests so the existing public invite page previews both email invites and named links without exposing link internals.
- Modify: `front/tests/unit/cloudflare-bff.test.ts` and `front/tests/e2e/google-auth-invite-flow.spec.ts`.
- Create: `front/tests/unit/__fixtures__/host-invitation-links.json`, `host-club-settings.json`, `zod-schemas/host-invitation-link-list.json`, and `zod-schemas/host-club-settings.json`.
- Create: `front/tests/unit/__fixtures__/zod-schemas/host-invitation-link-history.json`, `host-club-close-preview.json`, and `host-club-close-result.json`.
- Modify: `front/scripts/export-zod-fixtures.ts`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`

**Named-link persistence and HTTP contract:**

`V64` creates `host_invitation_links` with `id`, `club_id`, `created_by_membership_id`, `name`, unique `token_hash`, `status ACTIVE|PAUSED|EXHAUSTED|EXPIRED`, `max_uses`, `used_count`, `expires_at`, monotonic `revision`, and timestamps. It also creates append-only `host_invitation_link_events` with link/club/revision, allowlisted action and before/after settings, actor membership, idempotency key and occurred time. Both tables cascade only with club deletion; v1 does not persist raw tokens, URLs, recipient email or OAuth identity. Create returns the raw share path once; list/history never return it or the hash. A lost token requires creating a replacement link rather than revealing stored secret material.

```text
GET  /api/host/invitation-links?cursor=...&limit=20
POST /api/host/invitation-links
     {name,maxUses,expiresAt,idempotencyKey}
     -> 201 {link,oneTimeSharePath,receipt}
PUT  /api/host/invitation-links/{linkId}
     {expectedRevision,name,maxUses,expiresAt,status,idempotencyKey}
GET  /api/host/invitation-links/{linkId}/history?cursor=...&limit=20

GET  /api/clubs/{clubSlug}/invitations/{token}
GET  /api/invitations/{token}                 # compatibility canonical redirect data
GET  /oauth2/authorization/google?inviteToken=...&returnTo=...
```

The existing public preview routes discriminate email invitations from `lnk_`-prefixed named tokens through `InviteTokenFormat` and return one common redacted preview shape. Named-link consumption occurs only in the existing signed OAuth flow: `ReadmatesOAuthSuccessHandler` passes the token and state-bound expected club to `AcceptGoogleInvitationUseCase`; the service locks the link row, rechecks ACTIVE/not-expired/`used_count < max_uses`, idempotently reuses an already-active membership without consuming a use, otherwise creates one ACTIVE MEMBER and increments `used_count` plus history in the same transaction. A host-issued named link bypasses open-join approval policy just like the existing email invitation; it can never grant HOST. The legacy public password-accept POST remains `410 GONE` and no new unauthenticated accept mutation is introduced.

Management POST/PUT require active HOST, trusted BFF and allowed origin, use current mutation identity/idempotency rules, and never log/echo raw tokens after the one-time create response. Preview/OAuth endpoints retain current public rate limit, signed return-state club binding and OAuth precedence. Concurrent last-use accepts serialize on the link row: exactly one consumes the last use; the loser receives controlled `INVITATION_LINK_EXHAUSTED` before membership mutation.

- [ ] **Step 1:** Named-link RED matrix: exact schema and endpoints above; one-time token disclosure/hash-only persistence; name, max uses/used count, expiry, extend, stop/resume, history, monotonic revision, active HOST, cross-club, idempotency, token/URL privacy and cursor paging. Preserve the existing named-email invitation flow as a separate compatibility feature.
- [ ] **Step 2:** RED public preview/OAuth acceptance: scoped/unscoped canonical preview, signed expected-club binding, email-vs-link token discrimination, email invitation behavior unchanged, direct ACTIVE MEMBER only, never HOST, already-active idempotency, paused/expired/exhausted denial, concurrent last-use single winner, token redaction and legacy password POST still GONE.
- [ ] **Step 3:** Settings RED matrix: club name, approval policy, default timezone, schedule reminder, record-publication default, co-host management, change history, exact capability/role and optimistic club revision.
- [ ] **Step 4:** Club-end RED matrix: preview/confirm, exact actor+club revision+effect hash, idempotent receipt, stale/authority conflict and local-safe fixture. Tests never end a real club and no generic destructive endpoint is added.
- [ ] **Step 5:** Implement persistence/API/BFF/frontend and enumerate exact CSRF/trusted-BFF rules for management POST/PUT and club-setting mutations; public preview/OAuth retain their existing security chain. Run controller/service/persistence/concurrency/OAuth/BFF/front/E2E tests and commit migrations and slices in focused commits.

### Task 5: Build aggregate workbox service and API

**Files:**
- Create: the five source-owned input/service/output/persistence files and five `hostworkspace/adapter/out/source/*WorkSourceAdapter.kt` translators listed in **Source ownership and allowed dependency direction**.
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostWorkSourcePorts.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostWorkboxService.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostWorkboxController.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostWorkboxErrorHandler.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostWorkboxCursorCodec.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostWorkboxServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/api/HostWorkboxControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostWorkboxAdapterTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/api/HostWorkboxBffSecurityTest.kt`
- Create: `HostScheduleSeenWorkSourceServiceTest.kt`, `HostMemberApprovalWorkSourceServiceTest.kt`, `HostRecordClosingWorkSourceServiceTest.kt`, `HostInvitationExpiryWorkSourceServiceTest.kt`, and `HostNotificationFailureWorkSourceServiceTest.kt` in each source feature's matching `server/src/test/kotlin/com/readmates/<feature>/application/service/` package.
- Modify: `front/scripts/export-zod-fixtures.ts`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
- Create: `front/tests/unit/__fixtures__/zod-schemas/host-workbox-page.json` and `host-workbox-deferral-receipt.json`.

**API:**

```text
GET    /api/host/workbox?state=NOW|DEFERRED|COMPLETED&limit=20&cursor=...
PUT    /api/host/workbox/items/{urlEncodedWorkItemKey}/deferral
       {"deferredUntil":"...+00:00"}
DELETE /api/host/workbox/items/{urlEncodedWorkItemKey}/deferral
```

Each item returns allowlisted `key,type,state,title,description,count,dueAt,deferredUntil,resolvedAt,destinationHref,receiptSummary`.

- [ ] **Step 1:** RED each source owner in fixed order for the normative table's exact identity/generation/NOW/completed/dueAt/resolvedAt/receipt projection and typed partial availability. Then RED aggregate priority, zero-as-data, defer/auto-return, derived completion and 30-day retention.
- [ ] **Step 2:** RED one `REPEATABLE_READ` first-page transaction: capture one `evaluatedAt`; invoke `SCHEDULE_UNSEEN → MEMBER_APPROVAL → RECORD_CLOSING → INVITATION_EXPIRY → NOTIFICATION_FAILURE`; normalize and sort by `(priority, dueAt nulls last, type, resourceId, sourceGeneration)`; persist immutable allowlisted rows and typed source availability under one snapshot UUID/schema version; then return the first page. Expected source unavailability is a typed result, not a thrown SQL failure.
- [ ] **Step 3:** Create `HostWorkboxCursorCodec` and typed key configuration. Bind purpose, club ID, host membership ID, state/filter fingerprint, immutable snapshot generation/schema version, `evaluatedAt`, last ordinal/sort tuple, expiry and key version. Continuations read only the owned unexpired snapshot. Tamper/cross-club/cross-host/cross-state/filter/expiry/key rotation return controlled restart errors.
- [ ] **Step 4:** Require active HOST and URL club context. Destination href is scoped app-relative and contains no private value. Register exact PUT/DELETE deferral CSRF ignore rules and prove valid-secret+origin, missing/invalid secret, invalid origin and forged browser internal-header cases in `HostWorkboxBffSecurityTest`.
- [ ] **Step 5:** Add concurrent mutation tests proving an existing snapshot has no gap/duplicate and a new first page observes the mutation; add expiry/restart, source-isolated partial failure, forbidden-key and bounded cleanup tests; commit.

### Task 6: Add frontend workbox contract, query and model

**Files:**
- Create: `front/features/host/api/host-workbox-contracts.ts`
- Create: `front/features/host/api/host-workbox-api.ts`
- Create: `front/features/host/queries/host-workbox-queries.ts`
- Create: `front/features/host/model/host-workbox-model.ts`
- Create: `front/features/host/api/host-workbox-api.test.ts`, `front/features/host/queries/host-workbox-queries.test.ts`, and `front/features/host/model/host-workbox-model.test.ts`.
- Create: `front/tests/unit/__fixtures__/host-workbox-page.json`
- Create: `front/tests/unit/__fixtures__/zod-schemas/host-workbox-page.json`

- [ ] **Step 1:** RED strict Zod tests for all states/types, partial warnings, receipt and cursor.
- [ ] **Step 2:** Query keys include club slug + state + cursor. Deferral invalidates every state and operating-room composition.
- [ ] **Step 3:** Pure model maps types to approved Korean labels/destinations without hiding zero counts.
- [ ] **Step 4:** Add workbox root to authority-loss purge and commit.
- [ ] **Step 5:** For every new Stage 4 response, add a literal sample to `export-zod-fixtures.ts` and an endpoint-backed case in both server contract classes. Run the exporter, stage the intended JSON, rerun it, and require `git diff --exit-code -- front/tests/unit/__fixtures__`; then run both `com.readmates.contract` classes through `integrationTest`.

### Task 7: Build HostWorkbox and review-first schedule notification

**Files:**
- Create: `front/features/host/ui/workbox/host-workbox.tsx`
- Create: `front/features/host/ui/workbox/host-work-item.tsx`
- Create: `front/features/host/ui/workbox/operation-receipt.tsx`
- Create: `front/features/host/ui/workbox/host-workbox.css`
- Create: unit/CT tests.
- Modify: operating-room route to render it.
- Create: `front/features/host/route/host-schedule-review-route.tsx` and route element.

- [ ] **Step 1:** RED tests for tabs/counts, retryable partial source, empty, overdue, defer/undo and receipt pending/success/partial/failure/unknown.
- [ ] **Step 2:** Render hairline rail at desktop 68/32 and below preparation at <=1199px.
- [ ] **Step 3:** Schedule unseen opens `/sessions/:id/schedule-review` only for availability `AVAILABLE`; select STALE/UNSEEN, show excluded CURRENT, edit subject/body, then use the snapshot-bound manual notification preview→confirm contract from Task 2.
- [ ] **Step 4:** Sending never happens on open/selection. Confirm/partial/unknown receipts remain visible and invalidate workbox/notification/detail.
- [ ] **Step 5:** `HostNextAction` and `HostWorkItem` submit the server-returned authoritative key verbatim to deferral mutation; no locally reconstructed key is accepted.
- [ ] **Step 6:** Commit.

### Task 8: Finish meetings, people, records and settings destinations

**Files:**
- Modify/reuse: `front/features/host/ui/meeting-list/**` and `host-meeting-list-*`.
- Modify/reuse: `front/features/host/ui/members/**` and `host-members-*`.
- Modify/reuse: `front/features/host/ui/meeting-ledger/**` and `host-session-record-*`.
- Create: `front/features/host/route/host-person-detail-route.tsx`
- Create: `front/features/host/ui/members/host-person-detail.tsx`
- Create: `front/features/host/route/host-settings-route.tsx`
- Create/modify route tests and CT.

- [ ] **Step 1:** Meetings: scheduled/past, list/calendar affordance, new/edit links and status; no fake calendar data.
- [ ] **Step 2:** People: approval and active members use `AvatarChip`; detail consumes Task 3's dedicated API and shows schedule state/revision/time, RSVP, cursor attendance history and membership actions separately. It never scans the paged list.
- [ ] **Step 3:** Person detail renders Stage 1 `lastClubAccessAt` as coarse `최근 접속` or `접속 기록 없음`, with privacy copy that page 열람 기록은 수집하지 않음을 설명한다. Never map user login/auth-session timestamps.
- [ ] **Step 4:** Records: closing state, record status, publication history, exact detail and cursor continuation.
- [ ] **Step 5:** Settings: render Task 4 named links, existing email invitations as a clearly separate compatibility section, club settings, co-hosts, audit history and guarded club-end preview/confirm with permission-limited reasons. Notification ledger remains utility.
- [ ] **Step 6:** Add CT for 10/11/12/13/14/17 and commit.

### Task 9: BFF, server and browser verification

- [ ] **Step 1:** Add generic BFF GET/PUT/DELETE proxy coverage to `front/tests/unit/cloudflare-bff.test.ts` with club/error preservation.
- [ ] **Step 2:** Run `architectureTest`, server CI and integration tests; run Zod export plus contract integration tests and confirm generated fixture diff is intentional.
- [ ] **Step 3:** Run frontend lint/test/build.
- [ ] **Step 4:** Run E2E: NOW→DEFERRED→expiry→NOW, source resolved→COMPLETED, DRAFT unavailable, schedule preview then revision/eligibility conflict, partial/unknown reconciliation, approval, person cross-club/privacy, invitation link/settings/history/authority and both cursor continuations.
- [ ] **Step 5:** Record real email/provider delivery as `not measured`; it is not required for local completion.
