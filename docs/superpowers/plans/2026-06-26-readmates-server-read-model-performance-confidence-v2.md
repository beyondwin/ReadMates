# ReadMates Server Read-Model Performance Confidence v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen server read-model performance confidence for `current-session` and `archive` session detail using public-safe large fixtures, query-budget guards, EXPLAIN guards, and current confidence documentation.

**Architecture:** Keep performance evidence in integration tests, query-plan tests, and test fixtures. Do not change API response shape, auth/BFF behavior, frontend routes, or UI. Production SQL changes are allowed only when a new guard proves a concrete query-shape problem.

**Tech Stack:** Kotlin, Spring Boot, MockMvc, MySQL/Testcontainers integration tests, JdbcTemplate, AssertJ, Gradle, Markdown docs.

## Global Constraints

- Keep the existing server architecture boundary: `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence`.
- Performance confidence belongs in tests and test fixtures, not in controllers or application services.
- Fixture values must remain public-safe: no real member data, private domains, deployment state, secrets, OCIDs, raw tokens, or token-shaped values.
- Do not change API response shape, auth, BFF, frontend route, or UI behavior.
- Do not add a production DB migration unless query-plan evidence proves an index is required.
- Do not turn duration smoke checks into hard release gates.
- Keep cleanup deterministic so seeded fixture rows do not leak into unrelated integration tests.
- Use `docs/development/release-readiness-review.md` only during implementation closeout if the branch changes release-risk evidence.

---

## File Structure

- Modify `server/src/test/kotlin/com/readmates/performance/LargeReadPathFixture.kt`
  - Add public-safe seed and cleanup methods for `current-session` and `archive` session detail.
  - Keep deterministic UUID prefixes grouped by table so cleanup is exact.
- Modify `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
  - Add one non-trivial `current-session` budget test.
  - Add one large-fixture `archive` session detail budget test.
- Modify `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`
  - Add EXPLAIN coverage for archive detail header, public batch, personal batch, and feedback document SQL.
- Modify `docs/showcase/engineering-confidence.md`
  - Replace stale server-state migration next-candidate text with the current completed status and server read-model performance follow-up.
- Optionally modify `docs/development/test-guide.md`
  - Only if the implementation adds or changes verification commands beyond those already documented.

---

### Task 1: Large Read-Path Fixtures

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/performance/LargeReadPathFixture.kt`
- Test: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt` in later tasks

**Interfaces:**
- Consumes: existing `LargeReadPathFixture(jdbcTemplate)` constructor.
- Produces:
  - `fun seedCurrentSession()`
  - `fun cleanupCurrentSession()`
  - `fun seedArchiveSessionDetail(artifactCount: Int = 40)`
  - `fun cleanupArchiveSessionDetail()`
  - `fun currentSessionId(): String`
  - `fun archiveDetailSessionId(): String`
  - `fun cleanupAllPerformanceFixtures()`

- [ ] **Step 1: Add failing calls from a temporary compile check**

Add this temporary method to `ServerQueryBudgetTest` near the existing notes-feed tests. This is only to prove the fixture interface is missing before implementation:

```kotlin
@Test
fun `large read path fixture exposes current session and archive setup`() {
    largeFixture.seedCurrentSession()
    largeFixture.seedArchiveSessionDetail()

    assertThat(largeFixture.currentSessionId()).isEqualTo("10000000-0000-0000-0100-000000000001")
    assertThat(largeFixture.archiveDetailSessionId()).isEqualTo("10000000-0000-0000-0200-000000000001")
}
```

- [ ] **Step 2: Run compile to verify it fails**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: FAIL during Kotlin compilation with unresolved references for `seedCurrentSession`, `seedArchiveSessionDetail`, `currentSessionId`, and `archiveDetailSessionId`.

- [ ] **Step 3: Remove the temporary compile-check test**

Delete the temporary method added in Step 1. The real endpoint tests are added in later tasks.

- [ ] **Step 4: Add fixture cleanup wiring**

Modify `LargeReadPathFixture.kt` by adding these public methods after `cleanupNotesFeed()`:

```kotlin
fun cleanupAllPerformanceFixtures() {
    cleanupCurrentSession()
    cleanupArchiveSessionDetail()
    cleanupNotesFeed()
}

fun cleanupCurrentSession() {
    jdbcTemplate.update("delete from highlights where id like '10000000-0000-0000-0104-%'")
    jdbcTemplate.update("delete from long_reviews where id like '10000000-0000-0000-0103-%'")
    jdbcTemplate.update("delete from one_line_reviews where id like '10000000-0000-0000-0102-%'")
    jdbcTemplate.update("delete from questions where id like '10000000-0000-0000-0101-%'")
    jdbcTemplate.update("delete from reading_checkins where id like '10000000-0000-0000-0106-%'")
    jdbcTemplate.update("delete from session_participants where id like '10000000-0000-0000-0105-%'")
    jdbcTemplate.update("delete from sessions where id like '10000000-0000-0000-0100-%'")
}

fun cleanupArchiveSessionDetail() {
    jdbcTemplate.update("delete from session_feedback_documents where id like '10000000-0000-0000-0207-%'")
    jdbcTemplate.update("delete from feedback_reports where id like '10000000-0000-0000-0208-%'")
    jdbcTemplate.update("delete from highlights where id like '10000000-0000-0000-0204-%'")
    jdbcTemplate.update("delete from long_reviews where id like '10000000-0000-0000-0203-%'")
    jdbcTemplate.update("delete from one_line_reviews where id like '10000000-0000-0000-0202-%'")
    jdbcTemplate.update("delete from questions where id like '10000000-0000-0000-0201-%'")
    jdbcTemplate.update("delete from reading_checkins where id like '10000000-0000-0000-0206-%'")
    jdbcTemplate.update("delete from session_participants where id like '10000000-0000-0000-0205-%'")
    jdbcTemplate.update("delete from public_session_publications where id like '10000000-0000-0000-0209-%'")
    jdbcTemplate.update("delete from sessions where id like '10000000-0000-0000-0200-%'")
}
```

- [ ] **Step 5: Add current-session seed methods**

Add these methods to `LargeReadPathFixture.kt` after the cleanup methods:

```kotlin
fun seedCurrentSession() {
    cleanupCurrentSession()
    insertCurrentSession()
    insertCurrentSessionParticipants()
    insertCurrentSessionReadingArtifacts()
    refreshTableStatistics()
}

fun currentSessionId(): String = CURRENT_SESSION_ID

private fun insertCurrentSession() {
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, session_date,
          start_time, end_time, location_label, question_deadline_at, state, visibility
        )
        values (?, ?, 9001, 'Current session performance fixture', 'Current fixture book',
          'Fixture Author', '2026-09-01', '19:30:00', '21:30:00', 'Online',
          '2026-08-31 14:59:00.000000', 'OPEN', 'MEMBER')
        """.trimIndent(),
        CURRENT_SESSION_ID,
        CLUB_ID,
    )
}

private fun insertCurrentSessionParticipants() {
    jdbcTemplate.batchUpdate(
        """
        insert into session_participants (
          id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
        )
        values (?, ?, ?, ?, 'GOING', 'UNKNOWN', 'ACTIVE')
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                val membershipId = if (i % 2 == 0) MEMBER_5_ID else MEMBER_4_ID
                ps.setString(1, currentParticipantId(i + 1))
                ps.setString(2, CLUB_ID)
                ps.setString(3, CURRENT_SESSION_ID)
                ps.setString(4, membershipId)
            }

            override fun getBatchSize(): Int = 2
        },
    )
}

private fun insertCurrentSessionReadingArtifacts() {
    jdbcTemplate.update(
        """
        insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
        values (?, ?, ?, ?, 67, 'Current fixture reading note')
        """.trimIndent(),
        currentCheckinId(1),
        CLUB_ID,
        CURRENT_SESSION_ID,
        MEMBER_5_ID,
    )
    jdbcTemplate.batchUpdate(
        """
        insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought, created_at)
        values (?, ?, ?, ?, ?, ?, null, timestampadd(second, ?, '2026-09-01 00:00:00.000000'))
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                val priority = i + 1
                ps.setString(1, currentQuestionId(priority))
                ps.setString(2, CLUB_ID)
                ps.setString(3, CURRENT_SESSION_ID)
                ps.setString(4, if (i % 2 == 0) MEMBER_5_ID else MEMBER_4_ID)
                ps.setInt(5, priority)
                ps.setString(6, "Current fixture question $priority")
                ps.setInt(7, i)
            }

            override fun getBatchSize(): Int = 4
        },
    )
    jdbcTemplate.update(
        """
        insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility, created_at)
        values (?, ?, ?, ?, 'Current fixture one-line review', 'PUBLIC', '2026-09-01 00:10:00.000000')
        """.trimIndent(),
        currentOneLineId(1),
        CLUB_ID,
        CURRENT_SESSION_ID,
        MEMBER_5_ID,
    )
    jdbcTemplate.update(
        """
        insert into long_reviews (id, club_id, session_id, membership_id, body, visibility, created_at)
        values (?, ?, ?, ?, 'Current fixture long review', 'PUBLIC', '2026-09-01 00:20:00.000000')
        """.trimIndent(),
        currentLongReviewId(1),
        CLUB_ID,
        CURRENT_SESSION_ID,
        MEMBER_4_ID,
    )
    jdbcTemplate.batchUpdate(
        """
        insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
        values (?, ?, ?, null, ?, ?, timestampadd(second, ?, '2026-09-01 00:30:00.000000'))
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                val offset = i + 1
                ps.setString(1, currentHighlightId(offset))
                ps.setString(2, CLUB_ID)
                ps.setString(3, CURRENT_SESSION_ID)
                ps.setString(4, "Current fixture highlight $offset")
                ps.setInt(5, offset)
                ps.setInt(6, i)
            }

            override fun getBatchSize(): Int = 8
        },
    )
}
```

- [ ] **Step 6: Add archive detail seed methods**

Add these methods to `LargeReadPathFixture.kt` after the current-session methods:

```kotlin
fun seedArchiveSessionDetail(artifactCount: Int = 40) {
    cleanupArchiveSessionDetail()
    insertArchiveDetailSession()
    insertArchiveDetailPublication()
    insertArchiveDetailParticipants()
    insertArchiveDetailArtifacts(artifactCount.coerceIn(4, 80))
    insertArchiveDetailFeedbackDocument()
    refreshTableStatistics()
}

fun archiveDetailSessionId(): String = ARCHIVE_DETAIL_SESSION_ID

private fun insertArchiveDetailSession() {
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, session_date,
          start_time, end_time, location_label, question_deadline_at, state, visibility
        )
        values (?, ?, 9002, 'Archive detail performance fixture', 'Archive fixture book',
          'Fixture Author', '2026-09-08', '19:30:00', '21:30:00', 'Online',
          '2026-09-07 14:59:00.000000', 'PUBLISHED', 'PUBLIC')
        """.trimIndent(),
        ARCHIVE_DETAIL_SESSION_ID,
        CLUB_ID,
    )
}

private fun insertArchiveDetailPublication() {
    jdbcTemplate.update(
        """
        insert into public_session_publications (
          id, club_id, session_id, public_summary, is_public, visibility, published_at
        )
        values (?, ?, ?, 'Archive detail fixture public summary', true, 'PUBLIC', '2026-09-08 12:00:00.000000')
        """.trimIndent(),
        archivePublicationId(1),
        CLUB_ID,
        ARCHIVE_DETAIL_SESSION_ID,
    )
}

private fun insertArchiveDetailParticipants() {
    jdbcTemplate.batchUpdate(
        """
        insert into session_participants (
          id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
        )
        values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                ps.setString(1, archiveParticipantId(i + 1))
                ps.setString(2, CLUB_ID)
                ps.setString(3, ARCHIVE_DETAIL_SESSION_ID)
                ps.setString(4, if (i == 0) MEMBER_5_ID else MEMBER_4_ID)
            }

            override fun getBatchSize(): Int = 2
        },
    )
}

private fun insertArchiveDetailArtifacts(artifactCount: Int) {
    jdbcTemplate.update(
        """
        insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
        values (?, ?, ?, ?, 100, 'Archive detail fixture reading note')
        """.trimIndent(),
        archiveCheckinId(1),
        CLUB_ID,
        ARCHIVE_DETAIL_SESSION_ID,
        MEMBER_5_ID,
    )
    jdbcTemplate.batchUpdate(
        """
        insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought, created_at)
        values (?, ?, ?, ?, ?, ?, null, timestampadd(second, ?, '2026-09-08 00:00:00.000000'))
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                val priority = (i % 5) + 1
                ps.setString(1, archiveQuestionId(i + 1))
                ps.setString(2, CLUB_ID)
                ps.setString(3, ARCHIVE_DETAIL_SESSION_ID)
                ps.setString(4, if (i % 2 == 0) MEMBER_5_ID else MEMBER_4_ID)
                ps.setInt(5, priority)
                ps.setString(6, "Archive fixture question ${i + 1}")
                ps.setInt(7, i)
            }

            override fun getBatchSize(): Int = minOf(artifactCount, 10)
        },
    )
    jdbcTemplate.update(
        """
        insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility, created_at)
        values (?, ?, ?, ?, 'Archive fixture one-line review', 'PUBLIC', '2026-09-08 00:10:00.000000')
        """.trimIndent(),
        archiveOneLineId(1),
        CLUB_ID,
        ARCHIVE_DETAIL_SESSION_ID,
        MEMBER_5_ID,
    )
    jdbcTemplate.update(
        """
        insert into long_reviews (id, club_id, session_id, membership_id, body, visibility, created_at)
        values (?, ?, ?, ?, 'Archive fixture long review', 'PUBLIC', '2026-09-08 00:20:00.000000')
        """.trimIndent(),
        archiveLongReviewId(1),
        CLUB_ID,
        ARCHIVE_DETAIL_SESSION_ID,
        MEMBER_5_ID,
    )
    jdbcTemplate.batchUpdate(
        """
        insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
        values (?, ?, ?, null, ?, ?, timestampadd(second, ?, '2026-09-08 00:30:00.000000'))
        """.trimIndent(),
        object : BatchPreparedStatementSetter {
            override fun setValues(ps: PreparedStatement, i: Int) {
                val offset = i + 1
                ps.setString(1, archiveHighlightId(offset))
                ps.setString(2, CLUB_ID)
                ps.setString(3, ARCHIVE_DETAIL_SESSION_ID)
                ps.setString(4, "Archive fixture highlight $offset")
                ps.setInt(5, offset)
                ps.setInt(6, i)
            }

            override fun getBatchSize(): Int = artifactCount
        },
    )
}

private fun insertArchiveDetailFeedbackDocument() {
    jdbcTemplate.update(
        """
        insert into session_feedback_documents (
          id, club_id, session_id, version, source_text, file_name, content_type, file_size, created_at
        )
        values (?, ?, ?, 1, 'Archive fixture feedback document', 'archive-fixture.md', 'text/markdown', 128,
          '2026-09-08 01:00:00.000000')
        """.trimIndent(),
        archiveFeedbackDocumentId(1),
        CLUB_ID,
        ARCHIVE_DETAIL_SESSION_ID,
    )
}
```

- [ ] **Step 7: Add deterministic id helpers and constants**

Add these helpers near the existing id helper functions:

```kotlin
private fun currentQuestionId(offset: Int) = "10000000-0000-0000-0101-${offset.toString().padStart(12, '0')}"

private fun currentOneLineId(offset: Int) = "10000000-0000-0000-0102-${offset.toString().padStart(12, '0')}"

private fun currentLongReviewId(offset: Int) = "10000000-0000-0000-0103-${offset.toString().padStart(12, '0')}"

private fun currentHighlightId(offset: Int) = "10000000-0000-0000-0104-${offset.toString().padStart(12, '0')}"

private fun currentParticipantId(offset: Int) = "10000000-0000-0000-0105-${offset.toString().padStart(12, '0')}"

private fun currentCheckinId(offset: Int) = "10000000-0000-0000-0106-${offset.toString().padStart(12, '0')}"

private fun archiveQuestionId(offset: Int) = "10000000-0000-0000-0201-${offset.toString().padStart(12, '0')}"

private fun archiveOneLineId(offset: Int) = "10000000-0000-0000-0202-${offset.toString().padStart(12, '0')}"

private fun archiveLongReviewId(offset: Int) = "10000000-0000-0000-0203-${offset.toString().padStart(12, '0')}"

private fun archiveHighlightId(offset: Int) = "10000000-0000-0000-0204-${offset.toString().padStart(12, '0')}"

private fun archiveParticipantId(offset: Int) = "10000000-0000-0000-0205-${offset.toString().padStart(12, '0')}"

private fun archiveCheckinId(offset: Int) = "10000000-0000-0000-0206-${offset.toString().padStart(12, '0')}"

private fun archiveFeedbackDocumentId(offset: Int) = "10000000-0000-0000-0207-${offset.toString().padStart(12, '0')}"

private fun archivePublicationId(offset: Int) = "10000000-0000-0000-0209-${offset.toString().padStart(12, '0')}"
```

Add these constants inside the companion object:

```kotlin
private const val CURRENT_SESSION_ID = "10000000-0000-0000-0100-000000000001"
private const val ARCHIVE_DETAIL_SESSION_ID = "10000000-0000-0000-0200-000000000001"
```

- [ ] **Step 8: Expand table statistics refresh**

Replace the SQL inside `refreshTableStatistics()` with:

```kotlin
jdbcTemplate.execute(
    """
    analyze table sessions, session_participants, questions, one_line_reviews, long_reviews,
      highlights, reading_checkins, public_session_publications, session_feedback_documents
    """.trimIndent(),
)
```

- [ ] **Step 9: Run focused integration compile**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: PASS or test failures only from later budget assertions that have not been added yet. Kotlin compilation must pass.

- [ ] **Step 10: Commit fixture work**

Run:

```bash
git add server/src/test/kotlin/com/readmates/performance/LargeReadPathFixture.kt
git commit -m "test(server): add large read path fixtures"
```

---

### Task 2: Current-Session Query Budget Guard

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`

**Interfaces:**
- Consumes: `LargeReadPathFixture.seedCurrentSession`, `cleanupAllPerformanceFixtures`.
- Produces: a regression guard that proves `/api/sessions/current` remains bounded for a non-trivial open session.

- [ ] **Step 1: Update cleanup**

Replace the `cleanupAuthSessions()` fixture cleanup line:

```kotlin
largeFixture.cleanupNotesFeed()
```

with:

```kotlin
largeFixture.cleanupAllPerformanceFixtures()
```

- [ ] **Step 2: Add the failing current-session budget test**

Add this test after `current session stays within observed empty-state query budget`:

```kotlin
@Test
fun `current session large fixture stays within bounded read-model query budget`() {
    largeFixture.seedCurrentSession()

    assertQueryBudget(
        budget = 14,
        reason = "current-session hydrates session, requester state, board artifacts, and attendees as a bounded read model",
    ) {
        mockMvc
            .get("/api/sessions/current") {
                with(user("member5@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isOk() }
                jsonPath("$.currentSession.sessionId") { value(largeFixture.currentSessionId()) }
                jsonPath("$.currentSession.attendees.length()") { value(2) }
                jsonPath("$.currentSession.myCheckin.readingProgress") { value(67) }
                jsonPath("$.currentSession.board.questions.length()") { value(4) }
                jsonPath("$.currentSession.board.longReviews.length()") { value(1) }
            }
    }
}
```

- [ ] **Step 3: Run the current-session test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest.current\ session\ large\ fixture\ stays\ within\ bounded\ read-model\ query\ budget
```

Expected before fixture work is correct: FAIL with a concrete assertion, SQL, or fixture error. Expected after fixture work is correct: PASS.

- [ ] **Step 4: If the query budget is exceeded, inspect the counted query count**

Temporarily add this line inside `assertQueryBudget` immediately before the AssertJ assertion:

```kotlin
println("QueryCounter.count=${QueryCounter.count()}")
```

Run the same focused test. If the count is `15` or lower and every query maps to a bounded section of the current-session model, update the budget to that exact number and revise the reason to name the added bounded section. If the count grows after adding more fixture artifacts, fix the SQL or query orchestration before raising the budget. Remove the `println` before committing.

- [ ] **Step 5: Run the full budget test class**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: PASS.

- [ ] **Step 6: Commit current-session guard**

Run:

```bash
git add server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt
git commit -m "test(server): guard current session read model budget"
```

---

### Task 3: Archive Detail Query Budget And EXPLAIN Guards

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`

**Interfaces:**
- Consumes: `LargeReadPathFixture.seedArchiveSessionDetail`, `archiveDetailSessionId`, and `cleanupAllPerformanceFixtures`.
- Produces:
  - endpoint-level budget guard for `/api/archive/sessions/{sessionId}`
  - EXPLAIN guards for archive detail header, public batch, personal batch, and feedback document lookup

- [ ] **Step 1: Add archive detail endpoint budget test**

Add this test after `archive session detail stays within hydrated-detail query budget`:

```kotlin
@Test
fun `archive session detail large fixture stays within hydrated-detail query budget`() {
    largeFixture.seedArchiveSessionDetail(artifactCount = 40)

    assertQueryBudget(
        budget = 14,
        reason = "archive detail hydrates header, public sections, personal sections, and feedback document with fixed query count",
    ) {
        mockMvc
            .get("/api/archive/sessions/${largeFixture.archiveDetailSessionId()}") {
                with(user("member5@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(largeFixture.archiveDetailSessionId()) }
                jsonPath("$.publicHighlights.length()") { value(40) }
                jsonPath("$.clubQuestions.length()") { value(10) }
                jsonPath("$.feedbackDocument.available") { value(true) }
                jsonPath("$.feedbackDocument.readable") { value(true) }
            }
    }
}
```

- [ ] **Step 2: Run archive budget test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest.archive\ session\ detail\ large\ fixture\ stays\ within\ hydrated-detail\ query\ budget
```

Expected: PASS after the Task 1 fixture is correct. If it fails from JSON path names, inspect `ArchiveWebDtos.kt` and correct the assertion to match the existing response DTO without changing production response shape.

- [ ] **Step 3: Add archive detail EXPLAIN test**

Add this test to `MySqlQueryPlanTest` before `host member paged query uses indexed access on memberships`:

```kotlin
@Test
fun `archive session detail queries use indexed access on hydrated detail tables`() {
    largeFixture.seedArchiveSessionDetail(artifactCount = 40)

    val headerPlan =
        jdbcTemplate.explain(
            """
            select
              sessions.id,
              sessions.number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              sessions.state,
              sessions.location_label,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.attendance_status = 'ATTENDED'
                  and session_participants.participation_status = 'ACTIVE'
              ) as attendance,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.participation_status = 'ACTIVE'
              ) as total,
              current_participant.attendance_status as my_attendance_status,
              case
                when public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                  then public_session_publications.public_summary
                else null
              end as public_summary
            from sessions
            left join session_participants current_participant on current_participant.session_id = sessions.id
              and current_participant.club_id = sessions.club_id
              and current_participant.membership_id = ?
              and current_participant.participation_status = 'ACTIVE'
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and sessions.club_id = ?
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            """.trimIndent(),
            MEMBER_5_ID,
            largeFixture.archiveDetailSessionId(),
            READING_SAI_CLUB_ID,
        )

    headerPlan.assertUsesIndexFor("sessions", "archive detail session lookup")
    headerPlan.assertUsesIndexFor("current_participant", "archive detail current participant join")
    headerPlan.assertUsesIndexFor("public_session_publications", "archive detail publication join")
    headerPlan.assertUsesIndexFor("session_participants", "archive detail attendance subqueries")

    val publicBatchPlan =
        jdbcTemplate.explain(
            ARCHIVE_DETAIL_PUBLIC_BATCH_PLAN_SQL,
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
        )

    publicBatchPlan.assertUsesIndexFor("highlights", "archive detail public highlights")
    publicBatchPlan.assertUsesIndexFor("questions", "archive detail club questions")
    publicBatchPlan.assertUsesIndexFor("one_line_reviews", "archive detail one-line sections")
    publicBatchPlan.assertUsesIndexFor("session_participants", "archive detail active participant filters")

    val personalBatchPlan =
        jdbcTemplate.explain(
            ARCHIVE_DETAIL_PERSONAL_BATCH_PLAN_SQL,
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            MEMBER_5_ID,
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            MEMBER_5_ID,
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            MEMBER_5_ID,
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
            MEMBER_5_ID,
        )

    personalBatchPlan.assertUsesIndexFor("questions", "archive detail personal questions")
    personalBatchPlan.assertUsesIndexFor("reading_checkins", "archive detail personal checkin")
    personalBatchPlan.assertUsesIndexFor("one_line_reviews", "archive detail personal one-line review")
    personalBatchPlan.assertUsesIndexFor("long_reviews", "archive detail personal long review")
    personalBatchPlan.assertUsesIndexFor("session_participants", "archive detail personal active participant filters")

    val feedbackPlan =
        jdbcTemplate.explain(
            """
            select created_at
            from session_feedback_documents
            where club_id = ?
              and session_id = ?
            order by version desc, created_at desc
            limit 1
            """.trimIndent(),
            READING_SAI_CLUB_ID,
            largeFixture.archiveDetailSessionId(),
        )

    feedbackPlan.assertUsesIndexFor("session_feedback_documents", "archive detail feedback document lookup")
}
```

- [ ] **Step 4: Add archive detail EXPLAIN SQL constants**

Add these constants inside the `companion object` in `MySqlQueryPlanTest` before `NOTES_FEED_PLAN_SQL`:

```kotlin
private const val MEMBER_5_ID = "00000000-0000-0000-0000-000000000206"

private const val ARCHIVE_DETAIL_PUBLIC_BATCH_PLAN_SQL = """
    select 'HIGHLIGHT' as section,
      highlights.sort_order,
      null as priority,
      highlights.text,
      null as draft_thought,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
    from highlights
    left join memberships on memberships.id = highlights.membership_id
      and memberships.club_id = highlights.club_id
    left join users on users.id = memberships.user_id
    left join session_participants on session_participants.session_id = highlights.session_id
      and session_participants.club_id = highlights.club_id
      and session_participants.membership_id = highlights.membership_id
    where highlights.club_id = ?
      and highlights.session_id = ?
      and (
        highlights.membership_id is null
        or session_participants.participation_status = 'ACTIVE'
      )

    UNION ALL

    select 'CLUB_QUESTION' as section,
      null as sort_order,
      questions.priority,
      questions.text,
      questions.draft_thought,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
    from questions
    join memberships on memberships.id = questions.membership_id
      and memberships.club_id = questions.club_id
    join users on users.id = memberships.user_id
    join session_participants on session_participants.session_id = questions.session_id
      and session_participants.club_id = questions.club_id
      and session_participants.membership_id = questions.membership_id
      and session_participants.participation_status = 'ACTIVE'
    where questions.club_id = ?
      and questions.session_id = ?

    UNION ALL

    select 'CLUB_ONE_LINER' as section,
      null as sort_order,
      null as priority,
      one_line_reviews.text,
      null as draft_thought,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
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

    UNION ALL

    select 'PUBLIC_ONE_LINER' as section,
      null as sort_order,
      null as priority,
      one_line_reviews.text,
      null as draft_thought,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
      case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
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
      and one_line_reviews.visibility = 'PUBLIC'
"""

private const val ARCHIVE_DETAIL_PERSONAL_BATCH_PLAN_SQL = """
    select 'MY_QUESTION' as section,
      questions.priority,
      questions.text,
      questions.draft_thought,
      null as reading_progress,
      null as body,
      coalesce(memberships.short_name, users.name) as author_name,
      CASE WHEN memberships.status = 'LEFT' THEN '탈퇴한 멤버' ELSE coalesce(memberships.short_name, users.name) END as author_short_name
    from questions
    join memberships on memberships.id = questions.membership_id
      and memberships.club_id = questions.club_id
    join users on users.id = memberships.user_id
    join session_participants on session_participants.session_id = questions.session_id
      and session_participants.club_id = questions.club_id
      and session_participants.membership_id = questions.membership_id
      and session_participants.participation_status = 'ACTIVE'
    where questions.club_id = ?
      and questions.session_id = ?
      and questions.membership_id = ?

    UNION ALL

    select 'MY_CHECKIN' as section,
      null as priority,
      null as text,
      null as draft_thought,
      reading_checkins.reading_progress,
      null as body,
      null as author_name,
      null as author_short_name
    from reading_checkins
    join session_participants on session_participants.session_id = reading_checkins.session_id
      and session_participants.club_id = reading_checkins.club_id
      and session_participants.membership_id = reading_checkins.membership_id
      and session_participants.participation_status = 'ACTIVE'
    where reading_checkins.club_id = ?
      and reading_checkins.session_id = ?
      and reading_checkins.membership_id = ?

    UNION ALL

    select 'MY_ONE_LINE_REVIEW' as section,
      null as priority,
      one_line_reviews.text,
      null as draft_thought,
      null as reading_progress,
      null as body,
      coalesce(memberships.short_name, users.name) as author_name,
      CASE WHEN memberships.status = 'LEFT' THEN '탈퇴한 멤버' ELSE coalesce(memberships.short_name, users.name) END as author_short_name
    from one_line_reviews
    join memberships on memberships.id = one_line_reviews.membership_id
      and memberships.club_id = one_line_reviews.club_id
    join users on users.id = memberships.user_id
    where one_line_reviews.club_id = ?
      and one_line_reviews.session_id = ?
      and one_line_reviews.membership_id = ?
      and exists (
        select 1
        from session_participants
        where session_participants.session_id = one_line_reviews.session_id
          and session_participants.club_id = one_line_reviews.club_id
          and session_participants.membership_id = one_line_reviews.membership_id
          and session_participants.participation_status = 'ACTIVE'
      )

    UNION ALL

    select 'MY_LONG_REVIEW' as section,
      null as priority,
      null as text,
      null as draft_thought,
      null as reading_progress,
      long_reviews.body,
      null as author_name,
      null as author_short_name
    from long_reviews
    where long_reviews.club_id = ?
      and long_reviews.session_id = ?
      and long_reviews.membership_id = ?
      and exists (
        select 1
        from session_participants
        where session_participants.session_id = long_reviews.session_id
          and session_participants.club_id = long_reviews.club_id
          and session_participants.membership_id = long_reviews.membership_id
          and session_participants.participation_status = 'ACTIVE'
      )
"""
```

- [ ] **Step 5: Run archive EXPLAIN test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest.archive\ session\ detail\ queries\ use\ indexed\ access\ on\ hydrated\ detail\ tables
```

Expected: PASS. If an assertion fails because MySQL names a table alias differently, adjust the assertion table name to match the EXPLAIN output without removing the table coverage.

- [ ] **Step 6: Run focused performance tests**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Expected: PASS.

- [ ] **Step 7: Commit archive performance guards**

Run:

```bash
git add server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt \
  server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt
git commit -m "test(server): guard archive detail read model performance"
```

---

### Task 4: Confidence Documentation

**Files:**
- Modify: `docs/showcase/engineering-confidence.md`
- Modify if commands changed: `docs/development/test-guide.md`

**Interfaces:**
- Consumes: passing performance guard commands from Tasks 2 and 3.
- Produces: docs that name the current server-state migration status and active read-model performance confidence work.

- [ ] **Step 1: Replace stale server-state migration section**

In `docs/showcase/engineering-confidence.md`, replace the whole section from `## Frontend Server-State Migration` through the three numbered next candidates with:

```markdown
## Frontend Server-State Migration

Current source: `docs/development/server-state-migration.md`

The major TanStack Query migration surfaces are complete through public read paths and platform-admin operating console surfaces. New server state should continue to follow the route-owned loader/action pattern and feature-owned `queries` modules, but the active confidence follow-up is no longer another frontend migration slice.

Active follow-up:

1. Server read-model performance confidence v2 — large-fixture query budget and EXPLAIN guards for `current-session` and `archive` session detail.

Migration rule: route modules own loader/action coordination, UI components stay prop/callback driven, and new Query helpers live under `front/features/<feature>/queries/`.
```

- [ ] **Step 2: Add targeted backend verification command if missing**

If `docs/development/test-guide.md` does not already name the exact targeted performance command, add this paragraph under the backend section after the existing targeted integration command block:

````markdown
For read-model performance work, keep query count and EXPLAIN guards together so a lower query count does not hide a weak access path:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```
````

If the same command is already present with the same meaning, do not edit `docs/development/test-guide.md`.

- [ ] **Step 3: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/showcase/engineering-confidence.md docs/development/test-guide.md
```

Expected: no output.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/showcase/engineering-confidence.md docs/development/test-guide.md
git commit -m "docs: align performance confidence guidance"
```

If `docs/development/test-guide.md` was not changed, use:

```bash
git add docs/showcase/engineering-confidence.md
git commit -m "docs: align performance confidence guidance"
```

---

### Task 5: Final Verification And Release-Readiness Note

**Files:**
- Modify if needed: `docs/development/release-readiness-review.md`
- Read only: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: commits from Tasks 1 through 4.
- Produces: final verification evidence and optional release-readiness note if the implementation changed release-risk evidence.

- [ ] **Step 1: Review release-readiness requirements**

Read:

```bash
sed -n '1,180p' docs/development/release-readiness-review.md
```

Expected: use the checklist to classify this branch as server test/docs confidence work unless production SQL or migrations were changed.

- [ ] **Step 2: Run targeted performance verification**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Expected: PASS.

- [ ] **Step 3: Run server boundary and quality gates**

Run:

```bash
./server/gradlew -p server architectureTest
./server/gradlew -p server check
```

Expected: PASS for both commands.

- [ ] **Step 4: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/showcase/engineering-confidence.md docs/development/test-guide.md docs/development/release-readiness-review.md
```

Expected: no output.

- [ ] **Step 5: Decide whether public release candidate scan is required**

Run:

```bash
git diff --name-only main...HEAD
```

If the diff includes only `server/src/test/**`, `docs/showcase/engineering-confidence.md`, and `docs/development/test-guide.md`, record public release candidate scan as skipped because no public release candidate packaging, scanner, deploy, README, public docs, frontend, auth, BFF, API contract, or production server behavior changed.

If the diff includes release-candidate scripts, scanner docs, public-facing README/deploy docs, production SQL, or release-readiness documentation, run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected when run: both commands pass and the scanner reports no leaks.

- [ ] **Step 6: Add release-readiness note only if needed**

If production SQL, migrations, release-readiness docs, public release scripts, deploy docs, or scanner behavior changed, append a dated note to `docs/development/release-readiness-review.md` with this shape:

```markdown
## 2026-06-26 Server read-model performance confidence closeout

- Scope reviewed: local `main..HEAD` for server read-model performance confidence.
- Release classification: server integration-test and confidence-doc update unless production SQL changes were required.
- Product evidence: `current-session` and `archive` session detail now have public-safe large-fixture query-budget evidence; archive detail also has MySQL EXPLAIN index-access evidence.
- Local verification: targeted `ServerQueryBudgetTest` and `MySqlQueryPlanTest`, `architectureTest`, `check`, and docs whitespace checks passed.
- Skipped: frontend lint/test/build/E2E, production OAuth, VM, provider-console, and tag/deploy smoke because this branch does not change frontend, BFF, auth, deploy, API response shape, or production runtime behavior.
- Residual risk: duration smoke remains a diagnostic signal only; query count and EXPLAIN guards are the release-relevant evidence.
```

If the branch stays test/docs-only and release-readiness docs were not already touched, do not add this note.

- [ ] **Step 7: Commit release-readiness note if one was added**

If Step 6 changed `docs/development/release-readiness-review.md`, run:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record read model performance closeout"
```

If Step 6 made no change, skip this commit.

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short
```

Expected: no unstaged or uncommitted changes.

## Self-Review

- Spec coverage: Task 1 covers deterministic public-safe fixtures and cleanup. Task 2 covers `current-session` large-fixture query-budget evidence. Task 3 covers `archive` session detail large-fixture budget and EXPLAIN evidence. Task 4 covers stale confidence docs. Task 5 covers required verification and release-readiness classification.
- Placeholder scan: This plan uses concrete file paths, commands, method names, and decision criteria. Conditional steps specify exact commands and exact criteria.
- Type consistency: Fixture method names are consistent across tasks: `seedCurrentSession`, `cleanupCurrentSession`, `seedArchiveSessionDetail`, `cleanupArchiveSessionDetail`, `currentSessionId`, `archiveDetailSessionId`, and `cleanupAllPerformanceFixtures`.
