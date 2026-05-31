# Member/Host Reading Loop + Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align host operating actions and member reading actions through a small role-safe reading-loop model, then document the loop as public-safe showcase evidence.

**Architecture:** Keep this frontend-first unless a later task proves the current payloads are insufficient. Add a small `front/shared/model/reading-loop.ts` model that contains only role-safe state derivation, then let host, member home, and current-session feature models translate that state into role-specific copy and links. UI remains prop/callback driven, and showcase docs describe the private workflow through sanitized evidence without widening guest access.

**Tech Stack:** React 19, TypeScript, Vite, React Router 7, TanStack Query, Vitest + Testing Library, Playwright, Markdown docs.

---

## File Structure

Create:

- `front/shared/model/reading-loop.ts` — role-safe reading-loop state enum, labels, and pure state derivation.
- `front/shared/model/reading-loop.test.ts` — unit tests for state priority and labels.
- `front/features/member-home/model/member-home-view-model.test.ts` — member home next-action unit tests.
- `front/features/current-session/model/current-session-view-model.test.ts` — current-session summary unit tests.

Modify:

- `front/features/member-home/model/member-home-view-model.ts` — translate current member data into reading-loop next action.
- `front/features/member-home/ui/member-home.tsx` — render member next action from the model instead of private UI-local logic.
- `front/features/current-session/model/current-session-view-model.ts` — add current-session reading-loop summary helper.
- `front/features/current-session/ui/current-session-page.tsx` — render desktop loop summary and pass mobile summary.
- `front/features/current-session/ui/mobile/current-session-mobile-board.tsx` — render mobile loop summary.
- `front/features/host/model/host-dashboard-model.ts` — attach role-safe reading-loop state to the existing host next operation action.
- `front/features/host/ui/dashboard/shared-sections.tsx` — show the loop state on the next-action card.
- `front/tests/unit/member-home.test.tsx`, `front/tests/unit/current-session.test.tsx`, `front/tests/unit/host-dashboard.test.tsx` — focused behavior assertions around the visible loop.
- `front/tests/e2e/dev-login-session-flow.spec.ts` — extend the existing host-created session flow to prove host setup appears as member reading prep.
- `docs/showcase/guest-mode-walkthrough.md`, `docs/showcase/engineering-confidence.md`, `docs/showcase/operational-proof.md`, `README.md`, `CHANGELOG.md` — public-safe reviewer evidence.

Do not create server files unless a task cannot be completed with current route data. If that happens, stop and write down the missing field before changing API contracts.

---

### Task 1: Shared Reading-Loop Model

**Files:**
- Create: `front/shared/model/reading-loop.ts`
- Test: `front/shared/model/reading-loop.test.ts`

- [ ] **Step 1: Write the failing shared model test**

Create `front/shared/model/reading-loop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  readingLoopDescription,
} from "./reading-loop";

describe("reading-loop model", () => {
  it("prioritizes no-session before role work", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: false,
        hostBlockerCount: 3,
        memberCanWrite: true,
        memberRsvpStatus: "NO_RESPONSE",
        memberHasCheckin: false,
        memberQuestionCount: 0,
      }),
    ).toBe("NO_SESSION");
  });

  it("keeps host setup blockers ahead of member prep", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        hostBlockerCount: 1,
        memberCanWrite: true,
        memberRsvpStatus: "NO_RESPONSE",
        memberHasCheckin: false,
        memberQuestionCount: 0,
      }),
    ).toBe("HOST_SETUP_REQUIRED");
  });

  it("detects member prep when RSVP, check-in, or questions are missing", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "NO_RESPONSE",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
      }),
    ).toBe("MEMBER_PREP_REQUIRED");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: false,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
      }),
    ).toBe("MEMBER_PREP_REQUIRED");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 1,
        minimumQuestionCount: 2,
      }),
    ).toBe("MEMBER_PREP_REQUIRED");
  });

  it("moves from ready to reflection and archive states", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
        sessionDate: "2026-05-20",
        today: new Date(2026, 4, 19),
        memberHasReflection: false,
      }),
    ).toBe("SESSION_READY");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
        sessionDate: "2026-05-20",
        today: new Date(2026, 4, 21),
        memberHasReflection: false,
      }),
    ).toBe("REFLECTION_DUE");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
        archiveItemCount: 1,
      }),
    ).toBe("ARCHIVE_AVAILABLE");
  });

  it("exposes stable Korean labels and descriptions", () => {
    expect(READING_LOOP_LABELS.MEMBER_PREP_REQUIRED).toBe("멤버 준비 필요");
    expect(readingLoopDescription("HOST_SETUP_REQUIRED")).toContain("호스트");
    expect(readingLoopDescription("ARCHIVE_AVAILABLE")).toContain("아카이브");
  });
});
```

- [ ] **Step 2: Run the shared model test and verify failure**

Run:

```bash
pnpm --dir front exec vitest run shared/model/reading-loop.test.ts
```

Expected: FAIL because `front/shared/model/reading-loop.ts` does not exist.

- [ ] **Step 3: Implement the shared model**

Create `front/shared/model/reading-loop.ts`:

```ts
export type ReadingLoopState =
  | "NO_SESSION"
  | "HOST_SETUP_REQUIRED"
  | "MEMBER_PREP_REQUIRED"
  | "SESSION_READY"
  | "REFLECTION_DUE"
  | "ARCHIVE_AVAILABLE";

export type ReadingLoopRsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";

export type ReadingLoopInput = {
  hasCurrentSession: boolean;
  hostBlockerCount?: number;
  memberCanWrite?: boolean;
  memberRsvpStatus?: ReadingLoopRsvpStatus;
  memberHasCheckin?: boolean;
  memberQuestionCount?: number;
  minimumQuestionCount?: number;
  sessionDate?: string | null;
  today?: Date;
  memberHasReflection?: boolean;
  archiveItemCount?: number;
};

export const READING_LOOP_LABELS: Record<ReadingLoopState, string> = {
  NO_SESSION: "세션 대기",
  HOST_SETUP_REQUIRED: "호스트 준비 필요",
  MEMBER_PREP_REQUIRED: "멤버 준비 필요",
  SESSION_READY: "세션 준비됨",
  REFLECTION_DUE: "회고 필요",
  ARCHIVE_AVAILABLE: "아카이브 연결",
};

const READING_LOOP_DESCRIPTIONS: Record<ReadingLoopState, string> = {
  NO_SESSION: "현재 열린 세션이 없어 호스트가 새 세션을 열면 멤버 준비가 시작됩니다.",
  HOST_SETUP_REQUIRED: "호스트가 세션 정보, 멤버 상태, 공개 범위, 운영 대기 항목을 먼저 닫아야 합니다.",
  MEMBER_PREP_REQUIRED: "멤버가 RSVP, 읽기 진행률, 질문 중 남은 준비를 완료해야 합니다.",
  SESSION_READY: "호스트 운영과 멤버 준비가 큰 문제 없이 모임을 기다릴 수 있는 상태입니다.",
  REFLECTION_DUE: "모임 이후 한줄평, 서평, 기록 정리가 남아 있습니다.",
  ARCHIVE_AVAILABLE: "공개되거나 보존된 기록을 아카이브와 노트에서 이어 읽을 수 있습니다.",
};

export function readingLoopDescription(state: ReadingLoopState): string {
  return READING_LOOP_DESCRIPTIONS[state];
}

export function deriveReadingLoopState(input: ReadingLoopInput): ReadingLoopState {
  if (!input.hasCurrentSession) {
    return "NO_SESSION";
  }

  if ((input.hostBlockerCount ?? 0) > 0) {
    return "HOST_SETUP_REQUIRED";
  }

  const canWrite = input.memberCanWrite ?? false;
  const minimumQuestionCount = input.minimumQuestionCount ?? 2;
  const memberPrepMissing =
    canWrite &&
    (input.memberRsvpStatus === "NO_RESPONSE" ||
      input.memberHasCheckin === false ||
      (input.memberQuestionCount ?? 0) < minimumQuestionCount);

  if (memberPrepMissing) {
    return "MEMBER_PREP_REQUIRED";
  }

  if (isAfterSessionDate(input.sessionDate, input.today ?? new Date()) && input.memberHasReflection === false) {
    return "REFLECTION_DUE";
  }

  if ((input.archiveItemCount ?? 0) > 0) {
    return "ARCHIVE_AVAILABLE";
  }

  return "SESSION_READY";
}

function isAfterSessionDate(sessionDate: string | null | undefined, today: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate ?? "");

  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return current.getTime() > target.getTime();
}
```

- [ ] **Step 4: Run the shared model test and verify pass**

Run:

```bash
pnpm --dir front exec vitest run shared/model/reading-loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/shared/model/reading-loop.ts front/shared/model/reading-loop.test.ts
git commit -m "feat: add role-safe reading loop model"
```

---

### Task 2: Member Home Next Reading Action

**Files:**
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Test: `front/features/member-home/model/member-home-view-model.test.ts`
- Modify: `front/features/member-home/ui/member-home.tsx`
- Test: `front/tests/unit/member-home.test.tsx`

- [ ] **Step 1: Write the member-home model test**

Create `front/features/member-home/model/member-home-view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MemberHomeCurrentSessionView, MemberHomeNoteFeedItemView } from "./member-home-view-model";
import { getMemberHomeNextReadingAction } from "./member-home-view-model";

const session = {
  sessionId: "session-1",
  sessionNumber: 1,
  title: "1회차",
  bookTitle: "테스트 책",
  bookAuthor: "저자",
  bookLink: null,
  bookImageUrl: null,
  date: "2026-05-20",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  questionDeadlineAt: "2026-05-19T14:59:00Z",
  myRsvpStatus: "NO_RESPONSE",
  myCheckin: null,
  myQuestions: [],
  myOneLineReview: null,
  myLongReview: null,
  board: { questions: [], oneLineReviews: [], highlights: [] },
  attendees: [],
} satisfies NonNullable<MemberHomeCurrentSessionView["currentSession"]>;

const note: MemberHomeNoteFeedItemView = {
  sessionId: "archive-1",
  sessionNumber: 0,
  bookTitle: "지난 책",
  date: "2026-04-20",
  authorName: "멤버",
  authorShortName: "멤",
  kind: "QUESTION",
  text: "지난 질문",
};

describe("getMemberHomeNextReadingAction", () => {
  it("waits for host setup when there is no current session", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: null,
        isViewer: false,
        noteFeedItems: [],
      }),
    ).toEqual({
      state: "NO_SESSION",
      label: "세션 대기",
      message: "호스트가 세션을 열면 준비를 시작합니다.",
      href: null,
      ctaLabel: null,
    });
  });

  it("keeps viewers read-only", () => {
    expect(
      getMemberHomeNextReadingAction({
        session,
        isViewer: true,
        noteFeedItems: [],
      }).message,
    ).toBe("세션을 읽고 공동 보드를 확인할 수 있어요.");
  });

  it("prioritizes RSVP, check-in, and question prep", () => {
    expect(
      getMemberHomeNextReadingAction({
        session,
        isViewer: false,
        noteFeedItems: [],
      }).message,
    ).toBe("RSVP를 먼저 선택해 주세요.");

    expect(
      getMemberHomeNextReadingAction({
        session: { ...session, myRsvpStatus: "GOING" },
        isViewer: false,
        noteFeedItems: [],
      }).message,
    ).toBe("읽기 진행률을 남겨 주세요.");

    expect(
      getMemberHomeNextReadingAction({
        session: { ...session, myRsvpStatus: "GOING", myCheckin: { readingProgress: 70 } },
        isViewer: false,
        noteFeedItems: [],
      }).message,
    ).toBe("질문 2개를 더 준비해 주세요.");
  });

  it("moves from ready to archive when preserved records exist", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myRsvpStatus: "GOING",
          myCheckin: { readingProgress: 80 },
          myQuestions: [
            { priority: 1, text: "질문 1", draftThought: null, authorName: "멤버", authorShortName: "멤" },
            { priority: 2, text: "질문 2", draftThought: null, authorName: "멤버", authorShortName: "멤" },
          ],
        },
        isViewer: false,
        noteFeedItems: [],
      }).message,
    ).toBe("준비가 정리되었습니다. 모임 전까지 수정할 수 있어요.");

    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myRsvpStatus: "GOING",
          myCheckin: { readingProgress: 80 },
          myQuestions: [
            { priority: 1, text: "질문 1", draftThought: null, authorName: "멤버", authorShortName: "멤" },
            { priority: 2, text: "질문 2", draftThought: null, authorName: "멤버", authorShortName: "멤" },
          ],
        },
        isViewer: false,
        noteFeedItems: [note],
      }),
    ).toMatchObject({
      state: "ARCHIVE_AVAILABLE",
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: "/app/notes",
      ctaLabel: "노트 보기",
    });
  });
});
```

- [ ] **Step 2: Run the member-home model test and verify failure**

Run:

```bash
pnpm --dir front exec vitest run features/member-home/model/member-home-view-model.test.ts
```

Expected: FAIL because `getMemberHomeNextReadingAction` is not exported.

- [ ] **Step 3: Add the member-home model helper**

Add this import next to the existing imports at the top of `front/features/member-home/model/member-home-view-model.ts`:

```ts
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  type ReadingLoopState,
} from "@/shared/model/reading-loop";
```

Then append this block below `memberHomeViewFromRouteData`:

```ts

export type MemberHomeNextReadingAction = {
  state: ReadingLoopState;
  label: string;
  message: string;
  href: string | null;
  ctaLabel: string | null;
};

export function getMemberHomeNextReadingAction({
  session,
  isViewer,
  noteFeedItems,
}: {
  session: MemberHomeCurrentSessionView["currentSession"];
  isViewer: boolean;
  noteFeedItems: MemberHomeNoteFeedItemView[];
}): MemberHomeNextReadingAction {
  const state = deriveReadingLoopState({
    hasCurrentSession: session !== null,
    memberCanWrite: !isViewer,
    memberRsvpStatus: session?.myRsvpStatus,
    memberHasCheckin: session ? session.myCheckin !== null : undefined,
    memberQuestionCount: session?.myQuestions.length ?? 0,
    minimumQuestionCount: 2,
    sessionDate: session?.date,
    memberHasReflection: Boolean(session?.myOneLineReview?.text.trim() || session?.myLongReview?.body.trim()),
    archiveItemCount: noteFeedItems.length,
  });

  if (state === "NO_SESSION") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: isViewer ? "다음 세션이 열리면 읽기 전용으로 확인할 수 있어요." : "호스트가 세션을 열면 준비를 시작합니다.",
      href: null,
      ctaLabel: null,
    };
  }

  if (isViewer) {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "세션을 읽고 공동 보드를 확인할 수 있어요.",
      href: "/app/session/current",
      ctaLabel: "세션 읽기",
    };
  }

  if (session?.myRsvpStatus === "NO_RESPONSE") {
    return {
      state: "MEMBER_PREP_REQUIRED",
      label: READING_LOOP_LABELS.MEMBER_PREP_REQUIRED,
      message: "RSVP를 먼저 선택해 주세요.",
      href: "/app/session/current",
      ctaLabel: "RSVP 하기",
    };
  }

  if (session && session.myCheckin === null) {
    return {
      state: "MEMBER_PREP_REQUIRED",
      label: READING_LOOP_LABELS.MEMBER_PREP_REQUIRED,
      message: "읽기 진행률을 남겨 주세요.",
      href: "/app/session/current",
      ctaLabel: "진행률 남기기",
    };
  }

  if (session && session.myQuestions.length < 2) {
    const remaining = 2 - session.myQuestions.length;
    return {
      state: "MEMBER_PREP_REQUIRED",
      label: READING_LOOP_LABELS.MEMBER_PREP_REQUIRED,
      message: `질문 ${remaining}개를 더 준비해 주세요.`,
      href: "/app/session/current",
      ctaLabel: "질문 쓰기",
    };
  }

  if (state === "ARCHIVE_AVAILABLE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: "/app/notes",
      ctaLabel: "노트 보기",
    };
  }

  if (state === "REFLECTION_DUE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "모임 후 한줄평이나 서평을 남겨 주세요.",
      href: "/app/session/current",
      ctaLabel: "회고 남기기",
    };
  }

  return {
    state,
    label: READING_LOOP_LABELS[state],
    message: "준비가 정리되었습니다. 모임 전까지 수정할 수 있어요.",
    href: "/app/session/current",
    ctaLabel: "세션 열기",
  };
}
```

- [ ] **Step 4: Replace UI-local member next action**

In `front/features/member-home/ui/member-home.tsx`, update the model import:

```ts
import {
  getMemberHomeNextReadingAction,
  type MemberHomeAuth as AuthMeResponse,
  type MemberHomeCurrentSessionView as CurrentSessionResponse,
  type MemberHomeNoteFeedItemView as NoteFeedItem,
  type MemberHomeUpcomingSessionView as MemberHomeUpcomingSession,
} from "@/features/member-home/model/member-home-view-model";
```

Delete the private `nextActionFor` function from `member-home.tsx`.

Replace `HomeAnswerStrip`'s next-action calculation with:

```tsx
  const nextAction = getMemberHomeNextReadingAction({
    session,
    isViewer,
    noteFeedItems,
  });
```

Then replace the next-action paragraph body with:

```tsx
          {nextAction.message}
```

- [ ] **Step 5: Add a visible integration assertion**

In `front/tests/unit/member-home.test.tsx`, add this test inside `describe("MemberHome", ...)`:

```tsx
  it("uses the role-safe reading loop for the desktop next action", () => {
    const { container } = render(
      <MemberHome auth={auth} current={current} noteFeedItems={noteFeedItems} upcomingSessions={[]} />,
    );
    const desktop = getDesktopView(container);

    expect(desktop.getByText("다음 할 일")).toBeInTheDocument();
    expect(desktop.getByText("읽기 진행률을 남겨 주세요.")).toBeInTheDocument();
    expect(desktop.queryByText("호스트 준비 필요")).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Run focused member tests**

Run:

```bash
pnpm --dir front exec vitest run features/member-home/model/member-home-view-model.test.ts tests/unit/member-home.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/member-home/model/member-home-view-model.ts \
  front/features/member-home/model/member-home-view-model.test.ts \
  front/features/member-home/ui/member-home.tsx \
  front/tests/unit/member-home.test.tsx
git commit -m "feat: align member home reading loop action"
```

---

### Task 3: Current Session Reading-Loop Summary

**Files:**
- Modify: `front/features/current-session/model/current-session-view-model.ts`
- Test: `front/features/current-session/model/current-session-view-model.test.ts`
- Modify: `front/features/current-session/ui/current-session-page.tsx`
- Modify: `front/features/current-session/ui/mobile/current-session-mobile-board.tsx`
- Test: `front/tests/unit/current-session.test.tsx`

- [ ] **Step 1: Write current-session model tests**

Create `front/features/current-session/model/current-session-view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getCurrentSessionReadingLoopSummary } from "./current-session-view-model";

describe("getCurrentSessionReadingLoopSummary", () => {
  it("guides active members through prep", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        canWrite: true,
        rsvpStatus: "NO_RESPONSE",
        readingProgress: 0,
        writtenQuestionCount: 0,
        sessionDate: "2026-05-20",
        hasReflection: false,
        today: new Date(2026, 4, 19),
      }),
    ).toMatchObject({
      state: "MEMBER_PREP_REQUIRED",
      label: "멤버 준비 필요",
      body: "RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.",
    });
  });

  it("marks reflection due after the session date", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        canWrite: true,
        rsvpStatus: "GOING",
        readingProgress: 80,
        writtenQuestionCount: 2,
        sessionDate: "2026-05-20",
        hasReflection: false,
        today: new Date(2026, 4, 21),
      }),
    ).toMatchObject({
      state: "REFLECTION_DUE",
      label: "회고 필요",
    });
  });

  it("keeps viewers read-only without asking for writes", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        canWrite: false,
        rsvpStatus: "NO_RESPONSE",
        readingProgress: 0,
        writtenQuestionCount: 0,
        sessionDate: "2026-05-20",
        hasReflection: false,
      }),
    ).toMatchObject({
      state: "SESSION_READY",
      label: "세션 준비됨",
      body: "세션 내용을 읽고 공동 보드를 확인할 수 있습니다.",
    });
  });
});
```

- [ ] **Step 2: Run current-session model test and verify failure**

Run:

```bash
pnpm --dir front exec vitest run features/current-session/model/current-session-view-model.test.ts
```

Expected: FAIL because `getCurrentSessionReadingLoopSummary` is not exported.

- [ ] **Step 3: Add the current-session model helper**

Add this import next to the existing imports at the top of `front/features/current-session/model/current-session-view-model.ts`:

```ts
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  readingLoopDescription,
  type ReadingLoopRsvpStatus,
  type ReadingLoopState,
} from "@/shared/model/reading-loop";
```

Then append this block below `getCurrentSessionSaveStatusLabel`:

```ts

export type CurrentSessionReadingLoopSummary = {
  state: ReadingLoopState;
  label: string;
  body: string;
};

export function getCurrentSessionReadingLoopSummary({
  canWrite,
  rsvpStatus,
  readingProgress,
  writtenQuestionCount,
  sessionDate,
  hasReflection,
  today,
}: {
  canWrite: boolean;
  rsvpStatus: ReadingLoopRsvpStatus;
  readingProgress: number;
  writtenQuestionCount: number;
  sessionDate: string;
  hasReflection: boolean;
  today?: Date;
}): CurrentSessionReadingLoopSummary {
  const state = deriveReadingLoopState({
    hasCurrentSession: true,
    memberCanWrite: canWrite,
    memberRsvpStatus: rsvpStatus,
    memberHasCheckin: readingProgress > 0,
    memberQuestionCount: writtenQuestionCount,
    minimumQuestionCount: 2,
    sessionDate,
    memberHasReflection: hasReflection,
    today,
  });

  if (!canWrite) {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "세션 내용을 읽고 공동 보드를 확인할 수 있습니다.",
    };
  }

  if (state === "MEMBER_PREP_REQUIRED") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.",
    };
  }

  if (state === "REFLECTION_DUE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "모임 후 한줄평이나 서평을 남겨 다음 기록으로 이어갑니다.",
    };
  }

  return {
    state,
    label: READING_LOOP_LABELS[state],
    body: readingLoopDescription(state),
  };
}
```

- [ ] **Step 4: Render the summary on desktop and mobile**

In `front/features/current-session/ui/current-session-page.tsx`, add `getCurrentSessionReadingLoopSummary` to the existing import from `current-session-view-model`.

Inside `CurrentSessionBoard`, after `const boardTabs = getCurrentSessionBoardTabs(session.board);`, add:

```ts
  const readingLoopSummary = getCurrentSessionReadingLoopSummary({
    canWrite,
    rsvpStatus: rsvp,
    readingProgress,
    writtenQuestionCount,
    sessionDate: session.date,
    hasReflection: Boolean(oneLineReview.trim() || longReview.trim()),
  });
```

Pass it to `MobileCurrentSessionBoard`:

```tsx
        readingLoopSummary={readingLoopSummary}
```

In the desktop section under the paragraph "참석 여부, 읽은 분량, 질문을 모임 전에 정리합니다.", add:

```tsx
              <div className="surface-quiet rm-current-session-loop" role="status" style={{ marginTop: 12, padding: "14px 16px" }}>
                <span className="badge badge-accent badge-dot">{readingLoopSummary.label}</span>
                <p className="small" style={{ margin: "8px 0 0", color: "var(--text-2)" }}>
                  {readingLoopSummary.body}
                </p>
              </div>
```

In `front/features/current-session/ui/mobile/current-session-mobile-board.tsx`, import the summary type:

```ts
import type { CurrentSessionReadingLoopSummary, getCurrentSessionMemberNotice } from "@/features/current-session/model/current-session-view-model";
```

Add `readingLoopSummary` to the component props and prop type:

```ts
  readingLoopSummary,
```

```ts
  readingLoopSummary: CurrentSessionReadingLoopSummary;
```

Render this block after the meeting link section and before the segment control:

```tsx
      <section className="m-sec">
        <div className="m-card-quiet" role="status">
          <div className="eyebrow">{readingLoopSummary.label}</div>
          <p className="small" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
            {readingLoopSummary.body}
          </p>
        </div>
      </section>
```

- [ ] **Step 5: Add visible current-session assertions**

In `front/tests/unit/current-session.test.tsx`, add this test inside `describe("CurrentSession", ...)`:

```tsx
  it("shows the role-safe reading loop summary on desktop and mobile", () => {
    const { container } = render(<CurrentSession auth={activeMemberAuthFixture} data={currentSessionData} />);
    const desktop = within(getDesktop(container));
    const mobile = within(container.querySelector(".rm-current-session-mobile") as HTMLElement);

    expect(desktop.getByText("멤버 준비 필요")).toBeInTheDocument();
    expect(desktop.getByText("RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.")).toBeInTheDocument();
    expect(mobile.getByText("멤버 준비 필요")).toBeInTheDocument();
    expect(mobile.getByText("RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run focused current-session tests**

Run:

```bash
pnpm --dir front exec vitest run features/current-session/model/current-session-view-model.test.ts tests/unit/current-session.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/current-session/model/current-session-view-model.ts \
  front/features/current-session/model/current-session-view-model.test.ts \
  front/features/current-session/ui/current-session-page.tsx \
  front/features/current-session/ui/mobile/current-session-mobile-board.tsx \
  front/tests/unit/current-session.test.tsx
git commit -m "feat: surface current session reading loop status"
```

---

### Task 4: Host Dashboard Reading-Loop Bridge

**Files:**
- Modify: `front/features/host/model/host-dashboard-model.ts`
- Test: `front/features/host/model/host-dashboard-model.test.ts`
- Modify: `front/features/host/ui/dashboard/shared-sections.tsx`
- Test: `front/tests/unit/host-dashboard.test.tsx`

- [ ] **Step 1: Write host dashboard model tests**

Create `front/features/host/model/host-dashboard-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getHostDashboardNextOperationAction } from "./host-dashboard-model";
import type { HostDashboardCurrentSession, HostDashboardData } from "./host-dashboard-model";

const session = {
  sessionId: "session-1",
  sessionNumber: 1,
  bookTitle: "테스트 책",
  bookAuthor: "저자",
  date: "2026-05-20",
  startTime: "20:00",
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/example",
  myCheckin: { readingProgress: 80 },
  attendees: [{ rsvpStatus: "GOING" }],
  board: { questions: [{ id: "q1" }, { id: "q2" }], oneLineReviews: [] },
} satisfies HostDashboardCurrentSession;

const data = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
} satisfies HostDashboardData;

describe("getHostDashboardNextOperationAction reading loop bridge", () => {
  it("marks missing current-session members as host setup", () => {
    expect(
      getHostDashboardNextOperationAction(session, data, {
        count: 1,
        members: [{ membershipId: "m1", displayName: "새 멤버", email: "member@example.com" }],
      }),
    ).toMatchObject({
      title: "새 멤버의 이번 세션 참여 여부 결정",
      loopState: "HOST_SETUP_REQUIRED",
      loopLabel: "호스트 준비 필요",
    });
  });

  it("marks clean current sessions as ready", () => {
    expect(getHostDashboardNextOperationAction(session, data, null)).toMatchObject({
      title: "대기 중인 운영 항목 없음",
      loopState: "SESSION_READY",
      loopLabel: "세션 준비됨",
    });
  });
});
```

- [ ] **Step 2: Run host model test and verify failure**

Run:

```bash
pnpm --dir front exec vitest run features/host/model/host-dashboard-model.test.ts
```

Expected: FAIL because `loopState` and `loopLabel` are not returned.

- [ ] **Step 3: Attach loop state to host next action**

In `front/features/host/model/host-dashboard-model.ts`, add this import at the top:

```ts
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  readingLoopDescription,
  type ReadingLoopState,
} from "@/shared/model/reading-loop";
```

Extend `HostDashboardNextOperationAction`:

```ts
export type HostDashboardNextOperationAction = {
  title: string;
  helper: string;
  href: string | null;
  label?: string;
  unavailableReason?: string;
  loopState: ReadingLoopState;
  loopLabel: string;
  loopBridge: string;
};
```

Add this helper above `getHostDashboardNextOperationAction`:

```ts
function withReadingLoop(
  action: Omit<HostDashboardNextOperationAction, "loopState" | "loopLabel" | "loopBridge">,
  session: HostDashboardCurrentSession | null,
  data: HostDashboardData,
  missingMembers: MissingCurrentSessionMembersSummary | null,
): HostDashboardNextOperationAction {
  const state = deriveReadingLoopState({
    hasCurrentSession: session !== null,
    hostBlockerCount:
      (missingMembers?.count ?? 0) +
      nonNegativeDashboardCount(data.rsvpPending) +
      nonNegativeDashboardCount(data.checkinMissing) +
      nonNegativeDashboardCount(data.publishPending) +
      nonNegativeDashboardCount(data.feedbackPending),
    memberCanWrite: false,
    sessionDate: session?.date,
  });

  return {
    ...action,
    loopState: state,
    loopLabel: READING_LOOP_LABELS[state],
    loopBridge: readingLoopDescription(state),
  };
}
```

In `getHostDashboardNextOperationAction`, wrap every returned object with `withReadingLoop(...)`. For example, change:

```ts
    return {
      title: "새 멤버의 이번 세션 참여 여부 결정",
      helper: "멤버 승인 직후 현재 세션 참석 명단과 비교해 확인된 항목입니다. 아래 알림에서 바로 처리할 수 있습니다.",
      href: null,
      label: "알림에서 처리",
      unavailableReason: "아래 멤버별 버튼으로 처리하면 이 알림에서 사라집니다.",
    };
```

to:

```ts
    return withReadingLoop(
      {
        title: "새 멤버의 이번 세션 참여 여부 결정",
        helper: "멤버 승인 직후 현재 세션 참석 명단과 비교해 확인된 항목입니다. 아래 알림에서 바로 처리할 수 있습니다.",
        href: null,
        label: "알림에서 처리",
        unavailableReason: "아래 멤버별 버튼으로 처리하면 이 알림에서 사라집니다.",
      },
      session,
      data,
      missingMembers,
    );
```

Apply the same wrapper to the no-session, RSVP, check-in, publication, feedback, and ready branches. Keep all existing `title`, `helper`, `href`, `label`, and `unavailableReason` values unchanged.

- [ ] **Step 4: Render host loop bridge in the next-action card**

In `front/features/host/ui/dashboard/shared-sections.tsx`, inside `NextActionCard`, place this block immediately after the eyebrow:

```tsx
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <span className="badge badge-accent badge-dot">{action.loopLabel}</span>
      </div>
```

Place this paragraph immediately after the helper paragraph:

```tsx
      <p className="tiny" style={{ margin: "6px 0 0", color: "var(--text-3)" }}>
        {action.loopBridge}
      </p>
```

- [ ] **Step 5: Add visible host dashboard assertion**

In `front/tests/unit/host-dashboard.test.tsx`, add this test inside `describe("HostDashboard", ...)`:

```tsx
  it("shows the role-safe reading loop state in the host next action", () => {
    render(
      <HostDashboard
        data={{ ...dashboard, rsvpPending: 2 }}
        current={{
          currentSession: {
            sessionId: "session-1",
            sessionNumber: 1,
            bookTitle: "테스트 책",
            bookAuthor: "저자",
            date: "2026-05-20",
            startTime: "20:00",
            locationLabel: "온라인",
            meetingUrl: "https://meet.google.com/example",
            myCheckin: null,
            attendees: [{ rsvpStatus: "NO_RESPONSE" }],
            board: { questions: [], oneLineReviews: [] },
          },
        }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    expect(screen.getAllByText("호스트 준비 필요").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/호스트가 세션 정보/).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 6: Run focused host tests**

Run:

```bash
pnpm --dir front exec vitest run features/host/model/host-dashboard-model.test.ts features/host/ui/host-dashboard.test.tsx tests/unit/host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/host/model/host-dashboard-model.ts \
  front/features/host/model/host-dashboard-model.test.ts \
  front/features/host/ui/dashboard/shared-sections.tsx \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "feat: bridge host dashboard to reading loop state"
```

---

### Task 5: Route-Level Reading Loop E2E

**Files:**
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`

- [ ] **Step 1: Extend the host-created session flow assertions**

In `front/tests/e2e/dev-login-session-flow.spec.ts`, inside `test("host creates member-visible upcoming session then starts it", ...)`, after:

```ts
  await page.goto("/app");
  await expect(page.locator(".rm-member-home-desktop").getByText("E2E 예정 책")).toBeVisible();
```

add:

```ts
  await expect(page.locator(".rm-member-home-desktop").getByText("RSVP를 먼저 선택해 주세요.")).toBeVisible();
```

After the host opens the session and before leaving the test, add:

```ts
  await loginAsDevAccount(page, /멤버1/);
  await page.goto("/app/session/current");
  await expect(page.getByText("멤버 준비 필요").first()).toBeVisible();
  await expect(page.getByText("RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.").first()).toBeVisible();
```

- [ ] **Step 2: Run the targeted E2E spec**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts
```

Expected: PASS. If the command reports "No tests found", run `pnpm --dir front test:e2e` and confirm the configured Playwright test directory before changing the spec.

- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e/dev-login-session-flow.spec.ts
git commit -m "test: cover host to member reading loop e2e"
```

---

### Task 6: Showcase and Release Notes

**Files:**
- Modify: `docs/showcase/guest-mode-walkthrough.md`
- Modify: `docs/showcase/engineering-confidence.md`
- Modify: `docs/showcase/operational-proof.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update guest-mode walkthrough private workflow evidence**

In `docs/showcase/guest-mode-walkthrough.md`, add this row to the "로그인 없이 볼 수 없는 것" table:

```markdown
| Host operation → member reading loop | 호스트 운영 상태와 멤버 준비 상태는 club membership과 role에 묶인 private workflow입니다. | `front/shared/model/reading-loop.ts`, `front/tests/e2e/dev-login-session-flow.spec.ts`, member/host route tests |
```

Below the table, add:

```markdown
## Host → Member Reading Loop Evidence

호스트는 세션 생성, 공개 범위, 누락 멤버, RSVP/읽기/질문 준비 상태를 운영 관점에서 닫고, 멤버는 같은 세션을 RSVP, 읽은 분량, 질문, 회고, 아카이브로 이어 읽습니다.

이 흐름은 guest 권한으로 직접 열지 않습니다. 대신 role-safe 파생 모델(`front/shared/model/reading-loop.ts`), host/member/current-session 단위 테스트, 그리고 dev-login E2E 흐름으로 확인합니다. 문서에는 실제 멤버 데이터나 private route 접근 권한을 추가하지 않습니다.
```

- [ ] **Step 2: Update engineering confidence**

In `docs/showcase/engineering-confidence.md`, add this row to the "Boundary Evidence" table:

```markdown
| Host/member reading loop | `front/shared/model/reading-loop.test.ts`, member/host/current-session route tests, `dev-login-session-flow.spec.ts` | host 운영 상태와 member 읽기 상태가 다른 의미로 갈라지거나 admin-only 신호가 새는 회귀 |
```

- [ ] **Step 3: Update operational proof**

In `docs/showcase/operational-proof.md`, add this section before "Operating Principle":

````markdown
## Product Loop Evidence

Host/member reading-loop changes should close both product and evidence work:

```text
Host operating action
  -> role-safe reading-loop state
  -> member reading action
  -> focused unit/route/E2E checks
  -> showcase and changelog update
  -> public release candidate scan when public-facing docs change
```

The loop is private by permission. Public docs describe it through sanitized tests and source references rather than opening member or host routes to guests.
````

- [ ] **Step 4: Update README review path**

In `README.md`, update item 1 under "How to Review This Project" to:

```markdown
1. **제품 표면 확인** — 게스트로 공개 클럽 소개, 공개 기록, 공개 세션 상세를 확인합니다. 멤버/호스트 reading loop는 권한상 비공개이므로 [Guest-mode walkthrough](docs/showcase/guest-mode-walkthrough.md)에서 public surface와 private workflow evidence를 함께 확인합니다.
```

- [ ] **Step 5: Add changelog entry**

In `CHANGELOG.md`, under `## Unreleased`, add:

```markdown
- **member/host reading loop:** host dashboard의 다음 운영 행동과 member home/current-session의 다음 읽기 행동을 role-safe reading-loop 상태로 정렬했습니다. 공유 모델은 admin-only 신호를 노출하지 않고, showcase 문서는 private workflow를 guest에게 열지 않은 채 sanitized 테스트와 문서 evidence로 설명합니다.
```

- [ ] **Step 6: Run docs checks and public release safety**

Run:

```bash
git diff --check -- README.md CHANGELOG.md docs/showcase/guest-mode-walkthrough.md docs/showcase/engineering-confidence.md docs/showcase/operational-proof.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: both commands pass. The public release check should report no leaks.

- [ ] **Step 7: Commit**

```bash
git add README.md CHANGELOG.md \
  docs/showcase/guest-mode-walkthrough.md \
  docs/showcase/engineering-confidence.md \
  docs/showcase/operational-proof.md
git commit -m "docs: showcase member host reading loop evidence"
```

---

### Task 7: Final Verification and Release-Readiness Notes

**Files:**
- Modify only if needed: `docs/development/test-guide.md`

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass.

- [ ] **Step 2: Run route-heavy E2E check**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: pass. If local backend dependencies make the full suite unavailable, run `pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts` and record the skipped full-suite reason in the final response and release-readiness notes.

- [ ] **Step 3: Run public release checks again after all commits**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: pass.

- [ ] **Step 4: Inspect final diff for scope**

Run:

```bash
git status --short
git diff --stat HEAD~6..HEAD
git diff --check HEAD~6..HEAD
```

Expected: working tree clean, diff limited to frontend reading-loop files, tests, showcase docs, README, and CHANGELOG; whitespace check passes.

- [ ] **Step 5: Commit any verification-only doc adjustment**

If `docs/development/test-guide.md` needs a targeted command for this flow, add the command below to the relevant frontend/E2E section:

````markdown
Member/host reading-loop route smoke:

```bash
pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts
```
````

Then run:

```bash
git diff --check -- docs/development/test-guide.md
git add docs/development/test-guide.md
git commit -m "docs: record reading loop e2e check"
```

If the test guide already has enough E2E guidance, do not edit it.

- [ ] **Step 6: Final implementation summary**

Final response must name:

- Changed surfaces: shared model, host dashboard, member home/current session, E2E, showcase docs.
- Checks actually run.
- Any skipped checks and exact reason.
- Remaining risk, especially if full E2E or public-release checks did not run.

---

## Self-Review Notes

Spec coverage:

- Host/member shared role-safe state: Tasks 1, 2, 3, 4.
- Host next operating action: Task 4.
- Member next reading action: Tasks 2 and 3.
- No new server API by default: File structure and Task 1 architecture note.
- Error/empty state locality: Tasks 2, 3, 4 keep existing inline/card-local behavior and only add summaries.
- Showcase public safety: Task 6.
- Verification: Tasks 5, 6, 7.

Type consistency:

- Shared state type is `ReadingLoopState`.
- Host action fields are `loopState`, `loopLabel`, `loopBridge`.
- Member action fields are `state`, `label`, `message`, `href`, `ctaLabel`.
- Current-session summary fields are `state`, `label`, `body`.

Scope control:

- This plan intentionally does not add server endpoints, database migrations, admin imports into host/member code, or guest access to private workflows.
