# ReadMates Viewer Member Session Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current approval-waiting model with a simpler access model: guests see public content, viewer members can browse all non-draft sessions except feedback documents, full members can participate and write, and hosts can activate viewer members while invitation-link users become full members immediately.

**Architecture:** Keep one membership table and one host workflow. Rename `PENDING_APPROVAL` to `VIEWER` at the domain/API level, map viewers to a read-only security role, and let session/archive APIs serve read-only data to viewers while write and feedback endpoints continue to require active membership. Add a shared session identity/status UI so members and hosts can immediately tell new/current/past sessions apart.

**Tech Stack:** Kotlin 2.2, Spring Boot 4, Spring Security, MySQL/Flyway, React 19, React Router 7, TypeScript, Vite, Vitest, Testing Library, Playwright.

---

## Product Rules

Use these terms everywhere in product copy, tests, and code comments:

| User state | Internal status | What they can do |
| --- | --- | --- |
| Guest | no session | Read public pages and public session records only. |
| Viewer member | `VIEWER` | Log in, browse the member app, read all non-draft sessions and club notes, but cannot RSVP, check in, write questions/reviews, read feedback documents, or use host tools. |
| Full member | `ACTIVE` | Participate in current sessions, write member records, browse sessions, and read feedback documents only for attended sessions. |
| Host | `role=HOST`, `status=ACTIVE` | Full member powers plus session, invitation, member, publication, attendance, and feedback document operations. |

Invitation policy:

- A user who accepts a valid invite link with the matching Google email becomes `ACTIVE` immediately.
- A user who logs in with Google without an invite becomes `VIEWER`.
- A host can activate a `VIEWER` member into `ACTIVE`.
- A host can deactivate a `VIEWER` member into `INACTIVE`.

Session visibility policy:

- Public routes show only public session records.
- Viewer, full member, and host routes show non-draft sessions: `OPEN`, `CLOSED`, and `PUBLISHED`.
- Feedback documents remain hidden from viewers. Archive cards may show that a document exists, but opening the document returns a locked state.

## File Structure

**Backend domain and migration**

- Modify: `server/src/main/resources/db/mysql/migration/V10__member_lifecycle_session_management.sql`
  - Leave historical migration unchanged.
- Create: `server/src/main/resources/db/mysql/migration/V11__viewer_membership_status.sql`
  - Converts existing `PENDING_APPROVAL` rows to `VIEWER`.
  - Replaces the membership status check constraint.
- Modify: `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
  - Replace `PENDING_APPROVAL` with `VIEWER`.
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
  - Add `isViewer`, keep `isActive`, keep `isHost`.

**Backend auth/security**

- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
  - Return `approvalState: "VIEWER"` for viewer members.
- Modify: `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt`
  - Rename pending wording to viewer wording.
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
  - Create viewer members on uninvited Google login.
  - Query `VIEWER` rows wherever current code queries `PENDING_APPROVAL`.
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
  - Map viewers to `ROLE_VIEWER`.
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
  - Map viewers to `ROLE_VIEWER` and strip stale viewer/member/host roles.
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
  - Allow `ROLE_VIEWER` to read selected member APIs.
  - Keep mutations and feedback documents off-limits to viewers.

**Backend member lifecycle**

- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt`
  - Rename service model to viewer activation.
  - List viewers, activate viewers, deactivate viewers.
- Modify: `server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt`
  - Add `/viewers`, `/activate`, `/deactivate-viewer`.
  - Keep `/pending-approvals`, `/approve`, and `/reject` as compatibility aliases for this release.
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
  - Include `VIEWER` in member list ordering and status labels.

**Backend sessions and archive**

- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
  - Add response fields for session identity if needed by API models.
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
  - Resolve viewer members, not active-only members.
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
  - Return non-draft sessions to logged-in members.
  - Add `state` to archive session list/detail response.
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
  - Pass the current member into session list queries.
- Modify: `server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt`
  - Reject `VIEWER` with the same locked semantics as pending approval had.

**Frontend API, routing, and copy**

- Modify: `front/shared/api/readmates.ts`
  - Add `VIEWER` status/state.
  - Add `state` to archive session models.
- Modify: `front/src/app/route-guards.tsx`
  - Let viewers enter the member app.
  - Keep host routes active-host only.
- Modify: `front/src/pages/pending-approval.tsx`
  - Replace this page with a viewer landing or remove redirects to it.
- Modify: `front/shared/ui/readmates-copy.ts`
  - Add viewer/full member terms.

**Frontend UI**

- Create: `front/shared/ui/session-identity.tsx`
  - Shared session label: `No.07 · 이번 세션 · 준비 중 · D-21`.
- Test: `front/tests/unit/session-identity.test.tsx`
- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/member-home/components/member-home-current-session.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/current-session/components/current-session-mobile.tsx`
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/archive/components/member-session-detail-page.tsx`
- Modify: `front/features/feedback/components/feedback-document-page.tsx`
- Modify: `front/features/host/components/host-members.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/shared/styles/tokens.css`

**Tests and docs**

- Modify backend tests under `server/src/test/kotlin/com/readmates/auth/**`.
- Modify archive/session tests under `server/src/test/kotlin/com/readmates/archive/**` and `server/src/test/kotlin/com/readmates/session/**`.
- Modify frontend unit tests under `front/tests/unit/**`.
- Modify E2E tests under `front/tests/e2e/**`.
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-22-readmates-language-ux-data-consistency-design.md`

## Task 1: Database And Domain Status Rename

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V11__viewer_membership_status.sql`
- Modify: `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Write the migration file**

Create `server/src/main/resources/db/mysql/migration/V11__viewer_membership_status.sql`:

```sql
alter table memberships drop check memberships_status_check;

update memberships
set status = 'VIEWER',
    updated_at = utc_timestamp(6)
where status = 'PENDING_APPROVAL';

alter table memberships
  add constraint memberships_status_check
  check (status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE'));
```

- [x] **Step 2: Update the Kotlin enum**

Replace `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt` with:

```kotlin
package com.readmates.auth.domain

enum class MembershipStatus {
    INVITED,
    VIEWER,
    ACTIVE,
    SUSPENDED,
    LEFT,
    INACTIVE,
}
```

- [x] **Step 3: Run migration test and confirm the first failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected before code updates finish: the migration itself should pass. Other tests in later tasks will still fail because Kotlin and SQL references still mention `PENDING_APPROVAL`.

- [x] **Step 4: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V11__viewer_membership_status.sql \
  server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt
git commit -m "feat(auth): add viewer membership status"
```

## Task 2: Auth Response And Security Role Mapping

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt`

- [x] **Step 1: Update auth tests to describe viewers**

In `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`, rename the pending tests and change expected state:

```kotlin
@Test
fun `auth me returns viewer status without member write role`() {
    val viewerEmail = uniqueViewerEmail()
    val viewerCookie = loginAsGoogleViewerUser(viewerEmail)

    mockMvc.get("/api/auth/me") {
        cookie(viewerCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(true) }
        jsonPath("$.email") { value(viewerEmail) }
        jsonPath("$.membershipStatus") { value("VIEWER") }
        jsonPath("$.approvalState") { value("VIEWER") }
        jsonPath("$.role") { value("MEMBER") }
    }
}

private fun uniqueViewerEmail(): String = "viewer.${UUID.randomUUID()}@example.com"
```

In the same file, change helper inserts from:

```sql
'PENDING_APPROVAL'
```

to:

```sql
'VIEWER'
```

- [x] **Step 2: Run the auth test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.AuthMeControllerTest
```

Result: PASS after the Task 2 wiring in this branch. The expected-failure checkpoint was not separately captured because Task 1 had already pre-wired part of the viewer role mapping and the controller change was applied before this focused run.

- [x] **Step 3: Update `CurrentMember`**

In `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`, replace the computed properties with:

```kotlin
val isHost: Boolean
    get() = role == MembershipRole.HOST && membershipStatus == MembershipStatus.ACTIVE
val isActive: Boolean
    get() = membershipStatus == MembershipStatus.ACTIVE
val isViewer: Boolean
    get() = membershipStatus == MembershipStatus.VIEWER
val canBrowseMemberContent: Boolean
    get() = membershipStatus in setOf(
        MembershipStatus.VIEWER,
        MembershipStatus.ACTIVE,
        MembershipStatus.SUSPENDED,
    )
```

- [x] **Step 4: Update `AuthMeController`**

In `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`, replace `ApprovalState` and the `when` mapping with:

```kotlin
enum class ApprovalState {
    ANONYMOUS,
    VIEWER,
    ACTIVE,
    SUSPENDED,
    INACTIVE,
}
```

```kotlin
approvalState = when (member.membershipStatus) {
    MembershipStatus.VIEWER -> ApprovalState.VIEWER
    MembershipStatus.ACTIVE -> ApprovalState.ACTIVE
    MembershipStatus.SUSPENDED -> ApprovalState.SUSPENDED
    MembershipStatus.LEFT,
    MembershipStatus.INACTIVE,
    MembershipStatus.INVITED -> ApprovalState.INACTIVE
},
```

- [x] **Step 5: Update session-cookie role mapping**

In `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`, replace the role authority block with:

```kotlin
val roleAuthority = when {
    member.isViewer -> "ROLE_VIEWER"
    else -> "ROLE_${member.role}"
}
```

- [x] **Step 6: Update refreshed OAuth role mapping**

In `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`, replace the authority mapping and role stripping set with:

```kotlin
val roleAuthority = when {
    member.isViewer -> "ROLE_VIEWER"
    else -> "ROLE_${member.role}"
}
authorities += SimpleGrantedAuthority(roleAuthority)
```

```kotlin
val MEMBER_ROLE_AUTHORITIES = setOf("ROLE_HOST", "ROLE_MEMBER", "ROLE_VIEWER")
```

- [x] **Step 7: Update Spring Security access rules**

In `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`, replace the pending route matcher and API role rules with:

```kotlin
.requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
.requestMatchers(HttpMethod.GET, "/api/public/**").permitAll()
.requestMatchers("/api/invitations/**").permitAll()
.requestMatchers(methodAndPath("POST", Regex("^/api/dev/invitations/[^/]+/accept$"))).permitAll()
.requestMatchers(HttpMethod.GET, "/api/sessions/current").hasAnyRole("HOST", "MEMBER", "VIEWER")
.requestMatchers(HttpMethod.GET, "/api/archive/**").hasAnyRole("HOST", "MEMBER", "VIEWER")
.requestMatchers(HttpMethod.GET, "/api/notes/**").hasAnyRole("HOST", "MEMBER", "VIEWER")
.requestMatchers(HttpMethod.GET, "/api/app/viewer").hasRole("VIEWER")
.requestMatchers("/api/host/**").hasRole("HOST")
.requestMatchers(HttpMethod.GET, "/api/feedback-documents/me").hasAnyRole("HOST", "MEMBER", "VIEWER")
.requestMatchers(HttpMethod.GET, RegexRequestMatcher("^/api/sessions/[^/]+/feedback-document$", null)).hasAnyRole("HOST", "MEMBER", "VIEWER")
.requestMatchers(HttpMethod.GET, "/api/**").hasAnyRole("HOST", "MEMBER")
.requestMatchers("/api/**").hasAnyRole("HOST", "MEMBER")
```

Add this import at the top:

```kotlin
import org.springframework.security.web.util.matcher.RegexRequestMatcher
```

- [x] **Step 8: Update security tests**

Rename `PendingApprovalSecurityTest` to `ViewerSecurityTest` by moving the file to `server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt` and change inserted membership status to `VIEWER`.

The test names should be:

```kotlin
fun `viewer can read auth me`()
fun `viewer can read current session`()
fun `viewer can read archive sessions`()
fun `viewer cannot mutate current session`()
fun `viewer cannot read feedback document`()
fun `viewer cannot access host api`()
fun `feedback document controller rejects viewer before readable lookup`()
```

The write denial test keeps this request:

```kotlin
mockMvc.post("/api/sessions/current/questions") {
    cookie(cookie)
    contentType = MediaType.APPLICATION_JSON
    content = """{"questions":[{"priority":1,"text":"Question?","draftThought":null}]}"""
}.andExpect {
    status { isForbidden() }
}
```

- [x] **Step 9: Run focused tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.AuthMeControllerTest \
  --tests com.readmates.auth.api.ViewerSecurityTest
```

Expected: PASS.

- [x] **Step 10: Commit**

```bash
git add server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt \
  server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt
git commit -m "feat(auth): expose viewer as read-only member"
```

## Task 3: Google Login Creates Viewers, Invite Acceptance Creates Full Members

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/DevGoogleOAuthAutoMemberTest.kt`

- [x] **Step 1: Update Google login tests**

In `GoogleLoginServiceTest.kt`, rename:

```kotlin
fun `creates pending approval membership for new google user`()
```

to:

```kotlin
fun `creates viewer membership for new google user without invite`()
```

Update the assertion:

```kotlin
assertEquals(MembershipStatus.VIEWER, member.membershipStatus)
```

Update cleanup SQL and fixture inserts from `PENDING_APPROVAL` to `VIEWER`.

- [x] **Step 2: Run the focused service test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.application.GoogleLoginServiceTest
```

Expected: FAIL until repository names and SQL literals are updated.

- [x] **Step 3: Rename Google login service methods**

In `GoogleLoginService.kt`, replace `createPendingGoogleMember` and race helper names with viewer names:

```kotlin
private fun createViewerGoogleMember(
    googleSubjectId: String,
    normalizedEmail: String,
    displayName: String?,
    profileImageUrl: String?,
): CurrentMember {
    return try {
        memberAccountRepository.createViewerGoogleMember(
            googleSubjectId = googleSubjectId,
            email = normalizedEmail,
            displayName = displayName,
            profileImageUrl = profileImageUrl,
        )
    } catch (exception: DuplicateKeyException) {
        resolveDuplicateViewerGoogleMember(googleSubjectId, normalizedEmail, profileImageUrl, exception)
    }
}
```

Change the call site in `connectOrCreate`:

```kotlin
return connectExistingEmailUser(googleSubjectId, normalizedEmail, profileImageUrl)
    ?: createViewerGoogleMember(googleSubjectId, normalizedEmail, displayName, profileImageUrl)
```

- [x] **Step 4: Update repository methods and SQL**

In `MemberAccountRepository.kt`:

Rename `createPendingGoogleMember` to:

```kotlin
fun createViewerGoogleMember(
    googleSubjectId: String,
    email: String,
    displayName: String?,
    profileImageUrl: String?,
): CurrentMember
```

Inside its membership insert, use:

```sql
'VIEWER',
null
```

Rename `findMemberByUserIdIncludingPending` to:

```kotlin
fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember?
```

Replace every query status list:

```sql
and memberships.status in ('ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL')
```

with:

```sql
and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
```

Update the final return in `createViewerGoogleMember`:

```kotlin
return findMemberByUserIdIncludingViewer(userId)
    ?: throw IllegalStateException("Created Google user has no membership")
```

- [x] **Step 5: Confirm invite acceptance still activates immediately**

In `InvitationService.kt`, keep the existing activation SQL:

```sql
status = 'ACTIVE',
joined_at = utc_timestamp(6)
```

Add a focused test in `InvitationControllerDbTest.kt`:

```kotlin
@Test
fun `accepted google invitation creates active member instead of viewer`() {
    val invite = createPendingInvitation(email = "invited.active.${UUID.randomUUID()}@example.com")
    val cookie = completeGoogleInvite(invite.acceptUrl, invite.email)

    mockMvc.get("/api/auth/me") {
        cookie(cookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.membershipStatus") { value("ACTIVE") }
        jsonPath("$.approvalState") { value("ACTIVE") }
    }
}
```

Use existing invitation helper functions in that test file. If helper names differ, create wrappers named exactly `createPendingInvitation` and `completeGoogleInvite` in the test file so the test reads like the rule.

- [x] **Step 6: Run focused auth and invitation tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.application.GoogleLoginServiceTest \
  --tests com.readmates.auth.api.InvitationControllerDbTest \
  --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberTest
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt \
  server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt \
  server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt \
  server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/DevGoogleOAuthAutoMemberTest.kt
git commit -m "feat(auth): make direct google login read-only viewer"
```

## Task 4: Host Viewer Activation Workflow

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/features/host/components/host-members.tsx`
- Test: `server/src/test/kotlin/com/readmates/auth/api/HostMemberApprovalControllerTest.kt`
- Test: `front/tests/unit/host-members.test.tsx`

- [x] **Step 1: Update backend tests**

In `HostMemberApprovalControllerTest.kt`, update pending terminology to viewer:

```kotlin
@Test
fun `host lists viewer members`() {
    val hostCookie = sessionCookieForEmail("host@example.com")
    val viewerEmail = uniqueEmail("viewer.list")
    insertViewerMember(viewerEmail, "Viewer List")

    mockMvc.get("/api/host/members/viewers") {
        cookie(hostCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].email") { value(viewerEmail) }
        jsonPath("$[0].status") { value("VIEWER") }
    }
}
```

Add activation test:

```kotlin
@Test
fun `host activates viewer member and adds them to current session`() {
    val hostCookie = sessionCookieForEmail("host@example.com")
    val sessionId = createOpenSession()
    val membershipId = insertViewerMember(uniqueEmail("viewer.activate"), "Viewer Activate")

    mockMvc.post("/api/host/members/$membershipId/activate") {
        cookie(hostCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.status") { value("ACTIVE") }
    }

    val membership = jdbcTemplate.queryForMap(
        """
        select status, joined_at
        from memberships
        where id = ?
        """.trimIndent(),
        membershipId,
    )
    assertEquals("ACTIVE", membership["status"])
    assertNotNull(membership["joined_at"])

    val participant = jdbcTemplate.queryForMap(
        """
        select rsvp_status, attendance_status, participation_status
        from session_participants
        where session_id = ?
          and membership_id = ?
        """.trimIndent(),
        sessionId,
        membershipId,
    )
    assertEquals("NO_RESPONSE", participant["rsvp_status"])
    assertEquals("UNKNOWN", participant["attendance_status"])
    assertEquals("ACTIVE", participant["participation_status"])
}
```

Rename helper:

```kotlin
private fun insertViewerMember(email: String, name: String): String
```

and insert:

```sql
values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'VIEWER', null)
```

- [x] **Step 2: Run backend member approval test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.HostMemberApprovalControllerTest
```

Expected: FAIL until endpoints and service methods are added.

- [x] **Step 3: Update service names and logic**

In `MemberApprovalService.kt`, rename `PendingApprovalMemberResponse` to `ViewerMemberResponse` and use this data class:

```kotlin
data class ViewerMemberResponse(
    val membershipId: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val status: MembershipStatus,
    val createdAt: String,
)
```

Replace the list query status filter:

```sql
and memberships.status = 'VIEWER'
```

Rename `approve` to `activateViewer` and use this update:

```sql
update memberships
set status = 'ACTIVE',
    joined_at = utc_timestamp(6),
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and role = 'MEMBER'
  and status = 'VIEWER'
```

Rename `reject` to `deactivateViewer` and use this update:

```sql
update memberships
set status = 'INACTIVE',
    updated_at = utc_timestamp(6)
where id = ?
  and club_id = ?
  and role = 'MEMBER'
  and status = 'VIEWER'
```

Keep `addToCurrentOpenSession` unchanged except ensure the insert includes `participation_status`:

```sql
insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
select ?, sessions.club_id, sessions.id, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE'
```

- [x] **Step 4: Add new controller routes and compatibility aliases**

In `HostMemberApprovalController.kt`, replace pending methods with:

```kotlin
@GetMapping("/viewers")
fun viewers(authentication: Authentication?) =
    memberApprovalService.listViewers(requireHost(authentication))

@GetMapping("/pending-approvals")
fun pending(authentication: Authentication?) =
    memberApprovalService.listViewers(requireHost(authentication))

@PostMapping("/{membershipId}/activate")
fun activate(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberApprovalService.activateViewer(requireHost(authentication), membershipId)

@PostMapping("/{membershipId}/approve")
fun approve(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberApprovalService.activateViewer(requireHost(authentication), membershipId)

@PostMapping("/{membershipId}/deactivate-viewer")
fun deactivateViewer(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberApprovalService.deactivateViewer(requireHost(authentication), membershipId)

@PostMapping("/{membershipId}/reject")
fun reject(
    authentication: Authentication?,
    @PathVariable membershipId: UUID,
) = memberApprovalService.deactivateViewer(requireHost(authentication), membershipId)
```

- [x] **Step 5: Update lifecycle list ordering**

In `MemberLifecycleService.kt`, change status ordering SQL:

```sql
case status
  when 'ACTIVE' then 0
  when 'VIEWER' then 1
  when 'SUSPENDED' then 2
  when 'LEFT' then 3
  when 'INACTIVE' then 4
  else 5
end
```

Set capability booleans so viewers cannot be suspended or added to a current session until activated:

```kotlin
canSuspend = isMutableMember && status == MembershipStatus.ACTIVE,
canRestore = isMutableMember && status == MembershipStatus.SUSPENDED,
canDeactivate = isMutableMember && status in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.VIEWER),
canAddToCurrentSession = isMutableMember &&
    status == MembershipStatus.ACTIVE &&
    participationStatus != SessionParticipationStatus.ACTIVE,
canRemoveFromCurrentSession = isMutableMember &&
    status == MembershipStatus.ACTIVE &&
    participationStatus == SessionParticipationStatus.ACTIVE,
```

- [x] **Step 6: Update frontend API types**

In `front/shared/api/readmates.ts`, replace membership and approval types:

```ts
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
```

Rename `PendingApprovalMember` to `ViewerMember`:

```ts
export type ViewerMember = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
  status: MembershipStatus;
  createdAt: string;
};
```

- [x] **Step 7: Update host members UI**

In `front/features/host/components/host-members.tsx`, update labels:

```ts
const statusLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기 멤버",
  ACTIVE: "정식 멤버",
  SUSPENDED: "정지됨",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};
```

Fetch viewer members from:

```ts
readmatesFetch<ViewerMember[]>("/api/host/members/viewers")
```

Submit activation through:

```ts
await readmatesFetch<ViewerMember>(`/api/host/members/${member.membershipId}/activate`, {
  method: "POST",
});
```

Use button text:

```tsx
정식 멤버로 전환
```

Use deactivation text:

```tsx
둘러보기 해제
```

- [x] **Step 8: Run focused tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.HostMemberApprovalControllerTest
pnpm --dir front vitest run tests/unit/host-members.test.tsx
```

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt \
  server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt \
  server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt \
  server/src/test/kotlin/com/readmates/auth/api/HostMemberApprovalControllerTest.kt \
  front/shared/api/readmates.ts \
  front/features/host/components/host-members.tsx \
  front/tests/unit/host-members.test.tsx
git commit -m "feat(host): activate viewer members"
```

## Task 5: Viewer Read-Only Session And Archive Access

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt`

- [x] **Step 1: Add viewer archive tests**

In `ArchiveAndNotesDbTest.kt`, add:

```kotlin
@Test
fun `viewer can list non draft sessions but cannot read feedback document`() {
    val cookie = viewerSessionCookie("viewer.archive.${UUID.randomUUID()}@example.com")

    mockMvc.get("/api/archive/sessions") {
        cookie(cookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].sessionNumber") { value(6) }
        jsonPath("$[0].state") { value("PUBLISHED") }
    }

    mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
        cookie(cookie)
    }.andExpect {
        status { isForbidden() }
    }
}
```

Add a helper in the same test file:

```kotlin
private fun viewerSessionCookie(email: String): Cookie {
    val userId = UUID.randomUUID().toString()
    val membershipId = UUID.randomUUID().toString()
    jdbcTemplate.update(
        """
        insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
        values (?, ?, ?, 'Viewer Archive', 'Viewer', null, 'GOOGLE')
        """.trimIndent(),
        userId,
        "google-viewer-archive-$userId",
        email,
    )
    jdbcTemplate.update(
        """
        insert into memberships (id, club_id, user_id, role, status, joined_at)
        values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'VIEWER', null)
        """.trimIndent(),
        membershipId,
        userId,
    )
    val issuedSession = authSessionService.issueSession(
        userId = userId,
        userAgent = "ArchiveAndNotesDbTest",
        ipAddress = "127.0.0.1",
    )
    return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
}
```

Ensure the test class has `AuthSessionService` injected if it does not already.

- [x] **Step 2: Run archive test and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveAndNotesDbTest
```

Expected: FAIL because `ArchiveSessionItem` does not yet expose `state`, and archive current-member resolution may still use active-only lookup.

Result: The pre-change focused archive suite passed because it did not yet contain the viewer archive assertion. The expected-failure checkpoint was not captured before the implementation patch was applied.

- [x] **Step 3: Add session state to archive API**

In `ArchiveController.kt`, update `ArchiveSessionItem`:

```kotlin
data class ArchiveSessionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val attendance: Int,
    val total: Int,
    val published: Boolean,
    val state: String,
)
```

Update `MemberArchiveSessionDetailResponse` with:

```kotlin
val state: String,
```

- [x] **Step 4: Resolve browse-capable members**

In `ArchiveController.kt`, replace `currentMember` with:

```kotlin
private fun currentMember(authentication: Authentication?): CurrentMember {
    val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    val member = memberAccountRepository.findActiveMemberByEmail(email)
        ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    if (!member.canBrowseMemberContent) {
        throw ResponseStatusException(HttpStatus.FORBIDDEN, "Member app access required")
    }
    return member
}
```

The method name `findActiveMemberByEmail` remains for now, but Task 3 made it return `VIEWER`, `ACTIVE`, and `SUSPENDED`. Rename it in a later cleanup if desired.

- [x] **Step 5: Update archive repository signatures**

In `ArchiveRepository.kt`, change:

```kotlin
fun findArchiveSessions(clubId: UUID): List<ArchiveSessionItem> =
    archiveSessionQueryRepository.findArchiveSessions(clubId)
```

to:

```kotlin
fun findArchiveSessions(currentMember: CurrentMember): List<ArchiveSessionItem> =
    archiveSessionQueryRepository.findArchiveSessions(currentMember)
```

In `ArchiveController.sessions`, call:

```kotlin
return archiveRepository.findArchiveSessions(currentMember(authentication))
```

- [x] **Step 6: Update archive SQL**

In `ArchiveSessionQueryRepository.kt`, replace `findArchiveSessions(clubId: UUID)` with:

```kotlin
fun findArchiveSessions(currentMember: CurrentMember): List<ArchiveSessionItem> {
    val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList()

    return jdbcTemplate.query(
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
          sum(case when session_participants.attendance_status = 'ATTENDED' then 1 else 0 end) as attendance,
          count(session_participants.id) as total,
          coalesce(public_session_publications.is_public, false) as published
        from sessions
        left join session_participants on session_participants.session_id = sessions.id
          and session_participants.club_id = sessions.club_id
        left join public_session_publications on public_session_publications.session_id = sessions.id
          and public_session_publications.club_id = sessions.club_id
        where sessions.club_id = ?
          and sessions.state in ('OPEN', 'CLOSED', 'PUBLISHED')
        group by
          sessions.id,
          sessions.number,
          sessions.title,
          sessions.book_title,
          sessions.book_author,
          sessions.book_image_url,
          sessions.session_date,
          sessions.state,
          public_session_publications.is_public
        order by sessions.number desc
        """.trimIndent(),
        { resultSet, _ -> resultSet.toArchiveSessionItem() },
        currentMember.clubId.dbString(),
    )
}
```

Add `sessions.state` to detail select and response mapping:

```kotlin
state = resultSet.getString("state"),
```

Change detail filter:

```sql
and sessions.state in ('OPEN', 'CLOSED', 'PUBLISHED')
```

- [x] **Step 7: Update archive mapper**

In `toArchiveSessionItem`, add:

```kotlin
state = getString("state"),
```

- [x] **Step 8: Keep feedback blocked for viewers**

In `FeedbackDocumentController.kt`, replace:

```kotlin
if (member.isPendingApproval) {
    throw ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback documents require approved membership")
}
```

with:

```kotlin
if (member.isViewer) {
    throw ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback documents require full membership")
}
```

- [x] **Step 9: Run focused tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.auth.api.ViewerSecurityTest
```

Expected: PASS.

- [x] **Step 10: Commit**

```bash
git add server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt \
  server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt \
  server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt \
  server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt
git commit -m "feat(archive): let viewers browse non-draft sessions"
```

## Task 6: Frontend Auth Types And Route Guards

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/src/app/route-guards.tsx`
- Modify: `front/src/app/layouts.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/pages/pending-approval.tsx`
- Test: `front/tests/unit/spa-router.test.tsx`
- Test: `front/tests/unit/auth-context.test.tsx`

- [x] **Step 1: Update frontend type tests**

In `front/tests/unit/auth-context.test.tsx`, update viewer fixture:

```ts
const viewerAuth = {
  authenticated: true,
  userId: "viewer-user",
  membershipId: "viewer-membership",
  clubId: "club-id",
  email: "viewer@example.com",
  displayName: "둘러보기 멤버",
  shortName: "둘러보기",
  role: "MEMBER" as const,
  membershipStatus: "VIEWER" as const,
  approvalState: "VIEWER" as const,
};
```

Add assertion:

```ts
expect(viewerAuth.membershipStatus).toBe("VIEWER");
expect(viewerAuth.approvalState).toBe("VIEWER");
```

- [x] **Step 2: Run frontend auth/router tests and verify failure**

Run:

```bash
pnpm --dir front vitest run tests/unit/auth-context.test.tsx tests/unit/spa-router.test.tsx
```

Expected: FAIL until types and route guards allow viewers.

- [x] **Step 3: Update API types**

In `front/shared/api/readmates.ts`, use:

```ts
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
```

Add `state` to archive models:

```ts
export type ArchiveSessionItem = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  attendance: number;
  total: number;
  published: boolean;
  state: SessionState;
};
```

Add `state: SessionState` to `MemberArchiveSessionDetailResponse` if that type exists lower in the file.

- [x] **Step 4: Update member route guard**

In `front/src/app/route-guards.tsx`, replace `canUseMemberApp` with:

```ts
function canUseMemberApp(auth: AuthMeResponse) {
  return auth.approvalState === "VIEWER" || auth.approvalState === "ACTIVE" || auth.approvalState === "SUSPENDED";
}
```

Remove this redirect:

```ts
if (state.auth.approvalState === "PENDING_APPROVAL") return <Navigate to="/app/pending" replace />;
```

Keep host guard:

```ts
if (state.auth.role !== "HOST" || state.auth.approvalState !== "ACTIVE") return <Navigate to="/app" replace />;
```

- [x] **Step 5: Turn pending page into viewer explainer**

Replace `front/src/pages/pending-approval.tsx` with a redirect-safe page:

```tsx
import { Link } from "@/src/app/router-link";

export default function PendingApprovalPage() {
  return (
    <main className="app-content">
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow">둘러보기 멤버</p>
          <h1 className="h1 editorial">전체 세션은 읽을 수 있고, 참여는 정식 멤버에게 열립니다.</h1>
          <p className="body" style={{ color: "var(--text-2)" }}>
            초대 없이 Google로 로그인한 계정은 둘러보기 멤버로 시작합니다. 호스트가 정식 멤버로 전환하면 RSVP,
            체크인, 질문, 서평 작성이 열립니다.
          </p>
          <div className="row" style={{ marginTop: 24, gap: 10, flexWrap: "wrap" }}>
            <Link to="/app/archive" className="btn btn-primary">
              전체 세션 둘러보기
            </Link>
            <Link to="/app/session/current" className="btn btn-ghost">
              이번 세션 보기
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [x] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir front vitest run tests/unit/auth-context.test.tsx tests/unit/spa-router.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add front/shared/api/readmates.ts \
  front/src/app/route-guards.tsx \
  front/src/app/layouts.tsx \
  front/src/app/router.tsx \
  front/src/pages/pending-approval.tsx \
  front/tests/unit/spa-router.test.tsx \
  front/tests/unit/auth-context.test.tsx
git commit -m "feat(front): allow viewer members into read-only app"
```

## Task 7: Session Identity Component For New, Current, And Past Sessions

**Files:**
- Create: `front/shared/ui/session-identity.tsx`
- Test: `front/tests/unit/session-identity.test.tsx`
- Modify: `front/shared/styles/tokens.css`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/shared/ui/readmates-display.ts`

- [x] **Step 1: Write the unit test**

Create `front/tests/unit/session-identity.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionIdentity } from "@/shared/ui/session-identity";

describe("SessionIdentity", () => {
  it("labels the open current session with d-day", () => {
    vi.setSystemTime(new Date("2026-04-22T00:00:00+09:00"));

    render(
      <SessionIdentity
        sessionNumber={7}
        state="OPEN"
        date="2026-05-13"
        published={false}
        feedbackDocumentAvailable={false}
      />,
    );

    expect(screen.getByText("No.07")).toBeVisible();
    expect(screen.getByText("이번 세션")).toBeVisible();
    expect(screen.getByText("준비 중")).toBeVisible();
    expect(screen.getByText("D-21")).toBeVisible();
  });

  it("labels a published past session with public and feedback states", () => {
    render(
      <SessionIdentity
        sessionNumber={6}
        state="PUBLISHED"
        date="2026-04-15"
        published={true}
        feedbackDocumentAvailable={true}
      />,
    );

    expect(screen.getByText("No.06")).toBeVisible();
    expect(screen.getByText("지난 회차")).toBeVisible();
    expect(screen.getByText("공개됨")).toBeVisible();
    expect(screen.getByText("문서 있음")).toBeVisible();
  });

  it("labels a draft new session", () => {
    render(
      <SessionIdentity
        sessionNumber={8}
        state="DRAFT"
        date="2026-06-10"
        published={false}
        feedbackDocumentAvailable={false}
      />,
    );

    expect(screen.getByText("No.08")).toBeVisible();
    expect(screen.getByText("새 세션 초안")).toBeVisible();
    expect(screen.getByText("비공개")).toBeVisible();
  });
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --dir front vitest run tests/unit/session-identity.test.tsx
```

Expected: FAIL because `SessionIdentity` does not exist.

- [x] **Step 3: Create the component**

Create `front/shared/ui/session-identity.tsx`:

```tsx
import type { SessionState } from "@/shared/api/readmates";

type SessionIdentityProps = {
  sessionNumber: number;
  state: SessionState;
  date: string;
  published: boolean;
  feedbackDocumentAvailable?: boolean;
  compact?: boolean;
};

function padSessionNumber(value: number) {
  return String(value).padStart(2, "0");
}

function ddayLabel(date: string, now = new Date()) {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "D-day";
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

function phaseLabel(state: SessionState) {
  if (state === "DRAFT") return "새 세션 초안";
  if (state === "OPEN") return "이번 세션";
  return "지난 회차";
}

function stateLabel(state: SessionState, published: boolean) {
  if (state === "DRAFT") return "비공개";
  if (state === "OPEN") return "준비 중";
  if (published) return "공개됨";
  return "정리 중";
}

export function SessionIdentity({
  sessionNumber,
  state,
  date,
  published,
  feedbackDocumentAvailable = false,
  compact = false,
}: SessionIdentityProps) {
  const dday = state === "OPEN" ? ddayLabel(date) : null;
  const items = [
    `No.${padSessionNumber(sessionNumber)}`,
    phaseLabel(state),
    stateLabel(state, published),
    dday,
    feedbackDocumentAvailable ? "문서 있음" : null,
  ].filter(Boolean);

  return (
    <div className={compact ? "rm-session-identity rm-session-identity--compact" : "rm-session-identity"}>
      {items.map((item, index) => (
        <span key={String(item)} className={index === 0 ? "rm-session-identity__number" : "rm-session-identity__chip"}>
          {item}
        </span>
      ))}
    </div>
  );
}
```

- [x] **Step 4: Add styles**

Append to `front/shared/styles/tokens.css`:

```css
.rm-session-identity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.rm-session-identity__number,
.rm-session-identity__chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.rm-session-identity__number {
  color: var(--accent);
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.rm-session-identity--compact .rm-session-identity__number,
.rm-session-identity--compact .rm-session-identity__chip {
  min-height: 22px;
  padding: 0 7px;
  font-size: 11px;
}
```

- [x] **Step 5: Run component test**

Run:

```bash
pnpm --dir front vitest run tests/unit/session-identity.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add front/shared/ui/session-identity.tsx \
  front/tests/unit/session-identity.test.tsx \
  front/shared/styles/tokens.css \
  front/shared/styles/mobile.css \
  front/shared/ui/readmates-display.ts
git commit -m "feat(ui): add session identity labels"
```

## Task 8: Viewer Read-Only UI And Locked Actions

**Files:**
- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/member-home/components/member-home-current-session.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/current-session/components/current-session-mobile.tsx`
- Modify: `front/features/current-session/components/current-session-types.ts`
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/archive/components/member-session-detail-page.tsx`
- Modify: `front/features/feedback/components/feedback-document-page.tsx`
- Test: `front/tests/unit/member-home.test.tsx`
- Test: `front/tests/unit/current-session.test.tsx`
- Test: `front/tests/unit/archive-page.test.tsx`
- Test: `front/tests/unit/feedback-document-page.test.tsx`

- [x] **Step 1: Add current-session viewer tests**

In `front/tests/unit/current-session.test.tsx`, add:

```tsx
it("renders viewer members as read-only on current session", async () => {
  render(<CurrentSession auth={viewerAuthFixture} data={currentSessionFixture} />);

  expect(screen.getByText("둘러보기 멤버")).toBeVisible();
  expect(screen.getByText("정식 멤버가 되면 RSVP와 질문 작성이 열립니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "참석" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "체크인 저장" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();
});
```

Add fixture:

```ts
const viewerAuthFixture = {
  ...activeMemberAuthFixture,
  membershipStatus: "VIEWER",
  approvalState: "VIEWER",
};
```

- [x] **Step 2: Run current session test and verify failure**

Run:

```bash
pnpm --dir front vitest run tests/unit/current-session.test.tsx
```

Expected: FAIL because viewer read-only controls are not wired.

- [x] **Step 3: Add shared notices**

In `front/features/current-session/components/current-session-types.ts`, add:

```ts
export const VIEWER_MEMBER_NOTICE = "둘러보기 멤버입니다. 정식 멤버가 되면 RSVP와 질문 작성이 열립니다.";
export const VIEWER_MEMBER_SHORT_NOTICE = "정식 멤버가 되면 참여와 작성이 열립니다.";
```

- [x] **Step 4: Gate desktop current-session writes**

In `current-session.tsx`, define:

```ts
const isViewer = auth?.membershipStatus === "VIEWER";
const canWrite = auth?.membershipStatus === "ACTIVE" && auth?.approvalState === "ACTIVE";
```

Pass `disabled={isViewer || isSuspended}` to RSVP, checkin, question, one-line review, and long review controls. Every disabled control must include a visible explanation near the section:

```tsx
{isViewer ? (
  <p className="small" role="note" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
    정식 멤버가 되면 RSVP와 질문 작성이 열립니다.
  </p>
) : null}
```

For submit handlers, return before calling API:

```ts
if (!canWrite) {
  setError(VIEWER_MEMBER_NOTICE);
  return;
}
```

- [x] **Step 5: Gate mobile current-session writes**

In `current-session-mobile.tsx`, mirror the desktop logic:

```ts
const isViewer = auth?.membershipStatus === "VIEWER";
const canWrite = auth?.membershipStatus === "ACTIVE" && auth?.approvalState === "ACTIVE";
```

Disable mobile segment actions and primary save buttons with:

```tsx
disabled={!canWrite}
aria-disabled={!canWrite}
```

Show:

```tsx
<div className="m-card-quiet" role="note">
  <div className="eyebrow">둘러보기 멤버</div>
  <p className="small" style={{ margin: "6px 0 0" }}>
    전체 세션은 읽을 수 있어요. 참여와 피드백 문서는 정식 멤버에게 열립니다.
  </p>
</div>
```

- [x] **Step 6: Update member home**

In `member-home.tsx`, add a viewer banner near the top of desktop and mobile:

```tsx
{auth.membershipStatus === "VIEWER" ? (
  <section className="surface-quiet" style={{ padding: 18, marginTop: 18 }}>
    <p className="eyebrow" style={{ margin: 0 }}>둘러보기 멤버</p>
    <p className="body" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
      전체 세션은 볼 수 있어요. 정식 멤버가 되면 RSVP, 체크인, 질문 작성이 열립니다.
    </p>
  </section>
) : null}
```

Mobile version uses `m-card-quiet`.

- [x] **Step 7: Update archive cards with session identity**

In `archive-page.tsx`, import and render:

```tsx
import { SessionIdentity } from "@/shared/ui/session-identity";
```

Inside session cards:

```tsx
<SessionIdentity
  sessionNumber={session.number}
  state={session.state}
  date={session.date}
  published={session.published}
  feedbackDocumentAvailable={false}
  compact
/>
```

- [x] **Step 8: Update feedback locked copy**

In `feedback-document-page.tsx`, when status is 403 or locked for viewer, show:

```tsx
title: "피드백 문서는 정식 멤버와 참석자에게만 열립니다.",
body: "둘러보기 멤버는 전체 세션 기록을 읽을 수 있지만, 회차 피드백 문서는 볼 수 없습니다.",
```

- [x] **Step 9: Run focused frontend tests**

Run:

```bash
pnpm --dir front vitest run \
  tests/unit/member-home.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/archive-page.test.tsx \
  tests/unit/feedback-document-page.test.tsx
```

Expected: PASS.

- [x] **Step 10: Commit**

```bash
git add front/features/member-home/components/member-home.tsx \
  front/features/member-home/components/member-home-current-session.tsx \
  front/features/current-session/components/current-session.tsx \
  front/features/current-session/components/current-session-mobile.tsx \
  front/features/current-session/components/current-session-types.ts \
  front/features/archive/components/archive-page.tsx \
  front/features/archive/components/member-session-detail-page.tsx \
  front/features/feedback/components/feedback-document-page.tsx \
  front/tests/unit/member-home.test.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/archive-page.test.tsx \
  front/tests/unit/feedback-document-page.test.tsx
git commit -m "feat(front): show viewer app as read-only"
```

## Task 9: Host And Session Screens Use Clear Session Modes

**Files:**
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/features/archive/components/member-session-detail-page.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Test: `front/tests/unit/host-dashboard.test.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`
- Test: `front/tests/unit/member-session-detail-page.test.tsx`
- Test: `front/tests/unit/responsive-navigation.test.tsx`

- [x] **Step 1: Update host session editor tests**

In `host-session-editor.test.tsx`, add:

```tsx
it("labels new session creation separately from current session editing", () => {
  render(<HostSessionEditor session={null} />);

  expect(screen.getByRole("heading", { name: "새 세션 만들기" })).toBeVisible();
  expect(screen.getByRole("button", { name: "새 세션 만들기" })).toBeVisible();
  expect(screen.queryByText("이번 세션 편집")).not.toBeInTheDocument();
});

it("labels existing open session as current session editing", () => {
  render(<HostSessionEditor session={openHostSessionFixture} />);

  expect(screen.getByRole("heading", { name: "이번 세션 편집" })).toBeVisible();
  expect(screen.getByText("No.07")).toBeVisible();
  expect(screen.getByText("이번 세션")).toBeVisible();
});
```

- [x] **Step 2: Run focused test and verify failure**

Run:

```bash
pnpm --dir front vitest run tests/unit/host-session-editor.test.tsx
```

Expected: FAIL until labels and session identity are wired.

- [x] **Step 3: Update host dashboard**

In `host-dashboard.tsx`, import `SessionIdentity` and render it on the current session card:

```tsx
<SessionIdentity
  sessionNumber={session.sessionNumber}
  state="OPEN"
  date={session.date}
  published={data.publishPending === 0}
  compact
/>
```

Change primary CTA labels:

```tsx
{session ? "이번 세션 편집" : "새 세션 만들기"}
```

Change dashboard headline helper:

```tsx
오늘 처리할 운영 일과 이번 세션 상태를 한눈에 봅니다.
```

- [x] **Step 4: Update host session editor labels**

In `host-session-editor.tsx`, derive:

```ts
const isNewSession = session === null;
const editorTitle = isNewSession ? "새 세션 만들기" : "이번 세션 편집";
const primarySaveLabel = isNewSession ? "새 세션 만들기" : "변경 사항 저장";
```

Use these in heading and submit button.

Render session identity when existing session is present:

```tsx
{session ? (
  <SessionIdentity
    sessionNumber={session.sessionNumber}
    state={session.state}
    date={session.date}
    published={session.publication?.isPublic ?? false}
    feedbackDocumentAvailable={session.feedbackDocument.uploaded}
  />
) : (
  <div className="rm-session-identity">
    <span className="rm-session-identity__chip">새 세션 초안</span>
    <span className="rm-session-identity__chip">비공개</span>
  </div>
)}
```

- [x] **Step 5: Update member session detail labels**

In `member-session-detail-page.tsx`, render `SessionIdentity` near the page title:

```tsx
<SessionIdentity
  sessionNumber={session.sessionNumber}
  state={session.state}
  date={session.date}
  published={Boolean(session.publicSummary)}
  feedbackDocumentAvailable={session.feedbackDocument.available}
  compact
/>
```

- [x] **Step 6: Update mobile navigation labels to task-axis tabs**

Replace the current host tabs `운영 / 세션 편집 / 멤버 초대 / 멤버 승인` with task-axis labels that match the simplified information architecture:

```ts
const hostTabs = [
  { key: "today", label: "오늘", href: "/app/host" },
  { key: "session", label: "세션", href: editHref },
  { key: "members", label: "멤버", href: "/app/host/members" },
  { key: "records", label: "기록", href: "/app/archive" },
];
```

This groups invite and activation under one `멤버` area and keeps host navigation consistent with member navigation: current work, sessions, people, and records.

- [x] **Step 7: Run focused tests**

Run:

```bash
pnpm --dir front vitest run \
  tests/unit/host-dashboard.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/responsive-navigation.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add front/features/host/components/host-dashboard.tsx \
  front/features/host/components/host-session-editor.tsx \
  front/features/archive/components/member-session-detail-page.tsx \
  front/shared/ui/mobile-tab-bar.tsx \
  front/shared/ui/mobile-header.tsx \
  front/tests/unit/host-dashboard.test.tsx \
  front/tests/unit/host-session-editor.test.tsx \
  front/tests/unit/member-session-detail-page.test.tsx \
  front/tests/unit/responsive-navigation.test.tsx
git commit -m "feat(ui): clarify session modes across host and archive"
```

## Task 10: End-To-End Viewer And Invitation Flows

**Files:**
- Modify: `front/tests/e2e/google-auth-pending-approval.spec.ts`
- Modify: `front/tests/e2e/google-auth-invite-flow.spec.ts`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`

- [x] **Step 1: Rename pending E2E to viewer E2E**

Move:

```text
front/tests/e2e/google-auth-pending-approval.spec.ts
```

to:

```text
front/tests/e2e/google-auth-viewer.spec.ts
```

- [x] **Step 2: Update viewer E2E test**

Use this flow:

```ts
test("uninvited google login becomes read-only viewer who can browse sessions", async ({ page }) => {
  const viewerEmail = `viewer.${Date.now()}@example.com`;
  await loginWithGoogleFixture(page, viewerEmail);

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("둘러보기 멤버")).toBeVisible();

  await page.goto("/app/archive");
  await expect(page.getByRole("heading", { name: "읽어 온 자리" })).toBeVisible();
  await expect(page.getByText("No.06")).toBeVisible();

  await page.goto("/app/session/current");
  await expect(page.getByText("정식 멤버가 되면 RSVP와 질문 작성이 열립니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "참석" })).toBeDisabled();

  await page.goto("/app/feedback/00000000-0000-0000-0000-000000000301");
  await expect(page.getByText("피드백 문서는 정식 멤버와 참석자에게만 열립니다.")).toBeVisible();
});
```

- [x] **Step 3: Update invitation E2E**

In `google-auth-invite-flow.spec.ts`, assert invite acceptance creates full member:

```ts
await loginWithGoogleFixture(page, invitedEmail, { inviteToken });
await page.goto("/app/session/current");
await expect(page.getByRole("button", { name: "참석" })).toBeEnabled();
await expect(page.getByText("둘러보기 멤버")).toHaveCount(0);
```

- [x] **Step 4: Update host activation E2E**

Add to `public-auth-member-host.spec.ts` and keep the test backed by an explicit `OPEN` current session:

```ts
test("host activates viewer into full member", async ({ page }) => {
  const viewerEmail = `viewer.activate.${Date.now()}@example.com`;
  await loginWithGoogleFixture(page, viewerEmail);
  await page.evaluate(async () => {
    await fetch("/api/bff/api/auth/logout", { method: "POST" });
  });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/host/members");
  await expect(page.getByText(viewerEmail)).toBeVisible();
  await page.getByRole("button", { name: "정식 멤버로 전환" }).click();
  await expect(page.getByText("정식 멤버")).toBeVisible();

  await loginWithGoogleFixture(page, viewerEmail);
  await page.goto("/app/session/current");
  await expect(page.getByRole("button", { name: "참석" })).toBeEnabled();
});
```

- [x] **Step 5: Run E2E subset**

Run:

```bash
pnpm --dir front exec playwright test \
  tests/e2e/google-auth-viewer.spec.ts \
  tests/e2e/google-auth-invite-flow.spec.ts \
  tests/e2e/public-auth-member-host.spec.ts \
  --project=chromium
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add front/tests/e2e/google-auth-viewer.spec.ts \
  front/tests/e2e/google-auth-invite-flow.spec.ts \
  front/tests/e2e/public-auth-member-host.spec.ts \
  front/tests/e2e/dev-login-session-flow.spec.ts \
  front/tests/e2e/readmates-e2e-db.ts
git rm front/tests/e2e/google-auth-pending-approval.spec.ts
git commit -m "test(e2e): cover viewer and invite membership flows"
```

## Task 11: Documentation And Product Copy

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-22-readmates-language-ux-data-consistency-design.md`
- Modify: `front/features/auth/components/login-card.tsx`
- Modify: `front/features/auth/components/invite-acceptance-card.tsx`
- Modify: `front/features/public/components/public-session.tsx`
- Modify: `front/features/public/components/public-home.tsx`
- Test: `front/tests/unit/login-card.test.tsx`
- Test: `front/tests/unit/invite-acceptance-card.test.tsx`

- [x] **Step 1: Update login copy tests**

In `login-card.test.tsx`, assert:

```tsx
expect(screen.getByText("기존 멤버 로그인")).toBeVisible();
expect(screen.getByText("초대 없이 로그인하면 둘러보기 멤버로 시작합니다.")).toBeVisible();
```

- [x] **Step 2: Update login and invite copy**

In `login-card.tsx`, use:

```tsx
<p className="eyebrow">기존 멤버 로그인</p>
<h1 className="h1 editorial">Google로 읽는사이에 들어가기</h1>
<p className="body" style={{ color: "var(--text-2)" }}>
  초대 없이 로그인하면 둘러보기 멤버로 시작합니다. 초대 링크를 받았다면 링크에서 수락하면 바로 정식 멤버가 됩니다.
</p>
```

In `invite-acceptance-card.tsx`, use:

```tsx
Google로 초대 수락하면 바로 정식 멤버가 됩니다.
```

- [x] **Step 3: Update public copy**

In public pages, avoid open-signup language. Use:

```tsx
읽는사이는 초대 기반 모임입니다. 공개 기록은 누구나 읽을 수 있고, 정식 멤버 참여는 초대 링크 또는 호스트 전환으로 열립니다.
```

- [x] **Step 4: Update README membership section**

Replace the current approval wording with:

```markdown
## 멤버십 접근 단계

- 게스트: 로그인 없이 공개 홈, 공개 소개, 공개 기록만 볼 수 있습니다.
- 둘러보기 멤버: 초대 없이 Google로 로그인한 계정입니다. 전체 비공개 세션 기록과 이번 세션 현황은 읽을 수 있지만, RSVP, 체크인, 질문, 서평 작성과 피드백 문서 열람은 제한됩니다.
- 정식 멤버: 초대 링크를 수락했거나 호스트가 둘러보기 멤버를 전환한 계정입니다. 현재 세션 참여와 작성 기능을 사용할 수 있고, 참석한 회차의 피드백 문서를 읽을 수 있습니다.
- 호스트: 정식 멤버 권한에 운영 권한이 추가된 계정입니다. 세션, 초대, 멤버 상태, 출석, 공개 기록, 피드백 문서를 관리합니다.
```

- [x] **Step 5: Run docs/copy tests**

Run:

```bash
pnpm --dir front vitest run tests/unit/login-card.test.tsx tests/unit/invite-acceptance-card.test.tsx
```

Expected: PASS.

Result: PASS with `pnpm --dir=front vitest run tests/unit/login-card.test.tsx tests/unit/invite-acceptance-card.test.tsx`. The space-separated `pnpm --dir front ...` form failed locally because pnpm parsed `front` as the command.

- [x] **Step 6: Commit**

```bash
git add README.md \
  docs/superpowers/specs/2026-04-22-readmates-language-ux-data-consistency-design.md \
  front/features/auth/components/login-card.tsx \
  front/features/auth/components/invite-acceptance-card.tsx \
  front/features/public/components/public-session.tsx \
  front/features/public/components/public-home.tsx \
  front/tests/unit/login-card.test.tsx \
  front/tests/unit/invite-acceptance-card.test.tsx
git commit -m "docs: document viewer and full member access"
```

## Task 12: Full Verification

**Files:**
- No planned source edits.

- [x] **Step 1: Run backend full tests**

Run:

```bash
./server/gradlew -p server test
```

Expected: PASS.

Result: PASS.

- [x] **Step 2: Run frontend unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

Result: PASS with `pnpm --dir=front test`. The plan's `pnpm --dir front test` form was not used because this workspace's pnpm 10 parses the space-separated form as command `front`.

- [x] **Step 3: Run TypeScript**

Run:

```bash
pnpm --dir front exec tsc --noEmit
```

Expected: PASS.

Result: PASS with `pnpm --dir=front exec tsc --noEmit`.

- [x] **Step 4: Run lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS. Existing warnings are acceptable only if they existed before this plan started and are recorded in the final report.

Result: PASS with no warnings.

- [x] **Step 5: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS. Existing Vite chunk-size warnings are acceptable if the build exits 0.

Result: PASS. Vite emitted no chunk-size warning.

- [x] **Step 6: Run E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

Result: PASS after updating two stale E2E selectors from `변경 사항 저장` to the intended new-session label `새 세션 만들기`.

- [x] **Step 7: Run visual smoke for desktop and mobile**

Start the app through Playwright or local dev servers, then capture:

```bash
mkdir -p output/viewer-member-access-smoke
```

Use Playwright at `390x844` and `1440x1000` for:

- `/`
- `/app` as viewer
- `/app/session/current` as viewer
- `/app/archive` as viewer
- `/app/host/members` as host
- `/app/host/sessions/new` as host

Expected:

- Viewer sees `둘러보기 멤버`.
- Viewer can open archive and current session.
- Viewer cannot submit RSVP, checkin, questions, reviews.
- Viewer feedback route shows locked feedback copy.
- Host member screen shows viewer and activation action.
- New session screen says `새 세션 만들기`.
- Current host session screen says `이번 세션 편집`.

Result: PASS. Screenshots saved:

- `output/viewer-member-access-smoke/desktop-public-home.png`
- `output/viewer-member-access-smoke/desktop-viewer-app.png`
- `output/viewer-member-access-smoke/desktop-viewer-current-session.png`
- `output/viewer-member-access-smoke/desktop-viewer-archive.png`
- `output/viewer-member-access-smoke/desktop-viewer-feedback-locked.png`
- `output/viewer-member-access-smoke/desktop-host-members-viewers.png`
- `output/viewer-member-access-smoke/desktop-host-session-new.png`
- `output/viewer-member-access-smoke/desktop-host-current-session-edit.png`
- `output/viewer-member-access-smoke/mobile-public-home.png`
- `output/viewer-member-access-smoke/mobile-viewer-app.png`
- `output/viewer-member-access-smoke/mobile-viewer-current-session.png`
- `output/viewer-member-access-smoke/mobile-viewer-archive.png`
- `output/viewer-member-access-smoke/mobile-viewer-feedback-locked.png`
- `output/viewer-member-access-smoke/mobile-host-members-viewers.png`
- `output/viewer-member-access-smoke/mobile-host-session-new.png`
- `output/viewer-member-access-smoke/mobile-host-current-session-edit.png`

- [x] **Step 8: Check diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` shows only intentional changes or a clean tree after commits.

Result: `git diff --check` PASS. `git status --short` still shows pre-existing staged docs/spec deletions and the pre-existing unstaged `.gitignore` modification. It also shows the intentional E2E selector updates needed for the full E2E suite to match the new-session label. The Task 11 target spec `docs/superpowers/specs/2026-04-22-readmates-language-ux-data-consistency-design.md` exists and is not staged deleted.

## Self-Review

Spec coverage:

- Guest-only public access: covered by Product Rules and Task 11 public copy.
- Uninvited Google login becomes browse-only member: covered by Tasks 2, 3, 6, 8, and 10.
- Browse-only member can read sessions except feedback: covered by Tasks 5, 8, and 10.
- Browse-only member cannot edit/write: covered by Tasks 2, 5, 8, and 10.
- Host can convert browse-only member to full member: covered by Task 4 and Task 10.
- Invitation-link user becomes full member immediately: covered by Task 3 and Task 10.
- New/current/past sessions are easy to distinguish: covered by Tasks 7, 8, and 9.

Placeholder scan:

- This plan uses explicit file paths, endpoint names, commands, and expected outcomes.
- No task depends on an unnamed future component.

Type consistency:

- Backend status value: `VIEWER`.
- Frontend status value: `VIEWER`.
- Existing response field name `approvalState` remains, with value `VIEWER`, to limit API churn in this work.
- Full member remains `ACTIVE`.
- Host remains `role=HOST` plus `membershipStatus=ACTIVE`.
