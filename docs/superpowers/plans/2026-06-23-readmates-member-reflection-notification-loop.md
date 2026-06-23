# ReadMates Member Reflection Notification Loop v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make member notifications, member-home reflection entries, archive session detail, and feedback document routes behave as one coherent "지난 모임 회고" loop.

**Architecture:** This is a frontend-first slice. `notifications/model` owns safe deep-link normalization and route state, `member-home/model` owns reflection-card status calculation, and archive/feedback routes keep their existing access and unavailable-state ownership. Server and DB changes are avoided unless Task 2 proves a read-only additive status is strictly needed.

**Tech Stack:** React 19, Vite, React Router 7, TanStack Query 5, TypeScript, Vitest, Testing Library, Playwright.

## Global Constraints

- Follow `docs/agents/front.md`: route modules own data flow, UI stays props/callback driven, and dependency direction remains `src/app -> src/pages -> features -> shared`.
- Follow `docs/agents/design.md`: member pages should feel like a personal reading desk, with resilient Korean/English wrapping and visible permission limits.
- Do not add a new notification event type.
- Do not change feedback document authorization semantics.
- Do not add a DB migration.
- Do not expose raw JSON, internal field names, stack traces, raw email, member email, provider raw error, token-shaped values, private deployment detail, local absolute paths, private domains, OCIDs, or secrets.
- Keep unsafe notification deep links falling back to `/app/notifications`.
- Update `CHANGELOG.md` because the member-visible notification/reflection UX changes.
- Run `pnpm --dir front lint`, `pnpm --dir front test`, and `pnpm --dir front build` before completion.

---

## Scope

This plan implements `docs/superpowers/specs/2026-06-23-readmates-member-reflection-notification-loop-design.md`.

This plan deliberately builds on existing shipped work:

- `front/features/member-home/model/member-home-view-model.ts` already has `MemberHomeRecentRecordEntry` and conservative `feedbackState: "UNKNOWN"`.
- `front/features/member-home/ui/member-home-records.test.tsx` already covers desktop/mobile reflection cards.
- `front/tests/e2e/host-session-record-preview.spec.ts` already proves host import -> member home reflection entry.
- `front/tests/e2e/session-closing-flywheel.spec.ts` already proves the basic host/member/public closing loop.

The new work closes the remaining gaps: notification route state, club-scoped deep-link normalization, feedback state input on the member-home entry, and a targeted notification-to-feedback continuity test.

## File Structure

- Modify: `front/features/notifications/model/notification-link-model.ts`
  - Owns `MemberNotificationLinkInput`, `MemberNotificationLinkView`, safe href normalization, and optional `state`.
- Modify: `front/features/notifications/model/notification-link-model.test.ts`
  - Pins legacy and club-scoped deep-link behavior, unsafe fallback, and reflection return state.
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
  - Passes event type into the link model and forwards route state when the user opens an unread notification.
- Modify: `front/features/notifications/ui/member-notifications-page.test.tsx`
  - Verifies link href, action label, and click callback state without private sentinels.
- Modify: `front/features/notifications/route/member-notifications-route.tsx`
  - Navigates with `navigate(href, { state })` after successful read marking.
- Modify: `front/features/member-home/model/member-home-view-model.ts`
  - Adds optional feedback-state input to `getMemberHomeRecentRecordEntry()`.
- Modify: `front/features/member-home/model/member-home-view-model.test.ts`
  - Pins `AVAILABLE`, `MISSING`, `LOCKED`, and `UNKNOWN` reflection-card output.
- Modify: `front/features/feedback/route/feedback-route-continuity.ts`
  - Adds tests or small helpers only if Task 3 finds the existing continuity parser cannot preserve the notification return target.
- Modify: `front/features/feedback/ui/feedback-document-page.tsx`
  - Keeps `지난 모임 회고` back-label rendering for ready and unavailable pages.
- Modify: `front/tests/e2e/session-closing-flywheel.spec.ts`
  - Extends existing member notification coverage to click the notification, preserve route state, and reach the member record or feedback surface.
- Modify: `CHANGELOG.md`
  - Adds a concise Unreleased entry.

---

### Task 1: Notification Deep-Link Model And Route State

**Files:**
- Modify: `front/features/notifications/model/notification-link-model.ts`
- Modify: `front/features/notifications/model/notification-link-model.test.ts`
- Modify: `front/features/notifications/ui/member-notifications-page.tsx`
- Modify: `front/features/notifications/ui/member-notifications-page.test.tsx`
- Modify: `front/features/notifications/route/member-notifications-route.tsx`

**Interfaces:**
- Consumes:
  - `eventType: "NEXT_BOOK_PUBLISHED" | "SESSION_REMINDER_DUE" | "FEEDBACK_DOCUMENT_PUBLISHED" | "REVIEW_PUBLISHED"`
  - `deepLinkPath: string`
- Produces:
  - `type MemberNotificationLinkInput = { eventType: NotificationEventType; deepLinkPath: string }`
  - `type MemberNotificationLinkView = { href: string; primaryActionLabel: "Open" | "View record" | "View feedback" | "Next reading"; reflectionLabel: "Past session reflection" | null; state?: ReadmatesReturnState }`
  - `getMemberNotificationLinkView(input: MemberNotificationLinkInput): MemberNotificationLinkView`
  - `onOpenNotification(id: string, href: string, state?: ReadmatesReturnState): void`

- [ ] **Step 1: Write failing model tests**

Replace `front/features/notifications/model/notification-link-model.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { getMemberNotificationLinkView } from "./notification-link-model";

describe("getMemberNotificationLinkView", () => {
  it("maps legacy session deep links to member reflection action with return state", () => {
    const view = getMemberNotificationLinkView({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
    });

    expect(view.href).toBe("/app/sessions/11111111-1111-1111-1111-111111111111");
    expect(view.primaryActionLabel).toBe("View record");
    expect(view.reflectionLabel).toBe("Past session reflection");
    expect(view.state).toEqual({
      readmatesReturnTo: "/app/notifications",
      readmatesReturnLabel: "지난 모임 회고",
    });
  });

  it("keeps club-scoped feedback links and attaches reflection return state", () => {
    const view = getMemberNotificationLinkView({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      deepLinkPath: "/clubs/reading-sai/app/feedback/22222222-2222-2222-2222-222222222222",
    });

    expect(view.href).toBe("/clubs/reading-sai/app/feedback/22222222-2222-2222-2222-222222222222");
    expect(view.primaryActionLabel).toBe("View feedback");
    expect(view.reflectionLabel).toBe("Past session reflection");
    expect(view.state).toEqual({
      readmatesReturnTo: "/app/notifications",
      readmatesReturnLabel: "지난 모임 회고",
    });
  });

  it("maps current-session and notes links without reflection state", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "SESSION_REMINDER_DUE",
        deepLinkPath: "/clubs/reading-sai/app/session/current",
      }),
    ).toEqual({
      href: "/clubs/reading-sai/app/session/current",
      primaryActionLabel: "Open",
      reflectionLabel: null,
    });

    expect(
      getMemberNotificationLinkView({
        eventType: "REVIEW_PUBLISHED",
        deepLinkPath: "/notes?sessionId=11111111-1111-1111-1111-111111111111",
      }),
    ).toEqual({
      href: "/app/notes?sessionId=11111111-1111-1111-1111-111111111111",
      primaryActionLabel: "Next reading",
      reflectionLabel: null,
    });
  });

  it("falls back for unsafe deep links", () => {
    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "//evil.example.com",
      }).href,
    ).toBe("/app/notifications");

    expect(
      getMemberNotificationLinkView({
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        deepLinkPath: "https://evil.example.com",
      }).href,
    ).toBe("/app/notifications");
  });
});
```

- [ ] **Step 2: Run the focused model test and confirm failure**

Run:

```bash
pnpm --dir front test -- notification-link-model
```

Expected: FAIL with TypeScript errors because `getMemberNotificationLinkView()` still accepts a string and does not return `state`.

- [ ] **Step 3: Implement the link model**

Replace `front/features/notifications/model/notification-link-model.ts` with:

```ts
import type { NotificationEventType } from "@/features/notifications/api/notifications-contracts";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";

export type MemberNotificationLinkView = {
  href: string;
  primaryActionLabel: "Open" | "View record" | "View feedback" | "Next reading";
  reflectionLabel: "Past session reflection" | null;
  state?: ReadmatesReturnState;
};

export type MemberNotificationLinkInput = {
  eventType: NotificationEventType;
  deepLinkPath: string;
};

const reflectionState: ReadmatesReturnState = {
  readmatesReturnTo: "/app/notifications",
  readmatesReturnLabel: "지난 모임 회고",
};

export function getMemberNotificationLinkView(input: MemberNotificationLinkInput): MemberNotificationLinkView {
  const path = normalizeSafePath(input.deepLinkPath);

  if (!path) {
    return fallback();
  }

  if (isFeedbackReflection(input.eventType, path)) {
    return {
      href: normalizeFeedbackPath(path),
      primaryActionLabel: "View feedback",
      reflectionLabel: "Past session reflection",
      state: reflectionState,
    };
  }

  if (isSessionReflection(input.eventType, path)) {
    return {
      href: normalizeSessionPath(path),
      primaryActionLabel: "View record",
      reflectionLabel: "Past session reflection",
      state: reflectionState,
    };
  }

  if (path.startsWith("/notes")) {
    return { href: `/app${path}`, primaryActionLabel: "Next reading", reflectionLabel: null };
  }

  return { href: path, primaryActionLabel: "Open", reflectionLabel: null };
}

function normalizeSafePath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, "https://readmates.local");

    if (url.origin !== "https://readmates.local") {
      return null;
    }

    const path = `${url.pathname}${url.search}${url.hash}`;
    const isAllowed =
      path === "/app" ||
      path.startsWith("/app/") ||
      /^\/clubs\/[^/]+\/app(?:\/|$)/.test(path) ||
      path.startsWith("/sessions/") ||
      path.startsWith("/feedback-documents") ||
      path.startsWith("/notes");

    return isAllowed ? path : null;
  } catch {
    return null;
  }
}

function isFeedbackReflection(eventType: NotificationEventType, path: string) {
  return (
    eventType === "FEEDBACK_DOCUMENT_PUBLISHED" &&
    (path.startsWith("/app/feedback/") ||
      /^\/clubs\/[^/]+\/app\/feedback\//.test(path) ||
      path.startsWith("/feedback-documents"))
  );
}

function isSessionReflection(eventType: NotificationEventType, path: string) {
  return (
    eventType === "FEEDBACK_DOCUMENT_PUBLISHED" &&
    (path.startsWith("/sessions/") || path.startsWith("/app/sessions/") || /^\/clubs\/[^/]+\/app\/sessions\//.test(path))
  );
}

function normalizeSessionPath(path: string) {
  return path.startsWith("/sessions/") ? `/app${path}` : path;
}

function normalizeFeedbackPath(path: string) {
  if (path.startsWith("/feedback-documents")) {
    return "/app/archive?view=report";
  }

  return path;
}

function fallback(): MemberNotificationLinkView {
  return { href: "/app/notifications", primaryActionLabel: "Open", reflectionLabel: null };
}
```

- [ ] **Step 4: Update notification UI tests for route state**

Replace the first test in `front/features/notifications/ui/member-notifications-page.test.tsx` with:

```tsx
  it("shows reflection action for session notification without private sentinels", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[{
          id: "n1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "No.07 session record is ready",
          body: "You can continue into records and feedback.",
          deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
        }]}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByText("Past session reflection")).toBeVisible();
    expect(screen.getByText("View record")).toBeVisible();
    expect(screen.getByRole("link", { name: /No.07 session record/ })).toHaveAttribute(
      "href",
      "/app/sessions/11111111-1111-1111-1111-111111111111",
    );
    expect(screen.queryByText("member1@example.com")).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });
```

Add this second test to the same file:

```tsx
  it("passes reflection route state when an unread notification is opened", () => {
    const onOpenNotification = vi.fn();

    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[{
          id: "n1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "No.07 session record is ready",
          body: "You can continue into records and feedback.",
          deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
        }]}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenNotification={onOpenNotification}
      />,
    );

    screen.getByRole("link", { name: /No.07 session record/ }).click();

    expect(onOpenNotification).toHaveBeenCalledWith(
      "n1",
      "/app/sessions/11111111-1111-1111-1111-111111111111",
      {
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      },
    );
  });
```

- [ ] **Step 5: Update notification UI and route signatures**

In `front/features/notifications/ui/member-notifications-page.tsx`, change the prop type:

```ts
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
```

```ts
  onOpenNotification?: (id: string, href: string, state?: ReadmatesReturnState) => void;
```

Change link model usage inside the item map:

```ts
const linkView = getMemberNotificationLinkView({
  eventType: item.eventType,
  deepLinkPath: item.deepLinkPath,
});
const href = scopedAppLinkTarget(routePathname, linkView.href);
const state = linkView.state
  ? {
      ...linkView.state,
      readmatesReturnTo: scopedAppLinkTarget(routePathname, linkView.state.readmatesReturnTo),
    }
  : undefined;
```

Change both `onOpenNotification` calls in click handlers:

```ts
onOpenNotification(item.id, href, state);
```

In `front/features/notifications/route/member-notifications-route.tsx`, import the type:

```ts
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
```

Change `openNotification`:

```ts
const openNotification = (id: string, href: string, state?: ReadmatesReturnState) => {
  void (async () => {
    if (await markRead(id)) {
      await navigate(href, { state });
    }
  })();
};
```

- [ ] **Step 6: Run focused tests and verify pass**

Run:

```bash
pnpm --dir front test -- notification-link-model member-notifications-page
```

Expected: PASS for notification model and page tests.

- [ ] **Step 7: Commit Task 1**

```bash
git add front/features/notifications/model/notification-link-model.ts \
  front/features/notifications/model/notification-link-model.test.ts \
  front/features/notifications/ui/member-notifications-page.tsx \
  front/features/notifications/ui/member-notifications-page.test.tsx \
  front/features/notifications/route/member-notifications-route.tsx
git commit -m "feat(front): preserve reflection state from notifications"
```

---

### Task 2: Member Home Feedback State Input

**Files:**
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Modify: `front/features/member-home/model/member-home-view-model.test.ts`
- Modify: `front/features/member-home/ui/member-home-records.test.tsx`

**Interfaces:**
- Consumes:
  - `MemberHomeNoteFeedItemView[]`
  - `feedbackStates?: ReadonlyMap<string, MemberHomeFeedbackState>`
- Produces:
  - `getMemberHomeRecentRecordEntry(noteFeedItems, options?)`
  - Honest feedback action/status for `AVAILABLE`, `MISSING`, `LOCKED`, and `UNKNOWN`

- [ ] **Step 1: Write failing model tests for feedback states**

Add these tests to `front/features/member-home/model/member-home-view-model.test.ts`:

```ts
  it("uses available feedback state when provided for the recent reflection session", () => {
    expect(
      getMemberHomeRecentRecordEntry(noteFeedItems, {
        feedbackStates: new Map([["session-6", "AVAILABLE"]]),
      }),
    ).toMatchObject({
      feedbackState: "AVAILABLE",
      feedbackStatusLabel: "피드백 문서를 바로 열 수 있습니다.",
    });
  });

  it("uses missing and locked feedback states without changing record hrefs", () => {
    expect(
      getMemberHomeRecentRecordEntry(noteFeedItems, {
        feedbackStates: new Map([["session-6", "MISSING"]]),
      }),
    ).toMatchObject({
      href: "/app/sessions/session-6",
      feedbackHref: "/app/feedback/session-6",
      feedbackState: "MISSING",
      feedbackStatusLabel: "아직 열람 가능한 피드백 문서가 없습니다.",
    });

    expect(
      getMemberHomeRecentRecordEntry(noteFeedItems, {
        feedbackStates: new Map([["session-6", "LOCKED"]]),
      }),
    ).toMatchObject({
      href: "/app/sessions/session-6",
      feedbackHref: "/app/feedback/session-6",
      feedbackState: "LOCKED",
      feedbackStatusLabel: "참석 멤버에게만 피드백 문서가 열립니다.",
    });
  });
```

- [ ] **Step 2: Run focused model test and verify failure**

Run:

```bash
pnpm --dir front test -- member-home-view-model
```

Expected: FAIL because `getMemberHomeRecentRecordEntry()` does not accept the `options` argument.

- [ ] **Step 3: Implement optional feedback-state input**

In `front/features/member-home/model/member-home-view-model.ts`, add:

```ts
export type MemberHomeRecentRecordEntryOptions = {
  feedbackStates?: ReadonlyMap<string, MemberHomeFeedbackState>;
};

const MEMBER_HOME_FEEDBACK_STATUS_LABELS: Record<MemberHomeFeedbackState, string> = {
  AVAILABLE: "피드백 문서를 바로 열 수 있습니다.",
  MISSING: "아직 열람 가능한 피드백 문서가 없습니다.",
  LOCKED: "참석 멤버에게만 피드백 문서가 열립니다.",
  UNKNOWN: "피드백 문서는 열람 화면에서 확인합니다.",
};
```

Change the function signature:

```ts
export function getMemberHomeRecentRecordEntry(
  noteFeedItems: MemberHomeNoteFeedItemView[],
  options: MemberHomeRecentRecordEntryOptions = {},
): MemberHomeRecentRecordEntry | null {
```

Before the return object, compute:

```ts
const feedbackState = options.feedbackStates?.get(first.sessionId) ?? "UNKNOWN";
```

In the return object, replace the feedback state fields:

```ts
feedbackState,
feedbackStatusLabel: MEMBER_HOME_FEEDBACK_STATUS_LABELS[feedbackState],
```

- [ ] **Step 4: Add UI tests for missing feedback state**

Add this test to `front/features/member-home/ui/member-home-records.test.tsx`:

```tsx
  it("renders missing feedback state without a feedback action", () => {
    render(
      <RecentRecordEntry
        entry={{
          ...entry,
          feedbackState: "MISSING",
          feedbackStatusLabel: "아직 열람 가능한 피드백 문서가 없습니다.",
        }}
      />,
    );

    expect(screen.getByText("아직 열람 가능한 피드백 문서가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "피드백 보기" })).not.toBeInTheDocument();
  });
```

No UI production code change is needed if `FeedbackAction` already treats every non-`AVAILABLE` and non-`UNKNOWN` state as status-only. If this test fails because `MISSING` renders a link, change `FeedbackAction` so `canOpenFeedback` remains:

```ts
const canOpenFeedback = entry.feedbackState === "AVAILABLE" || entry.feedbackState === "UNKNOWN";
```

- [ ] **Step 5: Confirm member-home route wiring stays conservative**

Open `front/features/member-home/ui/member-home.tsx`. If `getMemberHomeRecentRecordEntry(noteFeedItems)` is called directly, leave the call unchanged for this task:

```ts
const recentRecordEntry = getMemberHomeRecentRecordEntry(noteFeedItems);
```

This keeps the default `UNKNOWN` behavior until a future implementation can derive feedback availability without additional broad fetches. The model API is ready for that future input, and the UI already renders all states.

- [ ] **Step 6: Run focused tests and verify pass**

Run:

```bash
pnpm --dir front test -- member-home-view-model member-home-records
```

Expected: PASS for member-home model and card tests.

- [ ] **Step 7: Commit Task 2**

```bash
git add front/features/member-home/model/member-home-view-model.ts \
  front/features/member-home/model/member-home-view-model.test.ts \
  front/features/member-home/ui/member-home-records.test.tsx \
  front/features/member-home/ui/member-home-records.tsx
git commit -m "feat(front): model reflection feedback states"
```

---

### Task 3: Feedback Return Continuity From Notifications

**Files:**
- Modify: `front/features/feedback/route/feedback-route-continuity.ts`
- Create: `front/features/feedback/route/feedback-route-continuity.test.ts`
- Modify: `front/features/feedback/ui/feedback-document-page.tsx`

**Interfaces:**
- Consumes: `ReadmatesReturnState` from Task 1 navigation state.
- Produces:
  - `readFeedbackReturnTarget(state)` preserves `/app/notifications` and `/clubs/:slug/app/notifications`.
  - `feedbackBackLabel()` displays `회고` when `returnTarget.label === "지난 모임 회고"`.

- [ ] **Step 1: Write feedback route-continuity tests**

Create `front/features/feedback/route/feedback-route-continuity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFeedbackReturnTarget } from "./feedback-route-continuity";

describe("readFeedbackReturnTarget", () => {
  it("preserves notification reflection return target", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }),
    ).toEqual({
      href: "/app/notifications",
      label: "지난 모임 회고",
    });
  });

  it("preserves club-scoped notification return target", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "/clubs/reading-sai/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }),
    ).toEqual({
      href: "/clubs/reading-sai/app/notifications",
      label: "지난 모임 회고",
    });
  });

  it("rejects unsafe return targets", () => {
    expect(
      readFeedbackReturnTarget({
        readmatesReturnTo: "https://evil.example.com/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      }),
    ).toEqual({
      href: "/app/archive?view=report",
      label: "아카이브로 돌아가기",
    });
  });
});
```

- [ ] **Step 2: Run focused continuity test and inspect result**

Run:

```bash
pnpm --dir front test -- feedback-route-continuity
```

Expected: PASS if the existing parser already supports these routes. If it fails, continue to Step 3.

- [ ] **Step 3: Repair safe target parsing only if Step 2 fails**

If the test fails because `/app/notifications` or `/clubs/:slug/app/notifications` is rejected, update `toSafeAppHref()` in `front/features/feedback/route/feedback-route-continuity.ts` so the allowed predicate remains:

```ts
const isAppHref =
  url.pathname === "/app" ||
  url.pathname.startsWith("/app/") ||
  /^\/clubs\/[^/]+\/app(?:\/|$)/.test(url.pathname);
```

Do not allow absolute external origins. Do not allow public `/records`, `/sessions`, admin, host, OAuth, reset-password, or invite routes as return targets.

- [ ] **Step 4: Verify feedback page back-label behavior**

Inspect `front/features/feedback/ui/feedback-document-page.tsx`. Confirm `feedbackBackLabel()` contains:

```ts
if (returnTarget.label === "지난 모임 회고") {
  return "회고";
}
```

If it is missing, add that branch before archive/session fallback branches.

- [ ] **Step 5: Run focused tests and verify pass**

Run:

```bash
pnpm --dir front test -- feedback-route-continuity feedback-document
```

Expected: PASS for feedback route continuity and feedback document tests.

- [ ] **Step 6: Commit Task 3**

```bash
git add front/features/feedback/route/feedback-route-continuity.ts \
  front/features/feedback/route/feedback-route-continuity.test.ts \
  front/features/feedback/ui/feedback-document-page.tsx
git commit -m "test(front): cover reflection feedback return state"
```

---

### Task 4: E2E Continuity, Changelog, And Final Verification

**Files:**
- Modify: `front/tests/e2e/session-closing-flywheel.spec.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes:
  - Task 1 notification route state.
  - Task 2 reflection card behavior.
  - Task 3 feedback route continuity.
- Produces:
  - Targeted Playwright proof that notification click enters a reflection route without leaking private sentinels.
  - Changelog entry for the user-visible UX change.

- [ ] **Step 1: Extend E2E fixture with member archive and feedback routes**

In `front/tests/e2e/session-closing-flywheel.spec.ts`, after `routeMemberNotifications(page)`, add helper routes:

```ts
async function routeMemberReflectionSurfaces(page: Page): Promise<void> {
  await page.route(`**/api/bff/api/archive/sessions/${SESSION_ID}`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      sessionNumber: 7,
      title: "7회차 모임 · E2E 책",
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      state: "CLOSED",
      locationLabel: "온라인",
      attendance: 2,
      total: 2,
      myAttendanceStatus: "ATTENDED",
      isHost: false,
      publicSummary: "멤버가 다시 읽을 수 있는 기록입니다.",
      publicHighlights: [],
      clubQuestions: [],
      clubOneLiners: [],
      publicOneLiners: [],
      myQuestions: [],
      myCheckin: { readingProgress: 100 },
      myOneLineReview: null,
      myLongReview: null,
      feedbackDocument: {
        available: true,
        readable: true,
        lockedReason: null,
        title: "독서모임 7차 피드백",
        uploadedAt: "2026-06-18T10:00:00Z",
      },
    });
  });

  await page.route(`**/api/bff/api/sessions/${SESSION_ID}/feedback-document`, async (route) => {
    await json(route, 200, {
      status: "ready",
      document: {
        sessionId: SESSION_ID,
        sessionNumber: 7,
        title: "독서모임 7차 피드백",
        subtitle: "E2E 책",
        bookTitle: "E2E 책",
        date: "2026-06-18",
        fileName: "session-7-feedback.md",
        uploadedAt: "2026-06-18T10:00:00Z",
        metadata: [],
        observerNotes: ["공개-safe 피드백입니다."],
        participants: [],
      },
    });
  });
}
```

- [ ] **Step 2: Update E2E member notification flow**

In the test body, replace the member notification assertion block:

```ts
await routeMemberNotifications(page);
await page.goto(`/clubs/${CLUB_SLUG}/app/notifications`);
await expect(page.getByText("Past session reflection")).toBeVisible();
await expect(page.getByText("View record")).toBeVisible();
```

with:

```ts
await routeMemberNotifications(page);
await routeMemberReflectionSurfaces(page);
await page.goto(`/clubs/${CLUB_SLUG}/app/notifications`);
await expect(page.getByText("Past session reflection")).toBeVisible();
await expect(page.getByText("View record")).toBeVisible();
await page.getByRole("link", { name: "No.07 모임 기록이 준비되었습니다 열기" }).click();
await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}$`));
await expect(page.getByRole("link", { name: "지난 모임 회고 돌아가기" })).toBeVisible();
await expect(page.getByRole("link", { name: "피드백 보기" })).toBeVisible();
await page.getByRole("link", { name: "피드백 보기" }).click();
await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB_SLUG}/app/feedback/${SESSION_ID}$`));
await expect(page.getByRole("link", { name: "지난 모임 회고 돌아가기" })).toBeVisible();
await expect(page.getByText("member1@example.com")).toHaveCount(0);
await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
await expect(page.getByText("{\"")).toHaveCount(0);
```

- [ ] **Step 3: Run targeted E2E and verify failure or pass**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts
```

Expected before Tasks 1-3 are complete: FAIL because notification navigation does not preserve route state. Expected after Tasks 1-3: PASS.

- [ ] **Step 4: Update changelog**

Under `CHANGELOG.md` `## Unreleased` -> `### Changed`, add:

```markdown
- **member reflection notifications:** 멤버 알림에서 지난 모임 기록/피드백으로 들어갈 때 회고 return state를 보존하고, 멤버 홈 회고 카드의 피드백 상태 모델을 `AVAILABLE`/`MISSING`/`LOCKED`/`UNKNOWN`으로 명시했습니다. 권한 모델, notification event type, auth/BFF token, OAuth scope, DB migration은 변경하지 않습니다.
```

- [ ] **Step 5: Run full frontend verification**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts
```

Expected: all commands PASS.

- [ ] **Step 6: Check public safety in changed files**

Run:

```bash
rg -n "member1@example.com|private.example.com|ADMIN_ROUTE|\\{\\\"|OCID|token|secret" \
  front/features/notifications \
  front/features/member-home \
  front/features/feedback \
  front/tests/e2e/session-closing-flywheel.spec.ts \
  CHANGELOG.md
```

Expected: either no output, or only existing public-safe sentinel assertions in tests.

- [ ] **Step 7: Commit Task 4**

```bash
git add front/tests/e2e/session-closing-flywheel.spec.ts CHANGELOG.md
git commit -m "test(front): prove member reflection notification loop"
```

---

## Final Review Checklist

- [ ] `git diff --check HEAD~4..HEAD` passes.
- [ ] `pnpm --dir front lint` passes.
- [ ] `pnpm --dir front test` passes.
- [ ] `pnpm --dir front build` passes.
- [ ] `pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts` passes.
- [ ] `CHANGELOG.md` states no auth/BFF token, OAuth scope, notification event type, permission model, or DB migration change.
- [ ] Notification unsafe URLs still fall back to `/app/notifications`.
- [ ] Feedback unavailable states remain owned by the feedback route and do not expose private/internal details.

## Self-review Notes

- Spec coverage: Tasks 1-4 cover notification deep-link normalization, return state, member-home feedback-state modeling, archive/feedback continuity, targeted E2E, and release note.
- Placeholder scan: no open placeholder markers are used.
- Type consistency: `MemberNotificationLinkView.state` uses `ReadmatesReturnState`, matching React Router state passed by `navigate(href, { state })`.
- Scope check: no DB migration, new notification event type, social feature, admin operation transfer, or feedback authorization change is included.
