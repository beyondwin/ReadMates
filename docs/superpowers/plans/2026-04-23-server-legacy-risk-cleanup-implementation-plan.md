# ReadMates Server Legacy Risk Cleanup Implementation Plan

작성일: 2026-04-23
상태: READY FOR REVIEW

> **For agentic workers:** Resolve only the documented residual risks from the server clean architecture migration. Preserve API route paths, request/response JSON shape, HTTP status behavior, auth behavior, DB schema, and frontend files. Update checkboxes as work completes.

## Goal

Remove the remaining legacy architecture risks left after `2026-04-23-server-clean-architecture-restructure-implementation-plan.md`:

1. Replace transitional archive/feedback legacy repository bridges with real outbound persistence adapters.
2. Move `note.api.NotesFeedController` into the migrated note web/application/port structure.
3. Move `shared.api.HealthController` out of the legacy `api` package without changing `/api/health`.
4. Extract selected auth application JDBC/repository orchestration behind outbound ports.
5. Strengthen architecture boundary tests once the exceptions are removed.

## Source Documents

- Prior implementation plan: `docs/superpowers/plans/2026-04-23-server-clean-architecture-restructure-implementation-plan.md`
- Server clean architecture design: `docs/superpowers/specs/2026-04-23-server-clean-architecture-restructure-design.md`
- Current server architecture doc: `docs/development/architecture.md`
- Boundary test: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

## Scope Guardrails

- Do not edit frontend files.
- Do not change DB schema or Flyway migrations.
- Do not change API route paths:
  - `/api/notes/feed`
  - `/api/notes/sessions`
  - `/api/health`
  - existing auth, archive, feedback routes
- Do not change JSON field names or response shape.
- Do not change auth policy while moving persistence orchestration.
- Do not tune SQL while moving it unless a test proves current behavior is wrong.
- Prefer moving existing query logic intact into adapters over redesigning query shape.
- Do not remove in-memory test doubles unless their replacement is covered by tests.
- Preserve unrelated dirty worktree changes.

## Current Residual Risks

Observed on 2026-04-23:

- `archive.application.ArchiveSessionQueryRepository`, `MyRecordsQueryRepository`, and `NotesFeedQueryRepository` still own `JdbcTemplate` queries.
- `archive.adapter.out.persistence.LegacyArchiveQueryAdapter` is a transitional wrapper around application-level repositories.
- `feedback.application.FeedbackDocumentRepository` still owns `JdbcTemplate` queries.
- `feedback.adapter.out.persistence.LegacyFeedbackDocumentAdapter` is a transitional wrapper around an application-level repository.
- `note.api.NotesFeedController` still sits in a legacy `api` package and directly depends on `ArchiveRepository` and `MemberAccountRepository`.
- `shared.api.HealthController` remains in a legacy `api` package.
- Selected `auth.application` services still own JDBC/repository orchestration, especially:
  - `InvitationService`
  - `MemberApprovalService`
  - `MemberLifecycleService`
  - `PendingApprovalReadService`
  - `AuthSessionRepository` / `JdbcAuthSessionRepository`
  - `MemberAccountRepository`
- `ServerArchitectureBoundaryTest` intentionally excludes stricter `auth.application` rules while these exceptions exist.

## Target End State

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence
```

Target package outcomes:

- `archive.application..` contains use cases, services, ports, models, and no `JdbcTemplate` or SQL row mapping.
- `feedback.application..` contains parser, use cases, services, ports, models, and no `JdbcTemplate` or SQL row mapping.
- `note.api` is removed for notes feed; notes feed uses `note.adapter.in.web`, `note.application.port.in`, `note.application.service`, and `note.application.port.out`.
- `shared.api` is removed or left empty; health check lives under `shared.adapter.in.web`.
- `auth.application..` no longer imports `org.springframework.jdbc..` for the migrated operational auth surface.
- `auth.adapter.in.web.PasswordAuthController` depends on an inbound logout/session cleanup use case instead of `AuthSessionService` directly.
- Boundary tests include auth application once auth JDBC orchestration is behind outbound ports.

## Quality Gate For Every Task

For each task:

1. Check dirty state before editing:

```bash
git status --short --untracked-files=all
```

2. Run the task-specific tests listed in the task.
3. Run architecture tests if package boundaries changed:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

4. Record the task result in this plan.

## Task 0: Baseline Evidence

**Files:** no expected source edits

- [x] **Step 1: Confirm worktree status**

```bash
git status --short --untracked-files=all
```
- Result: command passed (only baseline file appeared as untracked before edits): `?? docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md`.

- [x] **Step 2: Run current focused suites**

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.*'
./server/gradlew -p server test --tests 'com.readmates.feedback.*'
./server/gradlew -p server test --tests 'com.readmates.note.*'
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```
- Result: all five commands passed (BUILD SUCCESSFUL):
  - `com.readmates.archive.*` (2026-04-23T20:02:09+09:00, 6 tasks, 6/6 executed)
  - `com.readmates.feedback.*` (BUILD SUCCESSFUL)
  - `com.readmates.note.*` (BUILD SUCCESSFUL)
  - `com.readmates.auth.api.*` (BUILD SUCCESSFUL)
  - `com.readmates.architecture.*` (BUILD SUCCESSFUL)

- [x] **Step 3: Capture remaining JDBC/API-package evidence**

```bash
rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/archive/application server/src/main/kotlin/com/readmates/feedback/application server/src/main/kotlin/com/readmates/auth/application
rg -n "package com\\.readmates\\..*\\.api|class NotesFeedController|class HealthController" server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/shared
```
- Result: evidence confirms residual migration risks remain.
  - Archive/feedback/auth application still contain `JdbcTemplate` and `query`/`queryForObject` in many repositories (e.g., `archive/application/ArchiveSessionQueryRepository.kt`, `archive/application/NotesFeedQueryRepository.kt`, `feedback/application/FeedbackDocumentRepository.kt`, `auth/application/InvitationService.kt`, etc.).
  - API-package classes still present: `com.readmates.shared.api.HealthController` and `com.readmates.note.api.NotesFeedController`.

Expected: evidence matches the residual risks above.

## Task 1: Replace Archive Legacy Query Bridge

**Files:**

- Replace: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/LegacyArchiveQueryAdapter.kt`
- Move/delete when unused:
  - `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
  - `server/src/main/kotlin/com/readmates/archive/application/MyRecordsQueryRepository.kt`
- Keep for Task 3 unless moved there:
  - `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt`
- Modify if needed:
  - `server/src/main/kotlin/com/readmates/archive/application/port/out/LoadArchiveDataPort.kt`
  - `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt`
  - `server/src/test/kotlin/com/readmates/archive/api/*`

- [x] **Step 1: Move archive-session and my-records SQL into persistence adapter**

Create one or more concrete JDBC adapters under `archive.adapter.out.persistence`, for example:

- `JdbcArchiveQueryAdapter`
- `ArchiveRows.kt` if row mapping becomes large

The adapter should implement `LoadArchiveDataPort` directly. Preserve existing SQL, row mapping, null behavior, ordering, and access checks.

- Result: created `JdbcArchiveQueryAdapter` under `archive.adapter.out.persistence` implementing `LoadArchiveDataPort` directly. Existing archive-session and my-records SQL, row mapping, null fallback behavior, ordering, and access checks were moved intact into the adapter.

- [x] **Step 2: Remove transitional wrapper**

Delete `LegacyArchiveQueryAdapter` after the JDBC adapter implements the port directly.

- Result: deleted `LegacyArchiveQueryAdapter`.

- [x] **Step 3: Remove application-level JDBC repositories for archive API paths**

Delete `ArchiveSessionQueryRepository` and `MyRecordsQueryRepository` when they have no callers.

Do not move `NotesFeedQueryRepository` in this task unless Task 3 is being executed in the same commit; it feeds the legacy note endpoint and needs its own note use-case boundary.

- Result: deleted `ArchiveSessionQueryRepository` and `MyRecordsQueryRepository`. `ArchiveRepository` now retains only the pending note-feed delegation to `NotesFeedQueryRepository`.

- [x] **Step 4: Validate archive behavior**

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/archive/application
```

Expected: archive tests pass. Remaining archive application JDBC hits, if any, are only `NotesFeedQueryRepository` pending Task 3 and are recorded here.

- Result: validation passed.
  - `./server/gradlew -p server test --tests 'com.readmates.archive.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 4 executed, 2 up-to-date).
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - `rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/archive/application` returned only `NotesFeedQueryRepository.kt` hits.

- [x] **Step 5: Commit archive bridge removal**

```bash
git add server/src/main/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/architecture docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "refactor: replace archive legacy query bridge"
```

- Result: Task 1 changes committed by the implementation worker with message `refactor: replace archive legacy query bridge`.

## Task 2: Replace Feedback Legacy Document Bridge

**Files:**

- Replace: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/LegacyFeedbackDocumentAdapter.kt`
- Move/delete when unused: `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentRepository.kt`
- Modify if needed:
  - `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
  - `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentResults.kt`
  - `server/src/test/kotlin/com/readmates/feedback/api/*`
  - `server/src/test/kotlin/com/readmates/auth/api/ViewerSecurityTest.kt`

- [x] **Step 1: Move feedback SQL into a persistence adapter**

Create `JdbcFeedbackDocumentStoreAdapter` under `feedback.adapter.out.persistence` implementing `FeedbackDocumentStorePort`.

Move the current `FeedbackDocumentRepository` SQL and row mapping into the adapter without changing parser or service behavior.

- Result: created `JdbcFeedbackDocumentStoreAdapter` under `feedback.adapter.out.persistence` implementing `FeedbackDocumentStorePort`. Existing feedback document SQL, row mapping, unavailable-storage behavior, and version/upload behavior were moved intact into the adapter.

- [x] **Step 2: Remove transitional wrapper and application repository**

Delete `LegacyFeedbackDocumentAdapter` and `FeedbackDocumentRepository` once the new adapter is wired and tests pass.

- Result: deleted `LegacyFeedbackDocumentAdapter` and `FeedbackDocumentRepository`.

- [x] **Step 3: Keep application service unchanged except constructor type**

`FeedbackDocumentService` should continue to depend only on `FeedbackDocumentStorePort`. It should not import Spring JDBC, adapter packages, or repository classes.

- Result: `FeedbackDocumentService` already depended only on `FeedbackDocumentStorePort`; no service changes were needed.

- [x] **Step 4: Validate feedback behavior**

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.*'
./server/gradlew -p server test --tests 'com.readmates.auth.api.ViewerSecurityTest'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/feedback/application
```

Expected: no `JdbcTemplate`, `query(`, or `queryForObject` hits under `feedback.application`.

- Result: validation passed.
  - `./server/gradlew -p server test --tests 'com.readmates.feedback.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 4 executed, 2 up-to-date).
  - `./server/gradlew -p server test --tests 'com.readmates.auth.api.ViewerSecurityTest'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - `rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/feedback/application` returned no hits.

- [x] **Step 5: Commit feedback bridge removal**

```bash
git add server/src/main/kotlin/com/readmates/feedback server/src/test/kotlin/com/readmates/feedback server/src/test/kotlin/com/readmates/auth docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "refactor: replace feedback document legacy bridge"
```

- Result: Task 2 changes committed by the implementation worker with message `refactor: replace feedback document legacy bridge`.

## Task 3: Migrate Notes Feed Legacy API

**Files:**

- Move/delete: `server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt`
- Create:
  - `server/src/main/kotlin/com/readmates/note/adapter/in/web/NotesFeedController.kt`
  - `server/src/main/kotlin/com/readmates/note/adapter/in/web/NotesFeedWebDtos.kt`
  - `server/src/main/kotlin/com/readmates/note/application/model/NotesFeedResults.kt`
  - `server/src/main/kotlin/com/readmates/note/application/port/in/NotesFeedUseCases.kt`
  - `server/src/main/kotlin/com/readmates/note/application/port/out/LoadNotesFeedPort.kt`
  - `server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt`
  - `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Move/delete when unused: `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt`
- Modify tests under: `server/src/test/kotlin/com/readmates/note/*`

- [x] **Step 1: Move web DTOs and controller package**

Preserve:

- `GET /api/notes/feed`
- `GET /api/notes/sessions`
- response fields and list shapes
- invalid `sessionId` behavior returning an empty list
- unauthenticated behavior returning `401`

- Result: moved notes feed endpoints to `note.adapter.in.web.NotesFeedController` with response DTOs in `NotesFeedWebDtos.kt`. Route paths and response field/list shapes are preserved.

- [x] **Step 2: Replace direct auth repository lookup**

Use `CurrentMember` argument resolution or `ResolveCurrentMemberUseCase` through established auth adapter patterns. Do not keep direct `Authentication` plus `MemberAccountRepository` lookup in the controller.

- Result: controller now accepts `CurrentMember` directly and no longer imports `Authentication` or `MemberAccountRepository`; unauthenticated requests continue through the shared resolver and return `401`.

- [x] **Step 3: Add note use case and outbound port**

`NotesFeedController` should call `GetNotesFeedUseCase` / `ListNoteSessionsUseCase` style inbound ports. `NotesFeedService` should own orchestration and session-id parsing decisions if they are not pure HTTP parsing.

- Result: added `GetNotesFeedUseCase`, `ListNoteSessionsUseCase`, `LoadNotesFeedPort`, `NotesFeedService`, and result models under `note.application`. Invalid `sessionId` parsing remains an empty-list application decision.

- [x] **Step 4: Move notes feed SQL into note persistence adapter**

Move `NotesFeedQueryRepository` SQL into `note.adapter.out.persistence.JdbcNotesFeedAdapter` implementing `LoadNotesFeedPort`. Delete the old archive application repository after callers move.

- Result: moved the existing notes feed SQL and row mapping into `JdbcNotesFeedAdapter`. Deleted `archive.application.NotesFeedQueryRepository` and the now-unused `ArchiveRepository` note-feed delegation.

- [x] **Step 5: Validate note behavior**

```bash
./server/gradlew -p server test --tests 'com.readmates.note.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "package com\\.readmates\\.note\\.api|JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/archive/application
```

Expected: no `note.api` package remains, and no notes-feed JDBC remains under `archive.application`.

- Result: validation passed.
  - `./server/gradlew -p server test --tests 'com.readmates.note.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 4 executed, 2 up-to-date).
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - `rg -n "package com\\.readmates\\.note\\.api|JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/archive/application` returned only the expected `JdbcNotesFeedAdapter` hits under `note.adapter.out.persistence`; no `note.api` package or archive application notes-feed JDBC remains.
  - Additional behavior check `./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).

- [x] **Step 6: Commit notes feed migration**

```bash
git add server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/note server/src/test/kotlin/com/readmates/architecture docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "refactor: migrate notes feed to clean architecture"
```

- Result: Task 3 changes committed by the implementation worker with message `refactor: migrate notes feed to clean architecture`.

## Task 4: Move Shared Health Controller Out Of Legacy API Package

**Files:**

- Move/delete: `server/src/main/kotlin/com/readmates/shared/api/HealthController.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adapter/in/web/HealthController.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [x] **Step 1: Move health controller package**

Keep `/api/health` response and HTTP status unchanged. This endpoint has no application orchestration requirement unless tests or current behavior reveal hidden logic.

- [x] **Step 2: Include shared web adapter in lightweight boundary rule**

Add `com.readmates.shared.adapter.in.web..` to the web adapter rule that bans direct JDBC, repository, and outbound-adapter dependencies.

- [x] **Step 3: Validate health and architecture behavior**

```bash
./server/gradlew -p server test --tests 'com.readmates.shared.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "package com\\.readmates\\.shared\\.api" server/src/main/kotlin/com/readmates/shared
```

If there is no dedicated shared test suite, run architecture tests plus full server tests for this task.

- [x] **Step 4: Commit shared health migration**

```bash
git add server/src/main/kotlin/com/readmates/shared server/src/test/kotlin/com/readmates/architecture docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "refactor: move health endpoint to web adapter"
```

- Result: moved `HealthController` from `shared.api` to `shared.adapter.in.web` and moved the matching shared health test package. The current code and tests use `/internal/health`, not the plan's `/api/health`; preserved `/internal/health` route, response payload, HTTP status, and unauthenticated access.
- Validation: `./server/gradlew -p server test --tests 'com.readmates.shared.*'` passed; `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` passed; `rg -n "package com\\.readmates\\.shared\\.api" server/src/main/kotlin/com/readmates/shared` returned no matches.

## Task 5: Extract Auth Session And Member Account Persistence

**Files:**

- Move/split:
  - `server/src/main/kotlin/com/readmates/auth/application/AuthSessionRepository.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Create:
  - `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthSessionUseCases.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/port/out/AuthSessionStorePort.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAccountStorePort.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcAuthSessionAdapter.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Modify:
  - `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/service/DevLoginMemberService.kt`
  - `server/src/main/kotlin/com/readmates/auth/adapter/in/web/PasswordAuthController.kt`
  - auth tests

- [x] **Step 1: Add auth session outbound port**

Move JDBC-backed auth session storage behind `AuthSessionStorePort`. Keep in-memory test double behavior available through the port if tests rely on it.

- Result: created `AuthSessionStorePort` and moved the stored session model to `auth.application.model`. Moved JDBC-backed session storage to `JdbcAuthSessionAdapter`; the in-memory test double remains available as `AuthSessionStorePort.InMemoryForTest`.

- [x] **Step 2: Add logout/session cleanup inbound port**

Add a use case for logout/session cleanup so `PasswordAuthController` no longer injects `AuthSessionService` directly. Keep cookie clearing and status `204` behavior unchanged.

- Result: added `LogoutAuthSessionUseCase` in `AuthSessionUseCases.kt`. `PasswordAuthController` now depends on the inbound use case, still returns `204`, clears the session cookie, and revokes the session token when present.

- [x] **Step 3: Move member account SQL behind outbound port**

Move `MemberAccountRepository` SQL and row mapping into `JdbcMemberAccountAdapter`. Application services should depend on a port that preserves current operations without exposing JDBC.

- Result: created `MemberAccountStorePort` and moved member-account SQL/row mapping into `JdbcMemberAccountAdapter`. `GoogleLoginService`, `AuthenticatedMemberResolver`, `DevLoginMemberService`, `InvitationService`, and current-member persistence wiring now depend on ports instead of the old repository.

- [x] **Step 4: Validate auth session/member account behavior**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/auth/application
```

Expected: auth application JDBC hits are reduced to invitation/member-lifecycle/approval/pending services that are scheduled for Task 6.

- Result: validation passed.
  - `./server/gradlew -p server test --tests 'com.readmates.auth.api.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 4 executed, 2 up-to-date).
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - Extra touched-service validation passed: `./server/gradlew -p server test --tests 'com.readmates.auth.application.AuthSessionServiceTest' --tests 'com.readmates.auth.application.GoogleLoginServiceTest'` (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - `rg -n "JdbcTemplate|query\\(|queryForObject" server/src/main/kotlin/com/readmates/auth/application` now reports only `InvitationService.kt`, `MemberApprovalService.kt`, `MemberLifecycleService.kt`, and `PendingApprovalReadService.kt` hits scheduled for Task 6; no session/member-account storage hits remain.

- [x] **Step 5: Commit auth session/member account extraction**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/architecture docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "refactor: extract auth session and account persistence"
```

- Result: Task 5 changes committed by the implementation worker with message `refactor: extract auth session and account persistence`.

## Task 6: Extract Auth Invitation, Approval, Lifecycle, And Pending Persistence

**Files:**

- Modify/split:
  - `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/PendingApprovalReadService.kt`
- Create outbound ports under `auth.application.port.out`, for example:
  - `HostInvitationStorePort`
  - `MemberApprovalStorePort`
  - `MemberLifecycleStorePort`
  - `PendingApprovalStorePort`
- Create JDBC adapters under `auth.adapter.out.persistence`.
- Modify auth tests as needed.

- [x] **Step 1: Extract invitation persistence**

Move invitation list/create/revoke/preview/accept SQL and row mapping behind an outbound port. Keep token handling and application decisions in `InvitationService`.

- Result: created `HostInvitationStorePort` and `JdbcHostInvitationStoreAdapter`. Invitation list/create/revoke/preview/accept SQL, membership upsert/current-member lookup, current-session insert, active-member check, and MySQL invitation lock handling moved behind the port. `InvitationService` retains host checks, token generation/hash use, effective-status/can-revoke/can-reissue decisions, Google-account flow, email matching, app-base-url handling, and transaction boundaries.

- [x] **Step 2: Extract member approval persistence**

Move pending-viewer lookup, activation/deactivation writes, and current-session helper SQL behind an outbound port. Keep host authorization and decision rules in `MemberApprovalService`.

- Result: created `MemberApprovalStorePort` and `JdbcMemberApprovalStoreAdapter`. Pending-viewer listing, activation/deactivation writes, current-session helper insert, and post-write member lookup moved behind the port. `MemberApprovalService` retains host authorization and not-found decision handling.

- [x] **Step 3: Extract member lifecycle persistence**

Move member list, suspend/restore/deactivate, current-session add/remove, active-host locking/counting, and attendance membership SQL behind an outbound port. Keep lifecycle validation and policy decisions in `MemberLifecycleService`.

- Result: created `MemberLifecycleStorePort` and `JdbcMemberLifecycleStoreAdapter`. Member list, status writes, `for update` membership lookup, current-session add/remove writes, active-host locking/counting, and current-session lookup moved behind the port. `MemberLifecycleService` retains role/status validation, last-host policy, self-mutation checks, and current-session policy decisions.

- [x] **Step 4: Extract pending approval read persistence**

Move pending approval read SQL behind an outbound port. Keep response assembly in the application layer unless the data shape is pure row mapping.

- Result: created `PendingApprovalStorePort` and `JdbcPendingApprovalStoreAdapter`. Pending approval club/session SQL moved behind the port. `PendingApprovalReadService` retains viewer authorization and response assembly.

- [x] **Step 5: Validate auth operational behavior**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "JdbcTemplate|query\\(|queryForObject|org\\.springframework\\.jdbc" server/src/main/kotlin/com/readmates/auth/application
```

Expected: no Spring JDBC imports or query calls remain under `auth.application`.

- Result: validation passed.
  - `./server/gradlew -p server test --tests 'com.readmates.auth.api.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 4 executed, 2 up-to-date).
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` passed (BUILD SUCCESSFUL, 6 actionable tasks: 1 executed, 5 up-to-date).
  - `rg -n "JdbcTemplate|query\\(|queryForObject|org\\.springframework\\.jdbc" server/src/main/kotlin/com/readmates/auth/application` returned no hits.

- [x] **Step 6: Commit auth operational persistence extraction**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/architecture docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "refactor: extract auth operational persistence"
```

- Result: Task 6 changes committed by the implementation worker with message `refactor: extract auth operational persistence`.

## Task 7: Strengthen Architecture Boundary Tests

**Files:**

- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify if needed: `docs/development/architecture.md`

- [ ] **Step 1: Add no-JDBC-in-application rule**

Add an ArchUnit rule that migrated application packages must not depend on:

- `org.springframework.jdbc..`
- `org.springframework.jdbc.core.JdbcTemplate`
- `org.springframework.dao..` unless a current application-level exception is explicitly documented

Apply to:

- `com.readmates.session.application..`
- `com.readmates.publication.application..`
- `com.readmates.archive.application..`
- `com.readmates.feedback.application..`
- `com.readmates.note.application..`
- `com.readmates.auth.application..`

- [ ] **Step 2: Add shared web adapter rule**

Include `shared.adapter.in.web` in the web adapter dependency rule.

- [ ] **Step 3: Remove stale exceptions from architecture docs**

Update `docs/development/architecture.md` so it no longer says archive/feedback bridges, `note.api`, `shared.api`, or auth application JDBC are current exceptions.

- [ ] **Step 4: Validate strengthened boundaries**

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
rg -n "JdbcTemplate|query\\(|queryForObject|org\\.springframework\\.jdbc" server/src/main/kotlin/com/readmates/*/application
rg -n "package com\\.readmates\\..*\\.api" server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/shared
```

Expected:

- architecture tests pass
- no JDBC hits under migrated application packages
- no `note.api` or `shared.api` packages remain

- [ ] **Step 5: Commit boundary hardening**

```bash
git add server/src/test/kotlin/com/readmates/architecture docs/development/architecture.md docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "test: harden server architecture boundaries"
```

## Task 8: Final Validation And Documentation

**Files:**

- Modify: `docs/development/architecture.md`
- Modify: this plan
- Modify if needed: `README.md`

- [ ] **Step 1: Run full server test suite**

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Run final legacy risk scan**

```bash
rg -n "JdbcTemplate|query\\(|queryForObject|org\\.springframework\\.jdbc" server/src/main/kotlin/com/readmates/*/application
rg -n "package com\\.readmates\\..*\\.api" server/src/main/kotlin/com/readmates/note server/src/main/kotlin/com/readmates/shared
rg -n "Legacy.*Adapter|Legacy.*Repository" server/src/main/kotlin/com/readmates/archive server/src/main/kotlin/com/readmates/feedback
```

Expected:

- no application JDBC hits in migrated packages
- no `note.api` or `shared.api`
- no archive/feedback `Legacy*` bridge classes

- [ ] **Step 3: Update architecture docs**

Update `docs/development/architecture.md` and `README.md` if they still mention the old residual risks as current exceptions.

- [ ] **Step 4: Commit final docs**

```bash
git add docs/development/architecture.md README.md docs/superpowers/plans/2026-04-23-server-legacy-risk-cleanup-implementation-plan.md
git commit -m "docs: record server legacy risk cleanup"
```

Only include `README.md` if it actually changed.

## Final Acceptance Checklist

- [ ] Archive application package no longer owns JDBC query orchestration for archive API paths.
- [ ] Feedback application package no longer owns JDBC query orchestration.
- [ ] `note.api.NotesFeedController` is gone; notes feed uses note web/application/port/persistence boundaries.
- [ ] `shared.api.HealthController` is gone or no `shared.api` package remains.
- [ ] Auth operational application services no longer import Spring JDBC.
- [ ] `PasswordAuthController` depends on a logout/session cleanup inbound port, not `AuthSessionService`.
- [ ] Boundary tests include auth application in stricter application rules.
- [ ] Boundary tests ban JDBC dependencies from migrated application packages.
- [ ] API route paths, JSON response shapes, HTTP statuses, auth behavior, and DB schema are preserved.
- [ ] `./server/gradlew -p server clean test` passes.

## Known Follow-Ups

None expected after this plan. If a task discovers an auth path whose persistence extraction would require behavior redesign, stop and write a blocker note instead of changing policy.
