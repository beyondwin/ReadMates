# Task 8 Report — coarse club access

## Status and scope

- BASE verified clean: `2579261343ae5c2e9e6af2bec434ee78fc07f1e4`.
- ADR impact: `update` — implements the coarse-access and independence semantics in Proposed ADR-0049 while preserving the Proposed ADR-0048 member-ledger presentation. Both ADRs remain Proposed until the stage-wide code, tests, documentation, and active architecture agree.
- Task brief SHA-256: `5ee7614ee03bfd677bf9095b9388059a795579a89e4c939c86ccfc5eed990ea7`.
- Closing source SHA-256:
  - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcClubAccessAdapter.kt`: `aff0835d2874e9bbb9f659e6b974257e08aa09d01a1ee45fa0cfed4b52e43cce`
  - `server/src/main/kotlin/com/readmates/auth/application/service/ClubAccessService.kt`: `b60a8975b8aed05f9bf84598d10bfa4715027006b034844e4376e501f6fa12e9`
  - `front/shared/auth/club-access-api.ts`: `c8b3ffa572f786921bef3073992e5c0fedba9b5f006554a3752173e51dea411e`
  - `front/src/app/layouts/app-route-layout.tsx`: `d2b7edbb331c73693bd870f03992e8a86ceb44e025635ca804268abc4762859e`
  - `front/features/host/api/host-contracts.ts`: `f04c881d2f5eb275ee601afe7e0396e90e1fbb9dec9b84a523ea7ec1e04ab725`

Frontend commands ran with Node `v24.18.0`, Corepack `0.35.0`, and the repository-pinned pnpm `11.13.1`. Machine-specific launcher paths are intentionally omitted.

Task 6 already owns the `membership_club_access` table. Task 8 adds no migration and uses only its three privacy-bounded columns: membership, club, and coarse access time.

## TDD evidence

### Server RED

- The smallest `ClubAccessDbTest` first failed with expected `200` but received `403`, proving that the exact API/security path did not exist.
- The expanded persistence suite then exposed a stale-row defect: an `INACTIVE` membership with a retained row could still receive the old timestamp. The readback query was constrained to an eligible current membership before GREEN.
- Lifecycle tests failed with a remaining access-row count of `1` after host deactivation and viewer deactivation. Service ordering tests also failed until access deletion followed the membership transition in the existing transaction.

### Frontend RED

- The API/query/helper slice failed on missing `club-access-api`, missing `club-access-query`, and missing compact access metadata.
- The app-shell test failed because no access request was made (`0` calls instead of `1`). A separate fixture-only index-route mismatch was isolated and corrected without changing production routing.
- The strict host contract test showed Zod stripping `lastClubAccessAt`, and the member-row test could not find `최근 접속 2026.08.29 10:02`.

### Consolidated GREEN

- Server integration selectors:

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests 'com.readmates.auth.api.ClubAccessDbTest' \
    --tests 'com.readmates.auth.api.ClubAccessBffSecurityTest' \
    --tests 'com.readmates.auth.api.HostMemberLifecycleControllerTest.host deactivates member to left and removes from current session when apply now' \
    --tests 'com.readmates.auth.api.HostMemberLifecycleControllerTest.host lists members with current session participation flags' \
    --tests 'com.readmates.auth.api.HostMemberApprovalControllerTest.host deactivates viewer member'
  ```

  Result: `19` tests passed — database/API `12`, exact BFF security `4`, lifecycle/list projection `2`, viewer deactivation `1`.

- Server lifecycle unit selector:

  ```bash
  ./server/gradlew -p server unitTest \
    --tests 'com.readmates.auth.application.service.MemberLifecycleServiceTest'
  ```

  Result: `8` tests passed.

- Frontend API/query/layout/host-contract/presentation/BFF selectors:

  ```bash
  npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
    shared/auth/club-access-api.test.ts \
    shared/auth/club-access-query.test.ts \
    src/app/layouts/app-route-layout-club-access.test.tsx \
    features/host/ui/members/member-list-helpers.test.ts \
    features/host/api/host-api.test.ts \
    tests/unit/host-members.test.tsx \
    tests/unit/cloudflare-bff.test.ts \
    --reporter=dot --silent
  ```

  Result: `7` files and `148` tests passed.

- `./server/gradlew -p server ktlintCheck`: GREEN.
- Focused ESLint over all changed TypeScript/TSX files: GREEN.
- `git diff --check`: GREEN.

## Contract and privacy closure

- `PUT /api/me/club-access` is bodyless and returns only `lastClubAccessAt`.
- The database atomically inserts or advances the timestamp only after the 15-minute boundary; the persisted timestamp is returned so concurrent callers converge on one stored fact.
- Current member-app statuses `VIEWER`, `ACTIVE`, and `SUSPENDED` can touch. Cross-club, inactive, and synthetic support contexts cannot create or recover a row because the write/readback requires the actual scoped membership.
- The exact PUT path alone receives the CSRF exception and `ROLE_VIEWER` authorization. Missing/invalid BFF secret, invalid origin, another method, a suffix path, and forged club context fail closed.
- The generic Pages Functions proxy forwards the bodyless request, derives the trusted club header from `clubSlug`, replaces a browser-forged header, and preserves upstream denial status/body.
- `INACTIVE` transitions owned by host deactivation, viewer deactivation, and self-leave delete the access row inside the existing transaction. Host list/detail projections expose only nullable `lastClubAccessAt`.
- Database tests prove the table has no route, action, duration, IP, user-agent, device, or auth-session fields; strict frontend schemas reject behavioral-detail keys.
- Schedule-seen state and `memberships.updated_at` remain unchanged by an access touch.
- The authenticated member app shell attempts once per club per mounted client episode, marks the club before starting the request, and absorbs failure without query state, retry, navigation blocking, or content blocking.
- The incumbent member ledger adds one compact line beneath tenure: `최근 접속 …` or `접속 기록 없음`. No navigation, table structure, card, or visual-system redesign was introduced.

## Changed surfaces

- Server auth inbound API, application port/service/model, JDBC persistence, and exact Spring security matcher.
- Existing member lifecycle and viewer approval transaction ports/services/adapters for access cleanup.
- Existing host member list/detail contract and JDBC projection.
- Frontend shared access API and once-per-club query helper, existing app layout effect, host contract/model, and compact member-ledger line.
- Pages Functions BFF regression coverage only; generic proxy production code did not require a change.
- Focused server and frontend tests plus this task report.

## Acceptance and residual risk

- Selected acceptance rows: actor/authorization, club context, BFF/OAuth boundary, persistence/concurrency, lifecycle cleanup, API contract, app-shell runtime state, privacy, and compact responsive presentation.
- Concurrency and throttle evidence uses controlled database timestamps and concurrent callers rather than a 15-minute wall-clock wait.
- Validation is repository-local and focused. Stage-wide server CI, full frontend lint/test/build, E2E, live browser/responsive inspection, deployment, and stage gates were intentionally not run under the Task 8 controller boundary.

## Fix round 1 — support synthesis and schedule-seen lifecycle evidence

- Base: clean `daac49f57a9f61063b88c1c12d54a496b3ec3921`.
- Closing test-source SHA-256:
  - `server/src/test/kotlin/com/readmates/auth/api/ClubAccessDbTest.kt`: `3583f72e17b417f387258aeaac36324d44761bf5bbc184cb93514c739af29638`
  - `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`: `c88294bf68240e3ee2da867473b0f8995a2822fbc95e3537d76232670f59f791`
  - `server/src/test/kotlin/com/readmates/session/api/HostSessionTrashControllerDbTest.kt`: `d1c21b12197287f09e9b69d0e555278641df46c3c42eaebe6d405ba76cfa7501`

The original support exclusion test used Spring Security's string `User` principal. It therefore provided no `CurrentUser.userId` to `MemberAuthoritiesFilter`, never entered active-grant synthesis, and could pass without proving the intended boundary. The replacement uses the real seeded `CurrentUser`, platform-admin authority, and an active database grant. A host member-list read first returns `200`, proving synthetic-host resolution; the exact access PUT then returns `403`, the grant/proxy ID has no access row, and the club's total access-row count is unchanged.

The existing host-member lifecycle owner now seeds revision `1` and a literal UTC seen timestamp before host deactivation. The membership becomes `LEFT`, current participation becomes `REMOVED`, coarse access is deleted, and both legally retained schedule-seen fields remain unchanged. The existing session-trash owner proves the same pair survives the soft-delete retention period, then proves the participant and its seen fact are physically removed by expired-trash purge.

- Initial focused characterization command:

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests 'com.readmates.auth.api.ClubAccessDbTest.real support principal resolves synthetic host but cannot create a membership access fact' \
    --tests 'com.readmates.auth.api.HostMemberLifecycleControllerTest.host deactivates member to left and removes from current session when apply now' \
    --tests 'com.readmates.session.api.HostSessionTrashControllerDbTest.purge removes children after expiry and restore then returns gone'
  ```

  Result: the real-support boundary passed immediately. Both seen-owner tests reached the retained rows and revision assertions, then RED on the timestamp fixture: a raw MySQL datetime literal read through the Asia/Seoul JVM `Timestamp` view as `10:02` rather than the fixture's local `01:02`. This was a test-fixture timezone mismatch, not a lifecycle mutation.

- GREEN command: the same three exact selectors after binding `Timestamp.from(Instant)` for the UTC fixture.

  Result: `3` tests passed. No production code changed in this fix round.

- `./server/gradlew -p server ktlintTestSourceSetCheck`: GREEN.
- `git diff --check`: GREEN.

- Fix-round changed files:
  - `server/src/test/kotlin/com/readmates/auth/api/ClubAccessDbTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/session/api/HostSessionTrashControllerDbTest.kt`
  - `.superpowers/sdd/2026-08-29-host-schedule-seen-stage1/task-8-report.md`
