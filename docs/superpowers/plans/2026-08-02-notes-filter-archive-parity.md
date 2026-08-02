# Notes Filter Archive Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the club notes filter use the same outlined and black-selected pill treatment as the archive tabs without changing filtering or routing behavior.

**Architecture:** Keep the change inside the existing shared notes presentation primitive. `NotesFilterChoices` continues to own only rendering and selection callbacks; it derives the archive-equivalent inline style from `aria-pressed` state, while the notes route retains URL and data-flow ownership.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite

## Global Constraints

- Preserve the filter labels, counts, URL search parameters, filtered content, session selection, and data requests.
- Use a 32px pill with `var(--text)` / `var(--bg)` for the selected state and `var(--line)` / `var(--text-2)` for the unselected state.
- Preserve `aria-pressed` and the existing global keyboard focus treatment.
- Do not change archive behavior, server, BFF, API, database, or design tokens.
- Finish by integrating the verified feature branch into local `main`; do not push or deploy.

---

### Task 1: Match notes filter pills to archive tabs

**Files:**
- Modify: `front/shared/ui/notes-read-page.tsx:24-26`
- Test: `front/tests/unit/notes-feed-page.test.tsx:340-402`

**Interfaces:**
- Consumes: `NotesFilterChoices<F>({ filters, selected, onSelect, className, style })` and each filter's `{ id, label }`.
- Produces: The same callback and `aria-pressed` behavior with archive-equivalent inline styles on every filter button.

- [ ] **Step 1: Write the failing style-state test**

Add these assertions to the selected-session rendering test after checking the filter labels:

```tsx
const noteFilters = within(screen.getByLabelText("클럽 노트 필터"));
const allFilter = noteFilters.getByRole("button", { name: "전체 12" });
const highlightFilter = noteFilters.getByRole("button", { name: "하이라이트 3" });

expect(allFilter).toHaveStyle({
  height: "32px",
  padding: "0 14px",
  borderRadius: "999px",
  border: "1px solid var(--text)",
  background: "var(--text)",
  color: "var(--bg)",
});
expect(highlightFilter).toHaveStyle({
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--text-2)",
});
```

Add a focused interaction test:

```tsx
it("moves the archive-style selected state with the active notes filter", async () => {
  const user = userEvent.setup();
  renderNotesFeedPage();
  const filters = within(screen.getByLabelText("클럽 노트 필터"));
  const allFilter = filters.getByRole("button", { name: "전체 12" });
  const questionFilter = filters.getByRole("button", { name: "질문 4" });

  await user.click(questionFilter);

  expect(allFilter).toHaveAttribute("aria-pressed", "false");
  expect(allFilter).toHaveStyle({
    border: "1px solid var(--line)",
    background: "transparent",
    color: "var(--text-2)",
  });
  expect(questionFilter).toHaveAttribute("aria-pressed", "true");
  expect(questionFilter).toHaveStyle({
    border: "1px solid var(--text)",
    background: "var(--text)",
    color: "var(--bg)",
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/notes-feed-page.test.tsx
```

Expected: FAIL because the existing `btn-quiet` buttons do not expose the archive tab border, background, color, height, padding, and radius.

- [ ] **Step 3: Implement the archive-equivalent style**

Add a focused helper and render the existing buttons without the unrelated `btn-quiet` visual class:

```tsx
function notesFilterChoiceStyle(selected: boolean): CSSProperties {
  return {
    height: "32px",
    padding: "0 14px",
    fontSize: "var(--type-size-control)",
    borderRadius: "999px",
    border: `1px solid ${selected ? "var(--text)" : "var(--line)"}`,
    background: selected ? "var(--text)" : "transparent",
    color: selected ? "var(--bg)" : "var(--text-2)",
  };
}
```

For each choice, calculate `const isSelected = selected === id`, set `aria-pressed={isSelected}`, and set `style={notesFilterChoiceStyle(isSelected)}`. Preserve `type="button"`, the label, and `onClick={() => onSelect(id)}`.

- [ ] **Step 4: Run focused and canonical frontend checks**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/notes-feed-page.test.tsx
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Verify the local UI and commit**

Open the requested notes URL at desktop and mobile widths. Confirm selected black state, unselected outline, wrapping, focus visibility, and state movement after choosing `질문 5`. Then commit only the plan, test, and implementation:

```bash
git add docs/superpowers/plans/2026-08-02-notes-filter-archive-parity.md front/shared/ui/notes-read-page.tsx front/tests/unit/notes-feed-page.test.tsx
git commit -m "fix(ui): align notes filters with archive tabs"
```

After final verification, fast-forward local `main` to the feature branch and verify branch ancestry and a clean worktree.
