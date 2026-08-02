# Icon Scale and Font Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the approved ReadMates content and navigation icon sizes on desktop and mobile, and eliminate local Pretendard 403 responses caused by cross-worktree dependency links.

**Architecture:** Keep feature presentation prop-driven and change only the existing shared icon primitives, their call-site sizes, and narrowly related spacing. Treat the font failure as a local dependency integrity problem: repair pnpm links inside the active checkout, never widen Vite filesystem access or duplicate font binaries.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright Component Testing, CSS, pnpm 11.13.1 via Corepack.

## Global Constraints

- Preserve routes, API contracts, authorization, copy, data flow, and public/private boundaries.
- Keep every icon-only control and navigation destination at least 44px in its interactive dimension.
- Verify 320px, 390px, and wide desktop layouts without overflow or clipped Korean/English text.
- Do not add local absolute paths, real member data, secrets, deployment state, or font binaries to tracked files.
- Do not widen `server.fs.allow`, remove Pretendard, or replace it with a system-font fallback.
- Use `corepack pnpm` so every dependency and verification command uses the pinned `pnpm@11.13.1`.
- Preserve unrelated user changes in the primary checkout.
- Commit implementation on `codex/icon-scale-font-recovery`; merge locally to `main` only after final verification. Do not push.

---

### Task 1: Lock the shared navigation icon scale

**Files:**
- Modify: `front/shared/ui/readmates-brand-mark.tsx`
- Modify: `front/shared/ui/workspace-switch-icon.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/features/auth/ui/account-menu.tsx`
- Modify: `design/system/src/styles/tokens.css`
- Test: `front/shared/ui/readmates-brand-mark.ct.tsx`
- Test: `front/shared/ui/top-nav.ct.tsx`
- Test: `front/shared/ui/mobile-tab-bar.ct.tsx`
- Test: `front/features/auth/ui/account-menu.test.tsx`

**Interfaces:**
- Consumes: existing `ReadmatesBrandMark()`, `WorkspaceSwitchIcon({ size?: number })`, `TabIcon({ name })`, and `AvatarChip({ size })`.
- Produces: 34px brand mark, 22px workspace icon, 24px mobile tab icons, 32px desktop account avatar, and a 36px desktop workspace visual control inside existing navigation.

- [ ] **Step 1: Write failing size assertions**

Add observable assertions to the existing tests:

```tsx
// readmates-brand-mark.ct.tsx
const box = await component.boundingBox();
expect(box?.width).toBe(34);
expect(box?.height).toBe(34);

// top-nav.ct.tsx, on a member nav rendered with showHostEntry
const switchIcon = navigation.locator(".rm-workspace-switch svg");
expect((await switchIcon.boundingBox())?.width).toBe(22);
expect((await navigation.locator(".rm-workspace-switch").boundingBox())?.width).toBe(36);

// mobile-tab-bar.ct.tsx
const iconSizes = await tabBar.locator(".m-tab svg").evaluateAll((icons) =>
  icons.map((icon) => icon.getBoundingClientRect().width),
);
expect(iconSizes.every((size) => size === 24)).toBe(true);

// account-menu.test.tsx
const avatar = trigger.querySelector<HTMLElement>(".rm-avatar-chip");
expect(avatar?.style.getPropertyValue("--avatar-size")).toBe("32px");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/ui/account-menu.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/readmates-brand-mark.ct.tsx shared/ui/top-nav.ct.tsx shared/ui/mobile-tab-bar.ct.tsx
```

Expected: assertions report current values 30, 17, 20, or 28 instead of the approved values.

- [ ] **Step 3: Implement the minimal shared sizes**

Apply the approved values at their owners:

```tsx
// readmates-brand-mark.tsx
width: "34px",
height: "34px",
// preserve the 20x20 internal book glyph for optical weight

// workspace-switch-icon.tsx
export function WorkspaceSwitchIcon({ size = 22 }: { size?: number }) { /* existing SVG */ }

// top-nav.tsx
<WorkspaceSwitchIcon size={22} />

// mobile-tab-bar.tsx common SVG props
width: 24,
height: 24,

// account-menu.tsx
<AvatarChip avatarKey={avatarKey} name={memberName} label="" size={32} />
```

Update `.rm-workspace-switch` in `design/system/src/styles/tokens.css` from 30px square to 36px square while keeping navigation height and focus behavior unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the two commands from Step 2. Expected: all selected unit and component tests pass.

- [ ] **Step 5: Commit the navigation scale**

```bash
git add front/shared/ui/readmates-brand-mark.tsx front/shared/ui/workspace-switch-icon.tsx front/shared/ui/top-nav.tsx front/shared/ui/mobile-tab-bar.tsx front/features/auth/ui/account-menu.tsx design/system/src/styles/tokens.css front/shared/ui/readmates-brand-mark.ct.tsx front/shared/ui/top-nav.ct.tsx front/shared/ui/mobile-tab-bar.ct.tsx front/features/auth/ui/account-menu.test.tsx
git commit -m "fix(ui): enlarge shared navigation icons"
```

### Task 2: Enlarge member-home people and shortcut icons

**Files:**
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/features/member-home/ui/member-home.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Test: `front/features/member-home/ui/member-home-records.test.tsx`
- Test: `front/features/member-home/ui/member-home-records.ct.tsx`
- Test: `front/tests/unit/member-home.test.tsx`

**Interfaces:**
- Consumes: `ClubPulse`, `RosterSummary`, `MobileMemberActivity`, `MobileIcon`, and `AvatarChip`.
- Produces: 30px desktop club-flow avatars, 34px roster avatars, 32px mobile activity avatars, 22px mobile shortcut icons, and 18px recent-record chevrons.

- [ ] **Step 1: Write failing member-home size tests**

Add a question item with an author to `member-home-records.test.tsx`, then assert inline avatar variables:

```tsx
const pulse = render(<ClubPulse items={[questionItem]} />);
expect(pulse.container.querySelector<HTMLElement>(".rm-club-pulse-entry__author .rm-avatar-chip")
  ?.style.getPropertyValue("--avatar-size")).toBe("30px");
pulse.unmount();

const mobile = render(<MobileMemberActivity items={[questionItem]} />);
expect(mobile.container.querySelector<HTMLElement>(".rm-member-activity-card__author .rm-avatar-chip")
  ?.style.getPropertyValue("--avatar-size")).toBe("32px");
mobile.unmount();

const roster = render(<RosterSummary current={currentWithOneAttendee} />);
expect(roster.container.querySelector<HTMLElement>(".rm-avatar-chip")
  ?.style.getPropertyValue("--avatar-size")).toBe("34px");
```

In `member-home.test.tsx`, assert both shortcut SVGs have `width="22"` and `height="22"`. In the component test, assert avatar bounding boxes match 30px and 32px and no 320px horizontal overflow appears.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-records.test.tsx tests/unit/member-home.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/member-home/ui/member-home-records.ct.tsx
```

Expected: current 22px, 26px, and 18px values fail the new assertions.

- [ ] **Step 3: Implement member-home sizes and spacing**

Change the call sites to `size={30}`, `size={34}`, `size={32}`, and `size={22}` respectively. Change `.rm-recent-record__destination-chevron` to 18px. Increase author-row gaps only where necessary to keep names visually separated from 30–32px artwork; preserve existing content order and card structure.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the commands from Step 2. Expected: all selected tests pass at 320px and desktop widths.

- [ ] **Step 5: Commit member-home changes**

```bash
git add front/features/member-home/ui/member-home-records.tsx front/features/member-home/ui/member-home.tsx front/src/styles/globals.css front/shared/styles/mobile.css front/features/member-home/ui/member-home-records.test.tsx front/features/member-home/ui/member-home-records.ct.tsx front/tests/unit/member-home.test.tsx
git commit -m "fix(ui): enlarge member activity icons"
```

### Task 3: Enlarge notes avatars and search affordance

**Files:**
- Modify: `front/shared/ui/notes-feed-list.tsx`
- Modify: `front/shared/ui/notes-session-filter.tsx`
- Test: `front/features/archive/ui/notes-feed-list.ct.tsx`
- Test: `front/tests/unit/notes-feed-page.test.tsx`

**Interfaces:**
- Consumes: `FeedSections`, `FeedAuthorRow`, `SessionRail`, `SearchIcon`, and `AvatarChip`.
- Produces: 30px author artwork for questions, one-line reviews, and highlights on desktop/mobile, plus a 20px session-search icon.

- [ ] **Step 1: Write failing notes size assertions**

Extend the note fixtures so `FeedSections` renders authored question, one-line review, and highlight entries. Assert:

```tsx
const avatarSizes = await component.locator(".rm-avatar-chip").evaluateAll((avatars) =>
  avatars.map((avatar) => avatar.getBoundingClientRect().width),
);
expect(avatarSizes.every((size) => size === 30)).toBe(true);
```

Add to `notes-feed-page.test.tsx`:

```tsx
const avatars = Array.from(container.querySelectorAll<HTMLElement>(".rm-avatar-chip"));
expect(avatars.length).toBeGreaterThan(0);
expect(avatars.every((avatar) => avatar.style.getPropertyValue("--avatar-size") === "30px")).toBe(true);
const searchIcon = container.querySelector("#notes-session-search")?.parentElement?.querySelector("svg");
expect(searchIcon).toHaveAttribute("width", "20");
expect(searchIcon).toHaveAttribute("height", "20");
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run tests/unit/notes-feed-page.test.tsx
corepack pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/archive/ui/notes-feed-list.ct.tsx
```

Expected: existing 20–22px avatars and 14px search icon fail.

- [ ] **Step 3: Implement notes sizes**

Pass `markerSize={30}` from every `FeedAuthorRow` call and render `<SearchIcon size={20} />`. Adjust search input left padding from 34px to 40px and keep its label, height, focus, and filtering behavior unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the commands from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit notes changes**

```bash
git add front/shared/ui/notes-feed-list.tsx front/shared/ui/notes-session-filter.tsx front/features/archive/ui/notes-feed-list.ct.tsx front/tests/unit/notes-feed-page.test.tsx
git commit -m "fix(ui): enlarge notes author markers"
```

### Task 4: Prove font recovery and responsive integration

**Files:**
- Modify only if a confirmed integration defect requires it: files already listed in Tasks 1–3.
- Evidence only, untracked: browser screenshots, console logs, and build output.

**Interfaces:**
- Consumes: the current worktree-local pnpm install and the completed UI tasks.
- Produces: verified worktree-local Pretendard resolution, no font 403 during route transitions, responsive browser evidence, and green frontend gates.

- [ ] **Step 1: Prove dependency locality**

```bash
FONT_PATH=$(realpath front/node_modules/pretendard)
case "$FONT_PATH" in "$PWD"/*) printf 'Pretendard local: %s\n' "$FONT_PATH" ;; *) printf 'Pretendard escaped worktree: %s\n' "$FONT_PATH"; exit 1 ;; esac
```

Expected: the resolved path begins with this worktree path.

- [ ] **Step 2: Run canonical automated gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:ct
git diff --check
```

Expected: all commands exit 0. Component snapshots change only where approved icon sizing affects the target surfaces.

- [ ] **Step 3: Run one bounded desktop/mobile browser inspection**

Start an isolated Vite server without stopping the user's port 5173 process:

```bash
corepack pnpm --dir front dev --host 127.0.0.1 --port 5174
```

Inspect `/clubs/reading-sai/app` and `/clubs/reading-sai/app/notes` at wide desktop, 390px, and 320px. Verify the approved element sizes, no horizontal overflow, visible focus, and at least 44px interactive targets.

- [ ] **Step 4: Verify the route-transition font contract**

Navigate home → notes → home. Read console/network evidence and run:

```js
await document.fonts.load("650 16px 'Pretendard Variable'", "읽는사이 ReadMates")
```

Expected: at least one loaded face, every returned face has status `loaded`, and no Pretendard `.woff2` request returns 403.

- [ ] **Step 5: Apply one bounded correction pass if needed**

If the batched browser inspection finds clipping, spacing, or target-size defects, add a failing focused test for each confirmed defect, apply one consolidated fix, rerun the focused test, and perform one final desktop/mobile confirmation round.

- [ ] **Step 6: Commit final integration corrections**

If Step 5 changed tracked files:

```bash
git add front/shared/ui/readmates-brand-mark.tsx front/shared/ui/workspace-switch-icon.tsx front/shared/ui/top-nav.tsx front/shared/ui/mobile-tab-bar.tsx front/features/auth/ui/account-menu.tsx design/system/src/styles/tokens.css front/features/member-home/ui/member-home-records.tsx front/features/member-home/ui/member-home.tsx front/src/styles/globals.css front/shared/styles/mobile.css front/shared/ui/notes-feed-list.tsx front/shared/ui/notes-session-filter.tsx front/shared/ui/readmates-brand-mark.ct.tsx front/shared/ui/top-nav.ct.tsx front/shared/ui/mobile-tab-bar.ct.tsx front/features/auth/ui/account-menu.test.tsx front/features/member-home/ui/member-home-records.test.tsx front/features/member-home/ui/member-home-records.ct.tsx front/tests/unit/member-home.test.tsx front/features/archive/ui/notes-feed-list.ct.tsx front/tests/unit/notes-feed-page.test.tsx
git diff --cached --check
git commit -m "fix(ui): align responsive icon spacing"
```

If Step 5 changed no tracked files, record that no additional commit was required.

### Task 5: Merge the verified branch into local main

**Files:**
- No new product files; git integration only.

**Interfaces:**
- Consumes: clean `codex/icon-scale-font-recovery` with all Task 4 evidence green.
- Produces: local `main` containing the design, plan, tests, and implementation while preserving pre-existing uncommitted user documents. Remote state remains unchanged.

- [ ] **Step 1: Confirm branch and primary checkout state**

```bash
git status --short --branch
PRIMARY_REPO=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
git -C "$PRIMARY_REPO" status --short --branch --untracked-files=all
git log --oneline main..codex/icon-scale-font-recovery
```

Expected: feature worktree clean; primary checkout contains only the pre-existing user documents.

- [ ] **Step 2: Merge without touching unrelated files**

From the primary checkout:

```bash
PRIMARY_REPO=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
git -C "$PRIMARY_REPO" merge --ff-only codex/icon-scale-font-recovery
```

If `main` moved meanwhile, rebase the clean feature branch onto current local `main`, rerun focused verification, then retry the fast-forward merge.

- [ ] **Step 3: Repair the primary checkout dependency link**

```bash
PRIMARY_REPO=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
corepack pnpm --dir "$PRIMARY_REPO" install --frozen-lockfile
```

Verify `realpath front/node_modules/pretendard` is under the primary repository root so the existing port 5173 Vite process can serve the current checkout's font files after reload.

- [ ] **Step 4: Verify merged main and report local-only scope**

```bash
PRIMARY_REPO=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
git -C "$PRIMARY_REPO" status --short --branch --untracked-files=all
git -C "$PRIMARY_REPO" log -1 --oneline
git -C "$PRIMARY_REPO" branch --contains codex/icon-scale-font-recovery
```

Expected: implementation commits are ancestors of local `main`; original uncommitted user documents remain present; no push, PR, tag, or deploy occurred.
