# Task 7 Report — host schedule review model

## Status and scope

- BASE verified clean: `b64b8290b395c711704cfb1f84e3cf5a35aba8dd`.
- ADR impact: `update` — continues the approved semantics in Proposed ADR-0049; ADR-0049 remains Proposed until the later frontend/runtime and documentation stages agree.
- Task brief SHA-256: `d3345d121af5d1dac77f5560e6898f461d9d2a30da094277a861d41d0032425c`.
- Closing source SHA-256:
  - `front/features/host/model/host-schedule-seen-model.ts`: `78d7b1e3d8883e518198b9d10121cfcbff83e2497de35ecc44cbbc03e420860f`
  - `front/features/host/model/host-schedule-seen-model.test.ts`: `11c9bd17dc06ca8f830057ebcda83c740c9af9ae922f0592d7af978d58fec5fa`

Task 4 already owns the strict host detail, version-vector, projection, receipt, and reconciliation schemas. Task 7 therefore adds no duplicate endpoint or client query and changes no server classification. It adds the pure, UI-ready projection of that server state only.

## TDD evidence

- RED command:

  ```bash
  PATH=/opt/homebrew/opt/node@24/bin:$PATH npx --yes corepack@0.35.0 pnpm --dir front test -- features/host/model/host-schedule-seen-model.test.ts
  ```

  Result: the new suite failed at collection with `Cannot find module './host-schedule-seen-model'`; `1` failed suite with `0` tests collected. Vitest completed the existing configured suites as well (`397` passed files, `3580` passed tests). The expected missing production module was the failure cause.

- GREEN model command:

  ```bash
  PATH=/opt/homebrew/opt/node@24/bin:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run --project node features/host/model/host-schedule-seen-model.test.ts
  ```

  Result: `1` file, `5` tests passed.

- Focused host API/query/model and receipt/reconciliation regression command:

  ```bash
  PATH=/opt/homebrew/opt/node@24/bin:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run --project node tests/unit/host-contract-zod.test.ts features/host/api/host-api.test.ts features/host/api/host-session-recovery-contracts.test.ts features/host/queries/host-session-queries.test.ts features/host/model/host-schedule-seen-model.test.ts
  ```

  Result: `5` files, `78` tests passed. The existing non-baseline `scheduleRevision` contract test covers host detail, version vector, projection, immutable receipt, and reconciliation; the host API test covers the exact reconciliation response.

- `git diff --check`: exit `0`.

## Contract closure

- `hostScheduleSeenRows(detail)` consumes only the server-provided participant `scheduleSeenState`, seen revision, and seen time. It filters explicit `REMOVED` rows, maps only the privacy-safe host fields, and sorts `UNSEEN → STALE → CURRENT`.
- `hostScheduleSeenSummary(detail)` consumes only the server-provided availability, revision, and counts. It never recomputes a denominator from displayed rows, so `REMOVED` cannot enter it and unavailable counts remain `null` rather than guessed.
- Labels are the ADR-0049-approved `미열람`, `변경 전 확인`, and `현재 일정 확인`.
- The model neither reads nor derives state from RSVP, attendance, access, or timestamps. Its test deliberately uses conflicting RSVP/attendance facts to prove the preserved server classification.

## Changed files

- `front/features/host/model/host-schedule-seen-model.ts`
- `front/features/host/model/host-schedule-seen-model.test.ts`
- `.superpowers/sdd/2026-08-29-host-schedule-seen-stage1/task-7-report.md`

## Acceptance and residual risk

- Selected acceptance row: UI or runtime state, limited to pure loading/available/unavailable presentation state and its deterministic sort/empty-denominator behavior.
- Excluded rows: actor/authorization, club context, BFF/OAuth, persistence/migration, cursor, provider/cache, and browser runtime. This task adds no route, fetch, mutation, server state, or UI surface.
- Evidence is local repository-only. Stage-wide lint/test/build/E2E gates and browser/runtime validation were intentionally not run by the Task 7 controller constraint.
