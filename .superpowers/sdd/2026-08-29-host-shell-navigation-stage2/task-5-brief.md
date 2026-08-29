# Stage 2 Task 5 brief — authority loss and cache isolation

- BASE: `2969c626a4f5044a961c4631704a1cdf75dfeebd`.
- Plan: `docs/superpowers/plans/2026-08-29-host-shell-navigation-stage2.md`, Task 5 only.
- ADR impact: implement ADR-0048 authority-navigation boundary; no new ADR.

## Required outcome

- Prove and enforce that club A→B changes every host query scope and never carries sessionId/membershipId to another club.
- Same-club host→member authority loss and cross-club authority loss must purge all host-sensitive queries and drafts before navigation.
- Extend purge inventory for every Stage 1 schedule-seen/access query plus Stage 4 planned workbox/member/record keys, without deleting safe member state.
- Member-view utility lands in the same club and preserves only safe navigation state.
- TDD RED/GREEN with focused authority-navigation/query-key tests and the smallest relevant E2E if the behavior crosses the browser boundary; Node24 lint/diff/public scan; commit and public-safe hash ledger.

## Stop conditions

- Do not add Stage 4 features, canonical route elements, shell visual changes, server code, or legacy redirects.
- Do not run full frontend gates or full E2E.
