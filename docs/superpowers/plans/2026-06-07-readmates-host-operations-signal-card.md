# Host Operations Signal Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the desktop host dashboard `운영 신호` card from an unstyled read-only metric list into a host-safe operating judgment card with readiness badge, summary copy, 2x2 metrics, blockers, and action links.

**Architecture:** Keep the existing route/query/API/server contract unchanged. All display derivation stays inside `HostClubOperationsCard` as small pure helpers; the UI still receives only `HostClubOperationsSnapshot` props and imports only `shared/model/club-operations`. Styling is scoped to `host-club-ops` selectors in `front/src/styles/globals.css`, and mobile host dashboard behavior remains unchanged.

**Tech Stack:** React, TypeScript, React Testing Library, Vitest, Playwright E2E, Vite frontend CSS.

---

## File Structure

- Modify `front/features/host/ui/host-club-operations-card.test.tsx`
  - Owns the component-level contract for READY, blockers, AI failure delta, host-safe links, and no mutation buttons.
- Modify `front/features/host/ui/host-club-operations-card.tsx`
  - Owns local display helpers and the presentational JSX for the card.
- Modify `front/src/styles/globals.css`
  - Owns scoped card styles: wrapper, header, readiness badge tones, summary, metrics grid, blockers, action cluster, and responsive safeguards.
- Modify `front/tests/e2e/host-club-operations.spec.ts`
  - Pins public-safe desktop evidence to the upgraded card copy and links while preserving existing mobile summary checks.
- Do not modify server files, route loaders, query files, `front/shared/model/club-operations.ts`, or `MobileHostDashboard`.

---

### Task 1: Component Contract Tests

**Files:**
- Modify: `front/features/host/ui/host-club-operations-card.test.tsx`
- Test: `front/features/host/ui/host-club-operations-card.test.tsx`

- [ ] **Step 1: Replace the current test file with the expanded contract**

Use this complete file content:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { HostClubOperationsCard } from "./host-club-operations-card";

function snapshot(overrides: Partial<HostClubOperationsSnapshot> = {}): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-05-31T00:00:00Z",
    club: { clubId: "club-1", slug: "club-one", name: "Club One" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    sessionProgress: {
      upcomingCount: 1,
      currentOpenCount: 1,
      closedCount: 4,
      publishedRecordCount: 3,
      incompleteRecordCount: 0,
    },
    aiUsage: {
      activeJobs: 1,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.5000",
      state: "READY",
      priorFailedJobs7d: 0,
    },
    ...overrides,
  };
}

describe("HostClubOperationsCard", () => {
  it("renders a READY operating judgment with host-safe links", () => {
    render(<HostClubOperationsCard snapshot={snapshot()} />);

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByRole("heading", { name: "운영 신호" })).toBeInTheDocument();
    expect(within(card).getByText("READY")).toBeInTheDocument();
    expect(within(card).getByText("현재 막힌 항목은 없습니다. 열린 세션을 기준으로 운영을 이어갈 수 있습니다.")).toBeInTheDocument();
    expect(within(card).getByText("열린 세션")).toBeInTheDocument();
    expect(within(card).getByText("마감 대기")).toBeInTheDocument();
    expect(within(card).getByText("AI 실패")).toBeInTheDocument();
    expect(within(card).getByText("전주 대비")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "세션 문서 열기" })).toHaveAttribute("href", "/app/host/sessions/new");
    expect(within(card).getByRole("link", { name: "알림 장부 보기" })).toHaveAttribute("href", "/app/host/notifications");
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("prioritizes blocking reasons over other signals", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          readiness: {
            state: "NEEDS_ATTENTION",
            blockingReasons: ["HOST_REQUIRED", "PUBLIC_METADATA_REQUIRED"],
            nextAction: null,
          },
          sessionProgress: {
            upcomingCount: 2,
            currentOpenCount: 1,
            closedCount: 4,
            publishedRecordCount: 3,
            incompleteRecordCount: 2,
          },
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 3,
            staleCandidates: 1,
            costEstimateUsd: "0.7500",
            state: "DEGRADED",
            priorFailedJobs7d: 1,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByText("NEEDS_ATTENTION")).toBeInTheDocument();
    expect(within(card).getByText("운영 준비를 막는 항목이 있습니다. 먼저 차단 사유를 확인하세요.")).toBeInTheDocument();
    expect(within(card).getByText("HOST_REQUIRED")).toBeInTheDocument();
    expect(within(card).getByText("PUBLIC_METADATA_REQUIRED")).toBeInTheDocument();
  });

  it("shows due-record guidance before AI guidance", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          sessionProgress: {
            upcomingCount: 1,
            currentOpenCount: 1,
            closedCount: 5,
            publishedRecordCount: 3,
            incompleteRecordCount: 2,
          },
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 1,
            staleCandidates: 0,
            costEstimateUsd: "0.5000",
            state: "DEGRADED",
            priorFailedJobs7d: 0,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByText("마감 대기 중인 세션 기록이 있습니다. 공개 전 기록 완성을 먼저 확인하세요.")).toBeInTheDocument();
    expect(within(card).getByText("2")).toBeInTheDocument();
  });

  it("shows AI failure delta guidance when recent failures increase", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 3,
            staleCandidates: 0,
            costEstimateUsd: "0.5000",
            state: "DEGRADED",
            priorFailedJobs7d: 1,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByText("최근 AI 실패가 늘었습니다. 알림 장부와 세션 준비 상태를 함께 확인하세요.")).toBeInTheDocument();
    expect(within(card).getByText("+2")).toBeInTheDocument();
  });

  it("does not create admin or mutation controls", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          readiness: { state: "BLOCKED", blockingReasons: ["AI_RECOVERY_REQUIRED"], nextAction: "ADMIN_ROUTE" },
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 5,
            staleCandidates: 2,
            costEstimateUsd: "1.2500",
            state: "DEGRADED",
            priorFailedJobs7d: 0,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).queryByText("ADMIN_ROUTE")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).getAllByRole("link")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the focused unit test and verify it fails**

Run:

```bash
pnpm --dir front test -- host-club-operations-card
```

Expected: FAIL. The failures should mention missing judgment copy, missing links, and outdated card structure.

- [ ] **Step 3: Commit is not allowed yet**

Do not commit after this task. The failing tests are intentional and must be paired with the implementation in Task 2.

---

### Task 2: Component Implementation

**Files:**
- Modify: `front/features/host/ui/host-club-operations-card.tsx`
- Test: `front/features/host/ui/host-club-operations-card.test.tsx`

- [ ] **Step 1: Replace the component with local display helpers and upgraded JSX**

Use this complete file content:

```tsx
import { clubAiFailureDelta, type HostClubOperationsSnapshot } from "@/shared/model/club-operations";

type ReadinessTone = "ok" | "warn" | "neutral";

type OperatingMetric = {
  helper: string;
  label: string;
  value: string;
};

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function nonNegative(value: number): number {
  return Math.max(0, value);
}

function readinessTone(state: string, blockers: string[]): ReadinessTone {
  if (blockers.length > 0) return "warn";
  if (state === "READY") return "ok";
  return "neutral";
}

function operatingSummary(snapshot: HostClubOperationsSnapshot): string {
  const aiDelta = clubAiFailureDelta(snapshot.aiUsage);

  if (snapshot.readiness.blockingReasons.length > 0) {
    return "운영 준비를 막는 항목이 있습니다. 먼저 차단 사유를 확인하세요.";
  }

  if (snapshot.sessionProgress.incompleteRecordCount > 0) {
    return "마감 대기 중인 세션 기록이 있습니다. 공개 전 기록 완성을 먼저 확인하세요.";
  }

  if (snapshot.aiUsage.failedRecentJobs > 0 || aiDelta > 0) {
    return "최근 AI 실패가 늘었습니다. 알림 장부와 세션 준비 상태를 함께 확인하세요.";
  }

  if (snapshot.readiness.state === "READY") {
    return "현재 막힌 항목은 없습니다. 열린 세션을 기준으로 운영을 이어갈 수 있습니다.";
  }

  return "운영 상태 확인이 필요합니다. 세션 문서와 알림 장부를 함께 점검하세요.";
}

function operatingMetrics(snapshot: HostClubOperationsSnapshot): OperatingMetric[] {
  const aiDelta = clubAiFailureDelta(snapshot.aiUsage);

  return [
    {
      label: "열린 세션",
      value: String(nonNegative(snapshot.sessionProgress.currentOpenCount)),
      helper: "현재 진행 중",
    },
    {
      label: "마감 대기",
      value: String(nonNegative(snapshot.sessionProgress.incompleteRecordCount)),
      helper: "기록 완성 필요",
    },
    {
      label: "AI 실패",
      value: `${nonNegative(snapshot.aiUsage.failedRecentJobs)}건`,
      helper: "최근 7일",
    },
    {
      label: "전주 대비",
      value: formatDelta(aiDelta),
      helper: "AI 실패 변화",
    },
  ];
}

export function HostClubOperationsCard({ snapshot }: { snapshot: HostClubOperationsSnapshot }) {
  const tone = readinessTone(snapshot.readiness.state, snapshot.readiness.blockingReasons);
  const metrics = operatingMetrics(snapshot);

  return (
    <section className="host-club-ops" aria-label="운영 신호">
      <div className="host-club-ops__header">
        <h2>운영 신호</h2>
        <span className={`host-club-ops__badge host-club-ops__badge--${tone}`}>{snapshot.readiness.state}</span>
      </div>

      <p className="host-club-ops__summary">{operatingSummary(snapshot)}</p>

      <dl className="host-club-ops__grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="host-club-ops__metric">
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <span>{metric.helper}</span>
          </div>
        ))}
      </dl>

      {snapshot.readiness.blockingReasons.length > 0 ? (
        <ul className="host-club-ops__blockers" aria-label="차단 사유">
          {snapshot.readiness.blockingReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="host-club-ops__actions" aria-label="운영 신호 조치">
        <a className="btn btn-quiet btn-sm" href="/app/host/sessions/new">
          세션 문서 열기
        </a>
        <a className="btn btn-ghost btn-sm" href="/app/host/notifications">
          알림 장부 보기
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run the focused unit test and verify it passes**

Run:

```bash
pnpm --dir front test -- host-club-operations-card
```

Expected: PASS. The output should show the `HostClubOperationsCard` test file passing.

- [ ] **Step 3: Commit the component and unit test changes**

Run:

```bash
git add front/features/host/ui/host-club-operations-card.tsx front/features/host/ui/host-club-operations-card.test.tsx
git commit -m "feat(front): upgrade host operations signal card"
```

Expected: commit succeeds with only the component and test files staged.

---

### Task 3: Scoped Card Styling

**Files:**
- Modify: `front/src/styles/globals.css`
- Test: `front/features/host/ui/host-club-operations-card.test.tsx`

- [ ] **Step 1: Add scoped CSS near the host dashboard styles**

Insert this block after `.rm-host-dashboard-desktop__summary`:

```css
.host-club-ops {
  display: grid;
  gap: 14px;
  margin-top: 24px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--bg-raised);
}

.host-club-ops__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.host-club-ops__header h2 {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--text-2);
  text-transform: uppercase;
}

.host-club-ops__badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  max-width: 100%;
  padding: 3px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text-2);
  background: var(--bg-sub);
  overflow-wrap: anywhere;
}

.host-club-ops__badge--ok {
  border-color: color-mix(in oklch, var(--ok), var(--line) 48%);
  color: var(--ok);
  background: color-mix(in oklch, var(--ok), transparent 90%);
}

.host-club-ops__badge--warn {
  border-color: color-mix(in oklch, var(--warn), var(--line) 42%);
  color: var(--warn);
  background: color-mix(in oklch, var(--warn), transparent 88%);
}

.host-club-ops__badge--neutral {
  border-color: var(--line);
  color: var(--text-2);
  background: var(--bg-sub);
}

.host-club-ops__summary {
  margin: 0;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.55;
}

.host-club-ops__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.host-club-ops__metric {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-2);
  background: var(--bg-sub);
}

.host-club-ops__metric dt {
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.25;
  font-weight: 700;
}

.host-club-ops__metric dd {
  margin: 0;
  color: var(--text);
  font-family: var(--font-editorial);
  font-size: 20px;
  line-height: 1.15;
}

.host-club-ops__metric span {
  color: var(--text-4);
  font-size: 11.5px;
  line-height: 1.3;
}

.host-club-ops__blockers {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px 0 0 18px;
  border-top: 1px solid var(--line-soft);
  color: var(--warn);
  font-size: 12.5px;
  line-height: 1.45;
}

.host-club-ops__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

- [ ] **Step 2: Run CSS and unit checks**

Run:

```bash
git diff --check -- front/src/styles/globals.css
pnpm --dir front test -- host-club-operations-card
```

Expected: `git diff --check` exits 0 and the focused unit test passes.

- [ ] **Step 3: Commit the scoped CSS**

Run:

```bash
git add front/src/styles/globals.css
git commit -m "style(front): polish host operations signal card"
```

Expected: commit succeeds with only `front/src/styles/globals.css` staged.

---

### Task 4: E2E Evidence Update

**Files:**
- Modify: `front/tests/e2e/host-club-operations.spec.ts`
- Test: `front/tests/e2e/host-club-operations.spec.ts`

- [ ] **Step 1: Update the desktop assertion helper**

Replace `expectHostOperatingSignalCardPublicSafe` with this function:

```ts
async function expectHostOperatingSignalCardPublicSafe(page: Page): Promise<void> {
  const card = page.getByRole("region", { name: "운영 신호" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "운영 신호" })).toBeVisible();
  await expect(card.getByText("READY")).toBeVisible();
  await expect(card.getByText("마감 대기 중인 세션 기록이 있습니다. 공개 전 기록 완성을 먼저 확인하세요.")).toBeVisible();
  await expect(card.getByText("열린 세션")).toBeVisible();
  await expect(card.getByText("AI 실패")).toBeVisible();
  await expect(card.getByText("전주 대비")).toBeVisible();
  await expect(card.getByRole("link", { name: "세션 문서 열기" })).toBeVisible();
  await expect(card.getByRole("link", { name: "알림 장부 보기" })).toBeVisible();
  await expectNoHostPrivateSentinels(page);
}
```

The fixture has `sessionProgress.incompleteRecordCount: 1`, so the expected summary is the due-record guidance rather than the READY no-blocker guidance.

- [ ] **Step 2: Run the targeted E2E test**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
```

Expected: PASS. The desktop screenshot remains larger than 10,000 bytes, and the mobile test still asserts the existing mobile operating summary rather than the desktop card.

- [ ] **Step 3: Commit the E2E update**

Run:

```bash
git add front/tests/e2e/host-club-operations.spec.ts
git commit -m "test(front): pin host operations signal evidence"
```

Expected: commit succeeds with only the E2E spec staged.

---

### Task 5: Final Frontend Verification

**Files:**
- Verify: `front/features/host/ui/host-club-operations-card.tsx`
- Verify: `front/features/host/ui/host-club-operations-card.test.tsx`
- Verify: `front/src/styles/globals.css`
- Verify: `front/tests/e2e/host-club-operations.spec.ts`

- [ ] **Step 1: Run focused checks again**

Run:

```bash
pnpm --dir front test -- host-club-operations-card
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
```

Expected: both commands pass.

- [ ] **Step 2: Run standard frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands pass. If an unrelated existing failure appears, capture the exact command, failure text, and affected file before deciding whether it is in scope.

- [ ] **Step 3: Inspect changed diff for boundary and safety**

Run:

```bash
git diff --check
rg -n "ADMIN_ROUTE|member[0-9]+@example[.]com|private[.]example[.]com|\\{\\\"" front/features/host/ui/host-club-operations-card.tsx front/features/host/ui/host-club-operations-card.test.tsx front/tests/e2e/host-club-operations.spec.ts
```

Expected: `git diff --check` exits 0. The `rg` command may match test sentinel assertions in `host-club-operations.spec.ts`, but it must not find sentinel strings in production source.

- [ ] **Step 4: Commit any verification-only adjustment**

If Task 5 required a small fix, commit it with:

```bash
git add front/features/host/ui/host-club-operations-card.tsx front/features/host/ui/host-club-operations-card.test.tsx front/src/styles/globals.css front/tests/e2e/host-club-operations.spec.ts
git commit -m "fix(front): stabilize host operations signal card"
```

Expected: commit only if files changed during Task 5. If no files changed, do not create a commit.

---

## Self-Review

- Spec coverage:
  - Desktop card polish: Task 2 and Task 3.
  - Existing contract only: Task 2 imports only `shared/model/club-operations` and adds no API/server changes.
  - Readiness badge, summary, 2x2 metrics, host-safe links: Task 1 and Task 2.
  - Blocking reasons: Task 1 and Task 2.
  - Mobile unchanged: Task 4 keeps `expectHostMobileOperatingSummaryPublicSafe` unchanged.
  - Public safety: Task 4 and Task 5 sentinel checks.
  - Tests: Tasks 1, 2, 4, and 5.
- Placeholder scan:
  - No placeholder requirements are left for implementation workers.
- Type consistency:
  - The plan uses existing `HostClubOperationsSnapshot`, `clubAiFailureDelta`, `sessionProgress.incompleteRecordCount`, `aiUsage.failedRecentJobs`, and `aiUsage.priorFailedJobs7d` names exactly as current code defines them.
