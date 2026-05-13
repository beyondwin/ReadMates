# ReadMates Manual Notification Dispatch Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining manual notification dispatch spec gaps after `272e6a5`, especially host audit UI, member search/pagination, session-editor sent badges, stricter membership validation, member inbox row interaction, mobile polish, and deeper E2E coverage.

**Architecture:** Keep the existing notification clean-architecture slice. Server additions stay additive: application models and ports expose manual dispatch query data, JDBC adapters own SQL/search/cursors, controllers map to public-safe DTOs, and frontend route modules own data fetching while UI components remain prop/callback driven.

**Tech Stack:** Kotlin/Spring Boot, MySQL/Flyway existing schema, React/Vite, React Router 7, Vitest/Testing Library, Playwright E2E.

---

## Source Documents

- Completion spec: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-completion-design.md`
- Original spec: `docs/superpowers/specs/2026-05-13-readmates-manual-notification-dispatch-design.md`
- Original plan: `docs/superpowers/plans/2026-05-13-readmates-manual-notification-dispatch-implementation-plan.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Architecture source of truth: `docs/development/architecture.md`

## File Structure

### Server

- Modify `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
  - Add `ManualNotificationSessionSummary`, `ManualNotificationDispatchListItem`, `ManualNotificationDispatchList`, event source metadata fields.
- Modify `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
  - Add manual dispatch list method to `ManageManualHostNotificationsUseCase`.
- Modify `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
  - Add search-aware options query, dispatch list query, and membership edit validation contract.
- Modify `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
  - Call membership validation before preview/confirm target calculation and include dispatch list/session summary in options.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
  - Implement stable member search cursor, manual dispatch list query, session date mapping, and strict membership validation SQL.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/HostNotificationLedgerQueries.kt`
  - Join manual dispatch rows into event ledger query.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`
  - Map event source/manual dispatch metadata for host ledger.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
  - Add `GET /api/host/notifications/manual/dispatches`; accept `search` in options.
- Modify `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
  - Add response DTOs for session summary, manual dispatch list, event source metadata.
- Test `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- Test `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

### Frontend

- Modify `front/features/host/api/host-contracts.ts`
  - Add manual dispatch list/session summary/event source types.
- Modify `front/features/host/model/host-view-types.ts`
  - Mirror API response types needed by UI without importing API contracts into UI.
- Modify `front/features/host/api/host-api.ts`
  - Add `fetchManualNotificationDispatches`; pass `search` to `fetchManualNotificationOptions`.
- Modify `front/features/host/route/host-notifications-data.ts`
  - Load recent manual dispatches; expose search/load-more actions for members and dispatches.
- Modify `front/features/host/route/host-notifications-route.tsx`
  - Own manual member search state and recent dispatch state refresh after confirm.
- Modify `front/features/host/route/host-session-editor-data.ts`
  - Return `{ session, notificationDispatches }` for existing session edit routes.
- Modify `front/features/host/route/host-session-editor-route.tsx`
  - Pass composite route data to the editor.
- Modify `front/features/host/ui/host-session-editor.tsx`
  - Accept optional manual dispatch summary and pass it to `HostSessionNotificationActions`.
- Modify `front/features/host/ui/session-editor/session-editor-notifications.tsx`
  - Render sent badges, last sent time, and resend link text.
- Modify `front/features/host/ui/host-notifications-page.tsx`
  - Render recent manual dispatch section and pass member search callbacks into workbench.
- Modify `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Add mobile step sections and session date hint.
- Modify `front/features/host/ui/notifications/manual-notification-member-picker.tsx`
  - Add search form, load more, clear search, and loading states.
- Create `front/features/host/ui/notifications/manual-notification-dispatch-ledger.tsx`
  - Pure UI for recent manual dispatch rows.
- Modify `front/features/host/ui/notifications/notification-event-ledger.tsx`
  - Show source badge and manual dispatch summary.
- Modify `front/features/notifications/ui/member-notifications-page.tsx`
  - Make row body open the notification while keeping the read button independent.
- Test `front/tests/unit/host-notifications.test.tsx`
- Test `front/tests/unit/host-session-notifications.test.tsx`
- Test `front/tests/unit/host-session-editor.test.tsx`
- Test `front/tests/unit/member-notifications.test.tsx`
- Modify `front/tests/e2e/readmates-e2e-db.ts`
  - Return generated open session ids and clean notification artifacts created by manual dispatch E2E tests.
- Test `front/tests/e2e/manual-notifications.spec.ts`

---

## Task 1: Server Query Models and Contracts

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationManualDispatchModelsTest.kt`

- [ ] **Step 1: Add failing model assertions**

Extend `NotificationManualDispatchModelsTest` with assertions for the new additive models:

```kotlin
@Test
fun `manual dispatch list item carries host audit metadata`() {
    val item = ManualNotificationDispatchListItem(
        manualDispatchId = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
        eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
        source = NotificationDispatchSource.MANUAL,
        eventType = NotificationEventType.SESSION_REMINDER_DUE,
        sessionId = UUID.nameUUIDFromBytes("session".toByteArray()),
        sessionNumber = 8,
        bookTitle = "Example Book",
        requestedChannels = ManualNotificationRequestedChannels.BOTH,
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        resend = true,
        requestedBy = "h***@example.com",
        targetCount = 17,
        expectedInAppCount = 17,
        expectedEmailCount = 14,
        eventStatus = NotificationEventOutboxStatus.PENDING,
        createdAt = OffsetDateTime.parse("2026-05-13T10:10:00Z"),
    )

    assertThat(item.source).isEqualTo(NotificationDispatchSource.MANUAL)
    assertThat(item.resend).isTrue()
    assertThat(item.requestedBy).doesNotContain("host@example.com")
}
```

- [ ] **Step 2: Run failing model test**

Run:

```bash
./server/gradlew -p server test --tests '*NotificationManualDispatchModelsTest'
```

Expected: FAIL because `ManualNotificationDispatchListItem` does not exist.

- [ ] **Step 3: Add application models**

Add these models to `NotificationModels.kt` near the current manual notification models:

```kotlin
data class ManualNotificationSessionSummary(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate?,
    val state: String,
    val visibility: String,
    val feedbackDocumentUploaded: Boolean,
)

data class ManualNotificationDispatchListItem(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val source: NotificationDispatchSource,
    val eventType: NotificationEventType,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val resend: Boolean,
    val requestedBy: String,
    val targetCount: Int,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
    val eventStatus: NotificationEventOutboxStatus,
    val createdAt: OffsetDateTime,
)

data class ManualNotificationDispatchList(
    val items: List<ManualNotificationDispatchListItem>,
    val nextCursor: String?,
)

data class HostNotificationManualDispatchMetadata(
    val manualDispatchId: UUID,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val resend: Boolean,
    val requestedBy: String,
    val targetCount: Int,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
)
```

Extend `ManualNotificationOptions`:

```kotlin
data class ManualNotificationOptions(
    val session: ManualNotificationSessionSummary?,
    val templates: List<ManualNotificationTemplateOption>,
    val members: List<ManualNotificationMemberOption>,
    val nextCursor: String?,
    val recentDispatches: List<ManualNotificationDispatchListItem>,
)
```

Extend `HostNotificationEvent`:

```kotlin
data class HostNotificationEvent(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val source: NotificationDispatchSource = NotificationDispatchSource.AUTOMATIC,
    val manualDispatch: HostNotificationManualDispatchMetadata? = null,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)
```

- [ ] **Step 4: Extend ports**

Update `ManageManualHostNotificationsUseCase`:

```kotlin
fun options(host: CurrentMember, sessionId: UUID?, search: String?, pageRequest: PageRequest): ManualNotificationOptions
fun listDispatches(
    host: CurrentMember,
    sessionId: UUID?,
    eventType: NotificationEventType?,
    pageRequest: PageRequest,
): ManualNotificationDispatchList
```

Update `ManualNotificationSessionContext` with `date: LocalDate?` and add outbound methods:

```kotlin
fun listMembers(clubId: UUID, sessionId: UUID?, search: String?, pageRequest: PageRequest): CursorPage<ManualNotificationMemberOption>
fun listDispatches(
    clubId: UUID,
    sessionId: UUID?,
    eventType: NotificationEventType?,
    pageRequest: PageRequest,
): ManualNotificationDispatchList
fun validateMembershipEdits(clubId: UUID, membershipIds: Set<UUID>): Boolean
```

- [ ] **Step 5: Run focused compile test**

Run:

```bash
./server/gradlew -p server test --tests '*NotificationManualDispatchModelsTest' --tests '*ServerArchitectureBoundaryTest'
```

Expected: compile failures in adapters/controllers until later tasks. Keep this red state while moving to Task 2.

---

## Task 2: Server Persistence, Search Cursor, and Strict Membership Validation

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`

- [ ] **Step 1: Add failing persistence tests**

Add tests:

```kotlin
@Test
fun `listMembers filters by display name or email with stable cursor`() {
    val page = adapter.listMembers(clubId, sessionId, "member", PageRequest.cursor(limit = 1, cursor = null))

    assertThat(page.items).hasSize(1)
    assertThat(page.nextCursor).isNotBlank()

    val next = adapter.listMembers(clubId, sessionId, "member", PageRequest.cursor(limit = 10, cursor = page.nextCursor))
    assertThat(next.items.map { it.membershipId }).doesNotContain(page.items.single().membershipId)
}

@Test
fun `validateMembershipEdits rejects out of club ids`() {
    val otherClubMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000901")

    assertThat(adapter.validateMembershipEdits(clubId, setOf(otherClubMembershipId))).isFalse()
}

@Test
fun `listDispatches returns masked audit rows`() {
    val stored = insertManualDispatchFixture()

    val page = adapter.listDispatches(clubId, sessionId, NotificationEventType.SESSION_REMINDER_DUE, PageRequest.cursor(10, null))

    assertThat(page.items.map { it.manualDispatchId }).contains(stored.manualDispatchId)
    assertThat(page.items.single { it.manualDispatchId == stored.manualDispatchId }.requestedBy).contains("***@")
}
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```bash
./server/gradlew -p server test --tests '*JdbcManualNotificationDispatchAdapterTest'
```

Expected: FAIL because new methods/search behavior are not implemented.

- [ ] **Step 3: Implement session date mapping**

Update the session context SQL to select `sessions.session_date` and map it:

```sql
select
  sessions.id,
  sessions.club_id,
  sessions.number,
  sessions.book_title,
  sessions.session_date,
  sessions.state,
  sessions.visibility,
  exists(...) as feedback_document_uploaded
```

Map with `rs.getDate("session_date")?.toLocalDate()`.

- [ ] **Step 4: Implement search and stable cursor**

Replace the current display-name-only cursor in `listMembers` with a cursor containing `displayName` and `membershipId`. Add search predicates:

```sql
and (
  ? is null
  or lower(coalesce(memberships.short_name, users.name)) like ?
  or lower(users.name) like ?
  or lower(users.email) like ?
)
```

Use a normalized query:

```kotlin
val normalizedSearch = search?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
val likeSearch = normalizedSearch?.let { "%$it%" }
```

Do not log the search string.

- [ ] **Step 5: Implement `validateMembershipEdits`**

Add SQL that counts active memberships in the current club:

```kotlin
override fun validateMembershipEdits(clubId: UUID, membershipIds: Set<UUID>): Boolean {
    if (membershipIds.isEmpty()) return true
    val placeholders = membershipIds.joinToString(",") { "?" }
    val count = jdbcTemplate.queryForObject(
        """
        select count(*)
        from memberships
        where club_id = ?
          and status = 'ACTIVE'
          and id in ($placeholders)
        """.trimIndent(),
        Int::class.java,
        *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
    ) ?: 0
    return count == membershipIds.size
}
```

- [ ] **Step 6: Implement dispatch list query**

Query `notification_manual_dispatches`, `notification_event_outbox`, `sessions`, `memberships`, and `users`. Sort by `notification_manual_dispatches.created_at desc, notification_manual_dispatches.id desc`. Cursor fields are `createdAt` and `id`. Return masked requester using the adapter's existing `maskEmail`.

- [ ] **Step 7: Run adapter tests**

Run:

```bash
./server/gradlew -p server test --tests '*JdbcManualNotificationDispatchAdapterTest'
```

Expected: PASS.

---

## Task 3: Server Service, Controller, DTOs, and Event Ledger Metadata

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/HostNotificationLedgerQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/HostNotificationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/HostManualNotificationServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/api/HostNotificationControllerTest.kt`

- [ ] **Step 1: Add failing service tests for strict membership validation**

Add:

```kotlin
@Test
fun `preview rejects membership edits outside current club`() {
    val invalidId = UUID.nameUUIDFromBytes("invalid".toByteArray())
    val port = FakeManualPort(membershipEditsAllowed = false)
    val service = service(port)

    assertThatThrownBy {
        service.preview(host(), ManualNotificationPreviewCommand(selection(includedMembershipIds = listOf(invalidId))))
    }
        .isInstanceOf(NotificationApplicationException::class.java)
        .extracting("error")
        .isEqualTo(NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED)
}
```

- [ ] **Step 2: Add failing controller tests**

Add tests to `HostNotificationControllerTest`:

```kotlin
@Test
fun `host lists manual dispatch audit rows`() {
    val previewId = createManualPreview()
    confirmManualDispatch(previewId, resendConfirmed = true)

    mockMvc.get("/api/host/notifications/manual/dispatches") {
        with(hostSession())
        param("sessionId", SESSION_ID.toString())
    }
        .andExpect { status { isOk() } }
        .andExpect { jsonPath("$.items[0].source") { value("MANUAL") } }
        .andExpect { jsonPath("$.items[0].requestedChannels") { value("BOTH") } }
        .andExpect { jsonPath("$.items[0].requestedBy") { value(containsString("***@")) } }
}

@Test
fun `host event ledger exposes manual source metadata`() {
    val previewId = createManualPreview()
    val eventId = confirmManualDispatch(previewId, resendConfirmed = true)

    mockMvc.get("/api/host/notifications/events") {
        with(hostSession())
    }
        .andExpect { status { isOk() } }
        .andExpect { jsonPath("$.items[?(@.id == '$eventId')].source") { value("MANUAL") } }
}
```

- [ ] **Step 3: Run failing focused tests**

Run:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest' --tests '*HostNotificationControllerTest'
```

Expected: FAIL until service/controller/DTO mapping is complete.

- [ ] **Step 4: Update service**

In `validateSelection`, after template/session validation, validate the set of included and excluded ids:

```kotlin
val editedIds = (selection.includedMembershipIds + selection.excludedMembershipIds).toSet()
if (!manualDispatchPort.validateMembershipEdits(host.clubId, editedIds)) {
    throw NotificationApplicationException(
        NotificationApplicationError.MEMBERSHIP_NOT_ALLOWED,
        "Manual notification membership selection is not allowed",
    )
}
```

Update `options` to accept `search`, map session summary, and include `manualDispatchPort.listDispatches(...).items.take(5)`.

- [ ] **Step 5: Add controller endpoint and DTO mapping**

Add to `HostNotificationController`:

```kotlin
@GetMapping("/manual/dispatches")
fun manualDispatches(
    host: CurrentMember,
    @RequestParam(required = false) sessionId: UUID?,
    @RequestParam(required = false) eventType: NotificationEventType?,
    @RequestParam(required = false) limit: Int?,
    @RequestParam(required = false) cursor: String?,
): ManualNotificationDispatchListResponse =
    manageManualHostNotificationsUseCase
        .listDispatches(host, sessionId, eventType, PageRequest.cursor(limit, cursor, defaultLimit = 20, maxLimit = 100))
        .toResponse()
```

Update `manualOptions` to accept `search`.

- [ ] **Step 6: Extend event ledger SQL and mapper**

Left join manual dispatches by `event_id` in the host events query. Select source fields with null-safe defaults:

```sql
case when notification_manual_dispatches.id is null then 'AUTOMATIC' else 'MANUAL' end as source,
notification_manual_dispatches.id as manual_dispatch_id,
notification_manual_dispatches.requested_channels,
notification_manual_dispatches.audience,
notification_manual_dispatches.resend,
notification_manual_dispatches.target_count,
notification_manual_dispatches.expected_in_app_count,
notification_manual_dispatches.expected_email_count,
users.email as requested_by_email
```

Map automatic rows to `manualDispatch = null`.

- [ ] **Step 7: Run server focused tests**

Run:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest' --tests '*HostNotificationControllerTest' --tests '*ServerArchitectureBoundaryTest'
```

Expected: PASS.

---

## Task 4: Frontend Contracts and Route Data

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/model/host-view-types.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/route/host-notifications-data.ts`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Add failing route/unit expectations**

In `host-notifications.test.tsx`, extend fixtures with `manualDispatches` and assert:

```ts
expect(screen.getByRole("heading", { name: "최근 수동 발송" })).toBeInTheDocument();
expect(screen.getByText("앱+이메일")).toBeInTheDocument();
expect(screen.getByText("수동")).toBeInTheDocument();
```

In `host-session-editor.test.tsx`, assert the editor can render a sent badge when route data includes dispatches:

```ts
expect(screen.getByText("이미 발송됨")).toBeInTheDocument();
expect(screen.getByRole("link", { name: /재발송 검토/ })).toHaveAttribute("href", expect.stringContaining("eventType=SESSION_REMINDER_DUE"));
```

- [ ] **Step 2: Run failing frontend tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: FAIL until route contracts/UI are added.

- [ ] **Step 3: Add TypeScript contracts**

Add:

```ts
export type NotificationDispatchSource = "AUTOMATIC" | "MANUAL";

export type ManualNotificationDispatchListItem = {
  manualDispatchId: string;
  eventId: string;
  source: "MANUAL";
  eventType: HostNotificationEventType;
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  requestedChannels: ManualNotificationRequestedChannels;
  audience: ManualNotificationAudience;
  resend: boolean;
  requestedBy: string;
  targetCount: number;
  expectedInAppCount: number;
  expectedEmailCount: number;
  eventStatus: NotificationEventOutboxStatus;
  createdAt: string;
};

export type ManualNotificationDispatchListResponse = PagedResponse<ManualNotificationDispatchListItem>;
```

Extend `HostNotificationEventItem` with `source` and `manualDispatch`.

- [ ] **Step 4: Add API functions**

Update `fetchManualNotificationOptions` request shape:

```ts
request?: { sessionId?: string; search?: string; page?: PageRequest }
```

Add:

```ts
export function fetchManualNotificationDispatches(
  context?: ReadmatesApiContext,
  request?: { sessionId?: string; eventType?: HostNotificationEventType; page?: PageRequest },
) {
  const params = new URLSearchParams();
  if (request?.sessionId) params.set("sessionId", request.sessionId);
  if (request?.eventType) params.set("eventType", request.eventType);
  const pageParams = pagingSearchParams(request?.page);
  const pageSearch = pageParams.startsWith("?") ? pageParams.slice(1) : "";
  if (pageSearch) new URLSearchParams(pageSearch).forEach((value, key) => params.set(key, value));
  const search = params.toString();
  return readmatesFetch<ManualNotificationDispatchListResponse>(
    `/api/host/notifications/manual/dispatches${search ? `?${search}` : ""}`,
    undefined,
    context,
  );
}
```

- [ ] **Step 5: Wire route data**

Load dispatches in host notifications loader:

```ts
const [summary, events, deliveries, audit, manualOptions, manualDispatches] = await Promise.all([...]);
```

Add actions:

```ts
loadManualOptions: (sessionId?: string, search?: string, page?: PageRequest) =>
  fetchManualNotificationOptions(undefined, { sessionId, search, page }),
loadManualDispatches: (page?: PageRequest) => fetchManualNotificationDispatches(undefined, { page }),
```

For session editor, return:

```ts
const [session, notificationDispatches] = await Promise.all([
  fetchHostSessionDetail(params.sessionId, context),
  fetchManualNotificationDispatches(context, { sessionId: params.sessionId, page: { limit: 20 } }),
]);
return { session, notificationDispatches };
```

- [ ] **Step 6: Run route tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: contract compile errors may remain until UI tasks are complete.

---

## Task 5: Host Notification UI Completion

**Files:**
- Create: `front/features/host/ui/notifications/manual-notification-dispatch-ledger.tsx`
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-member-picker.tsx`
- Modify: `front/features/host/ui/notifications/notification-event-ledger.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing UI tests for search and load more**

Add expectations:

```ts
await user.type(screen.getByRole("searchbox", { name: "멤버 검색" }), "김");
await user.click(screen.getByRole("button", { name: "검색" }));
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("search=%EA%B9%80"), expect.anything());

await user.click(screen.getByRole("button", { name: "멤버 더 보기" }));
expect(screen.getByText("추가 멤버 이름")).toBeInTheDocument();
```

- [ ] **Step 2: Implement recent dispatch ledger**

Create `ManualNotificationDispatchLedger` with pure props:

```ts
type ManualNotificationDispatchLedgerProps = {
  dispatches: ManualNotificationDispatchListItem[];
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => Promise<unknown>;
};
```

Render an empty state when there are no rows. Use existing `eventLabels`, `formatDateOnlyLabel`, and channel/audience label maps.

- [ ] **Step 3: Add member search controls**

Update member picker props:

```ts
search: string;
hasMore: boolean;
loading: boolean;
onSearchChange: (value: string) => void;
onSearchSubmit: () => Promise<unknown>;
onSearchClear: () => Promise<unknown>;
onLoadMore: () => Promise<unknown>;
```

Use `<input type="search" aria-label="멤버 검색">`, a `검색` button, a conditional `초기화` button, and a conditional `멤버 더 보기` button.

- [ ] **Step 4: Add mobile step structure and date hint**

In `ManualNotificationWorkbench`, group controls into semantic sections:

```tsx
<section aria-labelledby="manual-step-template">...</section>
<section aria-labelledby="manual-step-session">...</section>
<section aria-labelledby="manual-step-audience">...</section>
<section aria-labelledby="manual-step-channel">...</section>
<section aria-labelledby="manual-step-members">...</section>
```

If `options.session?.date` exists and `selection.eventType === "SESSION_REMINDER_DUE"`, render a short hint using a pure helper:

```ts
function reminderDateHint(sessionDate: string, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [year, month, day] = sessionDate.split("-").map(Number);
  const sessionDay = new Date(year, month - 1, day).getTime();
  const days = Math.round((sessionDay - startOfToday) / 86_400_000);
  if (days === 0) return "오늘 모임";
  if (days > 0) return `D-${days}`;
  return `지난 모임 D+${Math.abs(days)}`;
}
```

Use local date calculation without adding a new date library.

- [ ] **Step 5: Extend event ledger UI**

Show `source` badge beside the event label. For manual rows, render:

```tsx
<span>{channelLabel[event.manualDispatch.requestedChannels]}</span>
<span>{audienceLabel[event.manualDispatch.audience]}</span>
<span>{event.manualDispatch.targetCount}명</span>
<span>요청 {event.manualDispatch.requestedBy}</span>
```

- [ ] **Step 6: Run host notification tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: PASS.

---

## Task 6: Session Editor Sent Badges

**Files:**
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-editor-notifications.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Test: `front/tests/unit/host-session-notifications.test.tsx`
- Test: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Add focused component tests**

In `host-session-notifications.test.tsx`, add:

```ts
it("marks sent templates and links resend review to host notifications", () => {
  render(
    <HostSessionNotificationActions
      sessionId="session-1"
      state="OPEN"
      visibility="MEMBER"
      feedbackDocumentUploaded
      dispatches={[
        {
          manualDispatchId: "dispatch-1",
          eventId: "event-1",
          source: "MANUAL",
          eventType: "SESSION_REMINDER_DUE",
          sessionId: "session-1",
          sessionNumber: 8,
          bookTitle: "Example Book",
          requestedChannels: "BOTH",
          audience: "ALL_ACTIVE_MEMBERS",
          resend: false,
          requestedBy: "h***@example.com",
          targetCount: 17,
          expectedInAppCount: 17,
          expectedEmailCount: 14,
          eventStatus: "PUBLISHED",
          createdAt: "2026-05-13T10:10:00Z",
        },
      ]}
    />,
  );

  expect(screen.getByText("이미 발송됨")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /재발송 검토/ })).toHaveAttribute("href", expect.stringContaining("eventType=SESSION_REMINDER_DUE"));
});
```

- [ ] **Step 2: Update component props and rendering**

Add `dispatches?: ManualNotificationDispatchListItem[]` to `HostSessionNotificationActions`. For each action, find the latest dispatch by `eventType`. If present, render:

```tsx
<span className="badge badge-ok badge-dot">이미 발송됨</span>
<span className="tiny muted">{formatDateOnlyLabel(latest.createdAt)}</span>
```

Change enabled link text to `재발송 검토` when a latest dispatch exists.

- [ ] **Step 3: Pass route data**

In `host-session-editor-route.tsx`, pass `loaderData.session` and `loaderData.notificationDispatches.items`. In tests that pass a bare session, default dispatches to an empty array to preserve existing behavior.

- [ ] **Step 4: Run editor tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-session-notifications.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

---

## Task 7: Member Notification Row Interaction

**Files:**
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
- Test: `front/tests/unit/member-notifications.test.tsx`

- [ ] **Step 1: Add failing row interaction tests**

Add:

```ts
it("opens unread notification from the row body without triggering read button clicks", async () => {
  const user = userEvent.setup();
  const onOpenNotification = vi.fn();
  const onMarkRead = vi.fn();

  render(<MemberNotificationsPage {...props} onOpenNotification={onOpenNotification} onMarkRead={onMarkRead} />);

  await user.click(screen.getByText("알림 본문"));
  expect(onOpenNotification).toHaveBeenCalledWith("notification-1", expect.stringContaining("/clubs/reading-sai/app"));

  await user.click(screen.getByRole("button", { name: "읽음" }));
  expect(onMarkRead).toHaveBeenCalledWith("notification-1");
  expect(onOpenNotification).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Implement row body open**

Wrap the text content area in an anchor-like clickable element or attach an `onClick` to the content area. Keep the actual title as an `<a>` for keyboard navigation. If using content-area click, guard interactive descendants:

```ts
function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a,button,input,select,textarea"));
}
```

For unread items, call `onOpenNotification(item.id, href)` on primary click. For read items, set `window.location.href = href` only if not in router tests; prefer the existing anchor for normal navigation.

- [ ] **Step 3: Stop read button propagation**

On the read button:

```tsx
onClick={(event) => {
  event.stopPropagation();
  onMarkRead(item.id);
}}
```

- [ ] **Step 4: Run member notification tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/member-notifications.test.tsx
```

Expected: PASS.

---

## Task 8: E2E Coverage

**Files:**
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Server/front code only if E2E reveals an implementation bug.

- [ ] **Step 1: Add deterministic E2E helpers**

Update `createOpenSessionFixture` in `front/tests/e2e/readmates-e2e-db.ts` to return the generated `sessionId`:

```ts
export function createOpenSessionFixture() {
  const sessionId = randomUUID();

  runMysql(`... existing insert using ${sqlString(sessionId)} ...`);

  return sessionId;
}
```

Add a cleanup helper for manual notification artifacts tied to generated sessions:

```ts
export function cleanupManualNotificationArtifacts() {
  runMysql(`
delete from notification_manual_dispatches
where club_id = ${sqlString(clubId)}
  and session_id in (
    select id from sessions
    where club_id = ${sqlString(clubId)}
      and number >= 7
  );

delete from member_notifications
where club_id = ${sqlString(clubId)}
  and event_id in (
    select id from notification_event_outbox
    where club_id = ${sqlString(clubId)}
      and dedupe_key like 'manual:%'
  );

delete from notification_deliveries
where club_id = ${sqlString(clubId)}
  and event_id in (
    select id from notification_event_outbox
    where club_id = ${sqlString(clubId)}
      and dedupe_key like 'manual:%'
  );

delete from notification_event_outbox
where club_id = ${sqlString(clubId)}
  and dedupe_key like 'manual:%';

delete from notification_manual_dispatch_previews
where club_id = ${sqlString(clubId)};
`);
}
```

Call `cleanupManualNotificationArtifacts()` before `cleanupGeneratedSessions()` in E2E `afterEach` blocks that create manual dispatches.

- [ ] **Step 2: Extend E2E scenario**

Add tests:

```ts
test("host previews and confirms a manual reminder, then duplicate requires resend confirmation", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/notifications?sessionId=${sessionId}&eventType=SESSION_REMINDER_DUE`);
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByText("발송 예상")).toBeVisible();
  await page.getByRole("button", { name: /발송 요청/ }).click();
  await expect(page.getByText("수동 알림 발송을 요청했습니다.")).toBeVisible();

  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByText(/이미 발송/)).toBeVisible();
});
```

Use existing imports from `manual-notifications.spec.ts`: `loginWithGoogleFixture` and `resetSeedGoogleLogins`. Add `createOpenSessionFixture`, `cleanupGeneratedSessions`, and `cleanupManualNotificationArtifacts` from `readmates-e2e-db.ts`.

- [ ] **Step 3: Add member inbox assertion**

After confirm, navigate as a target member and assert the notification label/title appears in `/clubs/reading-sai/app/notifications`. Keep the assertion product-level, not raw DB-level:

```ts
await loginWithGoogleFixture(page, "member1@example.com");
await page.goto("/clubs/reading-sai/app/notifications");
await expect(page.getByText("모임 전날")).toBeVisible();
```

- [ ] **Step 4: Add opt-out assertion at API or UI level**

If existing E2E environment can set notification preferences through UI or API, disable email for a fixture member before confirm and assert the host ledger shows skipped/expected email count lower than target count. If the E2E environment cannot mutate preferences reliably, keep this as a server integration assertion in `JdbcNotificationDeliveryAdapterTest` and document that E2E covers the visible host flow.

- [ ] **Step 5: Run focused E2E**

Run:

```bash
pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
```

Expected: PASS.

---

## Task 9: Full Verification and Release Safety

**Files:**
- No source files unless verification reveals a bug.

- [ ] **Step 1: Run server suite**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 3: Run E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Commit**

Commit the completion implementation with a message that describes the remaining spec closure:

```bash
git add server front docs/superpowers
git commit -m "feat: complete manual notification dispatch audit flow"
```

---

## Plan Self-Review

- Spec coverage: G1/G2 are covered by Tasks 1-5; G3 by Tasks 2, 4, 5; G4 by Task 6; G5 by Tasks 1, 3, 5; G6 by Tasks 2-3; G7 by Task 7; G8 by Task 5; G9 by Task 8.
- Architecture: controller changes stay in `adapter.in.web`; orchestration stays in `HostManualNotificationService`; SQL stays in JDBC adapters; UI gets data through route props and callbacks.
- Public safety: examples use `example.com` or sample ids; raw emails remain masked in host-facing responses.
- Migration: no new migration is planned because `V27__manual_notification_dispatch.sql` already added the required tables.
