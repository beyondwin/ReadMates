# Upcoming Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosts create and manage multiple upcoming sessions while members see only member-visible upcoming sessions and current participation remains limited to one `OPEN` session.

**Architecture:** Reuse `sessions.state` as the phase model: `DRAFT` means upcoming, `OPEN` means current, `CLOSED/PUBLISHED` mean record surfaces. Add `sessions.visibility` as the source of truth for session-level visibility and keep publication visibility synchronized for existing publication behavior. Extend the existing session clean-architecture slice: controllers call inbound ports, services delegate to outbound ports, JDBC adapters own SQL.

**Tech Stack:** Kotlin/Spring Boot, JDBC, Flyway MySQL/base migrations, React/Vite/React Router, Vitest/Testing Library, Playwright E2E.

---

## File Structure

Server schema:

- Create `server/src/main/resources/db/mysql/migration/V15__session_visibility.sql` for production MySQL.
- Create `server/src/main/resources/db/migration/V10__session_visibility.sql` for the base migration tree.
- Modify `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt` to verify the new column and check constraint.

Server contracts and API:

- Modify `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt` to add `SessionRecordVisibility` to session response models and add list/upcoming models.
- Modify `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt` to add visibility/open commands.
- Modify `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt` and `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`.
- Modify `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt` for host list, visibility, and open routes.
- Create `server/src/main/kotlin/com/readmates/session/adapter/in/web/UpcomingSessionController.kt`.
- Modify `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`.

Server query filters:

- Modify `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`.
- Modify `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`.
- Modify `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt` so public queries also respect `sessions.visibility = 'PUBLIC'`.

Server tests:

- Modify `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`.
- Modify `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`.
- Modify `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`.
- Modify `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`.

Frontend API and route data:

- Modify `front/features/host/api/host-contracts.ts`.
- Modify `front/features/host/api/host-api.ts`.
- Modify `front/features/host/route/host-dashboard-data.ts`.
- Modify `front/features/member-home/api/member-home-contracts.ts`.
- Modify `front/features/member-home/api/member-home-api.ts`.
- Modify `front/features/member-home/route/member-home-data.ts`.

Frontend UI:

- Modify `front/features/host/components/host-dashboard.tsx`.
- Modify `front/features/member-home/components/member-home.tsx`.
- Modify `front/features/host/components/host-session-editor.tsx` redirect behavior after create.
- Modify `front/features/host/model/host-session-editor-model.ts` for `DRAFT` label copy.
- Modify `front/shared/ui/session-identity.tsx` label copy so `DRAFT` reads as upcoming, not private draft.

Frontend tests:

- Modify `front/tests/unit/host-dashboard.test.tsx`.
- Modify `front/tests/unit/host-session-editor.test.tsx`.
- Modify `front/tests/unit/member-home.test.tsx`.
- Modify `front/tests/e2e/dev-login-session-flow.spec.ts`.

---

### Task 1: Add `sessions.visibility` Schema

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V15__session_visibility.sql`
- Create: `server/src/main/resources/db/migration/V10__session_visibility.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Write the failing MySQL migration test**

Add this assertion block inside `mysql baseline creates auth session and feedback document tables` after the existing visibility constraint assertions:

```kotlin
val sessionVisibilityColumns = jdbcTemplate.queryForList(
    """
    select column_name, column_default, is_nullable
    from information_schema.columns
    where table_schema = database()
      and table_name = 'sessions'
      and column_name = 'visibility'
    """.trimIndent(),
)
assertEquals(1, sessionVisibilityColumns.size)
assertEquals("NO", sessionVisibilityColumns.first()["IS_NULLABLE"])

val sessionVisibilityConstraints = jdbcTemplate.queryForList(
    """
    select constraint_name, check_clause
    from information_schema.check_constraints
    where constraint_schema = database()
      and constraint_name = 'sessions_visibility_check'
    """.trimIndent(),
)
assertTrue(sessionVisibilityConstraints.any { row ->
    val clause = row["CHECK_CLAUSE"].toString()
    clause.contains("HOST_ONLY") &&
        clause.contains("MEMBER") &&
        clause.contains("PUBLIC")
})
```

- [x] **Step 2: Run migration test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: FAIL because `sessions.visibility` does not exist.

- [x] **Step 3: Create the MySQL migration**

Create `server/src/main/resources/db/mysql/migration/V15__session_visibility.sql`:

```sql
alter table sessions
  add column visibility varchar(20) not null default 'HOST_ONLY' after state;

update sessions
left join public_session_publications on public_session_publications.session_id = sessions.id
  and public_session_publications.club_id = sessions.club_id
set sessions.visibility = case
  when public_session_publications.visibility = 'PUBLIC' then 'PUBLIC'
  when sessions.state in ('CLOSED', 'PUBLISHED') then 'MEMBER'
  else 'HOST_ONLY'
end;

alter table sessions
  add constraint sessions_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
```

- [x] **Step 4: Create the base migration**

Create `server/src/main/resources/db/migration/V10__session_visibility.sql`:

```sql
alter table sessions
  add column visibility varchar(20) not null default 'HOST_ONLY';

update sessions
set visibility = case
  when state in ('CLOSED', 'PUBLISHED') then 'MEMBER'
  else 'HOST_ONLY'
end;

alter table sessions
  add constraint sessions_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
```

- [x] **Step 5: Run migration test to verify it passes**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V15__session_visibility.sql \
  server/src/main/resources/db/migration/V10__session_visibility.sql \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
git commit -m "feat: add session visibility column"
```

**Task 1 checkpoint:**
- Task: Task 1, Add `sessions.visibility` Schema.
- Changed files: `server/src/main/resources/db/mysql/migration/V15__session_visibility.sql`, `server/src/main/resources/db/migration/V10__session_visibility.sql`, `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`, `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`, `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`, `docs/superpowers/plans/2026-04-25-readmates-upcoming-session-management-implementation-plan.md`.
- Key decision: Promote to `PUBLIC` only when the session is `PUBLISHED` and its publication is public; otherwise keep `CLOSED`/`PUBLISHED` member-visible and `DRAFT`/`OPEN` host-only. Base migration uses `public_session_publications.is_public`; MySQL migration uses `public_session_publications.visibility`.
- Review issues/resolution: resolved base migration public-publication backfill, MySQL draft/open publication promotion, dev seed session visibility consistency, and added a MySQL seed visibility assertion.
- Verification: `./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest` failed before migrations with `AssertionFailedError` at `MySqlFlywayMigrationTest.kt:109`; review regression assertion failed before seed fixes with `AssertionFailedError` at `MySqlFlywayMigrationTest.kt:150`; `./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest --rerun-tasks` passed after review fixes with `BUILD SUCCESSFUL in 11s`.
- Remaining risk: Only schema and migration coverage changed; application reads/writes for the new column remain for later tasks.
- Next task note: Task 2 should add server contracts using `SessionRecordVisibility`.
- Worktree/branch: `upcoming-session-management-20260425` worktree, `codex/upcoming-session-management-20260425`.

---

### Task 2: Extend Server Session Contracts

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionCommandServiceTest.kt`

- [ ] **Step 1: Write failing service delegation tests**

In `HostSessionCommandServiceTest`, add tests that prove the service delegates list, visibility, open, and upcoming calls:

```kotlin
@Test
fun `service delegates host session list`() {
    val port = RecordingHostSessionWritePort()
    val service = HostSessionCommandService(port)

    service.list(host)

    assertEquals(host, port.listHost)
}

@Test
fun `service delegates visibility update`() {
    val port = RecordingHostSessionWritePort()
    val service = HostSessionCommandService(port)
    val command = UpdateHostSessionVisibilityCommand(host, UUID.randomUUID(), SessionRecordVisibility.MEMBER)

    service.updateVisibility(command)

    assertEquals(command, port.visibilityCommand)
}

@Test
fun `service delegates open transition`() {
    val port = RecordingHostSessionWritePort()
    val service = HostSessionCommandService(port)
    val command = HostSessionIdCommand(host, UUID.randomUUID())

    service.open(command)

    assertEquals(command, port.openCommand)
}

@Test
fun `service delegates upcoming sessions`() {
    val port = RecordingHostSessionWritePort()
    val service = HostSessionCommandService(port)

    service.upcoming(host)

    assertEquals(host, port.upcomingMember)
}
```

Extend the `RecordingHostSessionWritePort` with these properties and method implementations:

```kotlin
var listHost: CurrentMember? = null
var visibilityCommand: UpdateHostSessionVisibilityCommand? = null
var openCommand: HostSessionIdCommand? = null
var upcomingMember: CurrentMember? = null

override fun list(host: CurrentMember): List<HostSessionListItem> {
    listHost = host
    return emptyList()
}

override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
    visibilityCommand = command
    return hostSessionDetail(command.sessionId).copy(visibility = command.visibility)
}

override fun open(command: HostSessionIdCommand): HostSessionDetailResponse {
    openCommand = command
    return hostSessionDetail(command.sessionId).copy(state = "OPEN")
}

override fun upcoming(member: CurrentMember): List<UpcomingSessionItem> {
    upcomingMember = member
    return emptyList()
}
```

- [ ] **Step 2: Run the service test to verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.application.service.HostSessionCommandServiceTest
```

Expected: FAIL because the new commands, models, and port methods do not exist.

- [ ] **Step 3: Add application models**

In `SessionApplicationModels.kt`, ensure `SessionRecordVisibility` exists once and add `visibility` to `CreatedSessionResponse` and `HostSessionDetailResponse`:

```kotlin
enum class SessionRecordVisibility {
    HOST_ONLY,
    MEMBER,
    PUBLIC,
}
```

Add:

```kotlin
val visibility: SessionRecordVisibility,
```

to `CreatedSessionResponse` and `HostSessionDetailResponse`.

Add list/upcoming response models:

```kotlin
data class HostSessionListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    val state: String,
    val visibility: SessionRecordVisibility,
)

data class UpcomingSessionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    val visibility: SessionRecordVisibility,
)
```

- [ ] **Step 4: Add command model**

In `HostSessionCommands.kt`, add:

```kotlin
data class UpdateHostSessionVisibilityCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val visibility: SessionRecordVisibility,
)
```

- [ ] **Step 5: Extend inbound and outbound ports**

In `HostSessionUseCases.kt`, extend `ManageHostSessionUseCase` and add a member query port:

```kotlin
interface ManageHostSessionUseCase {
    fun list(host: CurrentMember): List<HostSessionListItem>
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse
    fun open(command: HostSessionIdCommand): HostSessionDetailResponse
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
}

interface ListUpcomingSessionsUseCase {
    fun upcoming(member: CurrentMember): List<UpcomingSessionItem>
}
```

In `HostSessionWritePort.kt`, add matching methods:

```kotlin
fun list(host: CurrentMember): List<HostSessionListItem>
fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse
fun open(command: HostSessionIdCommand): HostSessionDetailResponse
fun upcoming(member: CurrentMember): List<UpcomingSessionItem>
```

- [ ] **Step 6: Extend the service**

Update `HostSessionCommandService` to implement `ListUpcomingSessionsUseCase` and delegate:

```kotlin
override fun list(host: CurrentMember) = port.list(host)

@Transactional
override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) = port.updateVisibility(command)

@Transactional
override fun open(command: HostSessionIdCommand) = port.open(command)

override fun upcoming(member: CurrentMember) = port.upcoming(member)
```

- [ ] **Step 7: Fix test fixture response construction**

Where tests construct `CreatedSessionResponse` or `HostSessionDetailResponse`, add:

```kotlin
visibility = SessionRecordVisibility.HOST_ONLY,
```

Use `SessionRecordVisibility.MEMBER` in visibility-specific fixture assertions.

- [ ] **Step 8: Run the service test to verify it passes**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.application.service.HostSessionCommandServiceTest
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/application \
  server/src/test/kotlin/com/readmates/session/application/service/HostSessionCommandServiceTest.kt
git commit -m "feat: extend session management contracts"
```

---

### Task 3: Implement Host Session API and Persistence

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/web/UpcomingSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`

- [ ] **Step 1: Write failing host creation test**

Replace the current creation test expectation in `HostSessionControllerDbTest` with the new behavior:

```kotlin
@Test
fun `host creates draft upcoming session without participants`() {
    seedNonActiveMemberships()

    mockMvc.post("/api/host/sessions") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = hostSessionRequestJson()
    }.andExpect {
        status { isCreated() }
        jsonPath("$.sessionNumber") { value(7) }
        jsonPath("$.state") { value("DRAFT") }
        jsonPath("$.visibility") { value("HOST_ONLY") }
    }

    val participantCount = jdbcTemplate.queryForObject(
        """
        select count(*)
        from session_participants
        join sessions on sessions.id = session_participants.session_id
          and sessions.club_id = session_participants.club_id
        where sessions.club_id = '00000000-0000-0000-0000-000000000001'
          and sessions.number = 7
        """.trimIndent(),
        Int::class.java,
    )
    assertEquals(0, participantCount)
}
```

Add helper:

```kotlin
private fun hostSessionRequestJson() =
    """
    {
      "title": "7회차 · 테스트 책",
      "bookTitle": "테스트 책",
      "bookAuthor": "테스트 저자",
      "bookLink": "https://example.com/books/test-book",
      "bookImageUrl": "https://example.com/covers/test-book.jpg",
      "date": "2026-05-20",
      "startTime": "19:30",
      "endTime": "21:40",
      "questionDeadlineAt": "2026-05-18T22:30:00+09:00",
      "locationLabel": "온라인",
      "meetingUrl": "https://meet.google.com/readmates-test",
      "meetingPasscode": "readmates"
    }
    """.trimIndent()
```

- [ ] **Step 2: Write failing tests for list, visibility, upcoming, and open**

Add these tests to `HostSessionControllerDbTest`:

```kotlin
@Test
fun `host can list draft and open sessions including host only visibility`() {
    val sessionId = createDraftSessionSeven()

    mockMvc.get("/api/host/sessions") {
        with(user("host@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].sessionId") { value(sessionId) }
        jsonPath("$[0].state") { value("DRAFT") }
        jsonPath("$[0].visibility") { value("HOST_ONLY") }
    }
}

@Test
fun `host updates draft session visibility and member upcoming sessions include it`() {
    val sessionId = createDraftSessionSeven()

    mockMvc.patch("/api/host/sessions/$sessionId/visibility") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"visibility":"MEMBER"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.visibility") { value("MEMBER") }
    }

    mockMvc.get("/api/sessions/upcoming") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].sessionId") { value(sessionId) }
        jsonPath("$[0].visibility") { value("MEMBER") }
    }
}

@Test
fun `host starts draft session as open and creates active participants`() {
    val sessionId = createDraftSessionSeven()

    mockMvc.post("/api/host/sessions/$sessionId/open") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
        jsonPath("$.state") { value("OPEN") }
    }

    val participantCount = participantCountForSessionNumber(7)
    assertEquals(6, participantCount)
}

@Test
fun `host cannot start another open session while one exists`() {
    val firstSessionId = createDraftSessionSeven()
    mockMvc.post("/api/host/sessions/$firstSessionId/open") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isOk() }
    }

    val secondSessionId = createDraftSessionEight()
    mockMvc.post("/api/host/sessions/$secondSessionId/open") {
        with(user("host@example.com"))
        with(csrf())
    }.andExpect {
        status { isConflict() }
    }
}
```

Add helper methods:

```kotlin
private fun createDraftSessionSeven(): String = createDraftSession("7회차 · 테스트 책", "테스트 책", "2026-05-20")

private fun createDraftSessionEight(): String = createDraftSession("8회차 · 다음 책", "다음 책", "2026-06-17")

private fun createDraftSession(title: String, bookTitle: String, date: String): String {
    val response = mockMvc.post("/api/host/sessions") {
        with(user("host@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content =
            """
            {
              "title": "$title",
              "bookTitle": "$bookTitle",
              "bookAuthor": "테스트 저자",
              "bookLink": "https://example.com/books/test-book",
              "bookImageUrl": "https://example.com/covers/test-book.jpg",
              "date": "$date",
              "locationLabel": "온라인"
            }
            """.trimIndent()
    }.andExpect {
        status { isCreated() }
    }.andReturn()

    return """"sessionId"\s*:\s*"([^"]+)""""
        .toRegex()
        .find(response.response.contentAsString)
        ?.groupValues
        ?.get(1)
        ?: error("created session response did not include a sessionId")
}

private fun participantCountForSessionNumber(number: Int): Int =
    jdbcTemplate.queryForObject(
        """
        select count(*)
        from session_participants
        join sessions on sessions.id = session_participants.session_id
          and sessions.club_id = session_participants.club_id
        where sessions.club_id = '00000000-0000-0000-0000-000000000001'
          and sessions.number = ?
          and session_participants.participation_status = 'ACTIVE'
        """.trimIndent(),
        Int::class.java,
        number,
    ) ?: 0
```

- [ ] **Step 3: Run host session tests to verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: FAIL because new endpoints and new creation behavior do not exist.

- [ ] **Step 4: Add web routes**

In `HostSessionController.kt`, add request DTO and routes:

```kotlin
data class HostSessionVisibilityRequest(
    val visibility: SessionRecordVisibility,
) {
    fun toCommand(host: CurrentMember, sessionId: UUID): UpdateHostSessionVisibilityCommand =
        UpdateHostSessionVisibilityCommand(host, sessionId, visibility)
}

@GetMapping
fun list(member: CurrentMember) = manageHostSessionUseCase.list(member)

@PatchMapping("/{sessionId}/visibility")
fun visibility(
    @PathVariable sessionId: String,
    @Valid @RequestBody request: HostSessionVisibilityRequest,
    member: CurrentMember,
) = manageHostSessionUseCase.updateVisibility(request.toCommand(member, parseHostSessionId(sessionId)))

@PostMapping("/{sessionId}/open")
fun open(
    member: CurrentMember,
    @PathVariable sessionId: String,
) = manageHostSessionUseCase.open(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
```

Create `UpcomingSessionController.kt`:

```kotlin
package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.port.`in`.ListUpcomingSessionsUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions/upcoming")
class UpcomingSessionController(
    private val listUpcomingSessionsUseCase: ListUpcomingSessionsUseCase,
) {
    @GetMapping
    fun upcoming(member: CurrentMember) = listUpcomingSessionsUseCase.upcoming(member)
}
```

- [ ] **Step 5: Add exception for invalid open transition**

In `SessionApplicationSupport.kt`, add:

```kotlin
@ResponseStatus(HttpStatus.CONFLICT)
class HostSessionOpenNotAllowedException : RuntimeException("Only draft sessions can be opened")
```

- [ ] **Step 6: Implement JDBC creation as draft**

In `JdbcHostSessionWriteAdapter.createOpenSession`, rename the private function to `createDraftSession`, keep the public `create` override, remove the existing open-session-count check, set:

```kotlin
val state = "DRAFT"
val visibility = SessionRecordVisibility.HOST_ONLY
```

Add `visibility` to the insert column list and values:

```sql
visibility
```

and:

```kotlin
visibility.name,
```

Remove the `activeMembershipIds.forEach` participant creation block from create. Add to `CreatedSessionResponse`:

```kotlin
visibility = visibility,
```

- [ ] **Step 7: Implement list/upcoming/visibility/open JDBC methods**

Add these methods to `JdbcHostSessionWriteAdapter`:

```kotlin
override fun list(host: CurrentMember): List<HostSessionListItem> {
    requireHost(host)
    return jdbcTemplate().query(
        """
        select id, number, title, book_title, book_author, book_image_url,
               session_date, start_time, end_time, location_label, state, visibility
        from sessions
        where club_id = ?
        order by
          case state when 'OPEN' then 0 when 'DRAFT' then 1 when 'CLOSED' then 2 else 3 end,
          session_date,
          number
        """.trimIndent(),
        { resultSet, _ -> resultSet.toHostSessionListItem() },
        host.clubId.dbString(),
    )
}

override fun upcoming(member: CurrentMember): List<UpcomingSessionItem> =
    jdbcTemplate().query(
        """
        select id, number, title, book_title, book_author, book_image_url,
               session_date, start_time, end_time, location_label, visibility
        from sessions
        where club_id = ?
          and state = 'DRAFT'
          and visibility in ('MEMBER', 'PUBLIC')
        order by session_date, number
        """.trimIndent(),
        { resultSet, _ -> resultSet.toUpcomingSessionItem() },
        member.clubId.dbString(),
    )

@Transactional
override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
    requireHostSession(command.host, command.sessionId)
    val jdbcTemplate = jdbcTemplate()
    jdbcTemplate.update(
        """
        update sessions
        set visibility = ?,
            updated_at = utc_timestamp(6)
        where id = ?
          and club_id = ?
        """.trimIndent(),
        command.visibility.name,
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    )
    jdbcTemplate.update(
        """
        update public_session_publications
        set visibility = ?,
            is_public = ?,
            published_at = case when ? then coalesce(published_at, utc_timestamp(6)) else null end,
            updated_at = utc_timestamp(6)
        where session_id = ?
          and club_id = ?
        """.trimIndent(),
        command.visibility.name,
        command.visibility == SessionRecordVisibility.PUBLIC,
        command.visibility == SessionRecordVisibility.PUBLIC,
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    )
    return findHostSession(command.host, command.sessionId)
}
```

Add open transition:

```kotlin
@Transactional
override fun open(command: HostSessionIdCommand): HostSessionDetailResponse {
    requireHost(command.host)
    val jdbcTemplate = jdbcTemplate()
    jdbcTemplate.queryForObject(
        "select id from clubs where id = ? for update",
        String::class.java,
        command.host.clubId.dbString(),
    )
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

    if (state == "OPEN") {
        return findHostSession(command.host, command.sessionId)
    }
    if (state != "DRAFT") {
        throw HostSessionOpenNotAllowedException()
    }

    val openSessionCount = jdbcTemplate.queryForObject(
        """
        select count(*)
        from sessions
        where club_id = ?
          and state = 'OPEN'
        """.trimIndent(),
        Int::class.java,
        command.host.clubId.dbString(),
    ) ?: 0
    if (openSessionCount > 0) {
        throw OpenSessionAlreadyExistsException()
    }

    jdbcTemplate.update(
        """
        update sessions
        set state = 'OPEN',
            updated_at = utc_timestamp(6)
        where id = ?
          and club_id = ?
        """.trimIndent(),
        command.sessionId.dbString(),
        command.host.clubId.dbString(),
    )
    createActiveParticipants(jdbcTemplate, command.host.clubId, command.sessionId)
    return findHostSession(command.host, command.sessionId)
}
```

Extract participant creation:

```kotlin
private fun createActiveParticipants(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID) {
    val activeMembershipIds = jdbcTemplate.query(
        """
        select id
        from memberships
        where club_id = ?
          and status = 'ACTIVE'
        order by joined_at is null, joined_at, created_at
        """.trimIndent(),
        { resultSet, _ -> resultSet.uuid("id") },
        clubId.dbString(),
    )
    activeMembershipIds.forEach { membershipId ->
        jdbcTemplate.update(
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
            UUID.randomUUID().dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            membershipId.dbString(),
        )
    }
}
```

Add mappers:

```kotlin
private fun ResultSet.toHostSessionListItem() = HostSessionListItem(
    sessionId = uuid("id").toString(),
    sessionNumber = getInt("number"),
    title = getString("title"),
    bookTitle = getString("book_title"),
    bookAuthor = getString("book_author"),
    bookImageUrl = getString("book_image_url"),
    date = getObject("session_date", LocalDate::class.java).toString(),
    startTime = getObject("start_time", LocalTime::class.java).toString(),
    endTime = getObject("end_time", LocalTime::class.java).toString(),
    locationLabel = getString("location_label"),
    state = getString("state"),
    visibility = SessionRecordVisibility.valueOf(getString("visibility")),
)

private fun ResultSet.toUpcomingSessionItem() = UpcomingSessionItem(
    sessionId = uuid("id").toString(),
    sessionNumber = getInt("number"),
    title = getString("title"),
    bookTitle = getString("book_title"),
    bookAuthor = getString("book_author"),
    bookImageUrl = getString("book_image_url"),
    date = getObject("session_date", LocalDate::class.java).toString(),
    startTime = getObject("start_time", LocalTime::class.java).toString(),
    endTime = getObject("end_time", LocalTime::class.java).toString(),
    locationLabel = getString("location_label"),
    visibility = SessionRecordVisibility.valueOf(getString("visibility")),
)
```

- [ ] **Step 8: Include visibility in detail queries**

In the `findHostSession` select list, add `visibility`. In `HostSessionDetailResponse`, set:

```kotlin
visibility = SessionRecordVisibility.valueOf(resultSet.getString("visibility")),
```

Update `upsertHostPublication` so saving a publication also updates `sessions.visibility`:

```kotlin
jdbcTemplate.update(
    """
    update sessions
    set visibility = ?,
        updated_at = utc_timestamp(6)
    where id = ?
      and club_id = ?
    """.trimIndent(),
    command.visibility.name,
    command.sessionId.dbString(),
    command.host.clubId.dbString(),
)
```

- [ ] **Step 9: Run host session tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: PASS after updating old assertions that expected creation to return `OPEN`.

- [ ] **Step 10: Add current-session regression**

In `CurrentSessionControllerDbTest`, add:

```kotlin
@Test
fun `draft upcoming sessions do not appear as current session`() {
    insertDraftSession(number = 77, visibility = "MEMBER")

    mockMvc.get("/api/sessions/current") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.currentSession") { value(null) }
    }
}
```

Add helper in that test class:

```kotlin
private fun insertDraftSession(number: Int, visibility: String) {
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, book_translator,
          book_link, book_image_url, session_date, start_time, end_time,
          location_label, meeting_url, meeting_passcode, question_deadline_at,
          state, visibility
        )
        values (
          ?, '00000000-0000-0000-0000-000000000001', ?, ?,
          ?, '테스트 저자', null, null, null, '2026-07-15',
          '20:00:00', '22:00:00', '온라인', null, null,
          '2026-07-14 14:59:00.000000', 'DRAFT', ?
        )
        """.trimIndent(),
        UUID.randomUUID().toString(),
        number,
        "${number}회차 · 예정",
        "예정 책 $number",
        visibility,
    )
}
```

- [ ] **Step 11: Run current session test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.session.api.CurrentSessionControllerDbTest
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt
git commit -m "feat: manage upcoming session state"
```

---

### Task 4: Enforce Archive and Notes Visibility Filters

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`

- [ ] **Step 1: Write archive regression test**

In `ArchiveControllerDbTest`, add:

```kotlin
@Test
fun `archive excludes draft and host only sessions`() {
    insertArchiveVisibilitySession(number = 88, state = "DRAFT", visibility = "MEMBER")
    insertArchiveVisibilitySession(number = 89, state = "CLOSED", visibility = "HOST_ONLY")

    mockMvc.get("/api/archive/sessions") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[*].sessionNumber") { value(not(hasItem(88))) }
        jsonPath("$[*].sessionNumber") { value(not(hasItem(89))) }
    }
}
```

Add helper:

```kotlin
private fun insertArchiveVisibilitySession(number: Int, state: String, visibility: String) {
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, book_translator,
          book_link, book_image_url, session_date, start_time, end_time,
          location_label, meeting_url, meeting_passcode, question_deadline_at,
          state, visibility
        )
        values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, '테스트 저자',
          null, null, null, '2026-08-15', '20:00:00', '22:00:00',
          '온라인', null, null, '2026-08-14 14:59:00.000000', ?, ?)
        """.trimIndent(),
        UUID.randomUUID().toString(),
        number,
        "${number}회차 · 필터 테스트",
        "필터 책 $number",
        state,
        visibility,
    )
}
```

- [ ] **Step 2: Write notes regression test**

In `ArchiveAndNotesDbTest`, add a test that inserts a `PUBLISHED + HOST_ONLY` session with a public one-liner and asserts it is not returned:

```kotlin
@Test
fun `notes sessions exclude host only published records`() {
    insertHostOnlyPublishedSessionWithOneLine(number = 90)

    mockMvc.get("/api/notes/sessions") {
        with(user("member1@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[*].sessionNumber") { value(not(hasItem(90))) }
    }
}
```

Add this helper in the same test class:

```kotlin
private fun insertHostOnlyPublishedSessionWithOneLine(number: Int) {
    val sessionId = "00000000-0000-0000-0000-000000009090"
    val reviewId = "00000000-0000-0000-0000-000000009091"
    jdbcTemplate.update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, book_translator,
          book_link, book_image_url, session_date, start_time, end_time,
          location_label, meeting_url, meeting_passcode, question_deadline_at,
          state, visibility
        )
        values (?, '00000000-0000-0000-0000-000000000001', ?, ?, ?, '테스트 저자',
          null, null, null, '2026-09-16', '20:00:00', '22:00:00',
          '온라인', null, null, '2026-09-15 14:59:00.000000', 'PUBLISHED', 'HOST_ONLY')
        """.trimIndent(),
        sessionId,
        number,
        "${number}회차 · 호스트 전용",
        "호스트 전용 책 $number",
    )
    jdbcTemplate.update(
        """
        insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
        values (?, '00000000-0000-0000-0000-000000000001', ?, '00000000-0000-0000-0000-000000000202',
          '호스트 전용 기록은 클럽 노트에 나오면 안 됩니다.', 'PUBLIC')
        """.trimIndent(),
        reviewId,
        sessionId,
    )
}
```

Add this cleanup to the test class cleanup SQL list:

```sql
delete from one_line_reviews where id = '00000000-0000-0000-0000-000000009091';
delete from sessions where id = '00000000-0000-0000-0000-000000009090';
```

- [ ] **Step 3: Run archive/notes tests to verify failures**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest
```

Expected: FAIL until filters include `sessions.visibility`.

- [ ] **Step 4: Add archive filters**

In `JdbcArchiveQueryAdapter`, add this condition to archive list and detail session queries:

```sql
and sessions.state in ('CLOSED', 'PUBLISHED')
and sessions.visibility in ('MEMBER', 'PUBLIC')
```

Keep public detail queries stricter through publication visibility where already used.

- [ ] **Step 5: Add notes filters**

In `JdbcNotesFeedAdapter`, add:

```sql
and sessions.state = 'PUBLISHED'
and sessions.visibility in ('MEMBER', 'PUBLIC')
```

to member-facing notes session/feed queries. Do not loosen public API one-line visibility rules.

- [ ] **Step 6: Run archive/notes tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt \
  server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt
git commit -m "fix: hide draft and host only records"
```

---

### Task 5: Add Frontend API Contracts and Loaders

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-dashboard-data.ts`
- Modify: `front/features/member-home/api/member-home-contracts.ts`
- Modify: `front/features/member-home/api/member-home-api.ts`
- Modify: `front/features/member-home/route/member-home-data.ts`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`

- [ ] **Step 1: Write failing loader tests**

In `host-dashboard.test.tsx`, add a loader test:

```tsx
it("loads host session list for the dashboard", async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/bff/api/auth/me") return Promise.resolve(authResponse(hostAuth));
    if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
    if (url === "/api/bff/api/host/dashboard") return Promise.resolve(jsonResponse(dashboard));
    if (url === "/api/bff/api/host/sessions") return Promise.resolve(jsonResponse([]));
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  const data = await hostDashboardLoader();

  expect(data.hostSessions).toEqual([]);
  expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/sessions", expect.objectContaining({}));
});
```

Add helper:

```tsx
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

In `member-home.test.tsx`, import `memberHomeLoader` from `@/features/member-home/route/member-home-data` and add this loader-level test:

```tsx
it("loads upcoming sessions for member home", async () => {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/bff/api/auth/me") return Promise.resolve(jsonResponse(auth));
    if (url === "/api/bff/api/sessions/current") return Promise.resolve(jsonResponse(current));
    if (url === "/api/bff/api/notes/feed") return Promise.resolve(jsonResponse(noteFeedItems));
    if (url === "/api/bff/api/sessions/upcoming") return Promise.resolve(jsonResponse([]));
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  const data = await memberHomeLoader();

  expect(data.upcomingSessions).toEqual([]);
});
```

- [ ] **Step 2: Run frontend tests to verify failures**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx member-home.test.tsx
```

Expected: FAIL because loader data does not include upcoming/host session lists.

- [ ] **Step 3: Add host contracts and API calls**

In `host-contracts.ts`, add:

```ts
export type HostSessionListItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  state: SessionState;
  visibility: SessionRecordVisibility;
};

export type HostSessionVisibilityRequest = {
  visibility: SessionRecordVisibility;
};
```

Add `visibility: SessionRecordVisibility;` to `HostSessionDetailResponse` and created-session response types.

In `host-api.ts`, add:

```ts
export function fetchHostSessions() {
  return readmatesFetch<HostSessionListItem[]>("/api/host/sessions");
}

export function saveHostSessionVisibility(sessionId: string, request: HostSessionVisibilityRequest) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function openHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/open`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}
```

- [ ] **Step 4: Add member upcoming contracts and API**

In `member-home-contracts.ts`, add:

```ts
export type MemberHomeUpcomingSession = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  visibility: "MEMBER" | "PUBLIC";
};
```

In `member-home-api.ts`, add:

```ts
export function fetchMemberHomeUpcomingSessions() {
  return readmatesFetch<MemberHomeUpcomingSession[]>("/api/sessions/upcoming");
}
```

- [ ] **Step 5: Extend route loaders**

In `host-dashboard-data.ts`, fetch `hostSessions`:

```ts
const [current, data, hostSessions] = await Promise.all([
  fetchHostCurrentSession(),
  fetchHostDashboard(),
  fetchHostSessions(),
]);

return { current, data, hostSessions };
```

Extend `HostDashboardRouteData`:

```ts
hostSessions: HostSessionListItem[];
```

Add dashboard actions:

```ts
updateSessionVisibility: async (sessionId, visibility) => {
  const response = await saveHostSessionVisibility(sessionId, { visibility });
  if (!response.ok) throw new Error("Host session visibility update failed");
},
openSession: async (sessionId) => {
  const response = await openHostSession(sessionId);
  if (!response.ok) throw new Error("Host session open failed");
},
```

In `member-home-data.ts`, fetch `upcomingSessions`:

```ts
const [current, noteFeedItems, upcomingSessions] = await Promise.all([
  fetchMemberHomeCurrentSession(),
  fetchMemberHomeNoteFeed(),
  fetchMemberHomeUpcomingSessions(),
]);

return { current, noteFeedItems, upcomingSessions };
```

For disallowed access, return:

```ts
upcomingSessions: [],
```

- [ ] **Step 6: Pass new props from route pages**

In `front/src/pages/app-home.tsx`, pass:

```tsx
upcomingSessions={data.upcomingSessions}
```

In `HostDashboardRoute`, pass:

```tsx
hostSessions={loaderData.hostSessions}
```

- [ ] **Step 7: Run frontend tests**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx member-home.test.tsx
```

Expected: PASS for the loader-level tests after the new route data fields are returned.

- [ ] **Step 8: Commit**

```bash
git add front/features/host/api/host-contracts.ts \
  front/features/host/api/host-api.ts \
  front/features/host/route/host-dashboard-data.ts \
  front/features/member-home/api/member-home-contracts.ts \
  front/features/member-home/api/member-home-api.ts \
  front/features/member-home/route/member-home-data.ts \
  front/src/pages/app-home.tsx \
  front/tests/unit/host-dashboard.test.tsx \
  front/tests/unit/member-home.test.tsx
git commit -m "feat: load upcoming session data"
```

---

### Task 6: Build Host Dashboard Upcoming Management UI

**Files:**
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/features/host/model/host-session-editor-model.ts`
- Modify: `front/shared/ui/session-identity.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Write failing host dashboard UI test**

In `host-dashboard.test.tsx`, add:

```tsx
const hostSessions = [
  {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "7회차 · 테스트 책",
    bookTitle: "테스트 책",
    bookAuthor: "테스트 저자",
    bookImageUrl: null,
    date: "2026-05-20",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "OPEN",
    visibility: "MEMBER",
  },
  {
    sessionId: "session-8",
    sessionNumber: 8,
    title: "8회차 · 다음 책",
    bookTitle: "다음 책",
    bookAuthor: "다음 저자",
    bookImageUrl: null,
    date: "2026-06-17",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "강남",
    state: "DRAFT",
    visibility: "HOST_ONLY",
  },
] satisfies HostSessionListItem[];

it("renders upcoming session management on desktop and mobile", () => {
  const { container } = render(
    <HostDashboardForTest auth={hostAuth} current={current} data={dashboard} hostSessions={hostSessions} />,
  );

  const desktop = getDesktopView(container);
  const mobile = getMobileView(container);

  expect(desktop.getByText("예정 세션")).toBeInTheDocument();
  expect(desktop.getByText("다음 책")).toBeInTheDocument();
  expect(desktop.getByRole("button", { name: "멤버 공개" })).toBeInTheDocument();
  expect(desktop.getByRole("button", { name: "현재로 시작" })).toBeInTheDocument();
  expect(mobile.getByText("예정 세션")).toBeInTheDocument();
  expect(mobile.getByText("다음 책")).toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing action test**

Add:

```tsx
it("calls visibility and open actions from upcoming session rows", async () => {
  const user = userEvent.setup();
  const actions = {
    ...noopHostDashboardActions,
    updateSessionVisibility: vi.fn(async () => undefined),
    openSession: vi.fn(async () => undefined),
  } satisfies HostDashboardActions;

  render(<HostDashboardForTest auth={hostAuth} current={current} data={dashboard} hostSessions={hostSessions} actions={actions} />);

  await user.click(screen.getByRole("button", { name: "멤버 공개" }));
  expect(actions.updateSessionVisibility).toHaveBeenCalledWith("session-8", "MEMBER");

  await user.click(screen.getByRole("button", { name: "현재로 시작" }));
  expect(actions.openSession).toHaveBeenCalledWith("session-8");
});
```

- [ ] **Step 3: Run host dashboard test to verify failure**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx
```

Expected: FAIL because `hostSessions` UI is missing.

- [ ] **Step 4: Extend HostDashboard props and actions**

In `host-dashboard.tsx`, update action type:

```ts
export type HostDashboardActions = {
  updateCurrentSessionParticipation: (
    membershipId: string,
    action: HostDashboardMissingMemberAction,
  ) => Promise<void>;
  updateSessionVisibility: (sessionId: string, visibility: SessionRecordVisibility) => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
};
```

Update component props:

```ts
hostSessions?: HostSessionListItem[];
```

Use a local fallback:

```ts
const sessions = hostSessions ?? [];
const upcomingSessions = sessions.filter((item) => item.state === "DRAFT").slice(0, 6);
```

- [ ] **Step 5: Add desktop upcoming section**

Below the current session document panel, add:

```tsx
<section style={{ marginTop: "28px" }}>
  <SectionHeader eyebrow="예정 세션" title="앞으로 읽을 세션" action={<Link to={newSessionHref} className="btn btn-ghost btn-sm">예정 세션 만들기</Link>} />
  {upcomingSessions.length > 0 ? (
    <div className="surface" style={{ padding: 4 }}>
      {upcomingSessions.map((item) => (
        <UpcomingSessionRow key={item.sessionId} session={item} actions={actions} />
      ))}
    </div>
  ) : (
    <div className="surface-quiet" style={{ padding: 20 }}>
      <div className="body" style={{ fontSize: 14 }}>아직 등록된 예정 세션이 없습니다.</div>
    </div>
  )}
</section>
```

Add `UpcomingSessionRow` in the same file:

```tsx
function UpcomingSessionRow({ session, actions }: { session: HostSessionListItem; actions: HostDashboardActions }) {
  const isMemberVisible = session.visibility !== "HOST_ONLY";
  return (
    <div className="row-between" style={{ gap: 12, padding: "14px 16px", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ minWidth: 0 }}>
        <SessionIdentity sessionNumber={session.sessionNumber} state={session.state} date={session.date} published={session.visibility === "PUBLIC"} compact />
        <div className="body editorial" style={{ marginTop: 6, fontSize: 16 }}>{session.bookTitle}</div>
        <div className="tiny" style={{ marginTop: 4 }}>{session.bookAuthor} · {formatDateOnlyLabel(session.date)} · {session.locationLabel}</div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-quiet btn-sm" type="button" onClick={() => actions.updateSessionVisibility(session.sessionId, isMemberVisible ? "HOST_ONLY" : "MEMBER")}>
          {isMemberVisible ? "비공개" : "멤버 공개"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => actions.openSession(session.sessionId)}>
          현재로 시작
        </button>
        <Link className="btn btn-ghost btn-sm" to={hostSessionEditHref(session.sessionId)}>
          편집
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add mobile upcoming rail**

In the mobile dashboard section, place after "오늘 할 일":

```tsx
<section className="m-sec">
  <div className="m-eyebrow-row">
    <span className="eyebrow">예정 세션</span>
    <Link to={newSessionHref} className="tiny">만들기</Link>
  </div>
  {upcomingSessions.length > 0 ? (
    <div className="rm-host-dashboard-mobile__session-rail">
      {upcomingSessions.map((item) => (
        <UpcomingSessionMobileCard key={item.sessionId} session={item} actions={actions} />
      ))}
    </div>
  ) : (
    <div className="m-card-quiet">아직 등록된 예정 세션이 없습니다.</div>
  )}
</section>
```

Add compact card:

```tsx
function UpcomingSessionMobileCard({ session, actions }: { session: HostSessionListItem; actions: HostDashboardActions }) {
  return (
    <div className="m-card-quiet">
      <div className="tiny mono">No.{String(session.sessionNumber).padStart(2, "0")}</div>
      <div className="body editorial" style={{ marginTop: 6 }}>{session.bookTitle}</div>
      <div className="tiny" style={{ marginTop: 4 }}>{formatDateOnlyLabel(session.date)}</div>
      <button className="btn btn-primary btn-sm" type="button" style={{ marginTop: 10, width: "100%" }} onClick={() => actions.openSession(session.sessionId)}>
        현재로 시작
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Update create redirect and labels**

In `host-session-editor.tsx`, after successful create, redirect to edit page:

```ts
if (response.ok) {
  setSaveState("saved");
  if (isNewSession) {
    const created = (await response.json()) as { sessionId: string };
    globalThis.location.href = `/app/host/sessions/${encodeURIComponent(created.sessionId)}/edit`;
    return;
  }
  globalThis.location.href = returnTarget.href;
  return;
}
```

In `host-session-editor-model.ts` and `session-identity.tsx`, change user-facing `DRAFT` copy from "초안/비공개" to "예정/예정 세션" where the state label is shown. Visibility labels still communicate `HOST_ONLY`.

- [ ] **Step 8: Run frontend tests**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx host-session-editor.test.tsx
```

Expected: PASS after updating affected expectations from `/app/session/current` to the edit URL for create.

- [ ] **Step 9: Commit**

```bash
git add front/features/host/components/host-dashboard.tsx \
  front/features/host/components/host-session-editor.tsx \
  front/features/host/model/host-session-editor-model.ts \
  front/shared/ui/session-identity.tsx \
  front/tests/unit/host-dashboard.test.tsx \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: manage upcoming sessions on host dashboard"
```

---

### Task 7: Show Upcoming Sessions on Member Home

**Files:**
- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/member-home/api/member-home-contracts.ts`
- Modify: `front/tests/unit/member-home.test.tsx`

- [ ] **Step 1: Write failing member home UI tests**

In `member-home.test.tsx`, add:

```tsx
const upcomingSessions = [
  {
    sessionId: "session-8",
    sessionNumber: 8,
    title: "8회차 · 다음 달 책",
    bookTitle: "다음 달 책",
    bookAuthor: "다음 저자",
    bookImageUrl: null,
    date: "2026-06-17",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    visibility: "MEMBER",
  },
] satisfies MemberHomeUpcomingSession[];

it("shows member-visible upcoming sessions on desktop and mobile home", () => {
  const { container } = render(
    <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={upcomingSessions} />,
  );

  const desktop = getDesktopView(container);
  const mobile = within(container.querySelector(".rm-member-home-mobile") as HTMLElement);

  expect(desktop.getByText("다음 달 선정")).toBeInTheDocument();
  expect(desktop.getByText("다음 달 책")).toBeInTheDocument();
  expect(desktop.getByText(/다음 저자/)).toBeInTheDocument();
  expect(mobile.getByText("예정 세션")).toBeInTheDocument();
  expect(mobile.getByText("다음 달 책")).toBeInTheDocument();
  expect(mobile.queryByRole("link", { name: /RSVP.*다음 달 책/ })).not.toBeInTheDocument();
});

it("keeps upcoming empty state when there are no upcoming sessions", () => {
  const { container } = render(
    <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
  );

  const desktop = getDesktopView(container);
  expect(desktop.getByText("아직 등록된 다음 달 후보가 없습니다.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run member home tests to verify failure**

Run:

```bash
pnpm --dir front test -- member-home.test.tsx
```

Expected: FAIL because `upcomingSessions` prop and UI are missing.

- [ ] **Step 3: Extend MemberHome props**

In `member-home.tsx`, import `MemberHomeUpcomingSession` and update props:

```ts
upcomingSessions,
}: {
  auth: AuthMeResponse;
  current: CurrentSessionResponse;
  noteFeedItems: NoteFeedItem[];
  upcomingSessions: MemberHomeUpcomingSession[];
}) {
```

Pass to mobile:

```tsx
<MobileMemberHome
  auth={auth}
  current={current}
  noteFeedItems={noteFeedItems}
  upcomingSessions={upcomingSessions}
  memberName={memberName}
  isViewer={isViewer}
/>
```

- [ ] **Step 4: Replace `NextBookHint` with data-backed component**

Change call:

```tsx
<NextBookHint upcomingSessions={upcomingSessions} />
```

Implement:

```tsx
function NextBookHint({ upcomingSessions }: { upcomingSessions: MemberHomeUpcomingSession[] }) {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        다음 달 선정
      </div>
      <div className="surface-quiet" style={{ padding: "20px" }}>
        {upcomingSessions.length > 0 ? (
          <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
            {upcomingSessions.slice(0, 3).map((session) => (
              <div key={session.sessionId}>
                <div className="tiny mono">No.{String(session.sessionNumber).padStart(2, "0")}</div>
                <div className="body editorial" style={{ fontSize: "15px", marginTop: 4 }}>
                  {session.bookTitle}
                </div>
                <div className="tiny" style={{ marginTop: 3 }}>
                  {session.bookAuthor} · {session.date} · {session.locationLabel}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="body" style={{ fontSize: "14px" }}>
            아직 등록된 다음 달 후보가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add mobile upcoming section under today actions**

After `<MobileTodayActions session={session} isViewer={isViewer} />`, add:

```tsx
<MobileUpcomingSessions upcomingSessions={upcomingSessions} />
```

Implement:

```tsx
function MobileUpcomingSessions({ upcomingSessions }: { upcomingSessions: MemberHomeUpcomingSession[] }) {
  if (upcomingSessions.length === 0) {
    return null;
  }

  return (
    <section className="m-sec">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        예정 세션
      </div>
      <div className="rm-mobile-shortcuts">
        {upcomingSessions.slice(0, 4).map((session) => (
          <div key={session.sessionId} className="m-card-quiet">
            <span className="tiny mono">No.{String(session.sessionNumber).padStart(2, "0")}</span>
            <span className="body editorial" style={{ display: "block", fontSize: 13.5, marginTop: 6 }}>
              {session.bookTitle}
            </span>
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              {session.date} · {session.locationLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Update existing test renders**

Every `render(<MemberHome ... />)` in `member-home.test.tsx` must pass:

```tsx
upcomingSessions={[]}
```

unless the test specifically uses `upcomingSessions`.

- [ ] **Step 7: Run member home tests**

Run:

```bash
pnpm --dir front test -- member-home.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add front/features/member-home/components/member-home.tsx \
  front/features/member-home/api/member-home-contracts.ts \
  front/tests/unit/member-home.test.tsx
git commit -m "feat: show upcoming sessions on member home"
```

---

### Task 8: Add E2E Smoke and Final Verification

**Files:**
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`

- [ ] **Step 1: Write failing E2E smoke**

In `dev-login-session-flow.spec.ts`, add:

```ts
test("host creates member-visible upcoming session then starts it", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /호스트/ }).click();
  await page.goto("/app/host");

  await page.getByRole("link", { name: /예정 세션 만들기|새 세션 만들기/ }).click();
  await page.getByLabel("세션 제목").fill("7회차 · E2E 예정 책");
  await page.getByLabel("책 제목").fill("E2E 예정 책");
  await page.getByLabel("저자").fill("E2E 저자");
  await page.getByLabel("날짜").fill("2026-05-20");
  await page.getByRole("button", { name: /예정 세션 만들기|새 세션 만들기/ }).click();

  await expect(page).toHaveURL(/\/app\/host\/sessions\/.+\/edit/);
  await page.goto("/app/host");
  await page.getByRole("button", { name: "멤버 공개" }).click();

  await page.goto("/login");
  await page.getByRole("button", { name: /멤버1/ }).click();
  await page.goto("/app");
  await expect(page.getByText("E2E 예정 책")).toBeVisible();

  await page.goto("/login");
  await page.getByRole("button", { name: /호스트/ }).click();
  await page.goto("/app/host");
  await page.getByRole("button", { name: "현재로 시작" }).click();

  await page.goto("/app/session/current");
  await expect(page.getByText("E2E 예정 책")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E smoke after implementation**

Run:

```bash
pnpm --dir front test:e2e -- dev-login-session-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 4: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 5: Run E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

- [ ] **Step 6: Run public release safety checks**

Because this changes public/member visibility rules, run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: PASS.

- [ ] **Step 7: Commit final verification updates**

```bash
git add front/tests/e2e/dev-login-session-flow.spec.ts
git commit -m "test: cover upcoming session flow"
```

---

## Self-Review

Spec coverage:

- Multiple future sessions: Task 3 changes create to `DRAFT` and removes participant creation; `DRAFT` can be multiple.
- `OPEN` one per club: Task 3 adds open transition with conflict check.
- Host management list: Tasks 3, 5, and 6 add API, loader, and UI.
- Member home upcoming: Tasks 3, 5, and 7 add API, loader, and UI.
- Archive/notes hide `DRAFT` and `HOST_ONLY`: Task 4.
- `sessions.visibility` source of truth: Tasks 1, 3, and 4.
- Existing validation retained, no title-only save: Task 3 keeps `HostSessionRequest` required fields.
- Tests and final checks: Task 8.

Placeholder scan:

- No unresolved markers or vague edge-case-only steps remain.
- The E2E smoke uses explicit labels from Tasks 6 and 7.

Type consistency:

- Server visibility type is `SessionRecordVisibility`.
- Frontend visibility type is `SessionRecordVisibility`.
- Host list type is `HostSessionListItem`.
- Member upcoming type is `MemberHomeUpcomingSession`.
