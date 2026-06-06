# Visual Regression (Playwright Component Harness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a component-level visual regression harness for ReadMates `shared/ui` primitives using Playwright component testing, with committed snapshot baselines, a deterministic baseline-generation workflow, and a documented flake policy.

**Architecture:** A dedicated Playwright component-test project (`@playwright/experimental-ct-react`) renders individual React components against the real design-system CSS, captures `toHaveScreenshot` baselines, and runs independently from the existing heavyweight E2E project (which boots the Spring server + Vite). Component tests are co-located as `*.ct.tsx` next to their components under `front/shared/ui/`. Baselines are committed and regenerated through a single deterministic command so darwin-local and CI-linux renders agree.

**Tech Stack:** Vite 8, React 19, `@playwright/test` ^1.54.1, `@playwright/experimental-ct-react`, `@readmates/design-system` CSS, pnpm 10.

---

## Context for the implementer (read before Task 1)

ReadMates frontend is a Vite React SPA. Key facts you need:

- **Package manager:** `pnpm` via `pnpm --dir front <script>` from repo root, or `pnpm <script>` inside `front/`. Version pinned `pnpm@10.33.0`.
- **Existing Playwright usage:** `front/playwright.config.ts` defines an **E2E** project with `testMatch: ["tests/e2e/**/*.spec.ts"]` and a heavyweight `webServer` that boots the Kotlin server + Vite. **Do not modify that file** — the component harness gets its own config so the two never collide.
- **Path alias:** `@` → `front/` root (configured in `front/vitest.config.ts` and `front/tsconfig.json`). Component imports use `@/shared/ui/...`, `@/shared/security/...`, etc.
- **Design-system CSS:** global styles live at `front/src/styles/globals.css`, which `@import`s `@readmates/design-system/styles.css` plus mobile styles. Components rely on CSS custom properties (`--accent`, `--text`, `--paper-50`, etc.) defined there. The component harness MUST load `globals.css` or every snapshot will render unstyled.
- **Co-location convention** (`front/AGENTS.md`): new unit tests live next to source. Visual tests follow the same rule with a distinct `.ct.tsx` suffix so they are NOT picked up by vitest (`*.test.{ts,tsx}`) or the E2E project (`tests/e2e/**`).
- **Do NOT add `"use client"`** to any Vite source file.
- **Three initial snapshot targets**, chosen because they are pure prop-driven primitives:
  - `front/shared/ui/readmates-brand-mark.tsx` — `ReadmatesBrandMark()`, no props, no external deps. Simplest possible smoke target.
  - `front/shared/ui/book-cover.tsx` — `BookCover({ title, author, imageUrl, ... })`. Has a no-image fallback branch (render with `imageUrl` omitted to keep the snapshot deterministic and network-free).
  - `front/shared/ui/avatar-chip.tsx` — `AvatarChip({ name, label, size, ... })`. Deterministic tone via internal hash of the label.

### Determinism & flake policy (binding for this plan)

Pixel snapshots are platform-sensitive (font rendering differs across OSes). To keep baselines stable:

1. **Single source of truth for baselines = the Playwright Docker image.** Baselines are generated and updated only via `pnpm --dir front test:ct:update:docker` (Task 6), which runs the harness inside `mcr.microsoft.com/playwright:v1.54.1-jammy`. This matches CI's linux renderer. Never commit baselines produced by a bare local `--update-snapshots` on darwin.
2. **Disable animations & caret**, set a fixed viewport, and allow a small `maxDiffPixelRatio` to absorb sub-pixel AA noise (configured in Task 2).
3. **Snapshots are committed** under the Playwright-managed snapshot directory and reviewed like code.
4. This is an **experimental** Playwright API on bleeding-edge Vite 8 / React 19. Task 1 includes an install + smoke gate; if the harness cannot boot, STOP and escalate rather than forcing it.

---

## File Structure

- `front/package.json` — add `@playwright/experimental-ct-react` devDep + `test:ct` / `test:ct:update` / `test:ct:update:docker` scripts. (Modify)
- `front/playwright-ct.config.ts` — component-test Playwright config (separate project). (Create)
- `front/playwright/index.html` — CT mount host page. (Create)
- `front/playwright/index.tsx` — CT entry; imports `@/src/styles/globals.css`. (Create)
- `front/shared/ui/readmates-brand-mark.ct.tsx` — first visual test + baseline. (Create)
- `front/shared/ui/book-cover.ct.tsx` — visual test + baseline. (Create)
- `front/shared/ui/avatar-chip.ct.tsx` — visual test + baseline. (Create)
- `front/.gitignore` — ensure CT result/output dirs ignored, snapshots NOT ignored. (Modify)
- `docs/development/test-guide.md` — document the harness, commands, artifact paths, flake policy. (Modify)
- `CHANGELOG.md` — Unreleased entry. (Modify)

---

## Task 1: Install component-test dependency and verify the harness boots

**Files:**
- Modify: `front/package.json` (devDependencies + scripts)
- Create: `front/playwright-ct.config.ts`
- Create: `front/playwright/index.html`
- Create: `front/playwright/index.tsx`

- [ ] **Step 1: Add the devDependency and scripts to `front/package.json`**

In the `scripts` block, add after the existing `"test:e2e"` line:

```json
    "test:ct": "playwright test --config=playwright-ct.config.ts",
    "test:ct:update": "playwright test --config=playwright-ct.config.ts --update-snapshots",
    "test:ct:update:docker": "docker run --rm --ipc=host -v \"$PWD/..\":/work -w /work/front mcr.microsoft.com/playwright:v1.54.1-jammy /bin/sh -lc 'corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts --update-snapshots'",
```

In `devDependencies`, add (keep alphabetical near the other `@playwright` entry):

```json
    "@playwright/experimental-ct-react": "^1.54.1",
```

- [ ] **Step 2: Install**

Run: `pnpm --dir front install`
Expected: lockfile updates, `@playwright/experimental-ct-react` resolved. If install fails because the experimental package cannot resolve against Vite 8 / React 19, STOP and escalate (do not pin random versions).

- [ ] **Step 3: Create the CT mount host page `front/playwright/index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ReadMates CT</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create the CT entry `front/playwright/index.tsx`**

```tsx
import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "@/src/styles/globals.css";

beforeMount(async () => {
  document.documentElement.lang = "ko";
});
```

- [ ] **Step 5: Create `front/playwright-ct.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const frontRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.ct.tsx"],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    ctViewport: { width: 480, height: 360 },
    ctTemplateDir: "playwright",
    ctVitePort: 3110,
    ctViteConfig: {
      resolve: {
        alias: { "@": frontRoot },
      },
      plugins: [react()],
    },
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 6: Smoke-verify the harness can boot (no test files yet)**

Run: `pnpm --dir front exec playwright test --config=playwright-ct.config.ts --list`
Expected: exits 0 reporting "0 tests" (or lists nothing) WITHOUT a Vite/transform/config crash. A clean "no tests found" is success. A stack trace from `@playwright/experimental-ct-react` boot means the experimental harness is incompatible — STOP and escalate.

- [ ] **Step 7: Commit**

```bash
git add front/package.json front/pnpm-lock.yaml front/playwright-ct.config.ts front/playwright/index.html front/playwright/index.tsx
git commit -m "build(front): scaffold Playwright component visual-regression harness"
```

---

## Task 2: First visual test + baseline — ReadmatesBrandMark

**Files:**
- Create: `front/shared/ui/readmates-brand-mark.ct.tsx`
- Create (generated): `front/shared/ui/__screenshots__/.../*.png`

- [ ] **Step 1: Write the visual test**

```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { ReadmatesBrandMark } from "@/shared/ui/readmates-brand-mark";

test("ReadmatesBrandMark renders the brand glyph", async ({ mount }) => {
  const component = await mount(<ReadmatesBrandMark />);
  await expect(component).toHaveScreenshot("brand-mark.png");
});
```

- [ ] **Step 2: Run to confirm it FAILS for the right reason (missing baseline)**

Run: `pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/readmates-brand-mark.ct.tsx`
Expected: FAIL with "A snapshot doesn't exist ... writing actual." (Playwright writes the candidate on first run.) This confirms the component renders and the assertion path works.

- [ ] **Step 3: Generate the committed baseline deterministically (Docker)**

Run: `pnpm --dir front test:ct:update:docker`
Expected: PASS; a `brand-mark.png` baseline is written under `front/shared/ui/__screenshots__/`. If Docker is unavailable in this environment, STOP and report — do NOT substitute a darwin-local baseline (it will not match CI).

- [ ] **Step 4: Re-run inside Docker to confirm the baseline is stable**

Run: `pnpm --dir front test:ct:update:docker` (idempotent) then verify no PNG changes: `git status --porcelain front/shared/ui/__screenshots__`
Expected: second run produces no diff (empty `git status` for the screenshots dir).

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/readmates-brand-mark.ct.tsx front/shared/ui/__screenshots__
git commit -m "test(front): add ReadmatesBrandMark visual baseline"
```

---

## Task 3: Visual test + baseline — BookCover (fallback branch)

**Files:**
- Create: `front/shared/ui/book-cover.ct.tsx`
- Create (generated): baseline PNG under `__screenshots__`

- [ ] **Step 1: Write the visual test (no imageUrl → deterministic, network-free fallback)**

```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { BookCover } from "@/shared/ui/book-cover";

test("BookCover renders the text fallback when no image is provided", async ({ mount }) => {
  const component = await mount(
    <BookCover title="달까지 가자" author="장류진" width={120} />,
  );
  await expect(component).toHaveScreenshot("book-cover-fallback.png");
});
```

- [ ] **Step 2: Run to confirm first-run behavior**

Run: `pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/book-cover.ct.tsx`
Expected: FAIL with "A snapshot doesn't exist ... writing actual." (component renders, baseline missing).

- [ ] **Step 3: Generate the committed baseline (Docker)**

Run: `pnpm --dir front test:ct:update:docker`
Expected: PASS; `book-cover-fallback.png` baseline written. Docker unavailable → STOP and report.

- [ ] **Step 4: Confirm stability**

Run: `pnpm --dir front test:ct:update:docker` then `git status --porcelain front/shared/ui/__screenshots__`
Expected: no diff on the second run.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/book-cover.ct.tsx front/shared/ui/__screenshots__
git commit -m "test(front): add BookCover fallback visual baseline"
```

---

## Task 4: Visual test + baseline — AvatarChip

**Files:**
- Create: `front/shared/ui/avatar-chip.ct.tsx`
- Create (generated): baseline PNG under `__screenshots__`

- [ ] **Step 1: Write the visual test (fixed label → deterministic tone)**

```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarChip } from "@/shared/ui/avatar-chip";

test("AvatarChip renders the initial with a deterministic tone", async ({ mount }) => {
  const component = await mount(
    <AvatarChip name="김우승" label="김우승" size={48} />,
  );
  await expect(component).toHaveScreenshot("avatar-chip.png");
});
```

- [ ] **Step 2: Run to confirm first-run behavior**

Run: `pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx`
Expected: FAIL with "A snapshot doesn't exist ... writing actual."

- [ ] **Step 3: Generate the committed baseline (Docker)**

Run: `pnpm --dir front test:ct:update:docker`
Expected: PASS; `avatar-chip.png` baseline written. Docker unavailable → STOP and report.

- [ ] **Step 4: Confirm stability**

Run: `pnpm --dir front test:ct:update:docker` then `git status --porcelain front/shared/ui/__screenshots__`
Expected: no diff on the second run.

- [ ] **Step 5: Commit**

```bash
git add front/shared/ui/avatar-chip.ct.tsx front/shared/ui/__screenshots__
git commit -m "test(front): add AvatarChip visual baseline"
```

---

## Task 5: Full-suite verification + git hygiene

**Files:**
- Modify: `front/.gitignore`

- [ ] **Step 1: Run the whole component suite against committed baselines (Docker)**

Run: `pnpm --dir front test:ct:update:docker` is for updating; for verification run the suite WITHOUT update inside Docker:

```bash
docker run --rm --ipc=host -v "$PWD/..":/work -w /work/front mcr.microsoft.com/playwright:v1.54.1-jammy \
  /bin/sh -lc 'corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts'
```

Expected: all 3 tests PASS against committed baselines with no diff.

- [ ] **Step 2: Ensure CT output dirs are ignored but baselines are NOT**

Read `front/.gitignore`. Append (only the entries not already present):

```gitignore
# Playwright component-test transient output (baselines under __screenshots__ are committed)
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

Confirm `__screenshots__` is NOT matched by any ignore rule: `git check-ignore front/shared/ui/__screenshots__ || echo "tracked-ok"` should print `tracked-ok`.

- [ ] **Step 3: Confirm the harness does not leak into vitest or E2E lanes**

Run: `pnpm --dir front test`
Expected: vitest PASS; it does NOT pick up `*.ct.tsx` (vitest matches `*.test.{ts,tsx}`). Confirm 0 `.ct.tsx` files appear in vitest output.

Run: `pnpm --dir front exec playwright test --list` (the default E2E config)
Expected: lists only `tests/e2e/**` specs; no `.ct.tsx` entries.

- [ ] **Step 4: Lint passes on new files**

Run: `pnpm --dir front lint`
Expected: PASS (no errors in the new `.ct.tsx` / config / entry files).

- [ ] **Step 5: Commit**

```bash
git add front/.gitignore
git commit -m "chore(front): ignore Playwright CT transient output, keep baselines tracked"
```

---

## Task 6: Document the harness, commands, and flake policy

**Files:**
- Modify: `docs/development/test-guide.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a "Visual regression (component harness)" section to `docs/development/test-guide.md`**

Document, in Korean to match the file's voice:
- 목적: `shared/ui` primitive의 시각적 회귀를 컴포넌트 단위로 잡는다 (Playwright component testing, `@playwright/experimental-ct-react`).
- 설정 파일: `front/playwright-ct.config.ts` (E2E `front/playwright.config.ts` 와 분리; 서버 부팅 불필요).
- 테스트 위치: `front/shared/ui/**/*.ct.tsx` (co-location, vitest `*.test.tsx` 및 E2E `tests/e2e/**` 와 충돌하지 않음).
- 스냅샷 경로: `front/shared/ui/__screenshots__/...` (커밋 대상).
- 명령:
  - `pnpm --dir front test:ct` — 로컬 검증(렌더 확인용; 픽셀 비교는 플랫폼차로 실패할 수 있음).
  - `pnpm --dir front test:ct:update:docker` — **baseline 생성/갱신의 유일한 정식 경로**. `mcr.microsoft.com/playwright:v1.54.1-jammy` 안에서 실행해 CI(linux) 렌더러와 일치시킨다.
- Flake policy: animations/caret 비활성화, 고정 viewport(480x360), `maxDiffPixelRatio: 0.02`. darwin 로컬 `--update-snapshots` 로 만든 baseline은 커밋 금지(폰트 렌더링 차이로 CI에서 깨짐).
- 실험적 API 주의: `@playwright/experimental-ct-react` 는 experimental 이며 Vite 8 / React 19 조합은 최신이다. 부팅 실패 시 강제로 우회하지 말고 이슈로 남긴다.

- [ ] **Step 2: Add an Unreleased CHANGELOG entry**

Under `## Unreleased` → an appropriate subsection (e.g. add a `### Testing` bullet or extend `### Highlights`), in Korean:

```markdown
- **visual regression harness:** `shared/ui` primitive에 대한 Playwright 컴포넌트 단위 시각 회귀 하니스를 추가했습니다. baseline은 `mcr.microsoft.com/playwright:v1.54.1-jammy` 안에서만 생성해 CI 렌더러와 일치시키고, 스냅샷을 커밋 대상으로 관리합니다 (ReadmatesBrandMark / BookCover / AvatarChip 초기 커버리지).
```

- [ ] **Step 3: Docs safety + format check**

Run: `git diff --check -- docs/development/test-guide.md CHANGELOG.md`
Expected: no whitespace errors. Confirm no secrets/local paths/private domains were introduced (public-repo safety).

- [ ] **Step 4: Commit**

```bash
git add docs/development/test-guide.md CHANGELOG.md
git commit -m "docs: document Playwright visual-regression component harness"
```

---

## Validation (run after all tasks)

- [ ] `pnpm --dir front lint` — PASS
- [ ] `pnpm --dir front test` — PASS, no `.ct.tsx` picked up
- [ ] `pnpm --dir front build` — PASS (harness files do not break the production build)
- [ ] Component suite in Docker (Task 5 Step 1) — all baselines PASS with no diff
- [ ] `git status` — clean; `__screenshots__` baselines tracked, transient dirs ignored

## Out of scope (do not implement here)

- Wiring the CT suite into CI pipelines (separate infra change).
- Expanding coverage beyond the 3 seed primitives.
- Route-level / full-page visual snapshots (those stay in the E2E evidence flow).
- Storybook adoption.
