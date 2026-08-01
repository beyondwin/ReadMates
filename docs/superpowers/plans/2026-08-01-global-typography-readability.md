# ReadMates Global Typography Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the serif reading split and make every ReadMates product surface use a consistent, readable Pretendard-based type hierarchy.

**Architecture:** `design/system/src/styles/tokens.css` owns the reusable font families, semantic sizes, line heights, and emphasis rules. Existing React markup opts into those shared roles, while `front/src/styles/globals.css` and `front/shared/styles/mobile.css` keep only app-specific responsive layout adjustments; public, member, host, and admin work is delivered as separate reviewable slices before a repository-wide typography boundary test closes the migration.

**Tech Stack:** React 19, TypeScript 6, Vite 8, CSS custom properties, Vitest 4, Playwright component tests, Playwright E2E, pnpm 11.13.1 through Corepack.

**Design Spec:** `docs/superpowers/specs/2026-08-01-global-typography-readability-design.md`

## Global Constraints

- 제목, 본문, 기록, 컨트롤은 기존 `--f-sans` Pretendard 우선 stack을 사용한다.
- `Iowan Old Style`, `--f-reading`, `reading-editorial`, 정의되지 않은 `--font-editorial` 활성 사용을 제거한다.
- 일반 본문은 16px, 강조 본문은 17px, 보조 문구는 14px, 짧은 label은 12px 이상이다.
- H1은 desktop 36px/mobile 30px, H2는 desktop 28px/mobile 24px, H3는 20px, H4는 17px이다.
- 10px와 11px 시각 텍스트를 사용하지 않는다. 12px은 eyebrow, 짧은 badge, 한 줄 metadata에만 허용한다.
- 안내, 오류, 권한 제한, 상태 원인, 행동 label에는 12px을 사용하지 않는다.
- 긴 기록과 인용은 16~17px, line-height 1.6 이상을 사용한다.
- 모바일은 본문을 축소하지 않고 큰 제목과 주변 spacing만 줄인다.
- 제목 letter-spacing은 H1 최대 `-0.02em`, H2 최대 `-0.015em`, H3 최대 `-0.01em`; 본문은 기본 자간을 사용한다.
- 모노스페이스는 회차 번호, 고정 폭 수치, 운영 지표, 사람이 식별하는 짧은 코드에만 사용한다. 숫자 정렬만 필요하면 `font-variant-numeric: tabular-nums`를 우선한다.
- 글자가 커져 생기는 overflow는 font 축소가 아니라 `min-width: 0`, wrapping, track, gap, padding으로 해결한다.
- API, BFF, server, query, auth, permission, route, persistence, migration, 제품 문구 동작은 변경하지 않는다.
- 새 font dependency, font CDN, React abstraction을 추가하지 않는다.
- 기존 loading, empty, error, permission state의 의미와 동작을 보존한다.
- root `package.json`의 `pnpm@11.13.1`을 Corepack으로 실행한다.
- 구현 시작 전 `git status --short --branch --untracked-files=all`을 다시 확인한다. 현재 checkout의 `front/src/styles/globals.css`, archive UI, mobile header 변경은 다른 진행 중 작업이므로 덮어쓰지 않는다. 겹치는 변경이 남아 있으면 `using-git-worktrees`로 최신 committed `main`에서 격리하고, 통합 시 양쪽 의미를 보존한다.
- Acceptance matrix에서 `UI or runtime state | loading, empty, denied, stale, error, wrapping, desktop, mobile` row를 선택한다. API/auth/server/public-release rows는 동작 계약과 배포 산출물을 바꾸지 않으므로 제외한다.

## File Structure

- `design/system/src/styles/tokens.css`: reusable type custom properties, type utility classes, shared badges/controls/identity typography.
- `design/system/src/design-system-boundaries.test.ts`: exact design-system font and scale contract without external font loading.
- `front/src/styles/globals.css`: product-surface typography and desktop/responsive layout fixes.
- `front/shared/styles/mobile.css`: shared 320~480px chrome and mobile product typography.
- `front/tests/unit/typography-contract.test.ts`: final active-source guard against removed font contracts and sub-12px visual text.
- Existing `front/features/**/ui/*.tsx`: remove obsolete `reading-editorial`, undefined aliases, and inline undersized text while preserving component responsibilities.
- Existing unit/component tests and screenshot baselines: assert sans rendering, readable size/line-height, and no horizontal overflow.

---

### Task 1: Establish the Design-System Typography Contract

**Files:**
- Modify: `design/system/src/styles/tokens.css`
- Modify: `design/system/src/design-system-boundaries.test.ts`

**Interfaces:**
- Consumes: existing `--f-sans`, `--f-mono`, `.h1`~`.h4`, `.body`, `.body-lg`, `.small`, `.tiny`, `.eyebrow`, `.editorial`, `.ledger-number` contracts.
- Produces: `--type-size-h1`, `--type-size-h2`, `--type-size-h3`, `--type-size-h4`, `--type-size-body`, `--type-size-body-emphasis`, `--type-size-supporting`, `--type-size-label`, `--type-size-control`, `--type-leading-body`, `--type-leading-supporting`, and `--type-leading-label` CSS custom properties for every later task.

- [ ] **Step 1: Replace the serif-focused boundary test with the approved sans and semantic-scale assertions**

Use one temporary stylesheet and elements for every shared role. The test must contain these exact expectations:

```ts
it("exposes the Pretendard readability scale without a separate reading face", () => {
  const tokens = fs.readFileSync(path.join(packageRoot, "src/styles/tokens.css"), "utf8");
  const stylesheet = document.createElement("style");
  stylesheet.textContent = tokens;
  document.head.append(stylesheet);

  const role = (className: string) => {
    const element = document.createElement("p");
    element.className = className;
    document.body.append(element);
    return element;
  };
  const h1 = role("h1");
  const h2 = role("h2");
  const body = role("body");
  const bodyLarge = role("body-lg");
  const supporting = role("small");
  const label = role("tiny");
  const eyebrow = role("eyebrow");
  const ledger = role("ledger-number");

  try {
    const root = getComputedStyle(document.documentElement);
    expect(tokens).not.toContain("--f-reading");
    expect(tokens).not.toContain("reading-editorial");
    expect(tokens).not.toContain("Iowan Old Style");
    expect(root.getPropertyValue("--type-size-h1").trim()).toBe("36px");
    expect(root.getPropertyValue("--type-size-h2").trim()).toBe("28px");
    expect(root.getPropertyValue("--type-size-body").trim()).toBe("16px");
    expect(root.getPropertyValue("--type-size-body-emphasis").trim()).toBe("17px");
    expect(root.getPropertyValue("--type-size-supporting").trim()).toBe("14px");
    expect(root.getPropertyValue("--type-size-label").trim()).toBe("12px");
    expect(root.getPropertyValue("--type-leading-body").trim()).toBe("1.6");
    expect(getComputedStyle(h1).fontSize).toBe("var(--type-size-h1)");
    expect(getComputedStyle(h2).fontSize).toBe("var(--type-size-h2)");
    expect(getComputedStyle(body).fontSize).toBe("var(--type-size-body)");
    expect(getComputedStyle(bodyLarge).fontSize).toBe("var(--type-size-body-emphasis)");
    expect(getComputedStyle(supporting).fontSize).toBe("var(--type-size-supporting)");
    expect(getComputedStyle(label).fontSize).toBe("var(--type-size-label)");
    expect(getComputedStyle(eyebrow).fontFamily).toBe("var(--f-sans)");
    expect(getComputedStyle(eyebrow).fontSize).toBe("var(--type-size-label)");
    expect(getComputedStyle(ledger).fontFamily).toBe("var(--f-mono)");
    expect(getComputedStyle(ledger).fontVariantNumeric).toBe("tabular-nums");
    expect(tokens).not.toMatch(/url\(|https?:\/\//);
  } finally {
    for (const element of [h1, h2, body, bodyLarge, supporting, label, eyebrow, ledger]) {
      element.remove();
    }
    stylesheet.remove();
  }
});
```

- [ ] **Step 2: Run the design-system test and verify RED**

Run:

```bash
corepack pnpm --filter @readmates/design-system exec vitest run src/design-system-boundaries.test.ts
```

Expected: FAIL because `--f-reading` and `.reading-editorial` still exist, H1 is 40px, `.small` is 13px, `.tiny` is 11.5px, and `.eyebrow` is 10.5px mono.

- [ ] **Step 3: Add the semantic size and leading custom properties**

Add under the existing `/* Type */` block and remove `--f-reading`:

```css
--f-sans: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--f-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;

--type-size-h1: 36px;
--type-size-h2: 28px;
--type-size-h3: 20px;
--type-size-h4: 17px;
--type-size-body: 16px;
--type-size-body-emphasis: 17px;
--type-size-supporting: 14px;
--type-size-label: 12px;
--type-size-control: 14px;
--type-leading-body: 1.6;
--type-leading-supporting: 1.5;
--type-leading-label: 1.4;
```

Add the mobile title override after the base type block:

```css
@media (max-width: 768px) {
  :root {
    --type-size-h1: 30px;
    --type-size-h2: 24px;
  }
}
```

- [ ] **Step 4: Implement the shared utility contract and remove the reading-face utility**

Replace the type utilities with:

```css
.display {
  font-size: clamp(44px, 5.6vw, 84px);
  line-height: 1.02;
  letter-spacing: -0.02em;
  font-weight: 600;
}
.h1 { font-size: var(--type-size-h1); line-height: 1.15; letter-spacing: -0.02em; font-weight: 600; }
.h2 { font-size: var(--type-size-h2); line-height: 1.2; letter-spacing: -0.015em; font-weight: 600; }
.h3 { font-size: var(--type-size-h3); line-height: 1.3; letter-spacing: -0.01em; font-weight: 600; }
.h4 { font-size: var(--type-size-h4); line-height: 1.4; letter-spacing: 0; font-weight: 600; }
.body { font-size: var(--type-size-body); line-height: var(--type-leading-body); }
.body-lg { font-size: var(--type-size-body-emphasis); line-height: var(--type-leading-body); }
.small { font-size: var(--type-size-supporting); line-height: var(--type-leading-supporting); color: var(--text-3); }
.tiny { font-size: var(--type-size-label); line-height: var(--type-leading-label); color: var(--text-4); }

.eyebrow {
  font-family: var(--f-sans);
  font-size: var(--type-size-label);
  line-height: var(--type-leading-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.editorial {
  font-weight: 500;
  letter-spacing: -0.01em;
}
```

Delete `.reading-editorial` completely. Keep `.ledger-number` unchanged.

- [ ] **Step 5: Migrate shared design-system components away from undersized text**

Use the semantic properties, not new raw sizes:

```css
.btn-sm { font-size: var(--type-size-control); }
.badge,
.rm-session-identity__chip,
.rm-session-identity__number,
.rm-session-identity--compact .rm-session-identity__chip,
.rm-session-identity--compact .rm-session-identity__number,
.rm-archive-session-card__meta .badge,
.idx,
.rule { font-size: var(--type-size-label); }
.rm-avatar-chip-group__name { font-size: var(--type-size-supporting); }
.rm-avatar-chip-group__meta { font-size: var(--type-size-label); }
.label,
.marginalia { font-family: var(--f-sans); font-size: var(--type-size-supporting); line-height: var(--type-leading-supporting); }
```

Remove `font-family: var(--f-mono)` from `.marginalia`; retain it on `.idx`. Do not change component colors, state semantics, or borders.

- [ ] **Step 6: Run the focused test and design-system build**

Run:

```bash
corepack pnpm --filter @readmates/design-system exec vitest run src/design-system-boundaries.test.ts
corepack pnpm --filter @readmates/design-system build
```

Expected: both PASS.

- [ ] **Step 7: Commit the core contract**

```bash
git add design/system/src/styles/tokens.css design/system/src/design-system-boundaries.test.ts
git commit -m "fix(design): reset typography scale for readability"
```

---

### Task 2: Normalize Shared Navigation and Mobile Chrome

**Files:**
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/shared/ui/mobile-header.ct.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.ct.tsx`
- Modify: `front/shared/ui/top-nav.ct.tsx`
- Update after visual review: `front/__screenshots__/shared/ui/mobile-header.ct.tsx/mobile-header-host-320.png`
- Update after visual review: `front/__screenshots__/shared/ui/mobile-header.ct.tsx/mobile-header-member-390.png`
- Update after visual review: `front/__screenshots__/shared/ui/top-nav.ct.tsx/top-nav-long-account-name-1280.png`

**Interfaces:**
- Consumes: Task 1 semantic type properties.
- Produces: shared 12px label and 14~15px action contracts used by every product surface at 320px and 390px.

- [ ] **Step 1: Add failing computed-size assertions to shared chrome component tests**

In the existing CT tests, assert the exact roles after mount:

```ts
import type { Locator } from "@playwright/test";

const fontMetrics = async (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      size: Number.parseFloat(style.fontSize),
      clientWidth: (element as HTMLElement).clientWidth,
      scrollWidth: (element as HTMLElement).scrollWidth,
    };
  });

expect((await fontMetrics(header.locator(".m-hdr-kicker"))).size).toBeGreaterThanOrEqual(12);
expect((await fontMetrics(header.locator(".m-hdr-title"))).size).toBeGreaterThanOrEqual(15);
expect((await fontMetrics(tabBar.locator(".m-tab-label").first())).size).toBeGreaterThanOrEqual(12);
```

Add a third `MobileHeader` CT case at `initialEntries={["/app/me/settings"]}` with `variant="member"`; assert its `.m-hdr-back` computed size is at least 14px, its min-height remains 44px, and its right edge stays within the 320px viewport. In the existing `TopNav` CT, assert `.rm-account-menu__trigger-name` is at least 14px. Keep the existing long-label `scrollWidth <= clientWidth` assertions.

- [ ] **Step 2: Run the three component files and verify RED**

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/mobile-header.ct.tsx shared/ui/mobile-tab-bar.ct.tsx shared/ui/top-nav.ct.tsx
```

Expected: FAIL because `.m-hdr-kicker` is 10px, `.m-hdr-back` is 13px, and `.m-tab-label` is 10.5px.

- [ ] **Step 3: Replace shared mobile chrome sizes with semantic roles**

Apply these exact role mappings in `mobile.css`:

```css
.m-hdr-kicker,
.m-tab-label { font-family: var(--f-sans); font-size: var(--type-size-label); }
.m-hdr-back,
.m-hdr-link,
.m-hdr--guest .m-hdr-link:not(.m-hdr-link--icon),
.m-seg-btn,
.m-chip.rm-session-detail-mobile-tab,
.m-role-btn,
.m-toast { font-size: var(--type-size-control); }
.m-hdr-title { font-size: 15px; }
.m-ptr > span,
.m-chip { font-size: var(--type-size-label); }
.m-avatar { font-size: var(--type-size-supporting); }
```

Preserve the existing 44px minimum interactive targets. If a 320px label no longer fits, reduce horizontal padding or allow wrapping; do not reduce the font below the mapped role.

- [ ] **Step 4: Run CT without updating snapshots and inspect failures**

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/mobile-header.ct.tsx shared/ui/mobile-tab-bar.ct.tsx shared/ui/top-nav.ct.tsx
```

Expected: typography assertions PASS; screenshot assertions may report intentional pixel diffs.

- [ ] **Step 5: Update only the three shared chrome baselines and re-run**

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/mobile-header.ct.tsx shared/ui/mobile-tab-bar.ct.tsx shared/ui/top-nav.ct.tsx --update-snapshots
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/mobile-header.ct.tsx shared/ui/mobile-tab-bar.ct.tsx shared/ui/top-nav.ct.tsx
```

Inspect each updated PNG for clipped account names, overlapping header actions, truncated tab labels, and focus-ring clipping before accepting it.

- [ ] **Step 6: Commit shared chrome**

```bash
git add front/shared/styles/mobile.css \
  front/shared/ui/mobile-header.ct.tsx \
  front/shared/ui/mobile-tab-bar.ct.tsx \
  front/shared/ui/top-nav.ct.tsx \
  front/__screenshots__/shared/ui/mobile-header.ct.tsx/mobile-header-host-320.png \
  front/__screenshots__/shared/ui/mobile-header.ct.tsx/mobile-header-member-390.png \
  front/__screenshots__/shared/ui/top-nav.ct.tsx/top-nav-long-account-name-1280.png
git commit -m "fix(front): improve shared navigation typography"
```

---

### Task 3: Remove the Reading Face from Public Records

**Files:**
- Modify: `front/features/public/ui/public-home.tsx`
- Modify: `front/features/public/ui/public-records-page.tsx`
- Modify: `front/features/public/ui/public-session.tsx`
- Modify: `front/features/public/ui/public-records-page.test.tsx`
- Modify: `front/features/public/ui/public-session.test.tsx`
- Modify: `front/tests/unit/public-home.test.tsx`
- Modify: `front/features/public/ui/public-home.ct.tsx`
- Modify: `front/features/public/ui/public-records-page.ct.tsx`
- Modify: `front/src/styles/globals.css`
- Update after visual review: `front/__screenshots__/features/public/ui/public-records-page.ct.tsx/public-records-index.png`

**Interfaces:**
- Consumes: Task 1 sans utilities and Task 2 mobile chrome.
- Produces: public titles, summaries, quotations, metadata, and CT contracts that render in Pretendard without horizontal overflow.

- [ ] **Step 1: Rewrite public unit assertions to reject the obsolete class**

Use content roles instead of the removed font-role class:

```ts
expect(container.querySelector(".public-record-index-row__title")).toHaveClass("editorial");
expect(container.querySelector(".public-record-index-row__title")).not.toHaveClass("reading-editorial");
expect(container.querySelector(".public-record-index-row__summary")).toHaveClass("body");
expect(container.querySelector(".public-record-index-row__summary")).not.toHaveClass("reading-editorial");
```

Apply the same negative assertion to public home, session summary, highlight quote, and one-liner quote tests.

- [ ] **Step 2: Rewrite public CT expectations for sans rendering and readable rhythm**

For the title and long-copy locators, collect and assert:

```ts
const metrics = await locator.evaluate((element) => {
  const node = element as HTMLElement;
  const style = getComputedStyle(node);
  return {
    fontFamily: style.fontFamily,
    fontSize: Number.parseFloat(style.fontSize),
    lineHeightRatio: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize),
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  };
});

expect(metrics.fontFamily).toContain("Pretendard");
expect(metrics.fontFamily).not.toContain("Iowan Old Style");
expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
expect(metrics.lineHeightRatio).toBeGreaterThanOrEqual(1.6);
expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
```

Metadata may use 14px and short eyebrow labels may use 12px; do not apply the 16px assertion to those roles.

- [ ] **Step 3: Run public unit and CT tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/public/ui/public-records-page.test.tsx features/public/ui/public-session.test.tsx tests/unit/public-home.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/public/ui/public-home.ct.tsx features/public/ui/public-records-page.ct.tsx
```

Expected: FAIL while markup still contains `reading-editorial` and computed font family contains `Iowan Old Style`.

- [ ] **Step 4: Remove `reading-editorial` from public markup**

Use these final class contracts:

```tsx
<h2 className="h2 editorial">{display.title}</h2>
<p className="body public-reading-copy">{display.summary}</p>
<span className="editorial public-archive-row__title">{display.title}</span>
<span className="body public-record-index-row__summary">{display.summary}</span>
<p className="public-session-summary-text editorial">{summary}</p>
<p className="public-note-highlight-row__quote editorial">{text}</p>
<p className="public-note-oneliner-card__quote editorial">{text}</p>
```

Do not change link destinations, route state, counts, or public/private visibility.

- [ ] **Step 5: Normalize public CSS roles and wrapping**

Delete the `.public-home ... .reading-editorial` blocks. Apply:

```css
.public-reading-copy,
.public-session-summary-text,
.public-note-highlight-row__quote,
.public-note-oneliner-card__quote {
  font-family: var(--f-sans);
  line-height: var(--type-leading-body);
}
.public-invite-guidance__note,
.public-archive-row__counts { font-size: var(--type-size-supporting); }
.public-session-meta dt { font-size: var(--type-size-label); font-weight: 600; }
```

Ensure public list and record grid tracks retain `minmax(0, 1fr)` and long title/summary nodes retain `overflow-wrap: anywhere` where needed.

- [ ] **Step 6: Run focused tests, update the reviewed public snapshot, and re-run**

```bash
corepack pnpm --dir front exec vitest run features/public/ui/public-records-page.test.tsx features/public/ui/public-session.test.tsx tests/unit/public-home.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/public/ui/public-home.ct.tsx features/public/ui/public-records-page.ct.tsx --update-snapshots
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/public/ui/public-home.ct.tsx features/public/ui/public-records-page.ct.tsx
```

Expected: PASS at 1200px and 320px with no horizontal overflow. Inspect `public-records-index.png` before accepting it.

- [ ] **Step 7: Commit the public slice**

```bash
git add front/features/public/ui/public-home.tsx \
  front/features/public/ui/public-records-page.tsx \
  front/features/public/ui/public-session.tsx \
  front/features/public/ui/public-records-page.test.tsx \
  front/features/public/ui/public-session.test.tsx \
  front/features/public/ui/public-home.ct.tsx \
  front/features/public/ui/public-records-page.ct.tsx \
  front/tests/unit/public-home.test.tsx \
  front/src/styles/globals.css \
  front/__screenshots__/features/public/ui/public-records-page.ct.tsx/public-records-index.png
git commit -m "fix(public): unify record typography"
```

---

### Task 4: Normalize Member, Current-Session, Archive, and Notification Typography

**Files:**
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/features/member-home/ui/member-home-records.test.tsx`
- Modify: `front/features/member-home/ui/member-home-records.ct.tsx`
- Modify: `front/features/member-home/ui/member-home.tsx`
- Modify: `front/features/member-home/ui/member-home-current-session.tsx`
- Modify: `front/features/archive/ui/member-session-detail-page.tsx`
- Modify: `front/features/archive/ui/member-session-detail-page.ct.tsx`
- Modify: `front/tests/unit/member-session-detail-page.test.tsx`
- Modify: `front/features/archive/ui/notes-feed-list.tsx`
- Modify: `front/features/archive/ui/archive-mobile.tsx`
- Modify: `front/features/archive/ui/archive-desktop.tsx`
- Modify: `front/features/current-session/ui/current-session-page.tsx`
- Modify: `front/features/current-session/ui/current-session-panels.tsx`
- Modify: `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Consumes: Task 1 type roles and Task 2 shared mobile rules.
- Produces: member reading copy at 16~17px, member metadata/actions at 14px or approved 12px labels, and member/archive CT coverage at desktop and 320px.

- [ ] **Step 1: Rewrite member and archive tests to assert semantic sans roles**

Replace positive `reading-editorial` assertions with the final roles:

```ts
expect(screen.getByText(reflection.text)).toHaveClass("body", "editorial");
expect(screen.getByText(reflection.text)).not.toHaveClass("reading-editorial");
expect(screen.getByText(entry.summary)).toHaveClass("body");
expect(screen.getByText(entry.summary)).not.toHaveClass("reading-editorial");
```

In `member-session-detail-page.test.tsx`, assert summary/question/highlight/one-liner nodes do not carry `reading-editorial` while preserving their existing accessible headings and content assertions.

- [ ] **Step 2: Update member/archive CT tests to require Pretendard and readable sizes**

Use desktop and 320px variants and assert:

```ts
expect(metrics.fontFamily).toContain("Pretendard");
expect(metrics.fontFamily).not.toContain("Iowan Old Style");
expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThanOrEqual(1.6);
expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
```

- [ ] **Step 3: Run focused member/archive tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-records.test.tsx tests/unit/member-session-detail-page.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/member-home/ui/member-home-records.ct.tsx features/archive/ui/member-session-detail-page.ct.tsx
```

Expected: FAIL because member and archive reading content still uses `reading-editorial` and serif computed styles.

- [ ] **Step 4: Remove the obsolete class and inline undersized reading values**

Use these semantic contracts:

```tsx
<div className="body-lg editorial">{item.text}</div>
<p className="body member-record-summary">{entry.summary}</p>
<p className="rm-member-activity-card__text body editorial">{item.text}</p>
<p className="body-lg member-session-summary">{summary}</p>
<p className="rm-session-highlight-row__quote body-lg editorial">{highlight.text}</p>
<h4 className="body-lg editorial">{question.text}</h4>
<p className="body member-question-context">{question.context}</p>
<p className="body editorial">{oneLiner.text}</p>
```

Remove inline `fontSize` values of 10, 12, 13, and 13.5 from the listed member/current/archive files. Map eyebrow to `.eyebrow`, readable copy to `.body`/`.body-lg`, controls and status to 14px supporting/control roles, and only short metadata to 12px label role.

- [ ] **Step 5: Replace undefined member-space font aliases and aggressive heading tracking**

In the member-space block of `globals.css`, replace every `font-family: var(--font-editorial)` with `font-family: var(--f-sans)`. Use the Task 1 heading sizes and tracking:

```css
.rm-member-profile h1,
.rm-my-records-page__header h1,
.rm-account-settings-page__header h1 {
  font-family: var(--f-sans);
  font-size: var(--type-size-h1);
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.rm-reading-achievement h2,
.rm-my-records-section-heading h2,
.rm-recent-readings__header h2 {
  font-family: var(--f-sans);
  font-size: var(--type-size-h2);
  letter-spacing: -0.015em;
}
```

Map current `0.8125rem` descriptive member text to `var(--type-size-supporting)`. Keep initials/cover fallback glyphs sans without treating them as reading copy.

- [ ] **Step 6: Normalize member-specific mobile and notification text**

Apply:

```css
.mobile-only .rm-member-activity-card__book,
.mobile-only .rm-current-session-mobile__meeting,
.mobile-only .rm-current-session-mobile__host-link,
.rm-member-notifications-list__meta { font-size: var(--type-size-supporting); }
.mobile-only .rm-member-activity-card__text { font-size: var(--type-size-body); line-height: var(--type-leading-body); }
.mobile-only .rm-current-session-mobile__details dt,
.rm-member-notifications-header__eyebrow { font: 600 var(--type-size-label)/var(--type-leading-label) var(--f-sans); }
.rm-member-notifications-page__error,
.rm-member-notifications-list__empty-copy,
.rm-member-notifications-page__load-more { font-size: var(--type-size-supporting); }
```

Keep notification load/error/empty behavior unchanged. Resolve any 320px overflow with wrapping and grid tracks, not smaller fonts.

- [ ] **Step 7: Run the member/archive test set and related responsive E2E**

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-records.test.tsx tests/unit/member-session-detail-page.test.tsx tests/unit/current-session.test.tsx tests/unit/member-notifications.test.tsx tests/unit/my-page.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/member-home/ui/member-home-records.ct.tsx features/archive/ui/member-session-detail-page.ct.tsx
corepack pnpm --dir front test:e2e -- member-reading-momentum.spec.ts responsive-navigation-chrome.spec.ts
```

Expected: PASS with no horizontal overflow at 320px/390px and unchanged member route behavior.

- [ ] **Step 8: Commit the member slice**

```bash
git add front/features/member-home/ui/member-home-records.tsx \
  front/features/member-home/ui/member-home-records.test.tsx \
  front/features/member-home/ui/member-home-records.ct.tsx \
  front/features/member-home/ui/member-home.tsx \
  front/features/member-home/ui/member-home-current-session.tsx \
  front/features/archive/ui/member-session-detail-page.tsx \
  front/features/archive/ui/member-session-detail-page.ct.tsx \
  front/features/archive/ui/notes-feed-list.tsx \
  front/features/archive/ui/archive-mobile.tsx \
  front/features/archive/ui/archive-desktop.tsx \
  front/features/current-session/ui/current-session-page.tsx \
  front/features/current-session/ui/current-session-panels.tsx \
  front/features/current-session/ui/mobile/mobile-prep-segment.tsx \
  front/tests/unit/member-session-detail-page.test.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/member-notifications.test.tsx \
  front/tests/unit/my-page.test.tsx \
  front/src/styles/globals.css front/shared/styles/mobile.css
git commit -m "fix(member): improve reading and status typography"
```

---

### Task 5: Raise Host Operational Text without Weakening Ledger Semantics

**Files:**
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/ui/host-session-ledger.tsx`
- Modify: `front/features/host/ui/host-club-operations-card.tsx`
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
- Modify: `front/features/host/ui/dashboard/priority-ledger-sections.tsx`
- Modify: `front/features/host/ui/dashboard/quick-action.tsx`
- Modify: `front/features/host/ui/dashboard/invite-pipeline-section.tsx`
- Modify: `front/features/host/ui/dashboard/shared-sections.tsx`
- Modify: `front/features/host/ui/members/member-summary.tsx`
- Modify: `front/features/host/ui/host-invitations.tsx`
- Modify: `front/features/host/ui/host-session-attendance-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-editor-notifications.tsx`
- Modify: `front/features/host/ui/session-closing-board.tsx`
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/host-session-ledger.test.tsx`
- Modify: `front/features/host/ui/host-club-operations-card.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/session-closing-board.ct.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: Task 1 `.ledger-number`, supporting, label, and control roles.
- Produces: 14px minimum host descriptive/action/error text, 12px short labels, and mono only for aligned operational values.

- [ ] **Step 1: Add failing host typography assertions**

Keep existing `.ledger-number` assertions and add source/DOM assertions that descriptive text remains sans:

```ts
expect(screen.getByText("모임 운영")).not.toHaveClass("ledger-number");
expect(screen.getByText("RSVP 미응답")).not.toHaveClass("ledger-number");
for (const value of container.querySelectorAll(".ledger-number")) {
  expect(value.textContent).toMatch(/(?:No\.\d+|\d)/);
}
```

In `session-closing-board.ct.tsx`, measure `.rm-host-closing-board__checklist-item .small` and `.rm-host-closing-board__checklist-item a` at `>= 14px` and keep its existing snapshot assertions.

- [ ] **Step 2: Run host unit and CT tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx features/host/ui/host-session-ledger.test.tsx features/host/ui/host-club-operations-card.test.tsx tests/unit/host-dashboard.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/session-closing-board.ct.tsx
```

Expected: new size assertions FAIL while host reason/action copy remains 11~13px.

- [ ] **Step 3: Replace host inline 12~13.5px copy with semantic roles**

For the listed TSX files, use `.small` for 14px supporting copy and `.tiny` only for a short metadata label. Keep `.ledger-number` only around values:

```tsx
<span className="small rm-host-quick-action__copy">{description}</span>
<span className="tiny rm-host-ledger__label">{label}</span>
<strong className="ledger-number">{metric.value}</strong>
```

Do not wrap phrases such as `참석 3명 · 미응답 2명` entirely in mono; keep the phrase sans and apply `.ledger-number` only to `3` and `2`.

In `session-closing-board.tsx`, action links are readable controls, not metadata. Replace `className="tiny mono"` with `className="small rm-host-closing-board__item-action"`; keep evidence `dt` labels as `.tiny`.

- [ ] **Step 4: Normalize host CSS selector roles**

Use this classification across the host blocks in `globals.css`:

```css
.rm-host-current__metrics dt,
.rm-host-ledger__metric dt,
.rm-host-flow__when,
.rm-host-mobile-ledger dt,
.host-club-ops__badge,
.host-club-ops__metric dt { font-size: var(--type-size-label); }

.rm-host-tool p,
.rm-host-current__footer,
.rm-host-attention__copy > span,
.rm-host-attention__action,
.rm-host-attention__empty,
.rm-host-attention__all,
.rm-host-ledger__error,
.rm-host-flow__step-copy strong,
.rm-host-flow__step-copy span,
.rm-host-mobile-flow__details > summary,
.rm-host-mobile-priority__item p,
.rm-host-mobile-flow__step strong,
.rm-host-mobile-flow__step small,
.rm-host-mobile-tools__rows a,
.host-club-ops__summary,
.host-club-ops__blockers { font-size: var(--type-size-supporting); }

.host-club-ops__header h2 { font-size: var(--type-size-h4); }
```

Use `font-variant-numeric: tabular-nums` on numeric `dd` elements before adding mono. Preserve state colors and content.

- [ ] **Step 5: Run host tests and inspect snapshot diffs before updating**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx features/host/ui/host-session-ledger.test.tsx features/host/ui/host-club-operations-card.test.tsx tests/unit/host-dashboard.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/session-closing-board.ct.tsx
```

If the two existing session-closing snapshots differ only because of the approved typography, update and immediately re-run:

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/session-closing-board.ct.tsx --update-snapshots
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/session-closing-board.ct.tsx
```

- [ ] **Step 6: Run the representative host browser flow**

```bash
corepack pnpm --dir front test:e2e -- host-club-operations.spec.ts
```

Expected: PASS at desktop and mobile with the existing operating-signal screenshots and no clipped ledger rows.

- [ ] **Step 7: Commit the host slice**

```bash
git add front/features/host/ui/host-dashboard.tsx \
  front/features/host/ui/host-session-ledger.tsx \
  front/features/host/ui/host-club-operations-card.tsx \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/ui/dashboard/priority-ledger-sections.tsx \
  front/features/host/ui/dashboard/quick-action.tsx \
  front/features/host/ui/dashboard/invite-pipeline-section.tsx \
  front/features/host/ui/dashboard/shared-sections.tsx \
  front/features/host/ui/members/member-summary.tsx \
  front/features/host/ui/host-invitations.tsx \
  front/features/host/ui/host-session-attendance-editor.tsx \
  front/features/host/ui/session-editor/session-editor-notifications.tsx \
  front/features/host/ui/session-closing-board.tsx \
  front/features/host/ui/host-dashboard.test.tsx \
  front/features/host/ui/host-session-ledger.test.tsx \
  front/features/host/ui/host-club-operations-card.test.tsx \
  front/features/host/ui/session-closing-board.ct.tsx \
  front/tests/unit/host-dashboard.test.tsx front/src/styles/globals.css
git add -u front/__screenshots__/features/host/ui/session-closing-board.ct.tsx
git commit -m "fix(host): raise operational typography"
```

---

### Task 6: Normalize Platform-Admin Labels, Reasons, and Actions

**Files:**
- Modify: `front/src/styles/globals.css`
- Modify: `front/features/platform-admin/ui/admin-status-strip.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.ct.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Update after visual review: `front/__screenshots__/features/platform-admin/ui/admin-support-workbench.ct.tsx/admin-support-workbench-selected.png`

**Interfaces:**
- Consumes: Task 1 label/supporting/control roles.
- Produces: 12px short admin labels and badges, 14px reasons/actions/status copy, and readable admin CT/E2E evidence.

- [ ] **Step 1: Add failing admin size and family assertions**

In `admin-support-workbench.ct.tsx`, measure a short label, a reason sentence, and an action:

```ts
import type { Locator } from "@playwright/test";

const sizeOf = (locator: Locator) =>
  locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

expect(await sizeOf(component.locator(".label").first())).toBeGreaterThanOrEqual(14);
expect(await sizeOf(component.locator(".admin-support-workbench__results em").first())).toBeGreaterThanOrEqual(14);
expect(await sizeOf(component.locator(".admin-support-workbench__ledger-row .small").first())).toBeGreaterThanOrEqual(14);
expect(await sizeOf(component.getByRole("button", { name: "발급" }))).toBeGreaterThanOrEqual(14);
```

Change the ledger metadata locator expectation from `.tiny` to `.small` before this RED run; the DOM assertion fails until the component markup is migrated. In unit tests, preserve the existing status and link text assertions; do not couple tests to color alone.

- [ ] **Step 2: Run focused admin tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-status-strip.test.tsx features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/ui/admin-workspace-switcher.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx features/platform-admin/route/admin-today-route.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-support-workbench.ct.tsx
```

Expected: size assertions FAIL on current 10~13px labels, reasons, and links.

- [ ] **Step 3: Map admin selectors to short-label and supporting roles**

Use 12px only for compact labels/badges and 14px for readable content:

```css
.admin-shell__role-badge,
.admin-workspace-switcher__meta,
.admin-status-strip__label,
.admin-layout-nav__group-header,
.admin-layout-nav__pill,
.platform-admin-domain-status,
.admin-health-grid__stale,
.admin-health-card__pill,
.admin-club-operations__closing-risk-badge { font: 600 var(--type-size-label)/var(--type-leading-label) var(--f-sans); }

.admin-breadcrumb,
.platform-admin-ai-ops__small-list ul,
.admin-selected-brief__notice,
.admin-work-queue__reason,
.admin-selected-brief__link,
.admin-selected-brief__check span,
.admin-health-grid__timestamp,
.admin-health-card__time,
.admin-health-card__drill,
.admin-health-deploy-strip__time,
.admin-notifications__cluster-list em,
.admin-notifications__reason span,
.admin-audit__row-time,
.admin-club-operations__link,
.admin-club-operations__stat span,
.admin-club-operations__closing-risk-overflow,
.admin-support-workbench__results em,
.admin-analytics__kpi-label,
.admin-analytics__kpi-delta { font-size: var(--type-size-supporting); line-height: var(--type-leading-supporting); }
```

Keep `.admin-notifications__safe-code` mono only if it contains a short operator code; set it to at least 12px. Do not use mono for reasons, timestamps written as sentences, breadcrumbs, or links.

In `admin-support-workbench.tsx`, change the selected-target summary and ledger row metadata from `className="tiny muted"` to `className="small muted"`, because both contain names, status, and reason sentences rather than short labels.

- [ ] **Step 4: Resolve admin overflow structurally**

For any newly wrapping admin row, apply the structural pattern instead of shrinking text:

```css
.admin-work-queue__row,
.admin-selected-brief,
.admin-health-card,
.admin-club-operations__closing-risk {
  min-width: 0;
}

.admin-work-queue__reason,
.admin-selected-brief__notice,
.admin-club-operations__closing-risk-overflow {
  overflow-wrap: anywhere;
}
```

Preserve the current kill-switch, disabled-action, permission, and link behavior.

- [ ] **Step 5: Run focused tests, review/update the admin snapshot, and run E2E**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-status-strip.test.tsx features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/ui/admin-workspace-switcher.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx features/platform-admin/route/admin-today-route.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-support-workbench.ct.tsx --update-snapshots
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/platform-admin/ui/admin-support-workbench.ct.tsx
corepack pnpm --dir front test:e2e -- admin-shell.spec.ts admin-today.spec.ts
```

Inspect the selected-workbench PNG for clipped reasons, overlapping state labels, and ambiguous actions before accepting it.

- [ ] **Step 6: Commit the admin slice**

```bash
git add front/features/platform-admin/ui/admin-status-strip.test.tsx \
  front/features/platform-admin/ui/admin-layout-nav.test.tsx \
  front/features/platform-admin/ui/admin-workspace-switcher.test.tsx \
  front/features/platform-admin/ui/admin-today-ledger.test.tsx \
  front/features/platform-admin/ui/admin-support-workbench.tsx \
  front/features/platform-admin/ui/admin-support-workbench.test.tsx \
  front/features/platform-admin/ui/admin-support-workbench.ct.tsx \
  front/features/platform-admin/route/admin-today-route.test.tsx \
  front/src/styles/globals.css \
  front/__screenshots__/features/platform-admin/ui/admin-support-workbench.ct.tsx/admin-support-workbench-selected.png
git commit -m "fix(admin): improve operational typography"
```

---

### Task 7: Add the Repository-Wide Typography Guard and Close Verification

**Files:**
- Create: `front/tests/unit/typography-contract.test.ts`
- Modify if a real layout regression is found: only the owning UI/CSS/test files from Tasks 2~6
- Update if and only if reviewed: affected existing component screenshot baselines

**Interfaces:**
- Consumes: completed Tasks 1~6 with no active serif reading contract or sub-12px visual text.
- Produces: a permanent source guard, complete design/frontend gate evidence, and final desktop/mobile visual proof.

- [ ] **Step 1: Write the repository-wide active-source guard**

Create the test with these exact collectors and assertions:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontRoot = path.join(repoRoot, "front");
const sourceRoots = [
  path.join(frontRoot, "src"),
  path.join(frontRoot, "shared"),
  path.join(frontRoot, "features"),
  path.join(repoRoot, "design/system/src"),
];
const activeExtensions = new Set([".css", ".ts", ".tsx"]);

function collectActiveFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectActiveFiles(entryPath);
    if (!entry.isFile() || !activeExtensions.has(path.extname(entry.name))) return [];
    if (/\.(?:test|ct)\.[^.]+$/.test(entry.name)) return [];
    return [entryPath];
  });
}

function numericMatches(source: string, pattern: RegExp): number[] {
  return Array.from(source.matchAll(pattern), (match) => Number.parseFloat(match[1]));
}

describe("frontend typography contract", () => {
  const sources = sourceRoots.flatMap(collectActiveFiles).map((file) => ({
    file: path.relative(repoRoot, file),
    source: fs.readFileSync(file, "utf8"),
  }));

  it("does not reintroduce the removed reading-face contract", () => {
    const forbidden = ["Iowan Old Style", "--f-reading", "reading-editorial", "--font-editorial"];
    const violations = sources.flatMap(({ file, source }) =>
      forbidden.filter((token) => source.includes(token)).map((token) => `${file}: ${token}`),
    );
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not render active visual text below 12px", () => {
    const violations = sources.flatMap(({ file, source }) => {
      const cssSizes = numericMatches(source, /font-size:\s*(\d+(?:\.\d+)?)px/g);
      const inlineSizes = numericMatches(source, /fontSize:\s*["']?(\d+(?:\.\d+)?)(?:px)?["']?/g);
      return [...cssSizes, ...inlineSizes].filter((size) => size < 12).map((size) => `${file}: ${size}px`);
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the guard and repair any true remaining violation**

```bash
corepack pnpm --dir front exec vitest run tests/unit/typography-contract.test.ts
```

Expected: PASS. If it reports a remaining source value, classify it as label, supporting copy, control, or body and use the corresponding Task 1 property. Do not add an allowlist for active visual text below 12px.

- [ ] **Step 3: Run exact static residue scans**

```bash
rg -n "Iowan Old Style|--f-reading|reading-editorial|--font-editorial" design/system/src front/src front/shared front/features --glob '!**/*.test.*' --glob '!**/*.ct.*'
rg -n "font-size: (10|10\\.5|11|11\\.5)px|fontSize: [\"']?(10|10\\.5|11|11\\.5)(px)?" design/system/src front/src front/shared front/features --glob '!**/*.test.*' --glob '!**/*.ct.*'
```

Expected: both commands return no active-source matches. Tests contain negative assertions by design, and historical specs/plans are intentionally outside the scan.

- [ ] **Step 4: Run focused component tests across all four product roles**

```bash
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/mobile-header.ct.tsx shared/ui/mobile-tab-bar.ct.tsx features/public/ui/public-home.ct.tsx features/public/ui/public-records-page.ct.tsx features/member-home/ui/member-home-records.ct.tsx features/archive/ui/member-session-detail-page.ct.tsx features/host/ui/session-closing-board.ct.tsx features/platform-admin/ui/admin-support-workbench.ct.tsx
```

Expected: PASS at the encoded desktop/mobile widths with reviewed screenshots and no overflow assertions.

- [ ] **Step 5: Run the complete design and frontend gates**

```bash
corepack pnpm design:check
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 6: Run the representative browser matrix once at final HEAD**

```bash
corepack pnpm --dir front test:e2e -- responsive-navigation-chrome.spec.ts member-reading-momentum.spec.ts host-club-operations.spec.ts admin-shell.spec.ts admin-today.spec.ts
```

Expected: PASS for public/shared chrome, member desktop/mobile, host desktop/mobile, and admin workflow. Do not broaden to billable AI calls, email dispatch, deploy, or production mutation.

- [ ] **Step 7: Inspect final visual evidence**

At minimum inspect:

- public home and public records at 1200px and 320px;
- member home and member session detail at 1200px and 320px;
- host dashboard/ledger at desktop and mobile;
- admin today/work queue at desktop and the existing responsive width;
- browser zoom or equivalent font-scale evidence for clipping on one representative dense screen.

Reject evidence with clipped focus rings, overlapping controls, hidden permission/state text, unintended horizontal scrolling, or a return to per-selector font shrinking.

- [ ] **Step 8: Run final diff hygiene and commit the guard/final repairs**

```bash
git diff --check
git add front/tests/unit/typography-contract.test.ts
git add -u design/system/src front/src front/shared front/features front/tests front/__screenshots__
git commit -m "test(front): enforce typography readability contract"
```

Before committing, verify `git diff --cached --name-only` contains only typography-plan files and reviewed screenshots. Do not stage unrelated worktree changes.

## Final Evidence Checklist

- [ ] Design-system RED/GREEN evidence recorded.
- [ ] Public, member, host, and admin focused tests passed.
- [ ] 320px, 390px, and desktop wrapping/overflow evidence passed.
- [ ] Reviewed screenshot baselines contain no typography regressions.
- [ ] `Iowan Old Style`, `--f-reading`, `reading-editorial`, `--font-editorial` active residue scan is empty.
- [ ] Active visual text below 12px scan is empty.
- [ ] `corepack pnpm design:check` passed.
- [ ] `corepack pnpm --dir front lint` passed.
- [ ] `corepack pnpm --dir front test` passed.
- [ ] `corepack pnpm --dir front build` passed.
- [ ] Representative final-HEAD E2E matrix passed.
- [ ] `git diff --check` passed.
- [ ] No server, BFF, API, migration, auth, deploy, live AI, or email-send mutation occurred.
