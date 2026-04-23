# ReadMates Reading Progress And One-Line Session Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove checkin memo/read-trace behavior end-to-end, keep reading progress as a private/operational signal, and expose one-line reviews to current-session participants through the session board.

**Architecture:** This is an intentional authenticated-app contract change. The backend schema drops `reading_checkins.note`, current-session queries replace `board.checkins` with `board.oneLineReviews`, and member/archive/notes surfaces stop treating checkins as feed records. The public API boundary remains `PUBLIC` one-liners only.

**Tech Stack:** Kotlin 2.2.21, Spring Boot 4, Flyway, MySQL Testcontainers, React 19, React Router 7, TypeScript, Vitest, Testing Library.

---

## Scope Check

The approved spec touches schema, server contracts, authenticated frontend contracts, current-session UI, home, notes feed, archive detail, and host copy. These changes should land as one coordinated branch because the frontend and backend contracts intentionally break together.

Do not change unrelated public-home or login-card work that is currently dirty in the worktree. Stage only files changed for this plan.

## File Map

### Schema And Seed

- Create `server/src/main/resources/db/mysql/migration/V12__reading_progress_one_line_session_visibility.sql` for MySQL.
- Create `server/src/main/resources/db/migration/V9__reading_progress_one_line_session_visibility.sql` for the base migration tree.
- Modify `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql` and `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` to remove checkin notes and seed one-line reviews with explicit `PUBLIC`.
- Modify `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt` to verify `reading_checkins.note` is gone and `SESSION` visibility is accepted.

### Backend Write And Read Contracts

- Modify `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt` and `SessionMemberResults.kt` to remove `note` from checkin command/result.
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt` to remove checkin note/board checkins and add board one-line reviews.
- Modify `server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt` to accept only `readingProgress`.
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt` to save progress only and save one-line reviews as `SESSION`.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt` for result mapping.
- Modify `server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt` to hydrate progress-only checkin and one-line review board.

### Backend Feed And Archive

- Modify `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt` to remove `CHECKIN` feed rows and `checkinCount`.
- Modify `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt` and `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt` to remove `clubCheckins` and add `clubOneLiners`.
- Verify `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt` still uses `visibility = 'PUBLIC'`.
- Update backend tests in:
  - `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`
  - `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
  - `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
  - `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`
  - `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
  - `server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt`

### Frontend Contracts And UI

- Modify `front/features/current-session/api/current-session-contracts.ts`, `front/features/current-session/ui/current-session-types.ts`, `front/features/current-session/api/current-session-api.ts`, `front/features/current-session/actions/save-checkin.ts`, and `front/features/current-session/route/current-session-data.ts`.
- Modify `front/features/current-session/model/current-session-view-model.ts`, `front/features/current-session/ui/current-session-page.tsx`, `front/features/current-session/ui/current-session-panels.tsx`, and `front/features/current-session/ui/current-session-mobile.tsx`.
- Modify member home, notes, archive, and host files:
  - `front/features/member-home/api/member-home-contracts.ts`
  - `front/features/member-home/components/member-home-current-session.tsx`
  - `front/features/member-home/components/member-home-records.tsx`
  - `front/features/archive/api/archive-contracts.ts`
  - `front/features/archive/model/archive-model.ts`
  - `front/features/archive/model/notes-feed-model.ts`
  - `front/features/archive/ui/notes-feed-list.tsx`
  - `front/features/archive/ui/member-session-detail-page.tsx`
  - `front/features/host/model/host-dashboard-model.ts`
  - `front/features/host/components/host-dashboard.tsx`
- Update frontend tests and fixtures in:
  - `front/tests/unit/api-contract-fixtures.ts`
  - `front/tests/unit/current-session.test.tsx`
  - `front/tests/unit/current-session-actions.test.ts`
  - `front/tests/unit/current-session-model.test.ts`
  - `front/tests/unit/member-home.test.tsx`
  - `front/tests/unit/notes-feed-page.test.tsx`
  - `front/tests/unit/notes-page.test.tsx`
  - `front/tests/unit/member-session-detail-page.test.tsx`
  - `front/tests/unit/host-dashboard.test.tsx`

---

### Task 1: Schema And Seed Migration

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V12__reading_progress_one_line_session_visibility.sql`
- Create: `server/src/main/resources/db/migration/V9__reading_progress_one_line_session_visibility.sql`
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Write the failing migration metadata test**

Add these assertions inside `mysql baseline creates auth session and feedback document tables` in `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`, after the `participantColumns` assertion:

```kotlin
val checkinNoteColumns = jdbcTemplate.queryForList(
    """
    select column_name
    from information_schema.columns
    where table_schema = database()
      and table_name = 'reading_checkins'
      and column_name = 'note'
    """.trimIndent(),
)
assertEquals(0, checkinNoteColumns.size)

val oneLineVisibilityConstraints = jdbcTemplate.queryForList(
    """
    select constraint_name, check_clause
    from information_schema.check_constraints
    where constraint_schema = database()
      and constraint_name = 'one_line_reviews_visibility_check'
    """.trimIndent(),
)
assertTrue(oneLineVisibilityConstraints.any { row ->
    row["CHECK_CLAUSE"].toString().contains("SESSION") &&
        row["CHECK_CLAUSE"].toString().contains("PUBLIC") &&
        row["CHECK_CLAUSE"].toString().contains("PRIVATE")
})
```

- [x] **Step 2: Run the focused migration test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: FAIL because `reading_checkins.note` still exists and the `one_line_reviews_visibility_check` constraint does not contain `SESSION`.

- [x] **Step 3: Add the MySQL migration**

Create `server/src/main/resources/db/mysql/migration/V12__reading_progress_one_line_session_visibility.sql`:

```sql
alter table reading_checkins
  drop column note;

alter table one_line_reviews
  drop check one_line_reviews_visibility_check;

alter table one_line_reviews
  add constraint one_line_reviews_visibility_check
  check (visibility in ('PRIVATE', 'PUBLIC', 'SESSION'));
```

- [x] **Step 4: Add the base migration**

Create `server/src/main/resources/db/migration/V9__reading_progress_one_line_session_visibility.sql`:

```sql
alter table reading_checkins
  drop column note;

alter table one_line_reviews
  drop constraint one_line_reviews_visibility_check;

alter table one_line_reviews
  add constraint one_line_reviews_visibility_check
  check (visibility in ('PRIVATE', 'PUBLIC', 'SESSION'));
```

- [x] **Step 5: Update dev seed checkin inserts**

In both seed files, change every `insert into reading_checkins` statement from this shape:

```sql
insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
```

to this shape:

```sql
insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
```

For each corresponding `select` or `values` row, remove the final note expression and keep `reading_progress` as the last inserted value.

- [x] **Step 6: Keep seeded one-line reviews explicitly public**

In both seed files, ensure existing one-line review seed rows still write `PUBLIC` explicitly:

```sql
'PUBLIC' as visibility
```

The seed rows represent public historical records and must not become `SESSION`.

- [x] **Step 7: Run migration and seed tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: PASS.

- [x] **Step 8: Commit schema changes**

Run:

```bash
git add server/src/main/resources/db/mysql/migration/V12__reading_progress_one_line_session_visibility.sql \
  server/src/main/resources/db/migration/V9__reading_progress_one_line_session_visibility.sql \
  server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql \
  server/src/main/resources/db/dev/R__readmates_dev_seed.sql \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
git commit -m "feat: migrate reading progress and one-line visibility"
```

---

### Task 2: Backend Checkin Write Contract

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/CheckinControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`

- [x] **Step 1: Update service unit test expectation first**

In `SessionMemberWriteServiceTest.kt`, replace the checkin test with:

```kotlin
@Test
fun `delegates checkin save to write port`() {
    val port = FakeSessionParticipationWritePort()
    val service = SessionMemberWriteService(port)
    val member = activeMember()

    val result = service.saveCheckin(SaveCheckinCommand(member, 80))

    assertEquals(80, result.readingProgress)
    assertEquals("saveCheckin:80", port.calls.single())
}
```

Update the fake port method in the same file:

```kotlin
override fun saveCheckin(command: SaveCheckinCommand) =
    com.readmates.session.application.model.CheckinResult(command.readingProgress)
        .also { calls += "saveCheckin:${command.readingProgress}" }
```

- [x] **Step 2: Update controller DB test payloads first**

In `MemberActionControllerDbTest.kt`, replace checkin JSON request bodies with:

```kotlin
content = """{"readingProgress":80}"""
```

For the persistence assertion, query only `reading_progress`:

```kotlin
val readingProgress = jdbcTemplate.queryForObject(
    """
    select reading_checkins.reading_progress
    from reading_checkins
    join memberships on memberships.id = reading_checkins.membership_id
      and memberships.club_id = reading_checkins.club_id
    join users on users.id = memberships.user_id
    where reading_checkins.session_id = '00000000-0000-0000-0000-000000009102'
      and users.email = 'member5@example.com'
    """.trimIndent(),
    Int::class.java,
)
assertEquals(80, readingProgress)
```

- [x] **Step 3: Run focused failing backend tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.application.service.SessionMemberWriteServiceTest \
  --tests com.readmates.note.api.CheckinControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: FAIL with compile errors because command/result/request classes still require `note`.

- [x] **Step 4: Update command and result models**

Replace the checkin data classes:

```kotlin
data class SaveCheckinCommand(
    val member: CurrentMember,
    val readingProgress: Int,
)
```

```kotlin
data class CheckinResult(
    val readingProgress: Int,
)
```

- [x] **Step 5: Update CheckinController DTOs**

Replace checkin request/response in `CheckinController.kt`:

```kotlin
data class CheckinRequest(
    @field:Min(0) @field:Max(100) val readingProgress: Int,
) {
    fun toCommand(member: CurrentMember): SaveCheckinCommand =
        SaveCheckinCommand(member = member, readingProgress = readingProgress)
}

data class CheckinResponse(
    val readingProgress: Int,
)
```

Replace the response construction:

```kotlin
return CheckinResponse(result.readingProgress)
```

Remove the unused `jakarta.validation.constraints.NotBlank` import.

- [x] **Step 6: Update repository saveCheckin**

Replace `saveCheckin` in `SessionParticipationRepository.kt` with:

```kotlin
fun saveCheckin(member: CurrentMember, readingProgress: Int): Map<String, Any> {
    requireWritableMember(member)
    val jdbcTemplate = jdbcTemplate()
    val updated = jdbcTemplate.update(
        """
        insert into reading_checkins (
          id,
          club_id,
          session_id,
          membership_id,
          reading_progress
        )
        select
          ?,
          current_session.club_id,
          current_session.id,
          session_participants.membership_id,
          ?
        from (
          select id, club_id
          from sessions
          where club_id = ?
            and state = 'OPEN'
          order by number desc
          limit 1
        ) current_session
        join session_participants on session_participants.session_id = current_session.id
          and session_participants.club_id = current_session.club_id
          and session_participants.membership_id = ?
          and session_participants.participation_status = 'ACTIVE'
        on duplicate key update
          reading_progress = values(reading_progress),
          updated_at = utc_timestamp(6)
        """.trimIndent(),
        UUID.randomUUID().dbString(),
        readingProgress,
        member.clubId.dbString(),
        member.membershipId.dbString(),
    )
    if (updated == 0) {
        throwCurrentSessionWriteException(jdbcTemplate, member)
    }

    return mapOf("readingProgress" to readingProgress)
}
```

- [x] **Step 7: Update persistence adapter**

Replace the checkin adapter method:

```kotlin
override fun saveCheckin(command: SaveCheckinCommand): CheckinResult {
    val result = repository.saveCheckin(command.member, command.readingProgress)
    return CheckinResult(
        readingProgress = result.getValue("readingProgress") as Int,
    )
}
```

- [x] **Step 8: Save one-line reviews as SESSION**

In `SessionParticipationRepository.saveOneLineReview`, replace both occurrences of `'PRIVATE'` in the insert/select block with `'SESSION'`.

Use this selected value:

```sql
select ?, current_session.club_id, current_session.id, session_participants.membership_id, ?, 'SESSION'
```

- [x] **Step 9: Add DB assertion for one-line visibility**

In `MemberActionControllerDbTest.kt`, after saving one-line review, query visibility:

```kotlin
val oneLineReviewVisibility = jdbcTemplate.query(
    """
    select one_line_reviews.visibility
    from one_line_reviews
    join memberships on memberships.id = one_line_reviews.membership_id
      and memberships.club_id = one_line_reviews.club_id
    join users on users.id = memberships.user_id
    where one_line_reviews.session_id = '00000000-0000-0000-0000-000000009102'
      and users.email = 'member5@example.com'
    """.trimIndent(),
    { resultSet, _ -> resultSet.getString("visibility") },
).firstOrNull()
assertEquals("SESSION", oneLineReviewVisibility)
```

- [x] **Step 10: Run focused backend tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.application.service.SessionMemberWriteServiceTest \
  --tests com.readmates.note.api.CheckinControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: PASS.

- [x] **Step 11: Commit checkin write contract**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application/model/SessionMemberCommands.kt \
  server/src/main/kotlin/com/readmates/session/application/model/SessionMemberResults.kt \
  server/src/main/kotlin/com/readmates/note/adapter/in/web/CheckinController.kt \
  server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/LegacySessionParticipationWriteAdapter.kt \
  server/src/test/kotlin/com/readmates/session/application/service/SessionMemberWriteServiceTest.kt \
  server/src/test/kotlin/com/readmates/note/api/CheckinControllerTest.kt \
  server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt
git commit -m "feat: store reading progress without checkin notes"
```

---

### Task 3: Backend Current Session Board Contract

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`

- [x] **Step 1: Update current-session DB test expectations first**

In `CurrentSessionControllerDbTest.kt`, update assertions that inspect checkins:

```kotlin
jsonPath("$.currentSession.myCheckin.readingProgress") { value(72) }
jsonPath("$.currentSession.myCheckin.note") { doesNotExist() }
jsonPath("$.currentSession.board.checkins") { doesNotExist() }
jsonPath("$.currentSession.board.oneLineReviews.length()") { value(greaterThan(0)) }
jsonPath("$.currentSession.board.oneLineReviews[0].authorName") { exists() }
jsonPath("$.currentSession.board.oneLineReviews[0].authorShortName") { exists() }
jsonPath("$.currentSession.board.oneLineReviews[0].text") { exists() }
```

Add an assertion in the removed participant test:

```kotlin
jsonPath("$.currentSession.board.oneLineReviews[*].authorName") { value(not(hasItem("안멤버1"))) }
```

- [x] **Step 2: Run focused current session test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.CurrentSessionControllerDbTest
```

Expected: FAIL because the response still has `board.checkins` and lacks `board.oneLineReviews`.

- [x] **Step 3: Update application response models**

In `SessionApplicationModels.kt`, replace current-session checkin and board model declarations with:

```kotlin
data class CurrentSessionCheckin(
    val readingProgress: Int,
)

data class CurrentSessionBoard(
    val questions: List<CurrentSessionQuestion>,
    val oneLineReviews: List<BoardOneLineReview>,
    val highlights: List<BoardHighlight>,
)

data class BoardOneLineReview(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)
```

Remove the `BoardCheckin` data class.

- [x] **Step 4: Update my checkin query**

In `CurrentSessionRepository.findMyCheckin`, replace the selected columns and mapper:

```kotlin
select reading_progress
from reading_checkins
```

Mapper:

```kotlin
CurrentSessionCheckin(
    readingProgress = resultSet.getInt("reading_progress"),
)
```

- [x] **Step 5: Replace board checkin query with board one-line query**

Delete `findBoardCheckins` and add:

```kotlin
private fun findBoardOneLineReviews(jdbcTemplate: JdbcTemplate, sessionId: UUID, clubId: UUID): List<BoardOneLineReview> =
    jdbcTemplate.query(
        """
        select
          case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
          case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name,
          one_line_reviews.text
        from one_line_reviews
        join memberships on memberships.id = one_line_reviews.membership_id
          and memberships.club_id = one_line_reviews.club_id
        join users on users.id = memberships.user_id
        join session_participants on session_participants.session_id = one_line_reviews.session_id
          and session_participants.club_id = one_line_reviews.club_id
          and session_participants.membership_id = one_line_reviews.membership_id
          and session_participants.participation_status = 'ACTIVE'
        where one_line_reviews.session_id = ?
          and one_line_reviews.club_id = ?
          and one_line_reviews.visibility in ('SESSION', 'PUBLIC')
        order by one_line_reviews.created_at, users.name
        """.trimIndent(),
        { resultSet, _ ->
            BoardOneLineReview(
                authorName = resultSet.getString("author_name"),
                authorShortName = resultSet.getString("author_short_name"),
                text = resultSet.getString("text"),
            )
        },
        sessionId.dbString(),
        clubId.dbString(),
    )
```

- [x] **Step 6: Wire current-session board**

In `toCurrentSessionDetail`, replace board construction with:

```kotlin
board = CurrentSessionBoard(
    questions = findQuestions(jdbcTemplate, sessionId, member.clubId),
    oneLineReviews = findBoardOneLineReviews(jdbcTemplate, sessionId, member.clubId),
    highlights = findBoardHighlights(jdbcTemplate, sessionId, member.clubId),
)
```

- [x] **Step 7: Run focused current-session backend test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.CurrentSessionControllerDbTest
```

Expected: PASS.

- [x] **Step 8: Commit current-session contract**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt \
  server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt \
  server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt
git commit -m "feat: expose one-line reviews on current session board"
```

---

### Task 4: Backend Notes And Archive Contract

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
- Verify: `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`

- [ ] **Step 1: Update notes feed tests first**

In `ArchiveAndNotesDbTest.kt`, update note session count assertions for session 6:

```kotlin
jsonPath("$[0].questionCount") { value(6) }
jsonPath("$[0].oneLinerCount") { value(3) }
jsonPath("$[0].highlightCount") { value(3) }
jsonPath("$[0].checkinCount") { doesNotExist() }
jsonPath("$[0].totalCount") { value(12) }
```

Update removed participant count assertions:

```kotlin
jsonPath("$[?(@.sessionNumber == 6)].questionCount") { value(hasItem(4)) }
jsonPath("$[?(@.sessionNumber == 6)].oneLinerCount") { value(hasItem(2)) }
jsonPath("$[?(@.sessionNumber == 6)].highlightCount") { value(hasItem(2)) }
jsonPath("$[?(@.sessionNumber == 6)].checkinCount") { value(empty<Any>()) }
jsonPath("$[?(@.sessionNumber == 6)].totalCount") { value(hasItem(8)) }
```

Update feed kind assertion:

```kotlin
jsonPath("$[*].kind") {
    value(hasItems("QUESTION", "ONE_LINE_REVIEW", "HIGHLIGHT"))
}
jsonPath("$[*].kind") {
    value(not(hasItem("CHECKIN")))
}
```

- [ ] **Step 2: Update archive detail tests first**

In `ArchiveControllerDbTest.kt` and `ArchiveAndNotesDbTest.kt`, replace `clubCheckins` expectations with absence and `clubOneLiners` expectations:

```kotlin
jsonPath("$.clubCheckins") { doesNotExist() }
jsonPath("$.clubOneLiners.length()") { value(greaterThan(0)) }
jsonPath("$.clubOneLiners[*].authorName") { value(hasItem("김호스트")) }
jsonPath("$.clubOneLiners[*].text") { value(everyItem(not(emptyOrNullString()))) }
```

- [ ] **Step 3: Run focused archive tests and verify failures**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest
```

Expected: FAIL because response contracts still include `checkinCount`, `CHECKIN`, and `clubCheckins`.

- [ ] **Step 4: Update archive API models**

In `ArchiveController.kt`, remove:

```kotlin
val clubCheckins: List<MemberArchiveCheckinItem>,
```

Add:

```kotlin
val clubOneLiners: List<MemberArchiveOneLinerItem>,
```

Keep `myCheckin` as progress-only by replacing `MemberArchiveCheckinItem` with:

```kotlin
data class MemberArchiveCheckinItem(
    val authorName: String,
    val authorShortName: String,
    val readingProgress: Int,
)
```

- [ ] **Step 5: Update archive session detail query**

In `ArchiveSessionQueryRepository.findArchiveSessionDetail`, replace:

```kotlin
clubCheckins = findArchiveClubCheckins(jdbcTemplate, currentMember.clubId, sessionUuid),
publicOneLiners = findArchivePublicOneLiners(jdbcTemplate, currentMember.clubId, sessionUuid),
```

with:

```kotlin
clubOneLiners = findArchiveClubOneLiners(jdbcTemplate, currentMember.clubId, sessionUuid),
publicOneLiners = findArchivePublicOneLiners(jdbcTemplate, currentMember.clubId, sessionUuid),
```

Delete `findArchiveClubCheckins` and add:

```kotlin
private fun findArchiveClubOneLiners(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    sessionId: UUID,
): List<MemberArchiveOneLinerItem> =
    jdbcTemplate.query(
        """
        select
          case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
          case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name,
          one_line_reviews.text
        from one_line_reviews
        join memberships on memberships.id = one_line_reviews.membership_id
          and memberships.club_id = one_line_reviews.club_id
        join users on users.id = memberships.user_id
        join session_participants on session_participants.session_id = one_line_reviews.session_id
          and session_participants.club_id = one_line_reviews.club_id
          and session_participants.membership_id = one_line_reviews.membership_id
          and session_participants.participation_status = 'ACTIVE'
        where one_line_reviews.club_id = ?
          and one_line_reviews.session_id = ?
          and one_line_reviews.visibility in ('SESSION', 'PUBLIC')
        order by one_line_reviews.created_at, users.name
        """.trimIndent(),
        { resultSet, _ ->
            MemberArchiveOneLinerItem(
                authorName = resultSet.getString("author_name"),
                authorShortName = resultSet.getString("author_short_name"),
                text = resultSet.getString("text"),
            )
        },
        clubId.dbString(),
        sessionId.dbString(),
    )
```

- [ ] **Step 6: Update my checkin archive query**

In `findArchiveMyCheckin`, remove `reading_checkins.note` from the select and mapper:

```kotlin
select users.name as author_name, reading_checkins.reading_progress
```

Mapper:

```kotlin
MemberArchiveCheckinItem(
    authorName = authorName,
    authorShortName = shortNameFor(authorName),
    readingProgress = resultSet.getInt("reading_progress"),
)
```

- [ ] **Step 7: Remove CHECKIN from notes feed models**

In `NotesFeedQueryRepository.findNoteSessions`, remove the `checkin_count` subquery and construct:

```kotlin
NoteSessionItem(
    sessionId = resultSet.uuid("id").toString(),
    sessionNumber = resultSet.getInt("number"),
    bookTitle = resultSet.getString("book_title"),
    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
    questionCount = questionCount,
    oneLinerCount = oneLinerCount,
    highlightCount = highlightCount,
    totalCount = questionCount + oneLinerCount + highlightCount,
)
```

Remove both `CHECKIN` union branches from `findNotesFeed` and `findNotesFeedForSession`. Remove the corresponding SQL arguments so each query passes only the remaining question, one-line, and highlight arguments.

- [ ] **Step 8: Verify public query boundary**

Run this search:

```bash
rg -n "one_line_reviews\\.visibility = 'PUBLIC'" server/src/main/kotlin/com/readmates/publication/api/PublicController.kt
```

Expected: every public one-line review query still includes `one_line_reviews.visibility = 'PUBLIC'`.

- [ ] **Step 9: Run focused backend archive/public tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest \
  --tests com.readmates.publication.api.PublicControllerDbTest
```

Expected: PASS.

- [ ] **Step 10: Commit notes/archive contract**

Run:

```bash
git add server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt \
  server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt \
  server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt
git commit -m "feat: remove checkins from member notes and archive"
```

---

### Task 5: Frontend API Contracts And Fixtures

**Files:**
- Modify: `front/features/current-session/api/current-session-contracts.ts`
- Modify: `front/features/current-session/ui/current-session-types.ts`
- Modify: `front/features/current-session/api/current-session-api.ts`
- Modify: `front/features/current-session/actions/save-checkin.ts`
- Modify: `front/features/current-session/route/current-session-data.ts`
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/model/notes-feed-model.ts`
- Modify: `front/features/member-home/api/member-home-contracts.ts`
- Modify: `front/tests/unit/api-contract-fixtures.ts`
- Test: `front/tests/unit/current-session-actions.test.ts`
- Test: `front/tests/unit/current-session-model.test.ts`

- [ ] **Step 1: Update current-session action tests first**

In `front/tests/unit/current-session-actions.test.ts`, update checkin assertions to expect no `note` in the body:

```ts
await saveCurrentSessionCheckin(42);

expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/sessions/current/checkin",
  expect.objectContaining({
    method: "PUT",
    body: JSON.stringify({ readingProgress: 42 }),
  }),
);
```

Update route action payload test for checkin:

```ts
["checkin", { intent: "checkin", readingProgress: 35 }],
```

- [ ] **Step 2: Update board tab model test first**

In `current-session-model.test.ts`, replace the board tab expectation:

```ts
expect(
  getCurrentSessionBoardTabs({
    questions: [{ id: 1 }, { id: 2 }],
    oneLineReviews: [{ id: 1 }],
    highlights: [],
  }),
).toEqual([
  { key: "questions", label: "질문 · 2", count: 2 },
  { key: "oneLineReviews", label: "한줄평 · 1", count: 1 },
  { key: "highlights", label: "하이라이트 · 0", count: 0 },
]);
```

- [ ] **Step 3: Run focused frontend contract tests and verify failures**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/current-session-actions.test.ts tests/unit/current-session-model.test.ts
```

Expected: FAIL because the API still requires `note` and board tabs still use `checkins`.

- [ ] **Step 4: Update current-session contract types**

In both `current-session-contracts.ts` and `current-session-types.ts`, replace checkin and board shapes:

```ts
myCheckin: null | {
  readingProgress: number;
};
```

```ts
board: {
  questions: Array<{
    priority: number;
    text: string;
    draftThought: string | null;
    authorName: string;
    authorShortName: string;
  }>;
  oneLineReviews: Array<{
    authorName: string;
    authorShortName: string;
    text: string;
  }>;
  highlights: Array<{
    text: string;
    sortOrder: number;
  }>;
};
```

Replace `BoardCheckin` export with:

```ts
export type BoardOneLineReview = CurrentSession["board"]["oneLineReviews"][number];
```

- [ ] **Step 5: Update checkin API functions**

In `current-session-api.ts`, replace:

```ts
export type CheckinRequest = {
  readingProgress: number;
};
```

and:

```ts
export async function saveCurrentSessionCheckin(readingProgress: CheckinRequest["readingProgress"]) {
  return readmatesFetchResponse(
    "/api/sessions/current/checkin",
    jsonRequest({ method: "PUT" }, { readingProgress }),
  );
}
```

In `save-checkin.ts`, replace:

```ts
export async function saveCheckin(readingProgress: number) {
  return saveCurrentSessionCheckin(readingProgress);
}
```

In `current-session-data.ts`, remove `note` from `CurrentSessionActionPayload` and call:

```ts
const response = await saveCurrentSessionCheckin(readingProgress);
```

- [ ] **Step 6: Update view-model board tabs**

In `current-session-view-model.ts`, update types:

```ts
export type CurrentSessionBoard = {
  questions: readonly unknown[];
  oneLineReviews: readonly unknown[];
  highlights: readonly unknown[];
};

export type CurrentSessionBoardTab = "questions" | "oneLineReviews" | "highlights";
```

Replace tabs:

```ts
return [
  { key: "questions", label: `질문 · ${board.questions.length}`, count: board.questions.length },
  { key: "oneLineReviews", label: `한줄평 · ${board.oneLineReviews.length}`, count: board.oneLineReviews.length },
  { key: "highlights", label: `하이라이트 · ${board.highlights.length}`, count: board.highlights.length },
] satisfies Array<{ key: CurrentSessionBoardTab; label: string; count: number }>;
```

- [ ] **Step 7: Update archive and notes contract types**

In `archive-contracts.ts`, remove `CHECKIN` from `NoteFeedItem["kind"]`, remove `checkinCount` from `NoteSessionItem`, remove `clubCheckins`, and add:

```ts
clubOneLiners: MemberArchiveOneLinerItem[];
```

In `notes-feed-model.ts`, set:

```ts
export type FeedFilter = "all" | "questions" | "oneliners" | "highlights";
export type NoteFeedKind = "QUESTION" | "ONE_LINE_REVIEW" | "HIGHLIGHT";
```

Use filters:

```ts
export const noteFeedFilters: Array<{ key: FeedFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "questions", label: "질문" },
  { key: "oneliners", label: "한줄평" },
  { key: "highlights", label: "하이라이트" },
];
```

Remove `checkins` handling from `feedFilterFromSearchParam`, `noteKindLabel`, and `filterKind`.

- [ ] **Step 8: Update shared fixtures**

In `api-contract-fixtures.ts`, update `currentSessionContractFixture`:

```ts
myCheckin: {
  readingProgress: 72,
},
```

Replace `board.checkins` with:

```ts
oneLineReviews: [
  {
    authorName: "김호스트",
    authorShortName: "우",
    text: "API에서 온 공동 한줄평",
  },
],
```

In `archiveSessionDetailContractFixture`, remove `clubCheckins` and set:

```ts
clubOneLiners: [
  {
    authorName: "김호스트",
    authorShortName: "우",
    text: "낙관이 아니라 정확함의 문제였다.",
  },
],
myCheckin: {
  authorName: "이멤버5",
  authorShortName: "수",
  readingProgress: 100,
},
```

- [ ] **Step 9: Run focused frontend contract tests**

Run:

```bash
pnpm --dir front exec vitest run \
  tests/unit/current-session-actions.test.ts \
  tests/unit/current-session-model.test.ts \
  tests/unit/api-contract-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit frontend contracts**

Run:

```bash
git add front/features/current-session/api/current-session-contracts.ts \
  front/features/current-session/ui/current-session-types.ts \
  front/features/current-session/api/current-session-api.ts \
  front/features/current-session/actions/save-checkin.ts \
  front/features/current-session/route/current-session-data.ts \
  front/features/archive/api/archive-contracts.ts \
  front/features/archive/model/notes-feed-model.ts \
  front/features/member-home/api/member-home-contracts.ts \
  front/tests/unit/api-contract-fixtures.ts \
  front/tests/unit/current-session-actions.test.ts \
  front/tests/unit/current-session-model.test.ts
git commit -m "feat: update frontend progress and one-line contracts"
```

---

### Task 6: Current Session UI

**Files:**
- Modify: `front/features/current-session/ui/current-session-page.tsx`
- Modify: `front/features/current-session/ui/current-session-panels.tsx`
- Modify: `front/features/current-session/ui/current-session-mobile.tsx`
- Test: `front/tests/unit/current-session.test.tsx`

- [ ] **Step 1: Update current-session UI tests first**

In `current-session.test.tsx`, add or update assertions:

```ts
expect(desktopScope.queryByLabelText("체크인 메모")).not.toBeInTheDocument();
expect(desktopScope.queryByText("읽기 흔적")).not.toBeInTheDocument();
expect(desktopScope.getByRole("button", { name: /한줄평 · 1/ })).toBeInTheDocument();
```

For mobile:

```ts
expect(mobileScope.queryByLabelText("체크인 메모")).not.toBeInTheDocument();
expect(mobileScope.queryByText("읽기 흔적")).not.toBeInTheDocument();
expect(mobileScope.getByText("API에서 온 공동 한줄평")).toBeVisible();
```

Update save assertion:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/sessions/current/checkin",
  expect.objectContaining({
    method: "PUT",
    body: JSON.stringify({ readingProgress: 72 }),
  }),
);
```

- [ ] **Step 2: Run current-session tests and verify failures**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/current-session.test.tsx
```

Expected: FAIL because checkin memo UI and read-trace board still render.

- [ ] **Step 3: Update CurrentSessionBoard state and actions**

In `current-session-page.tsx`, remove:

```ts
const [checkinNote, setCheckinNote] = useState(session.myCheckin?.note ?? "");
```

Remove `handleCheckinNoteChange`. Replace `handleSaveCheckin` with:

```ts
const handleSaveCheckin = () => {
  if (blockReadOnlyWrite()) {
    return;
  }

  void runSave("checkin", () => actions.saveCheckin(readingProgress));
};
```

Update `CurrentSessionSaveActions`:

```ts
saveCheckin: (readingProgress: number) => Promise<void>;
```

- [ ] **Step 4: Update desktop CheckinPanel**

In `current-session-panels.tsx`, change props:

```ts
export function CheckinPanel({
  readingProgress,
  saveStatus,
  onReadingProgressChange,
  onSave,
}: {
  readingProgress: number;
  saveStatus: SaveState;
  onReadingProgressChange: (value: number) => void;
  onSave: () => void;
}) {
```

Use title and copy:

```tsx
<div className="eyebrow">읽기 진행률</div>
<div className="h4 editorial" style={{ marginTop: "6px" }}>
  어디까지 읽으셨어요?
</div>
```

Remove the note label, note helper, textarea, and old marginalia. Use:

```tsx
<p className="marginalia" style={{ margin: 0 }}>
  진행률은 내 준비 상태와 호스트 운영 확인에 사용됩니다.
</p>
```

Change button text:

```tsx
진행률 저장
```

- [ ] **Step 5: Add desktop one-line board component**

In `current-session-panels.tsx`, add:

```tsx
export function BoardOneLineReviews({ oneLineReviews }: { oneLineReviews: BoardOneLineReview[] }) {
  if (oneLineReviews.length === 0) {
    return <EmptyBoardState />;
  }

  return (
    <div className="grid-2">
      {oneLineReviews.map((review) => (
        <article
          key={`${review.authorName}-${review.text}`}
          style={{ padding: "22px", background: "var(--bg)", border: "1px solid var(--line-soft)", borderRadius: "10px" }}
        >
          <p className="body editorial" style={{ fontSize: "17px", margin: 0 }}>
            {review.text}
          </p>
          <div className="row tiny" style={{ marginTop: 12, gap: 8, color: "var(--text-3)" }}>
            <AvatarChip name={review.authorName} fallbackInitial={review.authorShortName} label={review.authorName} size={22} />
            {review.authorName}
          </div>
        </article>
      ))}
    </div>
  );
}
```

Import `BoardOneLineReview` from `current-session-types`.

- [ ] **Step 6: Wire desktop board tab rendering**

In `current-session-page.tsx`, replace checkins rendering:

```tsx
{boardTab === "oneLineReviews" ? <BoardOneLineReviews oneLineReviews={session.board.oneLineReviews} /> : null}
```

Remove the `BoardCheckins` import and add `BoardOneLineReviews`.

- [ ] **Step 7: Update one-line review input copy**

In `OneLineReviewPanel`, replace helper copy:

```tsx
저장하면 이번 세션 참여자가 함께 볼 수 있습니다.
```

Replace footer copy:

```tsx
세션 참여자 공개
```

- [ ] **Step 8: Update mobile props and progress card**

In `current-session-mobile.tsx`, remove `checkinNote` props and handlers from `MobileCurrentSessionBoard`, `MobilePrepSegment`, and `MobileViewerPrepSegment`.

In `MobilePrepSegment`, change section title and helper:

```tsx
<div className="eyebrow" style={{ marginBottom: 10 }}>
  읽기 진행률
</div>
```

Remove the note label, helper, and textarea. Use save button text:

```tsx
진행률 저장
```

- [ ] **Step 9: Add mobile one-line board list**

Add:

```tsx
function MobileOneLineReviewList({ oneLineReviews }: { oneLineReviews: BoardOneLineReview[] }) {
  if (oneLineReviews.length === 0) {
    return <MobileEmptyBoardState />;
  }

  return (
    <div className="rm-current-session-mobile__card-stack">
      {oneLineReviews.map((review) => (
        <article key={`${review.authorName}-${review.text}`} className="m-card">
          <div className="body editorial rm-current-session-mobile__board-text">{review.text}</div>
          <div className="m-row" style={{ gap: 8, marginTop: 10, color: "var(--text-3)" }}>
            <AvatarChip name={review.authorName} fallbackInitial={review.authorShortName} label={review.authorName} size={24} />
            <span className="tiny">{review.authorName}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
```

In `MobileBoardSegment`, remove the read-trace section and add:

```tsx
<section className="m-sec">
  <div className="m-eyebrow-row">
    <span className="eyebrow">한줄평</span>
    <span className="tiny mono" style={{ color: "var(--text-3)" }}>
      {session.board.oneLineReviews.length}
    </span>
  </div>
  <MobileOneLineReviewList oneLineReviews={session.board.oneLineReviews} />
</section>
```

- [ ] **Step 10: Update mobile one-line copy**

In `MobileRecordsSegment`, replace:

```tsx
세션 참여자에게 보이는 한 문장입니다.
```

and footer:

```tsx
세션 참여자 공개
```

- [ ] **Step 11: Run current-session UI tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/current-session.test.tsx
```

Expected: PASS.

- [ ] **Step 12: Commit current-session UI**

Run:

```bash
git add front/features/current-session/ui/current-session-page.tsx \
  front/features/current-session/ui/current-session-panels.tsx \
  front/features/current-session/ui/current-session-mobile.tsx \
  front/tests/unit/current-session.test.tsx
git commit -m "feat: show participant one-liners in current session"
```

---

### Task 7: Frontend Home, Notes, Archive, And Host Surfaces

**Files:**
- Modify: `front/features/member-home/components/member-home-current-session.tsx`
- Modify: `front/features/member-home/components/member-home-records.tsx`
- Modify: `front/features/archive/ui/notes-feed-list.tsx`
- Modify: `front/features/archive/ui/notes-feed-page.tsx`
- Modify: `front/features/archive/ui/notes-session-filter.tsx`
- Modify: `front/features/archive/model/archive-model.ts`
- Modify: `front/features/archive/ui/member-session-detail-page.tsx`
- Modify: `front/features/host/model/host-dashboard-model.ts`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Test: `front/tests/unit/member-home.test.tsx`
- Test: `front/tests/unit/notes-feed-page.test.tsx`
- Test: `front/tests/unit/notes-page.test.tsx`
- Test: `front/tests/unit/member-session-detail-page.test.tsx`
- Test: `front/tests/unit/host-dashboard.test.tsx`

- [ ] **Step 1: Update notes feed UI tests first**

In `notes-feed-page.test.tsx`, remove expectations for `읽기 흔적 5` and add:

```ts
expect(screen.queryByRole("button", { name: "읽기 흔적" })).not.toBeInTheDocument();
expect(screen.queryByText("읽기 흔적 5")).not.toBeInTheDocument();
```

Update record totals that previously included checkins by subtracting `checkinCount`.

- [ ] **Step 2: Update member archive detail tests first**

In `member-session-detail-page.test.tsx`, replace checkin list expectations with:

```ts
expect(screen.queryByText("체크인")).not.toBeInTheDocument();
expect(screen.getByText("낙관이 아니라 정확함의 문제였다.")).toBeInTheDocument();
```

- [ ] **Step 3: Run focused frontend surface tests and verify failures**

Run:

```bash
pnpm --dir front exec vitest run \
  tests/unit/member-home.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/notes-page.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/host-dashboard.test.tsx
```

Expected: FAIL because surfaces still render checkin feed labels and archive checkin records.

- [ ] **Step 4: Remove CHECKIN from member home feed labels**

In `member-home-records.tsx`, remove the `CHECKIN` branch from `noteKindLabel`. For unknown kinds, keep:

```ts
return kind;
```

Update mobile stats labels:

```tsx
<MobileStatCell label="읽기" value={`${readingProgress}`} sub={`${session?.myCheckin?.readingProgress ?? 0}%`} />
```

where:

```ts
const readingProgress = session?.myCheckin ? 1 : 0;
```

- [ ] **Step 5: Update member current session prep labels**

In `member-home-current-session.tsx`, change the prep step label:

```ts
{
  id: "read",
  label: "읽기",
  done: session.myCheckin !== null,
  hint: `${session.myCheckin?.readingProgress ?? 0}%`,
}
```

Change action tile label:

```tsx
<MobileActionTile label="읽기 진행률" sub={`${readingProgress}%`} href="/app/session/current" icon="02" />
```

- [ ] **Step 6: Remove checkin filter and section from notes feed**

In `notes-feed-list.tsx`, remove `FeedCheckins` and the render line:

```tsx
{(filter === "all" || filter === "checkins") && <FeedCheckins items={byKind(items, "CHECKIN")} />}
```

Update header copy in `notes-feed-page.tsx`:

```tsx
세션을 먼저 고르고, 질문·한줄평·하이라이트를 작성자와 함께 훑는 클럽 기록장입니다.
```

In `notes-session-filter.tsx`, ensure summary text no longer references `checkinCount`. Use `sessionRecordSummary(session)` from the model.

- [ ] **Step 7: Update archive model helpers**

In `archive-model.ts`, update `MemberArchiveSessionDetail`:

```ts
export type MemberArchiveSessionDetail = {
  myQuestions: readonly unknown[];
  myCheckin: unknown | null;
  myOneLineReview: unknown | null;
  myLongReview: unknown | null;
  publicHighlights: readonly unknown[];
  clubQuestions: readonly unknown[];
  clubOneLiners: readonly unknown[];
  publicOneLiners: readonly unknown[];
};
```

Update `hasClubRecords` to use:

```ts
return session.publicHighlights.length > 0 || session.clubQuestions.length > 0 || session.clubOneLiners.length > 0;
```

- [ ] **Step 8: Update archive detail UI**

In `member-session-detail-page.tsx`, update `ClubRecords` desktop groups:

```tsx
<RecordGroup title="클럽 질문">
  <QuestionList questions={session.clubQuestions} />
</RecordGroup>
<RecordGroup title="한줄평">
  <OneLinerList oneLiners={session.clubOneLiners} />
</RecordGroup>
```

Remove `CheckinList` from `ClubRecords`.

In `MyRecords`, replace the checkin group with a small progress-only record:

```tsx
{session.myCheckin ? (
  <RecordGroup title="내 읽기 진행률">
    <ReadingProgressRecord checkin={session.myCheckin} />
  </RecordGroup>
) : null}
```

Add:

```tsx
function ReadingProgressRecord({ checkin }: { checkin: MemberArchiveCheckinItem }) {
  return (
    <article className="surface-quiet" style={{ padding: "16px 18px" }}>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        저장된 진행률
      </div>
      <div className="h4 editorial" style={{ marginTop: 6 }}>
        {checkin.readingProgress}%
      </div>
    </article>
  );
}
```

Delete `CheckinList`.

- [ ] **Step 9: Update host dashboard copy**

In `host-dashboard-model.ts`, change session metric label:

```ts
["읽기", `${checkinCount}/${attendeeCount}`],
```

Change next operation copy:

```ts
title: "읽기 진행률과 질문 작성 현황 확인",
helper: `읽기 진행률 미작성 ${checkinMissing}명이 있습니다. 참석 roster와 질문 수를 같이 확인하세요.`,
```

In `host-dashboard.tsx`, change alert labels:

```ts
desktopLabel: "진행률 미작성",
mobileLabel: "진행률 미작성",
desktopHint: "읽기 상태 확인",
mobileHint: "읽기 상태 확인",
```

- [ ] **Step 10: Run focused frontend surface tests**

Run:

```bash
pnpm --dir front exec vitest run \
  tests/unit/member-home.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/notes-page.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit frontend surface cleanup**

Run:

```bash
git add front/features/member-home/components/member-home-current-session.tsx \
  front/features/member-home/components/member-home-records.tsx \
  front/features/archive/ui/notes-feed-list.tsx \
  front/features/archive/ui/notes-feed-page.tsx \
  front/features/archive/ui/notes-session-filter.tsx \
  front/features/archive/model/archive-model.ts \
  front/features/archive/ui/member-session-detail-page.tsx \
  front/features/host/model/host-dashboard-model.ts \
  front/features/host/components/host-dashboard.tsx \
  front/tests/unit/member-home.test.tsx \
  front/tests/unit/notes-feed-page.test.tsx \
  front/tests/unit/notes-page.test.tsx \
  front/tests/unit/member-session-detail-page.test.tsx \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "feat: remove read traces from member surfaces"
```

---

### Task 8: Final Contract Sweep And Verification

**Files:**
- Modify test files found by the searches in this task.
- Modify source files found by the searches in this task.

- [ ] **Step 1: Search for removed contract fields**

Run:

```bash
rg -n "board\\.checkins|clubCheckins|checkinCount|NoteFeedKind.*CHECKIN|kind: \"CHECKIN\"|체크인 메모|읽기 흔적|myCheckin\\.note|CheckinRequest.*note|CheckinResponse.*note" front server/src/main/kotlin server/src/test/kotlin
```

Expected: no matches for removed contract fields. Matches for deletion preview counts or table names are acceptable only when they refer to destructive session deletion metadata, not user-facing read traces.

- [ ] **Step 2: Fix remaining removed-contract matches**

For each non-acceptable match from Step 1, update it to the new contract:

```ts
board.oneLineReviews
```

or:

```kotlin
readingProgress
```

or remove the checkin feed reference if the file is a notes/archive/public surface.

- [ ] **Step 3: Search public boundary**

Run:

```bash
rg -n "visibility in \\('SESSION', 'PUBLIC'\\)|visibility = 'SESSION'" server/src/main/kotlin/com/readmates/publication server/src/main/kotlin/com/readmates/publication/api/PublicController.kt front/features/public
```

Expected: no matches. Public code must use only `visibility = 'PUBLIC'` for one-line reviews.

- [ ] **Step 4: Run focused backend suite**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.support.ReadmatesMySqlSeedTest \
  --tests com.readmates.session.application.service.SessionMemberWriteServiceTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.architecture.SessionCleanArchitectureBoundaryTest
```

Expected: PASS.

- [ ] **Step 5: Run focused frontend suite**

Run:

```bash
pnpm --dir front exec vitest run \
  tests/unit/api-contract-fixtures.test.ts \
  tests/unit/current-session-actions.test.ts \
  tests/unit/current-session-model.test.ts \
  tests/unit/current-session.test.tsx \
  tests/unit/member-home.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/notes-page.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/host-dashboard.test.tsx \
  tests/unit/public-home.test.tsx \
  tests/unit/public-records-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run build/lint smoke**

Run:

```bash
pnpm --dir front lint
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 7: Run full backend test if Docker is available**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS. If Docker/Testcontainers is unavailable, keep the focused backend results and record the Docker blocker in the final implementation summary.

- [ ] **Step 8: Final commit**

Run:

```bash
git status --short
git add front server
git commit -m "feat: complete reading progress and one-line board cleanup"
```

Expected: one final commit if Step 2 produced additional sweep fixes. If there are no unstaged changes after previous task commits, skip this commit and note that all work was already committed task-by-task.

---

## Self-Review

Spec coverage:

- DB note removal is covered by Task 1.
- Checkin request/response note removal is covered by Task 2 and Task 5.
- Current-session one-line board is covered by Task 3 and Task 6.
- Notes feed `CHECKIN` removal is covered by Task 4 and Task 7.
- Archive `clubCheckins` removal and `clubOneLiners` addition are covered by Task 4 and Task 7.
- Public `PUBLIC`-only boundary is covered by Task 4 and Task 8.
- Host progress signal preservation is covered by Task 7.

Placeholder scan:

- The plan contains concrete work items only.
- Each task has concrete files, commands, expected results, and commit commands.

Type consistency:

- Backend uses `BoardOneLineReview`.
- Frontend uses `BoardOneLineReview` and `board.oneLineReviews`.
- Archive member detail uses `clubOneLiners` for authenticated member-visible one-liners and keeps `publicOneLiners` for external-public semantics.
