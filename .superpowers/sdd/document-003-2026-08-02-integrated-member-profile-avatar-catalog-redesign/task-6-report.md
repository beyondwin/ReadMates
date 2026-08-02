# Task 6 Report — Adaptive Integrated Profile Editor

## Outcome

Built the Operate-mode integrated profile editor. The member summary is read-only with one `프로필 편집` action; the dialog owns one name/avatar draft and sends one atomic save. Desktop uses a right-aligned 480px rail and mobile uses a full-viewport safe-area layout with sticky header/footer.

## RED / GREEN

- RED authored first for the summary contract, stateless avatar grid, atomic save, save lock, dismissal/discard flow, focus containment/restoration, and field/form failures.
- The requested first RED command (`corepack pnpm --dir front exec vitest run ...`) could not execute because Corepack tried to fetch workspace packages while network access was unavailable (`ERR_PNPM_META_FETCH_FAIL`, `ENOTFOUND`).
- Once the existing checked-out frontend binaries were used, the first implementation run exposed 6 failing dialog tests (accessible input naming and focus restoration). Those failures were fixed without weakening the behavior assertions.
- GREEN: 19/19 focused UI and route tests pass.

## Accessibility and viewport evidence

- Unit tests cover `aria-modal`, accessible dialog description, labelled name input, field error `aria-describedby`, avatar group error linkage, `aria-pressed`, exactly one selected check, focus trap, opener restoration, save locking, and dirty discard confirmation.
- Component tests encode 320×700, 390×844, 1280×900, and 200% zoom assertions; they check containment/no horizontal overflow, 44px controls, full-screen mobile, right-aligned desktop, visible footer, and a single pseudo-element selection/focus ring.
- Browser execution was attempted, but Playwright could not bind its CT server in the sandbox: `listen EPERM: operation not permitted ::1:3100`; 7 tests did not run.
- Reduced-motion CSS removes editor transitions.

## Verification

- `./node_modules/.bin/vitest run features/archive/ui/my-page/member-space-sections.test.tsx features/archive/ui/my-page/avatar-picker.test.tsx features/archive/ui/my-page/profile-editor-dialog.test.tsx features/archive/route/my-page-route.test.tsx` — PASS, 4 files / 19 tests.
- `./node_modules/.bin/eslint .` — PASS, no findings.
- `./node_modules/.bin/vite build` — PASS, 568 modules transformed.
- `./node_modules/.bin/playwright test -c playwright-ct.config.ts features/archive/ui/my-page/profile-editor-dialog.ct.tsx features/archive/ui/my-page/avatar-picker.ct.tsx` — BLOCKED by sandbox bind EPERM; 7 did not run.
- `git diff --check` — PASS.

## Impeccable detector

Ran once after UI completion:

`node /Users/kws/.agents/skills/impeccable/scripts/detect.mjs --json front/features/archive/ui/my-page/profile-editor-dialog.tsx front/features/archive/ui/my-page/avatar-picker.tsx front/features/archive/ui/my-page/member-profile-summary.tsx front/src/styles/globals.css front/shared/styles/mobile.css`

It reported eight pre-existing `side-tab` warnings in unrelated legacy sections of `globals.css` (lines 1382–3134). No finding points to the Task 6 editor styles.

## Changed surface

- Added integrated editor component, unit tests, and component tests.
- Converted `AvatarPicker` to a stateless 30-option selection grid and replaced its tests.
- Converted `MemberProfileSummary` to read-only identity presentation with one editor action.
- Removed the superseded inline `ProfileNameEditor`.
- Updated My Space route regression expectations for one atomic mutation/revalidation.
- Added adaptive editor/picker styling in global and mobile styles.

## Risk selection and remaining concerns

- Acceptance-matrix row selected: UI/runtime state (error, wrapping, desktop/mobile, focus and saving states).
- Authorization, API, persistence, BFF, cache, and session rows are excluded because Task 6 consumes the existing Task 5 callback and changes no boundary or data contract.
- Remaining risk: actual browser geometry at required viewports is encoded but not runtime-confirmed because the sandbox denied the CT server socket. Unit, lint, and production build evidence are local and complete.

## Review fix round 1

- Preserved the active profile step and body scroll position for avatar failures; the inline avatar error remains linked to and focuses the profile avatar control.
- Made discard transitions deterministic: entry focuses `계속 편집`, continuing restores the prior logical control, and the focus trap recovers when focus is temporarily outside after DOM replacement.
- Added labelled `취소` and mobile-back controls. Dirty cancel, backdrop, mobile-back, close, and Escape all enter the sole discard path; pristine dismissal still closes directly.
- Restored unaffected `MemberSpaceOverview`, `MyReadingShelf`, achievement metric, and recent-reading regression coverage in `member-space-regressions.test.tsx`.
- RED evidence: the added focused suite failed 5 tests for missing mobile-back/cancel, discard focus, avatar-step retention, and transition trap recovery.
- GREEN evidence: focused suite now passes 5 files / 26 tests; full frontend ESLint and Vite production build pass.
- Component test retry compiled the seven cases, then remained sandbox-blocked by `listen EPERM: operation not permitted ::1:3100`; 7 did not run.
- The Impeccable detector was not rerun: this was a targeted state/focus correction and the one required detector pass had already completed. This preserves the bounded-pass ceiling.

## Review fix round 2

- Replaced disconnected-element restoration with stable logical focus identities for name, avatar, save, close, cancel, and mobile-back controls. Recreated controls now receive focus after `계속 편집` regardless of React DOM reuse/remount behavior.
- Added capture-phase document Tab containment, covering the real case where focus already sits outside the dialog and no key event bubbles through it.
- Initial focus now targets the name input ref explicitly instead of querying the first button, so the CSS-hidden desktop mobile-back control cannot receive focus.
- RED evidence: 4 focused failures reproduced hidden-mobile-back initial focus, recreated close/cancel restoration, and document-level focus escape.
- GREEN evidence: focused suite passes 5 files / 30 tests; full frontend ESLint and Vite production build pass.
- Component tests compiled all seven cases, then remained sandbox-blocked by `listen EPERM: operation not permitted ::1:3100`; 7 did not run.
- Detector was not rerun because this correction changed focus mechanics only and the bounded detector pass had already completed.
