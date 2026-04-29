# ReadMates DB Query Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove the identified DB hot spots: feedback list longtext parsing, recipient/member row-by-row writes, and missing MySQL indexes for note/feed queries.

**Architecture:** Keep the existing clean-architecture boundaries. Persistence changes stay in JDBC adapters and Flyway migrations; application services only change where result shapes require it. Preserve public repo safety by using synthetic examples only.

**Tech Stack:** Kotlin, Spring Boot, JdbcTemplate, Flyway, MySQL-compatible SQL, H2-compatible default migrations, JUnit/Spring Boot tests.

---

## Scope And Decisions

- Keep this as server-only work. Do not edit frontend routes or UI.
- Prefer behavior-preserving optimizations. Existing API response shapes must not change.
- Use additive migrations only. Do not rewrite old migration files.
- Keep feedback document detail reads unchanged; only optimize the list path.
- Use `batchUpdate` for row-per-recipient/member write paths where single SQL would require DB-specific UUID expressions. This removes per-row application round trips while preserving cross-test-database compatibility.
- Add indexes only for query shapes already present in the code. Do not add speculative indexes for unused paths.
  Phase 4 includes both notification failure-summary and club-scoped claim query shapes.

## Files

- Modify: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Create: `server/src/main/resources/db/migration/V11__db_query_optimization.sql`
- Create: `server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql`
- Modify: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`
- Verify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-detailed-execution.md`
- Modify: `docs/superpowers/plans/2026-04-29-readmates-db-query-optimization-implementation-plan.md`

---

### Task 1: Add Feedback List Metadata Projection

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

- [x] **Step 1: Add a list-only result model**

Add this data class next to `StoredFeedbackDocumentResult`:

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

- [x] **Step 2: Change the outbound port list signature**

In `FeedbackDocumentStorePort`, change:

```kotlin
fun listLatestReadableDocuments(currentMember: CurrentMember): List<StoredFeedbackDocumentResult>
```

to:

```kotlin
fun listLatestReadableDocuments(currentMember: CurrentMember): List<StoredFeedbackDocumentListResult>
```

and import `StoredFeedbackDocumentListResult`.

- [x] **Step 3: Change list service to avoid full parsing when title exists**

In `FeedbackDocumentService.listMyReadableFeedbackDocuments`, replace the current `document.sourceText` parse path with:

```kotlin
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
```

Add this mapper overload:

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

Remove the old `StoredFeedbackDocumentResult.toListItem(...)` list-only overloads when they become unused.

- [x] **Step 4: Store parsed title on upload**

Change `FeedbackDocumentStorePort.insertDocument` to accept a parsed title:

```kotlin
fun insertDocument(
    currentMember: CurrentMember,
    command: FeedbackDocumentUploadCommand,
    version: Int,
    documentId: UUID,
    title: String,
)
```

At `FeedbackDocumentService.uploadHostFeedbackDocument`, pass:

```kotlin
title = parsedDocument.title,
```

- [x] **Step 5: Add migration columns**

Create both migration files with the same intent.

`server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql`:

```sql
alter table session_feedback_documents
  add column document_title varchar(255);
```

`server/src/main/resources/db/migration/V11__db_query_optimization.sql`:

```sql
alter table session_feedback_documents
  add column document_title varchar(255);
```

- [x] **Step 6: Update JDBC insert and list queries**

In `JdbcFeedbackDocumentStoreAdapter.insertDocument`, insert `document_title`:

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

with arguments:

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

In `listLatestReadableDocuments`, select only `source_text` for legacy rows:

```sql
case
  when session_feedback_documents.document_title is null then session_feedback_documents.source_text
  else null
end as legacy_source_text,
session_feedback_documents.document_title,
```

Use this mapper:

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

Keep `findLatestDocument` selecting `source_text` for detail reads.

- [x] **Step 7: Add feedback regression tests**

Add or update tests in `FeedbackDocumentControllerTest`:

```kotlin
@Test
fun `latest uploaded feedback document list uses stored title`() {
    uploadValidFeedbackDocumentForSeededClosedSession(fileName = "stored-title.md", title = "저장된 제목 테스트")

    mockMvc.get("/api/feedback-documents") {
        with(hostSession())
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }
        .andExpect { status { isOk() } }
        .andExpect { jsonPath("$[0].title") { value("저장된 제목 테스트") } }

    assertEquals(
        "저장된 제목 테스트",
        jdbcTemplate.queryForObject(
            """
            select document_title
            from session_feedback_documents
            where file_name = 'stored-title.md'
            order by version desc
            limit 1
            """.trimIndent(),
            String::class.java,
        ),
    )
}
```

If helpers do not exist, reuse the existing upload test request builder in the same file rather than creating a new abstraction.

- [x] **Step 8: Run targeted feedback tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.feedback.api.FeedbackDocumentControllerTest
```

Expected: all tests in `FeedbackDocumentControllerTest` pass.

---

### Task 2: Batch Notification Outbox Enqueue Inserts

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationOutboxAdapterTest.kt`

- [x] **Step 1: Replace `insertOutbox` with a batched helper**

Implementation note: the final code removed the old per-row `insertOutbox` helper after
all call sites moved to `batchInsertOutbox`.

Earlier review found that summing raw JDBC batch counts can return negative values when
the driver reports `Statement.SUCCESS_NO_INFO`. The implemented helper therefore keeps
normal `0`/`1` counts exact, but falls back to counting generated outbox ids when any
batch result is `SUCCESS_NO_INFO`.

The replaced helper had this shape:

```kotlin
private fun insertOutbox(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    eventType: NotificationEventType,
    aggregateId: UUID,
    recipientMembershipId: UUID,
    recipientEmail: String,
    recipientDisplayName: String?,
    subject: String,
    bodyText: String,
    deepLinkPath: String,
): Int =
    jdbcTemplate.update(
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
        UUID.randomUUID().dbString(),
        clubId.dbString(),
        eventType.name,
        AGGREGATE_TYPE_SESSION,
        aggregateId.dbString(),
        recipientMembershipId.dbString(),
        recipientEmail.trim(),
        recipientDisplayName,
        subject,
        bodyText,
        deepLinkPath,
        dedupeKey(eventType, aggregateId, recipientMembershipId),
    )
```

- [x] **Step 2: Replace recipient `sumOf` loops with `batchUpdate`**

Add:

```kotlin
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import java.sql.PreparedStatement
```

Add helper:

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

In each enqueue method, build `OutboxInsertCommand` values and call `batchInsertOutbox(jdbcTemplate, commands)`.

- [x] **Step 3: Preserve idempotency and counts**

For `enqueueFeedbackDocumentPublished`, use:

```kotlin
val jdbcTemplate = jdbcTemplate()
val recipients = jdbcTemplate.query(...)
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

Apply the same structure to next-book and reminder enqueue paths.

- [x] **Step 4: Run notification adapter tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationOutboxAdapterTest
```

Expected: idempotency, claim, and reminder tests pass.

---

### Task 3: Batch Session Participant And Attendance Writes

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`

- [x] **Step 1: Batch participant creation when opening a session**

Add imports:

```kotlin
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import java.sql.PreparedStatement
```

Replace `activeMembershipIds.forEach { jdbcTemplate.update(...) }` in `createActiveParticipants` with:

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

- [x] **Step 2: Batch attendance confirmation**

Parse all IDs first, then batch update:

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

- [x] **Step 3: Run session tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.api.HostDashboardControllerTest
```

Expected: existing open-session and attendance flows pass.

---

### Task 4: Add Query-Supporting Indexes

**Files:**
- Modify: `server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql`
- Modify: `server/src/main/resources/db/migration/V11__db_query_optimization.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Add default-path prerequisites and indexes to both migration files**

In `V11__db_query_optimization.sql`, add the missing default-path schema prerequisites
before the indexes:

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

Then append these indexes to both migrations:

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

- [x] **Step 2: Add migration assertions**

In `MySqlFlywayMigrationTest`, assert exact indexed column order:

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

If there is no generic `indexColumns` helper, add:

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

- [x] **Step 3: Run migration tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: Flyway migration succeeds on MySQL container and index assertions pass.

---

### Task 5: Full Server Verification

**Files:**
- No new files.

- [x] **Step 1: Run the server test suite**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: build succeeds and all server tests pass.

- [x] **Step 2: Run SQL/style diff check**

Run:

```bash
git diff --check -- server/src/main/kotlin server/src/main/resources/db server/src/test/kotlin
```

Expected: no whitespace errors.

- [x] **Step 3: Review the changed SQL surface**

Run:

```bash
git diff -- server/src/main/resources/db/mysql/migration/V17__db_query_optimization.sql server/src/main/resources/db/migration/V11__db_query_optimization.sql
```

Expected:
- only additive columns/indexes
- no real member data
- no secrets
- no environment-specific deployment values

Completion evidence recorded in the detailed execution plan:

- `./server/gradlew -p server clean test` passed with `BUILD SUCCESSFUL in 44s`.
- The broader scoped `git diff --check` passed with no whitespace errors.
- New migration files were marked intent-to-add so the migration diff includes them.

---

## Residual Risks

- The added indexes improve likely access paths, but final validation should use production-like MySQL `EXPLAIN ANALYZE` for:
  - notes feed all-sessions query
  - notes sessions count query
  - feedback document list query
  - notification claim and host summary queries
- `batchUpdate` reduces application-side round trips. If the MySQL JDBC URL does not enable batch rewrite, the driver may still send multiple statements more efficiently than the current loop but not as one set-based insert.
- Existing feedback rows created before `document_title` exists may still need legacy parsing until they are re-uploaded or manually backfilled. New uploads should avoid the list-time longtext read path.

## Execution Order

1. Task 1: feedback list metadata projection.
2. Task 2: notification outbox batch enqueue.
3. Task 3: session participant and attendance batch writes.
4. Task 4: query-supporting indexes.
5. Task 5: full verification.
