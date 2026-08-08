# Host Mobile Density Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the host dashboard and host session editor compact, readable, and fully operable at 320–390px without changing server contracts, desktop behavior, or touch accessibility.

**Architecture:** Keep route, query, mutation, and record-workflow ownership unchanged. Add one pure lifecycle-label projection in the existing host editor view model, render mobile-only compact metadata alongside the existing desktop identity, and scope all geometry changes to the host mobile UI classes in `front/shared/styles/mobile.css`.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, Playwright, CSS, Corepack with `pnpm@11.13.1`.

## Global Constraints

- Change only frontend UI, pure view-model projection, responsive CSS, and tests.
- Do not change BFF, Spring API, database, migration, authorization, autosave, record apply, notification, or AI-provider behavior.
- Keep all interactive targets at least 44×44px on mobile.
- Keep `세션 문서 열기` as the accessible name of the icon-only current-session link.
- Keep `세션 문서 만들기` visible as text when no current session exists.
- Keep mobile tab labels exactly `개요`, `기본`, `출석`, `기록`, `변경` and desktop accessible names unchanged.
- Keep tab, tabpanel, `aria-controls`, `aria-selected`, roving `tabIndex`, ArrowLeft, ArrowRight, Home, and End behavior unchanged.
- Keep mobile metadata on one line at normal 320px Korean content; allow metadata-local horizontal scrolling for zoom or longer translations instead of clipping content or overflowing the page.
- Use synthetic fixtures only. Do not call a live AI provider or send notifications/email.
- Preserve desktop layout and the mobile record sticky action/safe-area relationship.
- Run UI detector once after UI edits, then one combined desktop/mobile visual defect pass and at most one confirmation pass.

---

## File Responsibility Map

- `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`: mobile host priority hierarchy and current-session entry markup.
- `front/features/host/ui/host-dashboard.test.tsx`: current-session icon/create-state and semantic dashboard regressions.
- `front/features/host/model/host-session-editor-view-model.ts`: pure lifecycle label used by compact mobile editor metadata.
- `front/features/host/model/host-session-editor-view-model.test.ts`: lifecycle label mapping regressions.
- `front/features/host/ui/host-session-editor.tsx`: desktop identity preservation and mobile-only deduplicated metadata row.
- `front/tests/unit/host-session-editor.test.tsx`: header metadata content, grouping, and duplicate-state regressions.
- `front/features/host/ui/session-editor/session-editor-section-nav.tsx`: semantic tab markup without inline geometry.
- `front/features/host/ui/session-editor/session-editor-section-nav.test.tsx`: five-tab labels, class contract, no inline geometry, and keyboard behavior.
- `front/features/host/ui/dashboard/upcoming-session-row.tsx`: no markup change expected; existing action semantics remain source of truth.
- `front/shared/styles/mobile.css`: mobile-only spacing, current-session icon placement, upcoming action density, compact metadata, equal tab grid, and panel padding.
- `front/tests/e2e/host-club-operations.spec.ts`: 320/390 host dashboard geometry, focus, overflow, and screenshots.
- `front/tests/e2e/host-session-record-revisions.spec.ts`: 320/390 editor tabs, metadata, panel density, sticky action, dialog, and screenshots.
- `front/tests/e2e/responsive-navigation-chrome.spec.ts`: unchanged but rerun to protect host navigation continuity across the 768px boundary.

---

### Task 1: Compact Host Dashboard Priority and Current-Session Entry

**Files:**
- Modify: `front/features/host/ui/host-dashboard.test.tsx:266-305`
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx:137-233`
- Modify: `front/shared/styles/mobile.css:1420-1481`

**Interfaces:**
- Consumes: `session: CurrentSession | null`, `sessionEditHref: string`, `sessionEditState: ReadmatesReturnState`, and the existing `Icon({ name: "arrow-right" })` component.
- Produces: `.rm-host-mobile-priority__state`, `.rm-host-dashboard-mobile__session-cta--icon`, and `.rm-host-dashboard-mobile__session-cta--create` mobile style hooks.
- Preserves: link accessible names `세션 문서 열기` and `세션 문서 만들기`.

- [ ] **Step 1: Write failing unit assertions for the icon and empty-state contracts**

Extend the current-session tests with these assertions:

```tsx
const openLink = within(card).getByRole("link", { name: "세션 문서 열기" });
expect(openLink).toHaveClass(
  "rm-host-dashboard-mobile__session-cta",
  "rm-host-dashboard-mobile__session-cta--icon",
);
expect(openLink).not.toHaveTextContent("세션 문서 열기");

const createLink = within(card).getByRole("link", { name: "세션 문서 만들기" });
expect(createLink).toHaveClass(
  "rm-host-dashboard-mobile__session-cta",
  "rm-host-dashboard-mobile__session-cta--create",
);
expect(createLink).toHaveTextContent("세션 문서 만들기");
```

Also assert that the state wrapper contains the label and bridge as separate children:

```tsx
const state = mobile.querySelector(".rm-host-mobile-priority__state") as HTMLElement;
expect(state.children).toHaveLength(2);
expect(within(state).getByText("호스트 준비 필요")).toBeInTheDocument();
expect(within(state).getByText(/세션 정보.*운영 대기 항목/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the dashboard unit test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx
```

Expected: FAIL because the existing current-session link still contains visible text and has no `--icon` or `--create` modifier.

- [ ] **Step 3: Split current-session and empty-state link markup**

Inside `.rm-host-dashboard-mobile__session-head`, render the current-session link only when `session` exists:

```tsx
{session ? (
  <LinkComponent
    to={sessionEditHref}
    state={sessionEditState}
    className="rm-host-dashboard-mobile__session-cta rm-host-dashboard-mobile__session-cta--icon"
    aria-label="세션 문서 열기"
  >
    <Icon name="arrow-right" size={16} />
  </LinkComponent>
) : null}
```

After the head, render the visible create action only for the empty state:

```tsx
{session ? null : (
  <LinkComponent
    to={sessionEditHref}
    state={sessionEditState}
    className="btn btn-primary rm-host-dashboard-mobile__session-cta rm-host-dashboard-mobile__session-cta--create"
  >
    <span>세션 문서 만들기</span>
    <Icon name="arrow-right" size={14} />
  </LinkComponent>
)}
```

Keep the existing session identity, title, date, metrics, and no-response note unchanged.

- [ ] **Step 4: Add mobile-only hierarchy and geometry CSS**

Replace the full-width current-session rule with scoped variants and add the missing state rhythm:

```css
.mobile-only .rm-host-mobile-priority__state {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 12px 14px;
  border-left: 3px solid var(--warn);
  background: var(--bg-raised);
}

.mobile-only .rm-host-dashboard-mobile__session-head {
  position: relative;
}

.mobile-only .rm-host-dashboard-mobile__session-head > .rm-session-identity,
.mobile-only .rm-host-dashboard-mobile__session-head > h3,
.mobile-only .rm-host-dashboard-mobile__session-head > p {
  padding-right: 52px;
}

.mobile-only .rm-host-dashboard-mobile__session-cta--icon {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 44px;
  height: 44px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg-raised);
  color: var(--text);
}

.mobile-only .rm-host-dashboard-mobile__session-cta--create {
  width: 100%;
  height: 48px;
  justify-content: space-between;
  padding: 0 18px;
  border-radius: 0;
}
```

Change the priority badge to `badge-warn badge-dot` so the label, left rule, and text jointly communicate the preparation warning.

- [ ] **Step 5: Keep upcoming actions compact without hiding labels**

Change only the mobile action geometry; do not edit `upcoming-session-row.tsx`:

```css
.mobile-only .rm-host-upcoming-mobile__actions .btn {
  flex: 1 1 82px;
  min-height: 44px;
  white-space: normal;
}

.mobile-only .rm-host-upcoming-mobile__actions .btn-primary {
  flex-basis: 82px;
}
```

Expected: the primary action no longer consumes a separate full row, while all three text labels and 44px hit targets remain.

- [ ] **Step 6: Run the dashboard unit test and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the dashboard slice**

```bash
git add \
  front/features/host/ui/host-dashboard.test.tsx \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/shared/styles/mobile.css
git commit -m "feat(front): compact host mobile session actions"
```

---

### Task 2: Add a Pure Compact Lifecycle Label and Deduplicated Mobile Metadata

**Files:**
- Modify: `front/features/host/model/host-session-editor-view-model.test.ts`
- Modify: `front/features/host/model/host-session-editor-view-model.ts`
- Modify: `front/tests/unit/host-session-editor.test.tsx:401-425`
- Modify: `front/features/host/ui/host-session-editor.tsx:923-958`
- Modify: `front/shared/styles/mobile.css:1576-1661`

**Interfaces:**
- Consumes: `HostSessionState | null`, `displaySession.sessionNumber`, `overview.applied.visibilityLabel`, and `overview.draft.statusLabel`.
- Produces: `compactSessionLifecycleLabel(state: HostSessionState | null): string`.
- Produces: `.rm-host-session-editor__desktop-metadata` and `.rm-host-session-editor__mobile-metadata` UI groups.

- [ ] **Step 1: Write the lifecycle-label mapping test**

Add the import and parameterized test:

```ts
import {
  buildHostSessionEditorOverview,
  buildHostSessionHistoryItemView,
  compactSessionLifecycleLabel,
} from "./host-session-editor-view-model";

it.each([
  [null, "새 예정 세션"],
  ["DRAFT", "예정"],
  ["OPEN", "준비 중"],
  ["CLOSED", "마감"],
  ["PUBLISHED", "공개"],
] as const)("maps %s to compact mobile lifecycle copy", (state, expected) => {
  expect(compactSessionLifecycleLabel(state)).toBe(expected);
});
```

- [ ] **Step 2: Run the model test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/model/host-session-editor-view-model.test.ts
```

Expected: FAIL because `compactSessionLifecycleLabel` is not exported.

- [ ] **Step 3: Implement the pure lifecycle projection**

Add this mapping beside the other view-model label maps:

```ts
import type { HostSessionState } from "./host-session-editor-model";

const compactSessionLifecycleLabels: Record<HostSessionState, string> = {
  DRAFT: "예정",
  OPEN: "준비 중",
  CLOSED: "마감",
  PUBLISHED: "공개",
};

export function compactSessionLifecycleLabel(state: HostSessionState | null): string {
  return state === null ? "새 예정 세션" : compactSessionLifecycleLabels[state];
}
```

- [ ] **Step 4: Run the model test and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/model/host-session-editor-view-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing UI assertions for desktop preservation and mobile deduplication**

For an existing open session, assert both groups:

```tsx
const desktopMetadata = screen.getByRole("group", { name: "데스크톱 세션 상태" });
expect(within(desktopMetadata).getByRole("group", {
  name: "No.07 · 이번 세션 · 준비 중 · D-18",
})).toBeVisible();

const mobileMetadata = screen.getByRole("group", { name: "모바일 세션 상태" });
expect(within(mobileMetadata).getByText("No.07")).toBeInTheDocument();
expect(within(mobileMetadata).getByText("준비 중")).toBeInTheDocument();
expect(within(mobileMetadata).getAllByText("호스트 전용")).toHaveLength(1);
expect(within(mobileMetadata).getByText("초안 준비됨")).toBeInTheDocument();
expect(within(mobileMetadata).queryByText("이번 세션")).not.toBeInTheDocument();
expect(within(mobileMetadata).queryByText("D-18")).not.toBeInTheDocument();
```

For `session={null}`, assert exactly three mobile items:

```tsx
const mobileMetadata = screen.getByRole("group", { name: "모바일 세션 상태" });
expect(Array.from(mobileMetadata.children, (item) => item.textContent)).toEqual([
  "새 예정 세션",
  "호스트 전용",
  "초안 준비됨",
]);
```

- [ ] **Step 6: Run the editor unit test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx
```

Expected: FAIL because the named desktop/mobile metadata groups do not exist and the new-session header repeats `호스트 전용`.

- [ ] **Step 7: Render separate desktop and mobile metadata groups**

Import `compactSessionLifecycleLabel`. Replace the two wrapping rows under the title with:

```tsx
<div
  className="desktop-only rm-host-session-editor__desktop-metadata"
  role="group"
  aria-label="데스크톱 세션 상태"
>
  {displaySession ? (
    <SessionIdentity
      sessionNumber={displaySession.sessionNumber}
      state={displaySession.state}
      date={displaySession.date}
      published={displaySession.state === "PUBLISHED"}
    />
  ) : (
    <div className="rm-session-identity">
      <span className="rm-session-identity__chip">새 예정 세션</span>
    </div>
  )}
  <div className="row rm-host-session-editor__record-status">
    <span className="badge">{overview.applied.visibilityLabel}</span>
    <span className="badge">{overview.draft.statusLabel}</span>
  </div>
</div>

<div
  className="mobile-only rm-host-session-editor__mobile-metadata"
  role="group"
  aria-label="모바일 세션 상태"
>
  {displaySession?.sessionNumber ? (
    <span className="rm-session-identity__chip">
      {`No.${String(displaySession.sessionNumber).padStart(2, "0")}`}
    </span>
  ) : null}
  <span className="rm-session-identity__chip">
    {compactSessionLifecycleLabel(displaySession?.state ?? null)}
  </span>
  <span className="rm-session-identity__chip">{overview.applied.visibilityLabel}</span>
  <span className="rm-session-identity__chip">{overview.draft.statusLabel}</span>
</div>
```

Do not change `SessionIdentity` itself; other member, archive, and host consumers keep their current content.

- [ ] **Step 8: Add metadata geometry CSS**

```css
.rm-host-session-editor__desktop-metadata {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.rm-host-session-editor__record-status {
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .rm-host-session-editor__mobile-metadata {
    width: 100%;
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
    white-space: nowrap;
  }

  .rm-host-session-editor__mobile-metadata::-webkit-scrollbar {
    display: none;
  }

  .rm-host-session-editor__mobile-metadata > * {
    flex: 0 0 auto;
  }
}
```

- [ ] **Step 9: Run model and editor tests and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/model/host-session-editor-view-model.test.ts \
  tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit the metadata slice**

```bash
git add \
  front/features/host/model/host-session-editor-view-model.test.ts \
  front/features/host/model/host-session-editor-view-model.ts \
  front/features/host/ui/host-session-editor.tsx \
  front/tests/unit/host-session-editor.test.tsx \
  front/shared/styles/mobile.css
git commit -m "feat(front): compact host session metadata"
```

---

### Task 3: Fit and Center All Five Editor Tabs and Reduce Panel Waste

**Files:**
- Modify: `front/features/host/ui/session-editor/session-editor-section-nav.test.tsx:9-40`
- Modify: `front/features/host/ui/session-editor/session-editor-section-nav.tsx:47-95`
- Modify: `front/shared/styles/mobile.css:1583-1773`

**Interfaces:**
- Consumes: `HostSessionEditorSection`, `activeSection`, and `onSectionChange(section)`.
- Produces: an inline-style-free `.rm-host-session-editor__section-nav` and `.rm-host-session-editor__section-tab` geometry contract.
- Preserves: all accessible names, panel IDs, click behavior, keyboard behavior, and one-visible-panel semantics.

- [ ] **Step 1: Change the nav unit test to require CSS-owned equal-tab geometry**

Rename the first test to `renders five equal mobile tabs with responsive labels` and add:

```tsx
expect(tablist).toHaveClass("rm-host-session-editor__section-nav");
tabs.forEach((tab) => {
  expect(tab).toHaveClass("rm-host-session-editor__section-tab");
  expect(tab).not.toHaveAttribute("style");
});
```

Remove the old assertion that requires the generic horizontal-scroller class:

```tsx
expect(tablist).toHaveClass("m-hscroll");
```

Keep all label, selection, `tabIndex`, and keyboard assertions.

- [ ] **Step 2: Run the nav unit test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/session-editor/session-editor-section-nav.test.tsx
```

Expected: FAIL because the tablist still has `m-hscroll` and each button has inline geometry/color styles.

- [ ] **Step 3: Remove inline visual styles and the generic scroller class**

Use:

```tsx
<div
  className="rm-host-session-editor__section-nav"
  role="tablist"
  aria-label="호스트 편집 섹션"
  onKeyDown={(event) => handleSectionKeyDown(event, activeSection, onSectionChange)}
>
```

Render each button without `style`:

```tsx
<button
  key={item.key}
  id={tabId(item.key)}
  type="button"
  role="tab"
  aria-label={item.desktopLabel}
  aria-selected={selected}
  aria-controls={item.panelIds.join(" ")}
  tabIndex={selected ? 0 : -1}
  className={`m-chip rm-host-session-editor__section-tab${selected ? " is-on" : ""}`}
  onClick={() => onSectionChange(item.key)}
>
```

- [ ] **Step 4: Move desktop and mobile geometry into scoped CSS**

Use content-width tabs on desktop and an equal grid on mobile:

```css
.rm-host-session-editor__section-nav {
  display: flex;
  width: 100%;
  gap: 6px;
  margin-bottom: 24px;
  padding-bottom: 6px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
}

.rm-host-session-editor__section-tab {
  min-height: 44px;
  height: 44px;
  flex: 0 0 auto;
  padding: 0 15px;
  border-color: var(--line);
  background: transparent;
  color: var(--text-2);
}

.m-chip.rm-host-session-editor__section-tab.is-on {
  border-color: var(--text);
  background: var(--text);
  color: var(--bg);
}

@media (max-width: 768px) {
  .rm-host-session-editor__section-nav {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    overflow-x: visible;
  }

  .rm-host-session-editor__section-tab {
    width: 100%;
    min-width: 0;
    padding-inline: 2px;
    justify-content: center;
    border-radius: var(--r-2);
    text-align: center;
    white-space: nowrap;
  }
}
```

Delete the 76px and 72px mobile minimum-width rules. Keep the existing sticky nav, focus-visible, and reduced-motion rules.

- [ ] **Step 5: Reduce panel chrome only on mobile**

Change mobile panel and workspace density without touching inputs or sticky actions:

```css
@media (max-width: 768px) {
  .rm-host-session-editor__section-panel,
  .rm-host-session-editor__section {
    padding: 16px !important;
  }

  .rm-session-record-workspace {
    padding: 16px !important;
  }

  .rm-host-session-editor__layout,
  .rm-session-record-workspace__draft-layout {
    gap: 16px;
  }
}

@media (max-width: 360px) {
  .rm-host-session-editor__section-panel,
  .rm-host-session-editor__section,
  .rm-session-record-workspace {
    padding: 14px !important;
  }
}
```

Do not reduce `.btn` min-height, form control height, sticky-action spacing, focus outline, or action-sheet dimensions.

- [ ] **Step 6: Run nav and editor unit tests and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/session-editor/session-editor-section-nav.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the tab and density slice**

```bash
git add \
  front/features/host/ui/session-editor/session-editor-section-nav.test.tsx \
  front/features/host/ui/session-editor/session-editor-section-nav.tsx \
  front/shared/styles/mobile.css
git commit -m "feat(front): fit host editor tabs on mobile"
```

---

### Task 4: Lock 320px and 390px Geometry with Browser Tests

**Files:**
- Modify: `front/tests/e2e/host-club-operations.spec.ts:289-381`
- Modify: `front/tests/e2e/host-session-record-revisions.spec.ts:452-505`
- Verify unchanged: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: existing public-safe host dashboard and session-record route fixtures.
- Produces: deterministic geometry and screenshot evidence at 320px and 390px.
- Preserves: no real member data, no live email/notification/AI action, and existing record confirmation-sheet safety assertions.

- [ ] **Step 1: Update host-dashboard browser assertions**

Replace the old 48px full-width CTA assertion with:

```ts
await expect(cta).toHaveCSS("width", "44px");
await expect(cta).toHaveCSS("height", "44px");
await expect(cta).toHaveAttribute("aria-label", "세션 문서 열기");
await expect(cta).not.toContainText("세션 문서 열기");
```

Add priority separation evidence:

```ts
const priorityState = mobile.locator(".rm-host-mobile-priority__state");
expect(Number.parseFloat(await priorityState.evaluate((element) => getComputedStyle(element).rowGap)))
  .toBeGreaterThanOrEqual(8);
```

Keep 320, 390, 768, and 1280 screenshots and all page-overflow assertions.

- [ ] **Step 2: Update the 320px editor tab expectations**

Replace:

```ts
expect(sectionNavMetrics.scrollWidth).toBeGreaterThan(sectionNavMetrics.clientWidth);
```

with:

```ts
expect(sectionNavMetrics.scrollWidth).toBeLessThanOrEqual(sectionNavMetrics.clientWidth);
const tabBoxes = await sectionTabs.evaluateAll((tabs) => tabs.map((tab) => {
  const box = tab.getBoundingClientRect();
  const style = getComputedStyle(tab);
  return { width: box.width, height: box.height, justifyContent: style.justifyContent };
}));
expect(Math.max(...tabBoxes.map((box) => box.width)) - Math.min(...tabBoxes.map((box) => box.width)))
  .toBeLessThanOrEqual(1);
expect(tabBoxes.every((box) => box.height >= 44 && box.justifyContent === "center")).toBe(true);
```

- [ ] **Step 3: Add metadata and panel-density browser evidence**

Before opening the record workspace, assert:

```ts
const mobileMetadata = page.getByRole("group", { name: "모바일 세션 상태" });
await expect(mobileMetadata).toBeVisible();
await expect(mobileMetadata.getByText("호스트 전용")).toHaveCount(1);
const metadataLines = await mobileMetadata.locator(":scope > *").evaluateAll((items) =>
  new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
);
expect(metadataLines).toBe(1);

const overviewPanel = page.locator(".rm-host-session-editor__overview");
await expect(overviewPanel).toHaveCSS("padding-left", "14px");
await expect(overviewPanel).toHaveCSS("padding-right", "14px");
```

At 390px, reload the same editor and capture `host-editor-overview-390x844.png`; assert one metadata line, five visible tabs, and no page overflow.

- [ ] **Step 4: Run the focused browser lane and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/host-club-operations.spec.ts \
  tests/e2e/host-session-record-revisions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS with 320/390 dashboard screenshots, a 390 editor overview screenshot, the existing 320 apply-dialog screenshot, no page overflow, keyboard focus evidence, and unchanged navigation continuity.

- [ ] **Step 5: Inspect screenshots once and batch any defects**

Inspect the generated files for:

- priority label/bridge separation;
- 44px current-session arrow alignment;
- long title clearance from the arrow;
- upcoming buttons remaining readable in one row or cleanly wrapping only when required;
- metadata staying on one line;
- five tabs fitting and centering;
- overview/panel density;
- sticky action staying above app navigation;
- 768px and desktop remaining unchanged.

If defects exist, fix all observed issues in one patch, rerun the same focused browser lane once, and stop visual polishing after that confirmation.

- [ ] **Step 6: Commit browser contracts and any bounded visual fix**

```bash
git add \
  front/tests/e2e/host-club-operations.spec.ts \
  front/tests/e2e/host-session-record-revisions.spec.ts \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/host-session-editor.tsx \
  front/features/host/ui/session-editor/session-editor-section-nav.tsx \
  front/shared/styles/mobile.css
git commit -m "test(front): lock host mobile density regressions"
```

If no implementation file changed during the visual pass, stage only the two E2E files.

---

### Task 5: Boundary, Mechanical, and Full Frontend Verification

**Files:**
- Verify: all files changed by Tasks 1–4
- Modify only if a check identifies a scoped defect: the owning file and its focused regression test

**Interfaces:**
- Consumes: final task commits.
- Produces: final frontend evidence and a clean, reviewable diff.

- [ ] **Step 1: Run focused unit regressions together**

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/host-dashboard.test.tsx \
  features/host/model/host-session-editor-view-model.test.ts \
  features/host/ui/session-editor/session-editor-section-nav.test.tsx \
  tests/unit/host-session-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the frontend architecture boundary test**

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS; UI files still import no API/query/route client.

- [ ] **Step 3: Run Impeccable detector exactly once**

```bash
node "${HOME}/.agents/skills/impeccable/scripts/detect.mjs" --json \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/host-session-editor.tsx \
  front/features/host/ui/session-editor/session-editor-section-nav.tsx \
  front/shared/styles/mobile.css
```

Expected: no unresolved blocking detector findings. Fix only findings that apply to the approved surface; do not broaden into unrelated redesign.

- [ ] **Step 4: Run frontend lint**

```bash
corepack pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 5: Run the full frontend test suite once at final code**

```bash
corepack pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 6: Run the production frontend build**

```bash
corepack pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 7: Check whitespace and final scope**

```bash
git diff --check 65c8a648eba909f5fd94f359022938216918936e..HEAD
git status --short --branch
git diff --stat 65c8a648eba909f5fd94f359022938216918936e..HEAD
```

Expected: no whitespace errors; only approved host frontend, tests, the design spec, and this implementation plan differ from the pre-task base.

- [ ] **Step 8: Commit any verification-only correction**

Only if Steps 1–7 required a correction:

```bash
git add \
  front/features/host/model/host-session-editor-view-model.test.ts \
  front/features/host/model/host-session-editor-view-model.ts \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/host-dashboard.test.tsx \
  front/features/host/ui/host-session-editor.tsx \
  front/features/host/ui/session-editor/session-editor-section-nav.test.tsx \
  front/features/host/ui/session-editor/session-editor-section-nav.tsx \
  front/shared/styles/mobile.css \
  front/tests/e2e/host-club-operations.spec.ts \
  front/tests/e2e/host-session-record-revisions.spec.ts \
  front/tests/unit/host-session-editor.test.tsx
git commit -m "fix(front): close host mobile density regressions"
```

Do not create an empty commit.

---

## Requirement-to-Evidence Matrix

| Requirement | Implementation task | Evidence |
| --- | --- | --- |
| Preparation label and bridge no longer touch | Task 1 | Dashboard unit structure + 320/390 computed `rowGap` + screenshot |
| Current session entry no longer consumes a full row | Task 1 | Icon-only class, accessible name, 44×44 browser box |
| Empty session remains discoverable | Task 1 | Visible `세션 문서 만들기` unit assertion |
| Upcoming actions waste less vertical space | Task 1 | Existing label/focus E2E + dashboard screenshots |
| Header state is one line with no duplicate scope | Task 2 | Model mapping + editor unit groups + 320/390 bounding boxes |
| All five tabs fit and center at 320px | Task 3 | Unit semantics + E2E equal widths, centered content, no overflow |
| Panel chrome is reduced without shrinking controls | Task 3 | E2E padding + existing sticky/dialog/button bounds |
| Keyboard and screen-reader contracts remain | Tasks 1–4 | Existing nav unit tests, named icon link, focused browser checks |
| Desktop and breakpoint behavior remain | Tasks 3–5 | 768/1280 screenshots + responsive-navigation lane + full suite/build |
| Frontend boundaries and public safety remain | Task 5 | Boundary test, synthetic fixtures, detector, final diff review |

## Adjacent High-Risk Exclusions

- Autosave queues, revision restore, record apply, and notification dispatch are adjacent to the editor but unchanged; existing focused record-revision tests are rerun rather than rewriting those workflows.
- Session visibility mutation and session-start actions are adjacent to mobile action layout but their callbacks, labels, disabled state, and API contracts remain unchanged.
- Mobile navigation chrome is adjacent to the sticky tab/header behavior but is not edited; `responsive-navigation-chrome.spec.ts` supplies regression evidence.
- Server, BFF, persistence, migration, public-release, and deployment checks are excluded because no contract or deploy surface changes. Frontend build and E2E evidence cover the touched surface.
