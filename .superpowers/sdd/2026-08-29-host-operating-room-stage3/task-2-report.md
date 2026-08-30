# Stage 3 Task 2 Report — server-owned current-meeting selector

## Status and scope

- BASE verified clean at `885ad503c12f2c89d0cb4d90db54bd409d426cb8`.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- Task brief SHA-256: `096b876676e4403d578227ba4cbdf498a15d20726689a2e7c57dcfab28ce3877`.
- ADR impact: `update` — implements the server selection/composition boundary of Proposed ADR-0048/0049; no new ADR. Both ADRs remain Proposed until the later Stage 3–5 surfaces and active architecture agree.
- Changed behavior is limited to the session candidate query, the new `hostworkspace` composition slice, its host-only GET controller, architecture inventory assertions, and a generic GET BFF proof. No frontend contract/query/loader/route/UI, migration, deployment, or live runtime changed.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

The four named server test classes and the BFF characterization were written before server production code. The initial server RED failed during test compilation because the candidate and `hostworkspace` contracts did not exist. The failure was confined to the new symbols and established the absent feature boundary before implementation. After the minimal model/port/service/adapter/controller/query implementation, the focused server commands passed.

```text
./server/gradlew -p server unitTest --tests 'com.readmates.session.application.service.HostSessionQueryServiceTest' --tests 'com.readmates.hostworkspace.application.service.HostOperatingRoomCurrentServiceTest' --tests 'com.readmates.hostworkspace.api.HostOperatingRoomControllerTest'
```

Result: `10/10` tests passed (`2` session-query service, `6` host-workspace service, `2` controller), `0` failures.

```text
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostOperatingRoomCandidateDbTest'
```

Result: `2/2` tests passed, `0` failures. The first database GREEN attempt exposed invalid direct-fixture visibility values; the fixture was corrected to obey the existing lifecycle/exposure constraints before the final GREEN.

A focused availability hardening RED then added a CLOSED member-visible snapshot. The database test failed `1/2` because CLOSED inherited `AVAILABLE`; narrowing availability to OPEN or qualifying future DRAFT made the same command GREEN at `2/2`. This proves closing selection never revives schedule-seen review.

A second focused RED protected the established OPEN contract: an OPEN active-participant snapshot with legacy revision zero failed `1/2` after the DRAFT hardening. Scoping the positive participant-set revision requirement to DRAFT only restored GREEN at `2/2`; OPEN continues to use its canonical active participant snapshot while DRAFT requires the stronger visibility and revision evidence.

Review fix round 1 closed the explicit cross-club isolation evidence gap without changing production source. The database fixture now creates a distinct second club with higher-priority OPEN, DRAFT, and CLOSED candidates and asserts that none are returned for the requested club. As a mutation RED, the existing `sessions.club_id = ?` predicate was temporarily replaced by a parameter-consuming non-filter; the focused database command failed `1/2` at the candidate-order assertion. The production predicate was restored byte-for-byte, its diff was verified empty, and the same focused test was rerun with `--rerun-tasks`: `2/2` passed. Removing the club predicate now fails deterministically against all three foreign lifecycle classes.

The generic Cloudflare proxy already supported arbitrary safe GET paths, so the new BFF proof was a passing characterization rather than a production BFF change.

```text
<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/cloudflare-bff.test.ts
```

Result: `1` file, `79/79` tests passed, including the new operating-room GET proof.

## Source hash → command → result → finding closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `3aa65bde0f7961463f776621b794d0daef6a4fc1dc129e641188d77566ef68d5` (aggregate session selector source) | focused session service unit tests + focused candidate DB test above | GREEN, `4/4` relevant tests | Active HOST authority is checked before persistence. The session query returns OPEN, future DRAFT, then CLOSED raw candidates with date/time/number/ID tie-breaks, excludes deleted/PUBLISHED/past-DRAFT rows, scopes by club, and does not evaluate closing readiness. |
| `3115b8511abd4fc2143af488101c23585c05f51b8f49ea8d814f189232e8b7ec` (aggregate `hostworkspace` production source) | focused host-workspace service/controller tests above | GREEN, `8/8` relevant tests | OPEN and earliest future DRAFT short-circuit; CLOSED candidates are evaluated newest-first through a dedicated closing-status source port; resolved/published candidates are skipped; an unavailable closing result raises an explicit fail-closed availability error; null remains explicit. |
| `d6643f47d5c50f69e1a50e2ed900e58649e8827f00a455edef0e64b4075f0831` (aggregate session/architecture tests) and `142155f1fd1aab378fd00713dc30e7a42759c108262541835bea0957862e6e0f` (aggregate host-workspace tests) | focused candidate DB test with `--rerun-tasks`; sealed `./server/gradlew -p server architectureTest` evidence for unchanged architecture sources | GREEN, DB `2/2`; sealed architecture `105/105` | A second club's higher-priority OPEN, DRAFT, and CLOSED candidates are all excluded; removing the club predicate produces RED. `hostworkspace` remains registered before its inbound controller. Application imports no foreign ReadMates feature, including `shared`; source adapters may reference foreign application input ports but no foreign adapter. Application feature edges and cycles do not grow. |
| `62f8d477f46c5f84d93227b02c206792998647b6512ae7de14afb44c82e3cb60` (`cloudflare-bff.test.ts`) | focused Vitest above; `<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec eslint tests/unit/cloudflare-bff.test.ts` | GREEN, `79/79`; ESLint exit `0` | The same-origin BFF forwards `GET /api/host/operating-room/current` unchanged with the generic trusted proxy path; no route-specific bypass or browser secret was added. |
| `a8d5c9bfb32f1fe1afe372d7fd4ae7c7fa495270936276f5ef27e093765e950c`, `0a48d0ba93a0483e7e8bb8b4217883eedf0c91275d3b3f61b8f32edf233c0899` (architecture baselines) | `git diff --exit-code -- server/config/architecture/feature-dependency-baseline.txt server/config/architecture/phase-0-approved-feature-dependencies.txt` | exit `0`; both SHA-256 values unchanged | The composition slice introduces no application feature-dependency debt and no baseline exception. |

## Contract closure

- `GET /api/host/operating-room/current` returns `{currentMeeting:{sessionId,selection,scheduleSeenAvailability}|null}` and maps inactive/non-HOST authority to forbidden.
- Selection is server-owned. OPEN wins; otherwise the SQL-ordered earliest future DRAFT wins; otherwise canonical closing status is consulted for ordered CLOSED candidates until one still requires action.
- Closing availability is fail-closed: a partial lookup cannot silently select an older session or emit null.
- Schedule-seen availability is server-owned. OPEN requires an ACTIVE participant snapshot row. A member-visible future DRAFT additionally requires a positive participant-set revision. Host-only, empty, removed-only, revision-zero DRAFT, and all CLOSED snapshots remain unavailable.
- The source adapter consumes canonical `GetHostSessionClosingStatusUseCase` output and does not reproduce record, feedback, notification, or public-readiness predicates.

## Verification notes and residual risk

- `git diff --check`: exit `0`, no findings.
- Targeted local absolute-path, private-key marker, cloud-key prefix, and token-prefix scan over Task 2 files: no findings.
- Review fix round 1 changed only the focused database test and this report. The session selector production source was restored with no diff; already sealed unit, architecture, and BFF evidence was therefore not rerun.
- Full server CI/integration, full frontend lint/test/build, CT, E2E, and public-release gates were intentionally not run under the per-task stop conditions. Frontend Zod/query/loader/route/UI integration remains Task 3 and later Stage 3 work.
