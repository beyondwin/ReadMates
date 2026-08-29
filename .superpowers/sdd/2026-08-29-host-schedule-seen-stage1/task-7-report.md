# Task 7 Report — host schedule review model

## Status and scope

- BASE verified clean: `b64b8290b395c711704cfb1f84e3cf5a35aba8dd`.
- ADR impact: `update` — continues the approved semantics in Proposed ADR-0049; ADR-0049 remains Proposed until the later frontend/runtime and documentation stages agree.
- Task brief SHA-256: `d3345d121af5d1dac77f5560e6898f461d9d2a30da094277a861d41d0032425c`.
- Closing source SHA-256:
  - `front/features/host/model/host-schedule-seen-model.ts`: `68df0959becd850c350faa231e7954bfd3c8a972a41ac410419b4dc2e783b542`
  - `front/features/host/model/host-schedule-seen-model.test.ts`: `835abdb593d0019b57763dfbdba252c7d429ad7a90595c050bf8845aa1d4a029`

All frontend commands in this report ran with Node 24 and the pinned Corepack launcher. Local launcher paths are intentionally omitted.

Task 4 already owns the strict host detail, version-vector, projection, receipt, and reconciliation schemas. Task 7 therefore adds no duplicate endpoint or client query and changes no server classification. It adds the pure, UI-ready projection of that server state only.

## TDD evidence

- RED command:

  ```bash
  npx --yes corepack@0.35.0 pnpm --dir front test -- features/host/model/host-schedule-seen-model.test.ts
  ```

  Result: the new suite failed at collection with `Cannot find module './host-schedule-seen-model'`; `1` failed suite with `0` tests collected. Vitest completed the existing configured suites as well (`397` passed files, `3580` passed tests). The expected missing production module was the failure cause.

- GREEN model command:

  ```bash
  npx --yes corepack@0.35.0 pnpm --dir front exec vitest run --project node features/host/model/host-schedule-seen-model.test.ts
  ```

  Result: `1` file, `5` tests passed.

- Focused host API/query/model and receipt/reconciliation regression command:

  ```bash
  npx --yes corepack@0.35.0 pnpm --dir front exec vitest run --project node tests/unit/host-contract-zod.test.ts features/host/api/host-api.test.ts features/host/api/host-session-recovery-contracts.test.ts features/host/queries/host-session-queries.test.ts features/host/model/host-schedule-seen-model.test.ts
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

## Fix round 1 — deterministic ordering and report safety

- Base: clean `6aab62779e834ead07bb2bec5f59ab4096b01add`.
- Root cause: rows with equal state compared as `0`, preserving upstream input order rather than providing a deterministic review order.
- RED command (Node 24, pinned Corepack):

  ```bash
  npx --yes corepack@0.35.0 pnpm --dir front exec vitest run --project node features/host/model/host-schedule-seen-model.test.ts
  ```

  Result: `1` file with `6` tests, `1` failed and `5` passed. Shuffled same-state rows returned `unseen-z` before `unseen-a`.
- GREEN command: the same command passed `1` file and `6` tests after adding `membershipId` as the state-tie breaker.
- The report command examples now keep the exact pinned Corepack invocation without machine-specific launcher paths.
