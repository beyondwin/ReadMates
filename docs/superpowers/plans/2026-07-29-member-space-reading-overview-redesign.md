# ReadMates Member Space Reading Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/clubs/:clubSlug/app/me` into a fuller personal reading overview by combining profile and cumulative achievements in one editorial surface and adding a three-item recent-reading preview with clear account and record navigation.

**Architecture:** Keep the current profile and journey APIs, the shared profile update controller, and the route-first frontend boundary. Extend the pure archive model with a bounded recent-reading preview, load three journey items instead of one, map scoped hrefs in the route, and render prop-driven overview and recent-reading components. The server, BFF, database, account settings behavior, and full `/app/me/records` cursor flow remain unchanged.

**Tech Stack:** React 19.2.7, React Router 7, TypeScript 6.0.3, Vitest 4.1.10, Testing Library, Playwright 1.61.1, Vite 8.1.5, repository-pinned `pnpm@11.13.1` through Corepack.

## Global Constraints

- Design authority: `docs/superpowers/specs/2026-07-29-member-space-reading-overview-redesign.md` at approved HEAD `3cd0ce94`.
- Product surface: member app `/clubs/:clubSlug/app/me`; owning feature: `front/features/archive`.
- Preserve `src/app -> src/pages -> features -> shared`; UI modules render props and callbacks only, and model modules remain free of React, router, fetch, query, and API-client imports.
- Reuse `/api/app/me`, `/api/archive/me/journey?limit=3`, and `PATCH /api/me/profile`; add no server, BFF, database, migration, package, or external-image dependency.
- Preserve journey server order and show at most three preview items; do not infer attendance, recency, annual totals, or hidden records.
- Keep `/app/me/records` pagination, `/app/me/settings`, account-menu logout, profile authorization, auth refresh, and route error boundaries intact.
- Use a maximum 1080px desktop content width, the existing 768px member breakpoint, minimum 44px actions, 320px overflow safety, 200% zoom safety, visible focus, and reduced-motion behavior.
- Keep the display name as the only page `h1`; achievements and recent readings use `h2`, and recent book titles use `h3`.
- `프로필 수정` stays a quiet button. `계정 관리 →` is a semantic anchor with compact outlined-button styling and no persistent underline.
- Render actual `bookImageUrl` only when supplied. Use an in-product paper fallback for missing or failed covers; never fetch a replacement image.
- Do not persist real member data, private domains, secrets, deployment state, local absolute paths, or token-shaped examples.
- Use `corepack pnpm` for every frontend command; do not substitute an unpinned global pnpm.

## File Structure

| Path | Responsibility |
| --- | --- |
| `front/features/archive/model/my-reading-shelf-model.ts` | Pure profile, achievement, date, and bounded recent-reading presentation model |
| `front/features/archive/model/my-reading-shelf-model.test.ts` | Pure-model coverage for recent rows, fallbacks, activity states, order, and profile metadata |
| `front/features/archive/ui/my-page/recent-reading-row.tsx` | One full-row session anchor with cover, book metadata, activity summary, and arrow |
| `front/features/archive/ui/my-page/recent-reading-list.tsx` | Recent-reading section heading, empty state, up to three rows, and `/app/me/records` action |
| `front/features/archive/ui/my-page/recent-reading-list.test.tsx` | Prop-driven recent-list and row semantic, cover, empty, and navigation tests |
| `front/features/archive/ui/my-page/member-space-overview.tsx` | Shared semantic surface that composes profile and achievement sections |
| `front/features/archive/ui/my-page/member-profile-summary.tsx` | Profile identity and profile/account actions |
| `front/features/archive/ui/my-page/profile-name-editor.tsx` | Existing edit flow plus explicit member-space editing state hook for layout |
| `front/features/archive/ui/my-page/reading-achievement-summary.tsx` | Cumulative narrative and ordered metrics without duplicate membership-start row |
| `front/features/archive/ui/my-page/my-reading-shelf.tsx` | Page-level overview then recent-reading composition |
| `front/features/archive/ui/my-page.tsx` | Stable page props passed from the route into the shelf |
| `front/features/archive/route/my-page-data.ts` | Parallel profile and three-item journey loader |
| `front/features/archive/route/my-page-route.tsx` | View-model construction, scoped href mapping, and profile update controller wiring |
| `front/features/archive/route/my-page-data.test.ts` | Loader page-size, parallel failure, and inactive-state coverage |
| `front/features/archive/route/my-page-route.test.tsx` | Scoped account, personal-record, and session-record href plus semantic composition coverage |
| `front/features/archive/ui/my-page/member-space-sections.test.tsx` | Profile, overview, achievement, permission, and inline-edit contracts |
| `front/tests/unit/my-page.test.tsx` | Whole-page composition contract |
| `front/src/styles/globals.css` | 1080px editorial overview, outlined account action, recent rows, mobile, focus, and reduced motion |
| `front/tests/e2e/my-reading-shelf-fixtures.ts` | Public-safe three-row journey and session-detail browser fixtures |
| `front/tests/e2e/member-space-information-architecture.spec.ts` | Desktop/mobile/zoom hierarchy, recent links, scoped navigation, focus, and overflow evidence |
| `front/tests/e2e/member-profile-permissions.spec.ts` | Active, suspended, viewer, empty, and profile-save regressions |
| `docs/development/architecture.md` | Current `/app/me` loader, composition, ownership, and logout facts |
| `CHANGELOG.md` | Unreleased reader-facing summary of the richer member space |

## Acceptance Matrix

- Selected `UI or runtime state`: empty and 1–3 recent items, missing/failed cover, two to four metrics, editing, saving, save error, permission-denied edit, long Korean/English wrapping, desktop, 390px, 320px, and 200% zoom. Evidence: model/component/route tests plus focused Playwright and bounded browser inspection.
- Selected `Actor or authorization`: active members can edit; suspended, viewer, invited, left, and inactive states do not gain the edit action. Account management and readable records retain existing authorization. Evidence: existing controller/component tests and `member-profile-permissions.spec.ts`.
- Selected `Club context`: account, personal-record, and session-record hrefs must preserve `/clubs/:clubSlug`. Evidence: route tests and the scoped-navigation E2E.
- Selected `Cursor collection`: `/app/me` consumes only the first three server-ordered items while `/app/me/records` remains a 12-item cursor collection with continuation and duplicate protection. Evidence: loader/model tests and the existing direct-route pagination E2E.
- Excluded `Session lifecycle`, `publication visibility`, `BFF or OAuth`, `persistence or migration`, and `async, cache, or provider`: this slice reads the existing profile/journey projection and changes no lifecycle, visibility, proxy, storage, queue, cache, or provider contract.

---

### Task 1: Extend the pure member-space model with profile start metadata and recent-reading previews

**Files:**
- Modify: `front/features/archive/model/my-reading-shelf-model.ts:1-166`
- Modify: `front/features/archive/model/my-reading-shelf-model.test.ts:1-181`

**Interfaces:**
- Consumes: `MyJourneyItem[]`, `MyJourneySummary`, profile `displayName`, `clubName`, `role`, `membershipStatus`, `joinedAt`, and `today`.
- Produces:

```ts
export type RecentReadingFeedbackStatus =
  | "피드백 열림"
  | "피드백 제한"
  | null;

export type RecentReadingPreviewItem = {
  sessionId: string;
  sessionNumberLabel: string;
  dateLabel: string;
  bookTitle: string;
  bookAuthor: string | null;
  bookImageUrl: string | null;
  coverFallbackLabel: string;
  activityLabels: string[];
  feedbackStatus: RecentReadingFeedbackStatus;
};

export type MemberSpaceViewModel = {
  avatarLabel: string;
  profileMetaLabel: string;
  achievementHeading: string;
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.";
  metrics: MemberSpaceMetric[];
};

export function buildRecentReadingPreview(
  items: MyJourneyItem[],
): RecentReadingPreviewItem[];
```

- Removes from `MemberSpaceViewModel`: `joinedMonthLabel`.
- Removes after confirming no remaining consumer: exported `membershipDurationLabel`.
- Guarantees: first three items only, server order preserved, exact title/date/activity/feedback fallbacks, no route knowledge.

- [ ] **Step 1: Replace the duplicate joined-month assertions and add failing recent-preview tests**

Update the cumulative-profile expectation to:

```ts
expect(memberSpaceViewModel()).toEqual({
  avatarLabel: "멤",
  profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께",
  achievementHeading: "세 번의 모임에서 세 권을 끝까지 읽었어요.",
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.",
  metrics: [
    { label: "함께한 모임", value: "3" },
    { label: "완독", value: "3" },
    { label: "질문", value: "12" },
  ],
});
```

Replace the `membershipDurationLabel` test with exact profile-meta validity cases:

```ts
it("uses an exact valid joined month once and omits invalid or future months", () => {
  expect(memberSpaceViewModel({ profile: { joinedAt: "2025-11" } }).profileMetaLabel)
    .toBe("읽는사이 · 멤버 · 2025.11부터 함께");
  expect(memberSpaceViewModel({ profile: { joinedAt: "not-a-month" } }).profileMetaLabel)
    .toBe("읽는사이 · 멤버");
  expect(memberSpaceViewModel({ profile: { joinedAt: "2026-08" } }).profileMetaLabel)
    .toBe("읽는사이 · 멤버");
});
```

Import `buildRecentReadingPreview` and add:

```ts
it("maps at most three recent readings in server order", () => {
  const fourth = journeyItem({ sessionId: "fourth", bookTitle: "네 번째 책" });
  expect(buildRecentReadingPreview([
    journeyItem({
      sessionId: "first",
      sessionNumber: 12,
      bookTitle: "  첫 번째 책  ",
      bookAuthor: "  첫 저자  ",
      bookImageUrl: "https://example.com/public-safe-cover.jpg",
      date: "2026-07-20",
      questionCount: 2,
      reviewCount: 1,
      feedbackDocument: { available: true, readable: true, lockedReason: null },
    }),
    journeyItem({
      sessionId: "second",
      bookTitle: "두 번째 책",
      feedbackDocument: {
        available: true,
        readable: false,
        lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED",
      },
    }),
    journeyItem({ sessionId: "third", bookTitle: "세 번째 책" }),
    fourth,
  ])).toEqual([
    {
      sessionId: "first",
      sessionNumberLabel: "12차",
      dateLabel: "2026.07.20",
      bookTitle: "첫 번째 책",
      bookAuthor: "첫 저자",
      bookImageUrl: "https://example.com/public-safe-cover.jpg",
      coverFallbackLabel: "첫",
      activityLabels: ["질문 2", "서평 1"],
      feedbackStatus: "피드백 열림",
    },
    expect.objectContaining({
      sessionId: "second",
      feedbackStatus: "피드백 제한",
    }),
    expect.objectContaining({
      sessionId: "third",
      feedbackStatus: null,
    }),
  ]);
});
```

Add explicit fallbacks:

```ts
it("uses safe title, author, cover, date, and empty-activity fallbacks", () => {
  expect(buildRecentReadingPreview([
    journeyItem({
      bookTitle: "   ",
      bookAuthor: "   ",
      bookImageUrl: null,
      date: "2026-02-29",
      questionCount: 0,
      reviewCount: 0,
      feedbackDocument: {
        available: false,
        readable: false,
        lockedReason: "NOT_AVAILABLE",
      },
    }),
  ])).toEqual([
    expect.objectContaining({
      bookTitle: "제목 없는 책",
      bookAuthor: null,
      coverFallbackLabel: "책",
      dateLabel: "날짜 미상",
      activityLabels: [],
      feedbackStatus: null,
    }),
  ]);
});
```

- [ ] **Step 2: Run the focused model test and verify the new contract fails**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: FAIL because `buildRecentReadingPreview` and the recent preview types do not exist, while the old view model still returns `joinedMonthLabel` and duration copy.

- [ ] **Step 3: Implement the minimal pure model**

First confirm the removal boundary:

```bash
rg -n "membershipDurationLabel|joinedMonthLabel" front --glob '*.{ts,tsx}'
```

Expected before editing: only `my-reading-shelf-model.ts`, its test, `reading-achievement-summary.tsx`, and member-space test fixtures reference these symbols.

Add the types above and implement:

```ts
const RECENT_READING_LIMIT = 3;

export function buildRecentReadingPreview(
  items: MyJourneyItem[],
): RecentReadingPreviewItem[] {
  return items.slice(0, RECENT_READING_LIMIT).map((item) => {
    const rawTitle = item.bookTitle.trim();
    const bookTitle = rawTitle || "제목 없는 책";

    return {
      sessionId: item.sessionId,
      sessionNumberLabel: `${item.sessionNumber}차`,
      dateLabel: journeyDateLabel(item.date),
      bookTitle,
      bookAuthor: item.bookAuthor.trim() || null,
      bookImageUrl: item.bookImageUrl,
      coverFallbackLabel: rawTitle.charAt(0) || "책",
      activityLabels: [
        ...(item.questionCount > 0 ? [`질문 ${item.questionCount}`] : []),
        ...(item.reviewCount > 0 ? [`서평 ${item.reviewCount}`] : []),
      ],
      feedbackStatus: item.feedbackDocument.readable
        ? "피드백 열림"
        : item.feedbackDocument.available &&
            item.feedbackDocument.lockedReason === "ACTIVE_MEMBERSHIP_REQUIRED"
          ? "피드백 제한"
          : null,
    };
  });
}
```

Use one strict date parser for both year grouping and preview labels:

```ts
function validJourneyDate(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? { year: match[1], label: `${match[1]}.${match[2]}.${match[3]}` }
    : null;
}

function journeyDateLabel(date: string) {
  return validJourneyDate(date)?.label ?? "날짜 미상";
}
```

Make `validDateYear` delegate to `validJourneyDate`. Replace duration output with a private exact joined-month validator:

```ts
function validJoinedMonthLabel(joinedAt: string, today: Date) {
  const match = joinedAt.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const monthDifference =
    (today.getFullYear() - year) * 12 + today.getMonth() - (month - 1);
  return monthDifference < 0 ? null : formatJoinedMonth(joinedAt);
}
```

Build `profileMetaLabel` from club, membership, and `${joinedMonth}부터 함께` when valid. Remove `joinedMonthLabel` and the now-unused exported duration helper.

- [ ] **Step 4: Run the focused model test and verify it passes**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: PASS for existing pagination/grouping and all new profile/recent-preview cases.

- [ ] **Step 5: Commit the pure model contract**

```bash
git add front/features/archive/model/my-reading-shelf-model.ts \
  front/features/archive/model/my-reading-shelf-model.test.ts
git commit -m "feat(front): model recent member readings"
```

---

### Task 2: Build the prop-driven recent-reading list and single-anchor rows

**Files:**
- Create: `front/features/archive/ui/my-page/recent-reading-row.tsx`
- Create: `front/features/archive/ui/my-page/recent-reading-list.tsx`
- Create: `front/features/archive/ui/my-page/recent-reading-list.test.tsx`

**Interfaces:**
- Consumes: `RecentReadingPreviewItem` from Task 1 plus route-provided scoped `href`.
- Produces:

```ts
export type RecentReadingListItem = RecentReadingPreviewItem & {
  href: string;
};

export type RecentReadingListProps = {
  items: RecentReadingListItem[];
  recordsHref: string;
};

export function RecentReadingList(props: RecentReadingListProps): JSX.Element;
export function RecentReadingRow(
  props: { item: RecentReadingListItem },
): JSX.Element;
```

- Guarantees: one anchor per row, decorative cover semantics, local image-error fallback, no records action in the empty state.

- [ ] **Step 1: Write failing component tests for filled, empty, and failed-cover states**

Use a local helper returning a complete `RecentReadingListItem`, then add:

```tsx
it("renders a three-row semantic list with one session anchor per row", () => {
  render(
    <RecentReadingList
      recordsHref="/app/me/records"
      items={[
        recentItem({
          sessionId: "session-12",
          href: "/app/sessions/session-12",
          activityLabels: ["질문 2", "서평 1"],
          feedbackStatus: "피드백 열림",
        }),
        recentItem({
          sessionId: "session-11",
          href: "/app/sessions/session-11",
          feedbackStatus: "피드백 제한",
        }),
        recentItem({
          sessionId: "session-10",
          href: "/app/sessions/session-10",
          feedbackStatus: null,
        }),
      ]}
    />,
  );

  expect(screen.getByRole("heading", {
    level: 2,
    name: "최근 함께 읽은 기록",
  })).toBeVisible();
  expect(screen.getByRole("list", {
    name: "최근 함께 읽은 기록",
  }).querySelectorAll("li")).toHaveLength(3);
  expect(screen.getByRole("link", {
    name: "샘플 도서 회차 기록",
  })).toHaveAttribute("href", "/app/sessions/session-12");
  expect(screen.getAllByRole("link").filter((link) =>
    link.getAttribute("href")?.includes("/app/sessions/"),
  )).toHaveLength(3);
  expect(screen.getByRole("link", {
    name: "전체 기록 보기",
  })).toHaveAttribute("href", "/app/me/records");
  expect(screen.getByText("질문 2")).toBeVisible();
  expect(screen.getByText("서평 1")).toBeVisible();
  expect(screen.getByText("피드백 열림")).toBeVisible();
  expect(screen.getByText("피드백 제한")).toBeVisible();
});
```

Add cover behavior:

```tsx
it("keeps covers decorative and replaces a failed remote cover locally", () => {
  const { container } = render(
    <RecentReadingRow
      item={recentItem({
        bookImageUrl: "https://example.com/public-safe-cover.jpg",
        coverFallbackLabel: "샘",
      })}
    />,
  );

  const cover = container.querySelector("img");
  expect(cover).toHaveAttribute("alt", "");
  fireEvent.error(cover!);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("샘");
});
```

Add empty behavior:

```tsx
it("renders a quiet empty state without a records action", () => {
  render(<RecentReadingList items={[]} recordsHref="/app/me/records" />);
  expect(screen.getByText(
    "첫 모임 이후 이곳에 읽은 기록이 이어집니다.",
  )).toBeVisible();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByRole("link", { name: "전체 기록 보기" })).toBeNull();
});
```

- [ ] **Step 2: Run the focused component test and verify it fails**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/recent-reading-list.test.tsx
```

Expected: FAIL because both recent-reading modules are absent.

- [ ] **Step 3: Implement the row with a local cover-error state**

Implement `RecentReadingRow` with this structure:

```tsx
import { useState } from "react";
import type { RecentReadingListItem } from "./recent-reading-list";

export function RecentReadingRow({ item }: { item: RecentReadingListItem }) {
  return (
    <a
      className="rm-recent-reading-row"
      href={item.href}
      aria-label={`${item.bookTitle} 회차 기록`}
    >
      <RecentReadingCover item={item} />
      <span className="rm-recent-reading-row__book">
        <span className="rm-recent-reading-row__meta">
          {item.sessionNumberLabel} · {item.dateLabel}
        </span>
        <h3>{item.bookTitle}</h3>
        {item.bookAuthor ? (
          <span className="rm-recent-reading-row__author">
            {item.bookAuthor}
          </span>
        ) : null}
        {item.activityLabels.length > 0 || item.feedbackStatus ? (
          <span className="rm-recent-reading-row__activity">
            {[...item.activityLabels, item.feedbackStatus]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </span>
      <span className="rm-recent-reading-row__arrow" aria-hidden="true">→</span>
    </a>
  );
}
```

Implement the cover without a replacement request:

```tsx
function RecentReadingCover({ item }: { item: RecentReadingListItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.bookImageUrl || failed) {
    return (
      <span
        className="rm-recent-reading-row__cover rm-recent-reading-row__cover--fallback"
        aria-hidden="true"
      >
        {item.coverFallbackLabel}
      </span>
    );
  }

  return (
    <img
      className="rm-recent-reading-row__cover"
      src={item.bookImageUrl}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
```

- [ ] **Step 4: Implement the section, list, and conditional records action**

Create `RecentReadingList`:

```tsx
export function RecentReadingList({
  items,
  recordsHref,
}: RecentReadingListProps) {
  return (
    <section
      className="rm-recent-readings"
      aria-labelledby="recent-readings-heading"
    >
      <header className="rm-recent-readings__header">
        <div>
          <p className="rm-member-space-kicker">나의 독서 기록</p>
          <h2 id="recent-readings-heading">최근 함께 읽은 기록</h2>
        </div>
        {items.length > 0 ? (
          <a
            className="rm-recent-readings__all"
            href={recordsHref}
            aria-label="전체 기록 보기"
          >
            전체 기록 보기 <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </header>
      {items.length > 0 ? (
        <ol className="rm-recent-readings__list" aria-label="최근 함께 읽은 기록">
          {items.map((item) => (
            <li key={item.sessionId}>
              <RecentReadingRow item={item} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rm-recent-readings__empty">
          첫 모임 이후 이곳에 읽은 기록이 이어집니다.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the focused component test and verify it passes**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/recent-reading-list.test.tsx
```

Expected: PASS for semantic list, single-anchor rows, hrefs, cover failure, activity states, and empty behavior.

- [ ] **Step 6: Commit the recent-reading presentation boundary**

```bash
git add front/features/archive/ui/my-page/recent-reading-row.tsx \
  front/features/archive/ui/my-page/recent-reading-list.tsx \
  front/features/archive/ui/my-page/recent-reading-list.test.tsx
git commit -m "feat(front): add recent reading preview"
```

---

### Task 3: Load three records and compose the overview with scoped navigation

**Files:**
- Create: `front/features/archive/ui/my-page/member-space-overview.tsx`
- Modify: `front/features/archive/route/my-page-data.ts:20-36`
- Modify: `front/features/archive/route/my-page-data.test.ts:77-129`
- Modify: `front/features/archive/route/my-page-route.tsx:1-35`
- Modify: `front/features/archive/route/my-page-route.test.tsx:18-87`
- Modify: `front/features/archive/ui/my-page.tsx:1-30`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx:1-35`
- Modify: `front/features/archive/ui/my-page/member-profile-summary.tsx:1-41`
- Modify: `front/features/archive/ui/my-page/profile-name-editor.tsx:35-112`
- Modify: `front/features/archive/ui/my-page/reading-achievement-summary.tsx:1-24`
- Modify: `front/features/archive/ui/my-page/member-space-sections.test.tsx:1-107`
- Modify: `front/tests/unit/my-page.test.tsx:1-58`

**Interfaces:**
- Consumes: `buildMemberSpaceViewModel`, `buildRecentReadingPreview`, Task 2 `RecentReadingList`, existing `useProfileUpdateController`, and `scopedAppLinkTarget`.
- Produces route/page props:

```ts
type MyPageProps = {
  profile: MyPageProfile;
  viewModel: MemberSpaceViewModel;
  recentReadings: RecentReadingListItem[];
  canEditProfile: boolean;
  accountSettingsHref: string;
  recordsHref: string;
  onUpdateProfile: (displayName: string) => Promise<ProfileUpdateResult>;
};
```

- Guarantees: scoped `/app/me/settings`, `/app/me/records`, and `/app/sessions/:sessionId` hrefs; profile and achievement inside one overview; recent list after overview; no duplicate membership-start row.

- [ ] **Step 1: Change loader and route tests to the new failing contract**

Rename the loader test to `loads the profile and three journey items for summary and recent records` and change:

```ts
expect(api.fetchMyJourney).toHaveBeenCalledWith(
  { clubSlug: undefined },
  { limit: 3 },
);
```

Give route test data one item:

```ts
journey: {
  items: [{
    sessionId: "session / 9",
    sessionNumber: 9,
    bookTitle: "최근 함께 읽은 책",
    bookAuthor: "테스트 저자",
    bookImageUrl: null,
    date: "2026-07-20",
    readingProgress: 100,
    questionCount: 2,
    reviewCount: 1,
    feedbackDocument: {
      available: true,
      readable: true,
      lockedReason: null,
    },
  }],
  // retain current summary
}
```

Replace the obsolete no-record-link expectation with:

```tsx
expect(screen.getByRole("link", { name: "계정 관리" })).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/me/settings",
);
expect(screen.getByRole("link", { name: "전체 기록 보기" })).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/me/records",
);
expect(screen.getByRole("link", {
  name: "최근 함께 읽은 책 회차 기록",
})).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/sessions/session%20%2F%209",
);
```

Keep the no-participation-timeline, no-current-session nudge, and no-local-logout assertions.

- [ ] **Step 2: Update component tests before the implementation**

In `member-space-sections.test.tsx`:

- remove `joinedMonthLabel` from the view model;
- change profile meta to `읽는사이 · 멤버 · 2025.11부터 함께`;
- expect account link accessible name `계정 관리` and visible text containing `계정 관리`;
- expect `.rm-member-profile__settings`;
- expect no `멤버십 시작` text in `ReadingAchievementSummary`;
- add a `MemberSpaceOverview` test that profile precedes achievement inside `.rm-member-space__overview`;
- keep edit-permission and inline editor tests.

Add a pending-state test with a controlled promise:

```tsx
it("keeps the member-space editor stable while a save is pending", async () => {
  const pendingSave = new Promise<ProfileUpdateResult>(() => undefined);
  const user = userEvent.setup();
  render(
    <MemberProfileSummary
      profile={profile}
      viewModel={viewModel}
      canEditProfile
      accountSettingsHref="/app/me/settings"
      onUpdateProfile={() => pendingSave}
    />,
  );

  await user.click(screen.getByRole("button", { name: "프로필 수정" }));
  await user.click(screen.getByRole("button", { name: "이름 저장" }));

  expect(screen.getByRole("button", { name: "이름 저장" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  expect(screen.getByText("저장 중")).toBeVisible();
});
```

Add an inline failure test:

```tsx
it("keeps the editor open and exposes a nearby save error", async () => {
  const user = userEvent.setup();
  render(
    <MemberProfileSummary
      profile={profile}
      viewModel={viewModel}
      canEditProfile
      accountSettingsHref="/app/me/settings"
      onUpdateProfile={vi.fn().mockRejectedValue(
        new Error("같은 클럽에서 이미 쓰고 있는 이름입니다."),
      )}
    />,
  );

  await user.click(screen.getByRole("button", { name: "프로필 수정" }));
  await user.click(screen.getByRole("button", { name: "이름 저장" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "같은 클럽에서 이미 쓰고 있는 이름입니다.",
  );
  expect(screen.getByLabelText("이름")).toBeVisible();
});
```

In `front/tests/unit/my-page.test.tsx`, supply:

```ts
const recentReadings: RecentReadingListItem[] = [{
  sessionId: "session-9",
  sessionNumberLabel: "9차",
  dateLabel: "2026.07.20",
  bookTitle: "최근 함께 읽은 책",
  bookAuthor: "테스트 저자",
  bookImageUrl: null,
  coverFallbackLabel: "최",
  activityLabels: ["질문 2"],
  feedbackStatus: "피드백 열림",
  href: "/app/sessions/session-9",
}];
```

Pass `recentReadings` and `recordsHref="/app/me/records"`, then assert DOM order:

```ts
const overview = container.querySelector(".rm-member-space__overview")!;
const recent = screen.getByRole("region", { name: "최근 함께 읽은 기록" });
expect(
  overview.compareDocumentPosition(recent) &
    Node.DOCUMENT_POSITION_FOLLOWING,
).toBeTruthy();
```

- [ ] **Step 3: Run the focused loader, route, section, and page tests and verify they fail**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  features/archive/route/my-page-route.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: FAIL because the loader still requests one item, page props do not include recent data, the overview component is absent, and the achievement still renders the duplicate membership-start row.

- [ ] **Step 4: Change the loader page size without changing inactive behavior**

In `my-page-data.ts`, change only:

```ts
fetchMyJourney(context, { limit: 3 }),
```

Keep `Promise.all`, inactive `emptyMyJourneyPage()`, and both rejection tests unchanged.

- [ ] **Step 5: Map all three scoped destinations in the route**

Import `buildRecentReadingPreview`, then add:

```ts
const scopedHref = (target: string) =>
  scopedAppLinkTarget(location.pathname, target);
const recentReadings = buildRecentReadingPreview(journey.items).map((item) => ({
  ...item,
  href: scopedHref(
    `/app/sessions/${encodeURIComponent(item.sessionId)}`,
  ),
}));
```

Pass:

```tsx
accountSettingsHref={scopedHref("/app/me/settings")}
recordsHref={scopedHref("/app/me/records")}
recentReadings={recentReadings}
```

Do not move API or auth work into the UI.

- [ ] **Step 6: Compose the semantic overview and recent list**

Create:

```tsx
import type { ReactNode } from "react";

export function MemberSpaceOverview({
  children,
}: { children: ReactNode }) {
  return (
    <section
      className="rm-member-space__overview"
      aria-label="나의 독서 개요"
    >
      {children}
    </section>
  );
}
```

Update `MyPage` and `MyReadingShelf` props. Render:

```tsx
<main className="rm-my-shelf rm-member-space">
  <MemberSpaceOverview>
    <MemberProfileSummary
      profile={profile}
      viewModel={viewModel}
      canEditProfile={canEditProfile}
      accountSettingsHref={accountSettingsHref}
      onUpdateProfile={onUpdateProfile}
    />
    <ReadingAchievementSummary viewModel={viewModel} />
  </MemberSpaceOverview>
  <RecentReadingList
    items={recentReadings}
    recordsHref={recordsHref}
  />
</main>
```

Remove the `rm-reading-achievement__joined` paragraph from `ReadingAchievementSummary`.

Render account management as:

```tsx
<a
  className="rm-member-profile__settings"
  href={accountSettingsHref}
  aria-label="계정 관리"
>
  <span>계정 관리</span>
  <span aria-hidden="true">→</span>
</a>
```

In the member-space branch of `ProfileNameEditor`, add `data-editing={editing || undefined}` to `.rm-member-profile__name` so CSS can expand the editing form without reading component state.

- [ ] **Step 7: Run the focused loader, route, section, and page tests and verify they pass**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  features/archive/route/my-page-route.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/recent-reading-list.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: PASS for loader size, scoped hrefs, overview order, permissions, editing semantics, achievement metrics, recent rows, and empty state.

- [ ] **Step 8: Commit the route and composition integration**

```bash
git add front/features/archive/route/my-page-data.ts \
  front/features/archive/route/my-page-data.test.ts \
  front/features/archive/route/my-page-route.tsx \
  front/features/archive/route/my-page-route.test.tsx \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/ui/my-page/member-space-overview.tsx \
  front/features/archive/ui/my-page/my-reading-shelf.tsx \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/reading-achievement-summary.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/tests/unit/my-page.test.tsx
git commit -m "feat(front): compose member reading overview"
```

---

### Task 4: Implement the editorial desktop, mobile, focus, and reduced-motion layout

**Files:**
- Modify: `front/src/styles/globals.css:5731-5924`
- Modify: `front/src/styles/globals.css:6434-6510`
- Modify: `front/tests/e2e/my-reading-shelf-fixtures.ts:1-197`
- Modify: `front/tests/e2e/member-space-information-architecture.spec.ts:1-177`

**Interfaces:**
- Consumes: Task 3 `.rm-member-space__overview`, profile/achievement classes, and Task 2 recent-reading classes.
- Produces: max-1080px 4:6 overview, outlined account anchor, three-row list, one-column 768px layout, 44px actions, 320px/200% overflow safety, focus and reduced-motion styling.

- [ ] **Step 1: Add a three-row public-safe E2E fixture mode**

Extend `JourneyFixtureMode` with `"three-recent-readings"`. Add a third item using the existing second-page item:

```ts
const threeRecentReadingItems = [
  ...firstPage.items,
  secondPage.items[0],
];
```

In `mockMyReadingShelfJourney` return these items with `threeAchievementSummary` when the new mode is selected. Keep `"fifteen-records"` pagination and every existing mode unchanged.

- [ ] **Step 2: Write failing responsive and visual-contract assertions**

Use `"three-recent-readings"` in the cross-viewport member-space test. Replace obsolete no-record expectations with:

```ts
await expect(shelf.locator(".rm-member-space__overview")).toHaveCount(1);
await expect(shelf.getByRole("list", {
  name: "최근 함께 읽은 기록",
}).getByRole("listitem")).toHaveCount(3);
await expect(shelf.getByRole("link", {
  name: "전체 기록 보기",
})).toBeVisible();
```

Extend `expectMemberSpaceSemanticOrder` so the recent `h2` and first recent-reading link follow the achievement metrics.

At 1280px, assert:

```ts
const overviewStyle = await shelf
  .locator(".rm-member-space__overview")
  .evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      columns: style.gridTemplateColumns.split(" ").length,
      width: element.getBoundingClientRect().width,
    };
  });
expect(overviewStyle.display).toBe("grid");
expect(overviewStyle.columns).toBe(2);
expect(overviewStyle.width).toBeLessThanOrEqual(1080);
```

For `계정 관리`, assert `textDecorationLine === "none"` and retain the existing 44px/focus checks. At 390px and 320px, assert the overview has one column and `scrollWidth <= innerWidth`. Keep the 200% zoom pass and screenshots.

Add a reduced-motion assertion after the viewport loop:

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
const firstRecent = page.getByRole("link", {
  name: /responsive reading shelf 회차 기록/,
});
await firstRecent.hover();
await expect(firstRecent.locator(".rm-recent-reading-row__arrow"))
  .toHaveCSS("transform", "none");
```

- [ ] **Step 3: Run the focused IA E2E and verify the new layout contract fails**

Run:

```bash
corepack pnpm --dir front test:e2e -- \
  tests/e2e/member-space-information-architecture.spec.ts
```

Expected: FAIL because the new overview and recent list are not styled as the required 4:6/one-column layouts and the account link still uses underline styling.

- [ ] **Step 4: Replace the member-space CSS with the approved editorial surface**

Set the page width and overview:

```css
.rm-my-shelf,
.rm-member-space {
  width: min(100% - 32px, 1080px);
  margin: 0 auto;
  padding: 48px 0 88px;
}

.rm-member-space__overview {
  display: grid;
  grid-template-columns: minmax(280px, 4fr) minmax(0, 6fr);
  min-width: 0;
  border: 1px solid var(--line);
  background: var(--surface);
}
```

Use the existing design-system `--surface` token shown above; do not add a raw paper color.

Change the profile to a contained two-column grid with right rule:

```css
.rm-member-profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  gap: 12px 14px;
  min-width: 0;
  padding: 32px;
  border-right: 1px solid var(--line);
}

.rm-member-profile__avatar {
  grid-column: 1;
  grid-row: 1 / span 2;
}

.rm-member-space-kicker {
  grid-column: 2;
  grid-row: 1;
}

.rm-member-profile__name {
  grid-column: 2;
  grid-row: 2;
}

.rm-member-profile__meta {
  grid-column: 1 / -1;
  grid-row: 3;
}

.rm-member-profile__actions {
  grid-column: 1 / -1;
  grid-row: 4;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.rm-member-profile__name[data-editing="true"] {
  grid-column: 1 / -1;
  grid-row: 3;
}

.rm-member-profile:has(.rm-member-profile__name[data-editing="true"])
  .rm-member-profile__meta {
  grid-row: 4;
}
```

Keep the avatar, `h1`, metadata wrapping, form, and permission behavior. Style account management:

```css
.rm-member-profile__settings {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-inline: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-1);
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.4;
  text-decoration: none;
}

.rm-member-profile__settings:hover {
  border-color: var(--accent);
  background: var(--bg-sub);
}
```

Place the achievement inside the right side with 32px padding. Keep the narrative as the visual focus and the 2–4 item definition list; delete `.rm-reading-achievement__joined` rules.

- [ ] **Step 5: Add recent-reading list and row styling**

Add:

```css
.rm-recent-readings {
  margin-top: 34px;
}

.rm-recent-readings__header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.rm-recent-readings__header h2 {
  margin: 7px 0 0;
  font-family: var(--font-editorial);
  font-size: 1.7rem;
  line-height: 1.2;
}

.rm-recent-readings__all {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 650;
  text-decoration: none;
}

.rm-recent-readings__list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.rm-recent-reading-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  min-height: 104px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--line-soft);
  color: inherit;
  text-decoration: none;
}

.rm-recent-reading-row:hover {
  background: var(--bg-sub);
}

.rm-recent-reading-row__cover {
  display: grid;
  width: 48px;
  aspect-ratio: 2 / 3;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-1);
  background: var(--bg-sub);
  object-fit: cover;
}

.rm-recent-reading-row__book {
  min-width: 0;
}

.rm-recent-reading-row__book h3 {
  margin: 4px 0;
  overflow-wrap: anywhere;
}

.rm-recent-reading-row__meta,
.rm-recent-reading-row__author,
.rm-recent-reading-row__activity {
  display: block;
  color: var(--text-3);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.rm-recent-reading-row__arrow {
  color: var(--accent);
  transition: transform 160ms ease;
}

.rm-recent-reading-row:hover .rm-recent-reading-row__arrow {
  transform: translateX(3px);
}

.rm-recent-readings__empty {
  margin: 14px 0 0;
  padding: 22px 0;
  border-block: 1px solid var(--line);
  color: var(--text-2);
}
```

Add focus-visible rules for the account, all-records, and row anchors with the existing `--focus-ring`.

- [ ] **Step 6: Implement the 768px and reduced-motion contracts**

Inside the existing 768px block:

```css
.rm-member-space__overview {
  grid-template-columns: minmax(0, 1fr);
}

.rm-member-profile {
  padding: 24px 20px;
  border-right: 0;
  border-bottom: 1px solid var(--line);
}

.rm-reading-achievement {
  padding: 28px 20px;
}

.rm-member-profile__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.rm-recent-readings {
  margin-top: 28px;
}

.rm-recent-readings__header {
  align-items: start;
}

.rm-recent-reading-row {
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 11px;
  min-height: 96px;
  padding-inline: 0;
}

.rm-recent-reading-row__cover {
  width: 40px;
}
```

Keep one action full-width when editing is not allowed. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .rm-recent-reading-row__arrow {
    transition: none;
  }

  .rm-recent-reading-row:hover .rm-recent-reading-row__arrow {
    transform: none;
  }
}
```

- [ ] **Step 7: Run the focused component and IA E2E checks**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/recent-reading-list.test.tsx \
  tests/unit/my-page.test.tsx
corepack pnpm --dir front test:e2e -- \
  tests/e2e/member-space-information-architecture.spec.ts
```

Expected: PASS with three recent rows, two-column desktop overview, one-column mobile overview, no account underline, visible focus, 44px actions, no 320px/200% overflow, and fresh screenshots in Playwright’s ignored output directory.

- [ ] **Step 8: Commit the responsive visual implementation**

```bash
git add front/src/styles/globals.css \
  front/tests/e2e/my-reading-shelf-fixtures.ts \
  front/tests/e2e/member-space-information-architecture.spec.ts
git commit -m "style(front): enrich member reading space"
```

---

### Task 5: Close scoped navigation, permission, empty, and session-detail E2E coverage

**Files:**
- Modify: `front/tests/e2e/my-reading-shelf-fixtures.ts`
- Modify: `front/tests/e2e/member-space-information-architecture.spec.ts`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts`
- Reuse: `front/tests/unit/api-contract-fixtures.ts`

**Interfaces:**
- Consumes: `archiveSessionDetailContractFixture`, `mockMyReadingShelfJourney`, scoped app routes, and existing Google/local database login fixtures.
- Produces:

```ts
export async function mockRecentReadingSessionDetail(
  page: Page,
): Promise<void>;
```

- Guarantees: recent session links open a readable session route; personal-record links stay club-scoped; active/suspended/viewer/empty contracts remain correct.

- [ ] **Step 1: Add a public-safe member session detail browser fixture**

Import:

```ts
import { archiveSessionDetailContractFixture } from "../unit/api-contract-fixtures";
```

Add:

```ts
export async function mockRecentReadingSessionDetail(page: Page) {
  await page.route(
    "**/api/bff/api/archive/sessions/journey-2026-03**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...archiveSessionDetailContractFixture,
          sessionId: "journey-2026-03",
          sessionNumber: 12,
          title: "12회차 모임 · 최근 함께 읽은 책",
          bookTitle: "최근 함께 읽은 책",
          bookAuthor: "공개 안전 테스트 저자",
          date: "2026-07-20",
        }),
      });
    },
  );
}
```

The fixture contains no real member or deployment data and keeps public highlights author-complete so the detail loader does not need an additional member lookup.

- [ ] **Step 2: Write failing scoped record and session navigation E2E assertions**

In the scoped-navigation test:

1. mock `"three-recent-readings"` and `mockRecentReadingSessionDetail`;
2. assert `전체 기록 보기` href is `${scopedAppPath}/me/records`;
3. assert the first recent link href is `${scopedAppPath}/sessions/journey-2026-03`;
4. click the recent link;
5. assert the scoped URL and `최근 함께 읽은 책` detail content;
6. navigate back to `/me`, click `전체 기록 보기`, and assert `/me/records`;
7. keep account and notification history assertions.

Use:

```ts
const recentSession = page.getByRole("link", {
  name: "아주 긴 한국어 제목과 An exceptionally long English subtitle for a responsive reading shelf 회차 기록",
});
await expect(recentSession).toHaveAttribute(
  "href",
  `${scopedAppPath}/sessions/journey-2026-03`,
);
await recentSession.click();
await expect(page).toHaveURL(
  new RegExp(`${scopedAppPath}/sessions/journey-2026-03$`),
);
await expect(page.getByText("최근 함께 읽은 책").first()).toBeVisible();
```

- [ ] **Step 3: Replace stale profile-permission and empty-state expectations**

Keep the active-member edit and account-menu refresh test unchanged except for using `"three-recent-readings"`.

For suspended and viewer states, assert:

```ts
await expect(shelf.getByRole("link", { name: "계정 관리" })).toBeVisible();
await expect(shelf.getByRole("button", { name: "프로필 수정" })).toHaveCount(0);
await expect(shelf.getByRole("list", {
  name: "최근 함께 읽은 기록",
})).toBeVisible();
```

Replace the old empty recent-attendance assertion with:

```ts
await expect(page.getByText(
  "첫 모임 이후 이곳에 읽은 기록이 이어집니다.",
)).toBeVisible();
await expect(page.getByRole("list", {
  name: "최근 함께 읽은 기록",
})).toHaveCount(0);
await expect(page.getByRole("link", {
  name: "전체 기록 보기",
})).toHaveCount(0);
```

Do not add a current-session CTA or local logout.

- [ ] **Step 4: Run both focused E2E specs and verify the new assertions fail before fixture/spec completion**

Run after writing the expectations and before finishing the fixture wiring:

```bash
corepack pnpm --dir front test:e2e -- \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: FAIL on the new recent-session detail and updated empty/permission contracts until the new fixture mode and mock are wired into every affected test.

- [ ] **Step 5: Finish fixture wiring and run both focused E2E specs**

Wire `mockRecentReadingSessionDetail` and `"three-recent-readings"` into the affected tests, then run:

```bash
corepack pnpm --dir front test:e2e -- \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: PASS for scoped account/records/session destinations, full-record pagination, active edit refresh, suspended/viewer permissions, empty state, long text, and responsive evidence.

- [ ] **Step 6: Commit the completed user-flow evidence**

```bash
git add front/tests/e2e/my-reading-shelf-fixtures.ts \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts
git commit -m "test(front): cover member reading overview"
```

---

### Task 6: Align active docs and run the complete frontend and browser gates

**Files:**
- Modify: `docs/development/architecture.md:343-345`
- Modify: `CHANGELOG.md:9-20`
- Verify only: all files changed by Tasks 1–5

**Interfaces:**
- Consumes: the final implementation and its automated evidence.
- Produces: current architecture/release notes, canonical frontend evidence, bounded browser evidence, clean diff/worktree receipts.

- [ ] **Step 1: Replace stale active architecture paragraphs**

Replace the stale `/app/me` description with these facts:

- the loader fetches profile and `limit=3` journey in parallel;
- cumulative summary remains page-size independent;
- the page renders one profile/achievement overview plus at most three server-ordered recent records;
- recent rows link to scoped session detail and the section links to `/app/me/records`;
- `/app/me/records` alone owns 12-item cursor continuation and the full personal list;
- `/app/me/settings` owns account/membership/destructive actions;
- account-menu logout remains the only logout;
- the profile update controller remains shared between `/app/me` and `/app/me/settings`;
- no archive-to-auth feature import or architecture-test exception is introduced.

- [ ] **Step 2: Update Unreleased CHANGELOG without overstating release state**

Change the `프로필 중심의 내 공간` Highlight to mention the unified profile/achievement surface and three recent readings. Change `멤버 내 공간 경로` so it no longer says the archive-duplicate link was removed; say the page now previews three personal records and routes full history to `/app/me/records`.

Do not claim production deployment, a release tag, or live external verification.

- [ ] **Step 3: Run focused model, route, component, and page tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/route/my-page-data.test.ts \
  features/archive/route/my-page-route.test.tsx \
  features/archive/route/profile-update-controller.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/recent-reading-list.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: PASS with zero failed tests.

- [ ] **Step 4: Run canonical frontend lint, unit, and build gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all three commands exit 0. If any fails, fix only failures caused by this branch and rerun the failed command plus affected focused tests.

- [ ] **Step 5: Run focused then full E2E**

Run:

```bash
corepack pnpm --dir front test:e2e -- \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
corepack pnpm --dir front test:e2e
```

Expected: both the focused pair and the full E2E suite exit 0. If the environment cannot start MySQL, Spring, or the browser, record the exact command and blocker; do not report the lane as passed.

- [ ] **Step 6: Perform one bounded desktop/mobile browser inspection**

With the existing local stack running, inspect `/clubs/reading-sai/app/me` once at 1280px and once at 390px in the same pass. Verify:

- the overview is 4:6 on desktop and one column on mobile;
- profile editing does not overflow or detach the page `h1`;
- `계정 관리 →` has no underline and retains visible focus;
- exactly three recent records render for the fixture;
- cover success/fallback, long title, activity summary, and arrows align;
- `/app/me/records` and the first session link are scoped correctly;
- the mobile bottom navigation does not overlap content.

Fix all defects found in one batch, rerun the focused Vitest and E2E commands once, then perform at most one confirmation pass. Do not commit screenshots or browser output.

- [ ] **Step 7: Run documentation, public-safety, and diff checks**

Run:

```bash
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  docs/development/architecture.md CHANGELOG.md \
  docs/superpowers/specs/2026-07-29-member-space-reading-overview-redesign.md \
  docs/superpowers/plans/2026-07-29-member-space-reading-overview-redesign.md
git status --short --branch --untracked-files=all
```

Expected: `git diff --check` exits 0, the safety scan prints no new match, and only intended tracked source/doc changes remain before the final commit.

- [ ] **Step 8: Commit bounded visual corrections only when the inspection changed source**

```bash
git add front/src/styles/globals.css \
  front/features/archive/ui/my-page/member-space-overview.tsx \
  front/features/archive/ui/my-page/member-profile-summary.tsx \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/reading-achievement-summary.tsx \
  front/features/archive/ui/my-page/recent-reading-list.tsx \
  front/features/archive/ui/my-page/recent-reading-row.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/features/archive/ui/my-page/recent-reading-list.test.tsx \
  front/tests/e2e/member-space-information-architecture.spec.ts
git diff --cached --quiet || git commit -m "fix(front): polish member reading overview"
```

Do not stage any path outside this list. The conditional commit is a no-op when the bounded browser pass produced no source correction.

- [ ] **Step 9: Commit the active documentation alignment**

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs: record richer member reading space"
```

- [ ] **Step 10: Re-run final verification on committed HEAD**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
git diff --check origin/main..HEAD
git status --short --branch --untracked-files=all
git log --oneline --decorate -8
```

Expected: all frontend gates exit 0; committed diff check exits 0; the worktree is clean; history contains the approved spec/plan and the implementation commits. Do not push, open a PR, tag, deploy, or mutate production.

## Completion Criteria

- `/app/me` uses a max-1080px profile/achievement overview and a recent-reading section with 0–3 rows.
- `계정 관리 →` is a scoped, outlined, non-underlined anchor; profile editing keeps existing authorization and auth refresh.
- Recent rows are one-anchor session destinations with decorative actual covers or local fallback, ordered activity text, and no nested feedback link.
- `/app/me/records` remains the only full cursor collection and is reachable through `전체 기록 보기`.
- Desktop, 390px, 320px, 200% zoom, long content, focus, reduced motion, empty, permission, image failure, and save states have automated or bounded browser evidence.
- Active architecture and CHANGELOG match current behavior.
- Canonical lint, unit, build, full E2E, diff, and public-safety checks pass or an exact blocker is reported.
- No remote, release, deployment, server, BFF, database, migration, or production action occurs.
