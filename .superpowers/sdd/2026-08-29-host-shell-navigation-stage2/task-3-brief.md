# Stage 2 Task 3 brief — wire the four-area host shell

- BASE: `f7b749ded73fd2b2d433e5f62a4d5aa378dfb5da`.
- Plan: `docs/superpowers/plans/2026-08-29-host-shell-navigation-stage2.md`, Task 3 only.
- ADR impact: implement ADR-0048 host layout composition; no new ADR.

## Required outcome

- Inject the Task 2 host composition into `app-route-layout.tsx` while keeping member/guest/admin render contracts unchanged.
- Desktop primary order/labels: `운영실, 일정과 모임, 사람, 기록`; mobile: `운영실, 모임, 사람, 기록`, with identical destination hrefs.
- Keep settings, member view, notifications, and new meeting discoverable as utilities; none may become a fifth primary/bottom tab.
- Route-current matching must use `appPathname()` for scoped and compatibility URLs.
- Mobile bottom navigation must honor safe-area inset and content padding; long labels, 44px targets, focus and reduced-motion behavior stay intact.
- TDD RED/GREEN with focused layout/shared-shell unit and CT coverage, Node24, focused lint/diff/public scan, commit, and public-safe source-hash report.

## Stop conditions

- Do not add canonical route elements (Task 4), change authority purge (Task 5), remove legacy routes (Stage 5), or change server code.
- Do not run full frontend gates or E2E.
