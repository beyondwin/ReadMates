# Public Records Responsive Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the `/records` session date, publication state, and record counts from overlapping or overflowing from 320px mobile through wide desktop layouts.

**Architecture:** Preserve the existing `cover | body` record-row grid and the desktop metadata hierarchy. Add a content-driven narrow breakpoint at 520px where only the body metadata changes from two columns to one column, then prove the behavior with real browser geometry checks across both sides of the breakpoint and representative tablet/desktop widths.

**Tech Stack:** React 19, TypeScript, CSS Grid/Flexbox, Playwright E2E, Vitest, Vite, pnpm 10.33.0 through Corepack.

## Global Constraints

- Keep the existing book cover, title, author, summary, link semantics, route behavior, data contracts, and public copy unchanged.
- Keep the date, showcase state, highlight count, and one-line-review count visible at every width.
- Stack metadata only at widths up to 520px; preserve the existing same-row desktop/tablet hierarchy from 540px upward.
- Do not introduce new dependencies or server changes.
- Use the repository-pinned `pnpm@10.33.0` through `npx --yes corepack@0.35.0 pnpm`.

---

### Task 1: Add a browser-level responsive metadata regression test

**Files:**
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: the existing `/records` fixture route and `.public-record-index-row`, `__body`, `__meta`, and `__counts` class contracts.
- Produces: `expectPublicRecordMetadataLayout(page, width, stacked)` geometry verification used by one responsive E2E test.

- [ ] **Step 1: Write the failing geometry test**

Extend the Playwright import with `Page`, add a helper that reads the first record row's rectangles and overflow widths, and add a test covering 320, 390, 520, 540, 768, 1024, and 1366px:

```ts
import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectPublicRecordMetadataLayout(page: Page, width: number, stacked: boolean) {
  await page.setViewportSize({ width, height: 900 });

  const row = page.locator(".public-record-index-row").first();
  await expect(row).toBeVisible();

  const layout = await row.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(".public-record-index-row__body")!;
    const meta = element.querySelector<HTMLElement>(".public-record-index-row__meta")!;
    const counts = element.querySelector<HTMLElement>(".public-record-index-row__counts")!;
    const rect = (target: HTMLElement) => {
      const box = target.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };

    return {
      body: { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth },
      row: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth },
      meta: rect(meta),
      counts: rect(counts),
    };
  });

  const overlaps =
    layout.meta.left < layout.counts.right &&
    layout.meta.right > layout.counts.left &&
    layout.meta.top < layout.counts.bottom &&
    layout.meta.bottom > layout.counts.top;

  expect(overlaps, `${width}px metadata must not overlap`).toBe(false);
  expect(layout.body.scrollWidth, `${width}px body must not overflow`).toBeLessThanOrEqual(layout.body.clientWidth);
  expect(layout.row.scrollWidth, `${width}px row must not overflow`).toBeLessThanOrEqual(layout.row.clientWidth);

  if (stacked) {
    expect(layout.counts.top).toBeGreaterThanOrEqual(layout.meta.bottom);
  } else {
    expect(Math.abs(layout.counts.top - layout.meta.top)).toBeLessThan(1);
  }
}

test("public record metadata adapts without overlap from mobile to desktop", async ({ page }) => {
  await page.goto("/records");

  for (const width of [320, 390, 520]) {
    await expectPublicRecordMetadataLayout(page, width, true);
  }

  for (const width of [540, 768, 1024, 1366]) {
    await expectPublicRecordMetadataLayout(page, width, false);
  }
});
```

- [ ] **Step 2: Run the target E2E test and verify RED**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/responsive-navigation-chrome.spec.ts --grep "public record metadata adapts"
```

Expected: FAIL at 320px or 390px because the current two-column grid makes the date and counts rectangles overlap.

### Task 2: Stack record metadata at the narrow content breakpoint

**Files:**
- Modify: `front/src/styles/globals.css`
- Test: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: the existing public record row class names and the general mobile `.public-archive-row__counts` wrapping behavior.
- Produces: a 520px-and-below one-column metadata layout without changing component markup.

- [ ] **Step 1: Add the minimal narrow-layout CSS**

Add a late breakpoint after the existing 768px public-page rules so it overrides the record-specific `nowrap` declaration only where needed:

```css
@media (max-width: 520px) {
  .public-record-index-row__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-record-index-row__meta {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }

  .public-record-index-row__counts {
    grid-column: 1;
    grid-row: 2;
    justify-self: start;
    flex-wrap: wrap;
    white-space: normal;
    text-align: left;
  }
}
```

- [ ] **Step 2: Run the target E2E test and verify GREEN**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/responsive-navigation-chrome.spec.ts --grep "public record metadata adapts"
```

Expected: PASS at all seven widths with stacked metadata at 320/390/520 and same-row metadata at 540/768/1024/1366.

- [ ] **Step 3: Run the full responsive-navigation E2E file**

Run:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: all responsive navigation and record-continuity scenarios PASS.

### Task 3: Verify the complete frontend and inspect representative layouts

**Files:**
- Verify: `front/src/styles/globals.css`
- Verify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: the completed CSS and geometry test.
- Produces: fresh lint, unit, build, E2E, and browser evidence for handoff.

- [ ] **Step 1: Run frontend lint**

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
```

Expected: exit 0 with no lint errors.

- [ ] **Step 2: Run the frontend unit suite**

```bash
npx --yes corepack@0.35.0 pnpm --dir front test
```

Expected: all test files and tests PASS.

- [ ] **Step 3: Run the production build**

```bash
npx --yes corepack@0.35.0 pnpm --dir front build
```

Expected: Vite build exits 0.

- [ ] **Step 4: Inspect local `/records` at representative widths**

Use browser rendering at 320, 390, 520, 540, 768, 1024, and 1366px. Confirm the date remains complete, the state/count line remains visible, no horizontal scrollbar appears, and the title/author/summary reading order remains unchanged.

- [ ] **Step 5: Check the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the plan, E2E test, and global CSS are changed after the approved design commit.
