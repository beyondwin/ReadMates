# ReadMates Member Profile And Permission Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not implement from the original workspace; create the dedicated integration worktree in Task 0 first.

**Goal:** Let members edit their own `shortName`, let hosts edit same-club member `shortName`, and standardize frontend/server permission checks for member, host, feedback, and write surfaces.

**Architecture:** Keep the current single-club product model and `users.short_name` storage. Add profile mutation use cases inside the existing `auth` clean-architecture slice, enforce all target lookups through `CurrentMember.clubId`, and keep final authorization on the Spring API while frontend route guards provide user-facing blocked states. Preserve future multi-club compatibility by naming code around current-club membership context, not global user identity.

**Tech Stack:** Kotlin/Spring Boot, Spring MVC, JDBC, MySQL/Flyway, React/Vite, React Router 7, Cloudflare Pages Functions BFF, Vitest, Playwright.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-04-24-readmates-member-profile-permissions-design.md`
- Repository router: `AGENTS.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Documentation guide: `docs/agents/docs.md`
- Architecture guide: `docs/development/architecture.md`

## Current Code Reality

- Server auth/member state already centers on `CurrentMember` in `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`; it has `isHost`, `isActive`, `isViewer`, and `canBrowseMemberContent`.
- `CurrentMember` is resolved from `users`, `memberships`, and `clubs` through `auth` persistence adapters. Current operational API resolution returns `ACTIVE`, `SUSPENDED`, and `VIEWER` memberships.
- `/api/auth/me` is implemented by `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt` and returns `AuthMemberResponse`.
- `/api/app/me` is implemented by `server/src/main/kotlin/com/readmates/archive/adapter/in/web/MyPageController.kt`; it reads `CurrentMember.shortName`.
- Host member list and lifecycle APIs are under `server/src/main/kotlin/com/readmates/auth/adapter/in/web/HostMemberApprovalController.kt`; host list rows already include `shortName`.
- Host member persistence is under `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberLifecycleStoreAdapter.kt` and scopes list/mutation queries by `memberships.club_id`.
- Frontend auth contracts exist in both `front/shared/auth/auth-contracts.ts` and `front/features/auth/api/auth-contracts.ts`; keep them aligned until the duplication is removed by a separate cleanup.
- Frontend permission helper is currently `front/shared/auth/member-app-access.ts`; it only exposes `canUseMemberApp`.
- `/app/me` is under `front/features/archive/route/my-page-*`, `front/features/archive/api/archive-*`, and `front/features/archive/ui/my-page.tsx`.
- `/app/host/members` is under `front/features/host/route/host-members-*`, `front/features/host/api/host-*`, and `front/features/host/components/host-members.tsx`.
- There is no new DB migration required because `users.short_name` already exists and is non-null in MySQL migration tests.

## Repo Instruction Reconciliation

- No direct conflict was found between the design spec and repo-local instructions.
- The design asks for server API/permission/storage, route guard/auth helper, `/app/me` UI, and `/app/host/members` UI work. Follow `docs/agents/server.md`, `docs/agents/front.md`, and `docs/agents/design.md` for implementation. This plan document itself follows `docs/agents/docs.md`.
- Keep `users.short_name` for this implementation. Do not add `membership_profiles`, club switchers, multi-club membership lists, profile image upload, audit logs, or status-change reasons.
- Treat `LEFT` and `INACTIVE` as blocked member-app states in frontend helpers and server API guards. If a future auth-state response carries these statuses, the route guard must show a blocked state instead of member data.
- Do not broaden operational `CurrentMember` API resolution in a way that lets `LEFT` or `INACTIVE` reach protected data endpoints unless each touched API has explicit blocking coverage.

## Model Routing Policy

- Use `gpt-5.5` with reasoning effort `high` for every implementation task, review task, root-cause analysis, result interpretation, verification-result interpretation, fix-direction decision, code-quality judgment, architecture decision, data-flow decision, state-management decision, auth decision, persistence decision, migration decision, shared-module decision, and complex UI behavior decision.
- Do not route tasks or support work to any other model unless the user explicitly requests a model-specific exception in the execution session.
- Each task must use a fresh subagent for implementation and separate fresh subagents for spec compliance review and code quality review, all using `gpt-5.5` + `high`.
- The integration owner must remain responsible for merging task output, resolving conflicts, running verification, and deciding whether review feedback is actionable.

## Integration Worktree And Git Guardrails

- [ ] From the original repo, create a dedicated integration worktree on a new `codex/...` branch before implementation:

```bash
git fetch origin
git worktree add ../ReadMates-member-profile-permissions -b codex/readmates-member-profile-permissions origin/main
cd ../ReadMates-member-profile-permissions
```

- [ ] If `origin/main` is not the intended base in the execution session, stop and ask the user which base branch to use.
- [ ] Do all implementation, review fixes, verification, commits, and PR work from the integration worktree only.
- [ ] Do not edit the original workspace. Use it only as a read-only reference if necessary.
- [ ] At the start of each task and before each commit, run:

```bash
git status --short --untracked-files=all
```

- [ ] Preserve unrelated dirty changes. If a required file is dirty before the task starts, inspect it with:

```bash
git diff -- <path>
```

- [ ] Work with those changes without reverting them. Stop only if unrelated edits make the task impossible to complete safely.
- [ ] Commit only the files owned by the task. Do not batch unrelated tasks into one commit.

## Session Resource Tracking Rules

Maintain a session-owned resource ledger in the execution session notes. Record every Node, Vite, Gradle continuous process, dev server, Playwright browser, browser-use session, and long-running exec session started by the session.

| Owner | Command | PID or session id | Port | Start time | Stop condition |
| --- | --- | --- | --- | --- | --- |
| integration owner | example: `pnpm --dir front dev --host 127.0.0.1 --port 5173` | record actual PID/session id | `5173` | record time | stop only this PID/session |

Rules:

- [ ] Before starting a dev server, check whether the intended port is already in use and choose a different port if needed.
- [ ] Record the owner, command, PID or exec session id, and port immediately after startup.
- [ ] Clean up only resources proven to be session-owned.
- [ ] Do not run broad cleanup commands such as `killall node`, `pkill node`, `killall chrome`, `pkill playwright`, or equivalents.
- [ ] Before final handoff, stop only the recorded session-owned resources and leave pre-existing resources untouched.

## Compact Checkpoint Rules

- [ ] Leave a compact-ready checkpoint at every task boundary with: branch, commit hash, task status, changed files, verification run, resource ledger, review status, and next task.
- [ ] Only compact at a task boundary after implementation, both reviews, fixes, re-review, and validation are complete.
- [ ] Do not compact in the middle of implementation, during review, during debugging, while a verification command is failing, or while a resource cleanup decision is pending.

## File Map

### Server API, Permission, And Storage

- Create `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`: HTTP adapter for `PATCH /api/me/profile` and `PATCH /api/host/members/{membershipId}/profile`.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileWebDtos.kt`: request, response, and structured error DTOs.
- Create `server/src/main/kotlin/com/readmates/auth/application/model/MemberProfileCommands.kt`: current-club profile command/result models and validation error code enum.
- Create `server/src/main/kotlin/com/readmates/auth/application/port/in/MemberProfileUseCases.kt`: `UpdateOwnProfileUseCase` and `UpdateHostMemberProfileUseCase`.
- Create `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStorePort.kt`: storage contract for own-profile lookup by authenticated email, host target lookup, duplicate lookup, and `users.short_name` update.
- Create `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`: validation, own-profile status authorization, host authorization, same-club checks, duplicate checks, and transaction boundary.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt`: JDBC implementation scoped by `clubId`.
- Create `server/src/main/kotlin/com/readmates/auth/application/HostMemberListItemMapper.kt`: package-level mapper for `HostMemberListRow.toHostMemberListItem(currentMembershipId)` reused by lifecycle and profile services.
- Modify `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`: replace the private host member list mapper with the shared mapper.
- Modify `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`: add `canEditOwnProfile` with true for `VIEWER`, `ACTIVE`, and `SUSPENDED`; preserve existing helper behavior.
- Test `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`: own profile, host profile, validation, duplicate, same-club, and status coverage.
- Test existing `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`: updated `shortName` appears in `/api/auth/me` after mutation.
- Test existing `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`: `LEFT` member general display remains `탈퇴한 멤버`.

### Frontend Route Guard And Auth Helper

- Modify `front/shared/auth/member-app-access.ts`: expose `canReadMemberContent`, `canWriteMemberActivity`, `canUseHostApp`, `canEditOwnProfile`, and keep `canUseMemberApp` as a compatibility alias.
- Modify `front/src/app/route-guards.tsx`: use the shared helpers and show clear blocked copy for authenticated but disallowed app states.
- Modify `front/src/app/auth-state.ts` and `front/src/app/auth-context.tsx`: add a `refreshAuth` action so successful profile edits can refresh `shortName` in navigation and app chrome.
- Modify `front/shared/auth/auth-contracts.ts` and `front/features/auth/api/auth-contracts.ts`: keep permission-related types aligned.
- Test `front/tests/unit/auth-context.test.tsx`, `front/tests/unit/spa-router.test.tsx`, and new focused helper tests in `front/tests/unit/member-app-access.test.ts`.

### `/app/me` UI And API Client

- Modify `front/features/archive/api/archive-contracts.ts`: add `UpdateMemberProfileRequest`, `MemberProfileResponse`, and profile error code type.
- Modify `front/features/archive/api/archive-api.ts`: add `updateMyProfile(shortName)` using `PATCH /api/me/profile` via `readmatesFetchResponse`.
- Modify `front/features/archive/route/my-page-route.tsx`: wire profile update and `refreshAuth`, then revalidate route data after success.
- Modify `front/features/archive/ui/my-page.tsx`: replace read-only display-name setting with editable `shortName` control for desktop and mobile.
- Modify `front/features/archive/model/archive-model.ts`: add pure helpers for profile form state and validation/error messages only if UI code would otherwise duplicate logic.
- Test `front/tests/unit/my-page.test.tsx`: success, validation error, network error, pending state, and auth refresh callback.

### `/app/host/members` UI And API Client

- Modify `front/features/host/api/host-contracts.ts`: add `UpdateHostMemberProfileRequest`, host profile error code type, and response type alias to `HostMemberListItem`.
- Modify `front/features/host/api/host-api.ts`: add `submitHostMemberProfile(membershipId, shortName)` using `PATCH /api/host/members/{membershipId}/profile`.
- Modify `front/features/host/route/host-members-data.ts`: add the profile action to `hostMembersActions`.
- Modify `front/features/host/components/host-members.tsx`: add row-level edit action/dialog, reuse row pending state, block lifecycle actions while profile save is pending, and update the row from the returned `HostMemberListItem`.
- Test `front/tests/unit/host-members.test.tsx`: edit success, validation error, permission/not-found copy, pending-state interaction with lifecycle buttons, and duplicate-submit prevention.

### End-To-End And Public-Safety Verification

- Create `front/tests/e2e/member-profile-permissions.spec.ts` for focused profile and permission flows.
- Include E2E because this work touches auth/route guards, member profile BFF calls, and host member user flows.
- Do not add real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, or token-shaped examples.

---

## Task 0: Integration Setup And Baseline

**Files:**
- No product files.
- Update this plan's checkboxes only if the execution session tracks plan progress in git.

- [ ] **Implement: create and enter the integration worktree**

Run the commands in "Integration Worktree And Git Guardrails". Confirm the branch is `codex/readmates-member-profile-permissions`.

- [ ] **Implement: record baseline status**

Run:

```bash
git status --short --branch --untracked-files=all
```

Expected: clean task worktree on `codex/readmates-member-profile-permissions`.

- [ ] **Implement: inspect toolchain availability**

Run:

```bash
pnpm --dir front --version
./server/gradlew -p server --version
```

Expected: both commands complete without changing tracked files.

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer to confirm Task 0 uses a dedicated worktree, protects unrelated changes, and records resource cleanup rules.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer to confirm no product files were changed and no long-running resources were left untracked.

- [ ] **Apply fixes and re-review**

If review finds a setup issue, fix the worktree/resource ledger state and rerun the affected review. Do not proceed with a dirty or ambiguous setup.

- [ ] **Validate**

Run:

```bash
git status --short --untracked-files=all
```

Expected: clean, or only the plan checkbox file is modified if the execution session intentionally tracks progress.

- [ ] **Task boundary checkpoint**

Record branch, current commit, resource ledger, verification output, and "Next: Task 1".

## Task 1: Server Profile API, Permission, And Storage

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/MemberProfileWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/model/MemberProfileCommands.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/MemberProfileUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/HostMemberListItemMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/service/MemberProfileService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`

- [ ] **Implement: write failing server API tests first**

Cover these cases in `MemberProfileControllerTest`:

1. `PATCH /api/me/profile` trims and updates `shortName` for `VIEWER`, `ACTIVE`, and `SUSPENDED`.
2. `PATCH /api/me/profile` rejects `LEFT` and `INACTIVE` with `403` and code `MEMBERSHIP_NOT_ALLOWED` if the request reaches the endpoint.
3. `PATCH /api/host/members/{membershipId}/profile` lets an `ACTIVE + HOST` update a same-club `VIEWER`, `ACTIVE`, `SUSPENDED`, `LEFT`, or `INACTIVE` target.
4. A non-host caller receives `403` and code `HOST_ROLE_REQUIRED` from the host profile endpoint.
5. A different-club target receives `404` and code `MEMBER_NOT_FOUND`.
6. Empty, over-20-character, control-character, email-shaped, URL-shaped, and reserved-name values receive the exact design error codes.
7. Same-club duplicate `shortName` receives `409` and code `SHORT_NAME_DUPLICATE`.
8. Submitting the target member's current `shortName` succeeds.
9. After a successful own update, `/api/auth/me` and `/api/app/me` return the new `shortName`.
10. Existing `LEFT` member display tests still return `탈퇴한 멤버` in general member/archive output.

- [ ] **Implement: run the focused failing tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.MemberProfileControllerTest --tests com.readmates.auth.api.AuthMeControllerTest
```

Expected before implementation: new tests fail because profile endpoints do not exist.

- [ ] **Implement: add web DTOs and endpoint adapter**

Create DTOs with these request/response fields:

```text
UpdateMemberProfileRequest.shortName: String
MemberProfileResponse.membershipId: String
MemberProfileResponse.displayName: String
MemberProfileResponse.shortName: String
MemberProfileResponse.profileImageUrl: String?
ProfileErrorResponse.code: String
ProfileErrorResponse.message: String
```

Use `PATCH /api/me/profile` for the current member and `PATCH /api/host/members/{membershipId}/profile` for host updates. The own-profile endpoint must read the authenticated email from `Authentication.emailOrNull()` and return `401 AUTHENTICATION_REQUIRED` when it is missing. The host endpoint must take `CurrentMember` and return `HostMemberListItem`.

- [ ] **Implement: add application ports and service**

Add `UpdateOwnProfileUseCase` and `UpdateHostMemberProfileUseCase`. `UpdateOwnProfileUseCase` must accept authenticated email plus `shortName`, then load the current profile membership through `MemberProfileStorePort` using that email. `UpdateHostMemberProfileUseCase` must accept `CurrentMember`, target `membershipId`, and `shortName`. The service must:

- Trim before validation and storage.
- Enforce 1 to 20 characters.
- Reject newline and control characters.
- Reject email-shaped values.
- Reject `http://`, `https://`, and domain-like URL values.
- Reject reserved names: `탈퇴한 멤버`, `관리자`, `호스트`, `운영자`.
- Check same-club duplicate names while allowing the target member's current value.
- Allow own update for `VIEWER`, `ACTIVE`, and `SUSPENDED`.
- Reject own update for `LEFT` and `INACTIVE`.
- Require `ACTIVE + HOST` for host updates.
- Scope own-profile duplicate lookup and update by the loaded current profile member's `clubId`; scope host target lookup, duplicate lookup, and update by `CurrentMember.clubId`.

- [ ] **Implement: add JDBC storage adapter**

The adapter must update only `users.short_name` through a membership-scoped target:

```text
memberships.id = target membership id
memberships.club_id = current member club id
users.id = memberships.user_id
```

Do not add a Flyway migration or database unique constraint. Use a transactional service-level duplicate check because uniqueness is current-club scoped while storage remains on `users`.

The own-profile lookup must include `VIEWER`, `ACTIVE`, `SUSPENDED`, `LEFT`, and `INACTIVE` so the service can return the design-required `403 MEMBERSHIP_NOT_ALLOWED` for blocked states without broadening global `CurrentMember` argument resolution for other APIs.

- [ ] **Implement: return updated host row**

After a host profile update, return a fresh `HostMemberListItem` so the frontend can update the row without refetching. Move the existing private `HostMemberListRow.toHostMemberListItem(currentMembershipId)` mapping from `MemberLifecycleService` into `HostMemberListItemMapper.kt`, then call that mapper from both lifecycle and profile services.

- [ ] **Implement: add structured error mapping**

Map validation and authorization failures to the design codes:

```text
401 AUTHENTICATION_REQUIRED
403 HOST_ROLE_REQUIRED
403 MEMBERSHIP_NOT_ALLOWED
404 MEMBER_NOT_FOUND
400 SHORT_NAME_REQUIRED
400 SHORT_NAME_TOO_LONG
400 SHORT_NAME_INVALID
400 SHORT_NAME_RESERVED
409 SHORT_NAME_DUPLICATE
```

Ensure frontend clients can parse `{ "code": "...", "message": "..." }` from both profile endpoints.

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer. Require the reviewer to check every server requirement in spec sections 6, 8, 9, 10, 12, and 13 against the diff.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer. Require focus on clean-architecture boundaries, controller thinness, transaction boundaries, SQL club scoping, duplicate race risk, response shape, and regression coverage.

- [ ] **Apply fixes and re-review**

Apply only actionable review findings. Rerun the relevant spec or quality reviewer after fixes. If duplicate race risk is raised, prefer a service-level transaction and clear residual-risk note over adding a schema change outside the design.

- [ ] **Validate**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.MemberProfileControllerTest --tests com.readmates.auth.api.AuthMeControllerTest --tests com.readmates.session.api.CurrentSessionControllerDbTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: all selected server tests pass.

- [ ] **Commit**

Commit only Task 1 files:

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt server/src/test/kotlin/com/readmates/auth/api/MemberProfileControllerTest.kt server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt
git commit -m "feat: add member profile update APIs"
```

If `CurrentSessionControllerDbTest.kt` did not need changes because existing coverage already protects `LEFT` display, omit it from `git add` and cite the existing passing assertion in the task checkpoint.

- [ ] **Task boundary checkpoint**

Record branch, commit hash, changed files, passing server commands, review status, resource ledger, and "Next: Task 2".

## Task 2: Frontend Route Guard And Auth Helpers

**Files:**
- Modify: `front/shared/auth/member-app-access.ts`
- Modify: `front/src/app/route-guards.tsx`
- Modify: `front/src/app/auth-state.ts`
- Modify: `front/src/app/auth-context.tsx`
- Modify: `front/shared/auth/auth-contracts.ts`
- Modify: `front/features/auth/api/auth-contracts.ts`
- Test: `front/tests/unit/auth-context.test.tsx`
- Test: `front/tests/unit/spa-router.test.tsx`
- Test: add focused helper coverage in `front/tests/unit/member-app-access.test.ts` if existing tests do not cover all helpers cleanly.

- [ ] **Implement: write failing frontend helper and guard tests first**

Cover:

1. `canReadMemberContent` is true for authenticated `VIEWER`, `ACTIVE`, and `SUSPENDED`; false for anonymous, `LEFT`, `INACTIVE`, and `INVITED`.
2. `canWriteMemberActivity` is true only for authenticated `ACTIVE`.
3. `canUseHostApp` is true only for authenticated `ACTIVE + HOST`.
4. `canEditOwnProfile` is true for authenticated `VIEWER`, `ACTIVE`, and `SUSPENDED`.
5. `RequireMemberApp` shows login redirect for anonymous auth.
6. `RequireMemberApp` shows blocked copy for authenticated disallowed states without rendering child routes.
7. `RequireHost` uses `canUseHostApp`.
8. `AuthProvider.refreshAuth` reloads `/api/bff/api/auth/me` and updates `shortName`.

- [ ] **Implement: run the focused failing tests**

Run:

```bash
pnpm --dir front test -- member-app-access auth-context spa-router
```

Expected before implementation: helper exports and `refreshAuth` tests fail.

- [ ] **Implement: add shared auth helpers**

In `front/shared/auth/member-app-access.ts`, expose:

```text
canReadMemberContent(auth)
canWriteMemberActivity(auth)
canUseHostApp(auth)
canEditOwnProfile(auth)
canUseMemberApp(auth)
```

Keep `canUseMemberApp` as an alias of `canReadMemberContent` so existing imports keep working during the task.

- [ ] **Implement: update route guards**

Use helper functions in `front/src/app/route-guards.tsx`. For authenticated but disallowed member-app states, render a concise blocked state with public-home/about and logout actions instead of generic active-member copy.

- [ ] **Implement: add auth refresh action**

Add `refreshAuth` to `AuthActions` and implement it in `AuthProvider` by reusing the same `/api/bff/api/auth/me` fetch behavior as initial load. Keep `markLoggedOut`.

- [ ] **Implement: keep auth contracts aligned**

Update both auth contract files if helper tests reveal type drift. Do not create a wider auth-model cleanup in this task.

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer. Require comparison against spec sections 6, 7, and 11.3.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer. Require focus on route-first dependency direction, no feature-to-app imports, state refresh behavior, blocked-state accessibility, and no duplicated permission logic.

- [ ] **Apply fixes and re-review**

Apply actionable findings and rerun the affected reviewer. Keep any visual copy aligned with the design guide: calm, concrete, and not over-explanatory.

- [ ] **Validate**

Run:

```bash
pnpm --dir front test -- member-app-access auth-context spa-router
pnpm --dir front lint
```

Expected: focused tests and lint pass.

- [ ] **Commit**

```bash
git add front/shared/auth/member-app-access.ts front/src/app/route-guards.tsx front/src/app/auth-state.ts front/src/app/auth-context.tsx front/shared/auth/auth-contracts.ts front/features/auth/api/auth-contracts.ts front/tests/unit/auth-context.test.tsx front/tests/unit/spa-router.test.tsx front/tests/unit/member-app-access.test.ts
git commit -m "feat: standardize frontend member access helpers"
```

If `front/tests/unit/member-app-access.test.ts` was not created, omit it from `git add`.

- [ ] **Task boundary checkpoint**

Record branch, commit hash, changed files, passing frontend commands, review status, resource ledger, and "Next: Task 3".

## Task 3: `/app/me` Profile Editing UI

**Files:**
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/model/archive-model.ts`
- Test: `front/tests/unit/my-page.test.tsx`

- [ ] **Implement: write failing `/app/me` tests first**

Cover:

1. Desktop `/app/me` shows `displayName`, `email`, current `shortName`, and an edit control for `shortName`.
2. Mobile `/app/me` exposes the same edit capability.
3. Saving sends `PATCH /api/bff/api/me/profile` with `{ "shortName": "<trimmed input>" }`.
4. While saving, duplicate submit is blocked and the input/action shows pending state.
5. Success updates visible `shortName`, calls `refreshAuth`, and revalidates route data or otherwise reloads current route data.
6. `SHORT_NAME_DUPLICATE`, `SHORT_NAME_REQUIRED`, `SHORT_NAME_TOO_LONG`, `SHORT_NAME_INVALID`, and `SHORT_NAME_RESERVED` appear near the field.
7. Network or unknown server failure shows a page/local alert that does not expose raw server internals.
8. If `canEditOwnProfile(auth)` is false, the edit control is hidden or disabled and no profile request is sent.

- [ ] **Implement: run the focused failing tests**

Run:

```bash
pnpm --dir front test -- my-page
```

Expected before implementation: profile editing tests fail because the UI and client API do not exist.

- [ ] **Implement: add archive profile API client**

Add `updateMyProfile(shortName)` in `front/features/archive/api/archive-api.ts`. Use `readmatesFetchResponse` so the route can parse structured validation errors before throwing user-facing messages.

- [ ] **Implement: wire route action callbacks**

Pass an `onUpdateProfile` callback and `refreshAuth` action from `MyPageRoute`. After success, update local page state and trigger route revalidation using React Router APIs available in the current route pattern.

- [ ] **Implement: add desktop and mobile profile form**

Update `front/features/archive/ui/my-page.tsx` so "표시 이름" is editable. Keep `displayName`, `email`, role, status, attendance, reports, notifications, and leave-membership behavior intact.

- [ ] **Implement: map profile errors to Korean field messages**

Use these user-facing meanings:

```text
SHORT_NAME_REQUIRED -> 표시 이름을 입력해 주세요.
SHORT_NAME_TOO_LONG -> 표시 이름은 20자 이하로 입력해 주세요.
SHORT_NAME_INVALID -> 표시 이름으로 쓸 수 없는 형식입니다.
SHORT_NAME_RESERVED -> 시스템에서 쓰는 이름은 사용할 수 없습니다.
SHORT_NAME_DUPLICATE -> 같은 클럽에서 이미 쓰고 있는 이름입니다.
MEMBERSHIP_NOT_ALLOWED -> 현재 상태에서는 프로필을 수정할 수 없습니다.
```

Unknown failures should show: `표시 이름 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.`

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer. Require comparison against spec sections 8.1, 9, 11.1, and 13.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer. Require focus on route/ui separation, auth refresh correctness, accessibility of error/status messages, responsive behavior, and no raw API details in UI.

- [ ] **Apply fixes and re-review**

Apply actionable findings. Re-run the reviewer that raised the issue. Keep the UI consistent with the existing `/app/me` visual language rather than introducing a new settings page.

- [ ] **Validate**

Run:

```bash
pnpm --dir front test -- my-page auth-context
pnpm --dir front lint
```

Expected: focused tests and lint pass.

- [ ] **Commit**

```bash
git add front/features/archive/api/archive-contracts.ts front/features/archive/api/archive-api.ts front/features/archive/route/my-page-route.tsx front/features/archive/ui/my-page.tsx front/features/archive/model/archive-model.ts front/tests/unit/my-page.test.tsx
git commit -m "feat: let members edit their profile name"
```

- [ ] **Task boundary checkpoint**

Record branch, commit hash, changed files, passing frontend commands, review status, resource ledger, and "Next: Task 4".

## Task 4: `/app/host/members` Member Profile Editing UI

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-members-data.ts`
- Modify: `front/features/host/components/host-members.tsx`
- Test: `front/tests/unit/host-members.test.tsx`

- [ ] **Implement: write failing host member UI tests first**

Cover:

1. Each host member row shows `displayName`, `shortName`, email, status, and current-session state.
2. Host can open an edit action/dialog for `shortName`.
3. Saving sends `PATCH /api/bff/api/host/members/{membershipId}/profile` with `{ "shortName": "<trimmed input>" }`.
4. Success replaces only the updated row using returned `HostMemberListItem`.
5. While profile save is pending, lifecycle actions for the same row are disabled with the same pending reason pattern.
6. Lifecycle pending state also blocks profile editing for that row.
7. Validation errors appear near the edit field.
8. `403` and `404` host profile errors show `수정할 수 없는 멤버입니다.`
9. Duplicate submit is ignored while a row has any pending action.
10. Existing tab, lifecycle, viewer activation, and current-session tests still pass.

- [ ] **Implement: run the focused failing tests**

Run:

```bash
pnpm --dir front test -- host-members
```

Expected before implementation: edit action tests fail because the client action and UI do not exist.

- [ ] **Implement: add host profile API client**

Add `submitHostMemberProfile(membershipId, shortName)` using `PATCH /api/host/members/{membershipId}/profile` in `front/features/host/api/host-api.ts`.

- [ ] **Implement: wire host members actions**

Extend `HostMembersActions` and `hostMembersActions` with `submitProfile`. Keep existing `loadMembers`, lifecycle, and viewer actions stable.

- [ ] **Implement: add row edit UI**

Use an inline editor or small dialog. Prefer the existing dialog pattern if it keeps keyboard focus and row layout stable. Do not let the edit UI resize rows unpredictably on mobile.

- [ ] **Implement: share row pending state**

Use the existing `pendingActions` set with an action key such as `profile`. `isMembershipPending` must block lifecycle and profile actions for the same `membershipId`.

- [ ] **Implement: map host profile errors**

Use the same validation messages as `/app/me` for field errors. For host permission/not-found cases, show `수정할 수 없는 멤버입니다.` instead of raw server text.

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer. Require comparison against spec sections 8.2, 9, 11.2, and 13.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer. Require focus on row state isolation, no duplicated pending logic, accessibility/focus handling, responsive layout, and preserving existing lifecycle behavior.

- [ ] **Apply fixes and re-review**

Apply actionable findings. Re-run the affected reviewer. If the reviewer flags broad component size risk, extract small local components inside the same file first; move files only if it clearly improves readability without changing public imports.

- [ ] **Validate**

Run:

```bash
pnpm --dir front test -- host-members
pnpm --dir front lint
```

Expected: focused tests and lint pass.

- [ ] **Commit**

```bash
git add front/features/host/api/host-contracts.ts front/features/host/api/host-api.ts front/features/host/route/host-members-data.ts front/features/host/components/host-members.tsx front/tests/unit/host-members.test.tsx
git commit -m "feat: let hosts edit member display names"
```

- [ ] **Task boundary checkpoint**

Record branch, commit hash, changed files, passing frontend commands, review status, resource ledger, and "Next: Task 5".

## Task 5: Cross-Surface Permission And User-Flow Verification

**Files:**
- Create: `front/tests/e2e/member-profile-permissions.spec.ts`

- [ ] **Implement: add end-to-end coverage**

Cover one happy path for member self-edit and one happy path for host-edit through the BFF:

1. Login/session setup uses existing e2e helpers.
2. Member opens `/app/me`, edits `shortName`, and sees the updated name without full manual reload.
3. Host opens `/app/host/members`, edits a same-club member `shortName`, and sees the row update.
4. A viewer or suspended user can read allowed member routes but cannot submit write actions in the current session UI.
5. Host-only route remains blocked for non-host users.

- [ ] **Implement: run the focused e2e test**

If a dev server is needed, start it with resource ledger tracking. Use a non-conflicting port and record PID/session id. Then run:

```bash
pnpm --dir front test:e2e -- member-profile-permissions
```

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer. Require confirmation that the E2E coverage matches the design's most important permission boundaries without adding brittle private data.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer. Require focus on stable selectors, deterministic data setup/cleanup, BFF path correctness, and no real member data or secrets.

- [ ] **Apply fixes and re-review**

Fix brittle selectors, unstable waits, or data cleanup issues. Re-run the reviewer if the test structure changes.

- [ ] **Validate**

Run the focused E2E command again. Expected: pass. Stop only session-owned dev servers and browsers recorded in the resource ledger.

- [ ] **Commit**

```bash
git add front/tests/e2e/member-profile-permissions.spec.ts
git commit -m "test: cover member profile permission flows"
```

- [ ] **Task boundary checkpoint**

Record branch, commit hash, changed files, passing E2E command, review status, resource ledger, and "Next: Task 6".

## Task 6: Final Verification, Review, And Handoff

**Files:**
- No feature files unless final verification exposes a bug.
- Update documentation only if implementation changed a public-facing behavior that current docs describe incorrectly.

- [ ] **Implement: run final server verification**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: pass.

- [ ] **Implement: run final frontend verification**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

Expected: pass.

- [ ] **Implement: inspect final diff**

Run:

```bash
git status --short --untracked-files=all
git diff --check
git diff --stat
git diff --name-only origin/main...HEAD
```

Expected: only scoped profile/permission files and tests changed; no whitespace errors.

- [ ] **Spec compliance review**

Use a fresh `gpt-5.5` + `high` reviewer over the full branch diff. Require a section-by-section check against the design spec and explicit notes for any intentional minimal adjustment.

- [ ] **Code quality review**

Use a fresh `gpt-5.5` + `high` reviewer over the full branch diff. Require focus on architecture boundaries, auth/storage safety, route-first frontend boundaries, UI accessibility, state management, test adequacy, and maintainability.

- [ ] **Apply fixes and re-review**

Apply actionable final-review findings in a final fix commit. Rerun focused tests for touched areas plus any failed final command. Re-run the reviewer that raised the finding.

- [ ] **Validate final state**

Re-run the full final verification command set after any final fixes:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
```

Expected: all pass.

- [ ] **Resource cleanup**

Stop only session-owned resources recorded in the ledger. Do not use broad `killall` or `pkill` cleanup commands.

- [ ] **Final task boundary checkpoint**

Record branch, final commit hash, full verification output, resource cleanup status, review status, remaining risks, and PR/merge recommendation.

## Final Verification Commands

Because this work changes auth helpers, route guards, API mutations, and host/member user flows, final verification must include E2E:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
```

## Residual Risks To Track During Execution

- Same-club duplicate `shortName` is enforced in application logic because the storage remains `users.short_name`; concurrent duplicate writes are possible without a DB constraint. If this risk becomes unacceptable, it needs a follow-up design for membership-scoped profile storage or a dedicated uniqueness table.
- Current operational auth resolution returns `VIEWER`, `ACTIVE`, and `SUSPENDED`. If execution broadens auth-state reporting for `LEFT` or `INACTIVE`, it must not broaden protected `CurrentMember` API access without explicit endpoint blocking tests.
- `/app/me` and `/app/host/members` are currently large UI files. Keep changes local for scope control, but extract small pure helpers/components if review shows readability or testability is materially harmed.
- E2E stability depends on existing dev-login/database helper behavior. If full E2E is unavailable in the environment, record the exact blocker and run the focused unit/server suites plus any runnable E2E subset.
