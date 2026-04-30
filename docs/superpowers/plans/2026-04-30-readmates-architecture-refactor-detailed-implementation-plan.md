# ReadMates Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unbounded list APIs with cursor pagination, tighten server/frontend architectural boundaries, add DB/transaction performance guardrails, and remove remaining legacy frontend/BFF structure without preserving old array contracts.

**Architecture:** Keep the existing React/Vite/Cloudflare BFF and single-module Kotlin Spring Boot architecture. Make breaking API contract changes in server and frontend together, keep feature-local clean architecture boundaries, and verify DB changes with targeted tests before broad refactors.

**Tech Stack:** Kotlin, Spring Boot, JdbcTemplate, Flyway, MySQL/Testcontainers, JUnit/MockMvc, React, React Router 7, Vite, Vitest, Cloudflare Pages Functions, TypeScript.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-30-readmates-architecture-refactor-design.md`
- Server guide: `docs/agents/server.md`
- Frontend guide: `docs/agents/front.md`
- Docs guide: `docs/agents/docs.md`
- Architecture guide: `docs/development/architecture.md`
- Existing server boundary test: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Existing frontend boundary test: `front/tests/unit/frontend-boundaries.test.ts`

## Scope Check

The spec covers several related subsystems. Execute this plan in order and stop after each phase if tests fail. The first four phases are the product-facing breaking contract change: cursor pagination. Later phases are architecture hardening and cleanup. Do not start frontend legacy cleanup before paged contracts are green, because the route data shapes will change under the same files.

## Guardrails

- Do not preserve old array response contracts for the paged endpoints.
- Do not add compatibility endpoints such as `/page` variants.
- Do not rewrite old Flyway migrations. Add new migrations only.
- Do not add real member data, secrets, private domains, deployment state, local absolute paths, OCIDs, or token-shaped examples.
- Do not stage unrelated dirty files.
- Prefer one commit per completed task or phase.
- If a task edits a file with existing unrelated changes, inspect `git diff -- <file>` first and preserve those changes.

## Target File Map

### Server Shared Pagination

- Create: `server/src/main/kotlin/com/readmates/shared/paging/CursorPage.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/paging/CursorCodec.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/paging/CursorCodecTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Archive, Feedback, Notes Pagination

- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/port/in/ArchiveUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/port/out/LoadArchiveDataPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/service/ArchiveQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentController.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentWebMapper.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/in/FeedbackDocumentUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/in/web/NotesFeedController.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/in/web/NotesFeedWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/application/port/in/NotesFeedUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/application/port/out/LoadNotesFeedPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Modify tests under `server/src/test/kotlin/com/readmates/archive/api/`, `server/src/test/kotlin/com/readmates/feedback/api/`, and `server/src/test/kotlin/com/readmates/note/api/`

### Host, Notification, Admin Pagination

- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/HostInvitationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/HostMemberApprovalController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthWebUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/HostInvitationStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberLifecycleStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberApprovalStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcHostInvitationStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberApprovalStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberLifecycleStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/MemberNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/MemberNotificationPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventOutboxPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationTestMailAuditPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/MemberNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostNotificationOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationTestMailService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcMemberNotificationAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationTestMailAuditAdapter.kt`

### Frontend Paged Contracts

- Create: `front/shared/model/paging.ts`
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Modify: `front/features/archive/route/archive-list-data.ts`
- Modify: `front/features/archive/route/notes-feed-data.ts`
- Modify: `front/features/archive/route/my-page-data.ts`
- Modify: `front/features/archive/ui/archive-page.tsx`
- Modify: `front/features/archive/ui/notes-feed-page.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/feedback/api/feedback-contracts.ts`
- Modify: `front/features/feedback/api/feedback-api.ts`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-dashboard-data.ts`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/features/host/route/host-invitations-data.ts`
- Modify: `front/features/host/route/host-invitations-route.tsx`
- Modify: `front/features/host/route/host-members-data.ts`
- Modify: `front/features/host/route/host-members-route.tsx`
- Modify: `front/features/host/route/host-notifications-data.ts`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/components/*` first, then move to `front/features/host/ui/*`
- Modify: `front/features/notifications/api/notifications-contracts.ts`
- Modify: `front/features/notifications/api/notifications-api.ts`
- Modify: `front/features/notifications/route/member-notifications-data.ts`
- Modify tests under `front/tests/unit/`

### Architecture Hardening

- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/TrustedReturnHostPort.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcTrustedReturnHostAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`
- Create: `front/functions/_shared/proxy.ts`
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/functions/oauth2/authorization/[[registrationId]].ts`
- Modify: `front/functions/login/oauth2/code/[[registrationId]].ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts`

## Task 0: Baseline And Branch State

**Files:** none.

- [x] **Step 1: Confirm worktree state**

Run:

```bash
git status --short --branch
```

Expected: Git prints the current branch. If tracked files are modified, inspect them and do not revert unrelated work.

- [x] **Step 2: Run current targeted architecture baselines**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
pnpm --dir front test -- --run tests/unit/frontend-boundaries.test.ts tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts
```

Expected: all selected tests pass.

- [x] **Step 3: Run current full smoke baselines if time allows**

Run:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass. If a baseline fails before edits, record the failing command and stop for triage.

COMPACT CHECKPOINT Task 0 - Baseline And Branch State:
Acceptance criteria completed: worktree branch/status confirmed on `codex/readmates-architecture-refactor`; server architecture boundary baseline passed; frontend boundary/BFF/OAuth targeted baseline passed with the corrected Vitest invocation; full server/frontend smoke passed. Changed files: this plan document only. Key decision: the plan's `pnpm --dir front test -- --run ...` form runs broader Vitest selection because the package script already includes `vitest run`; recorded and used `pnpm --dir front test --run ...` for the intended targeted files, then verified full `pnpm --dir front test` passed. Contracts/API/state/test expectations: no code contracts changed. Reviews: Task 0 spec review approved; Task 0 process/code-quality review approved; no issues left open. Verification: `git status --short --branch` -> `## codex/readmates-architecture-refactor`; `./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest` passed; `pnpm --dir front test --run tests/unit/frontend-boundaries.test.ts tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts` passed 36 tests; `./server/gradlew -p server clean test` passed; `pnpm --dir front lint` passed; `pnpm --dir front test` passed 607 tests; `pnpm --dir front build` passed. Remaining risks: one transient all-suite run failure was observed before full suite passed; monitor if it recurs. Next first action: dispatch Task 1 implementer for shared cursor pagination primitives. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed subagents closed; no session-owned ports open.

## Task 1: Add Shared Cursor Pagination Foundation

**Files:**

- Create: `server/src/main/kotlin/com/readmates/shared/paging/CursorPage.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/paging/CursorCodec.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/paging/CursorCodecTest.kt`
- Create: `front/shared/model/paging.ts`
- Modify: `front/tests/unit/api-contract-fixtures.test.ts`

- [x] **Step 1: Write server cursor codec tests**

Create `server/src/test/kotlin/com/readmates/shared/paging/CursorCodecTest.kt`:

```kotlin
package com.readmates.shared.paging

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class CursorCodecTest {
    @Test
    fun `round trips cursor values`() {
        val cursor = CursorCodec.encode(
            mapOf(
                "number" to "12",
                "id" to "00000000-0000-0000-0000-000000000012",
            ),
        )

        assertEquals(
            mapOf(
                "id" to "00000000-0000-0000-0000-000000000012",
                "number" to "12",
            ),
            CursorCodec.decode(cursor),
        )
    }

    @Test
    fun `returns null for blank and invalid cursors`() {
        assertNull(CursorCodec.decode(null))
        assertNull(CursorCodec.decode(""))
        assertNull(CursorCodec.decode("not-base64"))
    }

    @Test
    fun `clamps limits to configured bounds`() {
        assertEquals(30, PageRequest.cursor(null, null, defaultLimit = 30, maxLimit = 100).limit)
        assertEquals(1, PageRequest.cursor(0, null, defaultLimit = 30, maxLimit = 100).limit)
        assertEquals(100, PageRequest.cursor(500, null, defaultLimit = 30, maxLimit = 100).limit)
    }
}
```

- [x] **Step 2: Run the failing test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.shared.paging.CursorCodecTest
```

Expected: fail because `CursorCodec`, `CursorPage`, and `PageRequest` do not exist.

- [x] **Step 3: Add server paging primitives**

Create `server/src/main/kotlin/com/readmates/shared/paging/CursorPage.kt`:

```kotlin
package com.readmates.shared.paging

data class CursorPage<T>(
    val items: List<T>,
    val nextCursor: String?,
)

data class PageRequest(
    val limit: Int,
    val cursor: Map<String, String>,
) {
    companion object {
        fun cursor(
            requestedLimit: Int?,
            rawCursor: String?,
            defaultLimit: Int,
            maxLimit: Int,
        ): PageRequest {
            val normalizedLimit = (requestedLimit ?: defaultLimit).coerceIn(1, maxLimit)
            return PageRequest(
                limit = normalizedLimit,
                cursor = CursorCodec.decode(rawCursor) ?: emptyMap(),
            )
        }
    }
}
```

Create `server/src/main/kotlin/com/readmates/shared/paging/CursorCodec.kt`:

```kotlin
package com.readmates.shared.paging

import java.nio.charset.StandardCharsets
import java.util.Base64

object CursorCodec {
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val decoder = Base64.getUrlDecoder()

    fun encode(values: Map<String, String>): String? {
        if (values.isEmpty()) {
            return null
        }
        val payload = values
            .toSortedMap()
            .entries
            .joinToString("&") { (key, value) -> "${escape(key)}=${escape(value)}" }
        return encoder.encodeToString(payload.toByteArray(StandardCharsets.UTF_8))
    }

    fun decode(cursor: String?): Map<String, String>? {
        val normalized = cursor?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val payload = try {
            String(decoder.decode(normalized), StandardCharsets.UTF_8)
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (payload.isBlank()) {
            return null
        }
        return payload.split("&")
            .mapNotNull { part ->
                val index = part.indexOf("=")
                if (index <= 0) {
                    null
                } else {
                    unescape(part.substring(0, index)) to unescape(part.substring(index + 1))
                }
            }
            .toMap()
            .takeIf { it.isNotEmpty() }
    }

    private fun escape(value: String): String =
        value
            .replace("%", "%25")
            .replace("&", "%26")
            .replace("=", "%3D")

    private fun unescape(value: String): String =
        value
            .replace("%3D", "=")
            .replace("%26", "&")
            .replace("%25", "%")
}
```

- [x] **Step 4: Add frontend shared paged type**

Create `front/shared/model/paging.ts`:

```ts
export type PagedResponse<T> = {
  items: T[];
  nextCursor: string | null;
};

export type PageRequest = {
  limit?: number;
  cursor?: string | null;
};

export function pagingSearchParams(request?: PageRequest): string {
  const params = new URLSearchParams();
  if (request?.limit !== undefined) {
    params.set("limit", String(request.limit));
  }
  if (request?.cursor) {
    params.set("cursor", request.cursor);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}
```

- [x] **Step 5: Run foundation tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.shared.paging.CursorCodecTest
pnpm --dir front test -- --run tests/unit/api-contract-fixtures.test.ts
```

Expected: pass.

- [x] **Step 6: Commit foundation**

Run:

```bash
git add server/src/main/kotlin/com/readmates/shared/paging server/src/test/kotlin/com/readmates/shared/paging front/shared/model/paging.ts
git commit -m "feat: add cursor pagination primitives"
```

COMPACT CHECKPOINT Task 1 - Add Shared Cursor Pagination Foundation:
Acceptance criteria completed: server cursor codec test was written first and failed red before primitives existed; server `CursorPage`, `PageRequest`, and `CursorCodec` added; frontend `PagedResponse`, `PageRequest`, and `pagingSearchParams` added; foundation checks passed; implementation committed as `39fa2b4b19925c716842f065731aadb44ae0002e`. Changed files: `server/src/main/kotlin/com/readmates/shared/paging/CursorPage.kt`, `server/src/main/kotlin/com/readmates/shared/paging/CursorCodec.kt`, `server/src/test/kotlin/com/readmates/shared/paging/CursorCodecTest.kt`, `front/shared/model/paging.ts`, and this plan document. Key decision: `front/tests/unit/api-contract-fixtures.test.ts` was not changed because Task 1 only adds shared primitives and the existing fixture test remained the targeted frontend guard. Contracts/API/state/test expectations: server cursors are opaque URL-safe Base64 values with deterministic key ordering and invalid/blank decode to null; page limits clamp into `[1, maxLimit]`; frontend page helper emits query strings only for provided `limit` and non-empty `cursor`. Reviews: Task 1 spec review approved; Task 1 code-quality review approved; no review issues open. Verification: red `./server/gradlew -p server test --tests com.readmates.shared.paging.CursorCodecTest` failed with unresolved `CursorCodec`/`PageRequest`; green same command passed; `pnpm --dir front test --run tests/unit/api-contract-fixtures.test.ts` passed; `pnpm --dir front lint` passed; reviewers also ran `./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest` and `git show --check 39fa2b4b19925c716842f065731aadb44ae0002e`, both passed. Remaining risks: none known for the foundation slice; future tasks must validate cursor predicates per endpoint. Next first action: dispatch Task 2 implementer for archive, feedback, and notes server paged contracts. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 1 subagents closed; no session-owned ports open.

## Task 2: Convert Archive, Feedback, And Notes Server APIs To Paged Contracts

**Files:**

- Modify archive, feedback, and note files listed in the Target File Map.
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/archive/api/MemberArchiveReviewControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/QuestionControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`

- [x] **Step 1: Write archive sessions paged response test**

In `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt`, add a test that asserts `GET /api/archive/sessions` returns an object with `items` and `nextCursor`:

```kotlin
@Test
fun `archive sessions returns cursor page`() {
    mockMvc.get("/api/archive/sessions?limit=2") {
        with(activeMember())
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }
        .andExpect { status { isOk() } }
        .andExpect { jsonPath("$.items") { isArray() } }
        .andExpect { jsonPath("$.nextCursor") { exists() } }
        .andExpect { jsonPath("$.items.length()") { value(2) } }
}
```

Use the existing auth helper name from the same test file. If the helper has a different name, use that helper instead of creating a new auth mechanism.

- [x] **Step 2: Change archive inbound port signatures**

In `server/src/main/kotlin/com/readmates/archive/application/port/in/ArchiveUseCases.kt`, change list use cases to accept `PageRequest` and return `CursorPage`:

```kotlin
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest

interface ListArchiveSessionsUseCase {
    fun listArchiveSessions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<ArchiveSessionResult>
}

interface ListMyArchiveQuestionsUseCase {
    fun listMyQuestions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveQuestionResult>
}

interface ListMyArchiveReviewsUseCase {
    fun listMyReviews(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveReviewResult>
}
```

- [x] **Step 3: Change archive controller to parse pagination**

In `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveController.kt`, update list endpoints:

```kotlin
@GetMapping("/sessions")
fun sessions(
    currentMember: CurrentMember,
    @RequestParam(required = false) limit: Int?,
    @RequestParam(required = false) cursor: String?,
): CursorPageResponse<ArchiveSessionItem> =
    listArchiveSessionsUseCase
        .listArchiveSessions(currentMember, PageRequest.cursor(limit, cursor, defaultLimit = 30, maxLimit = 100))
        .mapItems { it.toWebDto() }

@GetMapping("/me/questions")
fun myQuestions(
    currentMember: CurrentMember,
    @RequestParam(required = false) limit: Int?,
    @RequestParam(required = false) cursor: String?,
): CursorPageResponse<MyArchiveQuestionItem> =
    listMyArchiveQuestionsUseCase
        .listMyQuestions(currentMember, PageRequest.cursor(limit, cursor, defaultLimit = 30, maxLimit = 100))
        .mapItems { it.toWebDto() }

@GetMapping("/me/reviews")
fun myReviews(
    currentMember: CurrentMember,
    @RequestParam(required = false) limit: Int?,
    @RequestParam(required = false) cursor: String?,
): CursorPageResponse<MyArchiveReviewItem> =
    listMyArchiveReviewsUseCase
        .listMyReviews(currentMember, PageRequest.cursor(limit, cursor, defaultLimit = 30, maxLimit = 100))
        .mapItems { it.toWebDto() }
```

Add `CursorPageResponse` in `ArchiveWebDtos.kt`:

```kotlin
data class CursorPageResponse<T>(
    val items: List<T>,
    val nextCursor: String?,
)
```

Add mapper in `ArchiveWebMapper.kt`:

```kotlin
fun <T, R> CursorPage<T>.mapItems(mapper: (T) -> R): CursorPageResponse<R> =
    CursorPageResponse(items = items.map(mapper), nextCursor = nextCursor)
```

- [x] **Step 4: Add archive outbound pagination**

In `LoadArchiveDataPort.kt`, mirror the inbound signatures:

```kotlin
fun loadArchiveSessions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<ArchiveSessionResult>
fun loadMyQuestions(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveQuestionResult>
fun loadMyReviews(currentMember: CurrentMember, pageRequest: PageRequest): CursorPage<MyArchiveReviewResult>
```

In `ArchiveQueryService.kt`, pass through the `PageRequest` after membership checks.

- [x] **Step 5: Implement keyset pagination in `JdbcArchiveQueryAdapter`**

For `loadArchiveSessions`, select `limit + 1` rows and add cursor predicate:

```sql
and (
  ? is null
  or sessions.number < ?
  or (sessions.number = ? and sessions.id < ?)
)
order by sessions.number desc, sessions.id desc
limit ?
```

Build cursor from the last returned item:

```kotlin
private fun archiveSessionCursor(item: ArchiveSessionResult): String? =
    CursorCodec.encode(
        mapOf(
            "number" to item.sessionNumber.toString(),
            "id" to item.sessionId,
        ),
    )
```

Use this list trimming pattern:

```kotlin
private fun <T> pageFromRows(rows: List<T>, limit: Int, cursorFor: (T) -> String?): CursorPage<T> {
    val visibleRows = rows.take(limit)
    return CursorPage(
        items = visibleRows,
        nextCursor = if (rows.size > limit) visibleRows.lastOrNull()?.let(cursorFor) else null,
    )
}
```

Implement the remaining keyset predicates with the exact order and cursor values below:

```text
my questions:
  order by sessions.number desc, questions.priority asc, questions.id desc
  cursor keys: sessionNumber, priority, id
  predicate: sessions.number < :sessionNumber
             or (sessions.number = :sessionNumber and questions.priority > :priority)
             or (sessions.number = :sessionNumber and questions.priority = :priority and questions.id < :id)

my reviews:
  order by sessions.number desc, long_reviews.created_at desc, long_reviews.id desc
  cursor keys: sessionNumber, createdAt, id
  predicate: sessions.number < :sessionNumber
             or (sessions.number = :sessionNumber and long_reviews.created_at < :createdAt)
             or (sessions.number = :sessionNumber and long_reviews.created_at = :createdAt and long_reviews.id < :id)

feedback documents:
  order by session_number desc, session_feedback_documents.created_at desc, session_feedback_documents.id desc
  cursor keys: sessionNumber, createdAt, id
  predicate: session_number < :sessionNumber
             or (session_number = :sessionNumber and session_feedback_documents.created_at < :createdAt)
             or (session_number = :sessionNumber and session_feedback_documents.created_at = :createdAt and session_feedback_documents.id < :id)

notes sessions:
  order by sessions.number desc, sessions.id desc
  cursor keys: number, id
  predicate: sessions.number < :number
             or (sessions.number = :number and sessions.id < :id)

notes feed:
  order by created_at desc, source_order asc, session_number desc, item_order asc, id desc
  cursor keys: createdAt, sourceOrder, sessionNumber, itemOrder, id
  predicate: created_at < :createdAt
             or (created_at = :createdAt and source_order > :sourceOrder)
             or (created_at = :createdAt and source_order = :sourceOrder and session_number < :sessionNumber)
             or (created_at = :createdAt and source_order = :sourceOrder and session_number = :sessionNumber and item_order > :itemOrder)
             or (created_at = :createdAt and source_order = :sourceOrder and session_number = :sessionNumber and item_order = :itemOrder and id < :id)
```

- [x] **Step 6: Convert feedback document list**

Change `FeedbackDocumentUseCases.kt`, `FeedbackDocumentStorePort.kt`, `FeedbackDocumentService.kt`, `FeedbackDocumentController.kt`, and `FeedbackDocumentWebDtos.kt` so `/api/feedback-documents/me` returns:

```kotlin
data class FeedbackDocumentListPage(
    val items: List<FeedbackDocumentListItem>,
    val nextCursor: String?,
)
```

The SQL order must be:

```sql
order by session_number desc, session_feedback_documents.created_at desc, session_feedback_documents.id desc
```

The cursor payload must include `sessionNumber`, `createdAt`, and `id`.

- [x] **Step 7: Convert notes list and feed**

Change `NotesFeedUseCases.kt`, `LoadNotesFeedPort.kt`, `NotesFeedService.kt`, `NotesFeedController.kt`, and `NotesFeedWebDtos.kt`.

`GET /api/notes/sessions` returns `CursorPageResponse<NoteSessionItem>`.

`GET /api/notes/feed` returns `CursorPageResponse<NoteFeedItem>` for both whole-feed and `sessionId` modes. Remove the unpaged session-specific branch. Apply `limit + 1` to both.

- [x] **Step 8: Run targeted server tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.archive.api.ArchiveControllerTest \
  --tests com.readmates.feedback.api.FeedbackDocumentControllerTest \
  --tests com.readmates.note.api.QuestionControllerTest \
  --tests com.readmates.note.api.MemberActionControllerDbTest
```

Expected: all pass.

- [x] **Step 9: Commit member-facing pagination server changes**

Run:

```bash
git add server/src/main/kotlin/com/readmates/archive server/src/main/kotlin/com/readmates/feedback server/src/main/kotlin/com/readmates/note server/src/test/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/feedback server/src/test/kotlin/com/readmates/note
git commit -m "feat: paginate member archive notes and feedback APIs"
```

COMPACT CHECKPOINT Task 2 - Convert Archive, Feedback, And Notes Server APIs To Paged Contracts:
Acceptance criteria completed: archive sessions/questions/reviews, feedback documents, notes sessions, and notes feed server contracts now return `{ items, nextCursor }`; controllers parse `limit`/`cursor`; use cases and ports use `CursorPage`/`PageRequest`; JDBC adapters use keyset predicates with `limit + 1`; related server tests updated; implementation committed as `f0e5a87`; cache-bypass clarification follow-up committed as `13d122f`. Changed files: server archive/feedback/note API, service, port, model, persistence, and related server tests plus this plan document. Key decisions: invalid/undecodable cursors intentionally fall back to first page per shared cursor decode contract; notes reads intentionally bypass the legacy unpaged notes cache because it cannot produce correct keyset `nextCursor`, and tests now lock zero cache reads/writes for paged paths. Contracts/API/state/test expectations: scoped endpoints no longer preserve raw-array responses; archive/feedback/notes sort orders and cursor payloads match the Task 2 table; notes feed uses `60/120`, notes sessions and member-facing lists use `30/100`. Reviews: Task 2 spec review approved; initial quality review raised malformed-cursor and notes-cache concerns; malformed-cursor behavior was adjudicated as accepted contract, notes-cache clarity was fixed and quality re-review approved. Verification: red `./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerTest` failed on missing `$.items`; `./server/gradlew -p server test --rerun-tasks --tests com.readmates.archive.api.ArchiveControllerTest --tests com.readmates.feedback.api.FeedbackDocumentControllerTest --tests com.readmates.note.api.QuestionControllerTest --tests com.readmates.note.api.MemberActionControllerDbTest --tests com.readmates.archive.api.MemberArchiveReviewControllerTest` passed; `./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest` passed; `./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest --tests com.readmates.archive.api.ArchiveAndNotesDbTest --tests com.readmates.note.application.service.NotesFeedServiceCacheTest` passed; after follow-up, `./server/gradlew -p server test --tests com.readmates.note.application.service.NotesFeedServiceCacheTest` passed and targeted Task 2 server command passed again. Remaining risks: frontend still consumes old array contracts until Task 3; do not run mixed server/frontend manually expecting compatibility before Task 3 lands. Next first action: dispatch Task 3 implementer for frontend archive, feedback, and notes paged contracts. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 2 subagents closed; no session-owned ports open.

## Task 3: Convert Frontend Archive, Feedback, And Notes To Paged Contracts

**Files:**

- Modify archive and feedback frontend files listed in the Target File Map.
- Test: `front/tests/unit/archive-page.test.tsx`
- Test: `front/tests/unit/notes-feed-page.test.tsx`
- Test: `front/tests/unit/my-page.test.tsx`
- Test: `front/tests/unit/feedback-document-page.test.tsx`
- Test: `front/tests/unit/api-contract-fixtures.test.ts`

- [x] **Step 1: Update contract types**

In `front/features/archive/api/archive-contracts.ts`, import `PagedResponse`:

```ts
import type { PagedResponse } from "@/shared/model/paging";
```

Add aliases:

```ts
export type ArchiveSessionPage = PagedResponse<ArchiveSessionItem>;
export type MyArchiveQuestionPage = PagedResponse<MyArchiveQuestionItem>;
export type MyArchiveReviewPage = PagedResponse<MyArchiveReviewItem>;
export type NoteSessionPage = PagedResponse<NoteSessionItem>;
export type NoteFeedPage = PagedResponse<NoteFeedItem>;
export type FeedbackDocumentListPage = PagedResponse<FeedbackDocumentListItem>;
```

- [x] **Step 2: Update archive API fetchers**

In `front/features/archive/api/archive-api.ts`, make list fetchers accept `PageRequest`:

```ts
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";

export function fetchArchiveSessions(request?: PageRequest, context?: ReadmatesApiContext) {
  return readmatesFetch<ArchiveSessionPage>(`/api/archive/sessions${pagingSearchParams(request)}`, undefined, context);
}

export function fetchMyArchiveQuestions(request?: PageRequest, context?: ReadmatesApiContext) {
  return readmatesFetch<MyArchiveQuestionPage>(`/api/archive/me/questions${pagingSearchParams(request)}`, undefined, context);
}

export function fetchMyArchiveReviews(request?: PageRequest, context?: ReadmatesApiContext) {
  return readmatesFetch<MyArchiveReviewPage>(`/api/archive/me/reviews${pagingSearchParams(request)}`, undefined, context);
}

export function fetchNoteSessions(request?: PageRequest, context?: ReadmatesApiContext) {
  return readmatesFetch<NoteSessionPage>(`/api/notes/sessions${pagingSearchParams(request)}`, undefined, context);
}

export function fetchNotesFeed(sessionId?: string | null, request?: PageRequest, context?: ReadmatesApiContext) {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (request?.limit !== undefined) params.set("limit", String(request.limit));
  if (request?.cursor) params.set("cursor", request.cursor);
  const query = params.toString();
  return readmatesFetch<NoteFeedPage>(`/api/notes/feed${query ? `?${query}` : ""}`, undefined, context);
}
```

- [x] **Step 3: Update route data models**

In `archive-list-data.ts`, store pages instead of arrays:

```ts
export type ArchiveListRouteData = {
  sessions: ArchiveSessionPage;
  questions: MyArchiveQuestionPage;
  reviews: MyArchiveReviewPage;
  reports: FeedbackDocumentListPage;
};
```

Use default first-page requests:

```ts
const firstPage = { limit: 30 };
const [sessions, questions, reviews, reports] = await Promise.all([
  fetchArchiveSessions(firstPage, context),
  fetchMyArchiveQuestions(firstPage, context),
  fetchMyArchiveReviews(firstPage, context),
  fetchMyFeedbackDocuments(firstPage, context),
]);
```

- [x] **Step 4: Add explicit load-more UI**

In archive, notes, and my-page UI components, pass `page.items` to existing lists and render a button when `nextCursor !== null`:

```tsx
{sessions.nextCursor ? (
  <button type="button" className="rm-button rm-button--secondary" onClick={onLoadMoreSessions}>
    더 보기
  </button>
) : null}
```

Route components own the load-more callback and append returned items:

```ts
setSessionPage((current) => ({
  items: [...current.items, ...next.items],
  nextCursor: next.nextCursor,
}));
```

- [x] **Step 5: Update unit tests**

Update tests so mocked data uses:

```ts
const sessionPage = {
  items: [sessionFixture],
  nextCursor: "next-session-cursor",
};
```

Add a test that clicks `더 보기` and asserts new items append without replacing existing ones.

- [x] **Step 6: Run frontend targeted tests**

Run:

```bash
pnpm --dir front test -- --run \
  tests/unit/archive-page.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/my-page.test.tsx \
  tests/unit/feedback-document-page.test.tsx \
  tests/unit/api-contract-fixtures.test.ts
```

Expected: all pass.

- [x] **Step 7: Commit member-facing frontend pagination**

Run:

```bash
git add front/features/archive front/features/feedback front/shared/model front/tests/unit
git commit -m "feat: use paged archive notes and feedback data"
```

COMPACT CHECKPOINT Task 3 - Convert Frontend Archive, Feedback, And Notes To Paged Contracts:
Acceptance criteria completed: archive/feedback/notes frontend contracts and fetchers use `PagedResponse`/`PageRequest`; route loaders fetch first pages; archive, notes, my-page, member-home, and adjacent route consumers no longer assume raw arrays; UI renders `page.items` and exposes explicit `더 보기` append actions; tests cover append behavior and edge regressions. Changed files: frontend archive/feedback API/route/ui files, member-home paged notes consumer, related unit fixtures/tests, and this plan document. Key decisions: member-home unwraps first-page notes feed into its existing preview array instead of adding home pagination; my-page count labels render `30+` when first page has `nextCursor` rather than pretending exact totals; notes deep links outside the first sessions page preserve the requested id and do not silently select another session, including empty-feed sessions. Contracts/API/state/test expectations: scoped frontend consumers call paged endpoints with limit/cursor, load-more appends returned items and replaces `nextCursor`, club slug context is preserved on subsequent requests. Reviews: initial Task 3 spec/quality reviews found member-home raw notes consumer, notes deep-link fallback, and capped count issues; follow-up fixes `9f3e3bd` and `699700f` resolved them; final Task 3 re-review approved. Verification: red targeted suite failed on raw-array assumptions (`reports.slice`, `items.filter`, `noteSessions.find`); `pnpm --dir front test --run tests/unit/archive-page.test.tsx tests/unit/notes-feed-page.test.tsx tests/unit/my-page.test.tsx tests/unit/feedback-document-page.test.tsx tests/unit/api-contract-fixtures.test.ts` passed; additional `notes-page`, `spa-router`, and `member-home` targeted tests passed; final targeted regression command `pnpm --dir front test --run tests/unit/archive-page.test.tsx tests/unit/notes-feed-page.test.tsx tests/unit/my-page.test.tsx tests/unit/feedback-document-page.test.tsx tests/unit/api-contract-fixtures.test.ts tests/unit/member-home.test.tsx tests/unit/notes-page.test.tsx tests/unit/spa-router.test.tsx` passed 149 tests; `pnpm --dir front lint` passed; final reviewer also ran full `pnpm --dir front test` (614 tests) and `pnpm --dir front build`, both passed. Remaining risks: existing React Router HydrateFallback warning remains in `spa-router.test.tsx`; no new functional risk known. Next first action: dispatch Task 4 implementer for host, notification, and admin cursor pagination. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 3 subagents closed; no session-owned ports open.

## Task 4: Convert Host, Notification, And Admin Lists To Cursor Pagination

**Files:** host, auth, session, notification, and club files listed in the Target File Map.

- [x] **Step 1: Add server tests for host paged contracts**

Add tests in existing host controller test files to assert:

```json
{
  "items": [],
  "nextCursor": null
}
```

Endpoints:

```text
GET /api/host/sessions?limit=2
GET /api/host/invitations?limit=2
GET /api/host/members?limit=2
GET /api/host/members/pending-approvals?limit=2
```

- [x] **Step 2: Update host server use cases and ports**

Change host list methods to accept `PageRequest` and return `CursorPage<T>`.

Use cursor orderings:

```text
host sessions: state rank asc, session_date asc, number asc, id asc
host invitations: created_at desc, id desc
host members: role rank asc, status rank asc, display_name asc, email asc, id asc
pending viewers: created_at desc, id desc
```

- [x] **Step 3: Update notification list endpoints**

Convert:

```text
GET /api/me/notifications
GET /api/host/notifications/items
GET /api/host/notifications/events
GET /api/host/notifications/deliveries
GET /api/host/notifications/test-mail/audit
```

to return `CursorPage` responses. Keep existing `limit` behavior but add `cursor`.

- [x] **Step 4: Update frontend host and notification contracts**

In `front/features/host/api/host-contracts.ts` and `front/features/notifications/api/notifications-contracts.ts`, wrap list types in `PagedResponse<T>`.

Update route loaders to store first pages and add `더 보기` callbacks in:

```text
front/features/host/route/host-dashboard-data.ts
front/features/host/route/host-invitations-data.ts
front/features/host/route/host-members-data.ts
front/features/host/route/host-session-editor-data.ts
front/features/host/route/host-notifications-data.ts
front/features/notifications/route/member-notifications-data.ts
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.HostMemberApprovalControllerTest \
  --tests com.readmates.auth.api.HostMemberLifecycleControllerTest \
  --tests com.readmates.session.api.HostSessionControllerTest \
  --tests com.readmates.notification.api.HostNotificationControllerTest \
  --tests com.readmates.notification.api.MemberNotificationControllerTest

pnpm --dir front test -- --run \
  tests/unit/host-dashboard.test.tsx \
  tests/unit/host-invitations.test.tsx \
  tests/unit/host-members.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/host-notifications.test.tsx \
  tests/unit/member-notifications.test.tsx
```

Expected: all pass.

- [x] **Step 6: Commit host and notification pagination**

Run:

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/notification front/features/host front/features/notifications front/tests/unit
git commit -m "feat: paginate host and notification lists"
```

COMPACT CHECKPOINT Task 4 - Convert Host, Notification, And Admin Lists To Cursor Pagination:
Acceptance criteria completed: host sessions, invitations, members, pending approvals/viewers, member notifications, host notification items/events/deliveries/test-mail audit now return paged contracts and frontend consumers use paged responses with explicit `더 보기` append behavior; implementation committed as `c192f2c`; review fixes committed as `d453552`. Changed files: server auth/session/notification API, service, port, persistence, and tests; frontend host/notification API, route, UI/component, and tests; this plan document. Key decisions: platform admin pagination was not implemented because current admin surface exposes bounded `/api/admin/summary` nested arrays and mutation/check endpoints, not a standalone paginated admin domain list; final spec review accepted this as out of Task 4's explicit endpoint list. Contracts/API/state/test expectations: host operational lists use `50/100`; notification lists preserve `50/100`; cursor predicates use stable id tie-breakers; host dashboard preserves `HostSessionListPage.nextCursor`; host members/invitations load-more wrappers pass page args in the correct API parameter position. Reviews: initial spec/quality reviews found host member/invitation cursor wiring bugs and host dashboard dropped page contract; fixes landed in `d453552`; final Task 4 re-review approved. Verification: red server compile failed before `MemberNotificationList.nextCursor`; red frontend tests caught raw-array/unpaged assumptions; `./server/gradlew -p server test --rerun-tasks --tests com.readmates.auth.api.HostInvitationControllerTest --tests com.readmates.auth.api.HostMemberApprovalControllerTest --tests com.readmates.auth.api.HostMemberLifecycleControllerTest --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.notification.api.HostNotificationControllerTest --tests com.readmates.notification.api.MemberNotificationControllerTest` passed; `pnpm --dir front test --run tests/unit/host-dashboard.test.tsx tests/unit/host-invitations.test.tsx tests/unit/host-members.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/host-notifications.test.tsx tests/unit/member-notifications.test.tsx` passed 160 tests after fixes; `pnpm --dir front lint` passed; `CI=1 pnpm --dir front build` passed; `./server/gradlew -p server test --rerun-tasks --tests com.readmates.architecture.ServerArchitectureBoundaryTest` passed; `git diff --check` passed. Remaining risks: platform admin summary remains bounded but unpaged by design; no open Task 4 review issues. Next first action: dispatch Task 5 implementer for server application HTTP dependency removal and OAuthReturnState persistence split. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 4 subagents closed; no session-owned ports open.

## Task 5: Harden Server Application And Security Boundaries

**Files:**

- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/TrustedReturnHostPort.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcTrustedReturnHostAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`
- Modify application error classes and web mappers in archive, feedback, club, auth, notification.

- [x] **Step 1: Strengthen boundary test first**

In `ServerArchitectureBoundaryTest.kt`, add:

```kotlin
@Test
fun `application packages do not depend on spring web or http response types`() {
    noClasses()
        .that()
        .resideInAnyPackage(*migratedApplicationPackages)
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(
            "org.springframework.http..",
            "org.springframework.web..",
        )
        .check(importedClasses)
}
```

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: fail while application code still imports Spring web/http types.

- [x] **Step 2: Move application HTTP exceptions to feature errors**

For each feature with `ResponseStatusException` in application packages, introduce a feature error exception. Example for feedback:

```kotlin
package com.readmates.feedback.application

class FeedbackDocumentException(
    val code: FeedbackDocumentError,
) : RuntimeException(code.name)

enum class FeedbackDocumentError {
    NOT_FOUND,
    STORAGE_UNAVAILABLE,
    ACTIVE_MEMBERSHIP_REQUIRED,
    INVALID_TEMPLATE,
    INVALID_STORED_DOCUMENT,
}
```

Map it in `feedback.adapter.in.web`:

```kotlin
@ExceptionHandler(FeedbackDocumentException::class)
fun handleFeedbackDocumentException(exception: FeedbackDocumentException): ResponseEntity<FeedbackDocumentErrorResponse> {
    val status = when (exception.code) {
        FeedbackDocumentError.NOT_FOUND -> HttpStatus.NOT_FOUND
        FeedbackDocumentError.STORAGE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE
        FeedbackDocumentError.ACTIVE_MEMBERSHIP_REQUIRED -> HttpStatus.FORBIDDEN
        FeedbackDocumentError.INVALID_TEMPLATE -> HttpStatus.BAD_REQUEST
        FeedbackDocumentError.INVALID_STORED_DOCUMENT -> HttpStatus.UNPROCESSABLE_ENTITY
    }
    return ResponseEntity.status(status).body(FeedbackDocumentErrorResponse(exception.code.name))
}
```

Repeat for archive, platform admin, member lifecycle, pending approval, notification member/host operations, and parser errors. Keep web status mapping in `adapter.in.web`.

- [x] **Step 3: Extract trusted return host port**

Create `TrustedReturnHostPort.kt`:

```kotlin
package com.readmates.auth.application.port.out

interface TrustedReturnHostPort {
    fun activeClubSlugForHost(host: String): String?
}
```

Create `JdbcTrustedReturnHostAdapter.kt`:

```kotlin
package com.readmates.club.adapter.out.persistence

import com.readmates.auth.application.port.out.TrustedReturnHostPort
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcTrustedReturnHostAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : TrustedReturnHostPort {
    override fun activeClubSlugForHost(host: String): String? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select clubs.slug
            from club_domains
            join clubs on clubs.id = club_domains.club_id
            where lower(hostname) = ?
              and club_domains.status = 'ACTIVE'
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("slug") },
            host.trim().lowercase(),
        ).firstOrNull()
    }
}
```

Update `OAuthReturnState` constructor to receive `TrustedReturnHostPort` and remove `JdbcTemplate`.

- [x] **Step 4: Run server boundary and affected tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --tests com.readmates.feedback.api.FeedbackDocumentControllerTest \
  --tests com.readmates.archive.api.ArchiveControllerTest \
  --tests com.readmates.club.api.PlatformAdminControllerTest \
  --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest \
  --tests com.readmates.notification.api.HostNotificationControllerTest
```

Expected: all pass.

- [x] **Step 5: Commit server boundary hardening**

Run:

```bash
git add server/src/main/kotlin server/src/test/kotlin/com/readmates/architecture server/src/test/kotlin/com/readmates/feedback server/src/test/kotlin/com/readmates/archive server/src/test/kotlin/com/readmates/club server/src/test/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/notification
git commit -m "refactor: harden server application boundaries"
```

COMPACT CHECKPOINT Task 5 - Harden Server Application And Security Boundaries:
Acceptance criteria completed: `ServerArchitectureBoundaryTest` now rejects Spring `http`/`web` dependencies from migrated application packages; application HTTP exceptions were moved to feature-owned errors and mapped in web adapters; shared `AccessDeniedException` no longer uses Spring `@ResponseStatus` and is mapped by shared web advice; `OAuthReturnState` now depends on `TrustedReturnHostPort`; `JdbcTrustedReturnHostAdapter` owns active club host lookup. Changed files: server architecture test, archive/auth/club/feedback/notification/session application errors and web handlers, `OAuthReturnState`, `TrustedReturnHostPort`, `JdbcTrustedReturnHostAdapter`, shared access-denied web advice, related tests, and this plan document. Key decisions: `SessionApplicationErrorHandler` is global rather than controller-scoped because member/note write controllers also surface session application exceptions; shared access denied remains a shared application/security exception but HTTP mapping is in `shared.adapter.in.web`. Contracts/API/state/test expectations: previous HTTP statuses are preserved through adapter advice (`403`, `409`, `400`, `404`, `422`, `429`, `503` as applicable); OAuth return state still trusts primary app host, Pages host, and active shared-cookie club domains only. Reviews: initial spec/quality reviews found missing note/member session exception mapping and hidden `@ResponseStatus` on shared `AccessDeniedException`; follow-up `2ef5348` fixed both; final Task 5 re-review approved. Verification: red `./server/gradlew -p server test --rerun-tasks --tests com.readmates.architecture.ServerArchitectureBoundaryTest` failed on new boundary before migration; post-fix required command `./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest --tests com.readmates.feedback.api.FeedbackDocumentControllerTest --tests com.readmates.archive.api.ArchiveControllerTest --tests com.readmates.club.api.PlatformAdminControllerTest --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest --tests com.readmates.notification.api.HostNotificationControllerTest` passed; regression command `./server/gradlew -p server test --tests com.readmates.note.api.MemberActionControllerDbTest --tests com.readmates.note.api.QuestionControllerTest --tests com.readmates.session.adapter.in.web.RsvpControllerTest` passed; reviewer ran an expanded affected suite including `ReviewBffSecurityTest` and `HostSessionControllerDbTest`, passed; `git diff --check` passed. A parallel local rerun of two Gradle test commands failed only because both tried to write XML test results into the same build directory; rerunning the required command alone passed. Remaining risks: none known for Task 5. Next first action: dispatch Task 6 implementer for DB query budget, EXPLAIN, and transaction guard tests. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 5 subagents closed; no session-owned ports open.

## Task 6: Add DB Query Budget, EXPLAIN, And Transaction Guard Tests

**Files:**

- Create: `server/src/test/kotlin/com/readmates/support/QueryCountingDataSource.kt`
- Create: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
- Create: `server/src/test/kotlin/com/readmates/support/MySqlExplainTestSupport.kt`
- Create: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`
- Modify: notification/session tests for transaction-required paths.

- [x] **Step 1: Add query counting datasource support**

Create a test support wrapper that counts `prepareStatement` calls per test thread. Keep it test-only and opt-in so production wiring is unchanged.

Use this API:

```kotlin
object QueryCounter {
    fun reset()
    fun count(): Int
}
```

Wrap `DataSource.getConnection()` and increment on `prepareStatement(sql)`.

- [x] **Step 2: Add query budget tests**

Create `ServerQueryBudgetTest.kt` with MockMvc calls:

```kotlin
@Test
fun `current session stays within query budget`() {
    QueryCounter.reset()
    mockMvc.get("/api/sessions/current") {
        with(activeMember())
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect { status { isOk() } }

    assertThat(QueryCounter.count()).isLessThanOrEqualTo(5)
}
```

Add similar tests for:

```text
/api/archive/sessions/{sessionId}
/api/public/clubs/{slug}
/api/public/clubs/{slug}/sessions/{sessionId}
/api/host/sessions/{sessionId}/deletion-preview
```

- [x] **Step 3: Add MySQL EXPLAIN tests**

Create `MySqlQueryPlanTest.kt` using existing MySQL Testcontainer support. Test the paged query shapes for archive, notes, host members, notification delivery claim, and public session detail. Assert no full table scan on the largest tables by checking the `key` column is non-null for the table under test.

- [x] **Step 4: Add transaction-required tests for lock paths**

For methods using `for update` or `for update skip locked`, add tests that call them through their application service or scheduler entrypoint, not directly without transaction. Assert claim methods do not produce duplicate ids when invoked twice inside concurrent transactions.

- [x] **Step 5: Run performance guard tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected: all pass. If a budget is too strict for current behavior, adjust the budget in the test and record the reason in the test name or assertion message.

- [x] **Step 6: Commit DB guardrails**

Run:

```bash
git add server/src/test/kotlin/com/readmates/support server/src/test/kotlin/com/readmates/performance server/src/test/kotlin/com/readmates/notification server/src/test/kotlin/com/readmates/session
git commit -m "test: add db query and transaction guardrails"
```

COMPACT CHECKPOINT Task 6 - Add DB Query Budget, EXPLAIN, And Transaction Guard Tests:
Acceptance criteria completed: test-only query counting datasource and query budgets added; MySQL EXPLAIN support and production-shaped query plan tests added; notification claim/outbox and host session transaction guard coverage added; EXPLAIN assertion tightened; narrow note-count indexes added where tightened guard exposed a real full scan; implementation committed as `963afc6`, follow-up as `252d988`. Changed files: `QueryCountingDataSource.kt`, `MySqlExplainTestSupport.kt`, `MySqlExplainTestSupportTest.kt`, `ServerQueryBudgetTest.kt`, `MySqlQueryPlanTest.kt`, notification/session tests, `server/src/main/resources/db/mysql/migration/V22__note_count_query_indexes.sql`, and this plan document. Key decisions: query budgets use observed baselines with assertion reasons instead of forcing optimizations in this test task; V22 indexes are additive and tied to existing notes count query shapes (`one_line_reviews`/`long_reviews` by club/session/visibility/member), not speculative; `assertUsesIndexFor` rejects `ALL` and full `index` scans. Contracts/API/state/test expectations: current query budgets are current-session 5, archive detail 14, public club 5, public session detail 3, deletion preview 15; EXPLAIN tests cover archive page, notes production session count query, host member production query, global notification delivery claim, and public session detail. Reviews: initial Task 6 reviews found reduced EXPLAIN query shapes and weak index assertions; follow-up fixed them; final DB/migration and Task 6 re-reviews approved. Verification: initial red budget run failed with observed query counts before baselines were set; Task 6 suite `./server/gradlew -p server test --tests com.readmates.performance.ServerQueryBudgetTest --tests com.readmates.performance.MySqlQueryPlanTest --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest --tests com.readmates.session.api.HostSessionControllerDbTest` passed; after follow-up, `./server/gradlew -p server test --tests com.readmates.performance.ServerQueryBudgetTest --tests com.readmates.performance.MySqlQueryPlanTest --tests com.readmates.support.MySqlExplainTestSupportTest --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest --tests com.readmates.session.api.HostSessionControllerDbTest` passed; migration reviewer also ran `MySqlFlywayMigrationTest`, passed; `git diff --check` passed. Remaining risks: EXPLAIN tests are intentionally sensitive to MySQL planner changes; keep future failures as performance review signals, not automatic weakening candidates. Next first action: dispatch Task 7 implementer to split notification delivery, host session write, and archive JDBC adapters without behavior changes. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 6 subagents closed; no session-owned ports open.

## Task 7: Split High-Risk JDBC Adapters Without Behavior Changes

**Files:**

- Modify/split `JdbcNotificationDeliveryAdapter.kt`
- Modify/split `JdbcHostSessionWriteAdapter.kt`
- Modify/split `JdbcArchiveQueryAdapter.kt`

- [x] **Step 1: Split notification delivery mappers**

Create `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`.

Move `ResultSet` mapper extension functions from `JdbcNotificationDeliveryAdapter` into this file. Keep them `internal`.

- [x] **Step 2: Split notification delivery queries**

Create `NotificationDeliveryQueries.kt` for read-only SQL and `NotificationDeliveryWriteOperations.kt` for update/batch write operations. `JdbcNotificationDeliveryAdapter` remains the only class implementing outbound ports.

- [x] **Step 3: Split host session mappers and deletion helpers**

Create:

```text
server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt
server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt
server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteOperations.kt
```

Move SQL groups without changing SQL text unless tests require imports to move.

- [x] **Step 4: Split archive query mappers**

Create:

```text
server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt
server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveDetailQueries.kt
server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt
```

Keep `JdbcArchiveQueryAdapter` as the port implementation facade.

- [x] **Step 5: Run adapter-focused tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest \
  --tests com.readmates.notification.api.HostNotificationControllerTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest \
  --tests com.readmates.archive.api.ArchiveControllerTest
```

Expected: all pass.

- [x] **Step 6: Commit JDBC adapter split**

Run:

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence server/src/main/kotlin/com/readmates/session/adapter/out/persistence server/src/main/kotlin/com/readmates/archive/adapter/out/persistence server/src/test/kotlin/com/readmates
git commit -m "refactor: split large jdbc adapters"
```

COMPACT CHECKPOINT Task 7 - Split High-Risk JDBC Adapters Without Behavior Changes:
Acceptance criteria completed: notification delivery, host session write, and archive query JDBC adapters were split into planned internal mapper/query/write-operation helpers while preserving adapter facades as the only outbound port implementations; implementation committed as `8d6fa4e`; related `ViewerSecurityTest` application-exception expectation alignment committed as `d08bf09`. Changed files: `JdbcNotificationDeliveryAdapter.kt`, `NotificationDeliveryRowMappers.kt`, `NotificationDeliveryQueries.kt`, `NotificationDeliveryWriteOperations.kt`, `JdbcHostSessionWriteAdapter.kt`, `HostSessionRowMappers.kt`, `HostSessionQueries.kt`, `HostSessionWriteOperations.kt`, `JdbcArchiveQueryAdapter.kt`, `ArchiveRowMappers.kt`, `ArchiveDetailQueries.kt`, `ArchiveListQueries.kt`, `ViewerSecurityTest.kt`, and this plan document. Key decisions: helper classes are internal delegates rather than Spring beans so transaction boundaries remain on the Spring-managed adapter methods; SQL text/parameters were preserved except consolidating an existing duplicate session-state lookup helper; the viewer security test now asserts `FeedbackDocumentException.ACTIVE_MEMBERSHIP_REQUIRED` at the direct use-case boundary because Task 5 intentionally removed Spring web exceptions from application code while keeping the HTTP `403` assertion. Contracts/API/state/test expectations: no API or DB contract changed; `JdbcNotificationDeliveryAdapter`, `JdbcHostSessionWriteAdapter`, and `JdbcArchiveQueryAdapter` remain the port facades; feedback viewer HTTP access remains forbidden and application code raises the feature exception mapped by `FeedbackDocumentErrorHandler`. Reviews: initial spec and code-quality reviews found no Task 7 issues; code-quality full-suite run surfaced `ViewerSecurityTest` still expecting the old web exception; RCA fixed this as test-only contract alignment; final spec/code-quality re-reviews found no issues. Verification: implementer ran `./server/gradlew -p server compileKotlin --rerun-tasks`, Task 7 adapter-focused test command, and `git diff --check`, all passed; root-cause worker reproduced `./server/gradlew -p server test --tests com.readmates.auth.api.ViewerSecurityTest`, fixed it, then reran ViewerSecurityTest, Task 7 adapter-focused command, and `git diff --check`, all passed; final reviewers ran combined Task 7 plus ViewerSecurityTest and architecture boundary tests, passed; final code-quality reviewer ran `./server/gradlew -p server clean test`, passed. Remaining risks: mechanical split risk remains limited to untested edge paths around helper delegation, covered by adapter/controller suites and full server suite; no known open Task 7 issue. Next first action: dispatch Task 8 frontend implementer to remove shared-to-app and host component legacy boundary exceptions. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 7 subagents closed; no session-owned ports open.

## Task 8: Remove Frontend Shared-To-App And Host Components Legacy Boundaries

**Files:**

- Modify: `front/tests/unit/frontend-boundaries.test.ts`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/shared/ui/public-auth-action.tsx`
- Modify: `front/shared/ui/public-footer.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/src/app/layouts.tsx`
- Move host files from `front/features/host/components` to `front/features/host/ui`
- Modify host route/data imports and unit tests.

- [x] **Step 1: Remove frontend boundary exceptions first**

In `frontend-boundaries.test.ts`, remove the legacy exceptions for:

```text
shared/ui/* -> src/app/router-link
shared/ui/mobile-header.tsx -> src/app/route-continuity
features/host/route/* -> features/host/components/*
features/host/components/host-session-editor.tsx -> features/host/components/*
```

Run:

```bash
pnpm --dir front test -- --run tests/unit/frontend-boundaries.test.ts
```

Expected: fail with shared-to-app and host components import violations.

- [x] **Step 2: Inject app link behavior into shared UI**

Change shared navigation components to accept a `LinkComponent` prop:

```ts
export type AppLinkComponent = React.ComponentType<{
  to: string;
  className?: string;
  children: React.ReactNode;
}>;
```

Use it instead of importing `Link` from `src/app/router-link`.

In `front/src/app/layouts.tsx`, pass the app `Link` into shared UI components.

- [x] **Step 3: Move host presentation to ui**

Move files:

```bash
git mv front/features/host/components/host-dashboard.tsx front/features/host/ui/host-dashboard.tsx
git mv front/features/host/components/host-invitations.tsx front/features/host/ui/host-invitations.tsx
git mv front/features/host/components/host-members.tsx front/features/host/ui/host-members.tsx
git mv front/features/host/components/host-session-editor.tsx front/features/host/ui/host-session-editor.tsx
git mv front/features/host/components/host-session-attendance-editor.tsx front/features/host/ui/host-session-attendance-editor.tsx
git mv front/features/host/components/host-session-deletion-preview.tsx front/features/host/ui/host-session-deletion-preview.tsx
git mv front/features/host/components/host-session-feedback-upload.tsx front/features/host/ui/host-session-feedback-upload.tsx
```

Update imports in these exact files:

```text
front/features/host/route/host-dashboard-data.ts
front/features/host/route/host-dashboard-route.tsx
front/features/host/route/host-invitations-data.ts
front/features/host/route/host-invitations-route.tsx
front/features/host/route/host-members-data.ts
front/features/host/route/host-members-route.tsx
front/features/host/route/host-session-editor-data.ts
front/features/host/route/host-session-editor-route.tsx
front/tests/unit/host-dashboard.test.tsx
front/tests/unit/host-invitations.test.tsx
front/tests/unit/host-members.test.tsx
front/tests/unit/host-session-editor.test.tsx
```

- [x] **Step 4: Move host action types out of UI**

For action type exports currently living beside host UI, create:

```text
front/features/host/route/host-dashboard-actions.ts
front/features/host/route/host-invitations-actions.ts
front/features/host/route/host-members-actions.ts
front/features/host/route/host-session-editor-actions.ts
```

Update route data modules to import action types from these files, not UI files.

- [x] **Step 5: Run frontend boundary and host tests**

Run:

```bash
pnpm --dir front test -- --run \
  tests/unit/frontend-boundaries.test.ts \
  tests/unit/responsive-navigation.test.tsx \
  tests/unit/spa-layout.test.tsx \
  tests/unit/host-dashboard.test.tsx \
  tests/unit/host-invitations.test.tsx \
  tests/unit/host-members.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: all pass.

- [x] **Step 6: Commit frontend boundary cleanup**

Run:

```bash
git add front/shared front/src/app front/features/host front/tests/unit
git commit -m "refactor: remove frontend legacy boundaries"
```

COMPACT CHECKPOINT Task 8 - Remove Frontend Shared-To-App And Host Components Legacy Boundaries:
Acceptance criteria completed: frontend boundary exceptions were removed; shared UI navigation/auth/footer/header components no longer import app router/continuity and receive app link behavior by prop injection; host presentation moved from `features/host/components` to `features/host/ui`; remaining host component legacy surface was removed; route-owned host action types live under `features/host/route`; boundary tests guard shared-to-app imports, host components imports, and host UI `*Actions` exports using AST inspection; implementation committed as `2f894e5`, follow-ups as `f9c2c2f`, `e408cf5`, `d9a6875`, and `7cca1e6`. Changed files: `front/shared/ui/*` navigation components, `front/src/app/layouts.tsx`, `front/src/app/host-route-elements.tsx`, `front/src/app/router.tsx`, host route/action/ui modules, host unit tests, `front/tests/unit/frontend-boundaries.test.ts`, and this plan document. Key decisions: shared UI defaults remain anchor-based for isolated tests while app composition injects SPA `Link`; host UI uses local structural props and route-owned action contracts to preserve route-first direction; AST export inspection is used because regex-only checks missed common TypeScript re-export forms. Contracts/API/state/test expectations: visual/runtime behavior is unchanged; no `front/features/host/components` surface or imports remain; `front/shared/ui` has no app/page/feature imports; route data imports action types from route files, not UI files. Reviews: initial spec review found `HostInvitationsActions` still exported from UI; follow-up made it private and added a boundary guard; subsequent reviews found remaining host components surface and weaker export guard forms; follow-ups moved the last files to `ui` and replaced the guard with AST export detection; final closure review found no Task 8 issues. Verification: red boundary test after removing exceptions failed with 17 expected shared-to-app/host-components violations; implementer ran the Task 8 frontend command, `pnpm --dir front lint`, and `git diff --check`, passed; follow-ups ran focused boundary/host editor/invitations tests, lint, `git diff --check`, and `rg -n "features/host/components|host/components" front`, passed/no matches; final local Task 8 command `pnpm --dir front test -- --run tests/unit/frontend-boundaries.test.ts tests/unit/responsive-navigation.test.tsx tests/unit/spa-layout.test.tsx tests/unit/host-dashboard.test.tsx tests/unit/host-invitations.test.tsx tests/unit/host-members.test.tsx tests/unit/host-session-editor.test.tsx` passed with 48 files and 621 tests because the package script already includes `vitest run`; code-quality reviewer also ran `pnpm --dir front test`, `pnpm --dir front build`, and `pnpm --dir front test:e2e`, passed. Existing non-failing stderr remains React Router `HydrateFallback` and jsdom navigation noise. Remaining risks: AST guard intentionally rejects any host UI named export ending in `Actions`; plain `export * from ...` cannot expose names statically but no such exports exist. Next first action: dispatch Task 9 implementer to extract shared Cloudflare BFF/OAuth proxy helpers and add header stripping assertions. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 8 subagents closed; no session-owned ports open.

## Task 9: Extract Shared BFF Proxy Helpers

**Files:**

- Create: `front/functions/_shared/proxy.ts`
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/functions/oauth2/authorization/[[registrationId]].ts`
- Modify: `front/functions/login/oauth2/code/[[registrationId]].ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts`

- [x] **Step 1: Add shared proxy helper tests**

Extend BFF and OAuth proxy tests to assert browser-supplied headers are stripped:

```ts
expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("test-bff-secret");
expect((init.headers as Headers).get("X-Readmates-Client-IP")).toBe("203.0.113.10");
expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe("readmates.pages.dev");
```

Include malicious incoming headers in the request:

```ts
headers: {
  "X-Readmates-Bff-Secret": "attacker",
  "X-Readmates-Client-IP": "attacker",
  "X-Readmates-Club-Host": "attacker.example.test",
}
```

- [x] **Step 2: Create shared proxy helper**

Create `front/functions/_shared/proxy.ts` with exported helpers:

```ts
export type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

export function copyUpstreamHeaders(headers: Headers) {
  const copiedHeaders = new Headers(headers);
  copiedHeaders.delete("set-cookie");
  copiedHeaders.delete("x-readmates-bff-secret");
  copiedHeaders.delete("x-readmates-client-ip");
  copiedHeaders.delete("x-readmates-club-host");
  copiedHeaders.delete("x-readmates-club-slug");

  const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    copiedHeaders.append("set-cookie", cookie);
  }
  if (setCookies.length === 0) {
    const setCookie = headers.get("set-cookie");
    if (setCookie) copiedHeaders.append("set-cookie", setCookie);
  }
  return copiedHeaders;
}

export function normalizedHostFromRequest(request: Request) {
  const host = new URL(request.url).host.trim().toLowerCase();
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

export function clientIpFromRequest(request: Request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareIp) return cloudflareIp.slice(0, 128);
  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, 128) : null;
}

export function safeRouteSegment(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.length === 1 ? safeRouteSegment(value[0]) : null;
  if (!value) return null;
  let decodedValue: string;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decodedValue === "." || decodedValue === ".." || decodedValue.includes("/") || decodedValue.includes("\\")) {
    return null;
  }
  return encodeURIComponent(decodedValue);
}
```

Move existing duplicate helpers into this file and import them from all three functions.

- [x] **Step 3: Run BFF tests**

Run:

```bash
pnpm --dir front test -- --run tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts tests/unit/cloudflare-spa-redirects.test.ts
```

Expected: all pass.

- [x] **Step 4: Commit BFF helper extraction**

Run:

```bash
git add front/functions front/tests/unit/cloudflare-bff.test.ts front/tests/unit/cloudflare-oauth-proxy.test.ts
git commit -m "refactor: share cloudflare proxy helpers"
```

COMPACT CHECKPOINT Task 9 - Extract Shared BFF Proxy Helpers:
Acceptance criteria completed: shared Cloudflare proxy helper module created; BFF and OAuth functions import shared header/cookie/host/IP/route-segment helpers; tests assert malicious browser-supplied internal headers are overwritten by trusted server values; OAuth forwarded header builder duplication removed in follow-up; implementation committed as `54becf2`, follow-up as `d1a33a2`. Changed files: `front/functions/_shared/proxy.ts`, BFF function, OAuth authorization/callback functions, Cloudflare BFF/OAuth unit tests, and this plan document. Key decisions: route-specific API path validation remains local to BFF, while reusable trust-boundary helpers live in `_shared/proxy.ts`; OAuth `forwardedOAuthRequestHeaders` is shared because authorization start and callback must not drift; upstream response copies strip internal `x-readmates-*` headers including club slug while preserving single and multi `Set-Cookie`. Contracts/API/state/test expectations: BFF secret is only server-side; request forwarding uses server-derived `X-Readmates-Bff-Secret`, `X-Readmates-Client-IP`, `X-Readmates-Club-Host`, and route-selected club slug; safe OAuth registration IDs still reject path traversal, slash, backslash, and multi-segment values; Cloudflare helper bundles as shared code, not a route. Reviews: spec/security review found no issues; code-quality review found duplicated OAuth forwarded header construction; follow-up extracted it; final closure review found no issues. Verification: newly added malicious-header tests passed before implementation because existing code already constructed trusted headers from scratch; Task 9 command `pnpm --dir front test -- --run tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts tests/unit/cloudflare-spa-redirects.test.ts` passed, though package script ran the full unit suite; focused `pnpm --dir front exec vitest run tests/unit/cloudflare-oauth-proxy.test.ts tests/unit/cloudflare-bff.test.ts` passed; `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e`, `pnpm dlx wrangler pages functions build functions ...`, and `git diff --check` passed during review/follow-up. Remaining risks: none known; helper still deliberately derives trust headers from request/runtime context rather than inbound internal headers. Next first action: dispatch Task 10 docs implementer for architecture/test-guide/agent-guide updates, then run final full verification. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions started; completed Task 9 subagents closed; no session-owned ports open.

## Task 10: Full Verification And Documentation Updates

**Files:**

- Modify: `docs/development/architecture.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/agents/front.md`
- Modify: `docs/agents/server.md`

- [x] **Step 1: Update architecture docs**

In `docs/development/architecture.md`, update:

- paged API contract for archive, notes, feedback, host, and notification lists
- no legacy array response contract
- `shared/ui` no longer imports `src/app`
- host `ui` is the public presentation surface
- application HTTP dependency is forbidden
- BFF shared proxy helper owns trusted header forwarding policy

- [x] **Step 2: Update agent guides**

In `docs/agents/front.md`, remove language allowing documented legacy `shared/ui` exceptions.

In `docs/agents/server.md`, add:

```text
Application services must not throw Spring web/http exceptions. Use feature application errors and map them in adapter.in.web.
```

- [x] **Step 3: Run full verification**

Run:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
git diff --check -- docs/development/architecture.md docs/development/test-guide.md docs/agents/front.md docs/agents/server.md
```

Expected: all pass.

- [x] **Step 4: Commit documentation**

Run:

```bash
git add docs/development/architecture.md docs/development/test-guide.md docs/agents/front.md docs/agents/server.md
git commit -m "docs: document architecture refactor"
```

COMPACT CHECKPOINT Task 10 - Full Verification And Documentation Updates:
Acceptance criteria completed: architecture/test/agent docs updated for paged contracts, frontend boundary cleanup, server application HTTP boundary, DB query/EXPLAIN guardrails, and Cloudflare proxy helper policy; docs implementation committed as `59fa99c`, docs accuracy follow-up as `f41c90e`; full verification passed. Changed files: `docs/development/architecture.md`, `docs/development/test-guide.md`, `docs/agents/front.md`, `docs/agents/server.md`, and this plan document. Key decisions: architecture docs describe common cursor-paged fields (`items`, `nextCursor`) while allowing endpoint-specific fields such as notification `unreadCount`; `/api/host/members/pending-approvals` is documented as a host cursor-paged list; BFF docs state route functions compose trusted headers using shared `_shared/proxy.ts` helpers rather than overstating that all request header construction lives in the helper. Contracts/API/state/test expectations: scoped archive, notes, feedback, host, and notification list endpoints no longer document legacy array contracts; `shared/ui` must not import app/page/feature code; host `ui` is the public presentation surface; application services must use feature errors mapped in `adapter.in.web`, not Spring web/http exceptions; BFF secret remains server-only. Reviews: first docs spec review found missing pending approvals documentation, incomplete notification page shape, and overstated BFF helper ownership; follow-up `f41c90e` fixed all; final docs re-review found no issues; docs quality/release review found no issues. Verification: `./server/gradlew -p server clean test` passed; `pnpm --dir front lint` passed; `pnpm --dir front test` passed with 48 files and 621 tests; `pnpm --dir front build` passed; `pnpm --dir front test:e2e` passed with 22 tests; `git diff --check -- docs/development/architecture.md docs/development/test-guide.md docs/agents/front.md docs/agents/server.md` passed; reviewers also ran targeted docs safety/link scans and relevant architecture/BFF/frontend boundary tests. Existing non-failing output remains React Router `HydrateFallback`, jsdom navigation, and `NO_COLOR`/`FORCE_COLOR` warnings. Remaining risks: no known open issues; plain historical `docs/superpowers` records remain as historical artifacts. Next first action: final status summary only. Worktree/branch: `/Users/kws/.config/superpowers/worktrees/ReadMates/readmates-architecture-refactor`, `codex/readmates-architecture-refactor`. Session-owned process/port state: no dev servers or browser sessions left running; Playwright-managed web servers exited with `pnpm --dir front test:e2e`; completed Task 10 subagents closed; no session-owned ports open.

## Final Completion Criteria

- All paged endpoints return `{ items, nextCursor }`; no old array contracts remain for the scoped endpoints in this plan.
- Frontend route loaders and UIs consume paged responses and provide explicit load-more controls.
- `ServerArchitectureBoundaryTest` prevents application packages from depending on Spring web/http types.
- `OAuthReturnState` no longer depends on `JdbcTemplate`.
- DB query budget and EXPLAIN tests exist for hot paths.
- Large JDBC adapters have mapper/query/write responsibilities split while preserving port facades.
- `frontend-boundaries.test.ts` has no shared-to-app or host components legacy exceptions.
- Cloudflare proxy functions share header/cookie forwarding helpers.
- Full server, frontend, build, and e2e checks pass.

## Self-Review Checklist

- [x] Every spec section maps to at least one task:
  - cursor pagination: Tasks 1-4
  - server application boundary: Task 5
  - security persistence split: Task 5
  - DB audit and transactions: Task 6
  - JDBC adapter split: Task 7
  - frontend boundary cleanup: Task 8
  - BFF shared helper: Task 9
  - docs verification: Task 10
- [x] No placeholder strings remain in this plan.
- [x] Commands use repository-relative paths and existing test runners.
- [x] Each task has a clear commit point.
