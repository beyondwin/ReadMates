# ReadMates Server Clean Architecture Restructure Implementation Plan

작성일: 2026-04-23
상태: READY FOR REVIEW

> **For agentic workers:** Implement task-by-task. Keep API routes, response shapes, auth behavior, DB schema, and user-visible behavior intact unless a task explicitly says otherwise. Update checkboxes as work completes. Preserve unrelated worktree changes.

## Goal

Refactor the ReadMates Spring Boot server into a consistent feature-level clean architecture structure while preserving existing API contracts.

Primary outcomes:

1. Controllers become thin HTTP adapters.
2. Request/response DTOs move out of large controller files into web adapter DTO files.
3. Controllers no longer depend directly on `JdbcTemplate`, SQL, repositories, or persistence adapters.
4. Application services own use case orchestration and authorization decisions.
5. Persistence adapters own SQL and DB row mapping.
6. ArchUnit tests enforce the dependency boundaries across the migrated server packages.

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-23-server-clean-architecture-restructure-design.md`
- Existing server architecture doc: `docs/development/architecture.md`
- Existing first slice plan: `docs/superpowers/plans/2026-04-23-readmates-session-member-write-clean-architecture-plan.md`
- Existing boundary test: `server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt`

## Scope Guardrails

- Do not change API route paths.
- Do not change response field names or JSON shape.
- Do not change HTTP status behavior unless a current test proves it is already wrong.
- Do not change DB schema or Flyway migrations.
- Do not tune SQL while moving it.
- Do not redesign auth policy while moving auth code.
- Do not remove legacy repositories just because a wrapper port exists.
- Do not move every feature in one commit.
- Do not edit frontend files for this server architecture migration.
- Preserve package compatibility only when tests or Spring wiring require it during a transition.

## Dirty Worktree Guardrails

At plan creation time, the worktree was clean after the design spec commit.

Implementation workers must still check status before editing:

```bash
git status --short --untracked-files=all
```

If unrelated dirty files appear, do not revert them. If a task needs to edit a dirty file, inspect it first:

```bash
git diff -- <path>
```

Preserve unrelated edits in that file.

## Target Architecture

Each feature should converge on this package shape:

```text
com.readmates.<feature>
  adapter.in.web
  adapter.out.persistence
  application.model
  application.port.in
  application.port.out
  application.service
  domain
```

Allowed dependency direction:

```text
adapter.in.web -> application.port.in
application.service -> application.port.out
application.service -> application.model/domain
adapter.out.persistence -> application.port.out
adapter.out.persistence -> application.model/domain
```

Disallowed dependency direction:

```text
adapter.in.web -> JdbcTemplate
adapter.in.web -> *Repository
adapter.in.web -> adapter.out.persistence
application -> adapter.in.web
application -> adapter.out.persistence
domain -> adapter/application/web/persistence
```

## Target File Map

### Publication

- Move/create: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicController.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicWebDtos.kt`
- Create if useful: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicWebMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/model/PublicResults.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/in/PublicUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/out/LoadPublishedPublicDataPort.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Create if row count warrants it: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/PublicRows.kt`
- Modify tests under: `server/src/test/kotlin/com/readmates/publication/api/*`

### Architecture Boundary

- Modify or replace: `server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt`
- Preferred final name: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Archive

- Move/create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveController.kt`
- Move/create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/MyPageController.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt`
- Create if useful: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/port/in/ArchiveUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/port/out/LoadArchiveDataPort.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/service/ArchiveQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/LegacyArchiveQueryAdapter.kt`
- Modify tests under: `server/src/test/kotlin/com/readmates/archive/api/*`

### Feedback

- Move/create: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentController.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentUploadValidator.kt`
- Create if useful: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentWebMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentCommands.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentResults.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/port/in/FeedbackDocumentUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/LegacyFeedbackDocumentAdapter.kt`
- Modify tests under: `server/src/test/kotlin/com/readmates/feedback/api/*`

### Auth

- Move legacy web controllers incrementally from `auth.api` to `auth.adapter.in.web` where appropriate.
- Keep existing `auth.adapter.in.security`, `auth.adapter.out.persistence`, and `auth.infrastructure.security` boundaries unless a focused auth task says otherwise.
- Create use case ports and application services for operational auth APIs before moving controllers.
- Modify tests under: `server/src/test/kotlin/com/readmates/auth/api/*`

### Session And Note Finish

- Keep already migrated controller packages under:
  - `server/src/main/kotlin/com/readmates/session/adapter/in/web`
  - `server/src/main/kotlin/com/readmates/note/adapter/in/web`
- Extract large DTO groups to `*WebDtos.kt` as needed.
- Extract mapping to `*WebMapper.kt` only when controller mapping becomes non-trivial.
- Update existing session/note tests only for package/import changes.

## Task 0: Capture Baseline

**Files:** none expected.

- [ ] **Step 1: Confirm worktree status**

Run:

```bash
git status --short --untracked-files=all
```

Expected: no server files are dirty before implementation starts. If server files are dirty, inspect:

```bash
git diff -- server
```

Record any relevant server dirty-file notes in this plan before editing.

- [ ] **Step 2: Run server baseline tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.publication.*'
./server/gradlew -p server test --tests 'com.readmates.archive.*'
./server/gradlew -p server test --tests 'com.readmates.feedback.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS. If a check fails before architecture edits, add a `Baseline Failures` section with the command and concise failure summary.

- [ ] **Step 3: Capture current controller size and DTO counts**

Run:

```bash
wc -l server/src/main/kotlin/com/readmates/publication/api/PublicController.kt \
  server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt \
  server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt

for f in server/src/main/kotlin/com/readmates/*/api/*.kt server/src/main/kotlin/com/readmates/*/adapter/in/web/*.kt; do
  [ -f "$f" ] && printf '%2s %4s %s\n' "$(rg -c '^data class ' "$f" || true)" "$(wc -l < "$f")" "$f"
done | sort -nr | sed -n '1,40p'
```

Expected: output confirms the first refactoring targets. Do not edit files in this step.

## Task 1: Migrate Publication Read API

**Files:**

- Move/create: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicController.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/model/PublicResults.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/in/PublicUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/port/out/LoadPublishedPublicDataPort.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`

- [ ] **Step 1: Move response DTOs to the web adapter**

Create `PublicWebDtos.kt` under `publication.adapter.in.web` with the existing public response DTOs:

- `PublicClubResponse`
- `PublicClubStats`
- `PublicSessionListItem`
- `PublicSessionDetailResponse`
- `PublicHighlight`
- `PublicOneLiner`

Keep field names and types unchanged.

- [ ] **Step 2: Introduce application result models**

Create `PublicResults.kt` with application-owned result names such as:

- `PublicClubResult`
- `PublicClubStatsResult`
- `PublicSessionSummaryResult`
- `PublicSessionDetailResult`
- `PublicHighlightResult`
- `PublicOneLinerResult`

Do not use `Request` or `Response` suffixes in application model names.

- [ ] **Step 3: Add inbound use case ports**

Create `PublicUseCases.kt` with:

```kotlin
interface GetPublicClubUseCase {
    fun getClub(): PublicClubResult
}

interface GetPublicSessionUseCase {
    fun getSession(sessionId: UUID): PublicSessionDetailResult?
}
```

Use `UUID` in the use case contract. Keep path string parsing in the controller.

- [ ] **Step 4: Add outbound data port**

Create `LoadPublishedPublicDataPort.kt`. The port should expose application-level methods needed by `PublicQueryService`, not JDBC details.

Good shape:

```kotlin
interface LoadPublishedPublicDataPort {
    fun loadClub(): PublicClubResult?
    fun loadSession(sessionId: UUID): PublicSessionDetailResult?
}
```

If keeping all assembly in the adapter is simpler for this read API, allow the adapter to return application result models directly. Do not expose `JdbcTemplate`, `ResultSet`, or DB row types through the port.

- [ ] **Step 5: Move SQL into `JdbcPublicQueryAdapter`**

Move existing SQL and row mapping from `PublicController` into `JdbcPublicQueryAdapter`.

Preserve:

- published-only session filtering
- public publication filtering
- highlight count rules
- one-liner count rules
- `reading-sai` club slug lookup
- UUID string conversion
- date string conversion

- [ ] **Step 6: Add `PublicQueryService`**

Implement `GetPublicClubUseCase` and `GetPublicSessionUseCase`.

Behavior:

- `getClub()` returns the loaded club or throws `ResponseStatusException(HttpStatus.NOT_FOUND)` only if the current code's not-found behavior is easier to preserve there. Prefer returning nullable from the port and deciding HTTP status in the controller.
- `getSession(sessionId)` returns nullable so the controller can map not-found to the existing HTTP status.

- [ ] **Step 7: Move controller to `adapter.in.web`**

Move `PublicController` to `publication.adapter.in.web`.

Controller responsibilities:

- parse `sessionId` string to `UUID`
- map invalid UUID to the existing not-found behavior
- call use case ports
- map application results to web responses
- throw `ResponseStatusException(HttpStatus.NOT_FOUND)` where current behavior requires it

Controller must not import:

- `JdbcTemplate`
- `ObjectProvider`
- `com.readmates.shared.db.*`
- `publication.adapter.out.persistence.*`

- [ ] **Step 8: Update tests for package movement**

Update publication tests only as needed for package/import changes. Do not weaken API assertions.

- [ ] **Step 9: Validate publication slice**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.publication.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS.

- [ ] **Step 10: Commit publication migration**

Commit only publication and required architecture/test package changes:

```bash
git status --short
git add server/src/main/kotlin/com/readmates/publication server/src/test/kotlin/com/readmates/publication
git commit -m "refactor: move public API behind use cases"
```

## Task 2: Expand Server Architecture Boundary Tests

**Files:**

- Rename/modify: `server/src/test/kotlin/com/readmates/architecture/SessionCleanArchitectureBoundaryTest.kt`
- Preferred create: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Preserve current session/note rules**

Keep the current migrated web adapter restrictions for `session.adapter.in.web` and `note.adapter.in.web`.

- [ ] **Step 2: Add general migrated web adapter rule**

For packages that have moved to `adapter.in.web`, assert no class depends on:

- `org.springframework.jdbc..`
- classes with simple name ending in `Repository`
- `..adapter.out.persistence..`

Include `publication.adapter.in.web` after Task 1.

- [ ] **Step 3: Add application-to-adapter rule**

Assert classes under migrated feature application packages do not depend on:

- `..adapter.in.web..`
- `..adapter.out.persistence..`

At this stage include `session`, `note`, and `publication`.

- [ ] **Step 4: Add domain independence rule**

Assert classes under `..domain..` do not depend on:

- `..adapter..`
- `org.springframework.web..`
- `org.springframework.jdbc..`

Avoid over-blocking existing Spring Security or JPA annotations unless the imported classes show this rule is too broad.

- [ ] **Step 5: Validate boundary tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS.

- [ ] **Step 6: Commit boundary tests**

```bash
git add server/src/test/kotlin/com/readmates/architecture
git commit -m "test: expand server architecture boundaries"
```

## Task 3: Migrate Archive Read APIs

**Files:**

- Move/create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveController.kt`
- Move/create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/MyPageController.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt`
- Create if useful: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/port/in/ArchiveUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/port/out/LoadArchiveDataPort.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/service/ArchiveQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/LegacyArchiveQueryAdapter.kt`
- Modify archive tests under `server/src/test/kotlin/com/readmates/archive/api`

- [ ] **Step 1: Move archive web DTOs**

Move all archive and my-page response DTOs into `ArchiveWebDtos.kt`.

Keep JSON field names, `@JsonProperty`, nullability, and list ordering unchanged.

- [ ] **Step 2: Create archive application result models**

Create result models that mirror the current API data but avoid `Response` suffixes.

Use names such as:

- `ArchiveSessionResult`
- `MemberArchiveSessionDetailResult`
- `MemberArchiveQuestionResult`
- `MyPageResult`

- [ ] **Step 3: Add archive use case ports**

Create ports for current operations:

- list archive sessions
- get archive session detail
- list my questions
- list my reviews
- get my page summary

- [ ] **Step 4: Move access checks into application service**

Move member app access checks from controllers into `ArchiveQueryService`.

Preferred controller input:

- Use `CurrentMember` argument resolver for authenticated endpoints.

If an endpoint still receives `Authentication?`, keep that only as a short transitional step and record why in a code comment or plan note.

- [ ] **Step 5: Wrap existing repositories behind outbound port**

Create `LegacyArchiveQueryAdapter` that delegates to existing archive query repositories.

The adapter may call existing repository methods during this migration. The controller must not.

- [ ] **Step 6: Move controllers to `archive.adapter.in.web`**

Controllers should:

- receive `CurrentMember`
- parse path UUIDs
- call use cases
- map application results to web DTOs
- map missing details to existing HTTP status

- [ ] **Step 7: Include archive in boundary tests**

Update architecture boundary tests so `archive.adapter.in.web` follows the same web adapter restrictions.

- [ ] **Step 8: Validate archive slice**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS.

- [ ] **Step 9: Commit archive migration**

```bash
git add server/src/main/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/architecture
git commit -m "refactor: move archive APIs behind use cases"
```

## Task 4: Migrate Feedback Document APIs

**Files:**

- Move/create: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentController.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentWebDtos.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentUploadValidator.kt`
- Create if useful: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentWebMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentCommands.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/model/FeedbackDocumentResults.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/port/in/FeedbackDocumentUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Create: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/LegacyFeedbackDocumentAdapter.kt`
- Modify feedback tests under `server/src/test/kotlin/com/readmates/feedback/api`

- [ ] **Step 1: Move feedback web DTOs**

Move current list/detail/status response DTOs into `FeedbackDocumentWebDtos.kt`.

Keep existing nested structure and field names unchanged.

- [ ] **Step 2: Extract upload validation**

Create `FeedbackDocumentUploadValidator` for:

- missing filename
- filename length
- slash and NUL rejection
- `.md` and `.txt` extension allowlist
- content type selection
- empty file rejection
- 512KB size limit
- UTF-8 decoding
- NUL content rejection

Keep existing Korean error messages unchanged.

- [ ] **Step 3: Add application command/result models**

Create upload command/result models. The upload command should contain already validated text/file metadata, not `MultipartFile`.

Application service must not import `MultipartFile`.

- [ ] **Step 4: Add use case ports**

Create use cases for:

- list my readable feedback documents
- get readable feedback document
- get host feedback document status
- upload host feedback document

- [ ] **Step 5: Move authorization and orchestration into service**

Move full-member, viewer, host, attendance-readable, and upload orchestration checks into `FeedbackDocumentService`.

Controller keeps:

- path UUID parsing
- multipart extraction
- validator call
- use case call
- web response mapping

- [ ] **Step 6: Wrap existing repository behind outbound port**

Create `LegacyFeedbackDocumentAdapter` around `FeedbackDocumentRepository`.

The parser may remain in application or behind the port depending on current repository responsibilities. Do not let the controller call parser or repository directly.

- [ ] **Step 7: Include feedback in boundary tests**

Update architecture boundary tests so `feedback.adapter.in.web` follows the same web adapter restrictions.

- [ ] **Step 8: Validate feedback slice**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS.

- [ ] **Step 9: Commit feedback migration**

```bash
git add server/src/main/kotlin/com/readmates/feedback server/src/test/kotlin/com/readmates/feedback server/src/test/kotlin/com/readmates/architecture
git commit -m "refactor: move feedback document APIs behind use cases"
```

## Task 5: Migrate Auth Web Controllers Incrementally

**Files:**

- Existing auth files under `server/src/main/kotlin/com/readmates/auth/api`
- Target web adapter files under `server/src/main/kotlin/com/readmates/auth/adapter/in/web`
- Existing security files under `server/src/main/kotlin/com/readmates/auth/adapter/in/security`
- Existing auth application files under `server/src/main/kotlin/com/readmates/auth/application`
- Auth tests under `server/src/test/kotlin/com/readmates/auth/api`

- [ ] **Step 1: Classify auth controllers**

Classify each `auth.api` controller into one of:

- operational member/invitation API
- dev-only API
- disabled password endpoint
- OAuth/security infrastructure endpoint

Record the classification in this plan or a short note before moving files.

- [ ] **Step 2: Move operational APIs first**

For host invitations, member approval/lifecycle, self membership, pending approval, and auth me endpoints:

- create inbound ports if missing
- move orchestration to application services
- move web DTOs to `auth.adapter.in.web`
- move controllers to `auth.adapter.in.web`

- [ ] **Step 3: Preserve explicit exceptions**

For dev-only and disabled password endpoints, either:

- move them to `auth.adapter.in.web` with clear names, or
- leave a documented legacy exception if moving them adds noise without architectural value.

Do not change current `410 Gone` password behavior.

- [ ] **Step 4: Keep security infrastructure separate**

Do not force security filters and OAuth services into `adapter.in.web`. Keep `auth.infrastructure.security` and `auth.adapter.in.security` unless a focused security refactor is planned.

- [ ] **Step 5: Include migrated auth web adapters in boundary tests**

Add only migrated auth web packages to the general web adapter rule. Avoid applying rules to deliberately exempt security infrastructure.

- [ ] **Step 6: Validate auth slice**

Run focused auth tests relevant to moved controllers:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS.

- [ ] **Step 7: Commit auth migration**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/architecture
git commit -m "refactor: align auth web APIs with application ports"
```

## Task 6: Finish Session And Note Web Adapter Cleanup

**Files:**

- Existing files under `server/src/main/kotlin/com/readmates/session/adapter/in/web`
- Existing files under `server/src/main/kotlin/com/readmates/note/adapter/in/web`
- Existing session/note tests under `server/src/test/kotlin/com/readmates/session/api` and `server/src/test/kotlin/com/readmates/note/api`

- [ ] **Step 1: Identify DTO-heavy migrated controllers**

Run:

```bash
for f in server/src/main/kotlin/com/readmates/session/adapter/in/web/*.kt server/src/main/kotlin/com/readmates/note/adapter/in/web/*.kt; do
  [ -f "$f" ] && printf '%2s %4s %s\n' "$(rg -c '^data class ' "$f" || true)" "$(wc -l < "$f")" "$f"
done | sort -nr
```

- [ ] **Step 2: Extract web DTO files where useful**

Extract DTOs from controllers with several request/response classes, especially:

- `HostSessionController`
- `QuestionController`
- `ReviewController`

Do not extract tiny one-off DTOs if it makes the code harder to navigate.

- [ ] **Step 3: Extract web mapper files only where mapping is non-trivial**

Create `*WebMapper.kt` only if controller mapping has nested lists or several repeated conversions.

- [ ] **Step 4: Validate migrated session/note tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.*'
./server/gradlew -p server test --tests 'com.readmates.note.*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
```

Expected: PASS.

- [ ] **Step 5: Commit session/note cleanup**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/note server/src/test/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/note server/src/test/kotlin/com/readmates/architecture
git commit -m "refactor: finish server web adapter DTO cleanup"
```

## Task 7: Final Server Validation And Documentation

**Files:**

- Modify if needed: `docs/development/architecture.md`
- Modify if needed: `README.md`
- Modify if needed: this plan

- [ ] **Step 1: Run full server test suite**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Search for remaining legacy controller issues**

Run:

```bash
rg -n "JdbcTemplate|query\\(|queryForObject|data class" server/src/main/kotlin/com/readmates/*/api server/src/main/kotlin/com/readmates/*/adapter/in/web
```

Expected:

- no `JdbcTemplate` or SQL query calls in web controllers
- remaining `data class` entries are small DTOs or documented exceptions

- [ ] **Step 3: Update architecture docs**

Update `docs/development/architecture.md` if the server internal structure section still describes the migration as limited to session/note only.

Keep the docs concise. Do not duplicate this whole implementation plan.

- [ ] **Step 4: Commit final docs**

```bash
git add docs/development/architecture.md README.md docs/superpowers/plans/2026-04-23-server-clean-architecture-restructure-implementation-plan.md
git commit -m "docs: update server architecture migration notes"
```

Only include `README.md` if it actually changed.

## Final Acceptance Checklist

- [ ] `publication` controller no longer owns SQL or `JdbcTemplate`.
- [ ] `archive` controllers no longer own repository lookup or member-app access orchestration.
- [ ] `feedback` controller no longer owns upload orchestration or repository calls.
- [ ] migrated auth web controllers depend on use case ports.
- [ ] `session` and `note` DTO cleanup is complete where useful.
- [ ] boundary tests cover migrated web adapters and application packages.
- [ ] existing API routes and JSON contracts are preserved.
- [ ] `./server/gradlew -p server clean test` passes.

## Known Follow-Ups

- Remove legacy repository adapters only after every dependent feature has moved behind ports.
- Consider stricter ArchUnit rules for DTO naming after all legacy controllers are migrated.
- Consider package-level documentation after the final structure stabilizes.
