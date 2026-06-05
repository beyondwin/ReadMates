# Host Session-Prep Pace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-only "session-prep pace" badge to the host dashboard that fuses days-until-meeting (D-day) with the readiness of each prep item (core info, RSVP, check-ins) into an at-a-glance tier, so a host sees not just *what* is pending but whether it is *overdue relative to its deadline window*.

**Architecture:** A new feature-local pure function `deriveHostPrepPace` maps each unfinished prep item to a deadline window (D-7 / D-3 / D-1, mirroring the existing checklist schedule), computes per-item slack against the current D-day, and reports the worst tier plus the single most-urgent item. A thin adapter builds the pace input from the existing `HostDashboardCurrentSession` + `HostDashboardData` (no new server data). A small `HostPrepPaceNote` component renders the badge + one line inside the existing `NextActionCard`, so both desktop and mobile dashboards pick it up.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react, pnpm. Frontend-only — no server, contract, auth, or BFF change.

---

## File Structure

- Create: `front/features/host/model/host-prep-pace.ts` — pure pace model: types, `deriveHostPrepPace`, and `hostPrepPaceInputFrom` adapter.
- Create: `front/features/host/model/host-prep-pace.test.ts` — unit tests for the pace model + adapter.
- Create: `front/features/host/ui/dashboard/host-prep-pace-note.tsx` — presentational badge + one-line note.
- Create: `front/features/host/ui/dashboard/host-prep-pace-note.test.tsx` — render test for the note.
- Modify: `front/features/host/ui/dashboard/shared-sections.tsx` — `NextActionCard` gains a `pace` prop and renders the note.
- Modify: `front/features/host/ui/host-dashboard.tsx` — compute pace (desktop) and pass to `NextActionCard`.
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx` — compute pace (mobile) and pass to `NextActionCard`.
- Modify: `front/features/host/ui/host-dashboard.test.tsx` — assert the prep-pace badge renders.
- Modify: `CHANGELOG.md` — add an `Unreleased` entry.

---

## Task 1: Pure pace model `deriveHostPrepPace`

**Files:**
- Create: `front/features/host/model/host-prep-pace.ts`
- Test: `front/features/host/model/host-prep-pace.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `front/features/host/model/host-prep-pace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveHostPrepPace } from "./host-prep-pace";

const today = new Date(2026, 5, 4); // 2026-06-04 local

const ready = {
  hasSession: true,
  hasCoreSessionInfo: true,
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
  today,
};

describe("deriveHostPrepPace", () => {
  it("returns STEADY with null daysRemaining when there is no session", () => {
    const pace = deriveHostPrepPace({ ...ready, hasSession: false, sessionDate: null });
    expect(pace.tier).toBe("STEADY");
    expect(pace.daysRemaining).toBeNull();
    expect(pace.mostUrgentItem).toBeNull();
  });

  it("returns STEADY pre-session when nothing is pending", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-10" });
    expect(pace.tier).toBe("STEADY");
    expect(pace.daysRemaining).toBe(6);
  });

  it("returns ON_TRACK when a pending item has comfortable slack", () => {
    // D-16, rsvp threshold 3 -> slack 13
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-20", rsvpPending: 2 });
    expect(pace.tier).toBe("ON_TRACK");
    expect(pace.mostUrgentItem?.id).toBe("rsvp");
  });

  it("returns ON_TRACK at the slack boundary (slack 2)", () => {
    // D-5, rsvp threshold 3 -> slack 2
    expect(deriveHostPrepPace({ ...ready, sessionDate: "2026-06-09", rsvpPending: 1 }).tier).toBe("ON_TRACK");
  });

  it("returns TIGHT when a pending item is at its deadline window (slack 0)", () => {
    // D-3, rsvp threshold 3 -> slack 0
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-07", rsvpPending: 1 });
    expect(pace.tier).toBe("TIGHT");
    expect(pace.mostUrgentItem?.id).toBe("rsvp");
  });

  it("returns URGENT when a pending item is past its deadline window (slack < 0)", () => {
    // D-1, rsvp threshold 3 -> slack -2
    expect(deriveHostPrepPace({ ...ready, sessionDate: "2026-06-05", rsvpPending: 1 }).tier).toBe("URGENT");
  });

  it("treats missing core info against the D-7 window", () => {
    // D-2, session-basics threshold 7 -> slack -5 -> URGENT
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-06", hasCoreSessionInfo: false });
    expect(pace.tier).toBe("URGENT");
    expect(pace.mostUrgentItem?.id).toBe("session-basics");
  });

  it("picks the most urgent (lowest slack) item when several are pending", () => {
    // D-10: session-basics slack 3, rsvp slack 7 -> most urgent = session-basics, slack 3 -> ON_TRACK
    const pace = deriveHostPrepPace({
      ...ready,
      sessionDate: "2026-06-14",
      hasCoreSessionInfo: false,
      rsvpPending: 1,
    });
    expect(pace.mostUrgentItem?.id).toBe("session-basics");
    expect(pace.tier).toBe("ON_TRACK");
  });

  it("returns OVERDUE after the meeting day when closeout work remains", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-01", publishPending: 1 });
    expect(pace.tier).toBe("OVERDUE");
    expect(pace.daysRemaining).toBe(-3);
  });

  it("returns STEADY after the meeting day when no closeout work remains", () => {
    expect(deriveHostPrepPace({ ...ready, sessionDate: "2026-06-01" }).tier).toBe("STEADY");
  });

  it("returns ON_TRACK with null daysRemaining when date is unparseable but work is pending", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "nope", rsvpPending: 1 });
    expect(pace.tier).toBe("ON_TRACK");
    expect(pace.daysRemaining).toBeNull();
  });

  it("returns STEADY with null daysRemaining when date is unparseable and nothing is pending", () => {
    expect(deriveHostPrepPace({ ...ready, sessionDate: null }).tier).toBe("STEADY");
  });

  it("always exposes a label and message", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-05", rsvpPending: 2 });
    expect(pace.label).toBe("임박");
    expect(pace.message).toContain("RSVP 미응답 2명");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir front test host-prep-pace`
Expected: FAIL — `deriveHostPrepPace` is not defined / module not found.

- [ ] **Step 3: Write the model**

Create `front/features/host/model/host-prep-pace.ts`:

```ts
export type HostPrepPaceTier = "STEADY" | "ON_TRACK" | "TIGHT" | "URGENT" | "OVERDUE";

export type HostPrepPaceItemId = "session-basics" | "rsvp" | "checkin";

export type HostPrepPaceInput = {
  hasSession: boolean;
  sessionDate: string | null | undefined; // YYYY-MM-DD (meeting day = deadline)
  hasCoreSessionInfo: boolean;
  rsvpPending: number;
  checkinMissing: number;
  publishPending: number;
  feedbackPending: number;
  today?: Date;
};

export type HostPrepPaceItem = {
  id: HostPrepPaceItemId;
  daysRemaining: number;
  threshold: number;
  slack: number;
};

export type HostPrepPace = {
  tier: HostPrepPaceTier;
  daysRemaining: number | null;
  label: string;
  message: string;
  mostUrgentItem: HostPrepPaceItem | null;
};

const ITEM_THRESHOLDS: Record<HostPrepPaceItemId, number> = {
  "session-basics": 7,
  rsvp: 3,
  checkin: 1,
};

const TIGHT_SLACK = 1;

const PACE_LABELS: Record<HostPrepPaceTier, string> = {
  STEADY: "여유",
  ON_TRACK: "적정",
  TIGHT: "촉박",
  URGENT: "임박",
  OVERDUE: "마감 지남",
};

function nonNeg(value: number): number {
  return Math.max(0, value);
}

function daysUntil(sessionDate: string | null | undefined, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate ?? "");
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - current.getTime()) / 86_400_000);
}

function collectPending(input: HostPrepPaceInput, daysRemaining: number): HostPrepPaceItem[] {
  const items: HostPrepPaceItem[] = [];
  const add = (id: HostPrepPaceItemId) => {
    const threshold = ITEM_THRESHOLDS[id];
    items.push({ id, daysRemaining, threshold, slack: daysRemaining - threshold });
  };
  if (!input.hasCoreSessionInfo) add("session-basics");
  if (nonNeg(input.rsvpPending) > 0) add("rsvp");
  if (nonNeg(input.checkinMissing) > 0) add("checkin");
  return items;
}

function itemDetail(id: HostPrepPaceItemId, input: HostPrepPaceInput): string {
  switch (id) {
    case "session-basics":
      return "책 정보·일정·미팅 URL";
    case "rsvp":
      return `RSVP 미응답 ${nonNeg(input.rsvpPending)}명`;
    case "checkin":
      return `읽기 진행률 미작성 ${nonNeg(input.checkinMissing)}명`;
  }
}

function result(
  tier: HostPrepPaceTier,
  daysRemaining: number | null,
  message: string,
  mostUrgentItem: HostPrepPaceItem | null,
): HostPrepPace {
  return { tier, daysRemaining, label: PACE_LABELS[tier], message, mostUrgentItem };
}

export function deriveHostPrepPace(input: HostPrepPaceInput): HostPrepPace {
  const today = input.today ?? new Date();

  if (!input.hasSession) {
    return result("STEADY", null, "열린 세션이 없어요. 새 세션을 만들면 준비 페이스가 표시됩니다.", null);
  }

  const daysRemaining = daysUntil(input.sessionDate, today);
  const hasCloseout = nonNeg(input.publishPending) > 0 || nonNeg(input.feedbackPending) > 0;

  if (daysRemaining === null) {
    const pending = collectPending(input, 0);
    if (pending.length === 0) {
      return result("STEADY", null, "지금 준비할 항목이 없어요.", null);
    }
    return result("ON_TRACK", null, "세션 날짜를 확정하면 준비 페이스를 정확히 볼 수 있어요.", null);
  }

  if (daysRemaining < 0) {
    if (hasCloseout) {
      return result(
        "OVERDUE",
        daysRemaining,
        "모임일이 지났는데 마감 정리가 남았어요. 공개 요약·피드백 문서를 마무리하세요.",
        null,
      );
    }
    return result("STEADY", daysRemaining, "모임일이 지났고 마감 정리도 끝났어요.", null);
  }

  const pending = collectPending(input, daysRemaining);
  if (pending.length === 0) {
    return result("STEADY", daysRemaining, "모임 전 준비가 안정적이에요.", null);
  }

  const mostUrgent = pending.reduce((a, b) => (b.slack < a.slack ? b : a));
  const detail = itemDetail(mostUrgent.id, input);

  if (mostUrgent.slack < 0) {
    return result(
      "URGENT",
      daysRemaining,
      `${detail} — 이미 준비 마감창(D-${mostUrgent.threshold})을 넘겼어요. 지금 처리하세요.`,
      mostUrgent,
    );
  }
  if (mostUrgent.slack <= TIGHT_SLACK) {
    return result(
      "TIGHT",
      daysRemaining,
      `${detail} — 마감창(D-${mostUrgent.threshold})이 가까워요. 곧 처리하세요.`,
      mostUrgent,
    );
  }
  return result("ON_TRACK", daysRemaining, `${detail}이 남았지만 아직 여유 있어요.`, mostUrgent);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir front test host-prep-pace`
Expected: PASS — all `deriveHostPrepPace` cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-prep-pace.ts front/features/host/model/host-prep-pace.test.ts
git commit -m "feat(front): add host session-prep pace model"
```

---

## Task 2: Adapter `hostPrepPaceInputFrom`

**Files:**
- Modify: `front/features/host/model/host-prep-pace.ts`
- Test: `front/features/host/model/host-prep-pace.test.ts` (append)

This adapter maps the existing dashboard types into `HostPrepPaceInput`. `hasCoreSessionInfo` mirrors the checklist's core-info check (`getHostDashboardChecklist` in `host-dashboard-model.ts`) and additionally requires a meeting URL, because the pace's `session-basics` window (D-7) covers "책 정보·일정·미팅 URL".

- [ ] **Step 1: Write the failing tests**

Append to `front/features/host/model/host-prep-pace.test.ts`:

```ts
import { hostPrepPaceInputFrom } from "./host-prep-pace";
import type { HostDashboardCurrentSession, HostDashboardData } from "./host-dashboard-model";

const baseData: HostDashboardData = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
};

const fullSession: HostDashboardCurrentSession = {
  sessionId: "s1",
  sessionNumber: 3,
  bookTitle: "책",
  bookAuthor: "저자",
  date: "2026-06-10",
  startTime: "19:00",
  locationLabel: "온라인",
  meetingUrl: "https://example.test/meet",
  myCheckin: null,
  attendees: [],
  board: { questions: [] },
};

describe("hostPrepPaceInputFrom", () => {
  it("reports no session and incomplete core info when session is null", () => {
    const input = hostPrepPaceInputFrom(null, baseData);
    expect(input.hasSession).toBe(false);
    expect(input.hasCoreSessionInfo).toBe(false);
    expect(input.sessionDate).toBeNull();
  });

  it("reports complete core info for a fully filled session", () => {
    const input = hostPrepPaceInputFrom(fullSession, baseData);
    expect(input.hasSession).toBe(true);
    expect(input.hasCoreSessionInfo).toBe(true);
    expect(input.sessionDate).toBe("2026-06-10");
  });

  it("treats a missing meeting URL as incomplete core info", () => {
    const input = hostPrepPaceInputFrom({ ...fullSession, meetingUrl: null }, baseData);
    expect(input.hasCoreSessionInfo).toBe(false);
  });

  it("clamps negative pending counts to zero", () => {
    const input = hostPrepPaceInputFrom(fullSession, {
      rsvpPending: -2,
      checkinMissing: -1,
      publishPending: -5,
      feedbackPending: -3,
    });
    expect(input.rsvpPending).toBe(0);
    expect(input.checkinMissing).toBe(0);
    expect(input.publishPending).toBe(0);
    expect(input.feedbackPending).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir front test host-prep-pace`
Expected: FAIL — `hostPrepPaceInputFrom` is not exported.

- [ ] **Step 3: Add the adapter**

Add to the top of `front/features/host/model/host-prep-pace.ts` (imports) and bottom (function):

At the top, add the import:

```ts
import { nonNegativeDashboardCount, type HostDashboardCurrentSession, type HostDashboardData } from "./host-dashboard-model";
```

At the bottom, add:

```ts
export function hostPrepPaceInputFrom(
  session: HostDashboardCurrentSession | null,
  data: HostDashboardData,
  today?: Date,
): HostPrepPaceInput {
  const hasCoreSessionInfo = Boolean(
    session &&
      session.bookTitle.trim() &&
      session.bookAuthor.trim() &&
      session.date &&
      session.startTime &&
      session.locationLabel.trim() &&
      session.meetingUrl?.trim(),
  );

  return {
    hasSession: session !== null,
    sessionDate: session?.date ?? null,
    hasCoreSessionInfo,
    rsvpPending: nonNegativeDashboardCount(data.rsvpPending),
    checkinMissing: nonNegativeDashboardCount(data.checkinMissing),
    publishPending: nonNegativeDashboardCount(data.publishPending),
    feedbackPending: nonNegativeDashboardCount(data.feedbackPending),
    today,
  };
}
```

Note: `nonNeg` (local) and `nonNegativeDashboardCount` (imported) both clamp to ≥ 0; the adapter uses the shared `nonNegativeDashboardCount` to stay aligned with the dashboard model. This import is one-directional — `host-dashboard-model.ts` does not import `host-prep-pace.ts`, so no cycle is introduced.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir front test host-prep-pace`
Expected: PASS — model + adapter cases all green.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-prep-pace.ts front/features/host/model/host-prep-pace.test.ts
git commit -m "feat(front): map dashboard state into host prep pace input"
```

---

## Task 3: `HostPrepPaceNote` presentational component

**Files:**
- Create: `front/features/host/ui/dashboard/host-prep-pace-note.tsx`
- Test: `front/features/host/ui/dashboard/host-prep-pace-note.test.tsx`

This mirrors the member-side `ReadingPaceNote` (`front/features/current-session/ui/current-session-panels.tsx`): a pill badge with the tier label plus a one-line message, always exposing a text label and `aria-label` (never color-only).

- [ ] **Step 1: Write the failing test**

Create `front/features/host/ui/dashboard/host-prep-pace-note.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostPrepPaceNote } from "./host-prep-pace-note";

describe("HostPrepPaceNote", () => {
  it("renders the tier label and message with an accessible label", () => {
    render(
      <HostPrepPaceNote
        pace={{
          tier: "URGENT",
          daysRemaining: 1,
          label: "임박",
          message: "RSVP 미응답 2명 — 이미 준비 마감창(D-3)을 넘겼어요. 지금 처리하세요.",
          mostUrgentItem: { id: "rsvp", daysRemaining: 1, threshold: 3, slack: -2 },
        }}
      />,
    );

    expect(screen.getByText("임박")).toBeInTheDocument();
    expect(screen.getByLabelText("준비 페이스: 임박")).toBeInTheDocument();
    expect(screen.getByText(/RSVP 미응답 2명/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir front test host-prep-pace-note`
Expected: FAIL — module `./host-prep-pace-note` not found.

- [ ] **Step 3: Write the component**

Create `front/features/host/ui/dashboard/host-prep-pace-note.tsx`:

```tsx
import type { HostPrepPace, HostPrepPaceTier } from "@/features/host/model/host-prep-pace";

const HOST_PREP_PACE_ACCENT: Record<HostPrepPaceTier, string> = {
  STEADY: "var(--ok)",
  ON_TRACK: "var(--ok)",
  TIGHT: "var(--accent)",
  URGENT: "var(--warn)",
  OVERDUE: "var(--warn)",
};

export function HostPrepPaceNote({ pace }: { pace: HostPrepPace }) {
  const accent = HOST_PREP_PACE_ACCENT[pace.tier];

  return (
    <div className="row" style={{ gap: "8px", marginTop: "10px", alignItems: "baseline" }}>
      <span
        className="tiny"
        aria-label={`준비 페이스: ${pace.label}`}
        style={{
          flexShrink: 0,
          padding: "2px 8px",
          borderRadius: "999px",
          fontWeight: 600,
          color: accent,
          background: "var(--surface-quiet, var(--bg-sub))",
          border: `1px solid ${accent}`,
        }}
      >
        {pace.label}
      </span>
      <span className="tiny" style={{ color: "var(--text-3)" }}>
        {pace.message}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir front test host-prep-pace-note`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/dashboard/host-prep-pace-note.tsx front/features/host/ui/dashboard/host-prep-pace-note.test.tsx
git commit -m "feat(front): add host prep pace note component"
```

---

## Task 4: Wire the pace into `NextActionCard` (desktop + mobile)

**Files:**
- Modify: `front/features/host/ui/dashboard/shared-sections.tsx:156-218` (`NextActionCard`)
- Modify: `front/features/host/ui/host-dashboard.tsx` (compute + pass pace, desktop)
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx` (compute + pass pace, mobile)
- Test: `front/features/host/ui/host-dashboard.test.tsx` (append assertion)

`NextActionCard` is rendered by both the desktop dashboard and the mobile dashboard, so adding the pace there covers both surfaces with one component change.

- [ ] **Step 1: Write the failing test**

Append a test to `front/features/host/ui/host-dashboard.test.tsx` (inside the existing `describe("HostDashboard", ...)` block):

```tsx
  it("renders the session-prep pace badge", () => {
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    expect(screen.getAllByLabelText(/준비 페이스:/).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir front test host-dashboard.test`
Expected: FAIL — no element with an accessible name matching `/준비 페이스:/`.

- [ ] **Step 3: Add the `pace` prop to `NextActionCard`**

In `front/features/host/ui/dashboard/shared-sections.tsx`, add the import near the other model imports at the top of the file:

```tsx
import type { HostPrepPace } from "@/features/host/model/host-prep-pace";
import { HostPrepPaceNote } from "./host-prep-pace-note";
```

Change the `NextActionCard` signature to accept `pace` (add the prop to the destructure and the type):

```tsx
export function NextActionCard({
  action,
  pace,
  mobile = false,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: {
  action: NextOperationAction;
  pace: HostPrepPace;
  mobile?: boolean;
  LinkComponent: HostDashboardLinkComponent;
  hostDashboardReturnTarget: ReadmatesReturnTarget;
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
```

Then render the note inside `body`, immediately after the `action.loopBridge` paragraph:

```tsx
      <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
        {action.loopBridge}
      </p>
      <HostPrepPaceNote pace={pace} />
```

- [ ] **Step 4: Pass the pace from the desktop dashboard**

In `front/features/host/ui/host-dashboard.tsx`, add the import near the other host-model imports (the block importing from `@/features/host/model/host-dashboard-model`):

```tsx
import { deriveHostPrepPace, hostPrepPaceInputFrom } from "@/features/host/model/host-prep-pace";
```

After the existing `const nextAction = getHostDashboardNextOperationAction(session, data, missingMembers);` line (around line 165), add:

```tsx
  const prepPace = deriveHostPrepPace(hostPrepPaceInputFrom(session, data));
```

Pass it to the desktop `NextActionCard` (around line 469):

```tsx
                <NextActionCard
                  action={nextAction}
                  pace={prepPace}
                  LinkComponent={LinkComponent}
                  hostDashboardReturnTarget={hostDashboardReturnTarget}
                  readmatesReturnState={readmatesReturnState}
                />
```

And pass it to `MobileHostDashboard` (around line 550, alongside `nextAction={nextAction}`):

```tsx
        nextAction={nextAction}
        prepPace={prepPace}
```

- [ ] **Step 5: Accept and forward the pace in the mobile dashboard**

In `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`:

Add the import near the other model imports:

```tsx
import type { HostPrepPace } from "@/features/host/model/host-prep-pace";
```

Add `prepPace` to the component's destructured props (near `nextAction` at line ~41) and to its props type (near `nextAction: NextOperationAction;` at line ~66):

```tsx
  nextAction,
  prepPace,
```

```tsx
  nextAction: NextOperationAction;
  prepPace: HostPrepPace;
```

Pass it to the mobile `NextActionCard` (around line 145):

```tsx
        <NextActionCard
          action={nextAction}
          pace={prepPace}
          mobile
          LinkComponent={LinkComponent}
          hostDashboardReturnTarget={hostDashboardReturnTarget}
          readmatesReturnState={readmatesReturnState}
        />
```

Note: confirm the existing mobile `NextActionCard` call's exact props while editing and only add `pace={prepPace}` — do not drop existing props such as `mobile`.

- [ ] **Step 6: Run the dashboard test to verify it passes**

Run: `pnpm --dir front test host-dashboard.test`
Expected: PASS — `getAllByLabelText(/준비 페이스:/)` finds at least one node, and the existing `findUnnamedInteractiveElements` assertion still passes (the note is non-interactive).

- [ ] **Step 7: Run the full frontend gate**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add front/features/host/ui/dashboard/shared-sections.tsx front/features/host/ui/host-dashboard.tsx front/features/host/ui/dashboard/mobile-host-dashboard.tsx front/features/host/ui/host-dashboard.test.tsx
git commit -m "feat(front): show host prep pace on the dashboard next action"
```

---

## Task 5: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add an `Unreleased` entry**

Under `## Unreleased` → `### Added`, add a bullet (Korean, matching the surrounding style):

```markdown
- **host 회차 준비 페이스:** 호스트 대시보드의 다음 운영 행동에 회차 준비 페이스 배지를 더했습니다. 책 정보·RSVP·읽기 진행률 등 준비 항목을 기존 체크리스트의 D-7/D-3/D-1 마감창에 매핑해, 모임일까지 남은 일수 대비 가장 급한 항목과 전체 페이스(여유/적정/촉박/임박/마감 지남)를 한눈에 보여 줍니다. 배지는 색상에 더해 항상 텍스트 라벨과 `aria-label`을 노출합니다. DB migration·API contract·auth/BFF 토큰 변경은 없습니다.
```

- [ ] **Step 2: Verify the changelog diff is clean**

Run: `git diff --check -- CHANGELOG.md`
Expected: no whitespace errors.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for host session-prep pace"
```

---

## Self-Review Notes (resolved during planning)

- **Spec coverage:** §5.1 model → Task 1; §5.2 deadline-window mapping + §5.3 tier rules → Task 1; adapter/`hasCoreSessionInfo` → Task 2; §5.4 UI badge + aria-label → Tasks 3–4; §5.5 server change 0 → no server task; §6 verification → Task 4 step 7; CHANGELOG (§8) → Task 5.
- **Type consistency:** `deriveHostPrepPace`, `hostPrepPaceInputFrom`, `HostPrepPace`, `HostPrepPaceTier`, `HostPrepPaceItem`, `HostPrepPaceItemId`, and the `pace` prop names are identical across model, component, and call sites.
- **Boundary preservation:** all changes live under `front/features/host/**`; no admin or member surface, no server/contract change, no admin import — the admin↔host frontend boundary test is untouched.
- **Honesty:** null/unparseable date and no-session paths return non-fabricated tiers (`STEADY`/`ON_TRACK` with `daysRemaining: null`), mirroring the member pace model.
