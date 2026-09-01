# Stage 3 Task 7 brief — phase-specific completion flows

- BASE: `8ddb02cdb21067cb58ad9e900850851599d1cdd9`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 7 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: complete the Stage 3 reuse slice of Proposed ADR-0048/0049; no new ADR.

## Required outcome

- Modify/reuse `meeting-response-ledger.tsx`, `session-closing-board.tsx`, their focused tests, `host-dashboard-route.test.tsx`, and `front/tests/e2e/host-lifecycle-operating-room.spec.ts` only as needed for complete phase flows.
- Prep: schedule review CTA is available only when server `scheduleSeenAvailability` is `AVAILABLE`; DRAFT unavailable retains explanatory copy and exposes no review mutation. RSVP/questions/place keep their owned detail destinations.
- Live: reuse the canonical attendance editor with attended/absent/unknown, bulk action, mutation receipt, and undo. Never derive or copy RSVP into actual attendance.
- Closing: reuse canonical readiness/checklist, record apply, publish, blocked reasons, mutation receipts, reconciliation, and public destination behavior. Do not reproduce closing predicates or mutations.
- Add an isolated E2E that proves prep → live → closing navigation/operation without losing URL-authoritative club or current session context. Use synthetic local fixtures only and no real email/notification dispatch.
- Keep current meeting context stable across phase changes, refetch, receipt/undo, and closing actions; no compatibility `/app/**` escape.
- TDD RED/GREEN focused unit tests and the new isolated E2E under Node24/pinned pnpm. Use dedicated non-user ports/database and do not disturb existing dev servers. Run exact changed-file ESLint, diff/public scan, public-safe `task-7-report.md`, force-add brief/report, commit.

## Stop conditions

- Do not create new attendance/closing/schedule-seen policy or APIs; reuse existing contracts/hooks/components.
- Do not send real email/notifications, deploy, run full E2E, or run full stage gates.
- Do not change Stage 4 workbox or Stage 5 responsive closeout.
- Preserve and ignore the external untracked design directory.
