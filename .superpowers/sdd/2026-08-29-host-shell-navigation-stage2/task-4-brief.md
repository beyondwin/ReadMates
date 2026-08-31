# Stage 2 Task 4 brief — canonical host route elements

- BASE: `7c617317e69434a727e492853d2e819eeed09de1`.
- Plan: `docs/superpowers/plans/2026-08-29-host-shell-navigation-stage2.md`, Task 4 only.
- ADR impact: implement ADR-0048 route registration; no new ADR.

## Required outcome

- Register canonical scoped and compatibility host routes for `/people`, `/records`, and `/settings` with lazy boundaries and existing loader authorization.
- Adapt existing members and meeting-list/query UI behind people and records route elements without duplicating queries.
- `/settings` may be a permission-aware loading/route boundary for Stage 4, but must not mislabel the existing email invitation screen as the approved named-link and club-settings product.
- Keep `/members`, `/invitations`, and `/operations` operational; do not redirect or remove them until Stage 5.
- TDD RED/GREEN for lazy module boundaries, scoped/unscoped registration, and loader auth; Node24 focused tests/lint/diff/public scan; commit and public-safe source-hash report.

## Stop conditions

- Do not implement Stage 4 settings capabilities, alter shell layout, authority purge, server, or legacy redirects.
- Do not duplicate API queries or run full gates/E2E.
