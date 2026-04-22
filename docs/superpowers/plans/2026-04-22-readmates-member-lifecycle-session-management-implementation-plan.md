# ReadMates Member Lifecycle And Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add host-managed member lifecycle controls so ReadMates can handle invites, current-session inclusion, suspension, leaving, restoration, and left-member anonymization without deleting reading records.

**Architecture:** Keep long-term membership state in `memberships.status` and per-session inclusion in `session_participants.participation_status`. Add a focused lifecycle service for host/self actions, enforce write restrictions centrally at member-action write paths, and extend host member/invitation UI around existing `/app/host/members` and `/app/host/invitations` patterns.

**Tech Stack:** Kotlin/Spring Boot, Spring Security, JdbcTemplate, Flyway MySQL migrations, Vite React, TypeScript, Vitest/Testing Library, Playwright, Gradle, pnpm.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-22-readmates-member-lifecycle-session-management-design.md`
- Existing invite spec: `docs/superpowers/specs/2026-04-20-readmates-invite-only-membership-design.md`
- Existing Google approval spec: `docs/superpowers/specs/2026-04-21-readmates-cloudflare-spa-google-auth-migration-design.md`
- Current frontend/backend status: `README.md`

## Scope Guardrails

- Do not delete `users`, `memberships`, `session_participants`, questions, checkins, reviews, highlights, or feedback records.
- Do not implement data export, permanent deletion, scheduled suspension, email notifications, host role transfer, or multi-club UI.
- Do not replace Google auth or invitation token behavior.
- Do not make `LEFT` members able to access internal app pages in this implementation.
- Do not show left member names in public/member-facing responses.
- Preserve unrelated dirty worktree changes. At plan creation time these unrelated files were dirty:
  - `.github/workflows/ci.yml`
  - `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
- If implementation must touch a dirty file, inspect the existing diff first and preserve user changes.

## Current Baseline To Capture Before Implementation

- [x] Run `git status --short` and record dirty files in this plan before editing.

Baseline dirty files recorded on 2026-04-22 before implementation:

```text
 M docs/superpowers/plans/2026-04-22-readmates-language-ux-data-consistency-implementation-plan.md
 M front/features/host/components/host-dashboard.tsx
 M front/features/member-home/components/member-home.tsx
 M front/shared/ui/mobile-header.tsx
 M front/shared/ui/mobile-tab-bar.tsx
 M front/shared/ui/public-auth-action-state.ts
 M front/shared/ui/top-nav.tsx
?? front/shared/ui/readmates-copy.ts
```

- [x] Run focused backend baseline tests:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostMemberApprovalControllerTest \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.InvitationControllerDbTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest
```

- [x] Run focused frontend baseline tests:

```bash
pnpm --dir front exec vitest run \
  tests/unit/host-members.test.tsx \
  tests/unit/host-invitations.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/my-page.test.tsx \
  tests/unit/api-contract-fixtures.test.ts
```

Record any baseline failures before changing code.

## File Structure

### Backend Files

- Create `server/src/main/resources/db/mysql/migration/V10__member_lifecycle_session_management.sql`
  - Expands membership statuses, adds `session_participants.participation_status`, and adds `invitations.apply_to_current_session`.
- Modify `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
  - Adds `SUSPENDED` and `LEFT`.
- Create `server/src/main/kotlin/com/readmates/session/domain/SessionParticipationStatus.kt`
  - Defines `ACTIVE` and `REMOVED`.
- Create `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
  - Owns host member list, suspend, restore, deactivate-to-left, self-leave, current-session add/remove, final-host protection, and current-session policy handling.
- Create `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleModels.kt`
  - Holds request/response DTOs and enums shared by host/self lifecycle controllers.
- Modify `server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt`
  - Keeps existing pending approval endpoints and adds host member lifecycle endpoints.
- Create `server/src/main/kotlin/com/readmates/auth/api/SelfMembershipController.kt`
  - Adds `POST /api/me/membership/leave`.
- Modify `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
  - Maps `SUSPENDED` and `LEFT` to stable approval states.
- Modify `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
  - Resolves `SUSPENDED` for read access, excludes `LEFT` from authenticated app access.
- Modify `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
  - Finds active-or-suspended members for auth, revives `LEFT` membership during invite acceptance, and keeps `LEFT` excluded from normal app auth.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
  - Grants `ROLE_MEMBER` for `ACTIVE` and `SUSPENDED` non-host members so reads continue; write blocking remains application-level.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
  - Mirrors cookie authority behavior for OAuth/dev authenticated requests.
- Modify `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  - Persists `apply_to_current_session`, returns it to host responses, and only auto-adds to current session when all safe conditions pass.
- Modify `server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt`
  - Accepts `applyToCurrentSession`.
- Modify `server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt`
  - Blocks writes by non-`ACTIVE` members and `REMOVED` participants.
- Modify `server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt`
  - Filters roster/counts to `participation_status='ACTIVE'`, exposes member write availability through the current-session response, and anonymizes left authors in member-facing boards.
- Modify `server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt`
  - Creates participants only for `ACTIVE` memberships, filters or groups `REMOVED` attendees for host editor, and includes lifecycle-safe counts.
- Modify archive/notes/public query repositories:
  - `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
  - `server/src/main/kotlin/com/readmates/archive/application/MyRecordsQueryRepository.kt`
  - `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt`
  - `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`
  - Apply `LEFT` author anonymization in general/member/public responses.
- Modify feedback access:
  - `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentRepository.kt`
  - Allows `SUSPENDED` attended members to read past feedback and keeps `LEFT` blocked through auth.
- Add backend tests:
  - `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/SelfMembershipControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/MemberLifecycleAuthTest.kt`
- Modify existing backend tests listed in each task.

### Frontend Files

- Modify `front/shared/api/readmates.ts`
  - Adds statuses, lifecycle request/response DTOs, invitation `applyToCurrentSession`, and attendee participation status types.
- Create `front/features/host/components/host-members.tsx`
  - Moves host member management UI out of `front/src/pages/host-members.tsx` into a focused component.
- Modify `front/src/pages/host-members.tsx`
  - Fetches `GET /api/host/members` and renders the new hub.
- Modify `front/features/host/components/host-invitations.tsx`
  - Adds current-session checkbox and sends `applyToCurrentSession`.
- Modify `front/features/current-session/components/current-session.tsx`
  - Disables write controls for suspended members.
- Modify `front/features/current-session/components/current-session-mobile.tsx`
  - Mirrors suspended write-disable behavior on mobile.
- Modify `front/features/current-session/components/current-session-types.ts`
  - Adds auth/member lifecycle props for current session controls.
- Modify `front/features/host/components/host-session-attendance-editor.tsx`
  - Shows active attendees by default and a collapsed removed-attendees section.
- Modify `front/features/archive/components/my-page.tsx`
  - Wires self-leave API and confirmation state.
- Modify unit tests:
  - `front/tests/unit/host-members.test.tsx`
  - `front/tests/unit/host-invitations.test.tsx`
  - `front/tests/unit/current-session.test.tsx`
  - `front/tests/unit/host-session-editor.test.tsx`
  - `front/tests/unit/my-page.test.tsx`
  - `front/tests/unit/api-contract-fixtures.test.ts`
- Modify E2E tests:
  - `front/tests/e2e/google-auth-invite-flow.spec.ts`
  - `front/tests/e2e/dev-login-session-flow.spec.ts`
  - Add `front/tests/e2e/member-lifecycle.spec.ts`

---

## Task 1 - Database, Domain Enums, And API Contracts

**Files:**

- Create: `server/src/main/resources/db/mysql/migration/V10__member_lifecycle_session_management.sql`
- Modify: `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/session/domain/SessionParticipationStatus.kt`
- Modify: `front/shared/api/readmates.ts`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `front/tests/unit/api-contract-fixtures.ts`
- Modify: `front/tests/unit/api-contract-fixtures.test.ts`

- [x] **Step 1: Write migration smoke expectations**

Add assertions to `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`. The assertion body should query these values after Flyway migration:

```kotlin
val membershipStatuses = jdbcTemplate.queryForList(
    """
    select constraint_name, check_clause
    from information_schema.check_constraints
    where constraint_schema = database()
      and constraint_name = 'memberships_status_check'
    """.trimIndent(),
    Map::class.java,
)
assertTrue(membershipStatuses.any { row ->
    row["CHECK_CLAUSE"].toString().contains("SUSPENDED") &&
        row["CHECK_CLAUSE"].toString().contains("LEFT")
})

val participantColumns = jdbcTemplate.queryForList(
    """
    select column_name
    from information_schema.columns
    where table_schema = database()
      and table_name = 'session_participants'
      and column_name = 'participation_status'
    """.trimIndent(),
)
assertEquals(1, participantColumns.size)
```

- [x] **Step 2: Run migration test and verify it fails**

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: FAIL because the new column/statuses are not present.

- [x] **Step 3: Add MySQL migration**

Create `server/src/main/resources/db/mysql/migration/V10__member_lifecycle_session_management.sql`:

```sql
alter table memberships drop check memberships_status_check;

alter table memberships
  add constraint memberships_status_check
  check (status in ('INVITED', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE'));

alter table session_participants
  add column participation_status varchar(20) not null default 'ACTIVE';

alter table session_participants
  add constraint session_participants_participation_status_check
  check (participation_status in ('ACTIVE', 'REMOVED'));

alter table invitations
  add column apply_to_current_session boolean not null default true;
```

- [x] **Step 4: Update backend enums**

Modify `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`:

```kotlin
package com.readmates.auth.domain

enum class MembershipStatus {
    INVITED,
    PENDING_APPROVAL,
    ACTIVE,
    SUSPENDED,
    LEFT,
    INACTIVE,
}
```

Create `server/src/main/kotlin/com/readmates/session/domain/SessionParticipationStatus.kt`:

```kotlin
package com.readmates.session.domain

enum class SessionParticipationStatus {
    ACTIVE,
    REMOVED,
}
```

- [x] **Step 5: Update frontend API types**

Modify `front/shared/api/readmates.ts`:

```ts
export type MembershipStatus = "INVITED" | "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionPolicy = "APPLY_NOW" | "NEXT_SESSION";
export type CurrentSessionPolicyResult = "APPLIED" | "NOT_APPLICABLE" | "DEFERRED";
```

Extend `HostInvitationListItem`:

```ts
export type HostInvitationListItem = {
  invitationId: string;
  email: string;
  name: string;
  role: MemberRole;
  status: InvitationStatus;
  effectiveStatus: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  applyToCurrentSession: boolean;
  canRevoke: boolean;
  canReissue: boolean;
};
```

Add host member DTOs:

```ts
export type HostMemberListItem = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  currentSessionParticipationStatus: SessionParticipationStatus | null;
  canSuspend: boolean;
  canRestore: boolean;
  canDeactivate: boolean;
  canAddToCurrentSession: boolean;
  canRemoveFromCurrentSession: boolean;
};

export type MemberLifecycleRequest = {
  currentSessionPolicy: CurrentSessionPolicy;
};

export type MemberLifecycleResponse = {
  member: HostMemberListItem;
  currentSessionPolicyResult: CurrentSessionPolicyResult;
};
```

Extend current session attendees:

```ts
attendees: Array<{
  membershipId: string;
  displayName: string;
  shortName: string;
  role: MemberRole;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  participationStatus?: SessionParticipationStatus;
}>;
```

- [x] **Step 6: Update contract fixtures**

Modify `front/tests/unit/api-contract-fixtures.ts` so host invitation fixtures include `applyToCurrentSession: true` and any new host member fixture uses `status: "ACTIVE"` with `currentSessionParticipationStatus: "ACTIVE"`.

- [x] **Step 7: Run focused tests**

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
pnpm --dir front exec vitest run tests/unit/api-contract-fixtures.test.ts tests/unit/host-invitations.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V10__member_lifecycle_session_management.sql \
  server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt \
  server/src/main/kotlin/com/readmates/session/domain/SessionParticipationStatus.kt \
  front/shared/api/readmates.ts \
  front/tests/unit/api-contract-fixtures.ts \
  front/tests/unit/api-contract-fixtures.test.ts \
  front/tests/unit/host-invitations.test.tsx
git commit -m "feat: add member lifecycle schema and contracts"
```

---

## Task 2 - Auth Resolution And Write Permission Guardrails

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt`
- Add: `server/src/test/kotlin/com/readmates/auth/api/MemberLifecycleAuthTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`

- [x] **Step 1: Add failing auth/status tests**

Create `server/src/test/kotlin/com/readmates/auth/api/MemberLifecycleAuthTest.kt` with these tests:

```kotlin
@Test
fun `suspended member resolves auth me but left member does not`() {
    val suspendedCookie = sessionCookieForLifecycleMember("suspended.auth", "SUSPENDED")
    val leftCookie = sessionCookieForLifecycleMember("left.auth", "LEFT")

    mockMvc.get("/api/auth/me") { cookie(suspendedCookie) }
        .andExpect {
            status { isOk() }
            jsonPath("$.authenticated") { value(true) }
            jsonPath("$.membershipStatus") { value("SUSPENDED") }
            jsonPath("$.approvalState") { value("SUSPENDED") }
        }

    mockMvc.get("/api/auth/me") { cookie(leftCookie) }
        .andExpect {
            status { isOk() }
            jsonPath("$.authenticated") { value(false) }
            jsonPath("$.approvalState") { value("ANONYMOUS") }
        }
}
```

Use the helper style from `HostMemberApprovalControllerTest`: create a user, membership, and `AuthSessionService.issueSession`, then clean up rows in `@AfterEach`.

- [x] **Step 2: Add failing write-block tests**

Add to `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`:

```kotlin
@Test
@Sql(
    statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL, OPEN_SESSION_WITH_PARTICIPANTS_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
fun `suspended member cannot write current session activity`() {
    jdbcTemplate.update(
        """
        update memberships
        join users on users.id = memberships.user_id
        set memberships.status = 'SUSPENDED'
        where users.email = 'member5@example.com'
        """.trimIndent(),
    )

    mockMvc.post("/api/sessions/current/questions") {
        with(user("member5@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"priority":1,"text":"정지 중 질문","draftThought":null}"""
    }.andExpect {
        status { isForbidden() }
    }
}

@Test
@Sql(
    statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL, OPEN_SESSION_WITH_PARTICIPANTS_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
fun `removed participant cannot write current session activity`() {
    jdbcTemplate.update(
        """
        update session_participants
        join memberships on memberships.id = session_participants.membership_id
        join users on users.id = memberships.user_id
        set session_participants.participation_status = 'REMOVED'
        where users.email = 'member5@example.com'
          and session_participants.session_id = '00000000-0000-0000-0000-000000009102'
        """.trimIndent(),
    )

    mockMvc.put("/api/sessions/current/checkin") {
        with(user("member5@example.com"))
        with(csrf())
        contentType = MediaType.APPLICATION_JSON
        content = """{"readingProgress":80,"note":"제외된 참가자의 체크인"}"""
    }.andExpect {
        status { isForbidden() }
    }
}
```

- [x] **Step 3: Run tests and verify they fail**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.MemberLifecycleAuthTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: FAIL because `SUSPENDED`/`LEFT` auth mapping and `participation_status` write blocking are not implemented.

- [x] **Step 4: Update auth state mapping**

Modify `AuthMeController.kt`:

```kotlin
enum class ApprovalState {
    ANONYMOUS,
    PENDING_APPROVAL,
    ACTIVE,
    SUSPENDED,
    INACTIVE,
}
```

Update the `when`:

```kotlin
approvalState = when (member.membershipStatus) {
    MembershipStatus.PENDING_APPROVAL -> ApprovalState.PENDING_APPROVAL
    MembershipStatus.ACTIVE -> ApprovalState.ACTIVE
    MembershipStatus.SUSPENDED -> ApprovalState.SUSPENDED
    MembershipStatus.LEFT,
    MembershipStatus.INACTIVE,
    MembershipStatus.INVITED -> ApprovalState.INACTIVE
}
```

- [x] **Step 5: Resolve active-or-suspended members only**

In `MemberAccountRepository.kt`, replace query status filters used for app auth from:

```sql
and memberships.status in ('ACTIVE', 'PENDING_APPROVAL')
```

to these exact filters:

```sql
and memberships.status in ('ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL')
```

Keep `LEFT` excluded from `findActiveMemberByEmail`, `findActiveMemberByUserId`, `findMemberByGoogleSubject`, and `findMemberByUserIdIncludingPending`.

Keep the private helper name `queryActiveMemberByEmail` for a smaller diff, but change the SQL filter inside it so `SUSPENDED` members resolve and `LEFT` members do not.

- [x] **Step 6: Keep suspended members under member role**

Modify `SessionCookieAuthenticationFilter.kt` and `MemberAuthoritiesFilter.kt` so the special pending role only applies to pending approval:

```kotlin
val roleAuthority = if (member.isPendingApproval) {
    "ROLE_PENDING_APPROVAL"
} else {
    "ROLE_${member.role}"
}
```

This code already has the right shape; verify `SUSPENDED MEMBER` maps to `ROLE_MEMBER` because `isPendingApproval` is false.

- [x] **Step 7: Add write guards in session participation repository**

Add this helper to `SessionParticipationRepository.kt`:

```kotlin
private fun requireWritableMember(member: CurrentMember) {
    if (!member.isActive) {
        throw AccessDeniedException("Approved active membership is required")
    }
}
```

Import `com.readmates.shared.security.AccessDeniedException`.

Call `requireWritableMember(member)` at the start of:

- `updateRsvp`
- `saveCheckin`
- `saveQuestion`
- `replaceQuestions`
- `saveOneLineReview`
- `saveLongReview`

Update every current-session write query to require active participation:

```sql
and session_participants.participation_status = 'ACTIVE'
```

If an update/insert returns `0` because the member is not an active participant, throw `AccessDeniedException("Current session participation is required")` for existing participant `REMOVED`, and keep `CurrentSessionNotOpenException` for no open session. Add this helper:

```kotlin
private fun isRemovedFromCurrentOpenSession(jdbcTemplate: JdbcTemplate, member: CurrentMember): Boolean =
    jdbcTemplate.queryForObject(
        """
        select count(*)
        from session_participants
        join sessions on sessions.id = session_participants.session_id
          and sessions.club_id = session_participants.club_id
        where session_participants.club_id = ?
          and session_participants.membership_id = ?
          and session_participants.participation_status = 'REMOVED'
          and sessions.state = 'OPEN'
        """.trimIndent(),
        Int::class.java,
        member.clubId.dbString(),
        member.membershipId.dbString(),
    ) == 1
```

- [x] **Step 8: Run focused backend tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.MemberLifecycleAuthTest \
  --tests com.readmates.auth.api.AuthMeControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt \
  server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt \
  server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt \
  server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt \
  server/src/test/kotlin/com/readmates/auth/api/MemberLifecycleAuthTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt \
  server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt
git commit -m "feat: enforce member lifecycle auth rules"
```

---

## Task 3 - Host Member Lifecycle Service And API

**Files:**

- Create: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleModels.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/SelfMembershipController.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/SelfMembershipControllerTest.kt`

- [x] **Step 1: Add failing host lifecycle API tests**

Create `HostMemberLifecycleControllerTest.kt` with MySQL/Spring setup matching `HostMemberApprovalControllerTest`.

Required tests:

```kotlin
@Test
fun `host lists members with current session participation flags`() {
    val hostCookie = sessionCookieForEmail("host@example.com")
    val sessionId = createOpenSession()
    val activeMembershipId = insertLifecycleMember("active.list", "ACTIVE")
    addParticipant(sessionId, activeMembershipId, "ACTIVE")

    mockMvc.get("/api/host/members") { cookie(hostCookie) }
        .andExpect {
            status { isOk() }
            jsonPath("$[?(@.membershipId == '$activeMembershipId')].status") { value("ACTIVE") }
            jsonPath("$[?(@.membershipId == '$activeMembershipId')].currentSessionParticipationStatus") { value("ACTIVE") }
        }
}

@Test
fun `host suspends member and removes from current session when apply now`() {
    val hostCookie = sessionCookieForEmail("host@example.com")
    val sessionId = createOpenSession()
    val membershipId = insertLifecycleMember("suspend.now", "ACTIVE")
    addParticipant(sessionId, membershipId, "ACTIVE")

    mockMvc.post("/api/host/members/$membershipId/suspend") {
        cookie(hostCookie)
        contentType = MediaType.APPLICATION_JSON
        content = """{"currentSessionPolicy":"APPLY_NOW"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.member.status") { value("SUSPENDED") }
        jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
    }

    assertEquals("SUSPENDED", membershipStatus(membershipId))
    assertEquals("REMOVED", participationStatus(sessionId, membershipId))
}
```

Also add tests for:

- `NEXT_SESSION` suspend leaves current participant `ACTIVE`.
- `restore` changes `SUSPENDED` to `ACTIVE` without auto-adding to current session.
- `deactivate` changes `ACTIVE` to `LEFT` and `APPLY_NOW` marks current participant `REMOVED`.
- `current-session/add` is idempotent for active members.
- `current-session/remove` is idempotent and marks `REMOVED`.
- `current-session/add` returns `409` for `SUSPENDED`, `LEFT`, and `INACTIVE`.
- member cannot call host lifecycle endpoints.
- host cannot mutate a membership outside their club.
- host cannot mutate self.
- last active host cannot be deactivated or suspended.

- [x] **Step 2: Add failing self-leave tests**

Create `SelfMembershipControllerTest.kt`.

Required tests:

```kotlin
@Test
fun `member leaves club and current session is removed by default`() {
    val memberCookie = sessionCookieForEmail("member5@example.com")
    val sessionId = createOpenSessionWithMember("member5@example.com")
    val membershipId = membershipIdForEmail("member5@example.com")

    mockMvc.post("/api/me/membership/leave") {
        cookie(memberCookie)
        contentType = MediaType.APPLICATION_JSON
        content = """{"currentSessionPolicy":"APPLY_NOW"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.member.status") { value("LEFT") }
        jsonPath("$.currentSessionPolicyResult") { value("APPLIED") }
    }

    assertEquals("LEFT", membershipStatus(membershipId))
    assertEquals("REMOVED", participationStatus(sessionId, membershipId))
}
```

Also test that host self-leave is rejected when it would remove the last active host.

- [x] **Step 3: Run tests and verify they fail**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostMemberLifecycleControllerTest \
  --tests com.readmates.auth.api.SelfMembershipControllerTest
```

Expected: FAIL because endpoints and service do not exist.

- [x] **Step 4: Add lifecycle models**

Create `MemberLifecycleModels.kt`:

```kotlin
package com.readmates.auth.application

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus

enum class CurrentSessionPolicy {
    APPLY_NOW,
    NEXT_SESSION,
}

enum class CurrentSessionPolicyResult {
    APPLIED,
    NOT_APPLICABLE,
    DEFERRED,
}

data class MemberLifecycleRequest(
    val currentSessionPolicy: CurrentSessionPolicy = CurrentSessionPolicy.APPLY_NOW,
)

data class HostMemberListItem(
    val membershipId: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val role: MembershipRole,
    val status: MembershipStatus,
    val joinedAt: String?,
    val createdAt: String,
    val currentSessionParticipationStatus: SessionParticipationStatus?,
    val canSuspend: Boolean,
    val canRestore: Boolean,
    val canDeactivate: Boolean,
    val canAddToCurrentSession: Boolean,
    val canRemoveFromCurrentSession: Boolean,
)

data class MemberLifecycleResponse(
    val member: HostMemberListItem,
    val currentSessionPolicyResult: CurrentSessionPolicyResult,
)
```

- [x] **Step 5: Implement lifecycle service**

Create `MemberLifecycleService.kt` with methods:

```kotlin
fun listMembers(host: CurrentMember): List<HostMemberListItem>
fun suspend(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse
fun restore(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse
fun deactivate(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse
fun addToCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse
fun removeFromCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse
fun leave(member: CurrentMember, request: MemberLifecycleRequest): MemberLifecycleResponse
```

Core SQL rules:

```sql
update memberships
set status = 'SUSPENDED',
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and role = 'MEMBER'
  and status = 'ACTIVE'
```

```sql
update memberships
set status = 'ACTIVE',
    joined_at = coalesce(joined_at, utc_timestamp(6)),
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and role = 'MEMBER'
  and status = 'SUSPENDED'
```

```sql
update memberships
set status = 'LEFT',
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and role = 'MEMBER'
  and status in ('ACTIVE', 'SUSPENDED')
```

Use `ensureMutableMembership` to reject:

- membership not in host club
- self mutation
- non-member role unless self-leave and protected host checks pass
- last active host mutation

Use `applyCurrentSessionPolicy`:

```kotlin
private fun applyCurrentSessionPolicy(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    membershipId: UUID,
    policy: CurrentSessionPolicy,
): CurrentSessionPolicyResult {
    val openSessionId = findCurrentOpenSessionId(jdbcTemplate, clubId)
        ?: return CurrentSessionPolicyResult.NOT_APPLICABLE
    if (policy == CurrentSessionPolicy.NEXT_SESSION) {
        return CurrentSessionPolicyResult.DEFERRED
    }
    markRemoved(jdbcTemplate, clubId, openSessionId, membershipId)
    return CurrentSessionPolicyResult.APPLIED
}
```

Implement `markRemoved` with:

```sql
update session_participants
set participation_status = 'REMOVED',
    updated_at = utc_timestamp(6)
where club_id = ?
  and session_id = ?
  and membership_id = ?
```

Implement add with insert/update:

```sql
insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
on duplicate key update
  participation_status = 'ACTIVE',
  updated_at = utc_timestamp(6)
```

- [x] **Step 6: Wire controllers**

Modify `HostMemberApprovalController.kt` to inject `MemberLifecycleService` and add:

```kotlin
@GetMapping
fun members(authentication: Authentication?) =
    memberLifecycleService.listMembers(requireHost(authentication))

@PostMapping("/{membershipId}/suspend")
fun suspend(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
    @RequestBody request: MemberLifecycleRequest,
) = memberLifecycleService.suspend(requireHost(authentication), membershipId, request)

@PostMapping("/{membershipId}/restore")
fun restore(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberLifecycleService.restore(requireHost(authentication), membershipId)

@PostMapping("/{membershipId}/deactivate")
fun deactivate(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
    @RequestBody request: MemberLifecycleRequest,
) = memberLifecycleService.deactivate(requireHost(authentication), membershipId, request)

@PostMapping("/{membershipId}/current-session/add")
fun addToCurrentSession(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberLifecycleService.addToCurrentSession(requireHost(authentication), membershipId)

@PostMapping("/{membershipId}/current-session/remove")
fun removeFromCurrentSession(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberLifecycleService.removeFromCurrentSession(requireHost(authentication), membershipId)
```

Create `SelfMembershipController.kt`:

```kotlin
@RestController
class SelfMembershipController(
    private val memberLifecycleService: MemberLifecycleService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @PostMapping("/api/me/membership/leave")
    fun leave(
        authentication: Authentication?,
        @RequestBody request: MemberLifecycleRequest,
    ): MemberLifecycleResponse {
        val member = authenticatedMemberResolver.resolve(authentication)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required")
        return memberLifecycleService.leave(member, request)
    }
}
```

- [x] **Step 7: Run focused tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostMemberLifecycleControllerTest \
  --tests com.readmates.auth.api.SelfMembershipControllerTest \
  --tests com.readmates.auth.api.HostMemberApprovalControllerTest
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleModels.kt \
  server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt \
  server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt \
  server/src/main/kotlin/com/readmates/auth/api/SelfMembershipController.kt \
  server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/SelfMembershipControllerTest.kt
git commit -m "feat: add host member lifecycle api"
```

---

## Task 4 - Invitation Current-Session Intent

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`
- Modify: `front/features/host/actions/invitations.ts`
- Modify: `front/features/host/components/host-invitations.tsx`
- Modify: `front/tests/unit/host-invitations.test.tsx`
- Modify: `front/tests/e2e/google-auth-invite-flow.spec.ts`

- [x] **Step 1: Add failing backend invitation tests**

In `HostInvitationControllerTest.kt`, assert create request accepts and returns `applyToCurrentSession`:

```kotlin
mockMvc.post("/api/host/invitations") {
    cookie(hostCookie)
    contentType = MediaType.APPLICATION_JSON
    content = """{"email":"invite.apply@example.com","name":"초대 적용","applyToCurrentSession":false}"""
}.andExpect {
    status { isCreated() }
    jsonPath("$.applyToCurrentSession") { value(false) }
}
```

In `InvitationControllerDbTest.kt`, add:

- accepting an invite with `applyToCurrentSession=false` does not create current participant.
- accepting with `true` creates current participant only when current open session exists, question deadline is in the future, and session date has not passed.
- accepting with `true` after question deadline leaves active membership but no participant row.

- [x] **Step 2: Run backend tests and verify they fail**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.InvitationControllerDbTest
```

Expected: FAIL because request/response and acceptance logic do not support `applyToCurrentSession`.

- [x] **Step 3: Update invitation DTOs and SQL**

In `InvitationService.kt`, extend `HostInvitationResponse`:

```kotlin
val applyToCurrentSession: Boolean,
```

Extend create request in `HostInvitationController.kt`:

```kotlin
data class CreateHostInvitationRequest(
    @field:Email val email: String,
    @field:NotBlank val name: String,
    val applyToCurrentSession: Boolean = true,
)
```

Pass it to:

```kotlin
invitationService.createInvitation(
    host = requireHost(authentication),
    email = request.email,
    name = request.name,
    applyToCurrentSession = request.applyToCurrentSession,
)
```

Persist in insert:

```sql
apply_to_current_session
```

with parameter `applyToCurrentSession`.

Select it in list/find queries and map to `applyToCurrentSession`.

- [x] **Step 4: Update acceptance auto-add conditions**

Replace unconditional `addToCurrentOpenSession(jdbcTemplate, invitation.clubId, membershipId)` with:

```kotlin
if (invitation.applyToCurrentSession) {
    addToCurrentOpenSessionIfSafe(jdbcTemplate, invitation.clubId, membershipId)
}
```

Implement safe condition:

```sql
insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
select ?, sessions.club_id, sessions.id, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE'
from sessions
where sessions.club_id = ?
  and sessions.state = 'OPEN'
  and sessions.question_deadline_at > utc_timestamp(6)
  and sessions.session_date >= date(date_add(utc_timestamp(6), interval 9 hour))
order by sessions.number desc
limit 1
on duplicate key update
  participation_status = 'ACTIVE',
  updated_at = utc_timestamp(6)
```

- [x] **Step 5: Add frontend checkbox and request body**

In `front/features/host/actions/invitations.ts`, include `applyToCurrentSession`.

In `HostInvitations`, add state:

```ts
const [applyToCurrentSession, setApplyToCurrentSession] = useState(true);
```

Render checkbox near invite submit:

```tsx
<label className="row" style={{ gap: 8, alignItems: "center" }}>
  <input
    type="checkbox"
    checked={applyToCurrentSession}
    onChange={(event) => setApplyToCurrentSession(event.currentTarget.checked)}
  />
  <span className="small">수락하면 이번 세션에도 추가</span>
</label>
```

Submit body:

```ts
JSON.stringify({ email, name, applyToCurrentSession })
```

- [x] **Step 6: Update frontend tests**

In `host-invitations.test.tsx`, update expected POST body:

```ts
body: JSON.stringify({ email: "new@example.com", name: "새멤버", applyToCurrentSession: true })
```

Add a test that unchecking the checkbox sends false:

```ts
await user.click(screen.getByLabelText("수락하면 이번 세션에도 추가"));
await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/host/invitations",
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ email: "new@example.com", name: "새멤버", applyToCurrentSession: false }),
  }),
);
```

- [x] **Step 7: Run focused tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.InvitationControllerDbTest
pnpm --dir front exec vitest run tests/unit/host-invitations.test.tsx tests/unit/host-invitation-actions.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt \
  server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt \
  server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt \
  front/features/host/actions/invitations.ts \
  front/features/host/components/host-invitations.tsx \
  front/tests/unit/host-invitations.test.tsx \
  front/tests/e2e/google-auth-invite-flow.spec.ts
git commit -m "feat: capture invitation current-session intent"
```

---

## Task 5 - Current Session, Host Session, And Removed Participant Behavior

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Modify: `front/features/host/components/host-session-attendance-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`

- [x] **Step 1: Add failing repository/controller tests**

In `CurrentSessionControllerDbTest.kt`, add a test that a `REMOVED` participant is not returned in `attendees` and cannot influence `myRsvpStatus`.

In `HostSessionControllerDbTest.kt`, add a test that creating a new session includes `ACTIVE` memberships and excludes `SUSPENDED`, `LEFT`, and `INACTIVE`.

In `HostDashboardControllerTest.kt`, add a test that RSVP pending/checkin missing counts exclude `REMOVED` participants.

- [x] **Step 2: Run tests and verify they fail**

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest
```

Expected: FAIL because current queries do not account for `participation_status`.

- [x] **Step 3: Filter member-facing current session queries**

In `CurrentSessionRepository.kt`, add:

```sql
and session_participants.participation_status = 'ACTIVE'
```

to attendee, board, current member target, checkin, question, review, and RSVP queries that represent the current active session.

When reading `myRsvpStatus`, a missing row because of `REMOVED` should result in the same unavailable state as non-participation, not a default active RSVP.

- [x] **Step 4: Update host session repository**

In session creation, keep:

```sql
where club_id = ?
  and status = 'ACTIVE'
```

Verify it remains exact and does not include `SUSPENDED`.

When inserting participants, include:

```sql
participation_status
```

with value `'ACTIVE'`.

In host attendees query, select participation status:

```sql
session_participants.participation_status
```

Keep the existing single `HostSessionAttendee` list and add:

```kotlin
val participationStatus: SessionParticipationStatus = SessionParticipationStatus.ACTIVE
```

- [x] **Step 5: Update host attendance editor UI**

Extend attendee type in `host-session-attendance-editor.tsx`:

```ts
participationStatus?: SessionParticipationStatus;
```

Render:

```ts
const activeAttendees = sessionAttendees.filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE");
const removedAttendees = sessionAttendees.filter((attendee) => attendee.participationStatus === "REMOVED");
```

Use `activeAttendees` for the default list. If `removedAttendees.length > 0`, render:

```tsx
<details>
  <summary className="small">제외된 참가자 {removedAttendees.length}명</summary>
  {removedAttendees.map((attendee) => (
    <div key={attendee.membershipId} className="small">
      {attendee.displayName}
    </div>
  ))}
</details>
```

- [x] **Step 6: Update frontend tests**

Add to `host-session-editor.test.tsx`:

```ts
expect(screen.queryByText("제외된 멤버")).not.toBeInTheDocument();
expect(screen.getByText("제외된 참가자 1명")).toBeInTheDocument();
```

Add to `current-session.test.tsx` fixture a removed attendee and assert it is not displayed in member-facing roster.

- [x] **Step 7: Run focused tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest
pnpm --dir front exec vitest run tests/unit/current-session.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt \
  server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt \
  server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt \
  front/features/host/components/host-session-attendance-editor.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: respect removed current-session participants"
```

---

## Task 6 - Left-Member Anonymization In Member And Public Reads

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/MyRecordsQueryRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt` or its backing repository methods where author names are assembled.
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`

- [x] **Step 1: Add failing anonymization tests**

In `ArchiveAndNotesDbTest.kt`, create a left member with a question/checkin/one-line review on a seeded or generated session, then assert member-facing archive/notes responses contain `탈퇴한 멤버` and not the real name.

In `CurrentSessionControllerDbTest.kt`, create a current open session where a left member has existing board data and assert board author names are anonymized.

In `PublicControllerDbTest.kt`, assert public notes/records do not reveal left member names where author names are exposed.

- [x] **Step 2: Run tests and verify they fail**

```bash
./server/gradlew -p server test \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.publication.api.PublicControllerDbTest
```

Expected: FAIL because queries return real names.

- [x] **Step 3: Add SQL display expressions**

Where member/public queries select `users.name` or `users.short_name` for another member's authored content, replace with:

```sql
case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.short_name end as author_short_name
```

For host-only member lifecycle responses, do not anonymize.

For `MyRecordsQueryRepository`, keep the current member's own records normal because `LEFT` members cannot access internal app in this scope; avoid special casing unless tests show a path.

- [x] **Step 4: Keep feedback access policy stable**

Verify `FeedbackDocumentRepository.kt` continues to allow attended `ACTIVE` and `SUSPENDED` members by using auth resolver behavior. Do not add `LEFT` read access because `LEFT` cannot authenticate as an internal member.

- [x] **Step 5: Run focused tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.feedback.api.FeedbackDocumentControllerTest
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt \
  server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt \
  server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt \
  server/src/main/kotlin/com/readmates/archive/application/MyRecordsQueryRepository.kt \
  server/src/main/kotlin/com/readmates/publication/api/PublicController.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt \
  server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt
git commit -m "feat: anonymize left member records"
```

---

## Task 7 - Host Member Management Hub UI

**Files:**

- Create: `front/features/host/components/host-members.tsx`
- Modify: `front/src/pages/host-members.tsx`
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/tests/unit/host-members.test.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`

- [x] **Step 1: Add failing host members UI tests**

Update `host-members.test.tsx` to expect:

```ts
expect(await screen.findByRole("tab", { name: "활성 멤버" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "승인 대기" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "정지됨" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "탈퇴/비활성" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "초대" })).toBeInTheDocument();
```

Add interaction tests:

- active member row shows `정지`, `탈퇴 처리`, and `이번 세션 제외`.
- clicking `정지` opens modal with `이번 세션부터 바로 정지` and `다음 세션부터 정지`.
- confirming suspend POSTs `/api/host/members/{membershipId}/suspend` with `{"currentSessionPolicy":"APPLY_NOW"}`.
- clicking `복구` for suspended member POSTs `/restore`.
- clicking current-session add/remove POSTs the matching endpoints.

- [x] **Step 2: Run test and verify it fails**

```bash
pnpm --dir front exec vitest run tests/unit/host-members.test.tsx
```

Expected: FAIL because the current page only lists pending approvals.

- [x] **Step 3: Create host members component**

Create `front/features/host/components/host-members.tsx` with props:

```ts
type HostMembersProps = {
  initialMembers: HostMemberListItem[];
};
```

Use local state:

```ts
const [members, setMembers] = useState(initialMembers);
const [activeTab, setActiveTab] = useState<"active" | "pending" | "suspended" | "inactive" | "invitations">("active");
const [dialog, setDialog] = useState<null | { action: "suspend" | "deactivate"; member: HostMemberListItem }>(null);
```

Use tab filters:

```ts
const activeMembers = members.filter((member) => member.status === "ACTIVE");
const suspendedMembers = members.filter((member) => member.status === "SUSPENDED");
const inactiveMembers = members.filter((member) => member.status === "LEFT" || member.status === "INACTIVE");
const pendingMembers = members.filter((member) => member.status === "PENDING_APPROVAL");
```

Use lifecycle submit:

```ts
async function submitLifecycle(member: HostMemberListItem, path: string, body?: MemberLifecycleRequest) {
  const response = await readmatesFetchResponse(`/api/host/members/${member.membershipId}${path}`, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error("Member lifecycle update failed");
  }
  const result = (await response.json()) as MemberLifecycleResponse;
  setMembers((current) => current.map((item) => (item.membershipId === result.member.membershipId ? result.member : item)));
}
```

Render Korean labels from the spec. Keep buttons disabled when `can*` flags are false.

- [x] **Step 4: Update page loader**

Modify `front/src/pages/host-members.tsx` to fetch:

```ts
readmatesFetch<HostMemberListItem[]>("/api/host/members")
```

and render:

```tsx
<ReadmatesPageState state={state}>{(members) => <HostMembers initialMembers={members} />}</ReadmatesPageState>
```

- [x] **Step 5: Preserve pending approval actions**

Move existing approve/reject behavior into the `승인 대기` tab. After approve/reject, update the row with returned status or remove it from pending list and refresh members.

Use existing endpoints:

```text
POST /api/host/members/{membershipId}/approve
POST /api/host/members/{membershipId}/reject
```

- [x] **Step 6: Run focused frontend tests**

```bash
pnpm --dir front exec vitest run tests/unit/host-members.test.tsx tests/unit/host-dashboard.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add front/features/host/components/host-members.tsx \
  front/src/pages/host-members.tsx \
  front/shared/api/readmates.ts \
  front/tests/unit/host-members.test.tsx \
  front/features/host/components/host-dashboard.tsx \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "feat: add host member management hub"
```

---

## Task 8 - Suspended Member And Self-Leave Frontend UX

**Files:**

- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/current-session/components/current-session-mobile.tsx`
- Modify: `front/features/current-session/components/current-session-types.ts`
- Modify: `front/src/pages/current-session.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Add failing suspended current session tests**

In `current-session.test.tsx`, render `CurrentSession` with an auth/status prop or route-level wrapper state that marks membership `SUSPENDED`. Assert:

```ts
expect(screen.getByText("멤버십이 일시 정지되어 새 활동을 저장할 수 없습니다.")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "체크인 저장" })).toBeDisabled();
expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();
expect(screen.getByRole("button", { name: "서평 저장" })).toBeDisabled();
```

- [x] **Step 2: Add failing self-leave tests**

In `my-page.test.tsx`, click `탈퇴`, confirm, and assert:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "/api/bff/api/me/membership/leave",
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
  }),
);
expect(await screen.findByRole("status")).toHaveTextContent("탈퇴 처리되었습니다.");
```

- [x] **Step 3: Run tests and verify they fail**

```bash
pnpm --dir front exec vitest run tests/unit/current-session.test.tsx tests/unit/my-page.test.tsx
```

Expected: FAIL because UI does not know suspended status and self-leave is not wired.

- [x] **Step 4: Pass auth status into current session**

Modify `front/src/pages/current-session.tsx` to load auth alongside current session:

```ts
const state = useReadmatesData(
  useCallback(
    async () => {
      const [auth, current] = await Promise.all([
        readmatesFetch<AuthMeResponse>("/api/auth/me"),
        readmatesFetch<CurrentSessionResponse>("/api/sessions/current"),
      ]);
      return { auth, current };
    },
    [],
  ),
);
```

Render:

```tsx
<CurrentSession auth={data.auth} data={data.current} />
```

Update `CurrentSession` props:

```ts
export default function CurrentSession({ auth, data }: { auth?: AuthMeResponse; data: CurrentSessionResponse })
```

Compute:

```ts
const isSuspended = auth?.membershipStatus === "SUSPENDED";
```

Disable save actions when `isSuspended`. Use the same prop in desktop/mobile subcomponents.

- [x] **Step 5: Wire self-leave**

In `my-page.tsx`, replace the non-working 탈퇴 button with a confirmation state:

```tsx
const [leaveOpen, setLeaveOpen] = useState(false);
const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
```

Submit:

```ts
const response = await readmatesFetchResponse("/api/me/membership/leave", {
  method: "POST",
  body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
});
if (!response.ok) {
  throw new Error("Leave membership failed");
}
setLeaveMessage("탈퇴 처리되었습니다.");
globalThis.location.href = "/about";
```

Render confirmation copy:

```text
탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.
```

- [x] **Step 6: Run focused frontend tests**

```bash
pnpm --dir front exec vitest run tests/unit/current-session.test.tsx tests/unit/my-page.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add front/src/pages/current-session.tsx \
  front/features/current-session/components/current-session.tsx \
  front/features/current-session/components/current-session-mobile.tsx \
  front/features/current-session/components/current-session-types.ts \
  front/features/archive/components/my-page.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/my-page.test.tsx
git commit -m "feat: show suspended state and self leave"
```

---

## Task 9 - End-To-End Coverage And Documentation

**Files:**

- Add: `front/tests/e2e/member-lifecycle.spec.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-04-22-readmates-member-lifecycle-session-management-implementation-plan.md` as checkboxes are completed.

- [x] **Step 1: Add E2E DB helpers**

In `front/tests/e2e/readmates-e2e-db.ts`, add helpers:

```ts
export function setMembershipStatus(email: string, status: "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE") {
  runMysql(`
    update memberships
    join users on users.id = memberships.user_id
    set memberships.status = ${sqlString(status)}
    where lower(users.email) = ${sqlString(normalizeEmail(email))}
      and memberships.club_id = ${sqlString(clubId)};
  `);
}

export function setCurrentSessionParticipation(email: string, status: "ACTIVE" | "REMOVED") {
  runMysql(`
    update session_participants
    join memberships on memberships.id = session_participants.membership_id
    join users on users.id = memberships.user_id
    join sessions on sessions.id = session_participants.session_id
      and sessions.club_id = session_participants.club_id
    set session_participants.participation_status = ${sqlString(status)}
    where lower(users.email) = ${sqlString(normalizeEmail(email))}
      and sessions.club_id = ${sqlString(clubId)}
      and sessions.state = 'OPEN';
  `);
}
```

- [x] **Step 2: Add lifecycle E2E**

Create `member-lifecycle.spec.ts`:

```ts
test("host suspends member and member cannot save current session activity", async ({ page, context }) => {
  cleanupGeneratedSessions();
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/host/sessions/new");
  // Use existing helpers or UI steps from dev-login-session-flow to create an open session.
  await createOpenSessionThroughUi(page);

  await page.goto("/app/host/members");
  await page.getByRole("tab", { name: "활성 멤버" }).click();
  await page.getByRole("button", { name: /member5@example.com 정지/ }).click();
  await page.getByLabel("이번 세션부터 바로 정지").check();
  await page.getByRole("button", { name: "정지" }).click();

  const memberPage = await context.newPage();
  await loginWithGoogleFixture(memberPage, "member5@example.com");
  await memberPage.goto("/app/session/current");
  await expect(memberPage.getByText("멤버십이 일시 정지되어 새 활동을 저장할 수 없습니다.")).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "질문 저장" })).toBeDisabled();
});
```

If no shared `createOpenSessionThroughUi` helper exists, extract only the minimal existing session creation flow from `dev-login-session-flow.spec.ts`.

- [x] **Step 3: Add documentation update**

Update `README.md` Current Status:

```md
- Host member lifecycle management supports ACTIVE, SUSPENDED, LEFT, and INACTIVE memberships.
- Suspended members can read existing records but cannot save current-session activity.
- Left members are removed from internal access and their member/public-facing historical author names are anonymized.
- Current session inclusion is tracked separately with session participant participation status.
```

- [x] **Step 4: Run full focused verification**

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostMemberLifecycleControllerTest \
  --tests com.readmates.auth.api.SelfMembershipControllerTest \
  --tests com.readmates.auth.api.MemberLifecycleAuthTest \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.InvitationControllerDbTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest

pnpm --dir front exec vitest run \
  tests/unit/host-members.test.tsx \
  tests/unit/host-invitations.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/my-page.test.tsx \
  tests/unit/api-contract-fixtures.test.ts

pnpm --dir front test:e2e -- member-lifecycle.spec.ts
```

Expected: PASS. If e2e cannot run because local MySQL or Google fixture setup is unavailable, record the blocker with the exact command output.

Task 9 verification on 2026-04-22:

- `./server/gradlew -p server test --tests com.readmates.auth.api.HostMemberLifecycleControllerTest --tests com.readmates.auth.api.SelfMembershipControllerTest --tests com.readmates.auth.api.MemberLifecycleAuthTest --tests com.readmates.auth.api.HostInvitationControllerTest --tests com.readmates.auth.api.InvitationControllerDbTest --tests com.readmates.note.api.MemberActionControllerDbTest --tests com.readmates.session.api.CurrentSessionControllerDbTest --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest` passed.
- `pnpm --dir front exec vitest run tests/unit/host-members.test.tsx tests/unit/host-invitations.test.tsx tests/unit/current-session.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/my-page.test.tsx tests/unit/api-contract-fixtures.test.ts` passed with 6 files and 90 tests.
- `pnpm --dir front test:e2e -- member-lifecycle.spec.ts` passed with 1 Chromium test.

- [x] **Step 5: Commit**

```bash
git add front/tests/e2e/member-lifecycle.spec.ts \
  front/tests/e2e/readmates-e2e-db.ts \
  README.md \
  docs/superpowers/plans/2026-04-22-readmates-member-lifecycle-session-management-implementation-plan.md
git commit -m "test: cover member lifecycle flow"
```

---

## Final Verification

- [x] Run backend suite:

```bash
./server/gradlew -p server test
```

- [x] Run frontend checks:

```bash
pnpm --dir front test
pnpm --dir front lint
pnpm --dir front build
```

- [x] Run E2E when local MySQL is configured:

```bash
pnpm --dir front test:e2e
```

- [x] Inspect `git status --short` and confirm only intentional files are dirty.
- [x] Update this plan's checkboxes as tasks complete.

## Self-Review Notes

- Spec coverage: DB states, session participation status, host lifecycle APIs, self leave, invitation current-session intent, suspended write blocking, left-member anonymization, host UI, current-session UI, and e2e coverage are each mapped to tasks above.
- Completeness scan: no unresolved markers are intended. Each task names concrete files, endpoints, request/response fields, commands, and expected outcomes.
- Type consistency: frontend `CurrentSessionPolicy`, `CurrentSessionPolicyResult`, `SessionParticipationStatus`, `HostMemberListItem`, `MemberLifecycleRequest`, and `MemberLifecycleResponse` mirror backend model names.
