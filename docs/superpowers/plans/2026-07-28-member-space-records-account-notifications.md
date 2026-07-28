# Member Space Records, Account, and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the member space so `/app/me` shows only the exact personal summary and three recent books, personal history and account management have dedicated routes, notification preferences live beside the inbox, and logout is always available from authenticated app chrome.

**Architecture:** Keep the existing Spring/BFF contracts and split the frontend by route responsibility. The archive feature owns the personal shelf, full personal records, profile, and membership boundary; the notifications feature owns inbox and preference routes; the auth feature owns a prop-driven account menu and logout controller; app chrome exposes presentation slots without importing feature code.

**Tech Stack:** React 19, React Router 7 data routes, TypeScript, Vitest + Testing Library, Playwright, Vite, existing ReadMates BFF client, CSS in `front/src/styles/globals.css` and `front/shared/styles/mobile.css`.

## Global Constraints

- The approved design source is `docs/superpowers/specs/2026-07-28-member-space-records-account-notifications-design.md`.
- Use the existing `GET /api/archive/me/journey`, profile, notification preference, membership leave, and logout contracts; add no server, BFF, persistence, or Flyway change.
- `/app/me` requests journey `limit=3`; `/app/me/records` requests `limit=12` and owns continuation state.
- Every record row uses one semantic `표지 | 책·회차 정보 | 행동` DOM on desktop and mobile.
- Do not render `나의 기록`, `질문 N`, `서평 N`, zero-count chips, or `남긴 기록 없음` inside record rows.
- Preserve server summary counts, club scope, journey sort order, cursor continuity, duplicate suppression, feedback permission states, and membership-aware empty states.
- `/app/me/settings` contains profile, email, membership, and leave controls only; do not duplicate notification preferences or logout there.
- `/app/notifications` and `/app/notifications/settings` are URL-backed `받은 알림` and `수신 설정` tabs with independent failures.
- Authenticated desktop and mobile chrome must expose the profile menu with `내 공간`, `계정 관리`, and `로그아웃`.
- Keep Korean-first copy, WCAG AA contrast, visible focus, `Escape`/outside-click dismissal, focus return, reduced motion, 44px targets, and resilient Korean/English wrapping.
- Keep route-first dependency direction: `src/app -> src/pages -> features -> shared`; shared chrome receives account controls as props or slots and must not import auth feature modules.
- Create new unit tests beside source files. Keep existing fixture-dependent tests under `front/tests/unit/` and E2E tests under `front/tests/e2e/`.
- Use the root pinned package manager through Corepack: `corepack pnpm --dir front ...`.
- This primary worktree is also used by host-editor work. Execute this plan in
  an isolated worktree created from the intended HEAD, and re-check the primary
  worktree before any later integration so concurrent changes are never staged
  or overwritten.
- Do not push, open a PR, deploy, or mutate production as part of this plan.

---

## File and Responsibility Map

| Unit | Responsibility |
| --- | --- |
| `features/archive/model/my-reading-shelf-model.ts` | Pure year grouping, empty journey, deduplication, completion and empty-state copy |
| `features/archive/ui/my-page/book-record-row.tsx` | Shared three-column book row and feedback availability presentation |
| `features/archive/ui/my-page/recent-book-records.tsx` | Recent-three heading, rows, and personal-history link |
| `features/archive/route/my-page-*` | `/app/me` required profile + three-item journey data and presentation |
| `features/archive/route/my-records-*` | `/app/me/records` first page, cursor continuation, retry, and deduplication |
| `features/archive/route/account-settings-*` | `/app/me/settings` profile update and membership leave orchestration |
| `features/auth/ui/account-menu.tsx` | Prop-driven popover/menu semantics and focus behavior |
| `features/auth/route/account-menu-controller.tsx` | Existing logout action, auth-state clearing, and scoped account links |
| `shared/ui/top-nav.tsx`, `shared/ui/mobile-header.tsx` | Presentation slots for an app-composed account control |
| `features/notifications/api/*preferences*` | Existing notification preference request/response contract and BFF calls |
| `features/notifications/model/notification-preferences-model.ts` | Event order, Korean labels, defaults, and membership availability |
| `features/notifications/ui/member-notification-tabs.tsx` | Shared URL-backed inbox/settings tabs |
| `features/notifications/route/member-notification-settings-*` | Preference loader, save controller, retry, and membership gating |

All tasks are sequential. Tasks 2–6 intentionally revisit `front/src/app/routes/member.tsx` and shared CSS after their preceding contracts are green.

---

### Task 1: Create the Shared Three-Column Book Record Row

**Files:**
- Modify: `front/features/archive/model/my-reading-shelf-model.ts`
- Modify: `front/features/archive/model/my-reading-shelf-model.test.ts`
- Create: `front/features/archive/ui/my-page/book-record-row.tsx`
- Create: `front/features/archive/ui/my-page/book-record-row.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Produces: `emptyMyJourneyPage(): MyJourneyPage`
- Produces: `appendUniqueJourneyItems(current: MyJourneyItem[], incoming: MyJourneyItem[]): MyJourneyItem[]`
- Produces: `BookRecordRow({ item }: { item: MyJourneyItem }): JSX.Element`
- Consumes: existing `MyJourneyItem` and scoped `Link` behavior from `features/archive/ui/archive-link`

- [ ] **Step 1: Replace chip/latest model tests with empty-page and deduplication tests**

In `my-reading-shelf-model.test.ts`, remove tests for `latestJourneyItem()` and `journeyChips()`. Add:

```ts
it("creates a stable empty journey page", () => {
  expect(emptyMyJourneyPage()).toEqual({
    items: [],
    nextCursor: null,
    summary: {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    },
  });
});

it("appends only unseen session rows while preserving order", () => {
  const first = journeyItem({ sessionId: "first" });
  const second = journeyItem({ sessionId: "second" });
  const third = journeyItem({ sessionId: "third" });

  expect(appendUniqueJourneyItems([first, second], [second, third])).toEqual([
    first,
    second,
    third,
  ]);
});
```

- [ ] **Step 2: Write the failing `BookRecordRow` component tests**

Create `book-record-row.test.tsx` with these cases:

```tsx
it("renders one three-column row without per-book contribution copy", () => {
  render(<BookRecordRow item={item({ questionCount: 2, reviewCount: 1 })} />);

  const row = screen.getByRole("article", {
    name: "9차 보이지 않는 도시들",
  });
  expect(row).toHaveClass("rm-book-record-row");
  expect(within(row).getByText("9차 · 2026.07.22")).toBeVisible();
  expect(within(row).getByRole("heading", {
    level: 3,
    name: "보이지 않는 도시들",
  })).toBeVisible();
  expect(within(row).getByRole("link", {
    name: "회차 기록",
  })).toHaveAttribute("href", "/app/sessions/session-9");
  expect(within(row).getByRole("link", {
    name: "피드백 문서",
  })).toHaveAttribute("href", "/app/feedback/session-9");
  expect(row).not.toHaveTextContent("나의 기록");
  expect(row).not.toHaveTextContent("질문 2");
  expect(row).not.toHaveTextContent("서평 1");
});

it("shows a compact lock state only when feedback exists but is restricted", () => {
  const { rerender } = render(
    <BookRecordRow item={item({
      feedbackDocument: {
        available: true,
        readable: false,
        lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED",
      },
    })} />,
  );
  expect(screen.getByText("열람 제한")).toBeVisible();
  expect(screen.queryByRole("link", { name: "피드백 문서" })).toBeNull();

  rerender(<BookRecordRow item={item({
    feedbackDocument: {
      available: false,
      readable: false,
      lockedReason: "NOT_AVAILABLE",
    },
  })} />);
  expect(screen.queryByText("열람 제한")).toBeNull();
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/ui/my-page/book-record-row.test.tsx
```

Expected: FAIL because `emptyMyJourneyPage`, `appendUniqueJourneyItems`, and `BookRecordRow` do not exist.

- [ ] **Step 4: Implement the pure helpers and remove contribution view-models**

In `my-reading-shelf-model.ts`:

```ts
export function emptyMyJourneyPage(): MyJourneyPage {
  return {
    items: [],
    nextCursor: null,
    summary: {
      attendedSessionCount: 0,
      completedReadingCount: 0,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    },
  };
}

export function appendUniqueJourneyItems(
  current: MyJourneyItem[],
  incoming: MyJourneyItem[],
): MyJourneyItem[] {
  const seen = new Set(current.map((item) => item.sessionId));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.sessionId)) return false;
      seen.add(item.sessionId);
      return true;
    }),
  ];
}
```

Delete `JourneyChip`, `latestJourneyItem()`, and `journeyChips()`. Keep `groupJourneyByYear()`, `completionLabel()`, and `shelfEmptyState()`.

- [ ] **Step 5: Implement the prop-driven row**

Create `book-record-row.tsx`:

```tsx
export function BookRecordRow({ item }: { item: MyJourneyItem }) {
  return (
    <article
      className="rm-book-record-row"
      aria-label={`${item.sessionNumber}차 ${item.bookTitle}`}
    >
      <BookCover item={item} />
      <div className="rm-book-record-row__book">
        <p className="rm-book-record-row__meta">
          {item.sessionNumber}차 · {dateLabel(item.date)}
        </p>
        <h3>{item.bookTitle}</h3>
        <p className="rm-book-record-row__author">{item.bookAuthor}</p>
      </div>
      <div className="rm-book-record-row__actions">
        <Link to={`/app/sessions/${encodeURIComponent(item.sessionId)}`}>
          회차 기록
        </Link>
        {item.feedbackDocument.readable ? (
          <Link to={`/app/feedback/${encodeURIComponent(item.sessionId)}`}>
            피드백 문서
          </Link>
        ) : item.feedbackDocument.available &&
          item.feedbackDocument.lockedReason === "ACTIVE_MEMBERSHIP_REQUIRED" ? (
          <span className="rm-book-record-row__locked">열람 제한</span>
        ) : null}
      </div>
    </article>
  );
}
```

Keep the existing cover fallback and strict `YYYY.MM.DD` display behavior as private helpers in this file.
Both the real cover `<img>` and fallback `<div>` must emit
`className="rm-book-record-row__cover"`; add a modifier such as
`rm-book-record-row__cover--fallback` without replacing that base class.

- [ ] **Step 6: Add the responsive three-column CSS**

In `globals.css`, add one base grid:

```css
.rm-book-record-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) minmax(116px, auto);
  gap: 18px;
  align-items: center;
  min-height: 96px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line-soft);
}

.rm-book-record-row__book {
  min-width: 0;
}

.rm-book-record-row__actions {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.rm-book-record-row__actions a,
.rm-book-record-row__locked {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

@media (max-width: 768px) {
  .rm-book-record-row {
    grid-template-columns: 44px minmax(0, 1fr) 72px;
    gap: 10px;
    min-height: 94px;
    padding: 13px 0;
  }
}
```

Delete only superseded `.rm-my-shelf-chips` rules after no component imports them.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 3 command.

Expected: both files PASS, with no `나의 기록`, `질문 N`, or `서평 N` rendered by the row.

- [ ] **Step 8: Commit Task 1**

```bash
git add \
  front/features/archive/model/my-reading-shelf-model.ts \
  front/features/archive/model/my-reading-shelf-model.test.ts \
  front/features/archive/ui/my-page/book-record-row.tsx \
  front/features/archive/ui/my-page/book-record-row.test.tsx \
  front/src/styles/globals.css
git commit -m "refactor(front): add shared personal book record row"
```

---

### Task 2: Reduce `/app/me` to Summary and Three Recent Books

**Files:**
- Modify: `front/features/archive/route/my-page-data.ts`
- Modify: `front/features/archive/route/my-page-data.test.ts`
- Modify: `front/features/archive/route/my-page-route.tsx`
- Modify: `front/features/archive/ui/my-page.tsx`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- Create: `front/features/archive/ui/my-page/recent-book-records.tsx`
- Create: `front/features/archive/ui/my-page/recent-book-records.test.tsx`
- Modify: `front/src/pages/my-page.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Produces: `MyPageRouteData = { profile: MyPageResponse; journey: MyJourneyPage }`
- Produces: `RecentBookRecords({ items }: { items: MyJourneyItem[] }): JSX.Element`
- Consumes: `BookRecordRow`, `emptyMyJourneyPage()`, existing `MyReadingSummary`, and `shelfEmptyState()`

- [ ] **Step 1: Write loader tests for required data and `limit=3`**

Replace notification-preference expectations in `my-page-data.test.ts` with:

```ts
it("loads the profile and the three-item journey preview", async () => {
  await expect(myPageLoader()).resolves.toEqual({ profile, journey });
  expect(api.fetchMyPage).toHaveBeenCalledWith({ clubSlug: undefined });
  expect(api.fetchMyJourney).toHaveBeenCalledWith(
    { clubSlug: undefined },
    { limit: 3 },
  );
  expect(api.fetchNotificationPreferences).not.toHaveBeenCalled();
});

it.each([
  ["profile", "fetchMyPage"],
  ["journey", "fetchMyJourney"],
] as const)("rejects when required %s data fails", async (_label, key) => {
  api[key].mockRejectedValueOnce(new Error("required request failed"));
  await expect(myPageLoader()).rejects.toThrow("required request failed");
});
```

Keep the inactive/viewer test, but expect `{ profile: inactiveProfile, journey: emptyMyJourneyPage() }`.

- [ ] **Step 2: Write shelf presentation tests**

Create `recent-book-records.test.tsx`:

```tsx
it("renders at most three rows and a scoped full-history link", () => {
  render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/me"]}>
      <RecentBookRecords items={[first, second, third, fourth]} />
    </MemoryRouter>,
  );

  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.queryByText(fourth.bookTitle)).toBeNull();
  expect(screen.getByRole("link", {
    name: "내 기록 전체 보기",
  })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/me/records",
  );
});
```

Update `front/tests/unit/my-page.test.tsx` so the shelf test asserts:

```tsx
expect(screen.getByRole("heading", {
  level: 1,
  name: "나의 서재",
})).toBeVisible();
expect(screen.getByRole("heading", {
  level: 2,
  name: "최근 책별 기록",
})).toBeVisible();
expect(screen.queryByRole("button", {
  name: "계정·알림 설정",
})).toBeNull();
expect(screen.queryByRole("region", {
  name: "계정과 알림",
})).toBeNull();
expect(screen.queryByText(/마지막 기록은/)).toBeNull();
expect(screen.queryByRole("button", {
  name: "기록 더 보기",
})).toBeNull();
```

- [ ] **Step 3: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  features/archive/ui/my-page/recent-book-records.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: FAIL because the loader still requests 12 items and preferences, and the shelf still contains disclosure/pagination UI.

- [ ] **Step 4: Simplify the loader and route**

Set the loader contract to:

```ts
export type MyPageRouteData = {
  profile: MyPageResponse;
  journey: MyJourneyPage;
};

export async function myPageLoader(
  args?: LoaderFunctionArgs,
): Promise<MyPageRouteData> {
  const access = await loadArchiveMemberAuth(args);
  if (!access.allowed) {
    return {
      profile: inactiveMyPageData(access.auth),
      journey: emptyMyJourneyPage(),
    };
  }

  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const [profile, journey] = await Promise.all([
    fetchMyPage(context),
    fetchMyJourney(context, { limit: 3 }),
  ]);
  return { profile, journey };
}
```

`MyPageRoute` should read loader data and render `<MyPage data={profile} journey={journey} />`. Remove route-owned settings state, notification mutation, profile mutation, leave mutation, cursor refs, and pagination state.

- [ ] **Step 5: Implement the recent-three shelf**

`recent-book-records.tsx` should render the first three items with `BookRecordRow` and:

```tsx
<Link className="rm-my-shelf-all-records" to="/app/me/records">
  내 기록 전체 보기
</Link>
```

`MyReadingShelf` should keep the header, summary, and membership-aware empty state. Remove the settings trigger, `LatestJourneyItem`, year groups, load state, and settings disclosure from this route.

- [ ] **Step 6: Remove obsolete page-shell wiring**

In `front/src/pages/my-page.tsx`, remove `LogoutButton`, `useAuth`, `useAuthActions`, and profile permission wiring. Render only:

```tsx
export default function MyRoutePage() {
  return <MyPageRoute />;
}
```

Remove obsolete props from `MyPage` and its tests: `LogoutButtonComponent`, leave/profile/preference callbacks, settings state, and journey pagination state.

- [ ] **Step 7: Tighten shelf CSS**

Delete `.rm-my-shelf-latest*`, `.rm-my-shelf-settings-trigger`, and landing-page year/pagination rules that no rendered landing component uses. Add a compact recent-section header with the full-history link aligned right on desktop and retained on the same heading row on 390px mobile.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run the Step 3 command.

Expected: PASS; `/app/me` never starts notification preferences, renders no disclosure, no latest orientation panel, no year groups, and no load-more button.

- [ ] **Step 9: Commit Task 2**

```bash
git add \
  front/features/archive/route/my-page-data.ts \
  front/features/archive/route/my-page-data.test.ts \
  front/features/archive/route/my-page-route.tsx \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/ui/my-page/my-reading-shelf.tsx \
  front/features/archive/ui/my-page/recent-book-records.tsx \
  front/features/archive/ui/my-page/recent-book-records.test.tsx \
  front/src/pages/my-page.tsx \
  front/tests/unit/my-page.test.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): limit member shelf to recent books"
```

---

### Task 3: Add the Full Personal Records Route

**Files:**
- Create: `front/features/archive/route/my-records-data.ts`
- Create: `front/features/archive/route/my-records-data.test.ts`
- Create: `front/features/archive/route/my-records-route.tsx`
- Create: `front/features/archive/route/my-records-route.test.tsx`
- Create: `front/features/archive/ui/my-records-page.tsx`
- Create: `front/features/archive/ui/my-records-page.test.tsx`
- Modify: `front/features/archive/ui/my-page/my-reading-journey.tsx`
- Modify: `front/features/archive/ui/my-page/my-reading-journey.test.tsx`
- Create: `front/src/pages/my-records.tsx`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Produces: `myRecordsLoader(args?: LoaderFunctionArgs): Promise<MyJourneyPage>`
- Produces: `MyRecordsRoute(): JSX.Element`
- Produces: `MyRecordsPage(props: MyReadingJourneyProps): JSX.Element`
- Consumes: `appendUniqueJourneyItems()`, `emptyMyJourneyPage()`, `groupJourneyByYear()`, `BookRecordRow`, and `fetchMyJourney(context, { limit: 12, cursor? })`

- [ ] **Step 1: Write loader tests for first-page scope**

Create `my-records-data.test.ts`:

```ts
it("loads twelve personal journey rows in the current club", async () => {
  auth.loadArchiveMemberAuth.mockResolvedValue(activeAccess);
  api.fetchMyJourney.mockResolvedValue(journey);

  await expect(myRecordsLoader({
    params: { clubSlug: "reading-sai" },
    request: new Request(
      "https://readmates.test/clubs/reading-sai/app/me/records",
    ),
  } as LoaderFunctionArgs)).resolves.toEqual(journey);

  expect(api.fetchMyJourney).toHaveBeenCalledWith(
    { clubSlug: "reading-sai" },
    { limit: 12 },
  );
});

it("returns an empty page when member-app access is unavailable", async () => {
  auth.loadArchiveMemberAuth.mockResolvedValue({
    allowed: false,
    auth: inactiveAuth,
  });
  await expect(myRecordsLoader()).resolves.toEqual(emptyMyJourneyPage());
  expect(api.fetchMyJourney).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Move continuation regressions into route tests**

Create `my-records-route.test.tsx` using the existing deferred-page pattern from `front/tests/unit/my-page.test.tsx`. Assert:

```tsx
await user.click(await screen.findByRole("button", {
  name: "기록 더 보기",
}));
expect(continuationRequests).toBe(1);

await act(async () => {
  nextPage.resolve({
    ...journey,
    items: [journey.items[0], secondItem],
    nextCursor: null,
  });
});

expect(screen.getAllByRole("article")).toHaveLength(2);
expect(screen.queryByRole("button", {
  name: "기록 더 보기",
})).toBeNull();
```

Add a rejected continuation case that preserves the first page and changes the button to `다시 시도`; clicking it must request the same failed cursor.

- [ ] **Step 3: Update journey-list tests for the approved row**

In `my-reading-journey.test.tsx`, remove the latest-orientation and chip assertions. Assert:

```tsx
expect(screen.getByRole("heading", {
  level: 2,
  name: "내 책별 기록",
})).toBeVisible();
expect(screen.getByRole("region", {
  name: "2026년 기록",
})).toBeVisible();
expect(screen.getAllByRole("article")).toHaveLength(2);
expect(screen.queryByText(/마지막 기록은/)).toBeNull();
expect(screen.queryByText("질문 2")).toBeNull();
expect(screen.queryByText("서평 1")).toBeNull();
```

Keep the malformed/impossible-date grouping and loading/retry accessibility tests.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-records-data.test.ts \
  features/archive/route/my-records-route.test.tsx \
  features/archive/ui/my-page/my-reading-journey.test.tsx \
  features/archive/ui/my-records-page.test.tsx
```

Expected: FAIL because the new route files do not exist and the journey still renders old row internals.

- [ ] **Step 5: Implement loader and pagination controller**

`my-records-data.ts` loads access and `limit=12`. `MyRecordsRoute` owns:

```ts
type MyRecordsPaginationState = {
  source: MyJourneyPage;
  page: MyJourneyPage;
  pendingCursor: string | null;
  failedCursor: string | null;
};
```

On continuation success:

```ts
setState((current) => ({
  source: loaderPage,
  page: {
    ...current.page,
    items: appendUniqueJourneyItems(
      current.page.items,
      nextPage.items,
    ),
    nextCursor: nextPage.nextCursor,
  },
  pendingCursor: null,
  failedCursor: null,
}));
```

Use a ref to reject a second request for the same pending cursor. Preserve the current page on error.

- [ ] **Step 6: Implement the full-records page**

`MyRecordsPage` renders:

```tsx
<main className="rm-my-records-page">
  <header className="rm-my-records-page__header">
    <p className="rm-my-shelf-kicker">내 공간</p>
    <h1>내 책별 기록</h1>
    <p>함께 읽은 책을 최근 기록부터 다시 살펴보세요.</p>
  </header>
  <MyReadingJourney {...journeyProps} />
</main>
```

`MyReadingJourney` groups by year and maps every item to `<BookRecordRow item={item} />`. It owns only full-list presentation and load/retry controls.

- [ ] **Step 7: Register the route and page shell**

Add `path: "me/records"` in `front/src/app/routes/member.tsx`, with archive error/fallback elements and lazy imports for `src/pages/my-records.tsx` and `my-records-data.ts`.

The page shell should render `<MyRecordsRoute />`.

- [ ] **Step 8: Add full-page and mobile CSS**

Use the same maximum editorial width as the shelf. Keep year labels and load state, but delete old `.rm-my-shelf-row` and chip rules after all journey rows use `.rm-book-record-row`.

At `max-width: 768px`, change only widths/gaps; do not move actions below the book column.

- [ ] **Step 9: Run focused tests and verify GREEN**

Run the Step 4 command.

Expected: PASS for first/continuation/last/dedup/retry/year grouping and the shared row contract.

- [ ] **Step 10: Run the frontend boundary test**

```bash
corepack pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS; UI imports no API/query/route module.

- [ ] **Step 11: Commit Task 3**

```bash
git add \
  front/features/archive/route/my-records-data.ts \
  front/features/archive/route/my-records-data.test.ts \
  front/features/archive/route/my-records-route.tsx \
  front/features/archive/route/my-records-route.test.tsx \
  front/features/archive/ui/my-records-page.tsx \
  front/features/archive/ui/my-records-page.test.tsx \
  front/features/archive/ui/my-page/my-reading-journey.tsx \
  front/features/archive/ui/my-page/my-reading-journey.test.tsx \
  front/src/pages/my-records.tsx \
  front/src/app/routes/member.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): add full personal reading records"
```

---

### Task 4: Move Profile and Membership Controls to `/app/me/settings`

**Files:**
- Create: `front/features/archive/route/account-settings-data.ts`
- Create: `front/features/archive/route/account-settings-data.test.ts`
- Create: `front/features/archive/route/account-settings-route.tsx`
- Create: `front/features/archive/route/account-settings-route.test.tsx`
- Create: `front/features/archive/ui/account-settings-page.tsx`
- Create: `front/features/archive/ui/account-settings-page.test.tsx`
- Create: `front/src/pages/account-settings.tsx`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/features/archive/route/my-page-data.ts`
- Delete: `front/features/archive/ui/my-page/my-page-settings.tsx`
- Delete: `front/features/archive/ui/my-page/my-page-settings.test.tsx`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Produces: `accountSettingsLoader(args?: LoaderFunctionArgs): Promise<MyPageResponse>`
- Produces: `AccountSettingsRoute({ canEditProfile, onProfileUpdated }: AccountSettingsRouteProps): JSX.Element`
- Produces: `AccountSettingsPage` props for profile update and membership leave only
- Consumes: existing `PreferencesSection`, `MembershipIdentity`, `DangerZone`, `updateMyProfile()`, `leaveMembership()`, and `profileSaveErrorMessage()`

- [ ] **Step 1: Extract and test a reusable inactive profile helper**

Move `inactiveMyPageData(auth)` from `my-page-data.ts` into `archive-model.ts` as:

```ts
export function inactiveMyPageProfile(
  auth: AuthMeResponse,
): MyPageProfile {
  return {
    displayName: auth.displayName ?? "",
    accountName: auth.accountName ?? "",
    email: auth.email ?? "",
    role: auth.role ?? "MEMBER",
    membershipStatus: auth.membershipStatus ?? "INACTIVE",
    clubName: null,
    joinedAt: "",
    sessionCount: 0,
    totalSessionCount: 0,
    completedReadingCount: 0,
    currentSessionId: null,
    recentAttendances: [],
  };
}
```

Add a model test with an inactive auth fixture. Update `myPageLoader` to consume this helper.

- [ ] **Step 2: Write account loader and UI tests**

`account-settings-data.test.ts`:

```ts
it("loads only the account profile for an allowed member", async () => {
  auth.loadArchiveMemberAuth.mockResolvedValue(activeAccess);
  api.fetchMyPage.mockResolvedValue(profile);

  await expect(accountSettingsLoader()).resolves.toEqual(profile);
  expect(api.fetchMyPage).toHaveBeenCalledOnce();
  expect(api.fetchMyJourney).not.toHaveBeenCalled();
  expect(api.fetchNotificationPreferences).not.toHaveBeenCalled();
});
```

`account-settings-page.test.tsx`:

```tsx
it("renders profile, membership, and leave controls without notifications or logout", () => {
  renderAccountSettings();

  expect(screen.getByRole("heading", {
    level: 1,
    name: "계정 관리",
  })).toBeVisible();
  expect(screen.getByText(profile.email)).toBeVisible();
  expect(screen.getByRole("heading", {
    name: "멤버십",
  })).toBeVisible();
  expect(screen.getByRole("button", {
    name: "탈퇴",
  })).toBeVisible();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByRole("button", {
    name: "로그아웃",
  })).toBeNull();
});
```

- [ ] **Step 3: Write route mutation tests**

Copy the current profile error decoding and optimistic profile override cases from `my-page-route` tests into `account-settings-route.test.tsx`. Assert:

```tsx
await user.click(screen.getByRole("button", { name: "이름 변경" }));
await user.clear(screen.getByRole("textbox", { name: "이름" }));
await user.type(screen.getByRole("textbox", { name: "이름" }), "새 이름");
await user.click(screen.getByRole("button", { name: "저장" }));

expect(api.updateMyProfile).toHaveBeenCalledWith("새 이름");
expect(onProfileUpdated).toHaveBeenCalledOnce();
expect(screen.getByText("새 이름")).toBeVisible();
```

Retain duplicate/reserved/forbidden-name error cases and leave-membership failure behavior.

- [ ] **Step 4: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/archive-model.test.ts \
  features/archive/route/account-settings-data.test.ts \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/ui/account-settings-page.test.tsx
```

Expected: FAIL because the new account route and helper do not exist.

- [ ] **Step 5: Implement account data, route, and page**

`accountSettingsLoader` returns `fetchMyPage(context)` for allowed access and `inactiveMyPageProfile(access.auth)` otherwise.

`AccountSettingsRoute` owns profile override, API error decoding, auth refresh callback, and membership leave. `AccountSettingsPage` composes:

```tsx
<main className="rm-account-settings-page">
  <header>
    <p className="rm-my-shelf-kicker">내 공간</p>
    <h1>계정 관리</h1>
    <p>프로필과 현재 클럽 멤버십 정보를 관리합니다.</p>
  </header>
  <PreferencesSection
    data={profile}
    canEditProfile={canEditProfile}
    onUpdateProfile={onUpdateProfile}
  />
  <MembershipIdentity data={profile} />
  <div className="rm-account-settings-page__boundary">
    <DangerZone onLeaveMembership={onLeaveMembership} />
  </div>
</main>
```

- [ ] **Step 6: Add the page shell and route**

`src/pages/account-settings.tsx` uses `useAuth()` and `useAuthActions()` to derive `canEditOwnProfile()` and refresh auth after a profile update. Register `path: "me/settings"` in `member.tsx`.

- [ ] **Step 7: Delete the disclosure component and retarget E2E**

Delete `my-page-settings.tsx` and its test. In `member-profile-permissions.spec.ts`, replace disclosure clicks with direct navigation:

```ts
await page.goto("/app/me/settings");
await expect(page.getByRole("heading", {
  level: 1,
  name: "계정 관리",
})).toBeVisible();
```

For viewers, assert profile/membership/leave controls are visible and writable notification switches are absent because notifications are no longer part of this route.

- [ ] **Step 8: Add account-page CSS**

Use the shelf’s editorial width and responsive spacing. Keep email wrapping and the membership `dl` two-column layout; reduce it to safe label/value columns on mobile. Keep the membership boundary visually separate.

- [ ] **Step 9: Run focused tests and the profile-permission E2E**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/archive-model.test.ts \
  features/archive/route/account-settings-data.test.ts \
  features/archive/route/account-settings-route.test.tsx \
  features/archive/ui/account-settings-page.test.tsx

corepack pnpm --dir front exec playwright test \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: PASS; no test opens `계정·알림 설정`.

- [ ] **Step 10: Commit Task 4**

```bash
git add -A \
  front/features/archive/model/archive-model.ts \
  front/features/archive/model/archive-model.test.ts \
  front/features/archive/route/account-settings-data.ts \
  front/features/archive/route/account-settings-data.test.ts \
  front/features/archive/route/account-settings-route.tsx \
  front/features/archive/route/account-settings-route.test.tsx \
  front/features/archive/ui/account-settings-page.tsx \
  front/features/archive/ui/account-settings-page.test.tsx \
  front/features/archive/route/my-page-data.ts \
  front/features/archive/ui/my-page/my-page-settings.tsx \
  front/features/archive/ui/my-page/my-page-settings.test.tsx \
  front/src/pages/account-settings.tsx \
  front/src/app/routes/member.tsx \
  front/tests/e2e/member-profile-permissions.spec.ts \
  front/src/styles/globals.css
git commit -m "feat(front): split member account settings route"
```

---

### Task 5: Add the Global Account Menu to Desktop and Mobile Chrome

**Files:**
- Create: `front/features/auth/model/account-menu-model.ts`
- Create: `front/features/auth/model/account-menu-model.test.ts`
- Create: `front/features/auth/ui/account-menu.tsx`
- Create: `front/features/auth/ui/account-menu.test.tsx`
- Create: `front/features/auth/route/account-menu-controller.tsx`
- Create: `front/features/auth/route/account-menu-controller.test.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Modify: `front/tests/unit/spa-layout.test.tsx`
- Modify: `front/tests/e2e/logout-flow.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Produces: `accountMembershipLabel(status: MembershipStatus | null): string`
- Produces: `AccountMenu({ memberName, membershipLabel, mySpaceHref, settingsHref, LinkComponent, LogoutControl }: AccountMenuProps): JSX.Element`
- Produces: `AccountMenuController({ auth, appBasePath, LinkComponent, onLoggedOut }: AccountMenuControllerProps): JSX.Element`
- Extends: `TopNavProps.accountControl?: ReactNode`
- Extends: `MobileHeaderProps.accountControl?: ReactNode`
- Consumes: existing `LogoutButton`, `AvatarChip`, `prefixedAppPath`-equivalent scoped paths, and `AuthActions.markLoggedOut`

- [ ] **Step 1: Write membership-label tests**

```ts
it.each([
  ["ACTIVE", "정식 멤버"],
  ["VIEWER", "둘러보기 멤버"],
  ["SUSPENDED", "이용 정지"],
  ["INVITED", "초대 대기"],
  ["LEFT", "탈퇴"],
  ["INACTIVE", "비활성"],
  [null, "멤버"],
] as const)("maps %s to %s", (status, label) => {
  expect(accountMembershipLabel(status)).toBe(label);
});
```

- [ ] **Step 2: Write account-menu behavior tests**

Create `account-menu.test.tsx` with click, keyboard, outside-click, and focus-return coverage:

```tsx
const trigger = screen.getByRole("button", {
  name: "멤버1 계정 메뉴",
});
await user.click(trigger);
expect(trigger).toHaveAttribute("aria-expanded", "true");
expect(screen.getByRole("menu")).toBeVisible();
expect(screen.getByRole("link", {
  name: "내 공간",
})).toHaveAttribute("href", "/app/me");
expect(screen.getByRole("link", {
  name: "계정 관리",
})).toHaveAttribute("href", "/app/me/settings");

await user.keyboard("{Escape}");
expect(screen.queryByRole("menu")).toBeNull();
expect(trigger).toHaveFocus();
```

Add an outside pointer case and a long Korean/English member-name wrapping case.

- [ ] **Step 3: Write controller/logout tests**

Mock `logout()` through the existing `LogoutButton` boundary. Assert a non-OK response leaves the menu visible with:

```tsx
expect(await screen.findByRole("alert")).toHaveTextContent(
  "로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.",
);
expect(onLoggedOut).not.toHaveBeenCalled();
```

Assert OK and 401 responses call `onLoggedOut` and redirect using the existing logout component behavior.

- [ ] **Step 4: Write chrome-slot tests**

In `responsive-navigation.test.tsx`, pass:

```tsx
const accountControl = <button type="button">계정 메뉴</button>;
```

Assert both `TopNav` and `MobileHeader` render it inside their right-side chrome. For mobile host/member workspace-switch states, assert both the workspace link and account control exist and each has at least a 44px target class.

- [ ] **Step 5: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/auth/model/account-menu-model.test.ts \
  features/auth/ui/account-menu.test.tsx \
  features/auth/route/account-menu-controller.test.tsx \
  tests/unit/responsive-navigation.test.tsx \
  tests/unit/spa-layout.test.tsx
```

Expected: FAIL because the menu/controller and chrome slots do not exist.

- [ ] **Step 6: Implement model, menu, and controller**

`AccountMenu` owns open state, trigger/menu refs, document pointer listener, `Escape`, and focus return. It renders `AvatarChip` inside a native button:

```tsx
<button
  ref={triggerRef}
  type="button"
  className="rm-account-menu__trigger"
  aria-label={`${memberName} 계정 메뉴`}
  aria-expanded={open}
  aria-haspopup="menu"
  onClick={() => setOpen((current) => !current)}
>
  <AvatarChip name={memberName} label="" size={28} />
</button>
```

The menu uses `role="menu"` and its links/buttons remain natively keyboard reachable. `AccountMenuController` scopes `/app/me` and `/app/me/settings` from `appBasePath` and passes:

```tsx
<LogoutButton
  className="rm-account-menu__logout"
  onLoggedOut={onLoggedOut}
>
  로그아웃
</LogoutButton>
```

- [ ] **Step 7: Add shared chrome slots and compose them in the app layout**

`TopNav` renders `accountControl` after the workspace switch, falling back to the legacy static `AvatarChip` only in isolated shared-component callers.

`MobileHeader` renders `rightAction` and `accountControl` in `.m-hdr-side--right`; guest headers never receive the slot.

In `AppRouteLayout`, call `useAuthActions()` and create:

```tsx
const accountControl = auth?.authenticated ? (
  <AccountMenuController
    auth={auth}
    appBasePath={basePath}
    LinkComponent={Link}
    onLoggedOut={markLoggedOut}
  />
) : null;
```

Instantiate one `AccountMenuController` in the desktop chrome wrapper and one in
the mobile chrome wrapper. Each controller owns independent open state and uses
`useId()` for its trigger/menu relationship, so no duplicate IDs are emitted.
The inactive responsive wrapper must use `display: none`, which keeps its trigger
and menu out of the focus and accessibility trees.

- [ ] **Step 8: Add desktop and mobile menu CSS**

Use an anchored desktop popover and a compact mobile menu aligned to the top-right trigger. Update `.m-hdr-side--right` to hold the workspace switch and account trigger with a small gap without reducing either target below 44px. Add safe viewport edge handling and reduced-motion rules.

Do not overwrite unrelated current `mobile.css` work; this task runs in the isolated implementation worktree.

- [ ] **Step 9: Retarget E2E logout and responsive chrome**

In `logout-flow.spec.ts`, start from `/app`, open `{displayName} 계정 메뉴`, and click `로그아웃`. Keep the auth-me anonymous assertions and denied re-entry.

In `responsive-navigation-chrome.spec.ts`, at 390px and desktop:

```ts
const accountMenu = page.getByRole("button", {
  name: /계정 메뉴$/,
});
await expectPracticalTapTarget(accountMenu);
await accountMenu.click();
await expect(page.getByRole("menu")).toBeVisible();
await expect(page.getByRole("link", {
  name: "계정 관리",
})).toHaveAttribute(
  "href",
  `${baselineClubAppPath}/me/settings`,
);
```

- [ ] **Step 10: Run focused tests and account-menu E2E**

```bash
corepack pnpm --dir front exec vitest run \
  features/auth/model/account-menu-model.test.ts \
  features/auth/ui/account-menu.test.tsx \
  features/auth/route/account-menu-controller.test.tsx \
  tests/unit/responsive-navigation.test.tsx \
  tests/unit/spa-layout.test.tsx

corepack pnpm --dir front exec playwright test \
  tests/e2e/logout-flow.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS with logout reachable from app chrome and menu targets valid at both breakpoints.

- [ ] **Step 11: Commit Task 5**

```bash
git add \
  front/features/auth/model/account-menu-model.ts \
  front/features/auth/model/account-menu-model.test.ts \
  front/features/auth/ui/account-menu.tsx \
  front/features/auth/ui/account-menu.test.tsx \
  front/features/auth/route/account-menu-controller.tsx \
  front/features/auth/route/account-menu-controller.test.tsx \
  front/shared/ui/top-nav.tsx \
  front/shared/ui/mobile-header.tsx \
  front/src/app/layouts/app-route-layout.tsx \
  front/tests/unit/responsive-navigation.test.tsx \
  front/tests/unit/spa-layout.test.tsx \
  front/tests/e2e/logout-flow.spec.ts \
  front/tests/e2e/responsive-navigation-chrome.spec.ts \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css
git commit -m "feat(front): add global member account menu"
```

---

### Task 6: Move Notification Preferences Beside the Inbox

**Files:**
- Create: `front/features/notifications/api/notification-preferences-contracts.ts`
- Create: `front/features/notifications/api/notification-preferences-api.ts`
- Create: `front/features/notifications/model/notification-preferences-model.ts`
- Create: `front/features/notifications/model/notification-preferences-model.test.ts`
- Create: `front/features/notifications/route/member-notification-settings-data.ts`
- Create: `front/features/notifications/route/member-notification-settings-data.test.ts`
- Create: `front/features/notifications/route/member-notification-settings-route.tsx`
- Create: `front/features/notifications/route/member-notification-settings-route.test.tsx`
- Create: `front/features/notifications/ui/member-notification-tabs.tsx`
- Create: `front/features/notifications/ui/member-notification-tabs.test.tsx`
- Create: `front/features/notifications/ui/member-notification-settings-page.tsx`
- Create: `front/features/notifications/ui/member-notification-settings-page.test.tsx`
- Create: `front/src/pages/member-notification-settings.tsx`
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
- Modify: `front/features/notifications/ui/member-notifications-page.test.tsx`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/features/archive/api/archive-api.ts`
- Modify: `front/features/archive/api/archive-contracts.ts`
- Modify: `front/features/archive/model/archive-model.ts`
- Delete: `front/features/archive/ui/my-page/notification-settings.tsx`
- Delete: `front/features/archive/ui/my-page/notification-settings.test.tsx`
- Modify: `front/tests/unit/member-notifications.test.tsx`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Produces: `NotificationPreferences`, `NotificationPreferencesRequest`, and `NotificationPreferencesResponse`
- Produces: `notificationPreferenceAvailability(status): "ready" | "unavailable"`
- Produces: `memberNotificationSettingsLoader(args): Promise<NotificationPreferencesLoadState>`
- Produces: `MemberNotificationTabs({ active, basePath }: { active: "inbox" | "settings"; basePath: string }): JSX.Element`
- Consumes: existing `/api/me/notifications/preferences` GET/PUT contract, `loadMemberAppAuth()`, and current switch/save behavior

- [ ] **Step 1: Write notification-domain model tests**

Move the current event-order/label/default expectations into `notification-preferences-model.test.ts`:

```ts
expect(notificationEventOrder).toEqual([
  "NEXT_BOOK_PUBLISHED",
  "SESSION_REMINDER_DUE",
  "FEEDBACK_DOCUMENT_PUBLISHED",
  "REVIEW_PUBLISHED",
]);
expect(notificationPreferenceAvailability("VIEWER")).toBe("unavailable");
expect(notificationPreferenceAvailability("ACTIVE")).toBe("ready");
expect(notificationPreferenceAvailability("SUSPENDED")).toBe("ready");
```

- [ ] **Step 2: Write URL-tab tests**

`member-notification-tabs.test.tsx`:

```tsx
it("keeps both tabs in the scoped notification route", () => {
  render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
      <MemberNotificationTabs
        active="inbox"
        basePath="/clubs/reading-sai/app"
      />
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/notifications",
  );
  expect(screen.getByRole("link", {
    name: "수신 설정",
  })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/notifications/settings",
  );
  expect(screen.getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 3: Write preference loader and save-route tests**

Loader cases:

```ts
it("loads writable preferences for an active scoped member", async () => {
  auth.loadMemberAppAuth.mockResolvedValue(activeAccess);
  api.fetchNotificationPreferences.mockResolvedValue(preferences);

  await expect(memberNotificationSettingsLoader(scopedArgs)).resolves.toEqual({
    status: "ready",
    preferences,
  });
  expect(api.fetchNotificationPreferences).toHaveBeenCalledWith({
    clubSlug: "reading-sai",
  });
});

it("returns unavailable without requesting preferences for a viewer", async () => {
  auth.loadMemberAppAuth.mockResolvedValue(viewerAccess);
  await expect(memberNotificationSettingsLoader(scopedArgs)).resolves.toEqual({
    status: "unavailable",
  });
  expect(api.fetchNotificationPreferences).not.toHaveBeenCalled();
});
```

Route test: toggle `이메일 알림`, click `알림 설정 저장`, assert one PUT, disabled pending controls, returned server state, failure alert, and preserved draft.

- [ ] **Step 4: Write settings-page and inbox-tab tests**

Assert the inbox page renders `받은 알림` as current and the settings page renders `수신 설정` as current. Keep the current Korean compact inbox list tests.

For unavailable viewers:

```tsx
expect(screen.getByText(
  "알림 수신은 현재 멤버십에서 제공되지 않습니다.",
)).toBeVisible();
expect(screen.queryByRole("switch")).toBeNull();
```

- [ ] **Step 5: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/notifications/model/notification-preferences-model.test.ts \
  features/notifications/route/member-notification-settings-data.test.ts \
  features/notifications/route/member-notification-settings-route.test.tsx \
  features/notifications/ui/member-notification-tabs.test.tsx \
  features/notifications/ui/member-notification-settings-page.test.tsx \
  features/notifications/ui/member-notifications-page.test.tsx \
  tests/unit/member-notifications.test.tsx
```

Expected: FAIL because notification preferences still belong to archive/my-page.

- [ ] **Step 6: Move preference contracts, API, and model ownership**

Create notification-owned contracts and API functions:

```ts
export function fetchNotificationPreferences(
  context?: ReadmatesApiContext,
) {
  return readmatesFetch<NotificationPreferencesResponse>(
    "/api/me/notifications/preferences",
    undefined,
    context,
  );
}

export function saveNotificationPreferences(
  request: NotificationPreferencesRequest,
) {
  return readmatesFetch<NotificationPreferencesResponse>(
    "/api/me/notifications/preferences",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
}
```

Remove only these preference types/functions/constants from archive contracts, API, and model after every import points to `features/notifications`.

- [ ] **Step 7: Implement loader, tabs, route, and page**

`memberNotificationSettingsLoader` uses `loadMemberAppAuth`, club context, and membership availability. A GET failure should return `{ status: "error" }`, not throw into the inbox route.

`MemberNotificationSettingsRoute` owns the draft/save controller and revalidator retry. `MemberNotificationSettingsPage` composes the shared tabs and the existing switch-row behavior moved from archive.

`MemberNotificationsPage` receives or computes its scoped base path and renders `<MemberNotificationTabs active="inbox" ... />` beneath the common heading.

- [ ] **Step 8: Register the settings route**

Add `path: "notifications/settings"` in `member.tsx` with its own loading/error presentation and lazy imports. `TopNav` and `MobileTabBar` already use `pathname.startsWith("/app/notifications")`; add unit assertions proving both inbox and settings keep `알림` current.

- [ ] **Step 9: Delete archive-owned notification UI**

Delete the old my-page notification component and test. Confirm:

```bash
rg -n "features/archive/.+Notification|my-page/notification-settings|fetchNotificationPreferences|saveNotificationPreferences" front
```

Expected: preference imports exist only under `features/notifications`; unrelated archive text matches are absent.

- [ ] **Step 10: Retarget viewer/profile E2E**

In `member-profile-permissions.spec.ts`, navigate the viewer to `/app/notifications/settings` and assert the unavailable copy with no switch. Keep `/app/me/settings` assertions focused on account/membership.

- [ ] **Step 11: Run focused tests and frontend boundary test**

Run the Step 5 command, then:

```bash
corepack pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts \
  tests/unit/responsive-navigation.test.tsx
```

Expected: PASS; notification UI imports no archive route/API module.

- [ ] **Step 12: Commit Task 6**

```bash
git add -A \
  front/features/notifications \
  front/src/pages/member-notification-settings.tsx \
  front/src/app/routes/member.tsx \
  front/features/archive/api/archive-api.ts \
  front/features/archive/api/archive-contracts.ts \
  front/features/archive/model/archive-model.ts \
  front/features/archive/ui/my-page/notification-settings.tsx \
  front/features/archive/ui/my-page/notification-settings.test.tsx \
  front/tests/unit/member-notifications.test.tsx \
  front/tests/e2e/member-profile-permissions.spec.ts \
  front/src/styles/globals.css
git commit -m "feat(front): move notification preferences beside inbox"
```

---

### Task 7: Close the Integrated Member Flow and Run Canonical Gates

**Files:**
- Create: `front/tests/e2e/member-space-information-architecture.spec.ts`
- Modify: `front/tests/e2e/my-reading-shelf-fixtures.ts`
- Modify: `front/tests/e2e/logout-flow.spec.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `front/tests/unit/member-notifications.test.tsx`
- Modify: `CHANGELOG.md`
- Modify if implementation inventory changed: `docs/development/architecture.md`
- Modify if implementation inventory changed: `docs/development/project-map.md`

**Interfaces:**
- Consumes: every route and component produced by Tasks 1–6
- Produces: final browser evidence for recent-three, full personal history, account menu/settings, notification tabs, permission states, and responsive three-column rows

- [ ] **Step 1: Add a deterministic journey fixture with more than three rows**

Extend `my-reading-shelf-fixtures.ts` so one mode returns exactly fifteen ordered
journey items. A request with `limit=3` returns the newest three and a non-null
cursor. The first `limit=12` request returns twelve and a non-null cursor, and
`limit=12&cursor=...` returns the final three with `nextCursor: null`. Keep all
fixture values public-safe and deterministic.

The fixture must preserve the response summary across page sizes:

```ts
const summary = {
  attendedSessionCount: 15,
  completedReadingCount: 7,
  questionCount: 12,
  reviewCount: 1,
  readableFeedbackDocumentCount: 15,
};
```

- [ ] **Step 2: Write the integrated recent/full-records E2E**

Create `member-space-information-architecture.spec.ts`:

```ts
test("member shelf previews three books and opens the full personal history", async ({
  page,
}) => {
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, "member1@example.com");
  await page.goto("/app/me");

  await expect(page.getByRole("heading", {
    level: 1,
    name: "나의 서재",
  })).toBeVisible();
  const previewRows = page.getByRole("article");
  await expect(previewRows).toHaveCount(3);
  await expect(previewRows.filter({
    hasText: /질문 \d+|서평 \d+/,
  })).toHaveCount(0);
  await expect(page.getByRole("button", {
    name: "계정·알림 설정",
  })).toHaveCount(0);

  await page.getByRole("link", {
    name: "내 기록 전체 보기",
  }).click();
  await expect(page).toHaveURL(/\/app\/me\/records$/);
  const fullRows = page.getByRole("article");
  await expect(fullRows).toHaveCount(12);
  await page.getByRole("button", {
    name: "기록 더 보기",
  }).click();
  await expect(fullRows).toHaveCount(15);
  await expect(page.getByRole("button", {
    name: "기록 더 보기",
  })).toHaveCount(0);
});
```

Scope the article locators to the main record list if other articles are introduced.

- [ ] **Step 3: Add desktop/mobile geometry assertions**

For 1280px and 390px, evaluate each `.rm-book-record-row`:

```ts
const geometry = await row.evaluate((element) => {
  const cover = element.querySelector<HTMLElement>(
    ".rm-book-record-row__cover",
  )!.getBoundingClientRect();
  const book = element.querySelector<HTMLElement>(
    ".rm-book-record-row__book",
  )!.getBoundingClientRect();
  const actions = element.querySelector<HTMLElement>(
    ".rm-book-record-row__actions",
  )!.getBoundingClientRect();
  return {
    rowScrollWidth: element.scrollWidth,
    rowClientWidth: element.clientWidth,
    coverRight: cover.right,
    bookLeft: book.left,
    bookRight: book.right,
    actionsLeft: actions.left,
  };
});

expect(geometry.rowScrollWidth).toBeLessThanOrEqual(
  geometry.rowClientWidth,
);
expect(geometry.coverRight).toBeLessThanOrEqual(geometry.bookLeft);
expect(geometry.bookRight).toBeLessThanOrEqual(geometry.actionsLeft);
```

Also verify both action links meet the practical 44px tap-target helper.

- [ ] **Step 4: Add account and notification route continuity E2E**

From a club-scoped member route:

1. Open the account menu.
2. Navigate to club-scoped `/me/settings`.
3. Navigate to `/notifications`.
4. Open `수신 설정`.
5. Use browser back to return to `받은 알림`.
6. Assert `내 공간` and `알림` navigation current states on their nested routes.

Keep logout success in `logout-flow.spec.ts`; do not duplicate the destructive action in this test.

- [ ] **Step 5: Run the new focused E2E and fix only integration defects**

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/logout-flow.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS with no horizontal overflow at 390px or desktop.

- [ ] **Step 6: Run the frontend unit/build gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all commands exit 0. If the local Corepack launcher is unavailable, use the repository-approved fallback from `AGENTS.md` and record the exact command; do not silently use a different pnpm version.

- [ ] **Step 7: Run the canonical full member E2E gate once**

```bash
corepack pnpm --dir front test:e2e
```

Expected: all E2E tests PASS at final HEAD.

- [ ] **Step 8: Perform manual browser checks**

Using the existing local fixture service without stopping or reconfiguring another process, inspect:

- desktop `/clubs/reading-sai/app/me`: exact summary, three rows, no settings trigger, no per-book question/review copy;
- mobile 390×844 `/clubs/reading-sai/app/me`: the same three-column row order, no overlap, fixed bottom tabs unobstructed;
- `/clubs/reading-sai/app/me/records`: year groups, continuation, retry state;
- `/clubs/reading-sai/app/me/settings`: profile/email/membership/leave and no logout/preferences;
- account menu on member and host chrome: click, `Escape`, focus return, logout pending/failure presentation;
- `/clubs/reading-sai/app/notifications` and `/settings`: tab current state, direct load, back navigation, save and failure isolation.

Capture screenshots only under ignored `output/playwright/` or Playwright test output. Do not commit screenshots.

- [ ] **Step 9: Update active docs and changelog only where current implementation requires it**

Add one Korean `Unreleased` bullet to `CHANGELOG.md` describing the member-space route split, global logout menu, and notification settings move. Inspect the current changelog first and preserve unrelated existing or concurrently added entries.

Update `docs/development/architecture.md` or `project-map.md` only if their current member-route inventory becomes factually stale. Do not rewrite the historical approved spec.

- [ ] **Step 10: Run docs and public-safety checks**

```bash
git diff --check -- \
  CHANGELOG.md \
  docs/development/architecture.md \
  docs/development/project-map.md

rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  CHANGELOG.md \
  docs/development/architecture.md \
  docs/development/project-map.md
```

Expected: `git diff --check` exits 0 and the safety scan prints no new match in changed lines.

- [ ] **Step 11: Run final repository hygiene checks**

```bash
git diff --check
git status --short --branch --untracked-files=all
git diff --stat
```

Expected: no whitespace errors, no generated screenshot/build/cache artifacts, and only intended member-space/docs files differ from the implementation branch base.

- [ ] **Step 12: Commit Task 7**

Stage only the files actually changed by this task:

```bash
git add \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/my-reading-shelf-fixtures.ts \
  front/tests/e2e/logout-flow.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts \
  front/tests/e2e/responsive-navigation-chrome.spec.ts \
  front/tests/unit/my-page.test.tsx \
  front/tests/unit/member-notifications.test.tsx \
  CHANGELOG.md
git add docs/development/architecture.md docs/development/project-map.md
git commit -m "test(front): close member space route redesign"
```

Before committing, inspect `git diff --cached --name-status` and remove any unrelated host-editor path from the index.

- [ ] **Step 13: Final review handoff**

Report:

- task commits and final HEAD;
- exact focused/unit/build/E2E commands and results;
- desktop/mobile manual evidence;
- selected acceptance rows (`UI or runtime state`, `Cursor collection`, `Actor or authorization`);
- why BFF/OAuth, publication visibility, persistence, async/provider, and session lifecycle were excluded;
- skipped checks and residual risk;
- local-only status, with no push/PR/deploy.
