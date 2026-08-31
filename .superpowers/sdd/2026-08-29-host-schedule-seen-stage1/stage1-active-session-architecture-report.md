# Stage 1 active-session architecture correction report

## Status and scope

- Base: `e0939f9a603feaf73b4d2a8db9ed7ce9a4497d58` on a clean `codex/host-lifecycle-operating-room` worktree.
- ADR impact: `update` — this correction aligns the existing Proposed ADR-0049 implementation with the accepted `active_sessions` projection boundary; it adds no new durable decision.
- Changed surface: V61 migration, exactly five normal session readers/locks, one focused V60→V61 migration assertion, and this report.
- Evidence is local repository and Testcontainers MySQL evidence. No deployment, provider call, private data access, or production mutation was performed.

## Root cause and correction

MySQL fixes a `select *` view's column shape when the view is created. V52 recreated `active_sessions` after adding revision columns, but V61 added `sessions.schedule_revision` without recreating the view. The Stage 1 implementation therefore bypassed the projection in five schedule-aware reads.

V61 now recreates the deletion-filtered view immediately after the `sessions` alter. Exactly these five reads returned to `active_sessions`, and only their redundant `deleted_at is null` predicates were removed:

1. `JdbcSessionParticipationWriteAdapter.currentScheduleRevision`
2. `HostSessionWriteQueryHelpers.HOST_ACTIVE_PROJECTION_SQL`
3. `HostSessionQueries.findHostSessionWithoutHostCheck`
4. `HostSessionQueries.findExistingSchedule`
5. `JdbcCurrentSessionAdapter.loadCurrentSession`

No allowlist, suppression, architecture exception, or `progress.md` change was added.

## RED and closure ledger

| Evidence | Closing source SHA-256 | Command and result | Closure |
| --- | --- | --- | --- |
| Real V60→V61 view contract | `1385461db03dea9ac535d8341beb1439e4c7d393b95466e397987a84fcdc2940` — `MySqlFlywayMigrationTest.kt` | RED: `./server/gradlew -p server integrationTest --tests 'com.readmates.support.MySqlFlywayMigrationTest.mysql upgrades v60 schedule state without fabricating historical seen access'` failed with `BadSqlGrammarException`; MySQL reported `Unknown column 'schedule_revision' in 'field list'` for `active_sessions`. GREEN: the same command passed, 1 test. | The upgraded view exposes a positive `schedule_revision`; after the fixture row is trashed, the view returns zero rows for it. |
| V61 view recreation | `3c4ecb5a4f0d94f3caec14aeb0bc5b9290a8f4038c2e82a4abb2a70670e22d60` — V61 migration | The focused V60→V61 command above passed. | `create or replace view active_sessions as select * from sessions where deleted_at is null` follows the V52 forward-migration pattern. |
| View-backed current-session lock and exact seen revision | `3af0d7741e6bd373acce2d509b7ed5fc001dc3fb2f414f11cd0929f2f38a0f2c` — participation adapter | `./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.SessionScheduleSeenDbTest' --tests 'com.readmates.session.api.HostSessionRevisionContractDbTest' --tests 'com.readmates.contract.FrontendFixtureContractTest' --tests 'com.readmates.contract.FrontendZodSchemaContractTest' --tests 'com.readmates.session.api.HostSessionIdempotencyDbTest'` passed, 50 tests. | The concurrency case held a raw session-row lock, proved the production `active_sessions ... for update` read waited, then observed revision `4` and rejected stale revision `3` without writing seen state. Basic-save exact revision, strict contracts, immutable receipt, and replay/reconciliation remained green. |
| Five-reader architecture boundary | `91927c877271f20ff055b76e78e76b920fd3c9ac4bdaf2ba480c01569995e379` — host queries; `976b5f328b5a4dfd88fe8813cf1ff98ab56931abb58b1e969d6f9fadc88388b9` — projection helper; `83add4969a9f0706d33d762630d071b5676f07c12c79b12480f8956a3e2d6d0e` — current-session adapter | `./server/gradlew -p server unitTest --tests 'com.readmates.architecture.ActiveSessionProjectionArchitectureTest' --tests 'com.readmates.session.application.model.HostSessionRevisionModelsTest'` passed, 10 tests. | The source scanner reports no unapproved normal raw-session read, and the version-vector/snapshot contract remains exact. |
| Server architecture suite | Same closing source hashes above | `./server/gradlew -p server architectureTest` passed, 103 tests. | Existing adapter/application/inventory/quality architecture boundaries remain green with no exception or suppression. |

Style and patch hygiene also passed: `./server/gradlew -p server ktlintMainSourceSetCheck ktlintTestSourceSetCheck` exited `0`, and `git diff --check` exited `0` with no output.

## Acceptance and residual risk

- Selected evidence: Flyway V60→V61 ordering and forward compatibility, active/deleted query behavior, `OPEN` lifecycle, current-row lock serialization, exact schedule revision, and immutable receipt/contract identity.
- Adjacent BFF/OAuth, cursor, async/cache/provider, frontend UI, and browser rows do not apply because this correction changes no route, authorization policy, cursor, external side effect, or UI contract.
- Full `server-ci-check.sh` and full `integrationTest` were intentionally not run, as required by the correction brief. The focused commands above are the claimed evidence boundary.
- Public-repo safety: the change adds no real member data, secret, deployment state, private domain, local absolute path, or token-shaped example.
