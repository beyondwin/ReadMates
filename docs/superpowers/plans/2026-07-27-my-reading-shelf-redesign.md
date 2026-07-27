# My Reading Shelf Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/clubs/:clubSlug/app/me` as a record-first `나의 서재` that shows exact personal reading aggregates and one cursor-paginated row per session, while keeping profile, notification, logout, and membership actions discoverable in a secondary disclosure.

**Architecture:** Add a dedicated read-only archive projection behind the existing controller → use case → `@ReadOnlyApplicationService` → load port → JDBC adapter boundary. The frontend loader consumes profile, journey, and optional notification preferences, then renders one responsive component tree whose pure view model owns grouping and labels while the route owns pagination and retry state.

**Tech Stack:** Kotlin 2.2, Spring Boot, Spring JDBC, MySQL 8, JUnit 5, MockMvc, Testcontainers, React 19, TypeScript, React Router, Vitest, Testing Library, Playwright, CSS.

## Global Constraints

- Treat `docs/superpowers/specs/2026-07-27-my-reading-shelf-redesign-design.md` as the approved product and behavior contract.
- Preserve the existing `/api/archive/**` BFF and trusted club-context boundary; do not add or change a Pages Function.
- Add no database table, column, index, or Flyway migration.
- Scope all journey data to the current `clubId` and `membershipId`; never expose another member's question, review, attendance, or feedback content.
- Reuse the existing archive feedback visibility policy and re-check authorization on the feedback document route; the new projection exposes metadata only.
- Keep profile validation, notification save semantics, logout, and membership-leave confirmation behavior unchanged.
- Keep desktop and mobile in one semantic DOM. Use CSS for layout changes instead of rendering duplicate responsive trees.
- Use existing warm-paper, ink, blue, green, line, spacing, and focus tokens. Do not introduce gradients, glow, glassmorphism, or a page-specific token system.
- Do not render zero-value question or review chips, a nested link, an email outside the settings disclosure, or a percentage-only completion metric.
- Use public-safe fixture values only. Do not copy live member names, emails, identifiers, deployment values, or document contents into code, tests, docs, screenshots, or commits.
- Preserve unrelated work, especially `docs/superpowers/plans/2026-07-27-host-notification-operations-ui-redesign.md`; stage only files named by the active task.
- Run `python3 -B scripts/agent-preflight.py --intent change` with one repeated `--paths` flag per touched path before the first implementation commit and whenever the touched surface expands.

---

## Task 1: Add the personal journey read projection

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/port/in/ArchiveUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/port/out/LoadArchiveDataPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/service/ArchiveQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/MyJourneyQueries.kt`
- Create: `server/src/test/kotlin/com/readmates/archive/adapter/out/persistence/MyJourneyQueriesTest.kt`

**Consumes:**

- `CurrentMember.clubId`, `CurrentMember.membershipId`, and `CurrentMember.canBrowseMemberContent`
- `PageRequest.limit` and `PageRequest.cursor`
- Existing `CursorCodec`, database UUID helpers, and archive feedback readability rules

**Produces:**

- `MyJourneyResult` containing one page, exact whole-collection summary, and the continuation cursor
- Two fixed JDBC reads per call: one page query and one summary query
- Stable ordering by `session_date DESC`, `session_number DESC`, `session_id DESC`

- [ ] **Step 1: Write failing persistence tests for scope, aggregation, ordering, and cursor continuity**

Create `MyJourneyQueriesTest` with fixtures covering:

- an attended `CLOSED` session;
- a question-only `PUBLISHED` session;
- a long-review-only session;
- a feedback-metadata-only session;
- a `HOST_ONLY` session;
- a session in another club;
- a row with no cover and no reading check-in;
- two sessions sharing a date so the number and UUID tie-breakers are exercised;
- more rows than the requested limit.

Assert the first page has the exact order, contains only eligible sessions, aggregates the current membership's question/review counts, and returns a cursor. Fetch the next page with that cursor and assert that concatenating both pages produces no duplicate or missing `sessionId`.

Add a second test asserting the summary is independent of `limit`:

```kotlin
val firstPage =
    queries.loadMyJourney(
        jdbcTemplate,
        currentMember,
        PageRequest.cursor(1, null, defaultLimit = 12, maxLimit = 100),
    )

assertThat(firstPage.items).hasSize(1)
assertThat(firstPage.summary).isEqualTo(
    MyJourneySummaryResult(
        attendedSessionCount = 2,
        completedReadingCount = 1,
        questionCount = 3,
        reviewCount = 1,
        readableFeedbackDocumentCount = 1,
    ),
)
```

- [ ] **Step 2: Run the focused persistence test and confirm RED**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.archive.adapter.out.persistence.MyJourneyQueriesTest'
```

Expected: FAIL because the journey result models and `MyJourneyQueries` do not exist.

- [ ] **Step 3: Add exact application result types and ports**

Add these models to `ArchiveResults.kt`:

```kotlin
data class MyJourneyFeedbackDocumentResult(
    val available: Boolean,
    val readable: Boolean,
    val lockedReason: String?,
)

data class MyJourneyItemResult(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val readingProgress: Int?,
    val questionCount: Int,
    val reviewCount: Int,
    val feedbackDocument: MyJourneyFeedbackDocumentResult,
)

data class MyJourneySummaryResult(
    val attendedSessionCount: Int,
    val completedReadingCount: Int,
    val questionCount: Int,
    val reviewCount: Int,
    val readableFeedbackDocumentCount: Int,
)

data class MyJourneyResult(
    val items: List<MyJourneyItemResult>,
    val summary: MyJourneySummaryResult,
    val nextCursor: String?,
)
```

Add the input port:

```kotlin
interface ListMyJourneyUseCase {
    fun listMyJourney(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): MyJourneyResult
}
```

Add the output-port method:

```kotlin
fun loadMyJourney(
    currentMember: CurrentMember,
    pageRequest: PageRequest,
): MyJourneyResult
```

Make `ArchiveQueryService` implement `ListMyJourneyUseCase` and route it through the same `withMemberAppAccess` guard used by the other archive collections:

```kotlin
override fun listMyJourney(
    currentMember: CurrentMember,
    pageRequest: PageRequest,
) = withMemberAppAccess(currentMember) {
    loadArchiveDataPort.loadMyJourney(currentMember, pageRequest)
}
```

- [ ] **Step 4: Implement a dedicated fixed-query JDBC reader**

Create `MyJourneyQueries` instead of expanding `ArchiveListQueries`. Decode a cursor with all three sort keys:

```kotlin
private data class MyJourneyCursor(
    val date: LocalDate,
    val sessionNumber: Int,
    val sessionId: String,
) {
    fun encode(): String? =
        CursorCodec.encode(
            mapOf(
                "date" to date.toString(),
                "sessionNumber" to sessionNumber.toString(),
                "sessionId" to sessionId,
            ),
        )

    companion object {
        fun from(cursor: Map<String, String>): MyJourneyCursor? {
            val date = cursor["date"]?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
            val sessionNumber = cursor["sessionNumber"]?.toIntOrNull() ?: return null
            val sessionId = cursor["sessionId"]?.takeIf { it.isNotBlank() } ?: return null
            return MyJourneyCursor(date, sessionNumber, sessionId)
        }
    }
}
```

Build one page query around session-level aggregate subqueries. Bind `clubId` and `membershipId` inside every membership-owned subquery. The eligibility predicate must be:

```sql
sessions.club_id = ?
and sessions.state in ('CLOSED', 'PUBLISHED')
and sessions.visibility in ('MEMBER', 'PUBLIC')
and (
  current_participant.attendance_status = 'ATTENDED'
  or coalesce(my_questions.question_count, 0) > 0
  or coalesce(my_reviews.review_count, 0) > 0
  or latest_feedback_document.id is not null
)
```

Apply cursor continuation with the same order tuple:

```sql
and (
  ? is null
  or sessions.session_date < ?
  or (sessions.session_date = ? and sessions.number < ?)
  or (sessions.session_date = ? and sessions.number = ? and sessions.id < ?)
)
order by sessions.session_date desc, sessions.number desc, sessions.id desc
limit ?
```

Select `limit + 1` rows, return only `limit`, and encode the last returned row when more data exists. Keep `readingProgress` nullable; do not coerce a missing check-in to zero. Derive feedback `available`, `readable`, and `lockedReason` with the same active-membership/attendance rules used by the existing archive detail and feedback list readers.

Build one separate aggregate query with the identical club, state, visibility, and membership boundary. Count distinct attended and completed sessions, current-membership questions and long reviews, and actually readable feedback documents. Do not sum counts across a page-limited CTE.

- [ ] **Step 5: Wire the query through the JDBC adapter**

Add one owned helper and delegate without changing existing list queries:

```kotlin
private val myJourneyQueries = MyJourneyQueries()

override fun loadMyJourney(
    currentMember: CurrentMember,
    pageRequest: PageRequest,
): MyJourneyResult = myJourneyQueries.loadMyJourney(jdbcTemplate, currentMember, pageRequest)
```

- [ ] **Step 6: Run the focused persistence test and confirm GREEN**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.archive.adapter.out.persistence.MyJourneyQueriesTest'
```

Expected: PASS with the two-query page/summary implementation.

- [ ] **Step 7: Run server formatting and architecture checks for the touched slice**

Run:

```bash
./server/gradlew -p server ktlintCheck architectureTest
python3 -B scripts/agent-preflight.py --intent change \
  --paths server/src/main/kotlin/com/readmates/archive/application \
  --paths server/src/main/kotlin/com/readmates/archive/adapter/out/persistence \
  --paths server/src/test/kotlin/com/readmates/archive/adapter/out/persistence
```

Expected: PASS and no new architecture exception.

- [ ] **Step 8: Commit the projection slice**

Stage only Task 1 files, inspect the staged diff, and commit:

```bash
git add \
  server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt \
  server/src/main/kotlin/com/readmates/archive/application/port/in/ArchiveUseCases.kt \
  server/src/main/kotlin/com/readmates/archive/application/port/out/LoadArchiveDataPort.kt \
  server/src/main/kotlin/com/readmates/archive/application/service/ArchiveQueryService.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/MyJourneyQueries.kt \
  server/src/test/kotlin/com/readmates/archive/adapter/out/persistence/MyJourneyQueriesTest.kt
git diff --cached --check
git commit -m "feat(server): add personal reading journey projection"
```

---

## Task 2: Expose and protect the journey API contract

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`

**Consumes:**

- `ListMyJourneyUseCase`
- `PageRequest.cursor(limit, cursor, defaultLimit = 12, maxLimit = 100)`
- Existing archive application exception mapping

**Produces:**

- `GET /api/archive/me/journey?limit=12&cursor=<cursor>`
- JSON response `{ items, summary, nextCursor }`
- Contract, authorization, visibility, cursor, and fixed-query-count evidence

- [ ] **Step 1: Write failing controller contract tests**

Extend `ArchiveControllerTest` with a use-case stub returning one item and a summary. Assert the exact JSON contract, including nullable `readingProgress` and the absence of feedback title, upload timestamp, content, or member identity:

```json
{
  "items": [{
    "sessionId": "00000000-0000-0000-0000-000000000001",
    "sessionNumber": 9,
    "bookTitle": "샘플 도서",
    "bookAuthor": "샘플 저자",
    "bookImageUrl": null,
    "date": "2026-07-22",
    "readingProgress": 100,
    "questionCount": 3,
    "reviewCount": 1,
    "feedbackDocument": {
      "available": true,
      "readable": true,
      "lockedReason": null
    }
  }],
  "summary": {
    "attendedSessionCount": 9,
    "completedReadingCount": 7,
    "questionCount": 28,
    "reviewCount": 3,
    "readableFeedbackDocumentCount": 9
  },
  "nextCursor": null
}
```

Assert omitted `limit` becomes 12, explicit `limit=3` is preserved, and a valid cursor is decoded and passed through with the existing archive paging behavior.

- [ ] **Step 2: Run the focused controller test and confirm RED**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.archive.api.ArchiveControllerTest'
```

Expected: FAIL because the controller route and web DTOs do not exist.

- [ ] **Step 3: Add the exact web DTO and mapper**

Add:

```kotlin
data class MyJourneyPageResponse(
    val items: List<MyJourneyItem>,
    val summary: MyJourneySummary,
    val nextCursor: String?,
)

data class MyJourneyItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val readingProgress: Int?,
    val questionCount: Int,
    val reviewCount: Int,
    val feedbackDocument: MyJourneyFeedbackDocument,
)

data class MyJourneyFeedbackDocument(
    val available: Boolean,
    val readable: Boolean,
    val lockedReason: String?,
)

data class MyJourneySummary(
    val attendedSessionCount: Int,
    val completedReadingCount: Int,
    val questionCount: Int,
    val reviewCount: Int,
    val readableFeedbackDocumentCount: Int,
)
```

Add `MyJourneyResult.toWebDto()` and private or overload-safe mappers for the nested result types. Keep the result and web names distinct so accidental reuse of the richer detail feedback DTO is impossible.

- [ ] **Step 4: Add the controller route**

Inject `ListMyJourneyUseCase` and add:

```kotlin
@GetMapping("/me/journey")
fun myJourney(
    currentMember: CurrentMember,
    @RequestParam(required = false) limit: Int?,
    @RequestParam(required = false) cursor: String?,
): MyJourneyPageResponse =
    listMyJourneyUseCase
        .listMyJourney(
            currentMember,
            PageRequest.cursor(limit, cursor, defaultLimit = 12, maxLimit = 100),
        )
        .toWebDto()
```

- [ ] **Step 5: Add DB-backed authorization and collection tests**

In `ArchiveAndNotesDbTest`, assert:

- current club data is returned;
- another club and `HOST_ONLY` data are absent;
- `CLOSED` and `PUBLISHED` member-visible rows are eligible;
- viewer/member/host behavior matches `canBrowseMemberContent`;
- suspended, left, or otherwise denied membership receives the existing archive access error;
- a limit-1 continuation has no duplicates and a stable terminal cursor;
- summary values are exact even when the first page has one item;
- JSON does not contain question text, review body, feedback file content, other member name, or email.

- [ ] **Step 6: Add a fixed query-budget assertion**

Use the existing counting data source in `ServerQueryBudgetTest`. Warm any framework or membership-resolution path according to the test's established pattern, then compare a one-item and multi-item journey response. Assert the journey projection itself remains two JDBC statements and the endpoint total does not grow with item count:

```kotlin
val smallPageQueries = measuredJourneyQueries(limit = 1)
val largePageQueries = measuredJourneyQueries(limit = 12)

assertThat(smallPageQueries).isEqualTo(largePageQueries)
assertThat(largePageQueries).isEqualTo(2)
```

If the harness counts a fixed authorization lookup outside the adapter, name the assertion `fixedEndpointQueryCount` and document the constant in the test; do not weaken the item-count invariance assertion.

- [ ] **Step 7: Run focused web, DB, and query-budget tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.archive.api.ArchiveControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.performance.ServerQueryBudgetTest'
```

Expected: PASS.

- [ ] **Step 8: Commit the API slice**

```bash
git add \
  server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveController.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt \
  server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt
git diff --cached --check
git commit -m "feat(server): expose personal journey archive API"
```

---

## Task 3: Replace the five-way my-page loader with the journey contract

**Files:**

- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/api/archive-api.ts`
- Modify: `front/features/archive/route/my-page-data.ts`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Create: `front/features/archive/route/my-page-data.test.ts`
- Modify: `front/tests/unit/my-page.test.tsx`

**Consumes:**

- `/api/app/me`
- `/api/archive/me/journey`
- `/api/me/notifications/preferences`
- `MyJourneyPage.nextCursor`

**Produces:**

- Required profile and journey route data
- Optional notification preference state
- Deduplicated load-more state that preserves existing rows on failure

- [ ] **Step 1: Write failing loader tests for request count and failure boundaries**

Create route-loader tests that mock API functions and assert:

- an active member starts exactly profile, journey, and notification-preference requests;
- profile and journey rejection reject the loader;
- notification rejection resolves the loader with `notificationPreferences.status === "error"`;
- a viewer does not request writable notification preferences;
- the route no longer fetches `/api/feedback-documents/me`, `/api/archive/me/questions`, or `/api/archive/me/reviews`.

The expected route-data shape is:

```ts
export type NotificationPreferencesLoadState =
  | { status: "ready"; preferences: NotificationPreferencesResponse }
  | { status: "unavailable" }
  | { status: "error" };

export type MyPageRouteData = {
  profile: MyPageResponse;
  journey: MyJourneyPage;
  notificationPreferences: NotificationPreferencesLoadState;
};
```

- [ ] **Step 2: Write failing route tests for load-more preservation**

In `front/tests/unit/my-page.test.tsx`, assert:

- clicking `기록 더 보기` fetches the current `nextCursor`;
- new items are appended in response order;
- duplicate `sessionId` values are discarded;
- a rejected request preserves old items and shows `기록을 더 불러오지 못했습니다.`;
- `다시 시도` repeats the same cursor once;
- the button is disabled while the request is pending;
- profile revalidation does not reset an already-open settings disclosure.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  tests/unit/my-page.test.tsx
```

Expected: FAIL on the missing journey API and route-data contract.

- [ ] **Step 4: Add frontend journey contracts and client**

Add:

```ts
export type MyJourneyFeedbackDocument = {
  available: boolean;
  readable: boolean;
  lockedReason: "NOT_AVAILABLE" | "ACTIVE_MEMBERSHIP_REQUIRED" | null;
};

export type MyJourneyItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  readingProgress: number | null;
  questionCount: number;
  reviewCount: number;
  feedbackDocument: MyJourneyFeedbackDocument;
};

export type MyJourneySummary = {
  attendedSessionCount: number;
  completedReadingCount: number;
  questionCount: number;
  reviewCount: number;
  readableFeedbackDocumentCount: number;
};

export type MyJourneyPage = PagedResponse<MyJourneyItem> & {
  summary: MyJourneySummary;
};
```

Add:

```ts
export function fetchMyJourney(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<MyJourneyPage>(
    `/api/archive/me/journey${pagingSearchParams(page)}`,
    undefined,
    context,
  );
}
```

- [ ] **Step 5: Implement the three-request loader**

For allowed access, start profile, journey, and notification work together. Catch only the optional notification request:

```ts
const notificationPreferencesPromise = notificationPreferencesAvailable
  ? fetchNotificationPreferences(context)
      .then((preferences) => ({ status: "ready", preferences }) as const)
      .catch(() => ({ status: "error" }) as const)
  : Promise.resolve({ status: "unavailable" } as const);

const [profile, journey, notificationPreferences] = await Promise.all([
  fetchMyPage(context),
  fetchMyJourney(context, { limit: 12 }),
  notificationPreferencesPromise,
]);
```

For denied member-app access, retain the existing inactive profile derivation and return an empty journey with zero summary plus `{ status: "unavailable" }`. Remove the first-page count-label helper and all feedback/question/review page fields from `MyPageRouteData`.

- [ ] **Step 6: Move journey pagination ownership into the route**

Replace report pagination with journey pagination. Track pending and error state separately from loader data:

```ts
type JourneyPaginationState = {
  pendingCursor: string | null;
  failedCursor: string | null;
};

function appendUniqueJourneyItems(
  current: MyJourneyItem[],
  incoming: MyJourneyItem[],
): MyJourneyItem[] {
  const seen = new Set(current.map((item) => item.sessionId));
  return [...current, ...incoming.filter((item) => !seen.has(item.sessionId))];
}
```

Use `failedCursor` for retry, reject duplicate in-flight cursor requests, preserve the server summary from the first page, and replace only `items` and `nextCursor` when a continuation succeeds. Keep disclosure-open state in `MyPageRoute` so loader identity changes do not close it.

For notification retry, call `revalidator.revalidate()` from the inline error action. Do not block or blank the journey while it runs.

- [ ] **Step 7: Run focused loader and route tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  tests/unit/my-page.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run type-aware frontend checks and commit**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front build
python3 -B scripts/agent-preflight.py --intent change \
  --paths front/features/archive/api \
  --paths front/features/archive/route \
  --paths front/tests/unit/my-page.test.tsx
```

Then:

```bash
git add \
  front/features/archive/api/archive-contracts.ts \
  front/features/archive/api/archive-api.ts \
  front/features/archive/route/my-page-data.ts \
  front/features/archive/route/my-page-data.test.ts \
  front/features/archive/route/my-page-route.tsx \
  front/tests/unit/my-page.test.tsx
git diff --cached --check
git commit -m "refactor(front): load exact personal journey data"
```

---

## Task 4: Build the pure shelf model and record-first responsive UI

**Files:**

- Create: `front/features/archive/model/my-reading-shelf-model.ts`
- Create: `front/features/archive/model/my-reading-shelf-model.test.ts`
- Modify: `front/features/archive/ui/my-page.tsx`
- Create: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Create: `front/features/archive/ui/my-page/my-reading-summary.tsx`
- Create: `front/features/archive/ui/my-page/my-reading-journey.tsx`
- Create: `front/features/archive/ui/my-page/my-reading-journey.test.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Consumes:**

- `MyPageResponse`
- `MyJourneyPage`
- route-owned load-more state and callbacks

**Produces:**

- One semantic responsive shelf tree
- Exact summary labels, latest-item selection, year grouping, non-zero chips, and membership-aware empty state

- [ ] **Step 1: Write failing pure-model tests**

Cover:

- latest item is the first server-ordered row;
- rows group by the year portion of `date` while preserving row order;
- only positive question and review counts become chips;
- completion label is `완독 7/9`;
- viewer, active-empty-with-current-session, and active-empty-without-current-session return distinct allowed actions;
- malformed or absent dates use a stable `연도 미상` group rather than throwing.

Use these interfaces:

```ts
export type JourneyChip = {
  kind: "QUESTION" | "REVIEW";
  label: string;
};

export type JourneyYearGroup = {
  year: string;
  items: MyJourneyItem[];
};

export type ShelfEmptyState = {
  title: string;
  body: string;
  action: { label: string; href: string } | null;
};
```

- [ ] **Step 2: Run the model test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the pure model**

Export:

```ts
export function latestJourneyItem(items: MyJourneyItem[]): MyJourneyItem | null;
export function groupJourneyByYear(items: MyJourneyItem[]): JourneyYearGroup[];
export function journeyChips(item: MyJourneyItem): JourneyChip[];
export function completionLabel(summary: MyJourneySummary): string;
export function shelfEmptyState(input: {
  membershipStatus: MembershipStatus;
  clubSlug: string;
  currentSessionId: string | null;
}): ShelfEmptyState;
```

Keep the module free of React, router, API-client, and browser imports. Use exact Korean labels:

```ts
const chips: JourneyChip[] = [];
if (item.questionCount > 0) chips.push({ kind: "QUESTION", label: `질문 ${item.questionCount}` });
if (item.reviewCount > 0) chips.push({ kind: "REVIEW", label: `서평 ${item.reviewCount}` });
return chips;
```

- [ ] **Step 4: Write failing component tests for hierarchy and actions**

In `my-reading-journey.test.tsx` and `my-page.test.tsx`, assert:

- page `h1` is `나의 서재`;
- section `h2` is `책별 기록`;
- book titles use `h3`;
- summary contains `참여`, `완독 N/M`, `질문`, and `서평`;
- latest item is visually separated but is not duplicated as a second feedback-document list;
- one session has a sibling `회차 기록` link and, when readable, `피드백 문서` link;
- the two links are not nested;
- no `질문 0` or `서평 0` text is rendered;
- absent feedback produces no feedback action;
- locked feedback produces a non-link explanation only when `lockedReason` is actionable;
- missing cover renders a title-derived typographic fallback;
- load-more pending uses `aria-busy`, failure uses `role="alert"`, and retry is keyboard reachable.

- [ ] **Step 5: Implement the new shelf composition**

Use `MyPage` only as a typed public boundary and render `MyReadingShelf`. The component contract should be:

```ts
export type MyReadingShelfProps = {
  profile: MyPageResponse;
  journey: MyJourneyPage;
  clubSlug: string;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  journeyLoadMorePending: boolean;
  journeyLoadMoreError: boolean;
  onLoadMoreJourney: () => Promise<void>;
  onRetryLoadMoreJourney: () => Promise<void>;
  settings: React.ReactNode;
};
```

Render in this DOM order:

1. header with `나의 서재`, one concise description, and `계정·알림 설정`;
2. `MyReadingSummary`;
3. latest journey panel when an item exists;
4. `책별 기록` year-grouped list;
5. load-more, pending, or retry state;
6. empty state when no item exists;
7. settings disclosure region.

Render the latest panel and the year list from the same item record, but avoid giving the latest panel and first list row identical full content. The latest panel is a concise orientation surface; the complete year-grouped list remains the canonical collection.

- [ ] **Step 6: Add editorial, token-based responsive styles**

In `globals.css`, add a page-scoped block with classes prefixed `rm-my-shelf-`. Use:

- a centered single column with `max-width`;
- typographic hierarchy and divider-separated rows;
- a bounded surface only for the latest record and open settings;
- `overflow-wrap: anywhere` for book titles;
- grid or flex layouts that allow metadata and actions to wrap;
- visible `:focus-visible` outlines using the existing focus token;
- no fixed height on rows or titles.

In `mobile.css`, preserve the same DOM order, collapse summary density, and set every action target to at least 44px:

```css
.rm-my-shelf-action,
.rm-my-shelf-settings-trigger,
.rm-my-shelf-load-more {
  min-block-size: 44px;
}
```

Do not hide an interactive element in one breakpoint while showing a duplicated copy in another.

- [ ] **Step 7: Run model, component, route, lint, and build checks**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/ui/my-page/my-reading-journey.test.tsx \
  tests/unit/my-page.test.tsx
corepack pnpm --dir front lint
corepack pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 8: Commit the shelf UI**

```bash
git add \
  front/features/archive/model/my-reading-shelf-model.ts \
  front/features/archive/model/my-reading-shelf-model.test.ts \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/ui/my-page/my-reading-shelf.tsx \
  front/features/archive/ui/my-page/my-reading-summary.tsx \
  front/features/archive/ui/my-page/my-reading-journey.tsx \
  front/features/archive/ui/my-page/my-reading-journey.test.tsx \
  front/tests/unit/my-page.test.tsx \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
git diff --cached --check
git commit -m "feat(front): redesign my page as reading shelf"
```

---

## Task 5: Move account and notification controls into the secondary disclosure

**Files:**

- Create: `front/features/archive/ui/my-page/my-page-settings.tsx`
- Create: `front/features/archive/ui/my-page/notification-settings.tsx`
- Create: `front/features/archive/ui/my-page/my-page-settings.test.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/ui/my-page/preferences-section.tsx`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Consumes:**

- Existing profile editor, notification save callback, logout control, and danger zone
- `NotificationPreferencesLoadState`
- route-owned disclosure state

**Produces:**

- Discoverable `계정과 알림` disclosure on desktop and mobile
- Isolated notification load error and retry
- Existing account safety behavior without competing with the record surface

- [ ] **Step 1: Write failing settings behavior tests**

Assert:

- settings are closed by default;
- the trigger has accessible name `계정·알림 설정`, `aria-expanded`, and `aria-controls`;
- opening scrolls or focuses the settings heading without moving keyboard focus to a hidden control;
- email appears only after opening settings;
- order is profile/membership, notifications, logout, membership boundary;
- notification `status: "error"` renders `알림 설정을 불러오지 못했습니다.` and `다시 시도`;
- notification error does not remove summary or journey rows;
- viewer/unavailable state renders no writable switches;
- profile save and route revalidation keep settings open;
- existing leave confirmation and logout control still render.

- [ ] **Step 2: Run focused settings tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/my-page-settings.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: FAIL because the disclosure and optional notification state are not implemented.

- [ ] **Step 3: Implement the controlled settings disclosure**

Use a native button and controlled region:

```tsx
<button
  type="button"
  aria-expanded={open}
  aria-controls="my-page-settings"
  onClick={() => onOpenChange(!open)}
>
  계정·알림 설정
</button>
<section
  id="my-page-settings"
  aria-labelledby="my-page-settings-title"
  hidden={!open}
>
  <h2 id="my-page-settings-title" tabIndex={-1}>계정과 알림</h2>
</section>
```

When an external header trigger opens the region, schedule focus to the heading after render and use `scrollIntoView({ block: "start" })` only when the region is outside the viewport. Respect reduced motion.

Keep the disclosure state in `MyPageRoute`; never key it by loader data.

- [ ] **Step 4: Isolate notification loading and saving states**

Create `NotificationSettings` with a discriminated union:

```ts
type NotificationSettingsProps = {
  state: NotificationPreferencesLoadState;
  onRetryLoad: () => void;
  onSave: (request: NotificationPreferencesRequest) => Promise<NotificationPreferencesResponse>;
};
```

For `ready`, preserve existing draft/save/error semantics. For `error`, show inline retry. For `unavailable`, show a short membership explanation without disabled switches that imply a save is possible.

- [ ] **Step 5: Preserve profile and destructive-action boundaries**

Compose existing controls in this order:

```tsx
<ProfileNameEditor />
<MembershipIdentity />
<NotificationSettings />
<LogoutButtonComponent />
<DangerZone />
```

Keep email inside `MembershipIdentity`. Retain profile error mapping, leave policy selection/confirmation, and logout callback contracts unchanged. Separate `DangerZone` with a divider and descriptive heading; do not visually style it as a primary shelf action.

- [ ] **Step 6: Run focused tests and frontend checks**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/my-page-settings.test.tsx \
  tests/unit/my-page.test.tsx
corepack pnpm --dir front lint
corepack pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 7: Commit the settings disclosure**

```bash
git add \
  front/features/archive/ui/my-page/my-page-settings.tsx \
  front/features/archive/ui/my-page/notification-settings.tsx \
  front/features/archive/ui/my-page/my-page-settings.test.tsx \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/ui/my-page/preferences-section.tsx \
  front/features/archive/route/my-page-route.tsx \
  front/tests/unit/my-page.test.tsx \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
git diff --cached --check
git commit -m "refactor(front): move account controls behind disclosure"
```

---

## Task 6: Remove obsolete duplicate my-page surfaces and prove responsive behavior

**Files:**

- Delete: `front/features/archive/ui/my-page/my-desktop.tsx`
- Delete: `front/features/archive/ui/my-page/my-mobile.tsx`
- Delete: `front/features/archive/ui/my-page/feedback-reports.tsx`
- Delete: `front/features/archive/ui/my-page/reading-journey-section.tsx`
- Delete: `front/features/archive/ui/my-page/reading-journey-section.test.tsx`
- Delete: `front/features/archive/ui/my-page/my-page-sections.tsx`
- Delete: `front/features/archive/ui/my-page/my-page-sections.test.tsx`
- Delete: `front/features/archive/model/reading-journey-model.ts`
- Delete: `front/features/archive/model/reading-journey-model.test.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/tests/e2e/logout-flow.spec.ts`
- Modify: relevant E2E fixture or mock files discovered by `rg`

**Consumes:**

- Completed single-tree `MyReadingShelf`
- Existing E2E member/host/viewer fixtures and responsive project configuration

**Produces:**

- No dead imports or duplicate desktop/mobile trees
- Browser evidence for hierarchy, permissions, layout, navigation, and account actions

- [ ] **Step 1: Prove every deletion target has no remaining consumer**

Run:

```bash
rg -n \
  "MyDesktop|MyMobile|FeedbackReports|MobileFeedbackReports|ReadingJourneySection|RhythmSection|WritingSection|reading-journey-model" \
  front
```

Expected: matches only in the listed obsolete files/tests. If another route imports a symbol, keep that file and narrow the deletion rather than moving unrelated consumers.

- [ ] **Step 2: Delete obsolete files and update stale unit assertions**

Delete only confirmed my-page-only components and their superseded tests. Remove old copy assertions for:

- `계정과 기록`;
- `나의 리듬`;
- `내가 남긴 문장`;
- `독서 여정`;
- `최근 활동`;
- separate `피드백 문서` list headings.

Keep assertions for the underlying profile, notification, logout, and leave behavior in the new tests.

- [ ] **Step 3: Update E2E route mocks to the journey endpoint**

Add a deterministic mock for `/api/archive/me/journey` with:

- at least two years;
- a readable feedback document;
- a locked feedback document;
- a missing cover;
- a long Korean/English mixed title;
- a continuation cursor;
- exact summary counts.

Keep the mock public-safe and ensure the second cursor response contains no duplicate first-page row.

- [ ] **Step 4: Update permission and navigation E2E assertions**

In `member-profile-permissions.spec.ts`, replace the old page-title expectation with `나의 서재` and prove:

- email is absent before opening settings;
- profile edit visibility follows the existing role/membership contract;
- viewer cannot edit notification preferences;
- leave and logout controls remain reachable after opening settings.

In `responsive-navigation-chrome.spec.ts`, test both the desktop and mobile viewports:

- page heading, summary, latest record, year headings, and book rows appear in the same order;
- the desktop has no persistent second settings column;
- the mobile page does not repeat a separate feedback list;
- settings opens from the header action and remains usable above the bottom tab bar;
- long title and action links remain within the viewport.

In `logout-flow.spec.ts`, open settings before activating the unchanged logout control.

- [ ] **Step 5: Add semantic and layout browser assertions**

Assert:

- there is one `h1`;
- section headings follow `h2`, book titles use `h3`;
- `회차 기록` and `피드백 문서` are sibling links;
- action bounding boxes are at least 44px high on mobile;
- no horizontal overflow occurs at the smallest supported mobile viewport;
- keyboard Tab order reaches settings, session record, feedback, load more, profile, notification, logout, and membership actions in DOM order.

- [ ] **Step 6: Run focused unit and E2E checks**

Run:

```bash
corepack pnpm --dir front test
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts \
  tests/e2e/logout-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Capture manual visual evidence**

Start the repo's established local frontend/backend or E2E mock runtime without stopping an unrelated existing service. Inspect:

- desktop at 1440×1000;
- mobile at 390×844;
- normal, viewer, empty, missing-cover, locked-feedback, load-more-error, and notification-load-error states;
- 200% browser zoom and reduced-motion mode.

Save screenshots only in the existing ignored test-artifact location. Verify warm-paper tone, single-column density, divider rhythm, right-side whitespace removal, bottom-nav clearance, wrapping, focus visibility, and the absence of real member data.

- [ ] **Step 8: Commit cleanup and browser coverage**

Stage the confirmed deletion paths, the three E2E specs, and only the fixture files actually changed:

```bash
git add -u front/features/archive front/tests/e2e
git add front/tests/e2e
git diff --cached --check
git commit -m "test(front): cover responsive reading shelf journey"
```

Before committing, inspect `git diff --cached --name-status` and unstage any unrelated file.

---

## Task 7: Synchronize active docs and run the final evidence matrix

**Files:**

- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`
- Verify: `docs/superpowers/specs/2026-07-27-my-reading-shelf-redesign-design.md`
- Verify: `docs/superpowers/plans/2026-07-27-my-reading-shelf-redesign.md`

**Consumes:**

- Final API and UI behavior
- `docs/development/acceptance-matrix.md`
- Repo canonical frontend, server, integration, and E2E gates

**Produces:**

- Current architecture and Unreleased documentation
- Full server/frontend/browser evidence at final HEAD
- Public-safety and whitespace evidence

- [ ] **Step 1: Update the active architecture document**

Document:

- `/api/archive/me/journey` as a member archive read projection;
- exact whole-collection summary plus cursor items;
- two fixed aggregate/page queries and no migration;
- the my-page loader's required profile/journey and optional notification preference boundary;
- one responsive record-first tree with account controls in a same-route disclosure.

Do not copy the full design spec into architecture docs. Keep the source-of-truth description concise and implementation-aligned.

- [ ] **Step 2: Add a concrete Unreleased changelog entry**

Under the current Unreleased section, add a user-facing item equivalent to:

```markdown
- 내 공간을 정확한 개인 독서 통계와 회차별 기록을 우선하는 `나의 서재`로 개편하고, 계정·알림 설정은 같은 화면의 보조 영역으로 정리했습니다.
```

Mention the additive archive projection only if the existing changelog section records API/operator details. Do not introduce a `VERSION` file.

- [ ] **Step 3: Run targeted documentation and safety checks**

Run:

```bash
python3 -B scripts/agent-preflight.py --intent change \
  --paths docs/development/architecture.md \
  --paths CHANGELOG.md
git diff --check -- docs/development/architecture.md CHANGELOG.md
rg -n \
  "/Users/|readmates\\.pages\\.dev/clubs/|@readmates|Bearer [A-Za-z0-9._-]+|BEGIN (RSA|OPENSSH) PRIVATE KEY" \
  docs/development/architecture.md \
  CHANGELOG.md
```

Expected: no private path, live club URL, real email, token-shaped value, or private key.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/development/architecture.md CHANGELOG.md
git diff --cached --check
git commit -m "docs: document personal reading shelf contract"
```

- [ ] **Step 5: Run focused acceptance evidence at final HEAD**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.archive.api.ArchiveControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.archive.adapter.out.persistence.MyJourneyQueriesTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.performance.ServerQueryBudgetTest'
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/ui/my-page/my-reading-journey.test.tsx \
  features/archive/ui/my-page/my-page-settings.test.tsx \
  tests/unit/my-page.test.tsx
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts \
  tests/e2e/logout-flow.spec.ts
```

Expected: PASS for actor authorization, club context, publication visibility, cursor continuity, persistence/query budget, and UI runtime state.

- [ ] **Step 6: Run every canonical gate once at final HEAD**

Run in this order:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Record the exact command, exit status, and any skipped lane. Do not claim a skipped or infrastructure-blocked command passed.

- [ ] **Step 7: Perform final spec and scope review**

Inspect:

```bash
git status --short --branch
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- \
  server/src/main/kotlin/com/readmates/archive \
  server/src/test/kotlin/com/readmates/archive \
  server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt \
  front/features/archive \
  front/tests/unit/my-page.test.tsx \
  front/tests/e2e \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css \
  docs/development/architecture.md \
  CHANGELOG.md
```

Check every acceptance criterion in the approved spec. Specifically confirm:

- exact server counts do not depend on page size;
- no `HOST_ONLY` or cross-club row leaks;
- feedback content is absent from the projection;
- no duplicate feedback list remains;
- settings remains reachable and closed by default;
- email is not on the default record surface;
- no duplicate responsive DOM exists;
- no zero chip, nested link, clipped long title, or inaccessible control remains;
- the unrelated host-notification plan is untouched.

- [ ] **Step 8: Request independent review before integration**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`. Resolve correctness, authorization, data-integrity, accessibility, and regression findings. Re-run the smallest affected focused checks, then re-run `git diff --check`.

Do not push, deploy, merge, or modify remote branches unless the user separately authorizes that operation.
