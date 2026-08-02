# Member Space UI Density Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve avatar selection density, RSVP roster packing, member identity, cumulative reading records, notification settings chrome, and home shortcut dividers without changing server or persistence contracts.

**Architecture:** Keep route modules responsible for scoped links, pure archive model code responsible for member-space copy and values, and prop-driven UI modules responsible for rendering. Use existing catalog and journey summary data; add no API fields or dependencies. Treat each visible change as a focused TDD slice, then run one integrated responsive and browser verification pass.

**Tech Stack:** React 19, TypeScript, Vite, React Router 7, Vitest + Testing Library, Playwright Component Testing, CSS, Corepack `pnpm@11.13.1`.

## Global Constraints

- Preserve frontend dependency direction: `src/app -> src/pages -> features -> shared`.
- Do not change server, BFF, API, DB, migration, avatar key, avatar asset, or profile-save behavior.
- Use existing `BOOK_CLUB_AVATARS` labels as the only avatar-name source of truth.
- Picker selected state uses `aria-pressed`, accent border, and accent-soft background; keyboard focus remains a separate outer outline.
- Desktop RSVP roster is exactly 8 columns; 390px uses 5 columns and 320px uses 4 columns.
- Keep the current `함께한 모임` and `함께 완독한 책` counting contracts unchanged.
- Member ledger copy is exact: `읽고, 묻고, 기록해 온 시간`, `책에서 시작된 생각의 기록`, `읽고 난 마음을 풀어낸 기록`, and `기록 보기`.
- Question and review trace rows are non-interactive; only `기록 보기` navigates to `view=sessions`.
- Use theme-aware 18px inline SVG icons with rounded line caps and joins; do not add generated raster icons or a new icon package.
- Preserve `알림`, its summary, tabs, switch semantics, manual save, retry, unavailable, and error behavior.
- Preserve notification and account-setting links below the member-space overview.
- Do not commit, push, open a PR, deploy, or update snapshots without explicit user authorization. Each task ends with a verified local checkpoint instead of a commit.
- Selected acceptance-matrix row: `UI or runtime state` because the change affects wrapping, zero states, desktop/mobile structure, focus, and navigation affordance. Auth, BFF, server, migration, and public-release rows remain out of scope because contracts and exposure do not change.

---

## File Structure

**Create**

- `front/features/archive/ui/my-page/reading-ledger-icon.tsx` — owns the four decorative member-ledger line icons.
- `front/features/archive/ui/my-page/reading-achievement-summary.ct.tsx` — owns responsive geometry and interaction assertions for the new ledger.
- `front/features/member-home/ui/member-home-roster.ct.tsx` — owns 8/5/4-column roster geometry assertions.
- `front/features/notifications/ui/member-notification-settings-page.ct.tsx` — owns rendered header and bottom-border assertions.

**Modify**

- `front/features/archive/model/my-reading-shelf-model.ts` — replaces generic metrics with explicit journey stats and record traces.
- `front/features/archive/model/my-reading-shelf-model.test.ts` — locks exact labels, units, values, and zero-count traces.
- `front/features/archive/ui/my-page/avatar-picker.tsx` and tests — removes selected check markup.
- `front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx` — verifies compact picker geometry and distinct selected/focus states.
- `front/features/archive/ui/my-page/member-profile-summary.tsx` and tests — renders avatar artwork and poetic name as one figure.
- `front/features/archive/ui/my-page/reading-achievement-summary.tsx` and tests — renders the two-column editorial ledger and sole record link.
- `front/features/archive/ui/my-page/my-reading-shelf.tsx` — passes the existing scoped archive sessions link into the ledger.
- `front/features/archive/ui/my-page/member-space-regressions.test.tsx` — updates integrated member-space assertions.
- `front/features/archive/route/my-page-route.test.tsx` — locks the scoped `기록 보기` destination.
- `front/features/member-home/ui/member-home-records.tsx` and tests — renders roster items through a semantic grid hook.
- `front/features/member-home/ui/member-home.tsx` and `front/tests/unit/member-home.test.tsx` — replaces the inline shortcut divider with named classes.
- `front/features/notifications/ui/member-notification-settings-page.tsx` and tests — removes breadcrumb/eyebrow and `mySpaceHref`.
- `front/features/notifications/route/member-notification-settings-route.tsx` and tests — stops assembling the unused my-space link.
- `front/src/styles/globals.css` — owns desktop picker, profile, ledger, notification, roster, and shortcut presentation.
- `front/shared/styles/mobile.css` — owns compact picker and roster column overrides.

**Delete**

- `front/features/notifications/ui/member-space-breadcrumb.tsx` — its only consumer is removed by the approved settings-header change.

---

### Task 1: Remove the avatar picker check and reclaim tile space

**Files:**
- Modify: `front/features/archive/ui/my-page/avatar-picker.tsx:11-50`
- Modify: `front/features/archive/ui/my-page/avatar-picker.test.tsx:6-55`
- Modify: `front/features/archive/ui/my-page/avatar-picker.ct.tsx:1-95`
- Modify: `front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx:70-155`
- Modify: `front/src/styles/globals.css:6926-6978`
- Modify: `front/shared/styles/mobile.css:122-132`

**Interfaces:**
- Consumes: `BOOK_CLUB_AVATARS`, `AvatarChip sizeRole="picker"`, and `aria-pressed`.
- Produces: check-free `.rm-avatar-picker__tile` markup with unchanged selection and callback contracts.

- [ ] **Step 1: Write the failing unit assertions**

Replace the selected-check assertions with explicit absence while preserving behavior:

```tsx
expect(selected).toHaveAttribute("aria-pressed", "true");
expect(selected.querySelector(".rm-avatar-picker__check")).toBeNull();
expect(container.querySelector("svg")).toBeNull();
expect(screen.getAllByText(/./, { selector: ".rm-avatar-picker__label" })).toHaveLength(30);
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/avatar-picker.test.tsx
```

Expected: FAIL because the selected tile still contains `.rm-avatar-picker__check` and its SVG.

- [ ] **Step 3: Write the failing component geometry assertions**

In both picker component tests assert that no check exists, the desktop selected tile has at most `136px` height, the mobile tile has at most `126px` height, and focus remains external:

```tsx
await expect(selected.locator(".rm-avatar-picker__check")).toHaveCount(0);
const tileBox = await selected.boundingBox();
expect(tileBox!.height).toBeLessThanOrEqual(viewport.width < 768 ? 126 : 136);
await selected.focus();
expect(await selected.evaluate((node) => getComputedStyle(node).outlineWidth)).toBe("2px");
expect(await selected.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("2px");
```

- [ ] **Step 4: Run the focused component tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec playwright test --config playwright-ct.config.ts features/archive/ui/my-page/avatar-picker.ct.tsx features/archive/ui/my-page/profile-editor-dialog.ct.tsx
```

Expected: FAIL on the existing check and `154px`/`148px` tile heights.

- [ ] **Step 5: Remove production check markup**

Reduce each tile to artwork and label only, and delete `CheckIcon`:

```tsx
<AvatarChip avatarKey={key} name={null} label="" sizeRole="picker" />
<span className="rm-avatar-picker__label">{label}</span>
```

- [ ] **Step 6: Compact the picker CSS**

Use these exact profile-editor overrides and delete `.rm-avatar-picker__check--filled` rules:

```css
.rm-profile-editor .rm-avatar-picker__tile {
  min-height: 132px;
  padding: 12px 4px;
  grid-template-rows: auto minmax(2.7em, auto);
  align-content: center;
  justify-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  html .rm-profile-editor .rm-avatar-picker__tile {
    min-height: 122px;
    padding: 10px 6px;
  }
}
```

- [ ] **Step 7: Verify GREEN and local diff quality**

Run the unit and component commands from Steps 2 and 4, then:

```bash
git diff --check -- front/features/archive/ui/my-page/avatar-picker.tsx front/features/archive/ui/my-page/avatar-picker.test.tsx front/features/archive/ui/my-page/avatar-picker.ct.tsx front/features/archive/ui/my-page/profile-editor-dialog.ct.tsx front/src/styles/globals.css front/shared/styles/mobile.css
```

Expected: all focused tests PASS; no check selector or `CheckIcon` remains.

---

### Task 2: Pack the RSVP roster into 8/5/4 responsive columns

**Files:**
- Modify: `front/features/member-home/ui/member-home-records.tsx:296-362`
- Modify: `front/features/member-home/ui/member-home-records.test.tsx:190-245`
- Create: `front/features/member-home/ui/member-home-roster.ct.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`

**Interfaces:**
- Consumes: `CurrentSessionReadPageData`, `AvatarChip sizeRole="roster"`, and existing API order.
- Produces: `.rm-member-home-roster` with one `.rm-member-home-roster__item` per attendee.

- [ ] **Step 1: Add a failing nine-attendee unit test**

Build nine public-safe fixture attendees, render `RosterSummary`, and assert ordered items:

```tsx
const roster = container.querySelector(".rm-member-home-roster");
expect(roster).toBeInTheDocument();
expect(roster).toHaveAttribute("role", "list");
expect(roster?.querySelectorAll(".rm-member-home-roster__item")).toHaveLength(9);
expect(Array.from(roster!.querySelectorAll(".rm-avatar-chip"), (node) => node.getAttribute("title")))
  .toEqual(attendees.map((member) => `${member.displayName} · ${rsvpLabel(member.rsvpStatus)}`));
```

- [ ] **Step 2: Run the unit test and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-records.test.tsx
```

Expected: FAIL because the roster is still an anonymous flex row.

- [ ] **Step 3: Add failing Playwright CT track assertions**

Create a nine-attendee fixture and verify computed columns at three widths:

```tsx
for (const [width, expectedColumns] of [[1200, 8], [390, 5], [320, 4]] as const) {
  await page.setViewportSize({ width, height: 700 });
  const tracks = await component.locator(".rm-member-home-roster").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
  );
  expect(tracks).toHaveLength(expectedColumns);
  await expect(component.locator(".rm-member-home-roster__item")).toHaveCount(9);
}
```

- [ ] **Step 4: Run the CT file and verify RED**

```bash
corepack pnpm --dir front exec playwright test --config playwright-ct.config.ts features/member-home/ui/member-home-roster.ct.tsx
```

Expected: FAIL because the grid hook does not exist.

- [ ] **Step 5: Implement semantic roster markup**

Replace the inline flex row with:

```tsx
<div className="rm-member-home-roster" role="list" aria-label="RSVP 참석자">
  {attendees.map((member) => (
    <span className="rm-member-home-roster__item" role="listitem" key={member.renderKey}>
      <AvatarChip
        avatarKey={member.avatarKey}
        name={member.displayName}
        label={`${member.displayName} · ${rsvpLabel(member.rsvpStatus)}`}
        sizeRole="roster"
      />
    </span>
  ))}
</div>
```

- [ ] **Step 6: Implement exact responsive columns**

```css
.rm-member-home-roster {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 12px 0;
  margin-top: 14px;
}

.rm-member-home-roster__item {
  min-width: 0;
  display: grid;
  place-items: center;
}

@media (max-width: 768px) {
  .rm-member-home-roster { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}

@media (max-width: 360px) {
  .rm-member-home-roster { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
```

- [ ] **Step 7: Verify GREEN and no overflow**

Use a 32px desktop and 38px mobile `roster` artwork role. Run the unit and CT commands, including a 308px production-sidebar constraint, then `git diff --check` over the touched files. Expected: nine avatars render in 8+1, 5+4, and 4+4+1 rows without overlap or horizontal overflow.

---

### Task 3: Replace generic member metrics with an explicit ledger view model

**Files:**
- Modify: `front/features/archive/model/my-reading-shelf-model.ts:48-76,195-231`
- Modify: `front/features/archive/model/my-reading-shelf-model.test.ts:108-160`
- Modify fixtures in: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Modify fixtures in: `front/features/archive/ui/my-page/member-space-regressions.test.tsx`

**Interfaces:**
- Consumes: `MyJourneySummary` existing counts.
- Produces: `MemberSpaceViewModel.journeyStats` and `.recordTraces` with stable discriminants.

- [ ] **Step 1: Write the failing model expectation**

```tsx
expect(buildMemberSpaceViewModel({ profile, summary, today })).toMatchObject({
  achievementHeading: "읽고, 묻고, 기록해 온 시간",
  journeyStats: [
    { kind: "sessions", label: "함께한 모임", value: "6", unit: "회" },
    { kind: "completed", label: "함께 완독한 책", value: "6", unit: "권" },
  ],
  recordTraces: [
    { kind: "questions", label: "대화를 연 질문", description: "책에서 시작된 생각의 기록", value: "21", unit: "개" },
    { kind: "reviews", label: "남긴 서평", description: "읽고 난 마음을 풀어낸 기록", value: "0", unit: "편" },
  ],
});
```

Add a second case proving that question and review traces remain present when both counts are zero.

- [ ] **Step 2: Run the model test and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts
```

Expected: FAIL because the current model exposes `metrics`, dynamic numeric heading copy, and no units/descriptions.

- [ ] **Step 3: Define explicit types and mapping**

```ts
export type MemberSpaceJourneyStat = {
  kind: "sessions" | "completed";
  label: "함께한 모임" | "함께 완독한 책";
  value: string;
  unit: "회" | "권";
};

export type MemberSpaceRecordTrace = {
  kind: "questions" | "reviews";
  label: "대화를 연 질문" | "남긴 서평";
  description: "책에서 시작된 생각의 기록" | "읽고 난 마음을 풀어낸 기록";
  value: string;
  unit: "개" | "편";
};

export type MemberSpaceViewModel = {
  profileMetaLabel: string;
  achievementHeading: "읽고, 묻고, 기록해 온 시간";
  journeyStats: MemberSpaceJourneyStat[];
  recordTraces: MemberSpaceRecordTrace[];
};
```

Map all four counts unconditionally and delete `achievementBody`, `MemberSpaceMetric`, `countWord`, `achievementHeading()`, and `memberSpaceMetrics()`.

- [ ] **Step 4: Update typed fixtures without weakening assertions**

Replace fixture `metrics` arrays with exact `journeyStats` and `recordTraces`; do not cast with `as any` or loosen `MemberSpaceViewModel`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/my-reading-shelf-model.test.ts features/archive/ui/my-page/member-space-sections.test.tsx features/archive/ui/my-page/member-space-regressions.test.tsx
```

Expected: model tests PASS; UI tests may still fail only where Task 4 has not yet updated markup.

---

### Task 4: Build the profile caption and responsive reading ledger

**Files:**
- Create: `front/features/archive/ui/my-page/reading-ledger-icon.tsx`
- Create: `front/features/archive/ui/my-page/reading-achievement-summary.ct.tsx`
- Modify: `front/features/archive/ui/my-page/member-profile-summary.tsx:11-29`
- Modify: `front/features/archive/ui/my-page/member-space-sections.test.tsx:19-55`
- Modify: `front/features/archive/ui/my-page/reading-achievement-summary.tsx:1-19`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx:13-54`
- Modify: `front/features/archive/ui/my-page/member-space-regressions.test.tsx:15-48`
- Modify: `front/features/archive/route/my-page-route.test.tsx:110-145`
- Modify: `front/src/styles/globals.css:6701-6745,6993-7055,7816-7878`

**Interfaces:**
- Consumes: Task 3 `journeyStats`/`recordTraces` and existing `archiveSessionsHref`.
- Produces: one scoped `기록 보기` link, non-interactive trace rows, and a figure-caption avatar identity.

- [ ] **Step 1: Write failing profile and ledger unit assertions**

Profile assertions:

```tsx
const figure = container.querySelector(".rm-member-profile__avatar-figure");
expect(figure?.querySelector(".rm-member-profile__avatar")).toBeInTheDocument();
expect(figure?.querySelector("figcaption")).toHaveTextContent("한 장 더 읽는 바나나");
expect(section).not.toHaveTextContent("나의 아바타 ·");
```

Ledger assertions:

```tsx
const ledger = screen.getByRole("region", { name: "읽고, 묻고, 기록해 온 시간" });
expect(within(ledger).getByRole("link", { name: "기록 보기" })).toHaveAttribute("href", "/app/archive?view=sessions");
expect(within(ledger).getAllByRole("link")).toHaveLength(1);
expect(within(ledger).getByText("책에서 시작된 생각의 기록")).toBeVisible();
expect(within(ledger).getByText("읽고 난 마음을 풀어낸 기록")).toBeVisible();
expect(within(ledger).getByText("0")).toBeVisible();
```

- [ ] **Step 2: Run focused UI tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx features/archive/ui/my-page/member-space-regressions.test.tsx features/archive/route/my-page-route.test.tsx
```

Expected: FAIL on the old avatar sentence, generic definition list, duplicated heading numbers, and missing record link.

- [ ] **Step 3: Create the theme-aware icon module**

Export `ReadingLedgerIcon({ kind })` using `width="18"`, `height="18"`, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.7"`, `strokeLinecap="round"`, `strokeLinejoin="round"`, and `aria-hidden="true"`. Use these exact paths:

```tsx
const paths = {
  sessions: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  completed: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
  questions: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A8 8 0 1 1 21 15Z" /></>,
  reviews: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 15l6-6 2 2-6 6-3 1Z" /></>,
} as const;
```

- [ ] **Step 4: Implement figure-caption identity**

```tsx
<figure className="rm-member-profile__avatar-figure">
  <AvatarChip className="rm-member-profile__avatar" avatarKey={avatarKey} label="" name={profile.displayName} sizeRole="profile" />
  <figcaption className="rm-member-profile__avatar-name">{avatarLabel}</figcaption>
</figure>
```

Keep the h1, metadata, edit action, dialog, and empty image alt unchanged.

- [ ] **Step 5: Implement the ledger component and sole link**

Change the signature to:

```tsx
export function ReadingAchievementSummary({
  viewModel,
  archiveSessionsHref,
}: {
  viewModel: MemberSpaceViewModel;
  archiveSessionsHref: string;
})
```

Render `.rm-reading-achievement__story` with kicker, h2, and the two journey stats; render `.rm-reading-achievement__traces` with a header containing `기록의 흔적` and `<a href={archiveSessionsHref}>기록 보기</a>`. Render each trace as a `<div>`, never `<a>` or `<button>`.

- [ ] **Step 6: Pass the existing scoped link and implement exact layout**

In `MyReadingShelf`, pass `archiveSessionsHref` to both the ledger and recent list. In CSS use:

```css
.rm-reading-achievement {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
  align-items: start;
  gap: 48px;
  padding: 32px;
}

.rm-reading-achievement__story { display: grid; gap: 28px; min-width: 0; }
.rm-reading-achievement__journey { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-block: 1px solid var(--line-soft); }
.rm-reading-achievement__traces-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; min-height: 28px; padding-bottom: 10px; }
.rm-reading-achievement__traces-head a { display: inline-flex; min-block-size: 44px; align-items: center; }
.rm-reading-achievement__trace { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 11px; min-height: 64px; border-top: 1px solid var(--line-soft); }
```

At `max-width: 768px`, switch the section to one column. At `max-width: 400px`, switch journey stats to one column. Use `align-items: baseline` for `기록의 흔적` and `기록 보기`.

- [ ] **Step 7: Add responsive CT proof and verify RED then GREEN**

The new CT must assert at 1280px that traces begin at the same y-coordinate as the kicker within 2px, and at 390px/320px that story precedes traces with no overflow:

```tsx
expect(Math.abs(tracesBox!.y - kickerBox!.y)).toBeLessThanOrEqual(2);
expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
await expect(component.getByRole("link", { name: "기록 보기" })).toHaveCount(1);
expect((await component.getByRole("link", { name: "기록 보기" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
await expect(component.getByText("나의 아바타 ·", { exact: false })).toHaveCount(0);
```

Run focused Vitest, then:

```bash
corepack pnpm --dir front exec playwright test --config playwright-ct.config.ts features/archive/ui/my-page/reading-achievement-summary.ct.tsx
```

Expected: PASS at all three widths.

---

### Task 5: Simplify notification settings chrome without changing behavior

**Files:**
- Modify: `front/features/notifications/ui/member-notification-settings-page.tsx:8-51,79-129`
- Modify: `front/features/notifications/ui/member-notification-settings-page.test.tsx:20-60`
- Create: `front/features/notifications/ui/member-notification-settings-page.ct.tsx`
- Modify: `front/features/notifications/route/member-notification-settings-route.tsx:26-34,107-130`
- Modify: `front/features/notifications/route/member-notification-settings-route.test.tsx`
- Delete: `front/features/notifications/ui/member-space-breadcrumb.tsx`
- Modify: `front/src/styles/globals.css:5858-5894,7616-7620,7928-7938`

**Interfaces:**
- Consumes: existing notification state, base path, callbacks, and manual save contract.
- Produces: settings page props without `mySpaceHref`; header with only h1 and summary.

- [ ] **Step 1: Write failing header and behavior-preservation tests**

```tsx
expect(screen.queryByRole("navigation", { name: "현재 위치" })).toBeNull();
expect(screen.queryByText("읽는사이 · 알림")).toBeNull();
expect(screen.getByRole("heading", { level: 1, name: "알림" })).toBeVisible();
expect(screen.getByText("받고 싶은 이메일 알림을 직접 선택합니다.")).toBeVisible();
expect(screen.getByRole("link", { name: "수신 설정" })).toHaveAttribute("aria-current", "page");
expect(screen.getAllByRole("switch")).toHaveLength(5);
```

Remove `mySpaceHref` from the test props so TypeScript also fails until production types change.

- [ ] **Step 2: Run settings unit and route tests and verify RED**

```bash
corepack pnpm --dir front exec vitest run features/notifications/ui/member-notification-settings-page.test.tsx features/notifications/route/member-notification-settings-route.test.tsx
```

Expected: FAIL on the rendered breadcrumb/eyebrow and obsolete prop.

- [ ] **Step 3: Add a failing CT border assertion**

```tsx
const surface = component.locator(".rm-member-notification-settings__surface");
const borders = await surface.evaluate((element) => {
  const style = getComputedStyle(element);
  return { top: style.borderTopWidth, bottom: style.borderBottomWidth };
});
expect(borders).toEqual({ top: "1px", bottom: "0px" });
```

Also assert the save button remains at least 44px tall on desktop and full width on mobile.

- [ ] **Step 4: Remove header clutter and dead route plumbing**

Delete the `MemberSpaceBreadcrumb` import/render, eyebrow div, `mySpaceHref` prop, route `mySpaceHref` calculation, and passed prop. Delete the now-unused module.

- [ ] **Step 5: Remove dead CSS and the bottom rule only**

Delete `.rm-member-space-breadcrumb` and `.rm-member-notifications-header__eyebrow` rules and remove both selectors from the mobile hide group. Change:

```css
.rm-member-notification-settings__surface {
  margin-top: 18px;
  border-top: 1px solid var(--line);
  border-bottom: 0;
}
```

Keep `.rm-member-notification-settings__row +` dividers and `.rm-member-notification-settings__save` top divider unchanged.

- [ ] **Step 6: Verify GREEN**

Run the unit/route command and:

```bash
corepack pnpm --dir front exec playwright test --config playwright-ct.config.ts features/notifications/ui/member-notification-settings-page.ct.tsx
```

Expected: header/border checks PASS; save/retry/unavailable/error tests remain green.

---

### Task 6: Repair the desktop home shortcut divider

**Files:**
- Modify: `front/features/member-home/ui/member-home.tsx:471-510`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: existing `quickLinks` order, labels, sub-labels, hrefs, and `MemberHomeLinkComponent`.
- Produces: `.rm-member-home-shortcuts` and `.rm-member-home-shortcuts__link` desktop hooks; mobile cards unchanged.

- [ ] **Step 1: Add failing structure assertions**

In the existing member-home unit fixture, select the desktop `바로가기` section and assert:

```tsx
const shortcuts = container.querySelector(".rm-member-home-shortcuts");
expect(shortcuts).toBeInTheDocument();
const links = shortcuts!.querySelectorAll(".rm-member-home-shortcuts__link");
expect(links).toHaveLength(2);
expect(links[0]).toHaveTextContent("피드백 문서회차 피드백");
expect(links[1]).toHaveTextContent("안내문모임 가이드");
expect((links[1] as HTMLElement).style.borderTop).toBe("");
```

- [ ] **Step 2: Run the member-home test and verify RED**

```bash
corepack pnpm --dir front exec vitest run tests/unit/member-home.test.tsx
```

Expected: FAIL because the named hooks do not exist and the second link still owns inline `borderTop`.

- [ ] **Step 3: Replace inline divider styles with classes**

Use:

```tsx
<div className="surface rm-member-home-shortcuts">
  {quickLinks.map((item) => (
    <Link key={item.label} to={item.href} className="rm-member-home-shortcuts__link" LinkComponent={LinkComponent}>
      <span style={{ flex: 1 }}>
        <span className="body" style={{ display: "block", fontWeight: 500 }}>{item.label}</span>
        <span className="tiny">{item.sub}</span>
      </span>
      <span className="rm-recent-record__destination-chevron" aria-hidden>›</span>
    </Link>
  ))}
</div>
```

- [ ] **Step 4: Add an inset sibling divider that cannot collide with rounded corners**

```css
.rm-member-home-shortcuts {
  padding: 4px;
  overflow: hidden;
}

.rm-member-home-shortcuts__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 6px;
  color: var(--text);
  text-align: left;
}

.rm-member-home-shortcuts__link + .rm-member-home-shortcuts__link::before {
  content: "";
  position: absolute;
  top: 0;
  right: 16px;
  left: 16px;
  border-top: 1px solid var(--line-soft);
}
```

- [ ] **Step 5: Verify GREEN and scoped hrefs**

Run the member-home test. Assert the tracking link destinations remain `/app/archive?view=report` and `/about`. Run `git diff --check` on the component, test, and global stylesheet.

---

### Task 7: Integrated verification and bounded visual QA

**Files:**
- Verify all files changed by Tasks 1-6.
- Do not retain screenshots, reports, coverage output, or build output in git.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: frontend-local evidence at final HEAD/worktree state.

- [ ] **Step 1: Run all focused unit tests together**

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx \
  features/archive/ui/my-page/member-space-regressions.test.tsx \
  features/archive/route/my-page-route.test.tsx \
  features/member-home/ui/member-home-records.test.tsx \
  features/notifications/ui/member-notification-settings-page.test.tsx \
  features/notifications/route/member-notification-settings-route.test.tsx \
  tests/unit/member-home.test.tsx
```

Expected: PASS with no React warnings.

- [ ] **Step 2: Run focused component tests**

```bash
corepack pnpm --dir front exec playwright test --config playwright-ct.config.ts \
  features/archive/ui/my-page/avatar-picker.ct.tsx \
  features/archive/ui/my-page/profile-editor-dialog.ct.tsx \
  features/archive/ui/my-page/reading-achievement-summary.ct.tsx \
  features/member-home/ui/member-home-roster.ct.tsx \
  features/notifications/ui/member-notification-settings-page.ct.tsx
```

Expected: PASS at 1280px, 390px, and 320px without snapshot updates.

- [ ] **Step 3: Run the required frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all exit 0.

- [ ] **Step 4: Run the existing avatar navigation E2E**

```bash
corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts
```

Expected: profile picker opens, saves, and preserves navigation identity. If its server fixture is unavailable, report the exact command and infrastructure reason rather than claiming it passed.

- [ ] **Step 5: Inspect the approved routes in one bounded pass**

If the user-owned local service on port `5174` is still available, inspect these states without restarting or replacing it:

- `/clubs/reading-sai/app/me` at 1280px, 390px, and 320px
- `/clubs/reading-sai/app` with roster and shortcuts visible
- `/clubs/reading-sai/app/notifications/settings`

Confirm: avatar caption wrapping, ledger two-column alignment, `기록의 흔적`/`기록 보기` baseline, non-interactive traces, 8-column roster wrapping, settings header removal, save-bottom line removal, and shortcut divider alignment. Do not persist screenshots in tracked paths.

- [ ] **Step 6: Final repository checks**

```bash
git diff --check
git status --short --branch --untracked-files=all
```

Confirm only intended frontend files plus the approved spec/plan are changed. Report skipped checks and remaining risk. Do not commit without explicit authorization.
