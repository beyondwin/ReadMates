# Member Profile Name Editor Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized `/app/me` display-name form with a compact, accessible inline editor that remains balanced at 1280px, 390px, 320px, and 200% zoom.

**Architecture:** Keep `ProfileNameEditor` prop-driven inside the archive feature UI and preserve the existing profile update controller, auth refresh, route revalidation, authorization, and server contracts. Change only the editor's local presentation state, responsive CSS, and focused component/E2E evidence; the profile heading remains in the accessibility tree while the visible name row becomes the edit form.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright, Vite, CSS, Corepack `pnpm@11.13.1`

## Global Constraints

- Design authority: `docs/superpowers/specs/2026-08-01-member-profile-name-editor-refinement-design.md` at commit `9d380282`.
- Preserve `/app/me` as the only owner of self-service display-name editing; `/app/me/settings` remains read-only for profile identity.
- Do not change the profile API, BFF, server, database, validation, authorization, auth refresh, or route revalidation contracts.
- Do not add a modal, popover, drawer, bottom sheet, shared primitive, success toast, or animation system.
- Desktop form: `minmax(240px, 320px) 72px 72px`, 8px gaps, maximum total width 480px.
- Mobile form: full-width field followed by 72px `저장` and 72px `취소` actions on the next row.
- Input and button targets must be at least 44px high; the input uses one visible 2px focus ring without an additional shadow ring.
- Copy is exact: visible label `표시 이름`, actions `저장` and `취소`, pending action `저장 중…`, accessible save name `이름 저장`, edit name `이름 변경`.
- Preserve the profile section's accessible name and single `h1` before, during, and after editing.
- Preserve error draft state, `role="alert"`, `aria-describedby`, read-only behavior, duplicate-submit protection, and focus restoration.
- Use the repository package manager through `corepack pnpm`; do not substitute an unpinned global pnpm.
- Do not use `git add -A`; stage only files named by the task being committed.
- Do not commit screenshots, Playwright output, caches, or local runtime artifacts.

## Execution Preflight

- [ ] **Step 1: Create an isolated worktree before touching implementation files**

Invoke `superpowers:using-git-worktrees`. Create the worktree from the then-current `main` only after confirming `9d380282` is an ancestor:

```bash
git merge-base --is-ancestor 9d380282 main
```

Expected: exit code 0. The current checkout has unrelated changes including `front/src/styles/globals.css`; do not implement this plan in that checkout.

- [ ] **Step 2: Confirm the isolated worktree starts clean and contains the approved spec**

Run:

```bash
git status --short --branch --untracked-files=all
test -f docs/superpowers/specs/2026-08-01-member-profile-name-editor-refinement-design.md
```

Expected: clean feature branch status and both commands exit 0.

- [ ] **Step 3: Read the frontend and design rules in the isolated worktree**

Read:

```text
AGENTS.md
front/AGENTS.md
docs/agents/execution.md
docs/agents/front.md
docs/agents/design.md
docs/development/acceptance-matrix.md
```

Expected: implementation stays within the frontend UI/runtime-state acceptance row.

---

### Task 1: Make the visible name row become the edit form

**Files:**
- Modify: `front/features/archive/ui/my-page/profile-name-editor.tsx:23-160`
- Test: `front/features/archive/ui/my-page/member-space-sections.test.tsx:109-193`

**Interfaces:**
- Consumes: `ProfileNameEditorProps`, `MyPageProfile`, `ProfileUpdateResult`, and the existing `onUpdateProfile(displayName: string): Promise<ProfileUpdateResult>` callback.
- Produces: unchanged `ProfileNameEditor` public props; a visible `표시 이름` field, `rm-sr-only` heading while editing, `rm-member-profile__save` and `rm-member-profile__cancel` hooks, Escape cancellation, and unchanged save/error semantics.

- [ ] **Step 1: Replace the existing editing-state test with a failing compact-editor contract**

Update the test at `member-space-sections.test.tsx:109`:

```tsx
it("replaces the visible name row with a labelled editor while preserving the profile heading", async () => {
  const user = userEvent.setup();
  renderProfileSummary();

  await user.click(screen.getByRole("button", { name: "이름 변경" }));

  const heading = screen.getByRole("heading", { level: 1, name: "멤버1" });
  expect(heading).toHaveAttribute("id", "member-profile-name");
  expect(heading).toHaveClass("rm-sr-only");
  expect(screen.getByRole("region", { name: "멤버1" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "이름 저장" })).toHaveTextContent("저장");
  expect(screen.getByRole("button", { name: "취소" })).toBeVisible();
});
```

Change the existing focus and error queries in this component test file from `{ name: "이름" }` to `{ name: "표시 이름" }`.

- [ ] **Step 2: Add a failing Escape cancellation test**

Add beside the existing click-cancel focus test:

```tsx
it("cancels an edited draft with Escape and restores focus", async () => {
  const user = userEvent.setup();
  renderProfileSummary();

  await user.click(screen.getByRole("button", { name: "이름 변경" }));
  const input = screen.getByRole("textbox", { name: "표시 이름" });
  await user.clear(input);
  await user.type(input, "바꾸려던 이름");
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("textbox", { name: "표시 이름" })).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).not.toHaveClass("rm-sr-only");
  expect(screen.getByRole("button", { name: "이름 변경" })).toHaveFocus();
});
```

- [ ] **Step 3: Extend the pending test so Escape cannot dismiss an active save**

After clicking `이름 저장` in the existing pending test, add:

```tsx
await user.keyboard("{Escape}");

expect(screen.getByRole("textbox", { name: "표시 이름" })).toBeDisabled();
expect(screen.getByRole("button", { name: "이름 저장" })).toBeDisabled();
expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
expect(screen.getByText("저장 중…")).toBeVisible();
```

Remove the old `저장 중` expectation so the ellipsis character is tested exactly.

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx
```

Expected: FAIL because the heading lacks `rm-sr-only`, the field is still named `이름`, Escape does not cancel, and the pending copy is still `저장 중`.

- [ ] **Step 5: Extract one guarded cancellation function**

Add above `submitProfile` in `profile-name-editor.tsx`:

```tsx
function cancelEditing() {
  if (savingRef.current) {
    return;
  }

  shouldRestoreFocusRef.current = true;
  setEditing(false);
  setError(null);
  setDraft({
    sourceDisplayName: data.displayName,
    value: data.displayName,
  });
}
```

- [ ] **Step 6: Make editing replace the visible heading and provide stable style hooks**

Apply these exact JSX changes:

```tsx
<h1 id={headingId} className={editing ? "rm-sr-only" : undefined}>
  {data.displayName}
</h1>
```

```tsx
<form
  className="rm-member-profile__form"
  onSubmit={submitProfile}
  onKeyDown={(event) => {
    if (event.key === "Escape" && !savingRef.current) {
      event.preventDefault();
      cancelEditing();
    }
  }}
>
```

Change the visible label to `표시 이름`, pending copy to `{saving ? "저장 중…" : "저장"}`, and add these action classes:

```tsx
className="btn btn-primary btn-sm rm-member-profile__save"
className="btn btn-quiet btn-sm rm-member-profile__cancel"
```

Move the existing error block after both buttons so CSS can give it its own grid row. Set the cancel button's `onClick` to `cancelEditing` and keep `disabled={saving}`.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx
```

Expected: all tests in the file PASS, including click cancel, Escape cancel, pending Escape, save success, error retention, and read-only behavior.

- [ ] **Step 8: Review Task 1 scope and commit only the component unit**

Run:

```bash
git diff --check -- \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx
git add -- \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx
git commit -m "feat(profile): compact member name edit state"
```

Expected: one commit containing exactly two files.

---

### Task 2: Lock responsive geometry and focus treatment with browser tests

**Files:**
- Modify: `front/src/styles/globals.css:5993-6063,6293-6300,6904-6933`
- Test: `front/tests/e2e/member-space-information-architecture.spec.ts:15-79,109-236`
- Test: `front/tests/e2e/member-profile-permissions.spec.ts:102-142`

**Interfaces:**
- Consumes: Task 1's `rm-member-profile__save`, `rm-member-profile__cancel`, `rm-sr-only`, visible `표시 이름` label, and Escape behavior.
- Produces: desktop 480px maximum form, 320px maximum input, equal 72px actions, two-row mobile form, local single-ring input focus, and Playwright geometry/screenshot evidence.

- [ ] **Step 1: Add a compact-editor geometry helper to the information-architecture E2E test**

Add below `expectPracticalTapTarget`:

```ts
async function expectCompactProfileEditor(shelf: Locator, viewportWidth: number) {
  const form = shelf.locator(".rm-member-profile__form");
  const input = shelf.getByRole("textbox", { name: "표시 이름" });
  const save = shelf.getByRole("button", { name: "이름 저장" });
  const cancel = shelf.getByRole("button", { name: "취소" });

  await expectPracticalTapTarget(input);
  await expectPracticalTapTarget(save);
  await expectPracticalTapTarget(cancel);

  const [formBox, inputBox, saveBox, cancelBox] = await Promise.all([
    form.boundingBox(),
    input.boundingBox(),
    save.boundingBox(),
    cancel.boundingBox(),
  ]);
  expect(formBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(formBox!.width).toBeLessThanOrEqual(480.5);
  expect(Math.abs(saveBox!.width - cancelBox!.width)).toBeLessThanOrEqual(1);
  expect(saveBox!.width).toBeGreaterThanOrEqual(71.5);

  if (viewportWidth > 768) {
    expect(inputBox!.width).toBeLessThanOrEqual(320.5);
    expect(Math.abs(
      (inputBox!.y + inputBox!.height) - (saveBox!.y + saveBox!.height),
    )).toBeLessThanOrEqual(1);
  } else {
    expect(saveBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height + 7);
    expect(Math.abs(saveBox!.y - cancelBox!.y)).toBeLessThanOrEqual(1);
  }

  const focusStyle = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.boxShadow).toBe("none");
  expect(focusStyle.outlineStyle).toBe("solid");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
}
```

- [ ] **Step 2: Exercise the editing state in every existing responsive viewport**

Inside the 1280/390/320 loop, after `pressTabUntilFocused`, add:

```ts
await editProfile.click();
await expect(
  shelf.getByRole("heading", { level: 1, name: "멤버1" }),
).toHaveClass(/rm-sr-only/);
await expectCompactProfileEditor(shelf, viewport.width);
expect(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
).toBe(true);
await page.screenshot({
  path: testInfo.outputPath(
    `member-space-name-editor-${viewport.width}x${viewport.height}.png`,
  ),
  fullPage: true,
});
await page.keyboard.press("Escape");
await expect(editProfile).toBeFocused();
```

Keep the existing read-state screenshots. In the 200% zoom block, open the editor, call `expectCompactProfileEditor(shelf, 320)`, assert no horizontal overflow, save `member-space-name-editor-200-percent-zoom.png`, and press Escape.

- [ ] **Step 3: Update the profile mutation E2E test to the visible label**

In `member-profile-permissions.spec.ts:137`, change only the self-service editor query:

```ts
await page.getByRole("textbox", { name: "표시 이름" }).fill(updatedDisplayName);
```

Do not rename the host member-management dialog field; it remains a separate `이름` UI outside this scope.

- [ ] **Step 4: Run focused E2E and verify RED on layout**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: the component behavior from Task 1 works, but responsive geometry FAILS because the current desktop input expands beyond 320px, action widths differ, mobile actions use the old grid, and the input still has stacked focus treatments.

- [ ] **Step 5: Implement the exact desktop grid and error row**

Replace the profile field/form rules with:

```css
.rm-member-profile__field {
  grid-area: field;
  min-width: 0;
}

.rm-member-profile__field label {
  display: block;
  font-size: 0.875rem;
}

.rm-member-profile__field .input {
  width: 100%;
  min-width: 0;
  height: 44px;
  margin-top: 7px;
}

.rm-member-profile__error {
  grid-area: error;
  margin-top: 0;
  color: var(--danger);
}

.rm-member-profile__form {
  display: grid;
  grid-template-areas:
    "field save cancel"
    "error error error";
  grid-template-columns: minmax(240px, 320px) 72px 72px;
  gap: 8px;
  align-items: end;
  width: min(100%, 480px);
  margin-top: 0;
}

.rm-member-profile__save,
.rm-member-profile__cancel {
  width: 72px;
  min-width: 72px;
  min-height: 44px;
  white-space: nowrap;
}

.rm-member-profile__save {
  grid-area: save;
}

.rm-member-profile__cancel {
  grid-area: cancel;
}
```

- [ ] **Step 6: Replace the stacked input focus treatment with one local ring**

Change the shared member-space focus selector so it covers form buttons but not the input:

```css
.rm-member-profile__edit:focus-visible,
.rm-member-profile__form button:focus-visible,
.rm-member-space-utilities__link:focus-visible,
.rm-recent-readings__all:focus-visible,
.rm-recent-reading-row:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.rm-member-profile__form .input:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: none;
}
```

This override is intentionally local; do not change the design-system input focus style for unrelated forms.

- [ ] **Step 7: Implement the exact mobile grid**

Replace the current mobile `.rm-member-profile__form` and field-column rules with:

```css
.rm-member-profile__form {
  grid-template-areas:
    "field field field"
    "save cancel ."
    "error error error";
  grid-template-columns: 72px 72px minmax(0, 1fr);
  align-items: start;
  width: 100%;
}
```

Remove the old mobile `.rm-member-profile__form > .rm-member-profile__field` rule. The named grid area now owns that placement.

- [ ] **Step 8: Run the focused component and E2E suites and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: both commands PASS; Playwright writes read/edit screenshots for 1280px, 390px, 320px, and 200% zoom.

- [ ] **Step 9: Inspect the generated edit-state screenshots**

Locate exactly these files under `front/test-results/`:

```bash
rg --files front/test-results | rg 'member-space-name-editor-(1280x900|390x844|320x700|200-percent-zoom)\.png$'
```

Open all four images. Confirm no duplicate visible heading, intentional desktop whitespace, equal mobile actions, stable avatar/byline placement, one focus ring, and no clipping or horizontal scroll.

- [ ] **Step 10: Review Task 2 scope and commit the responsive unit**

Run:

```bash
git diff --check -- \
  front/src/styles/globals.css \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts
git add -- \
  front/src/styles/globals.css \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts
git commit -m "style(profile): refine responsive name editor"
```

Expected: one commit containing exactly three files. Screenshots and `front/test-results/` remain untracked or ignored and are not staged.

---

### Task 3: Run canonical regression and final visual evidence

**Files:**
- Verify: `front/features/archive/ui/my-page/profile-name-editor.tsx`
- Verify: `front/features/archive/ui/my-page/member-space-sections.test.tsx`
- Verify: `front/src/styles/globals.css`
- Verify: `front/tests/e2e/member-space-information-architecture.spec.ts`
- Verify: `front/tests/e2e/member-profile-permissions.spec.ts`

**Interfaces:**
- Consumes: the two committed implementation units from Tasks 1 and 2.
- Produces: final frontend lint/test/build evidence, full E2E evidence, responsive screenshot inspection, clean diff checks, and a review-ready branch with no API/server changes.

- [ ] **Step 1: Run the focused regression once more at final HEAD**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: PASS at final HEAD, not only before the Task 2 commit.

- [ ] **Step 2: Run the canonical frontend gates**

Run in this order:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all commands exit 0. Record the exact Vitest file/test totals and Vite module/build summary.

- [ ] **Step 3: Run the complete E2E gate**

Run:

```bash
corepack pnpm --dir front test:e2e
```

Expected: all Playwright tests PASS. This is required because the visible member profile user flow and keyboard behavior changed.

- [ ] **Step 4: Re-open final responsive screenshots**

Locate the final run's four edit-state screenshots with:

```bash
rg --files front/test-results | rg 'member-space-name-editor-(1280x900|390x844|320x700|200-percent-zoom)\.png$'
```

Open each image and compare it against the approved spec. Do not claim visual verification if any file is missing.

- [ ] **Step 5: Run final scope and whitespace checks**

Run:

```bash
git diff --check 9d380282...HEAD -- \
  front/features/archive/ui/my-page/profile-name-editor.tsx \
  front/features/archive/ui/my-page/member-space-sections.test.tsx \
  front/src/styles/globals.css \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts
git diff --name-only 9d380282...HEAD
git status --short --branch --untracked-files=all
```

Expected: the implementation diff contains only the five planned frontend files, aside from this plan document if it is committed on the execution branch; working tree is clean.

- [ ] **Step 6: Request independent code review before completion**

Invoke `superpowers:requesting-code-review` with the approved spec, this plan, the two implementation commits, exact command outputs, and all four screenshot paths. The reviewer must check:

- visible heading replacement without accessibility-tree loss;
- Escape behavior during idle and pending states;
- equal action geometry and 44px targets;
- single focus ring;
- 1280/390/320/200% overflow evidence;
- no settings/API/server scope expansion.

If review finds an issue, add or tighten the smallest failing test, fix only its owning task's files, rerun the focused checks, commit the fix separately, and repeat this review step.

- [ ] **Step 7: Verify completion evidence and hand off**

Invoke `superpowers:verification-before-completion`. Report:

- changed surface: frontend member profile UI only;
- commits and exact files;
- focused Vitest and Playwright results;
- full lint/test/build/E2E results;
- screenshot viewport evidence;
- skipped checks and reasons, if any;
- remaining risk, especially browser/font rendering differences not covered by local evidence.

No additional commit is expected in Task 3 unless a verification or review finding required a tested fix.
