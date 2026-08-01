# ReadMates Host Dashboard Mobile Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** USER-APPROVED DESIGN · IMPLEMENTATION NOT STARTED

**Goal:** 호스트 모바일 대시보드의 현재 세션 카드 여백과 수치 배치를 복구하고, 운영 disclosure와 예정 세션 행동을 일관되고 정확한 모바일 운영 흐름으로 정돈한다.

**Architecture:** 기존 route/query/mutation 계약과 우선순위 운영 원장 순서를 유지한다. 순수 날짜 판정은 `host-dashboard-model.ts`, 렌더링과 문구는 prop-driven host UI, 모바일 측정값은 `front/shared/styles/mobile.css`가 담당하며 Vitest와 호스트 Playwright fixture로 각각 검증한다.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, Playwright, CSS custom properties, Corepack pnpm 11.13.1.

## Global Constraints

- Canonical route는 `/clubs/:slug/app/host`다.
- 모바일 순서는 `페이지 제목 → 지금 처리할 일 → 현재 세션`을 유지한다.
- 현재 세션 card body inset은 좌우 18px, 위 18px, 아래 16px이다.
- 참석·읽기·질문은 320px 이상에서 한 줄 3열이다.
- primary touch target은 최소 44px이며 현재 세션 CTA는 48px이다.
- 한 카드 또는 section에서 primary action은 하나만 사용한다.
- API, BFF, server, DB, migration, auth/permission 계약을 변경하지 않는다.
- 실제 알림 발송, AI provider 호출, production data mutation을 수행하지 않는다.
- `front/src/styles/globals.css`의 전역 규칙을 건드리지 않고 모바일 전용 변경은 `front/shared/styles/mobile.css`에 둔다.
- 구현 시작 전에 `git status --short --branch --untracked-files=all`을 다시 확인한다. 예상 수정 파일에 기존 변경이 있으면 덮어쓰지 말고 격리 또는 사용자 확인으로 전환한다.
- 각 task의 commit step은 명시적인 commit 권한이 있을 때만 실행한다. 권한이 없으면 해당 logical checkpoint의 검증 결과와 변경 파일만 보고한다.
- 구현 기준 명세는 `docs/superpowers/specs/2026-08-01-readmates-host-dashboard-mobile-refinement-design.md`다.

---

## File Structure

- Modify: `front/features/host/model/host-dashboard-model.ts`
  - DRAFT 세션 날짜를 `upcoming`, `today`, `overdue`, `unknown`으로 순수 판정한다.
- Modify: `front/features/host/model/host-dashboard-model.test.ts`
  - timezone-independent 예정 세션 날짜 판정 계약을 검증한다.
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
  - 현재 세션 content wrapper, 중복 제거, 모바일 disclosure copy, section heading을 렌더링한다.
- Modify: `front/features/host/ui/dashboard/upcoming-session-row.tsx`
  - 예정 세션의 primary/secondary action과 과거 일정 상태를 렌더링한다.
- Create: `front/features/host/ui/dashboard/upcoming-session-row.test.tsx`
  - 과거/미래/현재 세션 존재 여부에 따른 모바일 행동 위계를 검증한다.
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
  - 현재 세션 DOM, 문구 중복 제거, 모바일 disclosure와 heading 회귀를 검증한다.
- Modify: `front/tests/unit/host-dashboard.test.tsx`
  - 기존 통합형 host dashboard 회귀에서 모바일 전용 문구와 정보 순서를 새 계약에 맞춘다. 데스크톱 문구는 유지한다.
- Modify: `front/shared/styles/mobile.css`
  - host session body inset, 3열 metric rail, section rhythm, disclosure, upcoming action layout을 정의한다.
- Modify: `front/tests/e2e/host-club-operations.spec.ts`
  - 320px/390px computed layout, overflow, focus, screenshot 증거를 검증한다.
- Modify: `CHANGELOG.md`
  - Unreleased에 모바일 호스트 운영 화면 정돈을 기록한다.

### Task 1: 예정 세션 날짜 의미를 순수 모델로 고정

**Files:**
- Modify: `front/features/host/model/host-dashboard-model.test.ts`
- Modify: `front/features/host/model/host-dashboard-model.ts`

**Interfaces:**
- Consumes: ISO local date string `YYYY-MM-DD`, optional `Date` clock.
- Produces:

```ts
export type HostUpcomingSessionTiming = {
  state: "upcoming" | "today" | "overdue" | "unknown";
  statusLabel: "예정" | "오늘" | "일정 지남" | "일정 확인";
  editLabel: "세션 편집" | "날짜 수정";
};

export function getHostUpcomingSessionTiming(
  sessionDate: string,
  now?: Date,
): HostUpcomingSessionTiming;
```

- [ ] **Step 1: Write failing date-state tests**

Add the import and test block to `host-dashboard-model.test.ts`:

```ts
import {
  getHostDashboardChecklist,
  getHostDashboardChecklistView,
  getHostDashboardLedgerMetrics,
  getHostDashboardNextOperationAction,
  getHostDashboardPriorityItems,
  getHostUpcomingSessionTiming,
  type HostDashboardCurrentSession,
  type HostDashboardData,
  type MissingCurrentSessionMembersSummary,
} from "./host-dashboard-model";

describe("getHostUpcomingSessionTiming", () => {
  const now = new Date(2026, 7, 1, 12, 0, 0);

  it.each([
    ["2026-08-20", { state: "upcoming", statusLabel: "예정", editLabel: "세션 편집" }],
    ["2026-08-01", { state: "today", statusLabel: "오늘", editLabel: "세션 편집" }],
    ["2026-05-19", { state: "overdue", statusLabel: "일정 지남", editLabel: "날짜 수정" }],
    ["invalid", { state: "unknown", statusLabel: "일정 확인", editLabel: "날짜 수정" }],
  ] as const)("projects the timing state for %s", (date, expected) => {
    expect(getHostUpcomingSessionTiming(date, now)).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run the focused model test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/model/host-dashboard-model.test.ts
```

Expected: FAIL because `getHostUpcomingSessionTiming` is not exported.

- [ ] **Step 3: Implement the pure projection**

Add next to `formatHostSessionDday` in `host-dashboard-model.ts`:

```ts
export type HostUpcomingSessionTiming = {
  state: "upcoming" | "today" | "overdue" | "unknown";
  statusLabel: "예정" | "오늘" | "일정 지남" | "일정 확인";
  editLabel: "세션 편집" | "날짜 수정";
};

export function getHostUpcomingSessionTiming(
  sessionDate: string,
  now = new Date(),
): HostUpcomingSessionTiming {
  const dday = formatHostSessionDday(sessionDate, now);

  if (dday === null) {
    return { state: "unknown", statusLabel: "일정 확인", editLabel: "날짜 수정" };
  }
  if (dday === "D-day") {
    return { state: "today", statusLabel: "오늘", editLabel: "세션 편집" };
  }
  if (dday.startsWith("D-")) {
    return { state: "upcoming", statusLabel: "예정", editLabel: "세션 편집" };
  }
  return { state: "overdue", statusLabel: "일정 지남", editLabel: "날짜 수정" };
}
```

- [ ] **Step 4: Run the model test and verify GREEN**

Run the command from Step 2.

Expected: all tests in `host-dashboard-model.test.ts` pass.

- [ ] **Step 5: Commit the isolated model checkpoint when authorized**

```bash
git add front/features/host/model/host-dashboard-model.ts front/features/host/model/host-dashboard-model.test.ts
git commit -m "feat(host): classify upcoming session timing"
```

### Task 2: 현재 세션 카드의 DOM과 문구를 정돈

**Files:**
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`

**Interfaces:**
- Consumes: existing `CurrentSession`, `getHostDashboardSessionMetrics`, `phase`, `sessionEditHref`, `LinkComponent`.
- Produces: accessible article `현재 세션 요약`, `.rm-host-dashboard-mobile__session-head`, deduplicated `미응답 N명`, stable `세션 문서 열기` CTA.

- [ ] **Step 1: Add a complete current-session fixture to the co-located test**

After `type HostDashboardProps = Parameters<typeof HostDashboard>[0];`, add:

```ts
const currentSession = {
  currentSession: {
    sessionId: "session-9",
    sessionNumber: 9,
    title: "9회차 모임 · 돈의 심리학",
    bookTitle: "돈의 심리학 (당신은 왜 부자가 되지 못했는가)",
    bookAuthor: "모건 하우절",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-07-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    questionDeadlineAt: "2026-07-14T14:59:00Z",
    myRsvpStatus: "GOING" as const,
    myCheckin: { readingProgress: 100 },
    myQuestions: [],
    myOneLineReview: null,
    myLongReview: null,
    board: {
      questions: [{
        priority: 1,
        text: "돈을 대하는 태도는 어떻게 만들어지는가?",
        draftThought: null,
        authorName: "호스트",
        authorShortName: "호스트",
        avatarKey: "open-book-pencil",
      }],
      longReviews: [],
    },
    attendees: [
      {
        membershipId: "membership-host",
        avatarKey: "open-book-pencil",
        displayName: "호스트",
        accountName: "호스트",
        role: "HOST" as const,
        rsvpStatus: "GOING" as const,
        attendanceStatus: "UNKNOWN" as const,
      },
      {
        membershipId: "membership-member",
        avatarKey: "reading-lamp",
        displayName: "멤버",
        accountName: "멤버",
        role: "MEMBER" as const,
        rsvpStatus: "NO_RESPONSE" as const,
        attendanceStatus: "UNKNOWN" as const,
      },
    ],
  },
} satisfies NonNullable<HostDashboardProps["current"]>;
```

- [ ] **Step 2: Write the failing current-session structure test**

Add to `host-dashboard.test.tsx`:

```tsx
it("groups mobile current-session content and removes duplicate attendance copy", () => {
  const { container } = render(
    <HostDashboard
      data={{ ...dashboard, rsvpPending: 1 }}
      current={currentSession}
      hostSessions={hostSessions}
      actions={actions}
    />,
  );

  const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
  const card = within(mobile).getByRole("article", { name: "현재 세션 요약" });
  const head = card.querySelector(".rm-host-dashboard-mobile__session-head") as HTMLElement;
  const note = head.querySelector(".rm-host-dashboard-mobile__session-note") as HTMLElement;

  expect(head).toBeInTheDocument();
  expect(within(head).getByRole("group", { name: /No\.09/ })).not.toHaveTextContent("이번 세션");
  expect(note).toHaveTextContent("미응답 1명");
  expect(head).not.toHaveTextContent("참석 1명");
  expect(within(card).getByRole("link", { name: "세션 문서 열기" })).toHaveAttribute(
    "href",
    "/app/host/sessions/session-9/edit",
  );
});
```

Add an empty-state assertion in the same file so the existing fallback remains actionable:

```tsx
it("keeps the mobile current-session empty state actionable", () => {
  const { container } = render(
    <HostDashboard
      data={dashboard}
      current={{ currentSession: null }}
      hostSessions={hostSessions}
      actions={actions}
    />,
  );

  const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
  const card = within(mobile).getByRole("article", { name: "현재 세션 요약" });
  expect(within(card).getByText("열린 세션 없음")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "세션 문서 만들기" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused UI test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx
```

Expected: FAIL because the article has no accessible name, the wrapper is absent, `이번 세션` remains, attendance copy is duplicated, and the link still says `세션 문서 편집`.

- [ ] **Step 4: Implement the current-session content wrapper**

Replace the current mobile session article body in `mobile-host-dashboard.tsx` with this structure:

```tsx
<article
  className="m-card rm-host-dashboard-mobile__session-card"
  aria-label="현재 세션 요약"
>
  <div className="rm-host-dashboard-mobile__session-head">
    {session ? (
      <>
        <SessionTimingIdentity
          sessionNumber={session.sessionNumber}
          date={session.date}
        />
        <h3 className="h4 editorial">{session.bookTitle}</h3>
        <p className="tiny">
          {formatDateOnlyLabel(session.date)} · {session.startTime} · {session.locationLabel}
        </p>
        <dl className="rm-host-dashboard-mobile__session-metrics">
          {getHostDashboardSessionMetrics(session).map(([label, value]) => (
            <div key={label}>
              <dt className="eyebrow">{label}</dt>
              <dd className="ledger-number">{value}</dd>
            </div>
          ))}
        </dl>
        {noResponseCount > 0 ? (
          <p className="tiny rm-host-dashboard-mobile__session-note">
            미응답 <span className="ledger-number">{noResponseCount}</span>명
          </p>
        ) : null}
      </>
    ) : (
      <>
        <h3 className="h4 editorial">열린 세션 없음</h3>
        <p className="tiny">새 세션을 등록하면 RSVP와 질문 작성이 열립니다.</p>
      </>
    )}
  </div>
  <LinkComponent
    to={sessionEditHref}
    state={sessionEditState}
    className="btn btn-primary rm-host-dashboard-mobile__session-cta"
  >
    <span>{session ? "세션 문서 열기" : "세션 문서 만들기"}</span>
    <Icon name="arrow-right" size={14} />
  </LinkComponent>
</article>
```

Delete the now-unused `goingCount` declaration from `MobileHostDashboard` only if no other mobile block consumes it. Keep the top-level desktop `goingCount` in `host-dashboard.tsx` unchanged.

- [ ] **Step 5: Run the focused UI test and verify GREEN**

Run the command from Step 3.

Expected: all co-located host dashboard UI tests pass.

- [ ] **Step 6: Align the existing integration-style unit regression**

In `front/tests/unit/host-dashboard.test.tsx`, update only mobile expectations:

- Timing group: `No.07 · D-3 · 이번 세션` → `No.07 · D-3` for mobile only.
- Current action: `세션 문서 편집` → `세션 문서 열기` for mobile only; preserve every desktop `세션 문서 편집` assertion.
- Attendance helper: replace `참석 1명 · 미응답 1명` with the single `미응답 1명` helper and assert that the mobile card has no `참석 1명` paragraph.
- Encoded session-id test: keep the expected href unchanged while querying the mobile link by `세션 문서 열기`.

Run both host dashboard suites:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/host-dashboard.test.tsx \
  tests/unit/host-dashboard.test.tsx
```

Expected: both suites pass, and desktop assertions continue to use the desktop copy.

- [ ] **Step 7: Commit the isolated card checkpoint when authorized**

```bash
git add \
  front/features/host/ui/host-dashboard.test.tsx \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "fix(host): restore mobile current session structure"
```

### Task 3: 모바일 spacing과 3열 수치를 브라우저 측정으로 고정

**Files:**
- Modify: `front/tests/e2e/host-club-operations.spec.ts`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Consumes: Task 2 `.rm-host-dashboard-mobile__session-head` and `.rm-host-dashboard-mobile__session-metrics` DOM.
- Produces: 18/18/16px content inset, 3 equal metric columns, 48px CTA, no horizontal overflow at 320px.

- [ ] **Step 1: Write the failing 320px computed-layout test**

Add to `host-club-operations.spec.ts`:

```ts
test("host current-session card keeps balanced metrics at 320px", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await routeHostDashboardPublicSafe(page);
  await routeHostClubOperations(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/clubs/reading-sai/app/host");

  const mobile = page.locator("main.rm-host-dashboard-mobile");
  const card = mobile.getByRole("article", { name: "현재 세션 요약" });
  const head = card.locator(".rm-host-dashboard-mobile__session-head");
  const metrics = card.locator(".rm-host-dashboard-mobile__session-metrics");
  const cta = card.getByRole("link", { name: "세션 문서 열기" });

  await expect(head).toHaveCSS("padding-left", "18px");
  await expect(head).toHaveCSS("padding-right", "18px");
  await expect(head).toHaveCSS("padding-top", "18px");
  await expect(head).toHaveCSS("padding-bottom", "16px");
  await expect(metrics.locator(":scope > div")).toHaveCount(3);
  expect(await metrics.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(3);
  await expect(cta).toHaveCSS("height", "48px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
```

- [ ] **Step 2: Run the focused Playwright test and verify RED**

Run:

```bash
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts --grep "balanced metrics"
```

Expected: FAIL because the existing session wrapper bottom padding is 14px and the metric grid is 2 columns.

- [ ] **Step 3: Implement exact host mobile styles**

Update the host dashboard mobile block in `front/shared/styles/mobile.css`:

```css
.mobile-only .rm-host-dashboard-mobile__session-card {
  padding: 0;
  overflow: hidden;
}

.mobile-only .rm-host-dashboard-mobile__session-head {
  padding: 18px 18px 16px;
  border-bottom: 1px solid var(--line-soft);
}

.mobile-only .rm-host-dashboard-mobile__session-head h3 {
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.mobile-only .rm-host-dashboard-mobile__session-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line-soft);
}

.mobile-only .rm-host-dashboard-mobile__session-metrics > div {
  min-width: 0;
  padding: 0 10px;
  border-left: 1px solid var(--line-soft);
}

.mobile-only .rm-host-dashboard-mobile__session-metrics > div:first-child {
  padding-left: 0;
  border-left: 0;
}

.mobile-only .rm-host-dashboard-mobile__session-metrics > div:last-child {
  padding-right: 0;
}

.mobile-only .rm-host-dashboard-mobile__session-note {
  margin-top: 16px;
  color: var(--text-2);
}

.mobile-only .rm-host-dashboard-mobile__session-cta {
  width: 100%;
  height: 48px;
  justify-content: space-between;
  padding: 0 18px;
  border-radius: 0;
}
```

Do not add a second metric rule to `globals.css`; replace the existing mobile override in place.

- [ ] **Step 4: Run the 320px test and verify GREEN**

Run the command from Step 2.

Expected: PASS with three computed grid columns and no horizontal overflow.

- [ ] **Step 5: Run the co-located UI regression once more**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the isolated CSS checkpoint when authorized**

```bash
git add front/shared/styles/mobile.css front/tests/e2e/host-club-operations.spec.ts
git commit -m "style(host): balance mobile session metrics"
```

### Task 4: 운영 disclosure와 예정 세션 행동 위계를 명확화

**Files:**
- Create: `front/features/host/ui/dashboard/upcoming-session-row.test.tsx`
- Modify: `front/features/host/ui/dashboard/upcoming-session-row.tsx`
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/tests/e2e/host-club-operations.spec.ts`

**Interfaces:**
- Consumes: Task 1 `getHostUpcomingSessionTiming`, existing `UpcomingActionHandlers`, `HostDashboardLinkComponent`.
- Produces: one primary mobile action, explicit visibility copy, overdue schedule status, `확인할 운영 항목` disclosure, separate `예정 세션` and `운영 흐름` headings.

- [ ] **Step 1: Create failing upcoming-card interaction tests**

Create `upcoming-session-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostSessionListItem } from "@/features/host/model/host-view-types";
import type { HostDashboardLinkComponent, UpcomingActionHandlers } from "./types";
import { UpcomingSessionMobileCard } from "./upcoming-session-row";

const TestLink: HostDashboardLinkComponent = ({ to, state: _state, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

const actions = (canOpenSession: boolean): UpcomingActionHandlers => ({
  updateVisibility: vi.fn(async () => undefined),
  openSession: vi.fn(async () => undefined),
  isPending: () => false,
  isBusy: false,
  canOpenSession,
});

const draft = (date: string): HostSessionListItem => ({
  sessionId: "session-10",
  sessionNumber: 10,
  title: "10회차 모임",
  bookTitle: "다음 책",
  bookAuthor: "다음 저자",
  bookImageUrl: null,
  date,
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "DRAFT",
  visibility: "HOST_ONLY",
});

describe("UpcomingSessionMobileCard", () => {
  it("prioritizes date repair for an overdue draft", () => {
    const { container } = render(
      <UpcomingSessionMobileCard
        session={draft("2026-05-19")}
        actions={actions(true)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.getByText("일정 지남")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "날짜 수정 · 다음 책" })).toHaveClass("btn-primary");
    expect(screen.getByRole("button", { name: "멤버 공개로 변경 · 다음 책" })).not.toHaveClass("btn-primary");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("keeps start primary for a future draft when no current session is open", () => {
    const { container } = render(
      <UpcomingSessionMobileCard
        session={draft("2026-08-20")}
        actions={actions(true)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.getByRole("button", { name: "현재로 시작 · 다음 책" })).toHaveClass("btn-primary");
    expect(screen.getByRole("link", { name: "세션 편집 · 다음 책" })).not.toHaveClass("btn-primary");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("keeps edit primary when another current session blocks start", () => {
    const { container } = render(
      <UpcomingSessionMobileCard
        session={draft("2026-08-20")}
        actions={actions(false)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.queryByRole("button", { name: /현재로 시작/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세션 편집 · 다음 책" })).toHaveClass("btn-primary");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Add failing mobile dashboard disclosure assertions**

Extend the mobile hierarchy test in `host-dashboard.test.tsx`:

```tsx
const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
expect(within(mobile).getByText("확인할 운영 항목")).toBeInTheDocument();
expect(within(mobile).getByText("예정 세션", { exact: true })).toBeInTheDocument();
expect(within(mobile).getByRole("heading", { name: "운영 흐름", level: 3 })).toBeInTheDocument();
expect(within(mobile).queryByText("다음 세션과 운영 흐름")).not.toBeInTheDocument();
```

Add a separate non-zero ledger test:

```tsx
it("summarizes the highest mobile ledger item in the disclosure", () => {
  const { container } = render(
    <HostDashboard
      data={{ ...dashboard, rsvpPending: 4, checkinMissing: 2 }}
      current={currentSession}
      hostSessions={hostSessions}
      actions={actions}
    />,
  );

  const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
  const disclosure = within(mobile).getByText("확인할 운영 항목").closest("details") as HTMLElement;
  expect(within(disclosure).getByText("6건")).toBeInTheDocument();
  expect(within(disclosure).getByText(/RSVP.*4건/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run both focused test files and verify RED**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/dashboard/upcoming-session-row.test.tsx \
  features/host/ui/host-dashboard.test.tsx
```

Expected: FAIL because the component has no `now` prop, visible action labels are ambiguous, multiple primary choices are not projected, and mobile headings/disclosure still use the old copy.

- [ ] **Step 4: Implement upcoming card action projection**

Update `UpcomingSessionMobileCard` to accept an optional clock and derive labels:

```ts
import {
  getHostUpcomingSessionTiming,
  hostSessionEditHref,
} from "@/features/host/model/host-dashboard-model";

export function UpcomingSessionMobileCard({
  session,
  actions,
  LinkComponent,
  now,
}: {
  session: HostSessionListItem;
  actions: UpcomingActionHandlers;
  LinkComponent: HostDashboardLinkComponent;
  now?: Date;
}) {
  const timing = getHostUpcomingSessionTiming(session.date, now);
  const isMemberVisible = session.visibility !== "HOST_ONLY";
  const visibilityPending = actions.isPending(session.sessionId, "visibility");
  const openPending = actions.isPending(session.sessionId, "open");
  const controlsDisabled = actions.isBusy;
  const currentVisibilityLabel = upcomingVisibilityStatusLabel(session.visibility);
  const showOpenAction = actions.canOpenSession || openPending;
  const editIsPrimary = timing.state === "overdue" || timing.state === "unknown" || !showOpenAction;
  const openLabel = openPending ? "세션을 시작하는 중" : "현재로 시작";
  const visibilityActionLabel = visibilityPending
    ? "공개 범위 저장 중"
    : isMemberVisible
      ? "비공개로 변경"
      : "멤버 공개로 변경";
```

Replace the plain date row with the visible timing state:

```tsx
<div className="tiny rm-host-upcoming-mobile__date-row">
  <span>{formatDateOnlyLabel(session.date)}</span>
  <span className={`badge rm-host-upcoming-mobile__timing rm-host-upcoming-mobile__timing--${timing.state}`}>
    {timing.statusLabel}
  </span>
</div>
```

Replace the mobile action wrapper with this primary-first order:

```tsx
<div className="rm-host-upcoming-mobile__actions">
  {editIsPrimary ? (
    <LinkComponent
      className="btn btn-primary btn-sm"
      to={hostSessionEditHref(session.sessionId)}
      aria-label={`${timing.editLabel} · ${session.bookTitle}`}
    >
      {timing.editLabel}
    </LinkComponent>
  ) : (
    <button
      className="btn btn-primary btn-sm"
      type="button"
      aria-label={`${openLabel} · ${session.bookTitle}`}
      disabled={controlsDisabled}
      onClick={() => actions.openSession(session.sessionId)}
    >
      {openLabel}
    </button>
  )}
  {!editIsPrimary ? (
    <LinkComponent
      className="btn btn-ghost btn-sm"
      to={hostSessionEditHref(session.sessionId)}
      aria-label={`${timing.editLabel} · ${session.bookTitle}`}
    >
      {timing.editLabel}
    </LinkComponent>
  ) : showOpenAction ? (
    <button
      className="btn btn-ghost btn-sm"
      type="button"
      aria-label={`${openLabel} · ${session.bookTitle}`}
      disabled={controlsDisabled}
      onClick={() => actions.openSession(session.sessionId)}
    >
      {openLabel}
    </button>
  ) : null}
  <button
    className="btn btn-ghost btn-sm"
    type="button"
    disabled={controlsDisabled}
    aria-label={`${visibilityActionLabel} · ${session.bookTitle}`}
    onClick={() => actions.updateVisibility(session.sessionId, isMemberVisible ? "HOST_ONLY" : "MEMBER")}
  >
    {visibilityActionLabel}
  </button>
</div>
```

Keep desktop `UpcomingSessionRow` behavior unchanged in this task.

Remove the now-unused `UPCOMING_MOBILE_ACTION_STYLE` constant and the `CSSProperties` type import. Replace the old `visibilityActionLabel` and `visibilityActionAriaLabel` declarations inside `UpcomingSessionMobileCard`; do not leave two competing label calculations.

- [ ] **Step 5: Implement disclosure summary and split flow headings**

In `MobileHostDashboard`, derive:

```ts
const ledgerTotal = ledgerMetrics.reduce((sum, metric) => sum + metric.value, 0);
const firstLedgerItem = ledgerMetrics.find((metric) => metric.value > 0);
const ledgerSummary = firstLedgerItem
  ? `${firstLedgerItem.label} ${firstLedgerItem.value}건 · ${firstLedgerItem.stateLabel}`
  : "확인할 항목 없음";
```

Replace the disclosure summary with:

```tsx
<summary>
  <span>
    <strong>확인할 운영 항목</strong>
    <small>{ledgerSummary}</small>
  </span>
  <span className="badge rm-host-mobile-disclosure__count">{ledgerTotal}건</span>
</summary>
```

Change the flow heading block to:

```tsx
<div className="m-eyebrow-row">
  <h2 id="host-mobile-flow-title">예정 세션</h2>
  <LinkComponent to={newSessionHref} className="tiny">
    세션 문서 만들기
  </LinkComponent>
</div>
```

Immediately before `.rm-host-mobile-flow__steps`, add:

```tsx
<h3 className="rm-host-mobile-flow__subheading">운영 흐름</h3>
```

- [ ] **Step 6: Add exact disclosure and action styles**

Append within the existing host mobile CSS block:

```css
.mobile-only.rm-host-dashboard-mobile > .m-sec + .m-sec {
  /* Inherited 20px section padding + 8px = 28px visual rhythm. */
  margin-top: 8px;
}

.mobile-only .rm-host-mobile-disclosure > summary {
  position: relative;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  list-style: none;
}

.mobile-only .rm-host-mobile-disclosure > summary::-webkit-details-marker {
  display: none;
}

.mobile-only .rm-host-mobile-disclosure > summary::after {
  content: "+";
  flex: 0 0 auto;
  color: var(--text-3);
  font-family: var(--f-mono);
}

.mobile-only .rm-host-mobile-disclosure[open] > summary::after {
  content: "−";
}

.mobile-only .rm-host-mobile-disclosure__count {
  margin-left: auto;
}

.mobile-only .rm-host-mobile-flow__subheading {
  margin: 24px 0 0;
  font-size: 14px;
}

.mobile-only .rm-host-upcoming-mobile__date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.mobile-only .rm-host-upcoming-mobile__timing--overdue,
.mobile-only .rm-host-upcoming-mobile__timing--unknown {
  color: var(--danger);
}

.mobile-only .rm-host-upcoming-mobile__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.mobile-only .rm-host-upcoming-mobile__actions .btn {
  flex: 1 1 0;
  min-height: 44px;
  white-space: normal;
}

.mobile-only .rm-host-upcoming-mobile__actions .btn-primary {
  flex-basis: 100%;
}
```

Apply `rm-host-upcoming-mobile__actions` to the mobile action wrapper and remove `UPCOMING_MOBILE_ACTION_STYLE`; action sizing belongs in CSS.

- [ ] **Step 7: Run focused tests and verify GREEN**

Before running, update `front/tests/unit/host-dashboard.test.tsx` mobile-only expectations:

- Baseline order: `처리 대기 원장` → `확인할 운영 항목`; `다음 세션과 운영 흐름` → `예정 세션`, followed by `운영 흐름`.
- Collapsed ledger selector: `처리 대기 원장` → `확인할 운영 항목`.
- Upcoming visibility buttons: preserve regex-based behavior tests. Keep desktop exact copy as `공개`/`비공개`, and update only mobile exact-copy checks to `멤버 공개로 변경`/`비공개로 변경`.

Then run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/dashboard/upcoming-session-row.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  tests/unit/host-dashboard.test.tsx
```

Expected: all three files pass. Confirm that each upcoming mobile card contains exactly one `.btn-primary` and desktop row expectations remain unchanged.

- [ ] **Step 8: Update the mobile E2E helper for the approved labels**

In `expectHostMobilePriorityLedgerPublicSafe`, replace the old ledger assertion and add the split headings:

```ts
await expect(mobileDashboard.getByText("확인할 운영 항목")).toBeVisible();
await expect(mobileDashboard.getByRole("heading", { name: "예정 세션", exact: true })).toBeVisible();
await expect(mobileDashboard.getByRole("heading", { name: "운영 흐름", exact: true })).toBeVisible();
```

Delete the assertion for `처리 대기 원장`. Keep `운영 도구` and public-safety sentinel assertions unchanged.

- [ ] **Step 9: Run the focused Playwright host file**

```bash
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts
```

Expected: all tests in the host operations file pass.

- [ ] **Step 10: Commit the interaction checkpoint when authorized**

```bash
git add \
  front/features/host/ui/dashboard/upcoming-session-row.test.tsx \
  front/features/host/ui/dashboard/upcoming-session-row.tsx \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/host-dashboard.test.tsx \
  front/shared/styles/mobile.css \
  front/tests/e2e/host-club-operations.spec.ts \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "feat(host): clarify mobile operating actions"
```

### Task 5: 반응형 증거, 접근성, 문서, 전체 frontend gate

**Files:**
- Modify: `front/tests/e2e/host-club-operations.spec.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–4 final UI and public-safe host fixtures.
- Produces: 320/390/768/1280 evidence, keyboard/focus checks, Unreleased note, canonical frontend verification.

- [ ] **Step 1: Extend the host visual-evidence test to four viewports**

Replace the two hard-coded screenshot blocks with:

```ts
for (const viewport of [
  { name: "mobile-320", width: 320, height: 844 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 720 },
]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto("/clubs/reading-sai/app/host");

  if (viewport.width <= 768) {
    await expectHostMobilePriorityLedgerPublicSafe(page);
    await expect(page.getByRole("article", { name: "현재 세션 요약" })).toBeVisible();
  } else {
    await expectHostOperatingSignalCardPublicSafe(page);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const screenshot = await page.screenshot({
    path: testInfo.outputPath(`host-dashboard-${viewport.name}.png`),
    fullPage: true,
  });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);
}
```

- [ ] **Step 2: Add keyboard and touch-target assertions**

Immediately after the mobile/desktop assertion branch and still inside the viewport loop, add:

```ts
if (viewport.name === "mobile-390") {
  const disclosure = page.getByText("확인할 운영 항목").locator("xpath=ancestor::details");
  const summary = disclosure.locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");

  const currentAction = page.getByRole("link", { name: "세션 문서 열기" });
  const actionBox = await currentAction.boundingBox();
  expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  for (const action of [
    page.getByRole("button", { name: /현재로 시작|멤버 공개로 변경|비공개로 변경/ }).first(),
    page.getByRole("link", { name: /세션 편집|날짜 수정/ }).first(),
  ]) {
    await action.focus();
    await expect(action).toBeFocused();
    const box = await action.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}
```

Do not replace the semantic ancestor selector with layout-position traversal.

- [ ] **Step 3: Run the complete focused browser lane**

```bash
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts
```

Expected: all host operations tests pass and screenshots exist in Playwright output for all four viewports.

- [ ] **Step 4: Manually inspect all four screenshots**

Verify each output image and record pass/fail for:

- Current session title has 18px inset and wraps without clipping.
- Three metrics stay on one row at 320px and 390px.
- Only one visually primary action exists per upcoming card.
- Disclosure count, helper, and plus/minus affordance are visible.
- `예정 세션` and `운영 흐름` scan as separate jobs.
- Bottom navigation does not obscure actions.
- Tablet and desktop keep their intended order and width.

If a screenshot fails, return to the owning task. Do not compensate with a broad global CSS override.

- [ ] **Step 5: Update CHANGELOG Unreleased**

Add one Korean-first bullet under `## Unreleased` → `### Fixed`:

```markdown
- 호스트 모바일 대시보드의 현재 세션 여백과 3열 운영 수치를 복구하고, 처리 항목·예정 세션 행동을 더 명확한 단일 primary action 흐름으로 정돈했습니다.
```

- [ ] **Step 6: Run focused unit regressions**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/model/host-dashboard-model.test.ts \
  features/host/ui/dashboard/upcoming-session-row.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  tests/unit/host-dashboard.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 7: Run canonical frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: lint, full Vitest suite, and production build pass.

- [ ] **Step 8: Run final diff and public-safety checks**

```bash
git diff --check -- \
  CHANGELOG.md \
  front/features/host/model/host-dashboard-model.ts \
  front/features/host/model/host-dashboard-model.test.ts \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/dashboard/upcoming-session-row.tsx \
  front/features/host/ui/host-dashboard.test.tsx \
  front/shared/styles/mobile.css \
  front/tests/e2e/host-club-operations.spec.ts \
  front/tests/unit/host-dashboard.test.tsx
git diff --no-index --check /dev/null docs/superpowers/specs/2026-08-01-readmates-host-dashboard-mobile-refinement-design.md || test $? -eq 1
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-readmates-host-dashboard-mobile-refinement.md || test $? -eq 1
git diff --no-index --check /dev/null front/features/host/ui/dashboard/upcoming-session-row.test.tsx || test $? -eq 1
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  docs/superpowers/specs/2026-08-01-readmates-host-dashboard-mobile-refinement-design.md \
  docs/superpowers/plans/2026-08-01-readmates-host-dashboard-mobile-refinement.md \
  CHANGELOG.md
```

Expected: all scoped whitespace checks succeed. Each `git diff --no-index` command returns diff status 1 but no whitespace error, and the safety scan finds no private-looking value introduced by this work.

- [ ] **Step 9: Review the final diff against the approved spec**

Confirm every acceptance criterion from spec §14 has code or test evidence. Confirm no server/BFF/API/DB file changed and no actual notification or provider action ran.

- [ ] **Step 10: Commit the verified frontend slice when authorized**

```bash
git add \
  CHANGELOG.md \
  docs/superpowers/specs/2026-08-01-readmates-host-dashboard-mobile-refinement-design.md \
  docs/superpowers/plans/2026-08-01-readmates-host-dashboard-mobile-refinement.md \
  front/features/host/model/host-dashboard-model.ts \
  front/features/host/model/host-dashboard-model.test.ts \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/dashboard/upcoming-session-row.tsx \
  front/features/host/ui/dashboard/upcoming-session-row.test.tsx \
  front/features/host/ui/host-dashboard.test.tsx \
  front/shared/styles/mobile.css \
  front/tests/e2e/host-club-operations.spec.ts \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "feat(host): refine mobile dashboard operations"
```

Do not push, create a PR, deploy, or tag unless separately authorized.
