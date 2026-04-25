# Session Lifecycle Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make host session lifecycle explicit: an open session can be closed, a closed session can be published, and public/member record visibility only controls audience after the lifecycle reaches the right state.

**Architecture:** Keep `sessions.state` and record `visibility` separate. Add server lifecycle endpoints for `OPEN -> CLOSED` and `CLOSED -> PUBLISHED`; keep publication summary/visibility save as metadata only. Gate public and notes surfaces on `PUBLISHED` so selecting `PUBLIC` does not externally expose an active or draft record.

**Tech Stack:** Kotlin/Spring Boot API, JdbcTemplate persistence, React/Vite frontend, React Testing Library, Vitest, MySQL integration tests.

---

## File Map

- Modify `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
  - Add lifecycle conflict exceptions for close and publish.
- Modify `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
  - Add `close` and `publish` use-case methods to `ManageHostSessionUseCase`.
- Modify `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
  - Add matching persistence-port methods.
- Modify `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
  - Delegate new use cases to the write port.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
  - Add `POST /api/host/sessions/{sessionId}/close` and `POST /api/host/sessions/{sessionId}/publish`.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
  - Implement transactional state changes.
  - Keep publication save from changing `sessions.state`.
  - Set `public_session_publications.published_at` when publishing a public record.
- Modify `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
  - Require `sessions.state = 'PUBLISHED'` for public club stats, public list, and public detail.
- Keep `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt` unchanged unless tests reveal a gap.
  - It already requires `sessions.state = 'PUBLISHED'`.
- Keep `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt` unchanged.
  - It already includes `CLOSED` and `PUBLISHED` for member archive.
- Modify `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
  - Add close/publish transition integration tests.
- Modify `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt` or the existing public controller test file found by `rg "PublicController" server/src/test/kotlin`.
  - Add public exposure gating tests.
- Modify `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
  - Add a regression test that closed public records are in archive but not notes until published.
- Modify `front/features/host/api/host-api.ts`
  - Add `closeHostSession` and `publishHostSession`.
- Modify `front/features/host/components/host-session-editor.tsx`
  - Add host-facing lifecycle actions and copy.
  - Use local state for session state after close/publish actions.
- Modify `front/features/host/route/host-session-editor-data.ts`
  - Wire new actions into the editor.
- Modify `front/tests/unit/host-session-editor.test.tsx`
  - Cover close and publish interactions.

## Product Rules

- `DRAFT`: scheduled but not active.
- `OPEN`: current session board; appears on `/app/session/current`; should not appear in archive, notes, or public records.
- `CLOSED`: meeting is over; removed from current session; can appear in member archive when `visibility` is `MEMBER` or `PUBLIC`; cannot appear in notes or public records.
- `PUBLISHED`: final record state; can appear in notes when `visibility` is `MEMBER` or `PUBLIC`; can appear in public records only when `visibility` is `PUBLIC`.
- `visibility` means audience, not lifecycle:
  - `HOST_ONLY`: host-only metadata.
  - `MEMBER`: member app record after lifecycle allows it.
  - `PUBLIC`: public record after lifecycle allows it.

## Task 1: Server API Contract for Lifecycle Transitions

**Files:**
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
- Modify `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Modify `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`

- [x] **Step 1: Add failing controller tests for close transitions**

Add these tests near the existing open transition tests in `HostSessionControllerDbTest.kt`:

```kotlin
@Test
fun `host closes open session`() {
    createSessionSeven()

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
        jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
        jsonPath("$.state") { value("CLOSED") }
    }

    assertEquals("CLOSED", findSessionState("00000000-0000-0000-0000-000000009777"))
}

@Test
fun `host close transition is idempotent for already closed session`() {
    createSessionSeven()
    updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
        jsonPath("$.state") { value("CLOSED") }
    }
}

@Test
fun `host cannot close draft or published session`() {
    val draftSessionId = createDraftSessionSeven()

    mockMvc.post("/api/host/sessions/$draftSessionId/close") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }

    updateSessionState(draftSessionId, "PUBLISHED")

    mockMvc.post("/api/host/sessions/$draftSessionId/close") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }
}
```

- [x] **Step 2: Run the failing close tests**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest"
```

Expected: tests fail because `/close` does not exist.

- [x] **Step 3: Add close use-case signatures**

In `SessionApplicationSupport.kt`, add:

```kotlin
class HostSessionCloseNotAllowedException : RuntimeException("Only open sessions can be closed")
```

In `HostSessionUseCases.kt`, add to `ManageHostSessionUseCase`:

```kotlin
fun close(command: HostSessionIdCommand): HostSessionDetailResponse
```

In `HostSessionWritePort.kt`, add:

```kotlin
fun close(command: HostSessionIdCommand): HostSessionDetailResponse
```

In `HostSessionCommandService.kt`, add:

```kotlin
@Transactional
override fun close(command: HostSessionIdCommand) = port.close(command)
```

- [x] **Step 4: Add the close route**

In `HostSessionController.kt`, add:

```kotlin
@PostMapping("/{sessionId}/close")
fun close(
    member: CurrentMember,
    @PathVariable sessionId: String,
) = manageHostSessionUseCase.close(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
```

- [x] **Step 5: Implement close persistence**

In `JdbcHostSessionWriteAdapter.kt`, import the new exception and add:

```kotlin
@Transactional
override fun close(command: HostSessionIdCommand): HostSessionDetailResponse {
    requireHost(command.host)
    val jdbcTemplate = jdbcTemplate()
    val state = jdbcTemplate.query(
        """
        select state
        from sessions
        where id = ?
          and club_id = ?
        """.trimIndent(),
        { resultSet, _ -> resultSet.getString("state") },
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    ).firstOrNull() ?: throw HostSessionNotFoundException()

    if (state == "CLOSED") {
        return findHostSession(command.host, command.sessionId)
    }
    if (state != "OPEN") {
        throw HostSessionCloseNotAllowedException()
    }

    jdbcTemplate.update(
        """
        update sessions
        set state = 'CLOSED',
            updated_at = utc_timestamp(6)
        where id = ?
          and club_id = ?
        """.trimIndent(),
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    )

    return findHostSession(command.host, command.sessionId)
}
```

- [x] **Step 6: Run close tests**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest"
```

Expected: close tests pass. If conflicts are not mapped to HTTP 409, find the existing session exception handler by running `rg "HostSessionOpenNotAllowedException|OpenSessionAlreadyExistsException" server/src/main/kotlin` and add the new exception to the same mapping.

- [x] **Step 7: Commit Task 1**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt
git commit -m "feat: add host session close transition"
```

Task 1 checkpoint (2026-04-25):
- Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/session-lifecycle-publication`, `codex/session-lifecycle-publication`.
- Changed files: session application ports/service/controller/support, `JdbcHostSessionWriteAdapter`, `SecurityConfig`, `HostSessionControllerDbTest`, `HostSessionCommandServiceTest`, `HostSessionBffSecurityTest`.
- Decisions: close uses an atomic `OPEN -> CLOSED` update with zero-row re-read; `CLOSED` is idempotent, `DRAFT`/`PUBLISHED` conflict; BFF CSRF exemption mirrors `/open`.
- Reviews: spec review passed; quality review found non-atomic update and missing BFF CSRF coverage, both fixed in `6d4a143`.
- Verification: `./server/gradlew -p server test --rerun-tasks --tests "com.readmates.session.api.HostSessionControllerDbTest" --tests "*HostSessionBffSecurityTest*"` passed, 30 targeted tests.
- Background resources: no Node/Vite/dev server/browser sessions started; completed Task 1 agents were closed.
- Remaining risks/next task notes: apply the same atomic transition and BFF CSRF/security-test scrutiny to publish.

## Task 2: Publish Transition and Public Exposure Guard

**Files:**
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
- Modify `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Modify `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Modify `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Test: public controller DB test file found by `rg "class .*Public.*Test" server/src/test/kotlin`

- [x] **Step 1: Add failing publish transition tests**

Add to `HostSessionControllerDbTest.kt`:

```kotlin
@Test
fun `host publishes closed session with member or public publication`() {
    createSessionSeven()
    updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

    mockMvc.put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "publicSummary": "공개 전환 테스트 요약입니다.",
              "visibility": "PUBLIC"
            }
            """.trimIndent()
    }.andExpect {
        status { isOk() }
    }

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
        jsonPath("$.state") { value("PUBLISHED") }
        jsonPath("$.publication.visibility") { value("PUBLIC") }
    }

    assertEquals("PUBLISHED", findSessionState("00000000-0000-0000-0000-000000009777"))
    assertNotNull(findPublicationRow("00000000-0000-0000-0000-000000009777")["published_at"])
}

@Test
fun `host cannot publish open draft host only or unpublished sessions`() {
    createSessionSeven()

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
    }

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }

    mockMvc.put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "publicSummary": "호스트 전용 요약입니다.",
              "visibility": "HOST_ONLY"
            }
            """.trimIndent()
    }.andExpect {
        status { isOk() }
    }

    mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }
}
```

- [x] **Step 2: Run the failing publish tests**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest"
```

Expected: tests fail because `/publish` does not exist.

- [x] **Step 3: Add publish use-case signatures**

In `SessionApplicationSupport.kt`, add:

```kotlin
class HostSessionPublishNotAllowedException : RuntimeException("Only closed sessions with member-visible publication can be published")
```

In `HostSessionUseCases.kt`, add to `ManageHostSessionUseCase`:

```kotlin
fun publish(command: HostSessionIdCommand): HostSessionDetailResponse
```

In `HostSessionWritePort.kt`, add:

```kotlin
fun publish(command: HostSessionIdCommand): HostSessionDetailResponse
```

In `HostSessionCommandService.kt`, add:

```kotlin
@Transactional
override fun publish(command: HostSessionIdCommand) = port.publish(command)
```

- [x] **Step 4: Add the publish route**

In `HostSessionController.kt`, add:

```kotlin
@PostMapping("/{sessionId}/publish")
fun publish(
    member: CurrentMember,
    @PathVariable sessionId: String,
) = manageHostSessionUseCase.publish(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
```

- [x] **Step 5: Implement publish persistence**

In `JdbcHostSessionWriteAdapter.kt`, import the new exception and add:

```kotlin
@Transactional
override fun publish(command: HostSessionIdCommand): HostSessionDetailResponse {
    requireHost(command.host)
    val jdbcTemplate = jdbcTemplate()
    val state = jdbcTemplate.query(
        """
        select state
        from sessions
        where id = ?
          and club_id = ?
        """.trimIndent(),
        { resultSet, _ -> resultSet.getString("state") },
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    ).firstOrNull() ?: throw HostSessionNotFoundException()

    if (state == "PUBLISHED") {
        return findHostSession(command.host, command.sessionId)
    }
    if (state != "CLOSED") {
        throw HostSessionPublishNotAllowedException()
    }

    val publicationVisibility = jdbcTemplate.query(
        """
        select visibility
        from public_session_publications
        where session_id = ?
          and club_id = ?
          and nullif(trim(public_summary), '') is not null
        """.trimIndent(),
        { resultSet, _ -> resultSet.getString("visibility") },
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    ).firstOrNull()

    if (publicationVisibility != "MEMBER" && publicationVisibility != "PUBLIC") {
        throw HostSessionPublishNotAllowedException()
    }

    jdbcTemplate.update(
        """
        update sessions
        set state = 'PUBLISHED',
            updated_at = utc_timestamp(6)
        where id = ?
          and club_id = ?
        """.trimIndent(),
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    )

    if (publicationVisibility == "PUBLIC") {
        jdbcTemplate.update(
            """
            update public_session_publications
            set is_public = true,
                published_at = coalesce(published_at, utc_timestamp(6)),
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    return findHostSession(command.host, command.sessionId)
}
```

Add `HostSessionPublishNotAllowedException` to the same 409 mapping used for open/close conflicts.

- [x] **Step 6: Gate public records on `PUBLISHED`**

In `JdbcPublicQueryAdapter.kt`, add `and sessions.state = 'PUBLISHED'` to all public-facing session queries:

```sql
where sessions.id = ?
  and sessions.state = 'PUBLISHED'
  and public_session_publications.visibility = 'PUBLIC'
```

```sql
where sessions.club_id = ?
  and sessions.state = 'PUBLISHED'
  and public_session_publications.visibility = 'PUBLIC'
```

Apply this to `loadSession`, `publicStats`, and `publicSessions`.

- [x] **Step 7: Add public exposure regression test**

In the public controller DB test file, add:

```kotlin
@Test
fun `public records exclude closed public visibility sessions until published`() {
    val sessionId = createSessionSeven()
    updateSessionState(sessionId, "CLOSED")

    mockMvc.put("/api/host/sessions/$sessionId/publication") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "publicSummary": "아직 공개 완료 전 요약입니다.",
              "visibility": "PUBLIC"
            }
            """.trimIndent()
    }.andExpect {
        status { isOk() }
    }

    mockMvc.get("/api/public/sessions/$sessionId").andExpect {
        status { isNotFound() }
    }

    mockMvc.post("/api/host/sessions/$sessionId/publish") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
    }

    mockMvc.get("/api/public/sessions/$sessionId").andExpect {
        status { isOk() }
        jsonPath("$.sessionId") { value(sessionId) }
    }
}
```

If the test helper methods are local to `HostSessionControllerDbTest`, copy the minimal helper logic into the public test file instead of moving shared helpers.

- [x] **Step 8: Run server lifecycle and public tests**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest" --tests "*Public*"
```

Expected: all targeted tests pass.

- [x] **Step 9: Commit Task 2**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/publication server/src/test/kotlin/com/readmates
git commit -m "feat: publish finalized session records"
```

Task 2 checkpoint (2026-04-25):
- Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/session-lifecycle-publication`, `codex/session-lifecycle-publication`.
- Changed files: session lifecycle API/service/persistence, `JdbcPublicQueryAdapter`, `SecurityConfig`, host/public/security/service tests.
- Decisions: publish uses a conditional `CLOSED -> PUBLISHED` transition with publication existence checks; public query surfaces require `sessions.state = 'PUBLISHED'`; BFF `/publish` mirrors `/open` and `/close` CSRF handling.
- Reviews: spec review passed; quality review passed with minor notes that MEMBER publish/idempotent publish are not directly tested and `published_at` lifecycle meaning remains legacy-compatible.
- Verification: `./server/gradlew -p server test --tests "com.readmates.session.api.HostSessionControllerDbTest" --tests "*Public*"` passed; extended targeted run with `HostSessionBffSecurityTest` and `HostSessionCommandServiceTest` passed.
- Background resources: no Node/Vite/dev server/browser sessions started; completed Task 2 agents were closed.
- Remaining risks/next task notes: Task 3 should verify archive and notes surfaces from the member side after the new lifecycle gate.

## Task 3: Archive and Notes Regression Coverage

**Files:**
- Modify `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`

- [x] **Step 1: Add regression test for closed vs published visibility**

Add:

```kotlin
@Test
fun `closed public session appears in archive but not notes until published`() {
    val sessionId = insertClosedPublicSessionWithQuestion(number = 91)

    mockMvc.get("/api/archive/sessions") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[*].sessionNumber") { value(hasItem(91)) }
    }

    mockMvc.get("/api/notes/sessions") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[*].sessionNumber") { value(not(hasItem(91))) }
    }

    jdbcTemplate.update(
        """
        update sessions
        set state = 'PUBLISHED'
        where id = ?
        """.trimIndent(),
        sessionId,
    )

    mockMvc.get("/api/notes/sessions") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[*].sessionNumber") { value(hasItem(91)) }
    }
}
```

Add a private helper in the same test class:

```kotlin
private fun insertClosedPublicSessionWithQuestion(number: Int): String {
    val sessionId = "00000000-0000-0000-0000-000000009091"
    jdbcTemplate.update(
        """
        delete from questions where session_id = ?;
        delete from session_participants where session_id = ?;
        delete from public_session_publications where session_id = ?;
        delete from sessions where id = ?;
        """.trimIndent(),
        sessionId,
        sessionId,
        sessionId,
        sessionId,
    )
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, book_translator,
          book_link, book_image_url, session_date, start_time, end_time,
          location_label, meeting_url, meeting_passcode, question_deadline_at,
          state, visibility
        )
        values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, '테스트 저자',
          null, null, null, '2026-10-21', '20:00:00', '22:00:00',
          '온라인', null, null, '2026-10-20 14:59:00.000000', 'CLOSED', 'PUBLIC')
        """.trimIndent(),
        sessionId,
        number,
        "${number}회차 · 닫힌 공개 테스트",
        "닫힌 공개 테스트 책",
    )
    jdbcTemplate.update(
        """
        insert into session_participants (
          id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
        )
        values ('00000000-0000-0000-0000-000000009191', '00000000-0000-0000-0000-000000000001', ?,
          '00000000-0000-0000-0000-000000000202', 'GOING', 'ATTENDED', 'ACTIVE')
        """.trimIndent(),
        sessionId,
    )
    jdbcTemplate.update(
        """
        insert into public_session_publications (
          id, club_id, session_id, public_summary, is_public, visibility, published_at
        )
        values ('00000000-0000-0000-0000-000000009291', '00000000-0000-0000-0000-000000000001', ?,
          '닫힌 공개 테스트 요약입니다.', true, 'PUBLIC', utc_timestamp(6))
        """.trimIndent(),
        sessionId,
    )
    jdbcTemplate.update(
        """
        insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
        values ('00000000-0000-0000-0000-000000009391', '00000000-0000-0000-0000-000000000001', ?,
          '00000000-0000-0000-0000-000000000202', 1, '닫힌 공개 테스트 질문입니다.', null)
        """.trimIndent(),
        sessionId,
    )
    return sessionId
}
```

- [x] **Step 2: Run archive and notes tests**

Run:

```bash
./server/gradlew -p server test --tests "com.readmates.archive.api.ArchiveAndNotesDbTest"
```

Expected: pass after Task 2.

- [x] **Step 3: Commit Task 3**

```bash
git add server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt
git commit -m "test: cover closed and published record surfaces"
```

Task 3 checkpoint (2026-04-25):
- Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/session-lifecycle-publication`, `codex/session-lifecycle-publication`.
- Changed files: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`.
- Decisions: regression uses an isolated inserted CLOSED/PUBLIC session with a question and flips only `sessions.state` to prove archive vs notes lifecycle behavior.
- Reviews: spec review passed; quality review passed with a minor note that `sessionId`/`questionCount` assertions could make the final notes check more explicit.
- Verification: `./server/gradlew -p server test --tests "com.readmates.archive.api.ArchiveAndNotesDbTest"` passed.
- Background resources: no Node/Vite/dev server/browser sessions started; completed Task 3 agents were closed.
- Remaining risks/next task notes: frontend tasks must avoid the unrelated original-worktree host-dashboard changes and operate only in this integration worktree.

## Task 4: Frontend API Wiring

**Files:**
- Modify `front/features/host/api/host-api.ts`
- Modify `front/features/host/components/host-session-editor.tsx`
- Modify `front/features/host/route/host-session-editor-data.ts`
- Test: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Extend editor action type and test actions**

In `HostSessionEditorActions`, add:

```ts
closeSession: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
publishSession: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
```

In `front/tests/unit/host-session-editor.test.tsx`, update `hostSessionEditorTestActions`:

```ts
closeSession: (sessionId) =>
  fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
  }) as Promise<JsonResponse<HostSessionDetailResponse>>,
publishSession: (sessionId) =>
  fetch(`/api/bff/api/host/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
  }) as Promise<JsonResponse<HostSessionDetailResponse>>,
```

- [ ] **Step 2: Add failing API tests through component behavior**

In `host-session-editor.test.tsx`, add:

```tsx
it("lets hosts close an open session from the editor", async () => {
  const user = userEvent.setup();
  const closeSession = vi.fn(async () => new Response(JSON.stringify({ ...openSession, state: "CLOSED" }), { status: 200 }) as JsonResponse<HostSessionDetailResponse>);

  render(
    <HostSessionEditorForTest
      session={openSession}
      actions={{ ...hostSessionEditorTestActions, closeSession }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "세션 마감" }));

  expect(closeSession).toHaveBeenCalledWith(openSession.sessionId);
  expect(await screen.findByText("닫힘")).toBeInTheDocument();
})

it("saves publication and publishes a closed record", async () => {
  const user = userEvent.setup();
  const closedSession = { ...session, state: "CLOSED" as const };
  const savePublication = vi.fn(async () => new Response("{}", { status: 200 }));
  const publishSession = vi.fn(async () => new Response(JSON.stringify({ ...closedSession, state: "PUBLISHED" }), { status: 200 }) as JsonResponse<HostSessionDetailResponse>);

  render(
    <HostSessionEditorForTest
      session={closedSession}
      actions={{ ...hostSessionEditorTestActions, savePublication, publishSession }}
    />,
  );

  await user.clear(screen.getByLabelText("기록 요약"));
  await user.type(screen.getByLabelText("기록 요약"), "최종 공개 요약입니다.");
  await user.click(screen.getByRole("radio", { name: /외부 공개/ }));
  await user.click(screen.getByRole("button", { name: "기록 공개" }));

  expect(savePublication).toHaveBeenCalledWith(closedSession.sessionId, {
    publicSummary: "최종 공개 요약입니다.",
    visibility: "PUBLIC",
  });
  expect(publishSession).toHaveBeenCalledWith(closedSession.sessionId);
  expect(await screen.findByText("공개됨")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run frontend tests and verify failures**

Run:

```bash
pnpm --dir front test -- host-session-editor.test.tsx
```

Expected: tests fail because actions and buttons do not exist.

- [ ] **Step 4: Add API functions**

In `host-api.ts`, add:

```ts
export function closeHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function publishHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}
```

In `host-session-editor-data.ts`, import and wire:

```ts
closeHostSession,
publishHostSession,
```

```ts
closeSession: closeHostSession,
publishSession: publishHostSession,
```

- [ ] **Step 5: Commit Task 4**

```bash
git add front/features/host/api/host-api.ts front/features/host/route/host-session-editor-data.ts front/features/host/components/host-session-editor.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: wire host lifecycle actions"
```

## Task 5: Frontend Lifecycle UX

**Files:**
- Modify `front/features/host/components/host-session-editor.tsx`
- Modify `front/features/host/model/host-session-editor-model.ts`
- Test: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Add local lifecycle state**

In `HostSessionEditor`, add state near existing local state:

```ts
const [sessionState, setSessionState] = useState(() => session?.state ?? "DRAFT");
const [lifecycleSaveState, setLifecycleSaveState] = useState<"idle" | "saving" | "error">("idle");
```

Replace display reads of `session.state` with `sessionState` for badges and lifecycle controls. Do not mutate `session`.

- [ ] **Step 2: Add close handler**

Add:

```ts
const closeSession = async () => {
  if (!session || lifecycleSaveState === "saving") {
    return;
  }

  setLifecycleSaveState("saving");
  try {
    const response = await actions.closeSession(session.sessionId);
    if (!response.ok) {
      setLifecycleSaveState("error");
      flash("세션 마감에 실패했습니다. 상태를 확인한 뒤 다시 시도해 주세요");
      return;
    }

    const nextSession = await response.json();
    setSessionState(nextSession.state);
    setLifecycleSaveState("idle");
    flash("세션을 마감했습니다.");
  } catch {
    setLifecycleSaveState("error");
    flash("세션 마감에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요");
  }
};
```

- [ ] **Step 3: Add publish handler**

Add:

```ts
const publishRecord = async () => {
  if (!session || recordSaveInFlight || lifecycleSaveState === "saving") {
    return;
  }

  const publicationRequest = buildPublicationRequest(summary, recordVisibility);
  if (!publicationRequest) {
    setPublicationFeedback({
      tone: "error",
      message: "기록 요약을 입력한 뒤 공개해 주세요.",
    });
    return;
  }

  setRecordSaveInFlight(true);
  setLifecycleSaveState("saving");
  setPublicationFeedback(null);

  try {
    const saveResponse = await actions.savePublication(session.sessionId, publicationRequest);
    if (!saveResponse.ok) {
      setPublicationFeedback({
        tone: "error",
        message: "기록 공개 범위 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.",
      });
      return;
    }

    const publishResponse = await actions.publishSession(session.sessionId);
    if (!publishResponse.ok) {
      setPublicationFeedback({
        tone: "error",
        message: "기록 공개에 실패했습니다. 세션이 마감되었는지 확인해 주세요.",
      });
      return;
    }

    const nextSession = await publishResponse.json();
    setSummary(publicationRequest.publicSummary);
    setRecordVisibility(publicationRequest.visibility);
    setHasPublicationRecord(true);
    setSessionState(nextSession.state);
    setPublicationFeedback({
      tone: "success",
      message: publicationRequest.visibility === "PUBLIC" ? "외부 공개가 완료되었습니다." : "멤버 기록 공개가 완료되었습니다.",
    });
  } catch {
    setPublicationFeedback({
      tone: "error",
      message: "기록 공개에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    });
  } finally {
    setRecordSaveInFlight(false);
    setLifecycleSaveState("idle");
  }
};
```

- [ ] **Step 4: Add buttons and copy**

In the header/status area, keep the state badge but use `sessionState`.

In the publication panel, keep the existing `저장` button and add state-aware controls:

```tsx
{session && sessionState === "OPEN" ? (
  <button
    type="button"
    className="btn btn-secondary"
    disabled={lifecycleSaveState === "saving"}
    onClick={() => void closeSession()}
  >
    {lifecycleSaveState === "saving" ? "마감하는 중" : "세션 마감"}
  </button>
) : null}
{session && sessionState === "CLOSED" ? (
  <button
    type="button"
    className="btn btn-primary"
    disabled={recordSaveInFlight || lifecycleSaveState === "saving"}
    onClick={() => void publishRecord()}
  >
    {lifecycleSaveState === "saving" ? "공개하는 중" : "기록 공개"}
  </button>
) : null}
{session && sessionState === "PUBLISHED" ? (
  <span className="badge badge-ok">공개 완료</span>
) : null}
```

Update helper copy:

```tsx
const publicationLifecycleHelp =
  sessionState === "OPEN"
    ? "진행 중인 세션은 먼저 마감한 뒤 기록 공개를 완료할 수 있습니다."
    : sessionState === "CLOSED"
      ? "요약과 공개 대상을 확인한 뒤 기록 공개를 완료하세요."
      : sessionState === "PUBLISHED"
        ? "공개된 기록입니다. 공개 대상은 저장 버튼으로 변경할 수 있습니다."
        : "세션을 만든 뒤 기록 요약과 공개 범위를 저장할 수 있습니다.";
```

Render that helper near `publication-summary-help`.

- [ ] **Step 5: Keep labels clear**

In `host-session-editor-model.ts`, change `recordVisibilityDescription("PUBLIC")` to:

```ts
return "기록 공개를 완료하면 멤버 앱과 공개 기록 목록에 표시됩니다.";
```

Change `recordVisibilityDescription("MEMBER")` to:

```ts
return "기록 공개를 완료하면 멤버 앱 안에서만 볼 수 있습니다.";
```

- [ ] **Step 6: Run frontend editor tests**

Run:

```bash
pnpm --dir front test -- host-session-editor.test.tsx host-session-editor-model.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add front/features/host/components/host-session-editor.tsx front/features/host/model/host-session-editor-model.ts front/tests/unit/host-session-editor.test.tsx front/tests/unit/host-session-editor-model.test.ts
git commit -m "feat: clarify host publish lifecycle"
```

## Task 6: Full Verification

**Files:**
- No new code files.

- [ ] **Step 1: Run server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: build success.

- [ ] **Step 2: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass.

- [ ] **Step 3: Run e2e if auth/BFF route behavior changed**

Run if implementation touched BFF route behavior or end-to-end auth flow:

```bash
pnpm --dir front test:e2e
```

Expected: pass or unchanged known environment skip. Do not claim e2e pass unless the command completes successfully.

- [ ] **Step 4: Manual smoke path**

Start local app as usual, then verify:

1. Host opens `/app/host/sessions/{sessionId}/edit` for an `OPEN` session.
2. Click `세션 마감`.
3. Confirm `/app/session/current` no longer shows that session.
4. Set `외부 공개`, enter summary, click `기록 공개`.
5. Confirm `/app/archive` shows the record.
6. Confirm `/app/notes?sessionId={sessionId}` shows notes only after publish.
7. Confirm public record URL returns 404 before publish and 200 after publish.

- [ ] **Step 5: Final commit**

```bash
git status --short
git log --oneline -5
```

Expected: only intentional changes remain. If prior task commits were made, no extra commit is needed. If verification fixes were added, commit them:

```bash
git add server front
git commit -m "fix: stabilize session lifecycle publication"
```

## Self-Review

- Spec coverage: the plan covers state transitions, visibility separation, archive/notes/public behavior, host UX, and verification.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: server methods use `HostSessionIdCommand` and return `HostSessionDetailResponse`; frontend actions return `HostSessionDetailResponse` JSON responses.
- Safety: docs use example emails only and do not include deployment state, private domains, local absolute paths, or secrets.
