# ReadMates Standalone Front UI Data Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `design/standalone` and the real Next.js `front` UI back into alignment while making member, host, and guest screens robust to empty or partial local DB data.

**Architecture:** First fix the standalone design source so `index.html` and `mobile.html` remain the visual reference. Then add small shared display helpers in `front`, apply them to member/current-session/host/public components, and lock behavior with unit tests plus browser verification. Avoid server/API contract changes unless a verified front blocker appears.

**Tech Stack:** React, Next.js App Router, TypeScript, Vitest, Testing Library, standalone React/Babel design exports, Playwright CLI for browser verification.

---

## File Structure

Design source:

- Modify `design/src/data.js`: add stable prototype date/session labels so mobile and desktop do not mix browser current date with seeded session data.
- Modify `design/src/mobile/shell.jsx`: move the standalone role preview control out of the header region and tag it with a stable class.
- Modify `design/styles/mobile.css`: add `.m-preview-role-dock`, responsive FAB/dock spacing, and mobile-safe text/card rules.
- Modify `design/src/mobile/pages-home.jsx`: stop using `new Date()` for the greeting date; read from design data.
- Modify `design/src/mobile/pages-public.jsx`: align guest mobile copy and question policy with the current product rules.
- Modify `design/src/mobile/pages-host.jsx`: reduce duplicate host edit actions and add empty-state copy for editor tabs.
- Modify `design/src/nav.jsx`: align host desktop navigation preview with the real front model or make the standalone-only difference explicit.
- Modify `design/standalone/verify.mjs`: assert that the generated mobile export contains the new preview dock and no old top-fixed role switcher.
- Regenerate `design/standalone/index.html` and `design/standalone/mobile.html`.

Front shared layer:

- Create `front/shared/ui/readmates-display.ts`: pure display helpers for safe text, dates, RSVP labels, attendance labels, counts, and host alert badge labels.
- Create `front/tests/unit/readmates-display.test.ts`: tests for helper behavior with valid, empty, and malformed values.
- Modify `front/shared/styles/mobile.css`: copy the standalone mobile collision fixes that apply to the real app.
- Modify `front/app/globals.css`: add component classes only if inline style duplication becomes harmful; keep broad layout rules here.

Front feature components:

- Modify `front/features/member-home/components/prep-card.tsx`: use display helpers and richer no-session/partial-data states.
- Modify `front/features/member-home/components/member-home.tsx`: hide or replace roster/recent/quick sections when data is empty or route is real.
- Modify `front/features/current-session/components/current-session.tsx`: remove hardcoded "6회차/7회차" empty text, use helper labels, keep board empty states per tab.
- Modify `front/features/host/components/host-dashboard.tsx`: distinguish "대기 없음" from "완료" when no current session exists; add empty member-status state.
- Modify `front/features/host/components/host-session-editor.tsx`: keep report controls disabled with explicit copy, improve mobile edit spacing, and use empty attendance/report states.
- Modify `front/features/public/components/public-home.tsx`: harden public empty states and stats display.
- Modify `front/features/public/components/public-club.tsx`: disable/retarget public-record CTA when no record exists.
- Modify `front/features/public/components/public-session.tsx`: keep existing detail empty sections but use display helpers for defensive text.

Tests:

- Modify `front/tests/unit/member-home.test.tsx`: add current-session-null and empty-note-feed coverage.
- Modify `front/tests/unit/current-session.test.tsx`: update no-session copy and partial-board expectations.
- Modify `front/tests/unit/host-dashboard.test.tsx`: add no-current-session counts and empty attendee state coverage.
- Modify `front/tests/unit/host-session-editor.test.tsx`: add empty attendees/reports coverage for an existing session.
- Modify `front/tests/unit/public-home.test.tsx`: add empty public records coverage.
- Modify `front/tests/unit/responsive-navigation.test.tsx` only if helper/style changes alter accessible labels.
- Modify `front/tests/e2e/responsive-navigation-chrome.spec.ts` only if final browser checks reveal a real chrome regression.

---

### Task 1: Standalone Mobile Shell Collision Fix

**Files:**
- Modify: `design/src/mobile/shell.jsx`
- Modify: `design/styles/mobile.css`
- Modify: `design/standalone/verify.mjs`
- Generated: `design/standalone/mobile.html`

- [x] **Step 1: Add failing standalone verification checks**

In `design/standalone/verify.mjs`, after the existing `ReactDOM.createRoot` check, add mobile-only checks:

```js
  if (page.file === 'mobile.html') {
    if (!html.includes('m-preview-role-dock')) {
      failures.push(`${page.file}: missing preview role dock`);
    }

    if (/position:\s*'fixed'[\s\S]{0,180}top:\s*10[\s\S]{0,180}m-role-bar/.test(html)) {
      failures.push(`${page.file}: role switcher still fixed at the top of the mobile header`);
    }
  }
```

- [x] **Step 2: Run verification to confirm it fails**

Run:

```sh
node design/standalone/verify.mjs
```

Expected: FAIL with `mobile.html: missing preview role dock`.

- [x] **Step 3: Move the role preview control into a dock**

In `design/src/mobile/shell.jsx`, replace the inline fixed role switcher wrapper:

```jsx
      <div style={{
        position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50,
      }}>
        <div className="m-role-bar">
```

with:

```jsx
      <div className={'m-preview-role-dock' + (role === 'guest' ? ' is-guest' : '')}>
        <div className="m-role-bar" aria-label="Preview role switcher">
```

Keep the existing three role buttons and click handlers unchanged.

- [x] **Step 4: Add dock CSS and collision rules**

In `design/styles/mobile.css`, after the existing `.m-role-btn[aria-selected="true"]` rule, add:

```css
.m-preview-role-dock {
  position: fixed;
  left: 50%;
  bottom: calc(var(--m-nav-h) + 12px + var(--m-safe-bottom));
  transform: translateX(-50%);
  z-index: 46;
  max-width: calc(100vw - 36px);
  pointer-events: none;
}

.m-preview-role-dock.is-guest {
  bottom: calc(16px + var(--m-safe-bottom));
}

.m-preview-role-dock .m-role-bar {
  box-shadow: 0 6px 18px -12px oklch(0 0 0 / 0.35);
  pointer-events: auto;
}

.m-preview-role-dock + .m-sheet-scrim {
  pointer-events: none;
}
```

If the FAB and dock overlap in host/member screens, update the host/member FAB condition in `design/src/mobile/shell.jsx` so the dock remains visible and the duplicate FAB is hidden only for the standalone preview:

```jsx
      {role === 'host' && !subRoute && tab === 'home' && tweak.showFab && false && (
```

Do not apply that `false` guard in `front`; it is standalone preview-only.

- [x] **Step 5: Rebuild standalone exports**

Run:

```sh
node design/standalone/build.mjs
```

Expected: `Wrote standalone exports under design/standalone`.

- [x] **Step 6: Run standalone verification**

Run:

```sh
node design/standalone/verify.mjs
```

Expected: `standalone verification passed`.

- [x] **Step 7: Commit**

```sh
git add design/src/mobile/shell.jsx design/styles/mobile.css design/standalone/verify.mjs design/standalone/mobile.html
git commit -m "fix: separate mobile standalone role preview"
```

Status note: `design/` is ignored by this repo's current `.gitignore`, so the standalone source/export changes were regenerated and verified on disk but were not committed.

---

### Task 2: Standalone Data Consistency And Responsive Design Pass

**Files:**
- Modify: `design/src/data.js`
- Modify: `design/src/mobile/pages-home.jsx`
- Modify: `design/src/mobile/pages-public.jsx`
- Modify: `design/src/mobile/pages-host.jsx`
- Modify: `design/src/nav.jsx`
- Modify: `design/styles/tokens.css`
- Modify: `design/styles/mobile.css`
- Generated: `design/standalone/index.html`
- Generated: `design/standalone/mobile.html`

- [x] **Step 1: Add verification checks for stable prototype date and current question policy**

In `design/standalone/verify.mjs`, inside the `mobile.html` block from Task 1, add:

```js
    if (html.includes('new Date().toLocaleDateString')) {
      failures.push(`${page.file}: mobile export still uses browser current date in the member home`);
    }

    if (!html.includes('질문은 최대 5개')) {
      failures.push(`${page.file}: missing current five-question policy copy`);
    }
```

- [x] **Step 2: Run verification to confirm it fails**

Run:

```sh
node design/standalone/verify.mjs
```

Expected: FAIL with at least one of:

- `mobile.html: mobile export still uses browser current date in the member home`
- `mobile.html: missing current five-question policy copy`

- [x] **Step 3: Add stable prototype metadata**

In `design/src/data.js`, before `const CLUB = {`, add:

```js
const PROTOTYPE = {
  todayLabel: '2026.04.12 · 일요일',
  todayMobileLabel: '4월 12일 (일)',
  questionLimit: 5,
};
```

At the bottom global export block, include `PROTOTYPE` in the existing `Object.assign` call:

```js
Object.assign(window, {
  PROTOTYPE,
  CLUB, MEMBER, BOOKS, SESSIONS, MEMBERS,
  QUESTIONS, CHECKINS, HIGHLIGHTS, ONE_LINERS, REVIEWS, HOST_ALERTS,
});
```

- [x] **Step 4: Replace browser-date member greeting**

In `design/src/mobile/pages-home.jsx`, replace:

```jsx
        new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })),
```

with:

```jsx
        (window.PROTOTYPE && window.PROTOTYPE.todayMobileLabel) || '4월 12일 (일)'),
```

Update the file header global comment to include `PROTOTYPE` if present:

```js
/* global window, React, SESSIONS, MEMBERS, QUESTIONS, CHECKINS, HIGHLIGHTS, MEMBER, PROTOTYPE, Icon, Avatar, BookMini, Sheet */
```

- [x] **Step 5: Align mobile copy with five-question policy**

In `design/src/mobile/pages-public.jsx`, change the rhythm copy from:

```js
{ w: '모임 전날까지', t: '질문 2~3개를 우선순위로 정리' },
```

to:

```js
{ w: '모임 전날까지', t: '질문은 최대 5개까지 우선순위로 정리' },
```

In `design/src/mobile/pages-home.jsx`, change the question chip hint logic from a `/3` display to a `/5` display:

```js
{ id: 'q', label: '질문', done: s.me.questions >= 2, hint: s.me.questions + '/5' },
```

- [x] **Step 6: Add responsive desktop guardrails**

In `design/styles/tokens.css`, after the existing `@media (max-width: 1024px)` block, add:

```css
@media (max-width: 840px) {
  .topnav-inner {
    min-height: 64px;
    flex-wrap: wrap;
    align-items: center;
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .nav-links {
    order: 3;
    width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .display {
    font-size: 44px;
  }
}
```

- [x] **Step 7: Rebuild and verify standalone exports**

Run:

```sh
node design/standalone/build.mjs
node design/standalone/verify.mjs
```

Expected:

```text
Wrote standalone exports under design/standalone
standalone verification passed
```

- [x] **Step 8: Browser-check standalone viewports**

Run a static server:

```sh
python3 -m http.server 4177 -d /Users/kws/source/persnal/ReadMates/design/standalone
```

Use Playwright CLI or a visible browser to check:

- `http://127.0.0.1:4177/mobile.html` at 390x844
- `http://127.0.0.1:4177/mobile.html` at 430x932
- `http://127.0.0.1:4177/index.html` at 1440x1000
- `http://127.0.0.1:4177/index.html` at 1024x900
- `http://127.0.0.1:4177/index.html` at 768x900

Expected:

- Role preview dock does not cover the mobile header.
- Guest/member/host first screens show coherent titles and tabs.
- Desktop nav wraps cleanly at 768 without overlapping action controls.

- [x] **Step 9: Commit**

```sh
git add design/src/data.js design/src/mobile/pages-home.jsx design/src/mobile/pages-public.jsx design/src/mobile/pages-host.jsx design/src/nav.jsx design/styles/tokens.css design/styles/mobile.css design/standalone/index.html design/standalone/mobile.html design/standalone/verify.mjs
git commit -m "fix: align standalone role screens and data labels"
```

Status note: `design/` is ignored by this repo's current `.gitignore`, so the standalone source/export changes were regenerated, browser-checked, and verified on disk but were not committed.

---

### Task 3: Shared Front Display Helpers

**Files:**
- Create: `front/shared/ui/readmates-display.ts`
- Create: `front/tests/unit/readmates-display.test.ts`

- [x] **Step 1: Write failing helper tests**

Create `front/tests/unit/readmates-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  attendanceLabel,
  displayText,
  formatDateLabel,
  formatDeadlineLabel,
  hostAlertStateLabel,
  nonNegativeCount,
  rsvpLabel,
} from "@/shared/ui/readmates-display";

describe("readmates display helpers", () => {
  it("normalizes empty display text", () => {
    expect(displayText("테스트", "정보 없음")).toBe("테스트");
    expect(displayText("", "정보 없음")).toBe("정보 없음");
    expect(displayText(null, "정보 없음")).toBe("정보 없음");
    expect(displayText(undefined, "정보 없음")).toBe("정보 없음");
  });

  it("formats dates defensively", () => {
    expect(formatDateLabel("2026-05-20")).toBe("2026.05.20");
    expect(formatDateLabel("bad-date")).toBe("bad-date");
    expect(formatDateLabel("", "미정")).toBe("미정");
  });

  it("formats deadline timestamps and preserves invalid values", () => {
    expect(formatDeadlineLabel("2026-05-19T14:59:00Z")).toMatch(/\d{2}\.\d{2} \d{2}:\d{2}/);
    expect(formatDeadlineLabel("마감 미정")).toBe("마감 미정");
    expect(formatDeadlineLabel("", "마감 미정")).toBe("마감 미정");
  });

  it("labels RSVP and attendance statuses", () => {
    expect(rsvpLabel("GOING")).toBe("참석");
    expect(rsvpLabel("MAYBE")).toBe("미정");
    expect(rsvpLabel("DECLINED")).toBe("불참");
    expect(rsvpLabel("NO_RESPONSE")).toBe("미응답");
    expect(attendanceLabel("ATTENDED")).toBe("출석");
    expect(attendanceLabel("ABSENT")).toBe("불참");
    expect(attendanceLabel("UNKNOWN")).toBe("출석 확인 전");
  });

  it("normalizes counts and host alert labels", () => {
    expect(nonNegativeCount(3)).toBe(3);
    expect(nonNegativeCount(-1)).toBe(0);
    expect(nonNegativeCount(undefined)).toBe(0);
    expect(hostAlertStateLabel(0, false)).toBe("대기 없음");
    expect(hostAlertStateLabel(0, true)).toBe("완료");
    expect(hostAlertStateLabel(2, true)).toBe("할 일");
  });
});
```

- [x] **Step 2: Run helper tests to verify they fail**

Run:

```sh
pnpm --dir front test -- readmates-display.test.ts
```

Expected: FAIL because `front/shared/ui/readmates-display.ts` does not exist.

- [x] **Step 3: Implement helpers**

Create `front/shared/ui/readmates-display.ts`:

```ts
import type { AttendanceStatus, RsvpStatus } from "@/shared/api/readmates";

export function displayText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function formatDateLabel(value: string | null | undefined, fallback = "미정") {
  const text = displayText(value, fallback);
  if (text === fallback) {
    return fallback;
  }

  const [year, month, day] = text.split("-");
  if (!year || !month || !day) {
    return text;
  }

  return `${year}.${month}.${day}`;
}

export function formatDeadlineLabel(value: string | null | undefined, fallback = "마감 미정") {
  const text = displayText(value, fallback);
  if (text === fallback) {
    return fallback;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(
    date.getHours(),
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function rsvpLabel(status: RsvpStatus | string | null | undefined) {
  if (status === "GOING") {
    return "참석";
  }

  if (status === "MAYBE") {
    return "미정";
  }

  if (status === "DECLINED") {
    return "불참";
  }

  return "미응답";
}

export function attendanceLabel(status: AttendanceStatus | string | null | undefined) {
  if (status === "ATTENDED") {
    return "출석";
  }

  if (status === "ABSENT") {
    return "불참";
  }

  return "출석 확인 전";
}

export function nonNegativeCount(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return 0;
  }

  return value;
}

export function hostAlertStateLabel(value: number | null | undefined, hasCurrentSession: boolean) {
  if (nonNegativeCount(value) > 0) {
    return "할 일";
  }

  return hasCurrentSession ? "완료" : "대기 없음";
}
```

- [x] **Step 4: Run helper tests**

Run:

```sh
pnpm --dir front test -- readmates-display.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```sh
git add front/shared/ui/readmates-display.ts front/tests/unit/readmates-display.test.ts
git commit -m "test: add readmates display helpers"
```

---

### Task 4: Member Home And Current Session Real-Data Fallbacks

**Files:**
- Modify: `front/features/member-home/components/prep-card.tsx`
- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`

- [x] **Step 1: Add failing member home fallback tests**

Append these tests to `front/tests/unit/member-home.test.tsx`:

```tsx
  it("shows a practical empty state when there is no current session", () => {
    render(<MemberHome auth={auth} current={{ currentSession: null }} noteFeedItems={[]} />);

    expect(screen.getByText("아직 열린 세션이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("호스트가 다음 세션을 등록하면 RSVP와 질문 작성이 열립니다.")).toBeInTheDocument();
    expect(screen.getByText("아직 표시할 클럽 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("RSVP · 참석 명단")).not.toBeInTheDocument();
    expect(screen.getByText("참석 현황 준비 중")).toBeInTheDocument();
  });

  it("shows host creation CTA when a host has no current session", () => {
    render(<MemberHome auth={{ ...auth, role: "HOST" }} current={{ currentSession: null }} noteFeedItems={[]} />);

    expect(screen.getByRole("link", { name: "새 세션 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
  });
```

- [x] **Step 2: Add failing current session no-session copy test**

In `front/tests/unit/current-session.test.tsx`, replace the no-session copy expectation with:

```tsx
    expect(
      screen.getByText("호스트가 새 세션을 등록하면 RSVP, 읽기 체크인, 질문 작성이 열립니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/6회차는 종료되었습니다/)).not.toBeInTheDocument();
```

- [x] **Step 3: Run focused tests to verify failures**

Run:

```sh
pnpm --dir front test -- member-home.test.tsx current-session.test.tsx
```

Expected: FAIL because the new host CTA, roster empty state, and generic no-session current-session copy are not all implemented.

- [x] **Step 4: Update PrepCard no-session state**

In `front/features/member-home/components/prep-card.tsx`, import `displayText`, `formatDateLabel`, `formatDeadlineLabel`, and `rsvpLabel`:

```ts
import { displayText, formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";
```

Remove local `formatDate`, `formatDeadline`, and `rsvpLabel`.

Change `PrepCard` props:

```ts
export function PrepCard({ session, isHost = false }: { session: CurrentSession | null; isHost?: boolean }) {
```

In the `session === null` branch, replace the article body with:

```tsx
      <article className="surface" style={{ padding: "36px", position: "relative" }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          Next gathering
        </p>
        <h2 className="editorial" style={{ fontSize: "30px", lineHeight: 1.2, margin: "12px 0 6px" }}>
          아직 열린 세션이 없습니다
        </h2>
        <p className="body" style={{ color: "var(--text-2)", margin: 0 }}>
          호스트가 다음 세션을 등록하면 RSVP와 질문 작성이 열립니다.
        </p>
        {isHost ? (
          <Link href="/app/host/sessions/new" className="btn btn-primary" style={{ marginTop: "20px" }}>
            새 세션 만들기
          </Link>
        ) : null}
      </article>
```

In session rendering, use helpers:

```tsx
{displayText(session.bookTitle, "책 정보 없음")}
{displayText(session.bookAuthor, "저자 정보 없음")}
{formatDateLabel(session.date)}
{formatDeadlineLabel(session.questionDeadlineAt)}
```

Keep the question hint as `${session.myQuestions.length}/5`.

- [x] **Step 5: Pass host role into PrepCard**

In `front/features/member-home/components/member-home.tsx`, change:

```tsx
          <PrepCard session={currentSession} />
```

to:

```tsx
          <PrepCard session={currentSession} isHost={auth.role === "HOST"} />
```

In `RosterSummary`, add an early empty-state branch:

```tsx
  if (!current.currentSession || current.currentSession.attendees.length === 0) {
    return (
      <section className="surface-quiet" style={{ padding: "20px" }}>
        <div className="eyebrow" style={{ marginBottom: "8px" }}>
          RSVP · 참석 명단
        </div>
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          참석 현황 준비 중
        </p>
      </section>
    );
  }
```

If the existing test expects `RSVP · 참석 명단` for normal session data, keep that title in the non-empty branch.

- [x] **Step 6: Update CurrentSession no-session copy**

In `front/features/current-session/components/current-session.tsx`, replace:

```tsx
              6회차는 종료되었습니다. 호스트가 7회차를 등록하면 RSVP와 질문 작성이 열립니다.
```

with:

```tsx
              호스트가 새 세션을 등록하면 RSVP, 읽기 체크인, 질문 작성이 열립니다.
```

Import and use shared helpers for date/deadline/rsvp labels:

```ts
import { formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";
```

Remove local `formatDate`, `formatDeadline`, and `rsvpLabel`, then replace usages:

```tsx
{formatDateLabel(session.date)}
{formatDeadlineLabel(session.questionDeadlineAt)}
```

- [x] **Step 7: Run focused tests**

Run:

```sh
pnpm --dir front test -- member-home.test.tsx current-session.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit**

```sh
git add front/features/member-home/components/prep-card.tsx front/features/member-home/components/member-home.tsx front/features/current-session/components/current-session.tsx front/tests/unit/member-home.test.tsx front/tests/unit/current-session.test.tsx
git commit -m "fix: harden member session empty states"
```

---

### Task 5: Host Dashboard And Editor Real-Data Fallbacks

**Files:**
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [x] **Step 1: Add failing host dashboard no-session tests**

Append to `front/tests/unit/host-dashboard.test.tsx`:

```tsx
  it("labels zero alerts as no pending work when no current session exists", () => {
    render(
      <HostDashboard
        current={{ currentSession: null }}
        data={{ rsvpPending: 0, checkinMissing: 0, publishPending: 0, feedbackPending: 0 }}
      />,
    );

    expect(screen.getAllByText("대기 없음")).toHaveLength(4);
    expect(screen.getByText("세션을 만들면 참석 현황이 표시됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "새 세션 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
  });

  it("shows an empty member status when the current session has no attendees", () => {
    render(
      <HostDashboard
        current={{
          currentSession: {
            ...current.currentSession!,
            attendees: [],
          },
        }}
        data={dashboard}
      />,
    );

    expect(screen.getByText("참석 현황 준비 중")).toBeInTheDocument();
  });
```

- [x] **Step 2: Add failing host editor existing-empty test**

Append to `front/tests/unit/host-session-editor.test.tsx`:

```tsx
  it("shows empty management states for an existing session with no attendees or reports", () => {
    render(<HostSessionEditor session={{ ...session, attendees: [], reports: [] }} />);

    expect(screen.getByText("아직 참석 대상자가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("등록된 리포트 대상자가 없습니다.")).toBeInTheDocument();
  });
```

- [x] **Step 3: Run focused tests to verify failures**

Run:

```sh
pnpm --dir front test -- host-dashboard.test.tsx host-session-editor.test.tsx
```

Expected: FAIL because "대기 없음", host no-session CTA label, and existing empty attendee/report states are not all present.

- [x] **Step 4: Update HostDashboard alert labels and no-session card**

In `front/features/host/components/host-dashboard.tsx`, import helpers:

```ts
import { hostAlertStateLabel, nonNegativeCount, rsvpLabel } from "@/shared/ui/readmates-display";
```

Change `hostAlerts` to normalize counts:

```ts
function hostAlerts(data: HostDashboardResponse) {
  return [
    { label: "RSVP 미응답", value: nonNegativeCount(data.rsvpPending), hint: "모임 전날 자정까지", tone: "warn" },
    { label: "읽기 체크인 미작성", value: nonNegativeCount(data.checkinMissing), hint: "리마인더 발송 가능", tone: "default" },
    { label: "공개 대기 세션", value: nonNegativeCount(data.publishPending), hint: "한줄평 · 요약 편집 필요", tone: "accent" },
    { label: "리포트 등록 대기", value: nonNegativeCount(data.feedbackPending), hint: "HTML 업로드 확인", tone: "ok" },
  ];
}
```

Inside `HostDashboard`, add:

```ts
  const hasCurrentSession = session !== null;
```

Change badge rendering:

```tsx
                  <span className={badgeClass(alert.value, alert.tone)}>
                    {hostAlertStateLabel(alert.value, hasCurrentSession)}
                  </span>
```

Change no-session action label from `등록` to:

```tsx
새 세션 만들기
```

In the no-session article, keep:

```tsx
등록 후 멤버 홈과 현재 세션 화면에 RSVP와 질문 작성이 열립니다.
```

- [x] **Step 5: Add HostDashboard member status empty state**

Replace:

```tsx
                    {(session?.attendees ?? []).map((member) => {
```

with a conditional block:

```tsx
                    {!session ? (
                      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                        세션을 만들면 참석 현황이 표시됩니다.
                      </p>
                    ) : session.attendees.length === 0 ? (
                      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                        참석 현황 준비 중
                      </p>
                    ) : (
                      session.attendees.map((member) => {
                        const state = rsvpLabel(member.rsvpStatus);
                        const warn = member.rsvpStatus === "NO_RESPONSE";

                        return (
                          <div key={member.membershipId} className="row-between">
                            <span className="row" style={{ gap: "10px" }}>
                              <Avatar initial={member.shortName} label={member.displayName} />
                              <span className="body" style={{ fontSize: "13.5px" }}>
                                {member.displayName}
                              </span>
                            </span>
                            <span className="tiny mono" style={{ color: warn ? "var(--warn)" : "var(--text-3)" }}>
                              {state}
                            </span>
                          </div>
                        );
                      })
                    )}
```

Remove the old map body to avoid duplicate rows.

- [x] **Step 6: Update HostSessionEditor empty states**

In `front/features/host/components/host-session-editor.tsx`, in the Attendance panel, keep the existing no-session branch and add an existing-empty branch before mapping attendees:

```tsx
                {session.attendees.length === 0 ? (
                  <div className="surface-quiet" style={{ padding: "18px" }}>
                    <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                      아직 참석 대상자가 없습니다.
                    </p>
                  </div>
                ) : (
                  <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
                    {session.attendees.map((attendee, index) => {
                      const rsvp = rsvpLabel(attendee.rsvpStatus);

                      return (
                        <div
                          key={attendee.membershipId}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "32px 1fr auto auto",
                            gap: "14px",
                            padding: "12px 0",
                            borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                            alignItems: "center",
                          }}
                        >
                          <Avatar initial={attendee.shortName} label={attendee.displayName} />
                          <span className="body" style={{ fontSize: "14px" }}>
                            {attendee.displayName}
                          </span>
                          <span className="tiny mono" style={{ color: rsvp === "미응답" ? "var(--warn)" : "var(--text-3)" }}>
                            RSVP {rsvp}
                          </span>
                          <div
                            className="row"
                            style={{
                              gap: "4px",
                              background: "var(--bg-sub)",
                              padding: "2px",
                              borderRadius: "999px",
                              border: "1px solid var(--line)",
                            }}
                          >
                            {["참석", "불참"].map((label) => {
                              const selected = attendanceSelected(
                                label,
                                attendanceStatuses[attendee.membershipId] ?? attendee.attendanceStatus,
                              );
                              const attendanceStatus = label === "참석" ? "ATTENDED" : "ABSENT";

                              return (
                                <button
                                  key={label}
                                  type="button"
                                  aria-label={`${attendee.displayName} ${label}`}
                                  aria-pressed={selected}
                                  onClick={() => updateAttendance(attendee.membershipId, attendanceStatus)}
                                  style={{
                                    height: "24px",
                                    padding: "0 10px",
                                    fontSize: "12px",
                                    borderRadius: "999px",
                                    background: selected ? "var(--bg)" : "transparent",
                                    color: selected ? "var(--text)" : "var(--text-3)",
                                    border: selected ? "1px solid var(--line)" : "none",
                                  }}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
```

In the Reports panel, add a branch:

```tsx
                {session.reports.length === 0 ? (
                  <div className="surface-quiet" style={{ padding: "18px" }}>
                    <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                      등록된 리포트 대상자가 없습니다.
                    </p>
                  </div>
                ) : (
                  <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
                    {session.reports.map((report, index) => (
                      <div
                        key={report.membershipId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1.6fr auto auto",
                          gap: "14px",
                          padding: "14px 0",
                          borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                          alignItems: "center",
                        }}
                      >
                        <div className="body" style={{ fontSize: "14px" }}>
                          {report.displayName}
                        </div>
                        <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                          {report.fileName ?? "—"}
                        </div>
                        <span className={report.uploaded ? "badge badge-ok badge-dot" : "badge"}>
                          {report.uploaded ? "업로드 완료" : "대기"}
                        </span>
                        {report.uploaded ? (
                          <div className="row" style={{ gap: "6px" }}>
                            <button className="btn btn-quiet btn-sm" type="button" disabled aria-label={`${report.displayName} 리포트 열기 준비중`}>
                              열기 준비중
                            </button>
                            <button className="btn btn-quiet btn-sm" type="button" disabled aria-label={`${report.displayName} 리포트 교체 준비중`}>
                              교체 준비중
                            </button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" type="button" disabled aria-label={`${report.displayName} 리포트 업로드 준비중`}>
                            업로드 준비중
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
```

Keep the disabled upload/open/replace buttons and their accessible names unchanged so existing tests remain meaningful.

- [x] **Step 7: Run focused tests**

Run:

```sh
pnpm --dir front test -- host-dashboard.test.tsx host-session-editor.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit**

```sh
git add front/features/host/components/host-dashboard.tsx front/features/host/components/host-session-editor.tsx front/tests/unit/host-dashboard.test.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "fix: harden host empty states"
```

---

### Task 6: Public Guest Data Fallbacks

**Files:**
- Modify: `front/features/public/components/public-home.tsx`
- Modify: `front/features/public/components/public-club.tsx`
- Modify: `front/features/public/components/public-session.tsx`
- Modify: `front/tests/unit/public-home.test.tsx`

- [x] **Step 1: Add failing public empty records test**

Append to `front/tests/unit/public-home.test.tsx`:

```tsx
  it("renders an empty public home without hardcoded sample records", () => {
    const { container } = render(
      <PublicHome
        data={{
          ...publicClubFixture,
          stats: { sessions: 0, books: 0, members: 0 },
          recentSessions: [],
        }}
      />,
    );

    expect(screen.getAllByText("아직 공개된 기록이 없습니다").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "클럽 소개 보기" })).toHaveAttribute("href", "/about");
    expect(container.innerHTML).not.toContain("물고기는 존재하지 않는다");
    expect(container.innerHTML).not.toContain("session-13");
  });
```

- [x] **Step 2: Run public tests**

Run:

```sh
pnpm --dir front test -- public-home.test.tsx
```

Expected: PASS if current public home already handles this; if it fails, continue with the implementation steps below.

- [x] **Step 3: Use display helpers in public components**

In `front/features/public/components/public-home.tsx`, import:

```ts
import { displayText, formatDateLabel, nonNegativeCount } from "@/shared/ui/readmates-display";
```

Replace local `formatDate` usages with `formatDateLabel`.

Use safe data in display sites:

```tsx
{displayText(data.clubName, "읽는사이")}
{displayText(data.tagline, "책과 사람 사이에 남는 기록")}
{displayText(data.about, "한 달에 한 권을 읽고 서로의 생각 사이에 머무르는 독서 모임입니다.")}
```

For stats values, render:

```tsx
{nonNegativeCount(data.stats.sessions)}
{nonNegativeCount(data.stats.books)}
{nonNegativeCount(data.stats.members)}
```

In `LatestRecordCard`, render book fields safely:

```tsx
{displayText(session.bookTitle, "책 정보 없음")}
{displayText(session.bookAuthor, "저자 정보 없음")}
```

- [x] **Step 4: Harden PublicClub public-record action**

In `front/features/public/components/public-club.tsx`, import display helpers:

```ts
import { displayText, formatDateLabel, nonNegativeCount } from "@/shared/ui/readmates-display";
```

Replace local `formatDate` usages with `formatDateLabel`.

Change the "공개 기록 보기" link label when no latest session exists:

```tsx
              <Link href={latestHref} className="btn btn-ghost btn-sm">
                {latestSession ? "공개 기록 보기" : "소개로 돌아가기"}
              </Link>
```

Use `nonNegativeCount` in stats display.

- [x] **Step 5: Harden PublicSession display values**

In `front/features/public/components/public-session.tsx`, import:

```ts
import { displayText, formatDateLabel } from "@/shared/ui/readmates-display";
```

Remove local `formatDate`, then replace:

```tsx
{formatDateLabel(session.date)}
{displayText(session.bookTitle, "책 정보 없음")}
{displayText(session.bookAuthor, "저자 정보 없음")}
{displayText(session.summary, "공개 요약을 준비 중입니다.")}
```

- [x] **Step 6: Run public tests**

Run:

```sh
pnpm --dir front test -- public-home.test.tsx public-session-page.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit**

```sh
git add front/features/public/components/public-home.tsx front/features/public/components/public-club.tsx front/features/public/components/public-session.tsx front/tests/unit/public-home.test.tsx
git commit -m "fix: harden public empty data states"
```

---

### Task 7: Mobile CSS Parity And Final Verification

**Files:**
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/app/globals.css`
- Modify: `front/tests/unit/responsive-navigation.test.tsx` only if accessible names change
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts` only if final browser checks reveal a chrome regression

- [x] **Step 1: Add CSS parity changes**

Copy only real-app-safe mobile CSS from `design/styles/mobile.css` into `front/shared/styles/mobile.css`.

Required rules:

```css
.m-hdr-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-tab {
  min-width: 0;
}

.m-tab-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Do not copy `.m-preview-role-dock` into `front` unless a test or visual inspection proves a real app screen needs it. The role preview dock is standalone-only.

- [x] **Step 2: Add responsive component classes if inline styles are insufficient**

If host editor or dashboard still overflows on mobile, add to `front/app/globals.css`:

```css
@media (max-width: 768px) {
  .page-header,
  .page-header-compact {
    padding-left: 0;
    padding-right: 0;
  }

  .grid-2,
  .grid-3,
  .home-grid,
  .ws-grid {
    grid-template-columns: 1fr;
  }
}
```

Only add this if current CSS does not already cover the same selectors.

Status note: no `front/app/globals.css` change was needed. `front/app/globals.css` already imports shared tokens/mobile CSS, page headers already have zero horizontal padding, and `front/shared/styles/tokens.css` already collapses `.ws-grid`, `.home-grid`, `.grid-2`, and `.grid-3`.

- [x] **Step 3: Run full front unit tests**

Run:

```sh
pnpm --dir front test
```

Expected: all tests pass.

- [x] **Step 4: Run standalone build and verification**

Run:

```sh
node design/standalone/build.mjs
node design/standalone/verify.mjs
```

Expected:

```text
Wrote standalone exports under design/standalone
standalone verification passed
```

- [x] **Step 5: Browser-check standalone artifacts**

Use Playwright CLI:

```sh
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" open "http://127.0.0.1:4177/mobile.html" --headed
"$PWCLI" resize 390 844
"$PWCLI" snapshot
"$PWCLI" screenshot
"$PWCLI" eval "async () => { await page.getByRole('button', { name: '게스트' }).click(); }"
"$PWCLI" eval "async () => { await page.getByRole('button', { name: '멤버' }).click(); }"
"$PWCLI" eval "async () => { await page.getByRole('button', { name: '호스트' }).click(); }"
```

After each role click, run `"$PWCLI" snapshot` and `"$PWCLI" screenshot` again.

Expected:

- Mobile header text is readable.
- Role preview dock does not cover the header.
- Bottom tab labels fit.
- Host edit page controls fit above the tab bar.

Status note: standalone browser checks were run on temporary port `4191` because `4177` was already occupied. Mobile `390x844` role switching, tab label fit, and desktop `768x900` nav wrapping were checked with Playwright CLI.

- [x] **Step 6: Browser-check real front if backend is running**

If the backend and frontend are not already running, start them:

```sh
SPRING_PROFILES_ACTIVE=dev READMATES_APP_BASE_URL=http://localhost:3000 ./server/gradlew -p server bootRun
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true READMATES_API_BASE_URL=http://localhost:8080 pnpm --dir front dev
```

Then check:

- Guest `/`
- Guest `/about`
- Host dev login -> `/app/host`
- Host `/app/host/sessions/new`
- Member or host `/app`
- `/app/session/current` when there is no open session

Expected:

- No visible sample-only role switcher in `front`.
- Empty current-session state is generic and does not mention fixed old session numbers.
- Host no-current-session state offers a create-session CTA.
- Member/host mobile tabs remain visible and unobstructed.

Status note: existing `localhost:3000` front server was browser-checked with Playwright CLI at mobile width. Guest `/`, guest `/about`, login, and host `/app/host/sessions/new` had no sample-only role switcher, no horizontal overflow, and host mobile tabs remained visible.

- [x] **Step 7: Run e2e navigation chrome tests if services are available**

Run:

```sh
pnpm --dir front test:e2e -- responsive-navigation-chrome.spec.ts
```

Expected: PASS.

If this fails because the local backend has no seeded session, update only the e2e setup or assertions that assume session data. Do not hardcode sample session titles into the app.

Status note: `pnpm --dir front test:e2e -- responsive-navigation-chrome.spec.ts` was attempted, but Playwright config could not start its webServer because another Next dev server was already running for `front` on `localhost:3000` (PID `35173`). The smallest substitute was the direct Playwright CLI browser smoke against the already-running server plus the standalone browser checks above.

- [x] **Step 8: Final status check**

Run:

```sh
git status --short
```

Expected: only intentional changes remain. Existing user-owned `.gitignore` changes should stay untouched unless the user asks to include them.

- [x] **Step 9: Commit**

```sh
git add front/shared/styles/mobile.css front/app/globals.css front/tests/unit/responsive-navigation.test.tsx front/tests/e2e/responsive-navigation-chrome.spec.ts
git commit -m "fix: polish mobile chrome responsiveness"
```

If `responsive-navigation.test.tsx`, `responsive-navigation-chrome.spec.ts`, or `front/app/globals.css` did not change, omit them from `git add`.

---

## Self-Review

Spec coverage:

- Standalone mobile header/role collision: Task 1.
- Standalone date/question policy consistency: Task 2.
- Desktop responsive guardrails: Task 2.
- Real data null/empty/partial helpers: Task 3.
- Member and current-session null states: Task 4.
- Host dashboard/editor null and empty states: Task 5.
- Public guest empty records: Task 6.
- Final standalone and real app verification: Task 7.

No server field is required by this plan. If implementation reveals a missing API field, pause and ask before changing server contracts.
