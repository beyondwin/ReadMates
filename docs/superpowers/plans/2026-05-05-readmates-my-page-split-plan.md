# ReadMates MyPage Component Split Plan

작성일: 2026-05-05
상태: READY FOR IMPLEMENTATION

> **For agentic workers:** Implement checkbox-by-checkbox. Start with characterization tests, keep route data and member permissions unchanged, and preserve unrelated worktree edits. This is a follow-up plan only; the Task 9 PR that created this document must not edit frontend source.

## Goal

Split `front/features/archive/ui/my-page.tsx` into smaller archive/my-page UI components while preserving the current member account, notification preference, feedback report, profile editing, and self-leave flows.

Current source of truth:

- Implementation: `front/features/archive/ui/my-page.tsx` (about 1,369 lines in the current worktree)
- Route wrapper: `front/features/archive/route/my-page-route.tsx`
- Tests: `front/tests/unit/my-page.test.tsx`

The large implementation file is the feature UI file above, not a `front/src/pages/*` re-export file.

## Scope Guardrails

- Read `AGENTS.md`, `docs/agents/front.md`, and `docs/agents/design.md` before implementation.
- Keep `MyPage` as the public default export from `front/features/archive/ui/my-page.tsx` until imports are intentionally moved.
- Keep extracted components inside `front/features/archive/ui/my-page/`.
- Keep components prop/callback driven. Do not import archive API modules, route modules, `shared/api`, or `fetch` from extracted UI components.
- Do not change profile edit authorization, host/member/viewer differences, logout behavior, notification preference behavior, or self-leave confirmation semantics.
- Preserve Korean-first copy and current desktop/mobile information hierarchy.
- Use public-safe fixture values only. Do not add real member data, private domains, deployment state, OCIDs, secrets, or token-shaped examples.

## Extraction Candidates

Extract in this order so the profile and report behavior is covered before moving the large desktop/mobile shells.

1. `front/features/archive/ui/my-page/profile-name-editor.tsx`
   - Move `ProfileNameEditor`, `profileFailureMessage`, and related local types if needed.
   - Preserve duplicate-submit blocking, trimmed display-name save, disabled state, and generic failure message behavior.
2. `front/features/archive/ui/my-page/feedback-reports.tsx`
   - Move `FeedbackReports`, `MobileFeedbackReports`, `feedbackReportTotalLabel`, and `LoadMoreButton`.
   - Preserve encoded report links and my-page return state.
3. `front/features/archive/ui/my-page/preferences-section.tsx`
   - Move `PreferencesSection` and notification preference rows only if the prop surface stays small.
   - Keep read-only settings copy and disabled preference semantics unchanged.
4. `front/features/archive/ui/my-page/danger-zone.tsx`
   - Move `DangerZone`.
   - Preserve confirmation flow, pending state, error message, and `/about` redirect after successful self-leave.
5. `front/features/archive/ui/my-page/my-desktop.tsx`
   - Move `MyDesktop` after its child sections are extracted.
   - Keep desktop two-column layout and section order.
6. `front/features/archive/ui/my-page/my-mobile.tsx`
   - Move `MyMobile` after the child sections are extracted.
   - Keep standalone-aligned mobile shell, profile edit access, feedback report row behavior, and mobile notification preferences.

Keep shared presentational helpers such as `SectionHeader`, `Icon`, and `KeyValue` local until two or more extracted modules need them. If shared, create a small `my-page-primitives.tsx` in the same folder instead of reaching into `shared`.

## Characterization Tests

Before moving code, extend `front/tests/unit/my-page.test.tsx` only for gaps. Existing coverage already includes editable identity, host/member permission differences, notification preferences, feedback reports, logout, self-leave, empty states, and mobile shell alignment.

- [x] Confirm existing baseline:

```bash
pnpm --dir front test tests/unit/my-page.test.tsx
```

- [x] Add or verify a test that desktop and mobile profile editors both respect `canEditProfile=false` and do not call the profile update callback.
- [x] Add or verify a test that a profile save trims the value, blocks duplicate submits while pending, and preserves the generic local alert for unknown failures.
- [x] Add or verify a test that feedback document links are encoded and preserve my-page return state on mobile and desktop.
- [x] Add or verify a test that notification preference controls remain visible after save failure and preserve event choices when email delivery is off.
- [x] Add or verify a test that self-leave confirmation works from desktop and mobile, including pending/failed states if not already covered.

Run the targeted suite after each characterization addition:

```bash
pnpm --dir front test tests/unit/my-page.test.tsx
```

## Implementation Checklist

- [x] **Phase 1: Baseline and dependency map**
  - Run `git status --short --untracked-files=all`.
  - Inspect `my-page.tsx` imports and local helper functions.
  - Confirm no unrelated dirty frontend edits will be overwritten.

- [x] **Phase 2: Characterization tests first**
  - Add only missing tests from the section above.
  - Run `pnpm --dir front test tests/unit/my-page.test.tsx`.

- [x] **Phase 3: Extract profile editor**
  - Create `features/archive/ui/my-page/profile-name-editor.tsx`.
  - Export a narrow `ProfileNameEditor` component and any required result type from the new module.
  - Keep all save/validation state local to the editor.
  - Run the targeted my-page test suite.

- [x] **Phase 4: Extract feedback reports**
  - Create `feedback-reports.tsx`.
  - Move desktop and mobile report lists together so pagination and return-state behavior remain aligned.
  - Run the targeted my-page test suite.

- [x] **Phase 5: Extract preferences and danger zone**
  - Create `preferences-section.tsx` and `danger-zone.tsx`.
  - Keep notification preference save callbacks injected from `MyPage`.
  - Keep self-leave behavior injected through `onLeaveMembership`.
  - Run the targeted my-page test suite.

- [x] **Phase 6: Extract desktop and mobile shells**
  - Create `my-desktop.tsx` and `my-mobile.tsx`.
  - Pass derived counts, permissions, report data, and callbacks from `MyPage`.
  - Keep `MyPage` responsible for route-level mutation callbacks and browser redirect side effects that already exist in the component.
  - 2026-05-06 PR9 completion: `my-desktop.tsx` and `my-mobile.tsx` now own the shell markup; `MyPage` still owns mutation callbacks, redirect side effects, and derived counts. Feedback report links remain inside `feedback-reports.tsx` and construct the existing my-page return state there for both desktop and mobile rows.

- [x] **Phase 7: Full verification**
  - Run all commands in the verification section.
  - Inspect the final diff for accidental route/API/model changes.

## Verification Commands

When using `pnpm --dir front`, pass test paths relative to `front/`, not `front/tests/...`.

```bash
pnpm --dir front test tests/unit/my-page.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
git diff --check -- front/features/archive/ui/my-page.tsx front/features/archive/ui/my-page front/tests/unit/my-page.test.tsx
```

## Rollback Plan

- If an extraction regresses behavior, revert only the candidate module and restore that section inside `my-page.tsx`.
- Keep characterization tests that describe real current behavior.
- If shell extraction makes prop threading noisy, stop after extracting leaf sections and leave `MyDesktop`/`MyMobile` in `my-page.tsx` for a later PR.

## Risks

- `ProfileNameEditor` owns local async state; moving it can accidentally re-enable duplicate submits or stale draft values.
- Feedback report links carry route-return behavior; extracted report rows must not build scoped URLs differently.
- Notification preference controls have dependent disabled states; tests must protect the "email off but choices preserved" behavior.
- `DangerZone` uses a browser redirect after successful self-leave; extraction must keep that side effect intentional and covered.
