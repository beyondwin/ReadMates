# Member Recent Reading and Host AI Tool Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the member recent-reading cards with the archive visual language and rebuild the compact host AI-default tool as a clean operations-ledger row.

**Architecture:** Keep route data flow, API calls, permission states, and link behavior unchanged. Change the archive-owned recent-reading view model only for the canonical session label, keep presentation changes inside archive UI/CSS, and keep the AI tool's state machine inside its existing host UI component while changing only semantic class hooks and layout CSS.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Vite CSS, Playwright/manual browser evidence.

## Global Constraints

- Recent reading must display `No.07 · YYYY.MM.DD` rather than `7차 · YYYY.MM.DD`.
- Preserve `질문 N`, optional `서평 N`, and `피드백 O/제한/준비중` exactly as member-owned activity data.
- Do not add archive-owned attendance or publication badges to the member recent-reading card.
- Preserve AI capability gating, query/mutation behavior, copy, roles, labels, and disabled/loading/error/success states.
- Do not change APIs, BFF routes, Spring code, persistence, permissions, or the AI model allowlist.
- Use existing ReadMates warm paper, line, text, radius, focus, and motion tokens; add no gradient, glass, glow, or decorative animation.
- Validate desktop and mobile layouts, including narrow Korean wrapping and 44px mobile action targets.

---

### Task 1: Canonical recent-reading session identity

**Files:**
- Modify: `front/features/archive/model/my-reading-shelf-model.test.ts`
- Modify: `front/features/archive/model/my-reading-shelf-model.ts`

**Interfaces:**
- Consumes: `MyJourneyItem.sessionNumber: number`
- Produces: `RecentReadingPreviewItem.sessionNumberLabel: string` formatted as `No.${twoDigitNumber}`

- [ ] **Step 1: Write the failing model assertion**

Change the first recent item expectation to the hand-derived literal and add a single-digit case:

```ts
expect(buildRecentReadingPreview([
  journeyItem({ sessionNumber: 7 }),
])[0]?.sessionNumberLabel).toBe("No.07");
```

Update the existing `sessionNumber: 12` expectation to `sessionNumberLabel: "No.12"`.

- [ ] **Step 2: Run the focused model test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: FAIL because the current implementation returns `7차` and `12차`.

- [ ] **Step 3: Implement the canonical label**

In `buildRecentReadingPreview`, replace the Korean ordinal with the archive-compatible label:

```ts
sessionNumberLabel: `No.${String(item.sessionNumber).padStart(2, "0")}`,
```

- [ ] **Step 4: Run the focused model test and confirm GREEN**

Run the same Vitest command. Expected: all tests in the file pass.

- [ ] **Step 5: Commit the model contract**

```bash
git add front/features/archive/model/my-reading-shelf-model.ts front/features/archive/model/my-reading-shelf-model.test.ts
git commit -m "fix(front): align recent reading session labels"
```

### Task 2: Archive-aligned recent-reading card

**Files:**
- Modify: `front/features/archive/ui/my-page/recent-reading-list.test.tsx`
- Modify: `front/features/archive/ui/my-page/recent-reading-row.tsx`
- Modify: `front/features/archive/ui/my-page/member-space-regressions.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: `RecentReadingListItem`, including decorative cover metadata and member activity labels
- Produces: one semantic row link with an archive-style cover frame, book copy, member activity badges, and chevron

- [ ] **Step 1: Write failing presentation assertions**

Add assertions that catch replacement with the old compact row or accidental archive-state leakage:

```tsx
const row = screen.getByRole("link", { name: "샘플 도서 회차 기록" });
expect(row).toHaveClass("rm-recent-reading-row--archive-aligned");
expect(row.querySelector(".rm-recent-reading-row__cover-frame")).toBeInTheDocument();
expect(within(row).getByText("질문 2")).toBeVisible();
expect(within(row).getByText("피드백 O")).toBeVisible();
expect(within(row).queryByText(/참석/)).toBeNull();
expect(within(row).queryByText("비공개")).toBeNull();
```

Update fixtures from `7차`/`9차` to the canonical `No.07`/`No.09` labels.

- [ ] **Step 2: Run the focused component tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/recent-reading-list.test.tsx features/archive/ui/my-page/member-space-regressions.test.tsx
```

Expected: FAIL because the archive-aligned modifier and cover frame do not exist.

- [ ] **Step 3: Implement the semantic cover frame**

Keep the anchor and existing fallback behavior, adding explicit hooks:

```tsx
<a className="rm-recent-reading-row rm-recent-reading-row--archive-aligned" ...>
  <span className="rm-recent-reading-row__cover-frame">
    <RecentReadingCover item={item} />
  </span>
  ...
</a>
```

The cover image remains `alt=""`; the fallback remains `aria-hidden="true"`.

- [ ] **Step 4: Implement the responsive archive card styling**

Update `globals.css` so the list uses separated cards, each row has a quiet rounded border surface, the cover uses a 3:4 ratio with a soft offset shadow, and the meta line uses tabular/monospace treatment. Keep the existing focus ring, hover feedback, and reduced-motion behavior. At `max-width: 767px`, use a three-column cover/body/chevron grid and place activity below the book copy without overlap.

- [ ] **Step 5: Run the focused component tests and confirm GREEN**

Run the same two-file Vitest command. Expected: all tests pass with no warnings.

- [ ] **Step 6: Commit the member UI slice**

```bash
git add front/features/archive/ui/my-page/recent-reading-list.test.tsx front/features/archive/ui/my-page/recent-reading-row.tsx front/features/archive/ui/my-page/member-space-regressions.test.tsx front/src/styles/globals.css
git commit -m "feat(front): refine recent reading cards"
```

### Task 3: Host AI defaults ledger row

**Files:**
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: existing capability/default queries and model mutation
- Produces: compact host operations row with `rm-host-ai-tool__header`, field, actions, and message regions

- [ ] **Step 1: Write the failing compact-layout assertion**

Extend the compact variant test:

```tsx
const section = screen.getByRole("region", { name: "AI 기본 모델" });
expect(section).toHaveClass("rm-host-ai-tool", "rm-host-ai-tool--ledger");
expect(section.querySelector(".rm-host-ai-tool__header")).toBeInTheDocument();
```

The existing tests continue to prove capability-disabled, loading, error, save, and success behavior.

- [ ] **Step 2: Run the focused host test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/club/ui/ClubAiDefaultsSection.test.tsx
```

Expected: FAIL because the compact modifier and header hook do not exist.

- [ ] **Step 3: Add compact semantic hooks without changing state behavior**

Use a variant-derived class and header class:

```tsx
className={variant === "compact" ? "rm-host-ai-tool rm-host-ai-tool--ledger" : "stack"}
...
<header className={variant === "compact" ? "rm-host-ai-tool__header" : undefined}>
```

Keep all query options, mutation handlers, labels, copy, `role`, and `aria-live` attributes unchanged.

- [ ] **Step 4: Replace the inset strip with a ledger layout**

Update `globals.css` so `.rm-host-dashboard-ai-tool` owns vertical spacing, `.rm-host-ai-tool--ledger` has a transparent surface and only one bottom divider, and child columns align with neighboring host operating rows. Preserve 2-column tablet and 1-column mobile layouts; remove the colored inset panel effect and keep the mobile button at least 44px high.

- [ ] **Step 5: Run the focused host test and confirm GREEN**

Run the same host Vitest command. Expected: all tests pass with no warnings.

- [ ] **Step 6: Commit the host UI slice**

```bash
git add front/features/host/club/ui/ClubAiDefaultsSection.test.tsx front/features/host/club/ui/ClubAiDefaultsSection.tsx front/src/styles/globals.css
git commit -m "feat(front): refine host AI defaults tool"
```

### Task 4: Browser, detector, and frontend gates

**Files:**
- Modify only if the first bounded browser inspection reveals a scoped defect in the files above

**Interfaces:**
- Consumes: final member and host UI implementation
- Produces: desktop/mobile evidence and a merge-ready frontend branch

- [ ] **Step 1: Run the mechanical UI detector once**

```bash
node ~/.agents/skills/impeccable/scripts/detect.mjs --json front/features/archive/ui/my-page/recent-reading-row.tsx front/features/host/club/ui/ClubAiDefaultsSection.tsx front/src/styles/globals.css
```

Review every reported defect and fix only real issues inside the approved scope.

- [ ] **Step 2: Run focused regressions**

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts features/archive/ui/my-page/recent-reading-list.test.tsx features/archive/ui/my-page/member-space-regressions.test.tsx features/host/club/ui/ClubAiDefaultsSection.test.tsx
```

- [ ] **Step 3: Run canonical frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

- [ ] **Step 4: Inspect both routes in one bounded browser pass**

At desktop and mobile widths, verify `/clubs/reading-sai/app/me` and `/clubs/reading-sai/app/host`: cover position and depth, label format, badge preservation, line overlap removal, full-width host alignment, Korean wrapping, focus, console errors, loading/disabled state, and 320px layout. Apply one batched correction if necessary and perform at most one confirmation pass.

- [ ] **Step 5: Verify documentation and public-repo safety**

```bash
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" docs/superpowers/specs/2026-08-06-member-recent-reading-host-ai-tool-refinement-design.md docs/superpowers/plans/2026-08-06-member-recent-reading-host-ai-tool-refinement.md
```

The safety scan must return no matches.

- [ ] **Step 6: Commit final verification-only corrections, if any**

Stage only scoped files and use:

```bash
git commit -m "fix(front): close member and host UI regressions"
```

Skip this commit when verification produces no code changes.

- [ ] **Step 7: Merge the verified branch into local `main`**

From the primary checkout, merge `codex/member-host-ui-alignment` into `main`, rerun the focused Vitest command on merged HEAD, verify `git status --short --branch`, then remove the owned worktree and delete the merged feature branch.
