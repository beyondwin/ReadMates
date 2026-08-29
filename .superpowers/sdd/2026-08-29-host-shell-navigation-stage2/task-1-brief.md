# Stage 2 Task 1 brief — canonical host destination ownership

- BASE: `57bca8ca14e98a98d2edb14e34827c8712f6c8b7`.
- Plan: `docs/superpowers/plans/2026-08-29-host-shell-navigation-stage2.md`, Task 1 only.
- ADR impact: implement the route-ownership portion of ADR-0048; no new ADR.

## Required outcome

- Define canonical destinations for operating room, meetings, people, records, settings, notifications, new/detail/edit/closing session, and person detail exactly as specified by the plan.
- Preserve compatibility exports for `today`, `members`, `invitations`, and `operations` until Stage 5; do not remove or redirect legacy routes in this task.
- Prove four primary plus five utility/action inventory, scoped/unscoped href construction, and detail ownership.
- Update route continuity/workspace safe families so people, records, and sessions return to their canonical areas without carrying cross-club entity identifiers.
- TDD RED/GREEN, focused tests only, commit, and a public-safe report with `source hash → command → result → finding closure`.

## Stop conditions

- Do not change shell visuals, route elements, server behavior, or Stage 5 redirects.
- Do not run full lint/test/build/E2E.
