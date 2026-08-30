# Stage 3 Task 6 brief — operating-room route composition

- BASE: `02532124`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 6 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: implement the route-composition portion of Proposed ADR-0048/0049; no new ADR.

## Required outcome

- Rewrite `host-dashboard-route.tsx`, create `host-operating-room-page.tsx`, and modify focused route tests. Keep `host-today-page.tsx` only as a temporary compatibility export after all callers are migrated.
- Compose Task 3 loader data into the Task 1 pure view model and Task 4/5 components. Render explicit no-current, prep, live, closing, and independent partial-failure states without reintroducing date/list selection.
- URL query `phase=prep|live|closing` owns phase. Invalid or unavailable phase must normalize with replace navigation and a visible reason; valid completed phases remain readable. Components receive hrefs/callbacks and do not own URL state.
- Reuse existing attendance, restore, closing, receipt, and reconciliation hooks rather than recreating mutations. Never copy RSVP into attendance.
- On 403, use the established club-scoped authority-loss purge/recovery path. On 409, refetch exact detail while preserving the user's local draft and show an honest comparison/retry state. Unknown outcome remains actionable/reconcilable until the canonical receipt resolves.
- Preserve one primary action and server-issued work-item authority. Optional source failures remain local rows/work items and do not blank the route.
- TDD RED/GREEN focused route/unit tests for phase URL, empty current, prep/live/closing, partial failures, 403 purge, 409 draft preservation, and unknown receipt. Run exact changed-file ESLint, diff/public scan, public-safe `task-6-report.md`, force-add brief/report, commit.

## Stop conditions

- Do not change server/loader/model policy, add deferral API, expand Task 7 attendance/closing component behavior, or implement Stage 4 workbox.
- Do not run full frontend/server/CT/E2E/public-release gates.
- Preserve and ignore the external untracked design directory.
