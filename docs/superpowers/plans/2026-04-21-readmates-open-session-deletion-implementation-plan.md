# ReadMates Open Session Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosts delete only mistaken `OPEN` sessions, with a deletion impact preview, atomic hard-delete of session-owned data, and redirect back to new session creation.

**Architecture:** Add host-only preview and delete endpoints to the existing host session controller. Keep deletion policy in `SessionRepository`, where a transaction validates host ownership and `OPEN` state, counts child rows, deletes child tables in FK-safe order, then deletes the session row. The frontend wires the existing danger button to a confirmation modal that fetches preview counts before sending the final `DELETE`.

**Tech Stack:** Kotlin/Spring Boot 4, JdbcTemplate, MySQL Testcontainers, Next.js/React, Vitest/Testing Library, pnpm, Gradle.

---

## File Structure

- Modify `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
  - Adds DB-backed preview/delete tests and helper seed functions for session-owned rows.
- Modify `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
  - Adds `GET /api/host/sessions/{sessionId}/deletion-preview` and `DELETE /api/host/sessions/{sessionId}`.
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
  - Adds deletion DTOs, preview method, delete method, count helper, FK-safe delete helper, and `409` exception for non-open sessions.
- Modify `front/shared/api/readmates.ts`
  - Adds deletion preview/response/count types.
- Modify `front/tests/unit/host-session-editor.test.tsx`
  - Adds modal, preview, success redirect, and failure-state tests.
- Modify `front/features/host/components/host-session-editor.tsx`
  - Adds delete modal state, preview fetch, delete fetch, and conditional danger section behavior.

## Task 1: Backend Tests For Preview And Delete

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Task 1 coverage should explicitly include:
  - `CLOSED` and `PUBLISHED` both return `409` for preview and delete.
  - Cross-club preview/delete return `404`.
  - Malformed UUID preview/delete return `400`.

- [x] **Step 1: Add delete request import**

In `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`, extend the MockMvc Kotlin DSL imports:

```kotlin
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
```

- [x] **Step 2: Add a preview test**

Add this test inside `HostSessionControllerDbTest` before the private helper functions:

```kotlin
@Test
fun `host previews open session deletion impact`() {
    createSessionSeven()
    seedSessionOwnedRows()

    mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
        jsonPath("$.sessionNumber") { value(7) }
        jsonPath("$.title") { value("7회차 · 테스트 책") }
        jsonPath("$.state") { value("OPEN") }
        jsonPath("$.canDelete") { value(true) }
        jsonPath("$.counts.participants") { value(6) }
        jsonPath("$.counts.rsvpResponses") { value(1) }
        jsonPath("$.counts.questions") { value(2) }
        jsonPath("$.counts.checkins") { value(1) }
        jsonPath("$.counts.oneLineReviews") { value(1) }
        jsonPath("$.counts.longReviews") { value(1) }
        jsonPath("$.counts.highlights") { value(1) }
        jsonPath("$.counts.publications") { value(1) }
        jsonPath("$.counts.feedbackReports") { value(1) }
        jsonPath("$.counts.feedbackDocuments") { value(1) }
    }
}
```

- [x] **Step 3: Add a delete success test**

Add this test after the preview test:

```kotlin
@Test
fun `host deletes open session and all session owned rows`() {
    createSessionSeven()
    seedSessionOwnedRows()
    seedNonSessionRows()

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
        jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
        jsonPath("$.sessionNumber") { value(7) }
        jsonPath("$.deleted") { value(true) }
        jsonPath("$.counts.participants") { value(6) }
        jsonPath("$.counts.rsvpResponses") { value(1) }
        jsonPath("$.counts.questions") { value(2) }
        jsonPath("$.counts.checkins") { value(1) }
        jsonPath("$.counts.oneLineReviews") { value(1) }
        jsonPath("$.counts.longReviews") { value(1) }
        jsonPath("$.counts.highlights") { value(1) }
        jsonPath("$.counts.publications") { value(1) }
        jsonPath("$.counts.feedbackReports") { value(1) }
        jsonPath("$.counts.feedbackDocuments") { value(1) }
    }

    assertEquals(0, countRows("sessions", "id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("questions", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("reading_checkins", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("one_line_reviews", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("long_reviews", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("highlights", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("public_session_publications", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("feedback_reports", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(0, countRows("session_feedback_documents", "session_id = '00000000-0000-0000-0000-000000009777'"))
    assertEquals(1, countRows("invitations", "id = '00000000-0000-0000-0000-000000009801' and token_hash = '1111111111111111111111111111111111111111111111111111111111111111'"))
    assertEquals(1, countRows("auth_sessions", "id = '00000000-0000-0000-0000-000000009802' and session_token_hash = '2222222222222222222222222222222222222222222222222222222222222222'"))
    assertEquals(6, countRows("memberships", "club_id = '00000000-0000-0000-0000-000000000001'"))
    assertEquals(6, countRows("users", "email in ('host@example.com', 'member1@example.com', 'member2@example.com', 'member3@example.com', 'member4@example.com', 'member5@example.com')"))
}
```

- [x] **Step 4: Add refusal and validation tests**

Add these tests after the delete success test:

```kotlin
@Test
fun `host cannot delete closed or published session`() {
    createSessionSeven()
    jdbcTemplate.update(
        """
        update sessions
        set state = 'CLOSED'
        where id = '00000000-0000-0000-0000-000000009777'
        """.trimIndent(),
    )

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }

    mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
        with(user("host@example.com"))
    }.andExpect {
        status { isConflict() }
    }

    jdbcTemplate.update(
        """
        update sessions
        set state = 'PUBLISHED'
        where id = '00000000-0000-0000-0000-000000009777'
        """.trimIndent(),
    )

    mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
        with(user("host@example.com"))
    }.andExpect {
        status { isConflict() }
    }

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }
}

@Test
fun `member cannot preview or delete host session`() {
    createSessionSeven()

    mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isForbidden() }
    }

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("member5@example.com"))
        with(csrf())
    }.andExpect {
        status { isForbidden() }
    }
}

@Test
fun `host cannot preview or delete session outside own club`() {
    createOutsideClubSession()

    mockMvc.get("/api/host/sessions/00000000-0000-0000-0000-000000019777/deletion-preview") {
        with(user("host@example.com"))
    }.andExpect {
        status { isNotFound() }
    }

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000019777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isNotFound() }
    }
}

@Test
fun `preview and delete return bad request for malformed session id`() {
    mockMvc.get("/api/host/sessions/not-a-uuid/deletion-preview") {
        with(user("host@example.com"))
    }.andExpect {
        status { isBadRequest() }
    }

    mockMvc.delete("/api/host/sessions/not-a-uuid") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isBadRequest() }
    }
}

@Test
fun `delete returns not found for missing session`() {
    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009778") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isNotFound() }
    }
}

@Test
fun `session number is reused after deleting open session`() {
    createSessionSeven()

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
    }

    mockMvc.post("/api/host/sessions") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "title": "7회차 · 다시 만든 책",
              "bookTitle": "다시 만든 책",
              "bookAuthor": "다시 만든 저자",
              "date": "2026-05-27"
            }
            """.trimIndent()
    }.andExpect {
        status { isCreated() }
        jsonPath("$.sessionNumber") { value(7) }
        jsonPath("$.state") { value("OPEN") }
    }
}

@Test
fun `second delete returns not found after first delete succeeds`() {
    createSessionSeven()

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
    }

    mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isNotFound() }
    }
}
```

- [x] **Step 5: Replace `createSessionSeven` with a stable-id helper**

Replace the existing `createSessionSeven()` helper with:

```kotlin
private fun createSessionSeven() {
    jdbcTemplate.update(
        """
        insert into sessions (
          id,
          club_id,
          number,
          title,
          book_title,
          book_author,
          book_link,
          book_image_url,
          session_date,
          start_time,
          end_time,
          location_label,
          meeting_url,
          meeting_passcode,
          question_deadline_at,
          state
        )
        values (
          '00000000-0000-0000-0000-000000009777',
          '00000000-0000-0000-0000-000000000001',
          7,
          '7회차 · 테스트 책',
          '테스트 책',
          '테스트 저자',
          'https://example.com/books/test-book',
          'https://example.com/covers/test-book.jpg',
          '2026-05-20',
          '20:00:00',
          '22:00:00',
          '온라인',
          'https://meet.google.com/readmates-test',
          'readmates',
          '2026-05-19 14:59:00',
          'OPEN'
        )
        """.trimIndent(),
    )
    jdbcTemplate.update(
        """
        insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
        select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009777', memberships.id, 'NO_RESPONSE', 'UNKNOWN'
        from memberships
        where memberships.club_id = '00000000-0000-0000-0000-000000000001'
          and memberships.status = 'ACTIVE'
        """.trimIndent(),
    )
}
```

- [x] **Step 6: Add session-owned and non-session seed/count helpers**

Add these helpers below `createSessionSeven()`:

```kotlin
private fun seedSessionOwnedRows() {
    val hostMembershipId = jdbcTemplate.queryForObject(
        """
        select memberships.id
        from memberships
        join users on users.id = memberships.user_id
        where memberships.club_id = '00000000-0000-0000-0000-000000000001'
          and users.email = 'host@example.com'
        """.trimIndent(),
        String::class.java,
    )
    val memberMembershipId = jdbcTemplate.queryForObject(
        """
        select memberships.id
        from memberships
        join users on users.id = memberships.user_id
        where memberships.club_id = '00000000-0000-0000-0000-000000000001'
          and users.email = 'member5@example.com'
        """.trimIndent(),
        String::class.java,
    )

    jdbcTemplate.update(
        """
        update session_participants
        set rsvp_status = 'GOING'
        where session_id = '00000000-0000-0000-0000-000000009777'
          and membership_id = ?
        """.trimIndent(),
        memberMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
        values
          ('00000000-0000-0000-0000-000000009701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 1, '삭제될 질문 1', '생각 1'),
          ('00000000-0000-0000-0000-000000009702', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 2, '삭제될 질문 2', '생각 2')
        """.trimIndent(),
        memberMembershipId,
        memberMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
        values ('00000000-0000-0000-0000-000000009703', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 80, '삭제될 체크인')
        """.trimIndent(),
        memberMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
        values ('00000000-0000-0000-0000-000000009704', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, '삭제될 한줄평', 'PRIVATE')
        """.trimIndent(),
        memberMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
        values ('00000000-0000-0000-0000-000000009705', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, '삭제될 장문평', 'PRIVATE')
        """.trimIndent(),
        memberMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
        values ('00000000-0000-0000-0000-000000009706', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, '삭제될 하이라이트', 1)
        """.trimIndent(),
        memberMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into public_session_publications (id, club_id, session_id, public_summary, is_public, published_at)
        values ('00000000-0000-0000-0000-000000009707', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', '삭제될 공개 요약', false, null)
        """.trimIndent(),
    )
    jdbcTemplate.update(
        """
        insert into feedback_reports (id, club_id, session_id, membership_id, version, stored_path, file_name, content_type, file_size)
        values ('00000000-0000-0000-0000-000000009708', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 1, '/tmp/report.html', 'report.html', 'text/html', 10)
        """.trimIndent(),
        hostMembershipId,
    )
    jdbcTemplate.update(
        """
        insert into session_feedback_documents (id, club_id, session_id, version, source_text, file_name, content_type, file_size)
        values ('00000000-0000-0000-0000-000000009709', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', 1, '# 삭제될 문서', 'feedback.md', 'text/markdown', 20)
        """.trimIndent(),
    )
}

private fun seedNonSessionRows() {
    val hostFixture = jdbcTemplate.queryForMap(
        """
        select memberships.id as membership_id, users.id as user_id
        from memberships
        join users on users.id = memberships.user_id
        where memberships.club_id = '00000000-0000-0000-0000-000000000001'
          and users.email = 'host@example.com'
        """.trimIndent(),
    )

    jdbcTemplate.update(
        """
        insert into invitations (
          id,
          club_id,
          invited_by_membership_id,
          invited_email,
          invited_name,
          role,
          token_hash,
          status,
          expires_at
        )
        values (
          '00000000-0000-0000-0000-000000009801',
          '00000000-0000-0000-0000-000000000001',
          ?,
          'delete.keep.invite@example.com',
          '삭제 보존 초대',
          'MEMBER',
          '1111111111111111111111111111111111111111111111111111111111111111',
          'PENDING',
          '2030-01-01 00:00:00'
        )
        """.trimIndent(),
        hostFixture["membership_id"],
    )
    jdbcTemplate.update(
        """
        insert into auth_sessions (
          id,
          user_id,
          session_token_hash,
          expires_at,
          user_agent,
          ip_hash
        )
        values (
          '00000000-0000-0000-0000-000000009802',
          ?,
          '2222222222222222222222222222222222222222222222222222222222222222',
          '2030-01-01 00:00:00',
          'HostSessionControllerDbTest',
          '3333333333333333333333333333333333333333333333333333333333333333'
        )
        """.trimIndent(),
        hostFixture["user_id"],
    )
}

private fun countRows(tableName: String, whereClause: String): Int =
    jdbcTemplate.queryForObject(
        "select count(*) from $tableName where $whereClause",
        Int::class.java,
    ) ?: 0
```

- [x] **Step 7: Run backend tests and verify they fail**

Run:

```bash
./gradlew test --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: tests fail because the new routes are absent. The likely failure is `404` for preview/delete requests.

Run from:

```bash
cd /Users/kws/source/persnal/ReadMates/server
```

## Task 2: Backend API And Repository Preview

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`

- [x] **Step 1: Add preview controller endpoint**

In `HostSessionController`, after `update(...)`, add:

```kotlin
@GetMapping("/{sessionId}/deletion-preview")
fun deletionPreview(
    authentication: Authentication?,
    @PathVariable sessionId: String,
) = sessionRepository.previewOpenSessionDeletion(currentMember(authentication), parseHostSessionId(sessionId))
```

- [x] **Step 2: Add deletion DTOs**

In `SessionRepository.kt`, add these DTOs after `HostSessionFeedbackDocument`:

```kotlin
data class HostSessionDeletionPreviewResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val state: String,
    val canDelete: Boolean,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionDeletionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val deleted: Boolean,
    val counts: HostSessionDeletionCounts,
)

data class HostSessionDeletionCounts(
    val participants: Int,
    val rsvpResponses: Int,
    val questions: Int,
    val checkins: Int,
    val oneLineReviews: Int,
    val longReviews: Int,
    val highlights: Int,
    val publications: Int,
    val feedbackReports: Int,
    val feedbackDocuments: Int,
)

private data class HostSessionDeletionTarget(
    val sessionId: UUID,
    val sessionNumber: Int,
    val title: String,
    val state: String,
)
```

- [x] **Step 3: Add the preview method**

In `SessionRepository`, after `findHostSession(...)`, add:

```kotlin
fun previewOpenSessionDeletion(member: CurrentMember, sessionId: UUID): HostSessionDeletionPreviewResponse {
    requireHost(member)
    val jdbcTemplate = jdbcTemplate()
    val target = findDeletionTarget(jdbcTemplate, member, sessionId, lock = false)
    requireOpenDeletionTarget(target)

    return HostSessionDeletionPreviewResponse(
        sessionId = target.sessionId.toString(),
        sessionNumber = target.sessionNumber,
        title = target.title,
        state = target.state,
        canDelete = true,
        counts = countSessionDeletionRows(jdbcTemplate, member.clubId, sessionId),
    )
}
```

- [x] **Step 4: Add deletion target and count helpers**

Add these private helpers before `findHostSessionAttendees(...)`:

```kotlin
private fun findDeletionTarget(
    jdbcTemplate: JdbcTemplate,
    member: CurrentMember,
    sessionId: UUID,
    lock: Boolean,
): HostSessionDeletionTarget {
    val lockClause = if (lock) "for update" else ""
    return jdbcTemplate.query(
        """
        select id, number, title, state
        from sessions
        where id = ?
          and club_id = ?
        $lockClause
        """.trimIndent(),
        { resultSet, _ ->
            HostSessionDeletionTarget(
                sessionId = resultSet.uuid("id"),
                sessionNumber = resultSet.getInt("number"),
                title = resultSet.getString("title"),
                state = resultSet.getString("state"),
            )
        },
        sessionId.dbString(),
        member.clubId.dbString(),
    ).firstOrNull() ?: throw HostSessionNotFoundException()
}

private fun requireOpenDeletionTarget(target: HostSessionDeletionTarget) {
    if (target.state != "OPEN") {
        throw HostSessionDeletionNotAllowedException()
    }
}

private fun countSessionDeletionRows(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    sessionId: UUID,
): HostSessionDeletionCounts =
    HostSessionDeletionCounts(
        participants = countSessionRows(
            jdbcTemplate,
            "select count(*) from session_participants where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        rsvpResponses = jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            where club_id = ?
              and session_id = ?
              and rsvp_status <> 'NO_RESPONSE'
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
            sessionId.dbString(),
        ) ?: 0,
        questions = countSessionRows(
            jdbcTemplate,
            "select count(*) from questions where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        checkins = countSessionRows(
            jdbcTemplate,
            "select count(*) from reading_checkins where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        oneLineReviews = countSessionRows(
            jdbcTemplate,
            "select count(*) from one_line_reviews where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        longReviews = countSessionRows(
            jdbcTemplate,
            "select count(*) from long_reviews where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        highlights = countSessionRows(
            jdbcTemplate,
            "select count(*) from highlights where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        publications = countSessionRows(
            jdbcTemplate,
            "select count(*) from public_session_publications where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        feedbackReports = countSessionRows(
            jdbcTemplate,
            "select count(*) from feedback_reports where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
        feedbackDocuments = countSessionRows(
            jdbcTemplate,
            "select count(*) from session_feedback_documents where club_id = ? and session_id = ?",
            clubId,
            sessionId,
        ),
    )

private fun countSessionRows(
    jdbcTemplate: JdbcTemplate,
    sql: String,
    clubId: UUID,
    sessionId: UUID,
): Int =
    jdbcTemplate.queryForObject(
        sql,
        Int::class.java,
        clubId.dbString(),
        sessionId.dbString(),
    ) ?: 0
```

- [x] **Step 5: Add conflict exception**

Near the existing session exceptions at the bottom of `SessionRepository.kt`, add:

```kotlin
@ResponseStatus(HttpStatus.CONFLICT)
class HostSessionDeletionNotAllowedException : RuntimeException("Only open sessions can be deleted")
```

- [x] **Step 6: Run preview-focused backend tests**

Run:

```bash
./gradlew test --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: preview and non-open preview assertions pass. Delete success tests return `404` because the delete endpoint is still absent at this point in the plan.

## Task 3: Backend Transactional Delete

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

- [x] **Step 1: Add delete method**

In `HostSessionController.kt`, add the delete mapping import:

```kotlin
import org.springframework.web.bind.annotation.DeleteMapping
```

Then add this endpoint after `deletionPreview(...)`:

```kotlin
@DeleteMapping("/{sessionId}")
fun delete(
    authentication: Authentication?,
    @PathVariable sessionId: String,
) = sessionRepository.deleteOpenHostSession(currentMember(authentication), parseHostSessionId(sessionId))
```

In `SessionRepository`, after `previewOpenSessionDeletion(...)`, add:

```kotlin
@Transactional
fun deleteOpenHostSession(member: CurrentMember, sessionId: UUID): HostSessionDeletionResponse {
    requireHost(member)
    val jdbcTemplate = jdbcTemplate()
    val target = findDeletionTarget(jdbcTemplate, member, sessionId, lock = true)
    requireOpenDeletionTarget(target)
    val counts = countSessionDeletionRows(jdbcTemplate, member.clubId, sessionId)

    deleteSessionOwnedRows(jdbcTemplate, member.clubId, sessionId)

    val deletedSessions = jdbcTemplate.update(
        """
        delete from sessions
        where id = ?
          and club_id = ?
          and state = 'OPEN'
        """.trimIndent(),
        sessionId.dbString(),
        member.clubId.dbString(),
    )
    if (deletedSessions == 0) {
        throw HostSessionNotFoundException()
    }

    return HostSessionDeletionResponse(
        sessionId = target.sessionId.toString(),
        sessionNumber = target.sessionNumber,
        deleted = true,
        counts = counts,
    )
}
```

- [x] **Step 2: Add FK-safe delete helper**

Add this private helper after `countSessionRows(...)`:

```kotlin
private fun deleteSessionOwnedRows(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    sessionId: UUID,
) {
    jdbcTemplate.update("delete from feedback_reports where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from session_feedback_documents where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from public_session_publications where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from highlights where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from one_line_reviews where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from long_reviews where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from questions where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from reading_checkins where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
    jdbcTemplate.update("delete from session_participants where club_id = ? and session_id = ?", clubId.dbString(), sessionId.dbString())
}
```

- [x] **Step 3: Run backend tests**

Run from `/Users/kws/source/persnal/ReadMates/server`:

```bash
./gradlew test --tests 'com.readmates.session.api.HostSessionControllerDbTest'
```

Expected: all tests in `HostSessionControllerDbTest` pass.

- [x] **Step 4: Run adjacent backend session tests**

Run:

```bash
./gradlew test \
  --tests 'com.readmates.session.api.HostSessionControllerDbTest' \
  --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' \
  --tests 'com.readmates.session.api.HostDashboardControllerTest' \
  --tests 'com.readmates.note.api.QuestionControllerTest'
```

Expected: all selected tests pass.

- [x] **Step 5: Commit backend work**

Commit only backend files:

```bash
git add server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt \
  server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "feat: add open session deletion API"
```

## Task 4: Frontend Types And Delete Modal Tests

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [x] **Step 1: Add frontend API types**

In `front/shared/api/readmates.ts`, after `HostSessionDetailResponse`, add:

```ts
export type HostSessionDeletionCounts = {
  participants: number;
  rsvpResponses: number;
  questions: number;
  checkins: number;
  oneLineReviews: number;
  longReviews: number;
  highlights: number;
  publications: number;
  feedbackReports: number;
  feedbackDocuments: number;
};

export type HostSessionDeletionPreviewResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  canDelete: boolean;
  counts: HostSessionDeletionCounts;
};

export type HostSessionDeletionResponse = {
  sessionId: string;
  sessionNumber: number;
  deleted: true;
  counts: HostSessionDeletionCounts;
};
```

- [x] **Step 2: Extend test imports**

In `front/tests/unit/host-session-editor.test.tsx`, change the Testing Library import to:

```ts
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
```

In `front/tests/unit/host-session-editor.test.tsx`, change the type import to:

```ts
import type {
  FeedbackDocumentResponse,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
} from "@/shared/api/readmates";
```

- [x] **Step 3: Add open session and preview fixtures**

Below the existing `session` fixture, add:

```ts
const openSession: HostSessionDetailResponse = {
  ...session,
  sessionId: "open-session-7",
  sessionNumber: 7,
  title: "7회차 모임 · 테스트 책",
  bookTitle: "테스트 책",
  state: "OPEN",
};

const deletionPreview: HostSessionDeletionPreviewResponse = {
  sessionId: "open-session-7",
  sessionNumber: 7,
  title: "7회차 모임 · 테스트 책",
  state: "OPEN",
  canDelete: true,
  counts: {
    participants: 6,
    rsvpResponses: 2,
    questions: 4,
    checkins: 3,
    oneLineReviews: 1,
    longReviews: 1,
    highlights: 0,
    publications: 0,
    feedbackReports: 0,
    feedbackDocuments: 0,
  },
};
```

- [x] **Step 4: Add modal success test**

Add this test before the closing `});` of the describe block:

```ts
it("previews and deletes an open session from the danger modal", async () => {
  const location = { href: "" };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(deletionPreview),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sessionId: "open-session-7",
        sessionNumber: 7,
        deleted: true,
        counts: deletionPreview.counts,
      }),
    });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", location);
  const user = userEvent.setup();

  render(<HostSessionEditor session={openSession} />);

  await user.click(screen.getByRole("button", { name: "세션 삭제" }));

  const dialog = await screen.findByRole("dialog", { name: "이 세션을 삭제할까요?" });
  expect(dialog).toBeInTheDocument();
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/open-session-7/deletion-preview", {
      method: "GET",
    }),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByText("참석 대상")).toBeInTheDocument();
  expect(screen.getByText("6명")).toBeInTheDocument();
  expect(screen.getByText("질문")).toBeInTheDocument();
  expect(screen.getByText("4개")).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "세션 삭제" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions/open-session-7", {
      method: "DELETE",
    }),
  );
  expect(location.href).toBe("/app/host/sessions/new");
});
```

- [x] **Step 5: Add failure and visibility tests**

Add these tests after the success test:

```ts
it("does not show the delete action on the new-session editor", () => {
  render(<HostSessionEditor />);

  expect(screen.queryByRole("button", { name: "세션 삭제" })).not.toBeInTheDocument();
});

it("disables delete action for non-open sessions", () => {
  render(<HostSessionEditor session={session} />);

  expect(screen.getByRole("button", { name: "세션 삭제" })).toBeDisabled();
});

it("shows a preview failure message and does not send delete", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409 });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();

  render(<HostSessionEditor session={openSession} />);

  await user.click(screen.getByRole("button", { name: "세션 삭제" }));

  expect(await screen.findByText("이미 닫히거나 공개된 세션은 삭제할 수 없습니다.")).toBeInTheDocument();
  const dialog = screen.getByRole("dialog", { name: "이 세션을 삭제할까요?" });
  expect(within(dialog).getByRole("button", { name: "세션 삭제" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps the modal open when delete fails", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(deletionPreview),
    })
    .mockResolvedValueOnce({ ok: false, status: 500 });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();

  render(<HostSessionEditor session={openSession} />);

  await user.click(screen.getByRole("button", { name: "세션 삭제" }));
  await screen.findByText("참석 대상");
  const dialog = screen.getByRole("dialog", { name: "이 세션을 삭제할까요?" });
  await user.click(within(dialog).getByRole("button", { name: "세션 삭제" }));

  expect(await screen.findByText("세션 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.")).toBeInTheDocument();
  expect(dialog).toBeInTheDocument();
});
```

- [x] **Step 6: Run frontend tests and verify they fail**

Run from `/Users/kws/source/persnal/ReadMates/front`:

```bash
pnpm exec vitest run tests/unit/host-session-editor.test.tsx
```

Expected: tests fail because the delete modal UI and deletion API calls are still absent at this point in the plan.

## Task 5: Frontend Delete Modal Implementation

**Files:**
- Modify: `front/features/host/components/host-session-editor.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`

- [x] **Step 1: Import deletion preview type**

At the top of `host-session-editor.tsx`, change the type import to:

```ts
import type {
  AttendanceStatus,
  FeedbackDocumentResponse,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
} from "@/shared/api/readmates";
```

- [x] **Step 2: Add delete modal state**

Inside `HostSessionEditor`, after `toast` state, add:

```ts
const [deleteModalOpen, setDeleteModalOpen] = useState(false);
const [deletePreview, setDeletePreview] = useState<HostSessionDeletionPreviewResponse | null>(null);
const [deleteError, setDeleteError] = useState<string | null>(null);
const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
const [deleteSubmitting, setDeleteSubmitting] = useState(false);
```

- [x] **Step 3: Add error mapping and preview handler**

Below `flash`, add:

```ts
const deletionErrorMessage = (status?: number) => {
  if (status === 404) {
    return "세션을 찾을 수 없습니다.";
  }
  if (status === 409) {
    return "이미 닫히거나 공개된 세션은 삭제할 수 없습니다.";
  }
  return "세션 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.";
};

const openDeleteModal = async () => {
  if (!session || session.state !== "OPEN") {
    return;
  }

  setDeleteModalOpen(true);
  setDeletePreview(null);
  setDeleteError(null);
  setDeletePreviewLoading(true);

  try {
    const response = await fetch(`/api/bff/api/host/sessions/${session.sessionId}/deletion-preview`, {
      method: "GET",
    });

    if (!response.ok) {
      setDeleteError(deletionErrorMessage(response.status));
      return;
    }

    setDeletePreview((await response.json()) as HostSessionDeletionPreviewResponse);
  } catch {
    setDeleteError(deletionErrorMessage());
  } finally {
    setDeletePreviewLoading(false);
  }
};
```

- [x] **Step 4: Add confirm delete handler**

Below `openDeleteModal`, add:

```ts
const confirmDeleteSession = async () => {
  if (!session || !deletePreview || deleteSubmitting) {
    return;
  }

  setDeleteError(null);
  setDeleteSubmitting(true);

  try {
    const response = await fetch(`/api/bff/api/host/sessions/${session.sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setDeleteError(deletionErrorMessage(response.status));
      return;
    }

    globalThis.location.href = "/app/host/sessions/new";
  } catch {
    setDeleteError(deletionErrorMessage());
  } finally {
    setDeleteSubmitting(false);
  }
};
```

- [x] **Step 5: Replace danger section**

Replace the existing danger section with:

```tsx
{session ? (
  <div className="surface" style={{ padding: "22px" }}>
    <div className="eyebrow" style={{ marginBottom: "10px" }}>
      Danger
    </div>
    <button
      className="btn btn-ghost btn-sm u-w-full"
      type="button"
      disabled={session.state !== "OPEN"}
      onClick={openDeleteModal}
      style={{ justifyContent: "flex-start", color: "var(--danger)" }}
    >
      세션 삭제
    </button>
    <div className="tiny" style={{ marginTop: "8px" }}>
      {session.state === "OPEN"
        ? "세션과 관련 준비 기록이 모두 제거됩니다. 되돌릴 수 없습니다."
        : "닫히거나 공개된 세션은 삭제할 수 없습니다."}
    </div>
  </div>
) : null}
```

- [x] **Step 6: Add modal JSX**

Add this block immediately before the toast block near the bottom of the returned JSX:

```tsx
{deleteModalOpen ? (
  <div
    role="presentation"
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(22, 24, 29, 0.46)",
      zIndex: 70,
      display: "grid",
      placeItems: "center",
      padding: "20px",
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-session-title"
      className="surface"
      style={{ width: "min(460px, 100%)", padding: "24px" }}
    >
      <h2 id="delete-session-title" style={{ margin: 0 }}>
        이 세션을 삭제할까요?
      </h2>
      <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
        삭제하면 이 회차와 준비 기록이 모두 제거됩니다. 멤버 계정과 멤버십은 삭제되지 않습니다.
      </p>

      {deletePreviewLoading ? (
        <p className="small" style={{ margin: "0 0 18px" }}>
          삭제할 데이터를 확인하고 있습니다.
        </p>
      ) : null}

      {deleteError ? (
        <p className="small" style={{ color: "var(--danger)", margin: "0 0 18px" }}>
          {deleteError}
        </p>
      ) : null}

      {deletePreview ? <DeletionPreviewCounts preview={deletePreview} /> : null}

      <div className="actions" style={{ marginTop: "22px", justifyContent: "flex-end" }}>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={deleteSubmitting}
          onClick={() => setDeleteModalOpen(false)}
        >
          취소
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={!deletePreview || deletePreviewLoading || deleteSubmitting}
          onClick={confirmDeleteSession}
          style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
        >
          세션 삭제
        </button>
      </div>
    </div>
  </div>
) : null}
```

- [x] **Step 7: Add count rendering component**

Below `Panel(...)`, add:

```tsx
function DeletionPreviewCounts({ preview }: { preview: HostSessionDeletionPreviewResponse }) {
  const rows = [
    ["참석 대상", `${preview.counts.participants}명`],
    ["RSVP 응답", `${preview.counts.rsvpResponses}개`],
    ["질문", `${preview.counts.questions}개`],
    ["체크인", `${preview.counts.checkins}개`],
    ["한줄평", `${preview.counts.oneLineReviews}개`],
    ["장문평", `${preview.counts.longReviews}개`],
    ["하이라이트", `${preview.counts.highlights}개`],
    ["공개 요약", `${preview.counts.publications}개`],
    ["개인 피드백 리포트", `${preview.counts.feedbackReports}개`],
    ["회차 피드백 문서", `${preview.counts.feedbackDocuments}개`],
  ];

  return (
    <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
      {rows.map(([label, value]) => (
        <div className="row-between small" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
```

- [x] **Step 8: Run frontend tests**

Run:

```bash
pnpm exec vitest run tests/unit/host-session-editor.test.tsx
```

Expected: all tests in `host-session-editor.test.tsx` pass.

- [x] **Step 9: Commit frontend work**

Commit only frontend deletion files:

```bash
git add front/shared/api/readmates.ts \
  front/features/host/components/host-session-editor.tsx \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: add open session deletion modal"
```

## Task 6: Final Verification

**Files:**
- Verify: backend and frontend files touched in Tasks 1-5.

- [x] **Step 1: Run backend targeted suite**

Run from `/Users/kws/source/persnal/ReadMates/server`:

```bash
./gradlew test \
  --tests 'com.readmates.session.api.HostSessionControllerDbTest' \
  --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' \
  --tests 'com.readmates.session.api.HostDashboardControllerTest' \
  --tests 'com.readmates.note.api.QuestionControllerTest'
```

Expected: all selected tests pass.

- [x] **Step 2: Run frontend targeted suite**

Run from `/Users/kws/source/persnal/ReadMates/front`:

```bash
pnpm test -- tests/unit/host-session-editor.test.tsx
```

Expected: all selected tests pass.

- [x] **Step 3: Check working tree**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated user changes remain, or no output if the implementer is working in a clean worktree.

- [ ] **Step 4: Manual smoke path**

Run the app if a local dev server is needed for manual verification:

```bash
cd /Users/kws/source/persnal/ReadMates/front
pnpm dev
```

Manual checks:

1. Open `/app/host/sessions/new`.
2. Create a session 7.
3. Open `/app/host/sessions/{sessionId}/edit`.
4. Confirm the danger section is enabled.
5. Open the delete modal.
6. Confirm counts render.
7. Confirm deletion redirects to `/app/host/sessions/new`.
8. Create another session and verify it is numbered 7.

- [x] **Step 5: Final commit if verification changed files**

If verification required small fixes, commit them:

```bash
git add server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt \
  server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt \
  front/shared/api/readmates.ts \
  front/features/host/components/host-session-editor.tsx \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "fix: verify open session deletion flow"
```

If no fixes were needed, do not create an empty commit.
