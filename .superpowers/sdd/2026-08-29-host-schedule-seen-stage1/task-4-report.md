# Task 4 Report — privacy-safe schedule review read models

## Status and source

- Implemented Stage 1 Task 4 against source commit `f81efe13cdc8e2053daa4c65d149594afbce27d6`.
- Task brief SHA-256: `1927e788c5c61316b5778de058b126b005d01f3fd2e999e602e06860ef37804f`.
- ADR impact: `update` — implements the read-model and immutable version-vector slice of Proposed ADR-0049. ADR-0049 remains Proposed until the later frontend/runtime/documentation stages align.
- Evidence is local repository and Testcontainers MySQL evidence. No deployment, provider call, or production mutation was performed.

## TDD RED

- Added contract assertions before production changes for:
  - member current-session `scheduleRevision` and requester-only seen revision/time;
  - host CURRENT, STALE, and UNSEEN classification at exact revision `3`;
  - REMOVED participant retention in detail with exclusion from the active denominator;
  - DRAFT without a participant snapshot returning `UNAVAILABLE` and nullable counts;
  - recursive rejection of email, user ID, auth-session/token, page-path, action-history, and raw-history keys.
- RED command:
  - `./server/gradlew -p server integrationTest --tests 'com.readmates.contract.FrontendZodSchemaContractTest'`
  - result: `16 tests completed, 3 failed`; the three new tests failed with assertion failures because the schedule read-model fields were absent.

## GREEN behavior and contract decisions

- `CurrentSessionDetail` returns the authoritative session schedule revision and only the requesting ACTIVE participant's seen revision/time. Attendee rows on the member response do not gain seen fields.
- Host detail returns schedule revision both directly and in `SessionVersionVector`, plus participant seen facts and server-owned CURRENT/STALE/UNSEEN classification.
- The summary denominator contains ACTIVE participants only. REMOVED rows remain visible in the existing host detail but do not contribute to `currentCount`, `staleCount`, `unseenCount`, or `eligibleCount`.
- Only an OPEN session with a non-empty ACTIVE participant snapshot is `AVAILABLE`. DRAFT, non-OPEN history, and a missing eligible snapshot return `UNAVAILABLE` with nullable counts and no review destination.
- `scheduleRevision` is positive, is included in projection snapshot identity, and is inserted/read with immutable host mutation receipts. V61's database default preserves historical receipt rows at baseline `1`; no current session value is used to reinterpret old receipts.
- The V61 column is not exposed by the legacy `active_sessions` view. Schedule-aware current/detail/projection reads therefore use `sessions` with the equivalent `deleted_at is null` boundary.
- Host response privacy tests reject the forbidden key set recursively. RSVP and attendance remain independent fields and are not used to infer schedule seen state.

## Focused verification

- Fixture export and determinism:
  - `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures`
  - staged generated fixtures, reran the same command, then `git diff --exit-code -- front/tests/unit/__fixtures__/zod-schemas/`
  - result: exit `0`; no unstaged generated drift.
- Contract and receipt/reconciliation integration:
  - `./server/gradlew -p server integrationTest --tests 'com.readmates.contract.FrontendFixtureContractTest' --tests 'com.readmates.contract.FrontendZodSchemaContractTest' --tests 'com.readmates.session.api.HostSessionIdempotencyDbTest'`
  - result: `BUILD SUCCESSFUL`; 31 tests, 0 failures.
- Version-vector/snapshot unit contract:
  - `./server/gradlew -p server unitTest --tests 'com.readmates.session.application.model.HostSessionRevisionModelsTest'`
  - result: `BUILD SUCCESSFUL`; 8 tests, 0 failures.
- `git diff --check`
  - result: exit `0`, no output.

## Changed files

- Planned production/read-model surfaces:
  - `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
  - `server/src/main/kotlin/com/readmates/session/application/model/HostSessionRevisionModels.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcCurrentSessionAdapter.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionProjectionQueries.kt`
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostMutationReceiptAdapter.kt`
- Structurally required narrow production expansion:
  - `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteQueryHelpers.kt` — owns the actual active/all immutable projection SQL delegated to by `HostSessionProjectionQueries.kt`.
  - `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionWebDtos.kt` — owns the serialized/deserialized version-vector body.
- Contract tests and structurally required existing model test:
  - `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
  - `server/src/test/kotlin/com/readmates/session/application/model/HostSessionRevisionModelsTest.kt`
- Frontend contract fixture surfaces:
  - `front/scripts/export-zod-fixtures.ts`
  - `front/tests/unit/__fixtures__/host-session-detail.json`
  - `front/tests/unit/__fixtures__/zod-schemas/host-session-detail.json`
  - `front/tests/unit/__fixtures__/zod-schemas/current-session.json`
- This report:
  - `.superpowers/sdd/2026-08-29-host-schedule-seen-stage1/task-4-report.md`

The exporter reran all named zod fixture outputs. `host-session-change-receipt.json`, `host-session-history-recovery.json`, and `host-session-record-editor.json` remained byte-identical because none contains `SessionVersionVector`; adding a synthetic schedule field there would misstate the current server contract. `current-session-empty.json` also remains correctly unchanged because its payload is `{ "currentSession": null }`.

## Acceptance matrix and residual risk

- Selected: lifecycle (`DRAFT` unavailable, `OPEN` available), guest/host DTO privacy, participant snapshot denominator, and immutable receipt/projection identity.
- Excluded: BFF/OAuth, cursor collection, provider/cache delivery, and browser runtime state; this task changes no route, cursor, provider, or UI behavior.
- Stage-wide lint/test/build/E2E gates were not run by controller instruction.
- An optional expanded probe that combined `JdbcMutationIdempotencyAdapterDbTest` with the required host receipt class found one unrelated shared-admin fixture failure: `admin_public_takedown_receipts.actor_admin_id` is absent in that test schema. The required `HostSessionIdempotencyDbTest` was rerun alone and passed; no out-of-scope admin schema change was made.
- ADR-0049 remains Proposed. TypeScript runtime schema alignment is closed by review fix round 1; UI consumption remains owned by later Stage 1 tasks.

## Review fix round 1 — source hash → command → result → closure

All hashes below are SHA-256 values of the closing source state. The round started from clean commit `d9b792f93d38ba987c633298763ca09eba5d6204` and remained limited to the four review findings and their focused fixtures/tests.

| Finding | Closing source hash | Command and result | Closure evidence |
| --- | --- | --- | --- |
| Host version vector and parser coverage | `03042ea6ebbbe60f23e5d2f9a9241aff3d49e56425b1a9668b8c2bd00b6c21df` — `front/features/host/api/host-contracts.ts` | RED: pinned Node 24 Vitest run completed 20 tests with 3 failures; `HostVersionVectorSchema` rejected non-baseline `scheduleRevision: 7` and host detail parsing rejected the nested vector. GREEN: the same focused run passed 20/20. | `HostVersionVector` and its strict Zod schema now require a positive schedule revision. One focused test parses revision `7` through host detail, projection, immutable receipt, and reconciliation schemas, while rejecting missing and zero values. |
| Current-session/host TypeScript contracts and validated export | `e508162d6909e65d9e6d148676e1fb67432897c23f3b2fa2ceccc9a8d81fe91b` — current-session schema; `b4df50940bd40f8a148830954c906c56a79795f62f7ab42730086ecd9d1460d1` — exporter | RED: the focused Vitest run showed the current-session parser stripping `scheduleRevision`, `mySeenScheduleRevision`, and `myScheduleSeenAt`. The first schema-backed exporter run then reproduced a Node import failure at a top-level `import.meta.env.DEV` guard. GREEN: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures` exited `0`. | Current and host types/Zod schemas own the schedule fields. The exporter parses the two relevant handwritten samples through those canonical schemas before writing, and the four unrelated top-level host DEV guards use Node-safe optional environment access without changing Vite behavior. |
| Representative-array validation | `07a08e56da0055c037e1c5835c49ea04ee573bd03dda201ab97c258b3e604735` — server frontend-contract test | RED: `FrontendZodSchemaContractTest` completed 18 tests with 2 failures, including the optional helper accepting an empty array despite a representative fixture item. GREEN: `./server/gradlew -p server integrationTest --rerun-tasks --tests 'com.readmates.contract.FrontendZodSchemaContractTest'` passed 18/18. | Optional-field matching again rejects empty representative arrays globally. Only the Task 4 draft mutation response opts into `$.attendees` as an allowed empty path. |
| Future seen-revision corruption | `565fac5c980e9bba4ba4ef65fb816525e51380560823fdce14a9a2628a5a7c04` — host row mapper | RED: the same 18-test run failed because seen revision `4` against schedule revision `3` was returned as STALE. GREEN: the fresh `--rerun-tasks` selector passed 18/18. | STALE is now only `seenRevision < scheduleRevision`; equality is CURRENT, null is UNSEEN, and a future value fails fast with an explicit invariant message. |

Fixture determinism was sealed by staging only the two generated schedule-contract fixtures, rerunning the pinned exporter, and running `git diff --exit-code -- front/tests/unit/__fixtures__/zod-schemas/`; result: exit `0`. `git diff --check` also exited `0`. Stage-wide gates remained intentionally excluded.

## Review fix round 2 — legacy wire fixtures

- Source state: clean commit `d07f995cf3e6940ed86c06591c9feb1d661d9f24`.
- Closing SHA-256:
  - `252f0a4e3dea48de4401f8c60089a558139a481a354cfce7a8ee69b88c747eba` — `front/features/host/api/host-session-recovery-contracts.test.ts`
  - `16197d415c27f4c9c8784b0d8f17f744f2711a093107eb7d2dd900a8bbbe44a9` — `front/features/host/api/host-api.test.ts`
- Focused RED command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/api/host-session-recovery-contracts.test.ts features/host/api/host-api.test.ts`.
  - Result: 30 tests, 6 failures. Every failure was strict-schema rejection of omitted schedule fields in the two legacy wire fixtures: detail revision/availability/summary, version-vector schedule revision, or reconciliation receipt/projection/current vectors.
- Focused GREEN command: the same pinned command.
  - Result: 2 files passed, 30 tests passed.
- Closure: both legacy detail fixtures now use non-baseline `scheduleRevision: 7`, AVAILABLE summary counts for one ACTIVE current attendee, and explicit seen revision/time/state. Reconciliation resulting/projection/current vectors carry the same non-baseline schedule revision. No production file changed.
