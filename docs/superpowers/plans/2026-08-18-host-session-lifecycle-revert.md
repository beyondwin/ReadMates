# Host Session Lifecycle Revert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host reverse one session lifecycle step at a time (`PUBLISHED→CLOSED`, `CLOSED→OPEN`, `OPEN→DRAFT`) with confirmation, without deleting records or notifications.

**Architecture:** Add three explicit host POST commands next to existing `open`/`close`/`publish`. Persistence uses club lock + CAS `UPDATE ... WHERE state = expected`. The editor overview owns forward and reverse confirmations. No new feature package, migration, or BFF policy.

**Tech Stack:** Kotlin/Spring Boot JDBC, React/Vite host editor, TanStack Query, Vitest, MockMvc Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-18-host-session-lifecycle-revert-design.md`

## Global Constraints

- One-step transitions only. No `PUBLISHED→OPEN`.
- Do not delete records, participants, questions, RSVP, attendance, publication rows, or notifications.
- `reopen` must not call `createActiveParticipants` (that SQL resets RSVP).
- `reopen` hides `PUBLIC_RECORD` → `HIDDEN` and dual-writes `is_public=false` / compatibility `MEMBER`.
- Other `OPEN` in the club blocks `/open` and `/reopen` with `SESSION_OPEN_ALREADY_EXISTS` and `openSessionId`.
- Host-only. Browser uses same-origin `/api/bff/**`. No new Flyway migration.
- Korean copy from the spec. No browser `confirm()`.
- Do not put real member data, secrets, private domains, or local absolute paths in tests or docs.
- Frontend package manager is repo `packageManager` via Corepack: `corepack pnpm --dir front ...`.

## Handoff

| Requirement | Tasks |
| --- | --- |
| `/reopen`, `/unpublish`, `/return-to-draft` | 1–5 |
| Distinct 409 codes + `openSessionId` | 2, 5 |
| Preserve rows; hide public placement on reopen | 4 |
| Editor buttons + confirm for close/publish/revert | 6–9 |
| `architecture.md` + CHANGELOG | 10 |
| Out-of-scope backlog (draft delete, member empty, etc.) | none |

**Dependencies:** 1 → 2 → 3 → 4 → 5 (server). 6 → 7 → 8 → 9 (front, after 5 for contracts). 10 last.

**Surfaces:** server `session` write-side, front `features/host`, docs. No BFF policy, no migration, no deploy.

**Focused checks:** `unitTest` for policy/service/error/front model; `integrationTest --tests HostSessionControllerDbTest,HostSessionBffSecurityTest`; `corepack pnpm --dir front exec vitest run` on listed files; then `./scripts/server-ci-check.sh` and `corepack pnpm --dir front lint && test && build`.

**Acceptance matrix:** Session lifecycle, Guest/public exposure, Actor/authorization, UI/runtime state. Exclude BFF/OAuth, Persistence/migration, Cursor collection.

**Non-goals:** jump transitions, notification unsend, closing-board mutation, DRAFT delete, current-session swap, lifecycle audit ledger, member empty-state rewrite.

**Skipped validation:** no new Playwright spec unless an existing host lifecycle e2e can take two cheap assertions. New e2e file is out of scope.

**Parallelism:** do not split Tasks 1–5 across agents that edit the same lifecycle files. Front Tasks 6–8 can start after Task 5 contracts exist.

---

## File structure

| File | Responsibility |
| --- | --- |
| `SessionApplicationSupport.kt` | New not-allowed exceptions; `OpenSessionAlreadyExistsException(openSessionId)` |
| `HostSessionWritePolicy.kt` | `reopenDecision` / `unpublishDecision` / `returnToDraftDecision` |
| `HostSessionWriteQueries.kt` | `findOpenSessionId(clubId)` |
| `HostSessionLifecycleWriteOperations.kt` | CAS writes + hide public placement |
| `HostSessionLifecyclePort.kt` / `HostSessionUseCases.kt` / `HostSessionLifecycleService.kt` | Three commands + cache/log |
| `HostSessionController.kt` | Three POST mappings |
| `SessionApplicationErrorHandler.kt` | Distinct 409 bodies |
| `ApiErrorResponse.kt` | Optional `openSessionId` |
| `SecurityConfig.kt` | Allowlist three POSTs |
| `front/features/host/api/host-api.ts` | Three POST helpers |
| `front/features/host/queries/host-session-queries.ts` | Three mutations, same invalidation as close |
| `front/features/host/model/host-session-lifecycle-model.ts` | Button + dialog copy (no React) |
| `front/features/host/ui/session-editor/session-lifecycle-confirm-dialog.tsx` | Confirm modal |
| `front/features/host/ui/session-editor/session-overview-section.tsx` | Buttons + layout |
| `front/features/host/ui/host-session-editor.tsx` | Confirm-then-mutate |
| `docs/development/architecture.md` | Reverse transitions |
| `CHANGELOG.md` | Unreleased highlight |

Do not add a new server feature package.

---

### Task 1: Write-policy reverse decisions

**Files:**
- Create: `server/src/test/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWritePolicyTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWritePolicy.kt`

**Interfaces:**
- Consumes: existing `HostSessionTransitionDecision.{CHANGED, UNCHANGED}`
- Produces:
  - `class HostSessionReopenNotAllowedException : RuntimeException`
  - `class HostSessionUnpublishNotAllowedException : RuntimeException`
  - `class HostSessionReturnToDraftNotAllowedException : RuntimeException`
  - `fun reopenDecision(state: String): HostSessionTransitionDecision`
  - `fun unpublishDecision(state: String): HostSessionTransitionDecision`
  - `fun returnToDraftDecision(state: String): HostSessionTransitionDecision`

- [ ] **Step 1: Write the failing policy test**

```kotlin
package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionReopenNotAllowedException
import com.readmates.session.application.HostSessionReturnToDraftNotAllowedException
import com.readmates.session.application.HostSessionUnpublishNotAllowedException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class HostSessionWritePolicyTest {
    @Test
    fun `reopen is unchanged when already OPEN and rejected otherwise except via CAS`() {
        assertThat(HostSessionWritePolicy.reopenDecision("OPEN"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionReopenNotAllowedException> {
            HostSessionWritePolicy.reopenDecision("PUBLISHED")
        }
        assertThrows<HostSessionReopenNotAllowedException> {
            HostSessionWritePolicy.reopenDecision("DRAFT")
        }
        assertThrows<HostSessionReopenNotAllowedException> {
            HostSessionWritePolicy.reopenDecision("CLOSED")
        }
    }

    @Test
    fun `unpublish is unchanged when already CLOSED`() {
        assertThat(HostSessionWritePolicy.unpublishDecision("CLOSED"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionUnpublishNotAllowedException> {
            HostSessionWritePolicy.unpublishDecision("OPEN")
        }
        assertThrows<HostSessionUnpublishNotAllowedException> {
            HostSessionWritePolicy.unpublishDecision("DRAFT")
        }
        assertThrows<HostSessionUnpublishNotAllowedException> {
            HostSessionWritePolicy.unpublishDecision("PUBLISHED")
        }
    }

    @Test
    fun `return to draft is unchanged when already DRAFT`() {
        assertThat(HostSessionWritePolicy.returnToDraftDecision("DRAFT"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            HostSessionWritePolicy.returnToDraftDecision("CLOSED")
        }
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            HostSessionWritePolicy.returnToDraftDecision("PUBLISHED")
        }
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            HostSessionWritePolicy.returnToDraftDecision("OPEN")
        }
    }
}
```

`CLOSED`/`PUBLISHED`/`OPEN` expected-source states are rejected here on purpose. CAS performs the real transition; policy only handles the 0-row fallback, matching `closeDecision` / `publishDecision`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.adapter.out.persistence.HostSessionWritePolicyTest`

Expected: FAIL — methods and exception classes do not exist.

- [ ] **Step 3: Add exceptions and policy methods**

In `SessionApplicationSupport.kt` after `HostSessionPublishNotAllowedException`:

```kotlin
class HostSessionReopenNotAllowedException : RuntimeException("Only closed sessions can be reopened")

class HostSessionUnpublishNotAllowedException : RuntimeException("Only published sessions can be unpublished")

class HostSessionReturnToDraftNotAllowedException : RuntimeException("Only open sessions can return to draft")
```

In `HostSessionWritePolicy.kt`:

```kotlin
fun reopenDecision(state: String): HostSessionTransitionDecision =
    if (state == "OPEN") {
        HostSessionTransitionDecision.UNCHANGED
    } else {
        throw HostSessionReopenNotAllowedException()
    }

fun unpublishDecision(state: String): HostSessionTransitionDecision =
    if (state == "CLOSED") {
        HostSessionTransitionDecision.UNCHANGED
    } else {
        throw HostSessionUnpublishNotAllowedException()
    }

fun returnToDraftDecision(state: String): HostSessionTransitionDecision =
    if (state == "DRAFT") {
        HostSessionTransitionDecision.UNCHANGED
    } else {
        throw HostSessionReturnToDraftNotAllowedException()
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.adapter.out.persistence.HostSessionWritePolicyTest`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/test/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWritePolicyTest.kt \
  server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWritePolicy.kt
git commit -m "feat(server): add reverse session lifecycle policy decisions"
```

---

### Task 2: Distinct conflict errors and openSessionId

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/SessionApplicationErrorHandlerTest.kt` (package `com.readmates.session.adapter.in.web`)

**Interfaces:**
- Consumes: Task 1 exception types
- Produces:
  - `class OpenSessionAlreadyExistsException(val openSessionId: UUID? = null)`
  - `data class ApiErrorResponse(..., val openSessionId: String? = null)`
  - `fun apiErrorResponse(..., openSessionId: String? = null)`
  - Handler methods:
    - `handleOpenSessionExists(ex: OpenSessionAlreadyExistsException)`
    - `handleReopenNotAllowed()`
    - `handleUnpublishNotAllowed()`
    - `handleReturnToDraftNotAllowed()`
  - Codes/messages exactly as spec §6.3

- [ ] **Step 1: Write failing handler tests**

Replace `maps open conflict to JSON 409` and add:

```kotlin
@Test
fun `maps open already exists to SESSION_OPEN_ALREADY_EXISTS with session id`() {
    val openId = java.util.UUID.fromString("00000000-0000-0000-0000-000000000307")
    val response =
        SessionApplicationErrorHandler().handleOpenSessionExists(
            OpenSessionAlreadyExistsException(openId),
        )
    assertThat(response.statusCode).isEqualTo(HttpStatus.CONFLICT)
    assertThat(response.body).isEqualTo(
        ApiErrorResponse(
            code = "SESSION_OPEN_ALREADY_EXISTS",
            message = "이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요.",
            status = 409,
            openSessionId = openId.toString(),
        ),
    )
}

@Test
fun `maps reopen not allowed to SESSION_REOPEN_NOT_ALLOWED`() {
    val response = SessionApplicationErrorHandler().handleReopenNotAllowed()
    assertThat(response.body?.code).isEqualTo("SESSION_REOPEN_NOT_ALLOWED")
    assertThat(response.body?.message).isEqualTo("마감된 세션만 다시 열 수 있습니다.")
}

@Test
fun `maps unpublish not allowed to SESSION_UNPUBLISH_NOT_ALLOWED`() {
    val response = SessionApplicationErrorHandler().handleUnpublishNotAllowed()
    assertThat(response.body?.code).isEqualTo("SESSION_UNPUBLISH_NOT_ALLOWED")
    assertThat(response.body?.message).isEqualTo("공개된 세션만 공개를 취소할 수 있습니다.")
}

@Test
fun `maps return to draft not allowed to SESSION_RETURN_TO_DRAFT_NOT_ALLOWED`() {
    val response = SessionApplicationErrorHandler().handleReturnToDraftNotAllowed()
    assertThat(response.body?.code).isEqualTo("SESSION_RETURN_TO_DRAFT_NOT_ALLOWED")
    assertThat(response.body?.message).isEqualTo("진행 중인 세션만 예정으로 되돌릴 수 있습니다.")
}
```

Keep the existing generic `handleConflict` test for remaining close/publish/delete conflicts.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.adapter.in.web.SessionApplicationErrorHandlerTest`

Expected: FAIL — methods missing; `OpenSessionAlreadyExistsException` has no id.

- [ ] **Step 3: Implement error mapping**

Change exception:

```kotlin
class OpenSessionAlreadyExistsException(
    val openSessionId: java.util.UUID? = null,
) : RuntimeException("Open session already exists")
```

Add `openSessionId: String? = null` to `ApiErrorResponse` and to `apiErrorResponse(...)`.

In `SessionApplicationErrorHandler`, remove `OpenSessionAlreadyExistsException` from `handleConflict` and add dedicated handlers. Jackson may emit `openSessionId: null` on other errors; that is acceptable. Do not add `@JsonInclude` unless an existing exact-JSON test fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.adapter.in.web.SessionApplicationErrorHandlerTest`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt \
  server/src/main/kotlin/com/readmates/shared/adapter/in/web/ApiErrorResponse.kt \
  server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt \
  server/src/test/kotlin/com/readmates/session/api/SessionApplicationErrorHandlerTest.kt
git commit -m "feat(server): distinguish session lifecycle conflict errors"
```

---

### Task 3: Lifecycle port and application service

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionLifecyclePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt` (delegate only; real SQL in Task 4)

**Interfaces:**
- Consumes: `HostSessionIdCommand`, `HostSessionTransitionResult`
- Produces:
  - `HostSessionLifecycleUseCase.reopen/unpublish/returnToDraft(command): HostSessionDetailResponse`
  - `HostSessionLifecyclePort.reopen/unpublish/returnToDraft(command): HostSessionTransitionResult`
  - Service logs `oldState`/`newState` as `CLOSED`/`OPEN`, `PUBLISHED`/`CLOSED`, `OPEN`/`DRAFT`
  - Cache evict only when `result.changed`

- [ ] **Step 1: Write failing service tests**

In `HostSessionServicesTest`, extend `RecordingHostSessionPorts` with `reopenChanged`, `unpublishChanged`, `returnToDraftChanged` and override the three new port methods the same way as `close`. Add tests:

```kotlin
@Test
fun `changed reverse transitions evict cache and log states`() {
    val port = RecordingHostSessionPorts()
    val invalidation = RecordingReadCacheInvalidationPort()
    val service = HostSessionLifecycleService(port, port, port, invalidation)
    val command = HostSessionIdCommand(host, sessionId)
    captureHostSessionLogs().use { logs ->
        assertThat(service.reopen(command).state).isEqualTo("OPEN")
        assertThat(service.unpublish(command).state).isEqualTo("CLOSED")
        assertThat(service.returnToDraft(command).state).isEqualTo("DRAFT")
        assertThat(invalidation.clubs).containsExactly(host.clubId, host.clubId, host.clubId)
        assertThat(logs.events.map { it.argumentArray.toList() }).containsExactly(
            listOf(host.clubId, sessionId, "CLOSED", "OPEN"),
            listOf(host.clubId, sessionId, "PUBLISHED", "CLOSED"),
            listOf(host.clubId, sessionId, "OPEN", "DRAFT"),
        )
    }
}

@Test
fun `noop reverse transitions do not evict cache`() {
    val port = RecordingHostSessionPorts().apply {
        reopenChanged = false
        unpublishChanged = false
        returnToDraftChanged = false
    }
    val invalidation = RecordingReadCacheInvalidationPort()
    val service = HostSessionLifecycleService(port, port, port, invalidation)
    val command = HostSessionIdCommand(host, sessionId)
    service.reopen(command)
    service.unpublish(command)
    service.returnToDraft(command)
    assertThat(invalidation.clubs).isEmpty()
}
```

Copy the existing `host` / `sessionId` / `captureHostSessionLogs` helpers already in that class. Do not write “similar to Task N” — paste the full test.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionServicesTest`

Expected: FAIL — use case/port methods missing.

- [ ] **Step 3: Add methods and delegates**

Use case + port:

```kotlin
fun reopen(command: HostSessionIdCommand): HostSessionDetailResponse
fun unpublish(command: HostSessionIdCommand): HostSessionDetailResponse
fun returnToDraft(command: HostSessionIdCommand): HostSessionDetailResponse
```

Port returns `HostSessionTransitionResult`.

Service (mirror `close`):

```kotlin
@Transactional
override fun reopen(command: HostSessionIdCommand) =
    lifecyclePort.reopen(command).also { result ->
        if (result.changed) {
            logger.info(
                "Session state changed clubId={} sessionId={} oldState={} newState={}",
                command.host.clubId,
                command.sessionId,
                "CLOSED",
                "OPEN",
            )
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        }
    }.detail
```

Same for `unpublish` (`PUBLISHED`→`CLOSED`) and `returnToDraft` (`OPEN`→`DRAFT`).

`JdbcHostSessionWriteAdapter` must compile: add three methods that call `lifecycle.reopen/unpublish/returnToDraft`. `unitTest` compiles main sources, so if Task 4 SQL is not in the same sitting, the adapter methods must throw `UnsupportedOperationException("Task 4 implements persistence")`.

- [ ] **Step 4: Run service tests**

Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionServicesTest`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/application/port \
  server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt \
  server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt
git commit -m "feat(server): add reverse session lifecycle use case methods"
```

---

### Task 4: Persistence CAS writes

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionLifecycleWriteOperations.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt` (tests will 404 until Task 5 mappings exist — write the persistence assertions via a thin controller in Task 5, or call write operations through existing Spring beans)

Preferred: write the HTTP tests in Task 5. In this task add a focused persistence test if one exists; otherwise implement SQL here and prove it in Task 5.

Add `findOpenSessionId(clubId: UUID): UUID?` to `HostSessionWriteQueries`:

```kotlin
fun findOpenSessionId(clubId: UUID): UUID? =
    jdbcTemplate.query(
        """
        select id
        from sessions
        where club_id = ?
          and state = 'OPEN'
        limit 1
        """.trimIndent(),
        { rs, _ -> rs.uuid("id") },
        clubId.dbString(),
    ).firstOrNull()
```

`reopen` algorithm:

1. `requireHost`
2. `queries.lockClub`
3. `findOpenSessionId`; if present and `!= command.sessionId`, throw `OpenSessionAlreadyExistsException(openId)`
4. `UPDATE sessions SET state='OPEN', updated_at=utc_timestamp(6) WHERE id=? AND club_id=? AND state='CLOSED'`
5. If rows > 0: hide public placement, `return result(command, true)`
6. `state = queries.state(...) ?: throw HostSessionNotFoundException()`
7. `policy.reopenDecision(state)`; `return result(command, false)`

Hide public placement (same transaction):

```sql
update public_session_publications
set site_visibility = 'HIDDEN',
    visibility = 'MEMBER',
    is_public = false,
    updated_at = utc_timestamp(6)
where session_id = ?
  and club_id = ?
  and site_visibility = 'PUBLIC_RECORD'
```

```sql
update sessions
set visibility = case when visibility = 'PUBLIC' then 'MEMBER' else visibility end,
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
```

Do not touch `public_summary`, highlights, one-liners, or `published_at`. Do not call `createActiveParticipants`.

`unpublish`:

```sql
update sessions
set state = 'CLOSED', updated_at = utc_timestamp(6)
where id = ? and club_id = ? and state = 'PUBLISHED'
```

0 rows → `state()` + `unpublishDecision`. Already `CLOSED` is unchanged. Do not change publication visibility.

`returnToDraft`:

1. `lockClub`
2. `UPDATE ... SET state='DRAFT' WHERE state='OPEN'`
3. 0 rows → `returnToDraftDecision`

Also update `open()` to throw `OpenSessionAlreadyExistsException(findOpenSessionId(clubId))` so `/open` gets the same code and id.

- [ ] **Step 1: Implement the three write methods and `findOpenSessionId`**

Replace Task 3 stubs.

- [ ] **Step 2: Commit persistence (tests land in Task 5)**

```bash
git add server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteQueries.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionLifecycleWriteOperations.kt
git commit -m "feat(server): persist one-step session lifecycle reversals"
```

If you prefer TDD-strict order, write the Task 5 failing HTTP tests first, run them (404), then implement this SQL, then add controller mappings.

---

### Task 5: HTTP mappings, security, integration tests

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt` (after the `/publish` allowlist line)
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionBffSecurityTest.kt`
- Modify existing `host cannot start another open session while one exists` to assert new code + `openSessionId`

**Interfaces:**
- Consumes: Task 3 use case methods
- Produces:
  - `POST /api/host/sessions/{sessionId}/reopen`
  - `POST /api/host/sessions/{sessionId}/unpublish`
  - `POST /api/host/sessions/{sessionId}/return-to-draft`
  - Success body = existing session detail

- [ ] **Step 1: Write failing integration tests in `HostSessionControllerDbTest`**

Use existing helpers (`createDraftSessionSeven`, `updateSessionState`, `createSession`, fixtures with number >= 7). Add:

1. `host reopens a closed session` — close then POST `/reopen` → `$.state` = `OPEN`. Current-session query for a member returns that id.
2. `host reopen hides PUBLIC_RECORD and keeps publication summary` — closed session with publication `site_visibility=PUBLIC_RECORD`, non-empty `public_summary`. After reopen: session `OPEN`, publication row still present, `site_visibility=HIDDEN`, `is_public=0`, summary unchanged.
3. `host cannot reopen when another session is open` — session A OPEN, session B CLOSED; POST B `/reopen` → 409, `$.code` = `SESSION_OPEN_ALREADY_EXISTS`, `$.openSessionId` = A, B still `CLOSED`.
4. `host cannot reopen a published session` — 409 `SESSION_REOPEN_NOT_ALLOWED`.
5. `host unpublishes a published session` — after `/unpublish`, `$.state` = `CLOSED`, publication row remains, public records query no longer includes it (use the same public query helper already in `PublicControllerDbTest` or assert `sessions.state` + existing publication visibility query used by host tests).
6. `host cannot unpublish an open session` — 409 `SESSION_UNPUBLISH_NOT_ALLOWED`.
7. `host returns an open session to draft and keeps participants` — after `/return-to-draft`, state `DRAFT`, `count(session_participants)` unchanged; `/open` again succeeds and RSVP status of an updated participant stays (set one RSVP before revert).
8. `host cannot return a closed session to draft` — 409 `SESSION_RETURN_TO_DRAFT_NOT_ALLOWED`.
9. `member cannot reopen` — member user → 403.
10. `reopen of missing session` — 404.
11. Update `host cannot start another open session while one exists` to `jsonPath("$.code") { value("SESSION_OPEN_ALREADY_EXISTS") }` and `jsonPath("$.openSessionId") { value(firstSessionId) }`.

Idempotency: POST `/reopen` on already-OPEN same session → 200 `OPEN`. POST `/unpublish` on already-CLOSED → 200 `CLOSED`. POST `/return-to-draft` on already-DRAFT → 200 `DRAFT`.

BFF test (`HostSessionBffSecurityTest`): three tests mirroring close — BFF secret + Origin, no CSRF, 200 and expected state. Add create helpers for CLOSED/PUBLISHED/OPEN fixtures like `createOpenSession`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.api.HostSessionBffSecurityTest
```

Expected: FAIL — 404 or CSRF/403 on new paths.

- [ ] **Step 3: Add controller mappings and SecurityConfig allowlist**

```kotlin
@PostMapping("/{sessionId}/reopen")
fun reopen(member: CurrentMember, @PathVariable sessionId: String) =
    hostSessionLifecycleUseCase.reopen(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

@PostMapping("/{sessionId}/unpublish")
fun unpublish(member: CurrentMember, @PathVariable sessionId: String) =
    hostSessionLifecycleUseCase.unpublish(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

@PostMapping("/{sessionId}/return-to-draft")
fun returnToDraft(member: CurrentMember, @PathVariable sessionId: String) =
    hostSessionLifecycleUseCase.returnToDraft(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
```

SecurityConfig next to `/publish`:

```kotlin
methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/reopen$")),
methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/unpublish$")),
methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/return-to-draft$")),
```

BFF does not need a new policy if it already proxies `/api/host/**`. Confirm `front/functions/_shared/proxy.ts` has no per-path deny. If a POST suffix allowlist exists, add the three suffixes.

- [ ] **Step 4: Re-run integration tests**

Same command as Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionBffSecurityTest.kt
git commit -m "feat(server): expose host session reopen, unpublish, and return-to-draft"
```

---

### Task 6: Frontend API and query mutations

**Files:**
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/api/host-api.test.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/queries/host-session-queries.hooks.test.tsx`
- Modify: `front/shared/api/errors.ts` — keep `openSessionId` on `ReadmatesApiError`
- Test: `front/shared/api/errors` existing tests if present; add one parse case

**Interfaces:**
- Consumes: same `readmatesFetchResponse` as `closeHostSession`
- Produces:
  - `export function reopenHostSession(sessionId: string)`
  - `export function unpublishHostSession(sessionId: string)`
  - `export function returnHostSessionToDraft(sessionId: string)`
  - `useReopenHostSessionMutation` / `useUnpublishHostSessionMutation` / `useReturnHostSessionToDraftMutation`
  - Invalidation: same as close (`invalidateSessionMutationSurfaces(..., { manualDispatches: true })`)
  - `ReadmatesApiError.openSessionId: string | null`

- [ ] **Step 1: Write failing API and query tests**

In `host-api.test.ts`, call the three new functions next to `publishHostSession` and expect:

```ts
["POST", "/api/bff/api/host/sessions/session%207/reopen"],
["POST", "/api/bff/api/host/sessions/session%207/unpublish"],
["POST", "/api/bff/api/host/sessions/session%207/return-to-draft"],
```

Insert them immediately after the existing publish assertion so the exact `toEqual` list stays ordered.

In `host-session-queries.hooks.test.tsx`, extend the `it.each` table:

```ts
["reopen", useReopenHostSessionMutation, reopenHostSession, true],
["unpublish", useUnpublishHostSessionMutation, unpublishHostSession, true],
["return-to-draft", useReturnHostSessionToDraftMutation, returnHostSessionToDraft, true],
```

Mock the new API fns like `closeHostSession`.

Error parse test (put next to existing error tests):

```ts
it("keeps openSessionId on SESSION_OPEN_ALREADY_EXISTS", async () => {
  const response = new Response(
    JSON.stringify({
      code: "SESSION_OPEN_ALREADY_EXISTS",
      message: "이미 진행 중인 세션이 있습니다. 그 세션을 마감하거나 예정으로 되돌린 뒤 다시 시도하세요.",
      status: 409,
      openSessionId: "00000000-0000-0000-0000-000000000307",
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
  const error = await apiErrorFromResponse(response);
  expect(error.code).toBe("SESSION_OPEN_ALREADY_EXISTS");
  expect(error.openSessionId).toBe("00000000-0000-0000-0000-000000000307");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/api/host-api.test.ts features/host/queries/host-session-queries.hooks.test.tsx shared/api/errors.test.ts
```

If `errors.test.ts` path differs, glob `front/shared/api/*error*`.

Expected: FAIL — exports missing; `openSessionId` undefined.

- [ ] **Step 3: Implement helpers**

```ts
export function reopenHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/reopen`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}
```

Same for `unpublish` and `return-to-draft` (`returnHostSessionToDraft`).

Mutations copy `useCloseHostSessionMutation`.

In `errors.ts`, add `openSessionId?: string` to `ReadmatesApiErrorBody`. In `parseApiErrorBody`, if `typeof parsed.openSessionId === "string" && parsed.openSessionId.length > 0`, include it. On `ReadmatesApiError`, `readonly openSessionId: string | null` from the body.

- [ ] **Step 4: Re-run Vitest**

Same command as Step 2.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add front/features/host/api/host-api.ts front/features/host/api/host-api.test.ts \
  front/features/host/queries/host-session-queries.ts \
  front/features/host/queries/host-session-queries.hooks.test.tsx \
  front/shared/api/errors.ts
git commit -m "feat(front): add host session reverse lifecycle API clients"
```

---

### Task 7: Pure lifecycle presentation model

**Files:**
- Create: `front/features/host/model/host-session-lifecycle-model.ts`
- Create: `front/features/host/model/host-session-lifecycle-model.test.ts`

**Interfaces:**
- Consumes: `HostSessionState`
- Produces:

```ts
export type SessionLifecycleConfirmKind =
  | "close"
  | "publish"
  | "reopen"
  | "unpublish"
  | "return-to-draft";

export type SessionLifecycleConfirmCopy = {
  kind: SessionLifecycleConfirmKind;
  title: string;
  body: string;
  confirmLabel: string;
  successFlash: string;
};

export function reverseLifecycleAction(
  state: HostSessionState,
): { kind: Extract<SessionLifecycleConfirmKind, "reopen" | "unpublish" | "return-to-draft">; label: string } | null;

export function lifecycleConfirmCopy(kind: SessionLifecycleConfirmKind): SessionLifecycleConfirmCopy;

export function openAlreadyExistsMessage(): string; // spec sentence
```

Copy from spec §7.1–7.2:

| kind | title / confirmLabel | body | successFlash |
| --- | --- | --- | --- |
| close | 세션 마감 | 멤버 RSVP·질문·서평이 멈추고 현재 세션에서 내려갑니다. 기록은 남습니다. | 세션을 마감했습니다. |
| publish | 세션 공개 | 멤버 노트·아카이브에 나갑니다. 공개 배치가 켜져 있으면 사이트에도 나갑니다. | 세션을 공개했습니다. |
| reopen | 마감 취소 | 다시 진행 중이 됩니다. 공개 사이트 배치는 숨깁니다. 기록은 남습니다. | 마감을 취소했습니다. 세션이 다시 진행 중입니다. |
| unpublish | 공개 취소 | 공개 사이트에서 내려갑니다. 기록과 이미 보낸 알림은 남습니다. | 공개를 취소했습니다. |
| return-to-draft | 예정으로 되돌리기 | 현재 세션이 아닙니다. 참석·질문은 남습니다. | 진행을 취소했습니다. 세션이 예정 상태로 돌아갔습니다. |

`reverseLifecycleAction`: OPEN → return-to-draft / 「예정으로 되돌리기」; CLOSED → reopen / 「마감 취소」; PUBLISHED → unpublish / 「공개 취소」; DRAFT → null.

- [ ] **Step 1: Write failing model tests** covering every state and every kind’s title/body/flash.

- [ ] **Step 2: Run**

```bash
corepack pnpm --dir front exec vitest run features/host/model/host-session-lifecycle-model.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the model. No React, router, query, or API imports.**

- [ ] **Step 4: Re-run. Expected: PASS**

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-session-lifecycle-model.ts \
  front/features/host/model/host-session-lifecycle-model.test.ts
git commit -m "feat(front): add host session lifecycle confirm copy"
```

---

### Task 8: Confirm dialog and overview buttons

**Files:**
- Create: `front/features/host/ui/session-editor/session-lifecycle-confirm-dialog.tsx`
- Create: `front/features/host/ui/session-editor/session-lifecycle-confirm-dialog.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-overview-section.tsx`
- Modify: `front/features/host/ui/session-editor/session-overview-section.test.tsx`

**Interfaces:**
- Consumes: `SessionLifecycleConfirmCopy`, `ReadmatesApiError`
- Produces:
  - `SessionLifecycleConfirmDialog` props: `{ copy, errorMessage, openSessionHref, submitting, restoreFocusRef, onClose, onConfirm }`
  - Overview props add `onReverseSession?: () => void` and `reverseLabel?: string`

Dialog behavior (copy `HostSessionDeletionPreviewDialog`):

- `role="dialog"` `aria-modal="true"` `aria-labelledby="session-lifecycle-confirm-title"`
- Focus cancel on open; restore trigger on close
- Escape/cancel call `onClose` only when `!submitting`
- Confirm button is `btn-primary`, not danger red
- If `errorMessage`, show `role="alert"`
- If `openSessionHref`, render a link 「진행 중인 세션 열기」

Overview:

- Keep existing close/publish/records buttons
- If `reverseLabel` and `onReverseSession`, render `btn-ghost btn-sm` with that label
- Desktop: wrap as now
- Mobile: stack forward above reverse. Use a column class already used in host editor, or:

```tsx
<div className="row" style={{ gap: 8, flexWrap: "wrap", flexDirection: "column", alignItems: "stretch" }}>
```

only inside a narrow container is wrong. Prefer:

```tsx
<div className="rm-host-session-editor__lifecycle-actions">
```

Add CSS in the existing host session editor stylesheet (search `rm-host-session-editor__overview`) so `@media (max-width: 720px)` the action group is `flex-direction: column`. Do not invent a new design token.

Update tests:

- OPEN: 「세션 마감」 and 「예정으로 되돌리기」
- CLOSED: 「세션 공개」, 「기록 작업대」, 「마감 취소」
- PUBLISHED: 「공개 취소」 only (no 마감/공개)
- DRAFT: neither reverse nor close
- click reverse calls `onReverseSession` once
- close click still calls `onCloseSession` (confirm is the parent’s job)

Dialog tests:

- confirm calls `onConfirm`
- Escape does not call `onConfirm`
- submitting disables buttons
- shows `openAlreadyExistsMessage` and link when provided

- [ ] **Step 1: Write failing UI tests**

- [ ] **Step 2: Run**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/session-editor/session-overview-section.test.tsx features/host/ui/session-editor/session-lifecycle-confirm-dialog.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Implement dialog + overview + CSS**

- [ ] **Step 4: Re-run. Expected: PASS**

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/session-editor
git commit -m "feat(front): add session lifecycle confirm dialog and reverse actions"
```

---

### Task 9: Wire the session editor

**Files:**
- Modify: `front/features/host/route/host-session-editor-actions.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/host-session-editor.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx` if that is the canonical editor test
- Modify: `front/features/host/route/host-session-editor-route.test.tsx` only if action wiring is asserted there

**Interfaces:**
- Consumes: Task 6 mutations, Task 7 copy, Task 8 dialog
- Produces: editor state `lifecycleConfirm: SessionLifecycleConfirmKind | null` and `lifecycleError: { message: string; openSessionHref: string | null }`

Actions type add:

```ts
reopenSession: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
unpublishSession: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
returnSessionToDraft: (sessionId: string) => Promise<JsonResponse<HostSessionDetailResponse>>;
```

Route wires `useReopenHostSessionMutation` etc. like close.

Editor:

- 「세션 마감」 / 「세션 공개」 / reverse buttons only set `lifecycleConfirm`; they must not fetch
- Dialog confirm switches on kind and calls the matching action
- On `!response.ok`, `const error = await apiErrorFromResponse(response)` (clone-safe). Stay in the dialog. If `error.code === "SESSION_OPEN_ALREADY_EXISTS"`, message = `error.message`, href = `openSessionId` via existing club-scoped editor path helper (search `host/sessions/${id}/edit` builder in host navigation model). If no id, href null
- On success: `SESSION_LIFECYCLE_UPDATED`, close dialog, flash `successFlash`
- `lifecyclePending` true while saving

Tests in `host-session-editor.test.tsx`:

1. Click 「세션 마감」 → dialog visible, `closeSession` not called
2. Cancel / Escape → still not called
3. Confirm → `closeSession` called once
4. CLOSED 「마감 취소」 confirm → `reopenSession`
5. 409 `SESSION_OPEN_ALREADY_EXISTS` with id → alert text + link; dialog remains
6. PUBLISHED 「공개 취소」 confirm → `unpublishSession`
7. OPEN 「예정으로 되돌리기」 confirm → `returnSessionToDraft`

Use the existing test actions object (`hostSessionEditorTestActions`) and add the three new fns.

- [ ] **Step 1: Write failing editor tests**

- [ ] **Step 2: Run**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-session-editor.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Wire confirm-then-mutate. Do not use `window.confirm`.**

- [ ] **Step 4: Re-run. Expected: PASS**

- [ ] **Step 5: Commit**

```bash
git add front/features/host/route/host-session-editor-actions.ts \
  front/features/host/route/host-session-editor-route.tsx \
  front/features/host/ui/host-session-editor.tsx \
  front/features/host/ui/host-session-editor.test.tsx \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat(front): confirm before session close, publish, and reverse"
```

---

### Task 10: Docs, CHANGELOG, and PR-level evidence

**Files:**
- Modify: `docs/development/architecture.md` (세션 lifecycle과 공개 범위, around the state table and the paragraphs that say there is no revert API and that open does not restore CLOSED/PUBLISHED)
- Modify: `CHANGELOG.md` Unreleased Highlights
- Do not edit `docs/superpowers/specs/2026-08-18-host-session-lifecycle-revert-design.md` unless a factual slip is found

**architecture.md** must say:

- Reverse commands exist: `/unpublish`, `/reopen`, `/return-to-draft`
- One step only; other `OPEN` blocks reopen/open
- `reopen` hides `PUBLIC_RECORD` and does not recreate participants
- `unpublish` keeps publication rows; public site requires `PUBLISHED + PUBLIC_RECORD`
- Data and notifications are not deleted

**CHANGELOG** Unreleased Highlights, one bullet, Korean, no private data:

`- **호스트 세션 되돌리기:** 호스트가 확인 후 공개 취소, 마감 취소, 예정 환원을 한 단계씩 할 수 있습니다. 기록과 알림은 남고, 다른 진행 중 세션이 있으면 다시 열 수 없습니다.`

- [ ] **Step 1: Patch architecture.md and CHANGELOG**

- [ ] **Step 2: Docs check**

```bash
git diff --check -- docs/development/architecture.md CHANGELOG.md
```

Expected: no whitespace errors.

- [ ] **Step 3: Server PR-level**

```bash
./scripts/server-ci-check.sh
```

Expected: PASS. If a security-architecture allowlist test fails, add the three POST regexes there too.

- [ ] **Step 4: Frontend PR-level**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 5: E2E decision**

Inspect `front/tests/e2e/member-lifecycle.spec.ts` and `front/tests/e2e/dev-login-session-flow.spec.ts`. If either already closes a session in UI, add two assertions: confirm dialog appears before close, and after close 「마감 취소」 is visible. Do not add a new spec file. If no existing flow reaches the editor overview, skip e2e and record that in the commit message / PR notes.

- [ ] **Step 6: Commit**

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs: record host session lifecycle reverse transitions"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| §5 state machine / CAS / club lock | 1, 4 |
| §6.1 endpoints | 5 |
| §6.2 reopen/unpublish/return-to-draft side effects | 4, 5 |
| §6.3 error codes + openSessionId | 2, 5, 6, 9 |
| §7.1 buttons | 7, 8 |
| §7.2 confirm modal + close/publish confirm | 8, 9 |
| §8 front boundaries | 6–9 |
| §9 tests + architecture/CHANGELOG | 5, 9, 10 |
| §3 / §10 non-goals | no task |
| BFF policy | confirm only in Task 5 |
| Admin closing-risk ledger | observe only; no new write |

**No placeholders** in task steps. Task 4’s HTTP proof is Task 5 by design; implement SQL before or after the failing HTTP tests, but do not ship Task 4 without Task 5 in the same branch.

**Types:** `reopen` / `unpublish` / `returnToDraft` on use case; `returnHostSessionToDraft` in TS; confirm kind `"return-to-draft"`.
