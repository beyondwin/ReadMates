# Host Session Record Revision And Notification Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosts find and edit every past session artifact while staging public record changes, preserving immutable revisions, and requiring an explicit SEND/SKIP decision before host-triggered notifications.

**Architecture:** Add a workflow-side `sessionrecord` server slice that owns canonical record snapshots, one active draft per session, immutable revisions, apply previews, atomic live replacement, and host action notification decisions. Keep normalized session/publication/highlight/review/feedback tables as live read sources, reuse the existing session-import validator, and extend the route-first host frontend with a session ledger, a staged editor, history, and one confirmation dialog shared by record apply and next-book publication.

**Tech Stack:** Kotlin 2.x, Spring Boot, Spring JDBC, MySQL 8/Flyway, React 19, React Router 7, TanStack Query 5, TypeScript, Zod, Vitest, Playwright, pnpm 11.13.1.

## Global Constraints

- Keep browser API traffic on same-origin `/api/bff/**`; never expose server secrets through `VITE_*`.
- Keep frontend dependency direction `src/app -> src/pages -> features -> shared`; host UI receives props and callbacks and does not import API/query/route modules.
- Keep server direction `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence`.
- Require active HOST membership and include `club_id` in every session, draft, revision, preview, decision, and history query.
- Basic information and attendance save immediately and write metadata-only audit rows; they do not gain automatic rollback.
- Summary, visibility, highlights, one-line reviews, and feedback Markdown form one staged record snapshot and apply atomically.
- Store final record content only; never persist AI transcript, evidence, prompt, provider response, raw provider error, email, meeting credential, token, or raw request body in revision/audit/preview/decision rows.
- SEND/SKIP has no default. A host-triggered notification mutation without a valid preview and explicit decision fails closed.
- Do not change scheduled `SESSION_REMINDER_DUE`, member `REVIEW_PUBLISHED`, or host-only `AI_GENERATION_READY` approval behavior.
- Preserve `{items, nextCursor}` cursor-page contracts.
- Release tags remain authoritative; do not add a `VERSION` file.
- Use the root-pinned package manager through `corepack pnpm`.

---

## Scope And Dependency Check

This is one coupled vertical slice, not three independent products. The draft and immutable revision model is required before AI/JSON can stop writing live records; the notification gate must exist before the apply and visibility mutations can fail closed; the frontend cannot safely ship until both contracts are additive. Split execution by task, but do not ship Tasks 9–12 against a server that has not completed Tasks 1–8.

```text
Task 1 schema
  -> Task 2 snapshot contract
  -> Task 3 draft/revision storage
  -> Task 4 notification gate
  -> Task 5 atomic apply
  -> Task 6 AI/JSON draft integration
  -> Task 7 ledger/history/audit reads
  -> Task 8 server web/capability boundary
  -> Task 9 frontend data layer
  -> Task 10 ledger/navigation/dashboard
  -> Task 11 editor/history
  -> Task 12 confirmation flows
  -> Task 13 E2E/docs/full verification
```

## File Structure Map

### Server: new `sessionrecord` workflow slice

| Path | Responsibility |
| --- | --- |
| `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt` | Canonical snapshot, draft, revision, preview, decision, history models and enums |
| `server/src/main/kotlin/com/readmates/sessionrecord/application/port/in/SessionRecordUseCases.kt` | Draft, apply, restore, history, and capability use-case interfaces |
| `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordPorts.kt` | Snapshot/live/draft/revision/audit/preview persistence interfaces |
| `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftService.kt` | Lazy baseline and optimistic draft lifecycle |
| `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt` | Apply preview, transaction, revision, decision, optional outbox |
| `server/src/main/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryService.kt` | Unified typed history page |
| `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt` | MySQL implementation of all session-record ports |
| `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/HostSessionRecordController.kt` | Record editor/draft/apply/history/restore HTTP contract |
| `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordWebDtos.kt` | Request/response mapping only |
| `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandler.kt` | Typed `{code,message,status}` mapping |

### Server: existing slices

| Path | Responsibility of change |
| --- | --- |
| `server/src/main/resources/db/mysql/migration/V39__host_session_record_revision_and_notification_confirmation.sql` | Five new tables, constraints, indexes |
| `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt` | Separate validation from live replacement and remove unconditional notification side effect |
| `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt` | Save validated AI result to the shared draft contract |
| `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt` | Require confirmed decision for first member-visible publication |
| `server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt` | Write basic-info audit |
| `server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt` | Write attendance audit |
| `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt` | Search/filter/enriched ledger projection |
| `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt` | Add `SESSION_RECORD_UPDATED` |
| `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt` | Add `HOST_CONFIRMED` and preference mapping |
| `server/src/main/kotlin/com/readmates/notification/application/service/HostActionNotificationGateService.kt` | Preview, validate, and finalize SEND/SKIP |
| `server/src/main/kotlin/com/readmates/notification/application/port/out/HostActionNotificationPort.kt` | Target preview and decision persistence contract |
| `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcHostActionNotificationAdapter.kt` | Counts, preview tokens, decisions, joined ledger source |

### Frontend

| Path | Responsibility |
| --- | --- |
| `front/features/host/api/host-session-record-contracts.ts` | New ledger/editor/draft/apply/history/capability contracts and Zod schemas |
| `front/features/host/api/host-session-record-api.ts` | BFF calls for the new server surface |
| `front/features/host/queries/host-session-record-queries.ts` | Query keys, query options, mutations, invalidation |
| `front/features/host/model/host-session-ledger-model.ts` | URL filters and pure row/badge mapping |
| `front/features/host/model/host-session-record-editor-model.ts` | Pure draft/diff/validation/confirmation view models |
| `front/features/host/route/host-session-ledger-data.ts` | Ledger loader and URL state |
| `front/features/host/route/host-session-ledger-route.tsx` | Query-to-UI composition |
| `front/features/host/ui/host-session-ledger.tsx` | Desktop table and mobile cards |
| `front/features/host/ui/session-editor/session-record-draft-panel.tsx` | Manual record editor and draft autosave state |
| `front/features/host/ui/session-editor/session-history-panel.tsx` | Audit/revision history and restore-to-draft |
| `front/features/host/ui/session-editor/host-action-confirmation-dialog.tsx` | Accessible desktop dialog/mobile sheet with required SEND/SKIP radio |

### Ownership Rule During Parallel Execution

Do not run Tasks 4 and 5 in parallel because both touch notification decision interfaces. Do not run Tasks 5 and 6 in parallel because both touch `SessionImportService` and AI commit semantics. Tasks 10–12 all touch host editor/navigation and must run sequentially. Tasks 1–8 may use the server build output; run their Gradle tests serially.

## Requirement Traceability

| Requirement | Implemented by |
| --- | --- |
| Past-session ledger and dashboard attention | Tasks 7, 9, 10 |
| Edit basic info and attendance with audit | Tasks 7, 11 |
| Stage all public record sections | Tasks 2, 3, 6, 9, 11 |
| Immutable revision and restore-to-draft | Tasks 1–3, 5, 11 |
| Required SEND/SKIP before host-triggered notifications | Tasks 4, 5, 8, 12 |
| Next-book confirmation | Tasks 4, 8, 12 |
| First feedback and later record-update event semantics | Tasks 4, 5, 13 |
| Concurrency, expiry, idempotency, rollback | Tasks 3–5, 8, 12 |
| Desktop/mobile accessibility | Tasks 10–12 |
| Scheduler/member/AI-system regression safety | Tasks 4, 6, 13 |

---

### Task 1: Create The MySQL Persistence Contract

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V39__host_session_record_revision_and_notification_confirmation.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Interfaces:**
- Consumes: existing composite foreign keys `sessions(id, club_id)` and `memberships(id, club_id)`.
- Produces: `session_record_drafts`, `session_record_revisions`, `host_session_change_audit`, `host_action_notification_previews`, and `host_action_notification_decisions`.

- [ ] **Step 1: Write the failing Flyway contract test**

Add a test that asserts the five tables, required composite FKs, unique `(club_id, session_id, version)`, one active draft per session, SHA-256 length checks, non-negative count checks, and decision enum checks:

```kotlin
@Test
fun `mysql creates host session record revision and notification confirmation tables`() {
    val tables =
        jdbcTemplate.queryForList(
            """
            select table_name
            from information_schema.tables
            where table_schema = database()
              and table_name in (
                'session_record_drafts',
                'session_record_revisions',
                'host_session_change_audit',
                'host_action_notification_previews',
                'host_action_notification_decisions'
              )
            """.trimIndent(),
            String::class.java,
        ).toSet()

    assertEquals(
        setOf(
            "session_record_drafts",
            "session_record_revisions",
            "host_session_change_audit",
            "host_action_notification_previews",
            "host_action_notification_decisions",
        ),
        tables,
    )
    assertEquals(
        listOf("club_id", "session_id", "version"),
        indexColumns("session_record_revisions", "session_record_revisions_version_uk"),
    )
    assertEquals(
        listOf("session_id", "club_id"),
        foreignKeyColumns("session_record_drafts", "session_record_drafts_session_fk"),
    )
}
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.support.MySqlFlywayMigrationTest.mysql creates host session record revision and notification confirmation tables'
```

Expected: FAIL because the five V39 tables do not exist.

- [ ] **Step 3: Add the migration**

Use `char(36)` UUID columns, `longtext` snapshots, `bigint` revisions, UTC `datetime(6)`, explicit checks, and composite FKs. The key declarations must be:

```sql
create table session_record_drafts (
  session_id char(36) not null,
  club_id char(36) not null,
  base_live_revision bigint not null,
  draft_revision bigint not null,
  source varchar(30) not null,
  restored_from_revision_id char(36),
  snapshot_json longtext not null,
  snapshot_sha256 char(64) not null,
  updated_by_membership_id char(36) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (session_id, club_id),
  constraint session_record_drafts_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_record_drafts_host_fk foreign key (updated_by_membership_id, club_id) references memberships(id, club_id),
  constraint session_record_drafts_source_check check (source in ('MANUAL','JSON_IMPORT','AI_GENERATED','RESTORED')),
  constraint session_record_drafts_revision_check check (base_live_revision >= 0 and draft_revision > 0),
  constraint session_record_drafts_sha_check check (length(snapshot_sha256) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table session_record_revisions (
  id char(36) not null,
  session_id char(36) not null,
  club_id char(36) not null,
  version bigint not null,
  source varchar(30) not null,
  restored_from_revision_id char(36),
  snapshot_json longtext not null,
  snapshot_sha256 char(64) not null,
  applied_by_membership_id char(36) not null,
  applied_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key session_record_revisions_version_uk (club_id, session_id, version),
  key session_record_revisions_history_idx (club_id, session_id, applied_at desc, id desc),
  constraint session_record_revisions_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_record_revisions_host_fk foreign key (applied_by_membership_id, club_id) references memberships(id, club_id),
  constraint session_record_revisions_restore_fk foreign key (restored_from_revision_id) references session_record_revisions(id),
  constraint session_record_revisions_source_check check (source in ('BASELINE','MANUAL','JSON_IMPORT','AI_GENERATED','RESTORED')),
  constraint session_record_revisions_version_check check (version > 0),
  constraint session_record_revisions_sha_check check (length(snapshot_sha256) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table session_record_drafts
  add constraint session_record_drafts_restore_fk
    foreign key (restored_from_revision_id) references session_record_revisions(id);
```

Add the audit and notification confirmation tables in this order so every foreign key can be installed without disabling checks:

```sql
create table host_session_change_audit (
  id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  actor_membership_id char(36) not null,
  action_type varchar(40) not null,
  changed_fields_json longtext not null,
  request_id varchar(100),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key host_session_change_audit_history_idx (club_id, session_id, created_at desc, id desc),
  key host_session_change_audit_actor_idx (club_id, actor_membership_id, created_at desc),
  constraint host_session_change_audit_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint host_session_change_audit_actor_fk foreign key (actor_membership_id, club_id) references memberships(id, club_id),
  constraint host_session_change_audit_fields_json_check check (json_valid(changed_fields_json)),
  constraint host_session_change_audit_action_check check (action_type in ('BASIC_INFO_UPDATED','ATTENDANCE_UPDATED'))
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_action_notification_previews (
  id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  host_membership_id char(36) not null,
  action_type varchar(40) not null,
  event_type varchar(60) not null,
  request_hash char(64) not null,
  expected_draft_revision bigint,
  expected_live_revision bigint not null,
  target_count int not null,
  expected_in_app_count int not null,
  expected_email_count int not null,
  excluded_count int not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  consumed_decision_id char(36),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key host_action_notification_previews_host_idx (club_id, host_membership_id, expires_at),
  key host_action_notification_previews_session_idx (club_id, session_id, created_at desc),
  constraint host_action_notification_previews_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint host_action_notification_previews_host_fk foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint host_action_notification_previews_action_check check (action_type in ('RECORD_APPLY','VISIBILITY_UPDATE')),
  constraint host_action_notification_previews_event_check check (event_type in ('NEXT_BOOK_PUBLISHED','FEEDBACK_DOCUMENT_PUBLISHED','SESSION_RECORD_UPDATED')),
  constraint host_action_notification_previews_hash_check check (length(request_hash) = 64),
  constraint host_action_notification_previews_revision_check check (
    expected_live_revision >= 0 and (expected_draft_revision is null or expected_draft_revision > 0)
  ),
  constraint host_action_notification_previews_counts_check check (
    target_count >= 0 and expected_in_app_count >= 0 and expected_email_count >= 0 and excluded_count >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_action_notification_decisions (
  id char(36) not null,
  preview_id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  host_membership_id char(36) not null,
  action_type varchar(40) not null,
  event_type varchar(60) not null,
  live_revision bigint not null,
  decision varchar(10) not null,
  target_count int not null,
  expected_in_app_count int not null,
  expected_email_count int not null,
  excluded_count int not null,
  event_id char(36),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key host_action_notification_decisions_preview_uk (preview_id),
  unique key host_action_notification_decisions_revision_uk (club_id, session_id, action_type, live_revision),
  key host_action_notification_decisions_history_idx (club_id, session_id, created_at desc, id desc),
  constraint host_action_notification_decisions_preview_fk foreign key (preview_id) references host_action_notification_previews(id),
  constraint host_action_notification_decisions_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint host_action_notification_decisions_host_fk foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint host_action_notification_decisions_event_fk foreign key (event_id, club_id) references notification_event_outbox(id, club_id),
  constraint host_action_notification_decisions_action_check check (action_type in ('RECORD_APPLY','VISIBILITY_UPDATE')),
  constraint host_action_notification_decisions_event_type_check check (event_type in ('NEXT_BOOK_PUBLISHED','FEEDBACK_DOCUMENT_PUBLISHED','SESSION_RECORD_UPDATED')),
  constraint host_action_notification_decisions_decision_check check (decision in ('SEND','SKIP')),
  constraint host_action_notification_decisions_revision_check check (live_revision >= 0),
  constraint host_action_notification_decisions_counts_check check (
    target_count >= 0 and expected_in_app_count >= 0 and expected_email_count >= 0 and excluded_count >= 0
  ),
  constraint host_action_notification_decisions_event_presence_check check (
    (decision = 'SEND' and event_id is not null) or (decision = 'SKIP' and event_id is null)
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table host_action_notification_previews
  add constraint host_action_notification_previews_decision_fk
    foreign key (consumed_decision_id) references host_action_notification_decisions(id),
  add constraint host_action_notification_previews_consumed_check
    check (
      (consumed_at is null and consumed_decision_id is null)
      or (consumed_at is not null and consumed_decision_id is not null)
    );
```

- [ ] **Step 4: Run the focused migration test**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Run all migration contract tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.support.MySqlFlywayMigrationTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V39__host_session_record_revision_and_notification_confirmation.sql server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
git commit -m "feat(server): add session record revision schema"
```

---

### Task 2: Define And Verify The Canonical Snapshot

**Files:**
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/model/SessionRecordModels.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordSnapshotCodec.kt`
- Create: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordSnapshotCodecTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**
- Consumes: `SessionRecordVisibility`.
- Produces: `SessionRecordSnapshot`, `SessionRecordDraft`, `SessionRecordRevision`, `SessionRecordEntry`, `SessionRecordSource`, and deterministic `SessionRecordSnapshotCodec`.

- [ ] **Step 1: Write the failing codec test**

```kotlin
@Test
fun `snapshot codec is deterministic and keeps membership attribution`() {
    val snapshot =
        SessionRecordSnapshot(
            visibility = SessionRecordVisibility.MEMBER,
            publicationSummary = "요약",
            highlights = listOf(SessionRecordEntry(memberId, "독자", "하이라이트")),
            oneLineReviews = listOf(SessionRecordEntry(memberId, "독자", "한줄평")),
            feedbackDocument = SessionRecordFeedbackDocument("feedback.md", "회차 피드백", "# 회차 피드백"),
        )

    val encoded = codec.encode(snapshot)

    assertEquals(snapshot, codec.decode(encoded.json))
    assertEquals(64, encoded.sha256.length)
    assertEquals(encoded, codec.encode(snapshot))
}
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodecTest'
```

Expected: FAIL because the `sessionrecord` types do not exist.

- [ ] **Step 3: Add exact models**

```kotlin
enum class SessionRecordSource { BASELINE, MANUAL, JSON_IMPORT, AI_GENERATED, RESTORED }
enum class SessionRecordStatus { NOT_STARTED, INCOMPLETE, COMPLETE }
enum class NotificationDecision { SEND, SKIP }

data class SessionRecordEntry(
    val membershipId: UUID,
    val authorDisplayName: String,
    val text: String,
)

data class SessionRecordFeedbackDocument(
    val fileName: String,
    val title: String,
    val markdown: String,
)

data class SessionRecordSnapshot(
    val schema: String = "readmates-session-record:v1",
    val visibility: SessionRecordVisibility,
    val publicationSummary: String,
    val highlights: List<SessionRecordEntry>,
    val oneLineReviews: List<SessionRecordEntry>,
    val feedbackDocument: SessionRecordFeedbackDocument,
)

data class EncodedSessionRecordSnapshot(val json: String, val sha256: String)
```

Implement `SessionRecordSnapshotCodec` with one injected Jackson `ObjectMapper`, `writeValueAsString`, `readValue`, and `Sha256.hex(json)`. Do not log JSON.

- [ ] **Step 4: Register the workflow slice**

Add `sessionrecord` as `ServerSliceType.WORKFLOW` with web package `com.readmates.sessionrecord.adapter.in.web..` and application package `com.readmates.sessionrecord.application..`. Extend the registry assertion to require `"sessionrecord"`.

- [ ] **Step 5: Run codec and architecture tests**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodecTest'
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat(server): define session record snapshots"
```

---

### Task 3: Implement Draft And Revision Persistence

**Files:**
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/port/in/SessionRecordUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftService.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapterTest.kt`

**Interfaces:**
- Consumes: codec and V39 tables.
- Produces:

```kotlin
interface ManageSessionRecordDraftUseCase {
    fun getEditor(host: CurrentMember, sessionId: UUID): SessionRecordEditor
    fun save(host: CurrentMember, command: SaveSessionRecordDraftCommand): SessionRecordDraft
    fun discard(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long)
    fun restore(host: CurrentMember, command: RestoreSessionRecordDraftCommand): SessionRecordDraft
}
```

- [ ] **Step 1: Write service tests for lazy creation, CAS, discard, and restore**

Cover these exact cases:

```kotlin
@Test fun `first save copies live content into draft revision one without creating history`()
@Test fun `save rejects stale expected draft revision without overwriting`()
@Test fun `discard requires the current draft revision`()
@Test fun `restore copies immutable revision into a new draft and leaves live unchanged`()
@Test fun `basic metadata drift marks draft live base stale`()
```

The stale tests must assert `SessionRecordException(SessionRecordError.DRAFT_STALE)` and unchanged fake-port state.

- [ ] **Step 2: Run the service tests and verify they fail**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionrecord.application.service.SessionRecordDraftServiceTest'
```

Expected: FAIL because use cases and service are missing.

- [ ] **Step 3: Implement the ports and service**

Define:

```kotlin
interface SessionRecordStorePort {
    fun loadLive(host: CurrentMember, sessionId: UUID, forUpdate: Boolean = false): LiveSessionRecord?
    fun loadDraft(host: CurrentMember, sessionId: UUID, forUpdate: Boolean = false): SessionRecordDraft?
    fun insertDraft(host: CurrentMember, live: LiveSessionRecord, encoded: EncodedSessionRecordSnapshot): SessionRecordDraft
    fun compareAndSetDraft(host: CurrentMember, command: SaveSessionRecordDraftCommand, encoded: EncodedSessionRecordSnapshot): SessionRecordDraft?
    fun deleteDraft(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long): Boolean
    fun loadRevision(host: CurrentMember, sessionId: UUID, revisionId: UUID): SessionRecordRevision?
}
```

`save` must lock or CAS on `(club_id, session_id, draft_revision)`, increment exactly once, and throw `DRAFT_STALE` when update count is zero. `restore` sets `source=RESTORED` and `restoredFromRevisionId` in draft metadata.

- [ ] **Step 4: Run the service tests**

Expected: PASS.

- [ ] **Step 5: Write and run JDBC integration tests**

Seed two clubs and prove same UUID/session references cannot cross club scope. Verify JSON round-trip, one active draft, CAS update count, revision ordering, and immutable revision rows.

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionrecord.adapter.out.persistence.JdbcSessionRecordAdapterTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/sessionrecord
git commit -m "feat(server): persist session record drafts"
```

---

### Task 4: Add The Host-Confirmed Notification Gate

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/domain/NotificationEventType.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventOutboxPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationEventService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryPlanningOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationPreferencesAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/HostActionNotificationPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/HostActionNotificationGateService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcHostActionNotificationAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/application/service/HostActionNotificationGateServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEmailTemplatesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationPreferencesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapterTest.kt`

**Interfaces:**
- Consumes: V39 preview/decision tables and existing notification target rules.
- Produces:

```kotlin
enum class HostConfirmedAction { NEXT_BOOK_PUBLISH, SESSION_RECORD_APPLY }
enum class NotificationDispatchSource { AUTOMATIC, MANUAL, HOST_CONFIRMED }

interface ConfirmHostActionNotificationUseCase {
    fun preview(host: CurrentMember, command: HostActionPreviewCommand): HostActionPreview
    fun prepare(host: CurrentMember, command: HostActionDecisionCommand): PreparedHostActionDecision
    fun complete(command: CompleteHostActionDecisionCommand): StoredHostActionDecision
}

interface RecordHostConfirmedNotificationEventUseCase {
    fun record(command: RecordHostConfirmedNotificationEventCommand): UUID
}
```

- [ ] **Step 1: Write failing gate tests**

Test:

```kotlin
@Test fun `preview stores only counts and a request hash`()
@Test fun `prepare rejects expired preview`()
@Test fun `prepare rejects another host or changed revisions`()
@Test fun `send requires a nonzero eligible audience`()
@Test fun `complete skip records a decision without an event id`()
@Test fun `completed preview returns the stored decision idempotently`()
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.service.HostActionNotificationGateServiceTest'
```

Expected: FAIL because gate types are missing.

- [ ] **Step 3: Implement preview, prepare, and complete**

Bind `selectionHash` to:

```kotlin
listOf(
    host.clubId,
    host.membershipId,
    command.sessionId,
    command.action,
    command.eventType,
    command.expectedDraftRevision,
    command.expectedLiveRevision,
    command.requestHash,
).joinToString("|")
```

Set expiry to `clock().plusMinutes(5)`. `prepare` locks the preview and recalculates current target counts. If counts differ from stored counts, throw `TARGETS_CHANGED`; do not consume the preview. It returns a content-free prepared decision but performs no event or decision write. The caller creates the optional event in its own transaction, then `complete` inserts the decision and atomically stamps `consumed_at`/`consumed_decision_id`. If the preview is already complete, return the stored decision so the caller can return the original mutation result idempotently.

- [ ] **Step 4: Add event and delivery semantics**

Add `SESSION_RECORD_UPDATED` and map it to the existing feedback-document preference column and confirmed-attendee audience. Add Korean copy whose deep link is `/clubs/:slug/app/sessions/:sessionId`. Keep manual dispatch unavailable for this event in both option generation and confirmation validation.

Extend `NotificationEventOutboxPort.enqueueEvent` with an optional caller-provided `eventId` that defaults to a generated UUID, and use that overload from the host-confirmed recorder:

```kotlin
fun recordSessionRecordUpdated(
    clubId: UUID,
    sessionId: UUID,
    sessionNumber: Int,
    bookTitle: String,
    revision: Long,
): UUID {
    val eventId = UUID.randomUUID()
    check(
        eventOutboxPort.enqueueEvent(
        eventId = eventId,
        clubId = clubId,
        eventType = NotificationEventType.SESSION_RECORD_UPDATED,
        aggregateType = "SESSION",
        aggregateId = sessionId,
        payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = sessionNumber, bookTitle = bookTitle),
        dedupeKey = "session-record-updated:$sessionId:$revision",
        ),
    )
    return eventId
}
```

Give the same caller-supplied-id treatment to confirmed `NEXT_BOOK_PUBLISHED` and `FEEDBACK_DOCUMENT_PUBLISHED` events without changing the existing automatic recorder methods. A duplicate dedupe key is an application conflict unless the preview is already linked to the stored decision.

Join `host_action_notification_decisions.event_id` in both host and platform-admin event-ledger queries. Resolve source with precedence `MANUAL`, `HOST_CONFIRMED`, then `AUTOMATIC`; do not infer host confirmation from event type alone. Add adapter tests proving all three sources and preserving manual metadata.

- [ ] **Step 5: Run notification unit tests**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.service.HostActionNotificationGateServiceTest'
./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.model.NotificationEmailTemplatesTest'
./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.model.NotificationManualDispatchModelsTest'
./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.model.NotificationPreferencesTest'
./server/gradlew -p server unitTest --tests 'com.readmates.notification.application.service.HostManualNotificationServiceTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationOperationsAdapterTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/notification
git commit -m "feat(server): require host notification decisions"
```

---

### Task 5: Apply A Draft Atomically

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/port/in/SessionImportUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/application/service/SessionImportService.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- Create: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionimport/application/service/SessionImportServiceCommitValidatedTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`

**Interfaces:**
- Consumes: draft store, snapshot codec, session-import validator/replacement, notification gate.
- Produces:

```kotlin
interface ApplySessionRecordUseCase {
    fun preview(host: CurrentMember, command: PreviewSessionRecordApplyCommand): SessionRecordApplyPreview
    fun apply(host: CurrentMember, command: ApplySessionRecordCommand): SessionRecordApplyResult
}

data class ApplySessionRecordCommand(
    val sessionId: UUID,
    val previewId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val notificationDecision: NotificationDecision,
)
```

- [ ] **Step 1: Write failing apply tests**

Cover:

```kotlin
@Test fun `apply validates and replaces the full record package`()
@Test fun `first apply writes a baseline then a new immutable revision`()
@Test fun `first visible feedback apply selects feedback published event`()
@Test fun `later visible record apply selects session record updated event`()
@Test fun `send creates exactly one revision keyed event`()
@Test fun `skip creates no outbox event`()
@Test fun `outbox failure rolls back live replacement revision and draft deletion`()
@Test fun `stale live or draft revision leaves every store unchanged`()
@Test fun `restore apply records restored from revision`()
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest'
```

Expected: FAIL because `SessionRecordApplyService` does not exist.

- [ ] **Step 3: Split validation from replacement**

Replace the old unconditional notification tail with:

```kotlin
interface ValidateSessionImportUseCase {
    fun validate(command: SessionImportCommand, trustedAuthorBindings: Map<String, UUID> = emptyMap()): SessionImportPreviewResult
}

interface ReplaceValidatedSessionImportUseCase {
    fun replace(input: ValidatedSessionImportReplacement): SessionImportCommitResult
}
```

`validate` performs the current format/session/author/feedback checks without writes. `replace` performs normalized live writes and cache invalidation but never records a notification. Update old tests so a validated replacement produces zero notification events.

- [ ] **Step 4: Implement the transaction**

Annotate `apply` with `@Transactional` and implement this exact order:

```kotlin
val locked = store.lockEditor(command.sessionId, host)
locked.requireDraftRevision(command.expectedDraftRevision)
locked.requireLiveRevision(command.expectedLiveRevision)
val prepared = notificationGate.prepare(host, command.toDecisionCommand())
val validated = validator.validate(locked.draft.toImportCommand(host))
validated.requireValid()
store.insertBaselineIfAbsent(host, locked.live, codec.encode(locked.live.snapshot))
val replacement = replacer.replace(validated.toReplacement(host, command.sessionId))
val revision = store.insertAppliedRevision(host, locked, replacement, codec.encode(locked.draft.snapshot))
val eventId =
    if (prepared.decision == NotificationDecision.SEND) {
        confirmedEventRecorder.recordForAppliedRevision(revision, locked.live)
    } else {
        null
    }
val storedDecision = notificationGate.complete(prepared.complete(revision.version, eventId))
store.deleteAppliedDraft(host, command.sessionId, command.expectedDraftRevision)
return SessionRecordApplyResult.from(revision, storedDecision)
```

Before locking a draft, check whether `previewId` already has a completed decision and applied revision; on a byte-identical replay return that stored result, and on mismatched request fields return `PREVIEW_ALREADY_CONSUMED`. The actual implementation must call ports rather than expose adapters. Cache eviction remains after transaction commit.

- [ ] **Step 5: Run focused service and import tests**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest'
./server/gradlew -p server unitTest --tests 'com.readmates.sessionimport.application.service.SessionImportServiceCommitValidatedTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/sessionrecord server/src/main/kotlin/com/readmates/sessionimport server/src/test/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/sessionimport
git commit -m "feat(server): apply session record drafts atomically"
```

---

### Task 6: Route JSON And AI Results Into The Shared Draft

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportController.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionimport/adapter/in/web/SessionImportWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`

**Interfaces:**
- Consumes: `ManageSessionRecordDraftUseCase.saveValidatedSnapshot`.
- Produces: JSON and AI "commit" responses that mean draft saved, including `draftRevision` and `baseLiveRevision`.

- [ ] **Step 1: Change tests first**

Update JSON integration expectations:

```kotlin
jsonPath("$.draftRevision") { value(1) }
jsonPath("$.baseLiveRevision") { value(0) }
jsonPath("$.liveApplied") { value(false) }
```

Assert normalized publication/highlight/one-line/feedback live tables are unchanged and `session_record_drafts` contains the result.

Update AI service tests to assert receipt insertion, participant upsert, and draft save occur in one transaction while live record replacement does not.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest'
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationCommitServiceTest'
```

Expected: FAIL because both paths still replace live records.

- [ ] **Step 3: Change JSON commit to save draft**

Keep `/session-import/preview`. Change `/session-import/commit` internals and response semantics to:

```kotlin
data class SessionImportDraftResult(
    val sessionId: String,
    val draftRevision: Long,
    val baseLiveRevision: Long,
    val liveApplied: Boolean = false,
)
```

Convert the validated import to a canonical snapshot with trusted membership ids and `source=JSON_IMPORT`, then call the draft use case.

- [ ] **Step 4: Change AI commit delegate**

Replace `CommitValidatedSessionImportUseCase` injection with `SaveValidatedSessionRecordDraftUseCase`. Keep commit lease, participant upsert, receipt insert, audit, cleanup, and recovery behavior. Change `CommitGenerationResult` to include `draftRevision` and `liveApplied=false`; do not add transcript/evidence to MySQL.

- [ ] **Step 5: Run AI/JSON tests**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationCommitServiceTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.api.AiGenerateApiIntegrationTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/main/kotlin/com/readmates/sessionimport server/src/test/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/sessionimport
git commit -m "feat(server): save generated records as drafts"
```

---

### Task 7: Add Ledger, Attention, Audit, And History Reads

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryService.kt`
- Create: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/HostSessionHistoryQueryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

**Interfaces:**
- Consumes: closing/readiness policy and V39 rows.
- Produces: searchable/filterable `HostSessionListItem` and typed history page.

- [ ] **Step 1: Write failing DB tests**

Add exact cases:

```kotlin
@Test fun `host list searches session number title and book within club`()
@Test fun `host list filters needs attention using closing readiness and draft existence`()
@Test fun `host list orders by session number and id descending`()
@Test fun `basic update audit records field names but not meeting credentials`()
@Test fun `attendance audit records membership id and state transition`()
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: FAIL because filters and audit rows do not exist.

- [ ] **Step 3: Extend list query contract**

Use:

```kotlin
data class HostSessionListQuery(
    val search: String?,
    val state: String?,
    val recordStatus: SessionRecordStatus?,
)
```

Add fields `recordStatus`, `needsAttention`, `hasDraft`, `liveRevision`, `draftRevision`, and `lastModifiedAt` to each item. Reuse a shared readiness projection from `sessionclosing`; do not duplicate its rules in frontend code.

- [ ] **Step 4: Write audit rows**

Compare pre/post basic session values in the service and pass only allowlisted field identifiers to a `HostSessionAuditPort`. The allowlist may include `meetingUrl` and `meetingPasscode` to record that those fields changed, but never their old/new values. For attendance, persist one target membership id and `from`/`to` status names per changed membership. Exclude credential values, email, display names, and content bodies from detail JSON.

- [ ] **Step 5: Implement history merge**

Return cursor-ordered items:

```kotlin
enum class HostSessionHistoryType {
    BASIC_INFO_UPDATED,
    ATTENDANCE_UPDATED,
    RECORD_REVISION_APPLIED,
    RECORD_REVISION_RESTORED,
    NOTIFICATION_SENT,
    NOTIFICATION_SKIPPED,
}
```

Use `(created_at desc, type_sort desc, id desc)` as the stable cursor tuple.

- [ ] **Step 6: Run list/history tests**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionControllerDbTest'
./server/gradlew -p server unitTest --tests 'com.readmates.sessionrecord.application.service.HostSessionHistoryQueryServiceTest'
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/sessionrecord
git commit -m "feat(server): expose host session record ledger"
```

---

### Task 8: Expose Fail-Closed Server APIs And Capability

**Files:**
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/HostSessionRecordController.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

**Interfaces:**
- Consumes: Tasks 3–7 use cases.
- Produces: the APIs listed in design section 10 plus `GET /api/host/capabilities`.

- [ ] **Step 1: Write failing API contract tests**

Test host/member/cross-club access, page shapes, draft CAS, preview expiry, apply SEND/SKIP, idempotency, restore, and public-safe errors. Add:

```kotlin
@Test fun `member cannot read host record editor`()
@Test fun `host cannot use another club preview`()
@Test fun `apply without notification decision returns typed conflict`()
@Test fun `visibility first publication requires preview and decision when capability is enabled`()
@Test fun `capability reports confirmation requirement`()
```

- [ ] **Step 2: Run tests and verify failure**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest'
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add record endpoints and error mapping**

Expose the exact routes in the design. Map errors:

```kotlin
DRAFT_STALE -> 409 "SESSION_RECORD_DRAFT_STALE"
LIVE_STALE -> 409 "SESSION_RECORD_LIVE_STALE"
PREVIEW_EXPIRED -> 409 "NOTIFICATION_PREVIEW_EXPIRED"
CONFIRMATION_REQUIRED -> 409 "NOTIFICATION_CONFIRMATION_REQUIRED"
TARGETS_CHANGED -> 409 "NOTIFICATION_TARGETS_CHANGED"
PREVIEW_ALREADY_CONSUMED -> 409 "NOTIFICATION_PREVIEW_ALREADY_CONSUMED"
INVALID_RECORD -> 422 "SESSION_RECORD_INVALID"
NOT_FOUND -> 404 "SESSION_RECORD_NOT_FOUND"
```

Responses use `ApiErrorResponse`.

- [ ] **Step 4: Gate next-book visibility**

Add `/visibility-preview`. When capability is enabled and the mutation changes a DRAFT from `HOST_ONLY` to `MEMBER`/`PUBLIC`, require `previewId` and `notificationDecision`. Remove the unconditional `recordNextBookPublished` call; SEND calls the gate-controlled recorder, SKIP records the decision. Other visibility changes remain compatible.

- [ ] **Step 5: Add staged capability**

Declare `readmates.host-action-confirmation.required: false` in `application.yml` and bind it with a fail-safe false constructor default. Return:

```json
{"sessionRecordDrafts":true,"hostActionNotificationConfirmationRequired":false}
```

When false, old visibility behavior remains only for rollout compatibility. Use `@TestPropertySource(properties = ["readmates.host-action-confirmation.required=true"])` on the confirmation-required integration-test class and prove the fail-closed path. Never expose operational values beyond booleans.

- [ ] **Step 6: Run API and architecture checks**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionControllerDbTest'
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/sessionrecord server/src/main/kotlin/com/readmates/session server/src/main/resources/application.yml server/src/test/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/session
git commit -m "feat(server): expose confirmed record apply APIs"
```

---

### Task 9: Build The Frontend Data Layer

**Files:**
- Create: `front/features/host/api/host-session-record-contracts.ts`
- Create: `front/features/host/api/host-session-record-api.ts`
- Create: `front/features/host/api/host-session-record-api.test.ts`
- Create: `front/features/host/queries/host-session-record-queries.ts`
- Create: `front/features/host/queries/host-session-record-queries.test.tsx`
- Create: `front/features/host/model/host-session-ledger-model.ts`
- Create: `front/features/host/model/host-session-ledger-model.test.ts`
- Create: `front/features/host/model/host-session-record-editor-model.ts`
- Create: `front/features/host/model/host-session-record-editor-model.test.ts`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`

**Interfaces:**
- Consumes: Task 8 JSON contracts.
- Produces: typed query options/mutations and pure view models used by Tasks 10–12.

- [ ] **Step 1: Write API URL and schema tests**

Assert club-scoped URLs and bodies:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/host/sessions/session-28/record-apply?clubSlug=reading-sai",
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({
      previewId: "preview-1",
      expectedDraftRevision: 3,
      expectedLiveRevision: 2,
      notificationDecision: "SKIP",
    }),
  }),
);
```

Zod must reject missing `items/nextCursor`, negative revisions, unknown decision values, and history items without `type`.

- [ ] **Step 2: Run tests and verify failure**

```bash
corepack pnpm --dir front exec vitest run features/host/api/host-session-record-api.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Define exact TypeScript contracts**

```ts
export type NotificationDecision = "SEND" | "SKIP";
export type SessionRecordStatus = "NOT_STARTED" | "INCOMPLETE" | "COMPLETE";
export type SessionRecordSource = "BASELINE" | "MANUAL" | "JSON_IMPORT" | "AI_GENERATED" | "RESTORED";
export type HostSessionRecordApplyRequest = {
  previewId: string;
  expectedDraftRevision: number;
  expectedLiveRevision: number;
  notificationDecision: NotificationDecision;
};
```

Define snapshot, editor, draft, preview, result, history, capability, and enriched ledger types. Keep member/public contracts unchanged.

- [ ] **Step 4: Add query keys and invalidation**

Use club-scoped roots:

```ts
export const hostSessionRecordKeys = {
  all: ["host", "session-records"] as const,
  scope: (context?: ReadmatesApiContext) => ["host", "session-records", context?.clubSlug ?? null] as const,
  ledger: (request: HostSessionLedgerRequest, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "ledger", request] as const,
  editor: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "editor", sessionId] as const,
  history: (sessionId: string, page: PageRequest, context?: ReadmatesApiContext) =>
    [...hostSessionRecordKeys.scope(context), "history", sessionId, page] as const,
};
```

Successful draft save updates editor cache. Successful apply invalidates editor, ledger, history, dashboard, member archive/notes/feedback, and public records through the existing invalidation helper.

- [ ] **Step 5: Add pure model tests and implementation**

Test URL normalization, `needsAttention` badges, confirmation button disabled until decision, target-zero SEND disable, section issue mapping, and dirty-navigation state.

- [ ] **Step 6: Run focused frontend tests**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/api/host-session-record-api.test.ts \
  features/host/queries/host-session-record-queries.test.tsx \
  features/host/model/host-session-ledger-model.test.ts \
  features/host/model/host-session-record-editor-model.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/host/api front/features/host/queries front/features/host/model
git commit -m "feat(front): add host session record data layer"
```

---

### Task 10: Add The Session Ledger And Navigation

**Files:**
- Create: `front/features/host/route/host-session-ledger-data.ts`
- Create: `front/features/host/route/host-session-ledger-route.tsx`
- Create: `front/features/host/ui/host-session-ledger.tsx`
- Create: `front/features/host/ui/host-session-ledger.test.tsx`
- Create: `front/src/pages/host-session-ledger.tsx`
- Create: `front/src/app/host-routes/session-ledger-route-element.tsx`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/readmates-copy.ts`
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
- Modify: `front/src/app/router-route-order.test.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`

**Interfaces:**
- Consumes: Task 9 ledger queries and model.
- Produces: `/app/host/sessions` and club-scoped ledger route.

- [ ] **Step 1: Write failing route/navigation tests**

Assert:

```ts
expect(routePathsFor("/app/host/sessions")).not.toContain("*");
expect(screen.getByRole("link", { name: "세션 기록" })).toHaveAttribute("href", "/app/host/sessions");
expect(screen.getByRole("link", { name: "기록" })).toHaveAttribute("href", "/app/host/sessions");
```

Add UI tests for search submission, filter URL state, cursor load-more, desktop rows, mobile cards, and the three-item dashboard attention cap.

- [ ] **Step 2: Run tests and verify failure**

```bash
corepack pnpm --dir front exec vitest run \
  src/app/router-route-order.test.tsx \
  tests/unit/responsive-navigation.test.tsx \
  features/host/ui/host-session-ledger.test.tsx
```

Expected: FAIL because route and component do not exist.

- [ ] **Step 3: Add lazy route and loader**

Add `path: "sessions"` before `sessions/new` and `sessions/:sessionId/edit`. Loader parses `search`, `state`, `recordStatus`, and first page cursor request, authenticates host, and seeds the query.

- [ ] **Step 4: Implement ledger UI**

Desktop uses semantic table; mobile uses article cards. Both render the same props:

```ts
type HostSessionLedgerProps = {
  items: HostSessionLedgerItem[];
  filters: HostSessionLedgerFilters;
  nextCursor: string | null;
  loadingMore: boolean;
  onFiltersChange: (filters: HostSessionLedgerFilters) => void;
  onLoadMore: () => void;
};
```

No API/query imports in UI. Preserve Korean/English wrapping and explicit badge text.

- [ ] **Step 5: Rewire navigation and dashboard**

Rename desktop `세션 문서` to `세션 기록`. Mobile host `기록` points to the host ledger, not member archive. Dashboard shows counts and at most three attention rows, with an isolated unavailable state.

- [ ] **Step 6: Run focused tests and boundary check**

```bash
corepack pnpm --dir front exec vitest run \
  src/app/router-route-order.test.tsx \
  tests/unit/responsive-navigation.test.tsx \
  features/host/ui/host-session-ledger.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/src front/shared/ui front/features/host
git commit -m "feat(front): add host session record ledger"
```

---

### Task 11: Add Manual Draft Editing And History

**Files:**
- Create: `front/features/host/ui/session-editor/session-record-draft-panel.tsx`
- Create: `front/features/host/ui/session-editor/session-record-draft-panel.test.tsx`
- Create: `front/features/host/ui/session-editor/session-history-panel.tsx`
- Create: `front/features/host/ui/session-editor/session-history-panel.test.tsx`
- Modify: `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/session-editor/session-import-panel.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`

**Interfaces:**
- Consumes: Task 9 editor/draft/history queries.
- Produces: four-section editor and restore-to-draft UI.

- [ ] **Step 1: Write failing presentation tests**

Add these six named tests to the two new test files:

- `keeps live preview unchanged while editing a draft`
- `autosaves one section with the expected draft revision`
- `shows unsaved state and blocks navigation after autosave failure`
- `does not overwrite on SESSION_RECORD_DRAFT_STALE`
- `maps validation issues to summary highlights reviews and feedback`
- `restores a revision into a draft only after confirmation`

Use prop/callback fakes; do not mock fetch in UI tests.

- [ ] **Step 2: Run tests and verify failure**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/session-editor/session-record-draft-panel.test.tsx \
  features/host/ui/session-editor/session-history-panel.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement four sections**

Change mobile sections to:

```ts
export type MobileEditorSection = "basic" | "attendance" | "records" | "history";
```

`records` owns visibility, summary, highlight list, one-line list, feedback filename/title/Markdown, JSON import, and AI result. `history` owns typed rows and restore action. Basic and attendance retain immediate save controls.

- [ ] **Step 4: Implement debounced draft save**

The route container owns a 600 ms debounce and calls the mutation with the current `expectedDraftRevision`. UI receives:

```ts
type DraftSaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "stale";
```

On stale, retain textarea/list values, show `다른 호스트가 먼저 수정했습니다`, and provide `최신 초안 불러오기` plus `내 입력 복사`.

- [ ] **Step 5: Change JSON/AI copy**

Buttons become `초안으로 가져오기` and `초안으로 저장`. A successful JSON/AI response refreshes editor draft cache and does not claim public completion.

- [ ] **Step 6: Run focused editor tests**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/session-editor/session-record-draft-panel.test.tsx \
  features/host/ui/session-editor/session-history-panel.test.tsx \
  features/host/ui/session-editor/session-import-panel.test.tsx \
  features/host/aigen/ui/AiGenerateTab.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/host
git commit -m "feat(front): stage host session record edits"
```

---

### Task 12: Add The Required Confirmation Dialog And Wire Both Actions

**Files:**
- Create: `front/features/host/ui/session-editor/host-action-confirmation-dialog.tsx`
- Create: `front/features/host/ui/session-editor/host-action-confirmation-dialog.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/dashboard/upcoming-session-row.tsx`
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/route/host-dashboard-actions.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/api/host-api.ts`

**Interfaces:**
- Consumes: Task 9 preview/apply/visibility mutations and capability query.
- Produces: one accessible dialog/sheet shared by `SESSION_RECORD_APPLY` and `NEXT_BOOK_PUBLISH`.

- [ ] **Step 1: Write failing dialog tests**

Assert:

```ts
expect(screen.getByRole("button", { name: "선택대로 반영" })).toBeDisabled();
await user.click(screen.getByRole("radio", { name: "알림 없이 반영" }));
expect(screen.getByRole("button", { name: "선택대로 반영" })).toBeEnabled();
```

Also test focus trap, Escape/cancel with zero mutation calls, trigger focus restoration, target-zero SEND disable reason, changed-target preview reopen, and 320px-safe action labels.

- [ ] **Step 2: Run tests and verify failure**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/session-editor/host-action-confirmation-dialog.test.tsx
```

Expected: FAIL because dialog is missing.

- [ ] **Step 3: Implement prop-driven dialog**

```ts
type HostActionConfirmationDialogProps = {
  open: boolean;
  preview: HostActionPreview | null;
  decision: NotificationDecision | null;
  submitting: boolean;
  onDecisionChange: (decision: NotificationDecision) => void;
  onCancel: () => void;
  onConfirm: () => void;
};
```

Use `role="dialog"`, `aria-modal="true"`, a required radio group with no default, and one confirm button. CSS presents it as centered dialog on desktop and bottom sheet on mobile without changing semantics.

- [ ] **Step 4: Integrate record apply**

`변경사항 검토` requests preview. Confirm calls apply with preview id and expected revisions. On preview expiry or target change, request a new preview, clear decision, reopen counts, and require a new choice. On asynchronous delivery failure after apply, preserve success and show `알림 발송 장부에서 확인`.

- [ ] **Step 5: Integrate next-book visibility**

When capability is true and DRAFT changes from `HOST_ONLY`, request visibility preview before PATCH. Cancel leaves visibility unchanged. SEND/SKIP passes the decision. When capability is false during rollout, retain the legacy action; when server returns `NOTIFICATION_CONFIRMATION_REQUIRED`, show a refresh-required message and never retry without confirmation.

- [ ] **Step 6: Run focused workflow tests**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/session-editor/host-action-confirmation-dialog.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  features/host/queries/host-session-queries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/host
git commit -m "feat(front): confirm host-triggered notifications"
```

---

### Task 13: Prove The Vertical Slice And Update Active Documentation

**Files:**
- Create: `front/tests/e2e/host-session-record-revisions.spec.ts`
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/server-state-migration.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: complete server/frontend slice.
- Produces: release evidence and current architecture documentation.

- [ ] **Step 1: Add E2E database helpers**

Add helpers that query only test fixture ids:

```ts
export async function readSessionRecordRevisionCount(sessionId: string): Promise<number>
export async function readHostActionDecision(sessionId: string): Promise<"SEND" | "SKIP" | null>
export async function readNotificationEventCount(sessionId: string, eventType: string): Promise<number>
```

Extend reset order to delete decisions, previews, drafts, revisions, then audit rows before sessions.

- [ ] **Step 2: Write the E2E flows**

Use serial DB-backed tests for:

1. ledger search and past-session entry;
2. immediate basic/attendance audit;
3. draft edit leaves member/public live view unchanged;
4. SKIP apply creates revision and no event;
5. SEND apply creates exactly one `SESSION_RECORD_UPDATED`;
6. restore-to-draft and new revision;
7. next-book cancel, SKIP, SEND;
8. mobile host record navigation and confirmation sheet.

Update JSON/AI preview E2E to expect draft saved rather than live commit.

- [ ] **Step 3: Run the new E2E file**

```bash
corepack pnpm --dir front test:e2e -- host-session-record-revisions.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Update active docs and changelog**

Document:

- `/app/host/sessions` ledger;
- draft/apply/revision/restore flow;
- `HOST_CONFIRMED` and `SESSION_RECORD_UPDATED`;
- fail-closed capability rollout;
- unchanged scheduler/member/AI-system notification gates;
- V39 tables and privacy rules.

Do not copy local paths, real member data, private domains, or deployment values.

- [ ] **Step 5: Run documentation checks**

```bash
git diff --check -- docs/development/architecture.md docs/development/server-state-migration.md CHANGELOG.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  docs/development/architecture.md docs/development/server-state-migration.md CHANGELOG.md
```

Expected: `git diff --check` exits 0 and the safety scan returns no matches.

- [ ] **Step 6: Run the complete required verification**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
```

Expected: every command exits 0. Record actual counts and durations in the implementation handoff; do not summarize skipped commands as passing.

- [ ] **Step 7: Inspect the final branch diff**

```bash
git status --short --branch
git diff --check
git diff --stat origin/main...HEAD
git log --oneline --decorate origin/main..HEAD
```

Expected: only this feature, its tests, migration, active docs, and changelog are changed. Existing `.agents/` remains untouched.

- [ ] **Step 8: Commit**

```bash
git add front/tests/e2e docs/development/architecture.md docs/development/server-state-migration.md CHANGELOG.md
git commit -m "test: verify host session record revisions"
```

## Completion Evidence

Before declaring implementation complete, produce a requirement-to-evidence table with:

- final commit for each task;
- exact focused test command per task;
- full frontend/server/integration/E2E command results;
- capability default and activation follow-up;
- migration version and rollback limitation;
- any skipped validation and reason;
- residual risk for asynchronous notification delivery after content commit.

Do not deploy, enable the production confirmation property, send live notifications, or create a release tag without separate user approval.
