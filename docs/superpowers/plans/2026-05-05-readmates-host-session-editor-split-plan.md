# ReadMates HostSessionEditor Component Split Plan

작성일: 2026-05-05
상태: READY FOR IMPLEMENTATION

> **For agentic workers:** Implement checkbox-by-checkbox. Start with characterization tests, keep session editor behavior unchanged, and preserve unrelated worktree edits. This is a follow-up plan only; the Task 9 PR that created this document must not edit frontend source.

## Goal

Split `front/features/host/ui/host-session-editor.tsx` into smaller session-editor UI components while preserving new-session creation, existing-session editing, publication lifecycle, attendance writes, feedback document upload, mobile tabs, scoped redirects, and delete behavior.

Current source of truth:

- Implementation: `front/features/host/ui/host-session-editor.tsx` (about 1,325 lines in the current worktree)
- Route wrapper: `front/features/host/route/host-session-editor-route.tsx`
- Model helpers: `front/features/host/model/host-session-editor-model.ts`
- Tests: `front/tests/unit/host-session-editor.test.tsx`, `front/tests/unit/host-session-editor-model.test.ts`

## Scope Guardrails

- Read `AGENTS.md`, `docs/agents/front.md`, and `docs/agents/design.md` before implementation.
- Keep `HostSessionEditor` as the public default export from `front/features/host/ui/host-session-editor.tsx` until imports are intentionally moved.
- Keep extracted components inside `front/features/host/ui/session-editor/`.
- Keep components prop/callback driven. Extracted UI must not import host API modules, route modules, `shared/api`, or `fetch`.
- Do not change request payload shapes, lifecycle permissions, route paths, scoped return-state behavior, or Korean product copy.
- Preserve mobile tab keyboard behavior, focus behavior in the delete modal, and optimistic attendance write semantics.
- Use public-safe examples only. Do not add real member data, private domains, deployment state, OCIDs, secrets, or token-shaped examples.

## Extraction Candidates

Extract in this order so static panels move before stateful lifecycle sections.

1. `front/features/host/ui/session-editor/mobile-editor-tabs.tsx`
   - Move `mobileEditorSections`, `mobileEditorSectionConfig`, `focusMobileEditorSection`, and `handleMobileEditorSectionKeyDown`.
   - Preserve roving tab index, arrow/Home/End keyboard behavior, and `aria-controls`.
2. `front/features/host/ui/session-editor/basic-session-panel.tsx`
   - Move the book, schedule, location, meeting, and cover inputs.
   - Keep controlled values and setters injected from `HostSessionEditor`.
3. `front/features/host/ui/session-editor/publication-panel.tsx`
   - Move publication summary, visibility radios, save/close/publish controls, and publication feedback rendering.
   - Preserve host-only publish blocking and in-flight disabled states.
4. `front/features/host/ui/session-editor/attendance-panel.tsx`
   - Move attendance list rendering and controls, but keep write orchestration in `HostSessionEditor` unless a later model extraction is planned.
   - Preserve removed participant grouping and optimistic rollback behavior.
5. `front/features/host/ui/session-editor/document-state-panel.tsx`
   - Move `DocumentStatePanel`, `sessionStateBadgeClass`, and `recordVisibilityBadgeClass`.
   - Keep status labels sourced from existing helpers.
6. `front/features/host/ui/session-editor/session-editor-links.tsx`
   - Move default link component and scoped host redirect helpers only if it does not create route coupling inside leaf UI.
   - Prefer injecting `LinkComponent` and computed href/state from the parent.

`Panel` can move to `session-editor-panel.tsx` once at least two extracted panels use it.

## Characterization Tests

Before moving code, extend `front/tests/unit/host-session-editor.test.tsx` only for gaps. Existing coverage already includes default dates, new/edit labels, mobile tabs, payloads, publication lifecycle, attendance coalescing, feedback upload, delete modal focus, and scoped redirects.

- [ ] Confirm existing baseline:

```bash
pnpm --dir front test tests/unit/host-session-editor.test.tsx tests/unit/host-session-editor-model.test.ts
```

- [ ] Add or verify a test that the mobile tablist supports click, ArrowLeft/ArrowRight, Home, and End while preserving `aria-selected` and panel visibility.
- [ ] Add or verify a test that the basic session panel submits book, image, meeting URL, passcode, date, time, and location without changing deadline semantics.
- [ ] Add or verify a test that publication save and publish controls disable while pending and block host-only visibility publication before sending a request.
- [ ] Add or verify a test that attendance writes remain serialized/coalesced and rollback to the last committed status on failure.
- [ ] Add or verify a test that the delete modal keeps focus trapped, restores focus on Escape, and keeps scoped delete redirects.

Run the targeted suite after each characterization addition:

```bash
pnpm --dir front test tests/unit/host-session-editor.test.tsx
```

## Implementation Checklist

- [ ] **Phase 1: Baseline and dependency map**
  - Run `git status --short --untracked-files=all`.
  - Inspect `host-session-editor.tsx` imports and local helper ownership.
  - Confirm no unrelated dirty frontend edits will be overwritten.

- [ ] **Phase 2: Characterization tests first**
  - Add only missing tests from the section above.
  - Run the targeted host session editor test command.

- [ ] **Phase 3: Extract mobile tabs and shared panel shell**
  - Create `mobile-editor-tabs.tsx`.
  - Optionally create `session-editor-panel.tsx` for `Panel`.
  - Keep active-section state owned by `HostSessionEditor`.
  - Run the targeted host session editor test suite.

- [ ] **Phase 4: Extract basic and document-state panels**
  - Create `basic-session-panel.tsx` and `document-state-panel.tsx`.
  - Keep all controlled input values and setters explicit in props.
  - Run the targeted host session editor test suite.

- [ ] **Phase 5: Extract publication panel**
  - Create `publication-panel.tsx`.
  - Pass save/close/publish callbacks and status values from `HostSessionEditor`.
  - Keep validation feedback and disabled states unchanged.
  - Run the targeted host session editor test suite.

- [ ] **Phase 6: Extract attendance panel**
  - Create `attendance-panel.tsx`.
  - Keep write queue refs and mutation orchestration in `HostSessionEditor` unless a separate model refactor is planned.
  - Run the targeted host session editor test suite.

- [ ] **Phase 7: Review link and redirect helpers**
  - Extract `session-editor-links.tsx` only if it keeps route concerns injected and does not make leaf panels router-aware.
  - Verify new-session save, existing-session save, and delete redirects stay scoped.

- [ ] **Phase 8: Full verification**
  - Run all commands in the verification section.
  - Inspect the final diff for accidental route/API/model changes.

## Verification Commands

When using `pnpm --dir front`, pass test paths relative to `front/`, not `front/tests/...`.

```bash
pnpm --dir front test tests/unit/host-session-editor.test.tsx tests/unit/host-session-editor-model.test.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
git diff --check -- front/features/host/ui/host-session-editor.tsx front/features/host/ui/session-editor front/tests/unit/host-session-editor.test.tsx
```

## Rollback Plan

- If an extraction regresses behavior, revert only that candidate module and restore the section inside `host-session-editor.tsx`.
- Keep characterization tests that capture current behavior.
- If attendance or publication prop surfaces become too broad, stop at static panel extraction and split state orchestration in a separate plan.

## Risks

- Attendance writes are stateful and concurrency-sensitive; moving rendering must not move queue ownership casually.
- Publication lifecycle combines validation, save, close, and publish calls; broad extraction can hide pending-state bugs.
- Mobile tab behavior is accessibility-sensitive; keyboard and ARIA tests are required before and after extraction.
- Scoped redirects protect multi-club navigation. Link extraction must not read global location in leaf components unless that behavior is already characterized.
