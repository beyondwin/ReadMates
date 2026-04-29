# ReadMates DB Query Optimization Detailed Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if splitting tasks across workers. Execute one phase at a time and keep checkbox state updated.

**Goal:** Execute the DB optimization plan in `docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-implementation-plan.md` with enough detail that each code change, migration, and verification step is unambiguous.

**Architecture:** This is server-only work. Keep SQL and row mapping in JDBC persistence adapters, keep orchestration in application services, and keep API response shapes unchanged. Use additive migrations and behavior-preserving tests.

**Tech Stack:** Kotlin, Spring Boot, JdbcTemplate, Flyway, MySQL migrations, H2/default migrations, JUnit, MockMvc.

---

## Execution Guardrails

- Do not edit frontend files.
- Do not rewrite existing Flyway migrations; add new migrations only.
- Do not include real member data, secrets, private URLs, local absolute paths, or token-shaped examples.
- Do not stage unrelated existing changes. At the time this execution doc was written, unrelated tracked doc changes existed in `docs/deploy/oci-backend.md` and `docs/development/architecture.md`.
- Prefer small commits after each green phase if committing is requested later.
- If a phase fails, stop at that phase and fix the failing behavior before starting the next phase.

## Review Findings Covered

1. Feedback document list reads `source_text` and parses every document.
2. Notification outbox enqueue inserts one row per recipient with one DB call each.
3. Session open creates participants with one insert per active member.
4. Notes feed/count queries need `club_id`-leading indexes.

## Branch And Preflight

- [x] **Step 1: Confirm worktree state**

```bash
git status --short --branch
```

Expected:

```text
## <current-branch>
```

Allowed before starting:

```text
?? docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-implementation-plan.md
?? docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-detailed-execution.md
```

If unrelated tracked files are modified, leave them untouched.

- [x] **Step 2: Run the current targeted tests only if you need a baseline**

```bash
./server/gradlew -p server test \
  --tests com.readmates.feedback.api.FeedbackDocumentControllerTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: existing tests pass before edits. If they fail before edits, record the failing test names and do not assume the optimization caused them.

---

## Phase 1: Feedback Document List Metadata

**Purpose:** New uploads store the parsed feedback title in `session_feedback_documents.document_title`. The list endpoint reads this metadata instead of fetching and parsing full `source_text`, while legacy rows still work through a fallback path.

**Primary files:**

- `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentResults.kt`
- `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
- `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

### Phase 1.1: Add List Model And Port Shape

- [x] **Step 1: Add the list-only result model**

In `FeedbackDocumentResults.kt`, keep `StoredFeedbackDocumentResult` for detail reads and add:

```kotlin
data class StoredFeedbackDocumentListResult(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
    val title: String?,
    val legacySourceText: String?,
    val fileName: String,
    val uploadedAt: OffsetDateTime,
)
```

- [x] **Step 2: Change the list port return type**

In `FeedbackDocumentStorePort.kt`, replace:

```kotlin
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
```

with:

```kotlin
import com.readmates.feedback.application.model.StoredFeedbackDocumentListResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
```

Then change:

```kotlin
fun listLatestReadableDocuments(currentMember: CurrentMember): List<StoredFeedbackDocumentResult>
```

to:

```kotlin
fun listLatestReadableDocuments(currentMember: CurrentMember): List<StoredFeedbackDocumentListResult>
```

### Phase 1.2: Add Migration Column

- [x] **Step 1: Create default migration**

Create `server/src/main/resources/db/migration/V11__db_query_optimization.sql`:

```sql
alter table session_feedback_documents
  add column document_title varchar(255);
```

- [x] **Step 2: Create MySQL migration**

Create `server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql`:

```sql
alter table session_feedback_documents
  add column document_title varchar(255);
```

### Phase 1.3: Store Metadata On Upload

- [x] **Step 1: Extend the insert port signature**

In `FeedbackDocumentStorePort.kt`, change:

```kotlin
fun insertDocument(
    currentMember: CurrentMember,
    command: FeedbackDocumentUploadCommand,
    version: Int,
    documentId: UUID,
)
```

to:

```kotlin
fun insertDocument(
    currentMember: CurrentMember,
    command: FeedbackDocumentUploadCommand,
    version: Int,
    documentId: UUID,
    title: String,
)
```

- [x] **Step 2: Pass parsed title from the service**

In `FeedbackDocumentService.uploadHostFeedbackDocument`, update the call:

```kotlin
feedbackDocumentStorePort.insertDocument(
    currentMember = currentMember,
    command = command,
    version = version,
    documentId = UUID.randomUUID(),
    title = parsedDocument.title,
)
```

- [x] **Step 3: Insert `document_title` in JDBC**

In `JdbcFeedbackDocumentStoreAdapter.insertDocument`, change the SQL to include `document_title` after `source_text`:

```kotlin
insert into session_feedback_documents (
  id,
  club_id,
  session_id,
  version,
  source_text,
  document_title,
  file_name,
  content_type,
  file_size
)
values (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Use arguments in this order:

```kotlin
documentId.dbString(),
currentMember.clubId.dbString(),
command.sessionId.dbString(),
version,
command.sourceText,
title,
command.fileName,
command.contentType,
command.fileSize,
```

### Phase 1.4: Optimize The List Query

- [x] **Step 1: Update both host and member list projections**

In both branches of `listLatestReadableDocuments`, replace `session_feedback_documents.source_text` with:

```sql
session_feedback_documents.document_title,
case
  when session_feedback_documents.document_title is null then session_feedback_documents.source_text
  else null
end as legacy_source_text,
```

Keep `source_text` out of the selected row for rows with `document_title`.

- [x] **Step 2: Map list rows to the new model**

Add:

```kotlin
private fun ResultSet.toStoredFeedbackDocumentList(): StoredFeedbackDocumentListResult =
    StoredFeedbackDocumentListResult(
        sessionId = uuid("session_id"),
        sessionNumber = getInt("session_number"),
        bookTitle = getString("book_title"),
        date = getObject("session_date", LocalDate::class.java),
        title = getString("document_title"),
        legacySourceText = getString("legacy_source_text"),
        fileName = getString("file_name"),
        uploadedAt = utcOffsetDateTime("created_at"),
    )
```

Use this mapper only in `listLatestReadableDocuments`.

- [x] **Step 3: Keep detail reads unchanged**

Verify `findLatestDocument` still selects:

```sql
session_feedback_documents.source_text,
```

and still maps with `toStoredFeedbackDocument()`.

### Phase 1.5: Update Service List Mapping

- [x] **Step 1: Add list model import**

In `FeedbackDocumentService.kt`, import:

```kotlin
import com.readmates.feedback.application.model.StoredFeedbackDocumentListResult
```

- [x] **Step 2: Replace list endpoint mapping**

Use this implementation:

```kotlin
override fun listMyReadableFeedbackDocuments(currentMember: CurrentMember): List<FeedbackDocumentListItemResult> {
    requireReadableFeedbackMember(currentMember)
    return feedbackDocumentStorePort.listLatestReadableDocuments(currentMember).mapNotNull { document ->
        when {
            document.title != null -> document.toListItem(document.title)
            document.legacySourceText != null -> {
                val parsedDocument = parseStoredListDocument(document.legacySourceText)
                when {
                    parsedDocument != null -> document.toListItem(parsedDocument.title)
                    currentMember.isHost -> document.toListItem(FALLBACK_INVALID_DOCUMENT_TITLE)
                    else -> null
                }
            }
            currentMember.isHost -> document.toListItem(FALLBACK_INVALID_DOCUMENT_TITLE)
            else -> null
        }
    }
}
```

- [x] **Step 3: Add list item mapper**

Add:

```kotlin
private fun StoredFeedbackDocumentListResult.toListItem(title: String): FeedbackDocumentListItemResult =
    FeedbackDocumentListItemResult(
        sessionId = sessionId.toString(),
        sessionNumber = sessionNumber,
        title = title,
        bookTitle = bookTitle,
        date = date.toString(),
        fileName = fileName,
        uploadedAt = uploadedAt.toString(),
    )
```

Remove now-unused list-only mappers for `StoredFeedbackDocumentResult`.

### Phase 1.6: Feedback Tests

- [x] **Step 1: Add test for stored title**

In `FeedbackDocumentControllerTest`, add near the existing upload/list tests:

```kotlin
@Test
fun `uploaded feedback document stores title for list projection`() {
    mockMvc.multipart("/api/host/sessions/00000000-0000-0000-0000-000000000306/feedback-document") {
        with(user("host@example.com"))
        file(validMarkdownFile())
    }.andExpect {
        status { isCreated() }
        jsonPath("$.title") { value("독서모임 6차 피드백") }
    }

    mockMvc.get("/api/feedback-documents/me") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[?(@.sessionNumber == 6)].title") { value(hasItem("독서모임 6차 피드백")) }
    }

    assertThat(
        jdbcTemplate.queryForObject(
            """
            select document_title
            from session_feedback_documents
            where session_id = '00000000-0000-0000-0000-000000000306'
            order by version desc
            limit 1
            """.trimIndent(),
            String::class.java,
        ),
    ).isEqualTo("독서모임 6차 피드백")
}
```

- [x] **Step 2: Keep legacy invalid document tests meaningful**

Do not set `document_title` in `insertInvalidLatestDocument()`. That keeps these existing tests on the legacy parse fallback:

- `host sees fallback list title for invalid stored latest document`
- `member list skips invalid stored latest document`

- [x] **Step 3: Run feedback tests**

```bash
./server/gradlew -p server test --tests com.readmates.feedback.api.FeedbackDocumentControllerTest
```

Expected: all feedback controller tests pass.

### COMPACT CHECKPOINT: Phase 1 Feedback Document List Metadata

- Phase: Feedback Document List Metadata.
- Acceptance criteria: new uploads persist `session_feedback_documents.document_title`; list reads title metadata for new rows; legacy rows expose `legacy_source_text` only when `document_title` is null; host fallback and member skip behavior for invalid legacy rows is preserved; detail reads still select and parse full `source_text`.
- Changed files: feedback document result models, store port, service, JDBC store adapter, default/MySQL Flyway migrations, feedback controller test, detailed execution plan.
- Key decisions: kept SQL and row mapping in the JDBC adapter; kept orchestration and legacy parse/fallback policy in the service; did not backfill seeded legacy rows in this phase.
- Contracts/schema/test expectations: `listLatestReadableDocuments` returns `StoredFeedbackDocumentListResult`; `insertDocument` requires parsed `title`; `document_title varchar(255)` is additive and nullable; API response shapes remain unchanged.
- Review issues: none yet.
- Verification: `./server/gradlew -p server test --tests com.readmates.feedback.api.FeedbackDocumentControllerTest` passed on 2026-04-29.
- Risks: old rows still parse `source_text` until a backfill exists; direct list queries still contain the fallback `case` expression for null titles.
- Next first action: begin Phase 2 notification outbox batch inserts.
- Worktree/branch: `codex-readmates-db-query-optimization` / `codex/readmates-db-query-optimization`.
- Session-owned process/port state: no long-running process or port is owned by this session.

---

## Phase 2: Notification Outbox Batch Inserts

**Purpose:** Keep the existing recipient selection behavior but reduce per-recipient DB calls by batching outbox inserts.

**Primary files:**

- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`

### Phase 2.1: Add Batch Insert Helper

- [x] **Step 1: Add imports**

```kotlin
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import java.sql.PreparedStatement
```

- [x] **Step 2: Add command model near existing private data classes**

```kotlin
private data class OutboxInsertCommand(
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateId: UUID,
    val recipientMembershipId: UUID,
    val recipientEmail: String,
    val recipientDisplayName: String?,
    val subject: String,
    val bodyText: String,
    val deepLinkPath: String,
)
```

- [x] **Step 3: Add batch helper**

```kotlin
private fun batchInsertOutbox(jdbcTemplate: JdbcTemplate, commands: List<OutboxInsertCommand>): Int {
    if (commands.isEmpty()) {
        return 0
    }

    val entries = commands.map { command ->
        OutboxInsertBatchEntry(
            id = UUID.randomUUID(),
            command = command,
        )
    }
    val inserted = jdbcTemplate.batchUpdate(
        """
        insert ignore into notification_outbox (
          id,
          club_id,
          event_type,
          aggregate_type,
          aggregate_id,
          recipient_membership_id,
          recipient_email,
          recipient_display_name,
          subject,
          body_text,
          deep_link_path,
          status,
          dedupe_key
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                val entry = entries[i]
                val command = entry.command
                ps.setString(1, entry.id.dbString())
                ps.setString(2, command.clubId.dbString())
                ps.setString(3, command.eventType.name)
                ps.setString(4, AGGREGATE_TYPE_SESSION)
                ps.setString(5, command.aggregateId.dbString())
                ps.setString(6, command.recipientMembershipId.dbString())
                ps.setString(7, command.recipientEmail.trim())
                ps.setString(8, command.recipientDisplayName)
                ps.setString(9, command.subject)
                ps.setString(10, command.bodyText)
                ps.setString(11, command.deepLinkPath)
                ps.setString(12, dedupeKey(command.eventType, command.aggregateId, command.recipientMembershipId))
            }

            override fun getBatchSize(): Int = entries.size
        },
    )

    if (inserted.any { it == Statement.SUCCESS_NO_INFO }) {
        return countInsertedOutboxRows(jdbcTemplate, entries.map { it.id })
    }

    return inserted.sumOf { rows -> max(0, rows) }
}
```

The accepted implementation also includes the private generated-id batch entry model and
`countInsertedOutboxRows(...)` helper used by the `Statement.SUCCESS_NO_INFO` fallback.

### Phase 2.2: Replace Existing Loops

- [x] **Step 1: Use one `JdbcTemplate` per enqueue method**

At the start of each enqueue method:

```kotlin
val jdbcTemplate = jdbcTemplate()
```

Use that same instance for recipient query and batch insert.

- [x] **Step 2: Replace `enqueueFeedbackDocumentPublished` loop**

Replace `return recipients.sumOf { recipient -> insertOutbox(...) }` with:

```kotlin
return batchInsertOutbox(
    jdbcTemplate,
    recipients.map { recipient ->
        OutboxInsertCommand(
            clubId = clubId,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            aggregateId = sessionId,
            recipientMembershipId = recipient.membershipId,
            recipientEmail = recipient.email,
            recipientDisplayName = recipient.displayName,
            subject = "피드백 문서가 올라왔습니다",
            bodyText = """
                ${recipient.displayName ?: "멤버"}님,

                ${recipient.sessionNumber}회차 ${recipient.bookTitle} 피드백 문서가 올라왔습니다.
                ReadMates에서 확인해 주세요.
            """.trimIndent(),
            deepLinkPath = "/feedback-documents",
        )
    },
)
```

- [x] **Step 3: Replace `enqueueNextBookPublished` loop**

Use `NotificationEventType.NEXT_BOOK_PUBLISHED`, `aggregateId = sessionId`, subject `"다음 책이 공개되었습니다"`, and deep link `"/sessions/$sessionId"`.

- [x] **Step 4: Replace `enqueueSessionReminderDue` loop**

Use each recipient's `clubId` and `sessionId`, event type `NotificationEventType.SESSION_REMINDER_DUE`, subject `"내일 독서모임이 있습니다"`, and deep link `"/sessions/${recipient.sessionId}"`.

- [x] **Step 5: Delete unused `insertOutbox` if no call sites remain**

Run:

```bash
rg -n "insertOutbox|batchInsertOutbox" server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt
```

Expected: only `batchInsertOutbox` is used.

### Phase 2.3: Notification Tests

- [x] **Step 1: Run adapter tests**

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest
```

Expected:

- `enqueue feedback notification creates one pending row per active attended participant` passes.
- `enqueue is idempotent for the same event and recipient` passes.
- `enqueueSessionReminderDue creates reminder rows for active members on target date` passes.

- [x] **Step 2: Run service tests**

```bash
./server/gradlew -p server test --tests com.readmates.notification.application.service.NotificationOutboxServiceTest
```

Expected: service tests still pass because the port contract did not change.

### COMPACT CHECKPOINT: Phase 2 Notification Outbox Batch Inserts

- Phase: Notification Outbox Batch Inserts.
- Acceptance criteria: outbox enqueue paths preserve recipient selection, event types, aggregate ids, subjects, body text, deep links, dedupe keys, and email trimming while replacing per-recipient inserts with one `batchUpdate` per enqueue call.
- Changed files: notification JDBC outbox adapter, notification JDBC outbox adapter test, detailed execution plan.
- Key decisions: kept SQL and row mapping in the JDBC persistence adapter; added a private `OutboxInsertCommand`; reused one `JdbcTemplate` instance per enqueue method; kept `insert ignore` semantics and removed the old single-row helper; generated row ids before batch execution so `SUCCESS_NO_INFO` fallback can count inserted generated ids exactly.
- Contracts/schema/test expectations: no port contract or schema changes; `batchInsertOutbox` returns `0` for empty command lists, preserves exact normal JDBC 0/1 batch counts, and falls back to counting generated outbox ids if any entry reports `Statement.SUCCESS_NO_INFO`; adapter tests assert first enqueue and duplicate enqueue return counts.
- Review issues: quality review found raw summing of JDBC batch statuses could return negative/non-insert counts when drivers report `Statement.SUCCESS_NO_INFO`; resolved by generated-id fallback and explicit return-count tests.
- Verification: `rg -n "insertOutbox|batchInsertOutbox" server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt` showed only `batchInsertOutbox` call sites/helper; `./server/gradlew -p server test --tests "com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest.enqueue feedback notification creates one pending row per active attended participant" --tests "com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest.enqueue is idempotent for the same event and recipient"` passed on 2026-04-29; `./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest` passed on 2026-04-29; `./server/gradlew -p server test --tests com.readmates.notification.application.service.NotificationOutboxServiceTest` passed on 2026-04-29.
- Risks: the MySQL-backed integration tests exercise normal count reporting, not a forced `SUCCESS_NO_INFO` driver path; fallback logic is isolated to driver no-info statuses and counts only generated ids from the attempted batch.
- Next first action: begin Phase 3 session participant and attendance batch writes.
- Worktree/branch: `codex-readmates-db-query-optimization` / `codex/readmates-db-query-optimization`.
- Session-owned process/port state: no long-running process or port is owned by this session.

---

## Phase 3: Session Participant And Attendance Batch Writes

**Purpose:** Reduce per-member writes during session open and attendance confirmation while preserving validation and existing API responses.

**Primary files:**

- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`

### Phase 3.1: Batch Open-Session Participant Inserts

- [x] **Step 1: Add imports**

```kotlin
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import java.sql.PreparedStatement
```

- [x] **Step 2: Replace participant insert loop**

In `createActiveParticipants`, keep the existing `activeMembershipIds` query. Replace the `forEach` insert block with:

```kotlin
if (activeMembershipIds.isEmpty()) {
    return
}

jdbcTemplate.batchUpdate(
    """
    insert into session_participants (
      id, club_id, session_id, membership_id,
      rsvp_status, attendance_status, participation_status
    )
    values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
    on duplicate key update
      rsvp_status = values(rsvp_status),
      attendance_status = values(attendance_status),
      participation_status = values(participation_status),
      updated_at = utc_timestamp(6)
    """.trimIndent(),
    object : BatchPreparedStatementSetter {
        override fun setValues(ps: PreparedStatement, i: Int) {
            ps.setString(1, UUID.randomUUID().dbString())
            ps.setString(2, clubId.dbString())
            ps.setString(3, sessionId.dbString())
            ps.setString(4, activeMembershipIds[i].dbString())
        }

        override fun getBatchSize(): Int = activeMembershipIds.size
    },
)
```

- [x] **Step 3: Verify open-session tests**

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest.host starts draft session as open and creates active participants"
```

Expected: participant count remains `6` for seeded data.

### Phase 3.2: Batch Attendance Updates

- [x] **Step 1: Replace attendance update loop**

In `confirmHostAttendance`, keep `requireHostSession(...)` and replace the `command.entries.forEach` block with:

```kotlin
val entries = command.entries.map { entry ->
    parseMembershipId(entry.membershipId) to entry.attendanceStatus
}
val updated = jdbcTemplate.batchUpdate(
    """
    update session_participants
    set attendance_status = ?,
        updated_at = utc_timestamp(6)
    where session_id = ?
      and club_id = ?
      and membership_id = ?
      and participation_status = 'ACTIVE'
    """.trimIndent(),
    object : BatchPreparedStatementSetter {
        override fun setValues(ps: PreparedStatement, i: Int) {
            val (membershipId, attendanceStatus) = entries[i]
            ps.setString(1, attendanceStatus)
            ps.setString(2, command.sessionId.dbString())
            ps.setString(3, command.host.clubId.dbString())
            ps.setString(4, membershipId.dbString())
        }

        override fun getBatchSize(): Int = entries.size
    },
)
if (updated.any { it == 0 }) {
    throw HostSessionParticipantNotFoundException()
}
```

- [x] **Step 2: Verify attendance tests**

```bash
./server/gradlew -p server test \
  --tests "com.readmates.session.api.HostDashboardControllerTest.host can fetch update publish and confirm attendance for session seven" \
  --tests "com.readmates.session.api.HostDashboardControllerTest.host cannot confirm attendance for removed participants"
```

Expected:

- valid attendance confirmation still returns success
- removed participants still produce the same failure behavior

- [x] **Step 3: Run broader session tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest
```

Expected: both test classes pass.

### COMPACT CHECKPOINT: Phase 3 Session Participant And Attendance Batch Writes

- Phase: Session Participant And Attendance Batch Writes.
- Acceptance criteria: opening a draft session still creates active participants for active memberships; participant inserts now use one `batchUpdate`; attendance confirmation parses all membership ids before writes, updates active participants with one `batchUpdate`, and still throws `HostSessionParticipantNotFoundException` when any returned update count is `0`.
- Changed files: session JDBC write adapter, detailed execution plan.
- Key decisions: kept SQL and row mapping in the JDBC persistence adapter; left controller/service contracts unchanged; treated only `0` batch counts as missing participants so JDBC negative status codes such as no-info are not false positives.
- Contracts/schema/test expectations: no API or schema changes; empty active membership lists return before participant batch execution; attendance response count remains `command.entries.size`; existing transaction boundary still covers batch attendance updates.
- Review issues: none yet.
- Verification: `./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest.host starts draft session as open and creates active participants"` passed on 2026-04-29; `./server/gradlew -p server test --tests "com.readmates.session.api.HostDashboardControllerTest.host can fetch update publish and confirm attendance for session seven" --tests "com.readmates.session.api.HostDashboardControllerTest.host cannot confirm attendance for removed participants"` passed on 2026-04-29; `./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.api.HostDashboardControllerTest` passed on 2026-04-29.
- Risks: if a JDBC driver reports `Statement.SUCCESS_NO_INFO` for attendance updates, missing participants cannot be detected from counts; the current check intentionally avoids negative-count false positives per Phase 3 requirements.
- Next first action: begin Phase 4 query-supporting indexes.
- Worktree/branch: `codex-readmates-db-query-optimization` / `codex/readmates-db-query-optimization`.
- Session-owned process/port state: no long-running process or port is owned by this session.

---

## Phase 4: Query-Supporting Indexes

**Purpose:** Add indexes that match existing `club_id`-scoped feed/list/count query shapes without changing application behavior.

**Primary files:**

- `server/src/main/resources/db/migration/V11__db_query_optimization.sql`
- `server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql`
- `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

### Phase 4.1: Add Indexes

- [x] **Step 1: Add missing default-path prerequisites**

Before the indexes in `V11__db_query_optimization.sql`, add the schema pieces already
present in the MySQL path but missing from default migrations:

```sql
alter table session_participants
  add column participation_status varchar(20) not null default 'ACTIVE';

alter table session_participants
  add constraint session_participants_participation_status_check
  check (participation_status in ('ACTIVE', 'REMOVED'));

create table notification_outbox (
  ...
);
```

- [x] **Step 2: Append indexes to both migrations**

Append exactly these statements after `document_title`:

```sql
create index sessions_club_state_visibility_number_idx
  on sessions (club_id, state, visibility, number, session_date);

create index session_participants_club_session_status_member_idx
  on session_participants (club_id, session_id, participation_status, membership_id);

create index questions_club_session_created_idx
  on questions (club_id, session_id, created_at, priority);

create index one_line_reviews_club_visibility_created_idx
  on one_line_reviews (club_id, visibility, created_at, session_id);

create index long_reviews_club_visibility_created_idx
  on long_reviews (club_id, visibility, created_at, session_id);

create index highlights_club_session_created_idx
  on highlights (club_id, session_id, created_at, sort_order);

create index session_feedback_documents_club_session_version_idx
  on session_feedback_documents (club_id, session_id, version, created_at);

create index notification_outbox_club_status_updated_idx
  on notification_outbox (club_id, status, updated_at, created_at);

create index notification_outbox_club_status_next_idx
  on notification_outbox (club_id, status, next_attempt_at, created_at);
```

### Phase 4.2: Assert Migration Shape

- [x] **Step 1: Add assertions to `mysql baseline creates auth session and feedback document tables`**

Add these assertions after existing feedback document checks:

```kotlin
assertEquals("YES", columnValue("session_feedback_documents", "document_title", "is_nullable"))
assertEquals("club_id,state,visibility,number,session_date", indexColumns("sessions", "sessions_club_state_visibility_number_idx"))
assertEquals("club_id,session_id,participation_status,membership_id", indexColumns("session_participants", "session_participants_club_session_status_member_idx"))
assertEquals("club_id,session_id,created_at,priority", indexColumns("questions", "questions_club_session_created_idx"))
assertEquals("club_id,visibility,created_at,session_id", indexColumns("one_line_reviews", "one_line_reviews_club_visibility_created_idx"))
assertEquals("club_id,visibility,created_at,session_id", indexColumns("long_reviews", "long_reviews_club_visibility_created_idx"))
assertEquals("club_id,session_id,created_at,sort_order", indexColumns("highlights", "highlights_club_session_created_idx"))
assertEquals("club_id,session_id,version,created_at", indexColumns("session_feedback_documents", "session_feedback_documents_club_session_version_idx"))
assertEquals("club_id,status,updated_at,created_at", indexColumns("notification_outbox", "notification_outbox_club_status_updated_idx"))
assertEquals("club_id,status,next_attempt_at,created_at", indexColumns("notification_outbox", "notification_outbox_club_status_next_idx"))
```

- [x] **Step 2: Add helper if missing**

Add near existing schema helper methods:

```kotlin
private fun indexColumns(tableName: String, indexName: String): String =
    jdbcTemplate.queryForObject(
        """
        select group_concat(column_name order by seq_in_index separator ',')
        from information_schema.statistics
        where table_schema = database()
          and table_name = ?
          and index_name = ?
        """.trimIndent(),
        String::class.java,
        tableName,
        indexName,
    ) ?: error("Index $tableName.$indexName does not exist")
```

### Phase 4.3: Migration Verification

- [x] **Step 1: Run MySQL migration test**

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: Flyway applies `V17__db_query_optimization.sql` and assertions pass.

- [x] **Step 2: Run default migration path through a non-MySQL server test**

```bash
./server/gradlew -p server test --tests com.readmates.feedback.application.FeedbackDocumentParserTest
```

Expected: application context is not needed for this parser test; if it does not exercise H2 migrations, use the full suite in Phase 6.

### COMPACT CHECKPOINT: Phase 4 Query-Supporting Indexes

- Phase: Query-Supporting Indexes.
- Acceptance criteria: V11 default migration adds missing default-path `session_participants.participation_status` and `notification_outbox` prerequisites before indexes; V11 default and V17 MySQL migrations add the requested `club_id`-leading indexes plus `notification_outbox_club_status_next_idx`; MySQL migration test asserts `document_title` nullability and exact indexed column order.
- Changed files: default/MySQL DB optimization migrations, MySQL Flyway migration test, detailed execution plan.
- Key decisions: kept migrations additive; added default-path prerequisites in V11 instead of rewriting old migrations; replaced name-only index checks with exact `GROUP_CONCAT(column_name ORDER BY seq_in_index)` assertions; added `notification_outbox_club_status_next_idx` for the existing club-scoped claim query shape.
- Contracts/schema/test expectations: `session_feedback_documents.document_title` remains nullable; default V11 creates a default-dialect `notification_outbox` table compatible with existing outbox columns and constraints; composite indexes are expected on sessions, participants, note content tables, feedback documents, and notification outbox.
- Review issues: resolved P1 default migration applicability gap, P2 name-only index assertion gap, and P2 missing club-scoped claim-query index.
- Verification: `./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest` passed on 2026-04-29; `git diff --check -- server/src/main/resources/db/migration/V11__db_query_optimization.sql server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-detailed-execution.md docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-implementation-plan.md` passed on 2026-04-29.
- Risks: the initial parser test did not exercise the default V11 migration path; a later quality review applied the default `db/migration` SQL files through V11 against a disposable PostgreSQL 16 container and V11 applied cleanly. A dedicated default-Flyway context test would still make this coverage easier to repeat.
- Next first action: begin Phase 5 optional EXPLAIN follow-up, or skip to Phase 6 full server verification if optional EXPLAIN is not needed.
- Worktree/branch: `codex-readmates-db-query-optimization` / `codex/readmates-db-query-optimization`.
- Session-owned process/port state: no long-running process or port is owned by this session.

---

## Phase 5: Optional EXPLAIN Follow-Up

**Purpose:** Confirm the indexes are useful on a MySQL database with realistic row counts. This phase is optional for implementation completion because local seed data is too small to prove planner behavior.

- [x] **Step 1: Capture candidate SQL from the code**

Queries to inspect:

- `JdbcNotesFeedAdapter.loadNoteSessions`
- `JdbcNotesFeedAdapter.loadNotesFeed`
- `JdbcFeedbackDocumentStoreAdapter.listLatestReadableDocuments`
- `JdbcNotificationOutboxAdapter.claimPendingRows`
- `JdbcNotificationOutboxAdapter.latestFailures`

Captured candidate query shapes on 2026-04-29:

- `JdbcNotesFeedAdapter.loadNoteSessions`: reads published/member-visible sessions by `sessions.club_id`, `sessions.state`, and `sessions.visibility`, ordered by `sessions.number desc`. The projection includes four correlated count subqueries for `questions`, public `one_line_reviews`, public `long_reviews`, and `highlights`. The question/review subqueries validate active participants with an `exists` lookup on `session_participants` using `session_id`, `club_id`, `membership_id`, and `participation_status`; the highlight subquery counts club/session highlights with `membership_id is null` directly and only applies the active-participant `exists` lookup to member-authored highlights.
- `JdbcNotesFeedAdapter.loadNotesFeed`: union-all feed query over `questions`, public `long_reviews`, public `one_line_reviews`, and `highlights`. Each branch starts from the content table with `club_id = ?`, joins `sessions` by `(session_id, club_id)`, filters published/member-visible sessions, joins author membership/user data where applicable, requires active `session_participants` for member-authored content, and orders the derived feed by `created_at desc`, `source_order`, `session_number desc`, `item_order`, `author_name`, and `text` with `limit 120`.
- `JdbcFeedbackDocumentStoreAdapter.listLatestReadableDocuments`: host branch ranks `session_feedback_documents` rows for a club joined to closed/published sessions, partitioned by `session_id` and ordered by `version desc, created_at desc`, then returns `document_rank = 1` ordered by `session_number desc`. Member branch adds an attended active `session_participants` join by `membership_id`, with the same ranking and ordering. Both branches select `document_title` and only project `source_text` as `legacy_source_text` when `document_title is null`.
- `JdbcNotificationOutboxAdapter.claimPendingRows`: transaction first resets stale `SENDING` rows to `PENDING` using `status = 'SENDING'`, stale `locked_at`, and optional `club_id`. It then selects pending or failed rows with `next_attempt_at <= utc_timestamp(6)`, optional `club_id`, ordered by `next_attempt_at, created_at`, limited by the caller, using `for update skip locked`. Claimed ids are updated to `SENDING`, then refetched by `id in (...)` and ordered with `field(id, ...)` to preserve claim order.
- `JdbcNotificationOutboxAdapter.latestFailures`: club-scoped failure summary reads `notification_outbox` by `club_id = ?` and `status in ('FAILED', 'DEAD')`, ordered by `updated_at desc, created_at desc`, with `limit 10`.

- [ ] **Step 2: Run EXPLAIN ANALYZE manually on a MySQL environment**

Use synthetic or staging-safe data only. Do not paste production data into docs or commits.

Status: deferred/manual. This subagent did not run `EXPLAIN ANALYZE` because no realistic local MySQL data set was provisioned or identified, and production or other real member data must not be used for this follow-up.

Manual EXPLAIN targets/hypotheses to check:

- whether notes feed branches use `club_id`-leading indexes on content tables
- whether session filters use `sessions_club_state_visibility_number_idx`
- whether feedback latest document queries use `session_feedback_documents_club_session_version_idx`
- whether notification failure summaries can use `notification_outbox_club_status_updated_idx`

### COMPACT CHECKPOINT: Phase 5 Optional EXPLAIN Follow-Up

- Phase: Optional EXPLAIN Follow-Up.
- Acceptance criteria: candidate SQL/query shapes are captured for the requested notes feed, feedback document list, and notification outbox reads; manual `EXPLAIN ANALYZE` remains explicitly deferred unless run against synthetic or staging-safe MySQL data.
- Changed files: detailed execution plan only.
- Captured query shapes: `loadNoteSessions` correlated count subqueries over sessions and note content; `loadNotesFeed` four-branch union-all feed ordered by recency; `listLatestReadableDocuments` host/member window-ranked latest document queries; `claimPendingRows` stale reset, skip-locked claim, status update, and ordered refetch flow; `latestFailures` club/status failure summary ordered by latest update.
- Verification: `git diff --check -- docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-detailed-execution.md` passed on 2026-04-29.
- Risks: planner behavior is still unproven on realistic MySQL cardinalities; `loadNotesFeed` union ordering and `claimPendingRows` skip-locked ordering remain the highest-value manual EXPLAIN targets.
- Next first action: begin Phase 6 final verification with the full server test command, then run the broader Phase 6 diff whitespace check.
- Worktree/branch: `codex-readmates-db-query-optimization` / `codex/readmates-db-query-optimization`.
- Session-owned process/port state: no long-running process or port is owned by this session.

---

## Phase 6: Final Verification

- [x] **Step 1: Run full server tests**

```bash
./server/gradlew -p server clean test
```

Expected: all server tests pass.

- [x] **Step 2: Run diff whitespace check**

```bash
git diff --check -- server/src/main/kotlin server/src/main/resources/db server/src/test/kotlin docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-implementation-plan.md docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-detailed-execution.md
```

Expected: no whitespace errors.

- [x] **Step 3: Inspect changed files**

```bash
git diff --stat
git diff -- server/src/main/resources/db/migration/V11__db_query_optimization.sql server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql
```

Expected:

- migrations are additive only
- no public-safety-sensitive values appear
- no unrelated docs are included in the implementation diff

- [x] **Step 4: Summarize completion**

Completion summary should include:

- feedback list now reads `document_title` for new uploads
- legacy feedback rows still fall back to parsing only when needed
- outbox enqueue writes are batched
- session participant creation and attendance updates are batched
- indexes were added and migration tests passed
- exact test commands run

### COMPACT CHECKPOINT: Phase 6 Final Verification

- Phase: Final Verification.
- Commands/results: `./server/gradlew -p server clean test` passed with `BUILD SUCCESSFUL in 44s`; `git diff --check -- server/src/main/kotlin server/src/main/resources/db server/src/test/kotlin docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-implementation-plan.md docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-detailed-execution.md` passed with no output; after marking new plan/migration files as intent-to-add and updating the implementation plan status, `git diff --stat` showed 13 files changed with 2150 insertions and 145 deletions; `git diff -- server/src/main/resources/db/migration/V11__db_query_optimization.sql server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql` displayed both additive migration files; `git status --short --branch` showed branch `codex/readmates-db-query-optimization`, 9 modified server files, and 4 intent-to-add new files.
- Changed files summary: feedback document list metadata model/port/service/JDBC adapter and controller test; notification outbox JDBC batch insert adapter and adapter test; session participant/attendance JDBC batch writes; MySQL migration shape test; default/MySQL DB optimization migrations; implementation and detailed execution plans.
- Inspection findings: full server tests pass; no whitespace errors; migration files are additive schema/index changes only; migration files contain no real member data, secrets, private URLs/domains, local paths, OCIDs, or token-shaped examples; no frontend files are modified; no unrelated tracked docs such as `docs/deploy/oci-backend.md` or `docs/development/architecture.md` are modified in this worktree.
- Completion summary: feedback list reads `document_title` for new uploads and still falls back to legacy parsing only when needed; outbox enqueue writes are batched; session participant creation and attendance updates are batched; query-supporting indexes were added and migration tests are covered by the full server test run.
- Residual risks: manual MySQL `EXPLAIN ANALYZE` remains deferred until synthetic or staging-safe realistic row counts are available.
- Worktree/branch: `codex-readmates-db-query-optimization` / `codex/readmates-db-query-optimization`.
- Session-owned process/port state: no long-running process or port is owned by this session.

---

## Stop Conditions

Stop and reassess if any of these happen:

- A migration fails on MySQL because an index name already exists.
- `batchUpdate` changes returned counts in a way that breaks idempotency tests.
- Legacy invalid feedback document tests stop distinguishing host fallback from member suppression.
- Attendance batch updates partially apply and tests expect atomic failure semantics beyond the existing transaction boundary.
- Full test suite reveals a hidden H2/MySQL syntax mismatch.

## Suggested Commit Boundaries

Use these only if the user asks for commits:

1. `perf: store feedback document list metadata`
2. `perf: batch notification outbox enqueues`
3. `perf: batch session participant writes`
4. `perf: add query support indexes`
