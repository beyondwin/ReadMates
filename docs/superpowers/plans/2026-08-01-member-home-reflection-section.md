# Member Home Reflection Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating `기록 보기` / `피드백 보기` button cluster with approved responsive document rows on the member home reflection section.

**Architecture:** Keep the member-home route, view model, feedback state, and href contracts unchanged. Add shared prop-driven presentation helpers inside `member-home-records.tsx`; desktop and mobile wrappers reuse the same document-row semantics while CSS controls two-column versus stacked layout.

**Tech Stack:** React 19, TypeScript, React Testing Library/Vitest, Playwright Component Testing, Vite CSS using existing ReadMates tokens.

## Global Constraints

- Preserve the route-first dependency direction and keep the UI module free of API, query, route, and fetch imports.
- Use only existing `--bg-sub`, `--line`, `--line-soft`, `--text`, `--text-2`, `--text-3`, and `--accent` design tokens.
- Keep `AVAILABLE` and `UNKNOWN` feedback states linkable; render `MISSING` and `LOCKED` as non-focusable static status rows.
- Keep every interactive document row at least 44px high and usable at 320px, 390px, and desktop widths.
- Preserve existing hrefs, feedback authorization meaning, recent-entry selection, and return-state continuity.
- Do not modify unrelated platform-admin or server worktree changes.
- Do not commit without a separate explicit commit request.

---

### Task 1: Encode the document-row behavior in unit tests

**Files:**
- Modify: `front/features/member-home/ui/member-home-records.test.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`

**Interfaces:**
- Consumes: existing `MemberHomeRecentRecordEntry` with `feedbackState`, `href`, `feedbackHref`, and `feedbackStatusLabel`.
- Produces: test contract for `모임 기록 보기`, `피드백 문서 보기`, `지난 모임 문서`, and non-link feedback states.

- [ ] **Step 1: Update the focused component assertions to describe the approved semantics**

```tsx
const documents = screen.getByRole("navigation", { name: "지난 모임 문서" });
expect(within(documents).getByRole("link", { name: /모임 기록 보기/ })).toHaveAttribute(
  "href",
  "/app/sessions/session-8",
);
expect(within(documents).getByRole("link", { name: /피드백 문서 보기/ })).toHaveAttribute(
  "href",
  "/app/feedback/session-8",
);
expect(screen.getByText("보존된 내용 · 질문 · 하이라이트")).toBeInTheDocument();
```

- [ ] **Step 2: Add explicit unavailable-state assertions**

```tsx
expect(screen.getByText("피드백 문서 보기")).toBeInTheDocument();
expect(screen.queryByRole("link", { name: /피드백 문서 보기/ })).not.toBeInTheDocument();
expect(screen.getByText("참석 멤버에게만 피드백 문서가 열립니다.")).toBeInTheDocument();
```

Repeat the same contract for `MISSING`, and assert the mobile variant exposes the same navigation name and hrefs.

- [ ] **Step 3: Update the member-home integration assertion to the new visible labels**

```tsx
expect(desktop.getByRole("link", { name: /모임 기록 보기/ })).toHaveAttribute(
  "href",
  "/app/sessions/session-6",
);
expect(desktop.getByRole("link", { name: /피드백 문서 보기/ })).toHaveAttribute(
  "href",
  "/app/feedback/session-6",
);
```

- [ ] **Step 4: Run the tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-records.test.tsx tests/unit/member-home.test.tsx
```

Expected: FAIL because the current component has no `지난 모임 문서` navigation and still exposes the old action labels.

### Task 2: Implement shared responsive document rows

**Files:**
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Consumes: `MemberHomeRecentRecordEntry` and `MemberHomeLinkComponent`.
- Produces: internal `RecentRecordDocuments` and `RecentRecordCopy` presentation helpers reused by desktop and mobile wrappers.

- [ ] **Step 1: Replace the fragment-based feedback action with one full destination row**

```tsx
function RecentRecordDestination({
  label,
  description,
  to,
  LinkComponent,
}: {
  label: string;
  description: string;
  to?: string;
  LinkComponent: MemberHomeLinkComponent;
}) {
  const content = (
    <>
      <span className="rm-recent-record__destination-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      {to ? <span className="rm-recent-record__destination-arrow" aria-hidden="true">→</span> : null}
    </>
  );

  return to ? (
    <Link to={to} className="rm-recent-record__destination" LinkComponent={LinkComponent}>
      {content}
    </Link>
  ) : (
    <div className="rm-recent-record__destination rm-recent-record__destination--static">{content}</div>
  );
}
```

- [ ] **Step 2: Add one shared document navigation helper**

```tsx
function RecentRecordDocuments({ entry, LinkComponent }: {
  entry: MemberHomeRecentRecordEntry;
  LinkComponent: MemberHomeLinkComponent;
}) {
  const feedbackHref =
    entry.feedbackState === "AVAILABLE" || entry.feedbackState === "UNKNOWN"
      ? entry.feedbackHref
      : undefined;

  return (
    <nav className="rm-recent-record__documents" aria-label="지난 모임 문서">
      <RecentRecordDestination
        label="모임 기록 보기"
        description="질문과 회고를 이어 읽기"
        to={entry.href}
        LinkComponent={LinkComponent}
      />
      <RecentRecordDestination
        label="피드백 문서 보기"
        description={entry.feedbackStatusLabel}
        to={feedbackHref}
        LinkComponent={LinkComponent}
      />
    </nav>
  );
}
```

- [ ] **Step 3: Reuse the copy and document helpers from both wrappers**

Desktop wrapper classes:

```tsx
<section className="surface-quiet rm-recent-record rm-recent-record--desktop" aria-label="지난 모임 회고">
  <div className="rm-recent-record__layout">
    <RecentRecordCopy entry={entry} />
    <RecentRecordDocuments entry={entry} LinkComponent={LinkComponent} />
  </div>
</section>
```

Mobile wrapper classes:

```tsx
<section className="m-sec" aria-label="지난 모임 회고">
  <div className="m-card-quiet rm-recent-record rm-recent-record--mobile">
    <RecentRecordCopy entry={entry} />
    <RecentRecordDocuments entry={entry} LinkComponent={LinkComponent} />
  </div>
</section>
```

- [ ] **Step 4: Add desktop layout and interaction styles**

Use a two-column grid with `minmax(0, 1fr)` and a 240–280px document column. Give each destination a minimum height of 64px, visible `:focus-visible`, wrapping copy, a divider between rows, and a stacked fallback at the existing desktop intermediate width.

- [ ] **Step 5: Add mobile stacked-row styles**

Remove inner card padding from the mobile wrapper, apply 18px to the copy area, put a horizontal divider before the document group, and make each destination full width with minimum height 56px. Ensure `min-width: 0`, `overflow-wrap: anywhere`, and non-shrinking arrow behavior.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-records.test.tsx tests/unit/member-home.test.tsx
```

Expected: PASS.

### Task 3: Add responsive component evidence

**Files:**
- Modify: `front/features/member-home/ui/member-home-records.ct.tsx`

**Interfaces:**
- Consumes: exported `RecentRecordEntry`, `MobileRecentRecordEntry`, and the existing `MemberHomeRecentRecordEntry` shape.
- Produces: layout, target-size, wrapping, and screenshot regression evidence at desktop and mobile widths.

- [ ] **Step 1: Add a long-content recent-entry fixture**

```tsx
const recentEntry = {
  sessionId: "session-8",
  sessionNumber: 8,
  bookTitle: "긴 한국어 제목과 deliberately expansive English title이 함께 있는 다음 책",
  date: "2026-06-18",
  kindLabels: ["질문", "한줄평", "하이라이트"],
  href: "/app/sessions/session-8",
  feedbackHref: "/app/feedback/session-8",
  feedbackState: "UNKNOWN" as const,
  feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
  returnStateLabel: "지난 모임 회고",
  summary: "긴 제목의 기록과 피드백을 이어 읽을 수 있어요.",
};
```

- [ ] **Step 2: Add desktop metrics and screenshot evidence**

At `1200 × 700`, mount `RecentRecordEntry`, assert the navigation is beside the copy using bounding boxes, both link heights are at least 44px, no text overflows horizontally, and save `member-home-recent-record-desktop.png` with `toHaveScreenshot`.

- [ ] **Step 3: Add 390px and 320px mobile metrics**

At `390 × 700`, mount `MobileRecentRecordEntry` inside `.mobile-only`, assert the document group begins below the copy, both link heights are at least 44px, and save `member-home-recent-record-mobile.png`. Repeat horizontal overflow assertions at 320px without adding a second screenshot unless it captures a distinct regression.

- [ ] **Step 4: Run focused component tests**

Run:

```bash
corepack pnpm --dir front test:ct -- member-home-records.ct.tsx
```

Expected: PASS with approved desktop/mobile screenshot baselines. If baselines do not yet exist, run the explicit update command once, inspect both generated images, then rerun without `--update-snapshots`.

### Task 4: Preserve user-flow assertions and verify the live page

**Files:**
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`

**Interfaces:**
- Consumes: existing fixture member login and recent-record route setup.
- Produces: end-to-end evidence that the renamed links preserve existing destinations.

- [ ] **Step 1: Update only the affected accessible-name assertions**

```tsx
await expect(recentRecord.getByRole("link", { name: /모임 기록 보기/ })).toHaveAttribute(
  "href",
  `/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}`,
);
await expect(recentRecord.getByRole("link", { name: /피드백 문서 보기/ })).toHaveAttribute(
  "href",
  `/clubs/${CLUB_SLUG}/app/feedback/${SESSION_ID}`,
);
```

- [ ] **Step 2: Run the focused E2E test**

Run:

```bash
corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect the running local page at desktop and mobile sizes**

Use the local fixture member on `/clubs/reading-sai/app`. Capture the `지난 모임 회고` region at desktop and 390px, confirm both document rows are connected to the card, and confirm browser console errors did not increase from the existing local baseline.

### Task 5: Run frontend gates and review scope

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: completed UI, tests, CSS, and screenshot baselines.
- Produces: final repository and responsive evidence.

- [ ] **Step 1: Run frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

- [ ] **Step 2: Run patch checks**

```bash
git diff --check -- \
  front/features/member-home/ui/member-home-records.tsx \
  front/features/member-home/ui/member-home-records.test.tsx \
  front/features/member-home/ui/member-home-records.ct.tsx \
  front/tests/unit/member-home.test.tsx \
  front/tests/e2e/host-session-record-preview.spec.ts \
  front/src/styles/globals.css \
  front/shared/styles/mobile.css \
  docs/superpowers/specs/2026-08-01-member-home-reflection-section-design.md \
  docs/superpowers/plans/2026-08-01-member-home-reflection-section.md
```

- [ ] **Step 3: Review final scope**

Confirm no model, API, query, route, server, BFF, migration, platform-admin, or unrelated generated files changed. Leave all implementation and documentation changes uncommitted unless the user separately asks for a commit.
