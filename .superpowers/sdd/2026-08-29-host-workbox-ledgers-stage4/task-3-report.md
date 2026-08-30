# Stage 4 Task 3 report — privacy-safe host person detail API

## Authority and boundary

- Base: `13b2efc5c068f44f6cd24f00e14050888e0f6d68`
- Task brief SHA-256: `becc8831829e8f057849a0cd87e480e9481fbd4908229bb0c01ea62586f408af`
- Stage 4 plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`
- Proposed ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`
- ADR impact: `none`; this task implements the approved read contract without adding or changing a durable decision.
- Migration tail remained `V63`; this read-only task added no migration.
- Scope stayed inside the host-person detail server vertical slice, frontend contract/client/query, generic BFF proof, deterministic fixtures, and focused tests. No route/UI, invitation/settings, workbox aggregation, mutation, provider, or deployment surface was added.
- The external untracked `design/mockups/2026-08-30-admin-operations-redesign/` tree was not read, modified, or staged.

## Result

`GET /api/host/people/{membershipId}?attendanceCursor=...&limit=20` now returns a directly queried, club-scoped host-person aggregate through the one-way boundary `controller -> input port/service -> output query port -> JDBC adapter`. The current membership must resolve as an ACTIVE HOST, and malformed IDs, invalid limits, authority loss, missing or cross-club targets, and invalid cursors use controlled errors.

The response is restricted to membership identity/display fields, coarse club access, current schedule/RSVP, and server-paged attendance. It does not serialize user/account/auth/page/duration/network/provider/token data. Club access comes only from `membership_club_access.last_access_at`, is truncated to the hour, and terminal memberships mask display/avatar and clear access/current participation fields.

Attendance uses `limit + 1` keyset pagination with a stable descending schedule-time/session-number/session-ID tuple. Its dedicated HMAC cursor binds purpose/version, club, current host membership, target membership, evaluated/expiry time, signing-key version, and the last tuple; strict canonical parsing rejects tamper, malformed payloads, cross-club/host/person reuse, expiry, retired keys, and host-list-purpose cursors while accepting current and configured previous keys.

The frontend adds strict recursive Zod parsing, an encoded GET client, and TanStack Query identity containing club, person, and continuation parameters. The existing generic BFF remains unchanged and is covered for encoded path/query forwarding plus trusted club context.

## RED evidence

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Brief `becc883...` at base `13b2efc5` | `./server/gradlew -p server unitTest --tests com.readmates.hostworkspace.application.service.HostPersonDetailServiceTest --tests com.readmates.hostworkspace.api.HostPersonDetailControllerTest` | RED at test compilation: the host-person models, query/input ports, service, cursor, controller, and adapter did not exist. | Closed by the additive hostworkspace vertical slice and focused server GREEN below. |
| Same brief/base | Node 24 + `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/api/host-person-api.test.ts features/host/queries/host-person-queries.test.ts` | RED: both co-located tests could not resolve the new contract/client/query modules. | Closed by the strict Zod contract, feature client, query keys/options, and frontend GREEN below. |
| Service test delta | Focused terminal-membership service test | RED because terminal membership still exposed the prior avatar. | Closed by terminal display/avatar masking and clearing access/current schedule/current RSVP; the full 3-test service class is GREEN. |

## GREEN and safety ledger

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Runtime manifest `2ab99675036a9d2bc30feb5aad32ae447494e5f27a6ee7ad9323d6eca88b95d5` | `./server/gradlew -p server unitTest --tests com.readmates.hostworkspace.application.service.HostPersonDetailServiceTest --tests com.readmates.hostworkspace.api.HostPersonDetailControllerTest --rerun-tasks --no-configuration-cache` | GREEN, 8/8 | Active-host/direct-query behavior, terminal lifecycle, privacy allowlist, first/continuation/last cursor behavior, controlled 403/404, malformed/tampered/cross-boundary/expired/key-rotation/purpose cursor cases are closed. |
| Same manifest | `./server/gradlew -p server integrationTest --tests com.readmates.hostworkspace.adapter.out.persistence.JdbcHostPersonDetailAdapterTest --tests 'com.readmates.contract.FrontendFixtureContractTest*host person detail*' --tests 'com.readmates.contract.FrontendZodSchemaContractTest*host person detail*' --rerun-tasks --no-configuration-cache` | GREEN, 5/5 | Exact `(clubId, membershipId)` lookup, access provenance, lifecycle, stable no-gap/no-duplicate persistence pagination, response fixture allowlist, and strict server/Zod shape are closed. |
| Same manifest | Node 24 + pinned Corepack pnpm focused Vitest command for `host-person-api.test.ts`, `host-person-queries.test.ts`, and `cloudflare-bff.test.ts` | GREEN, 3 files and 83/83 tests | Encoded client path/query, strict recursive parsing, query identity, no member-list dependency, and generic BFF trusted-club forwarding are closed. |
| Same manifest | Node 24 + pinned Corepack pnpm exact ESLint over the seven changed frontend TypeScript files | Exit 0, no findings | Changed frontend source and tests are lint-clean. |
| Same manifest | Run `zod:export-fixtures`, capture the Zod-fixture diff, rerun the exporter, capture again, `cmp` both diffs | Exit 0; both exports identical | Deterministic strict fixture generation is closed. |
| Same manifest | `./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureInventoryTest --no-configuration-cache` | GREEN, 23/23 | Inventory remains exact after the new hostworkspace tests. |
| Same manifest | `./server/gradlew -p server architectureTest --tests '*host workspace composition keeps foreign features behind outbound input-port adapters*' --no-configuration-cache` | GREEN, 1/1 | Hostworkspace keeps the approved one-way dependency boundary and imports no foreign persistence adapter. |
| Same manifest | `./server/gradlew -p server ktlintMainSourceSetCheck ktlintTestSourceSetCheck --rerun-tasks --no-configuration-cache` with Task 3 path filtering | Overall exit 1 from pre-existing base Task 2 notification formatting findings; zero Task 3 findings. | Task 3 ktlint surface is clean; unrelated base findings were not changed under the scoped-repeat rule. |
| Same manifest | `./server/gradlew -p server detekt --rerun-tasks --no-configuration-cache` with Task 3 path filtering | Overall exit 1 from seven pre-existing base findings in Task 2 notification/contract code; zero Task 3 findings. | Task 3 detekt surface is clean; unrelated base findings were not changed under the scoped-repeat rule. |
| Same manifest | Targeted absolute/private path, cloud-ID, private-key, access-key, assigned-secret, and forbidden production-response-field scans over all 21 runtime/test/fixture files | No private path, real key, cloud ID, or forbidden production field. Only two pre-existing synthetic BFF secret test values outside the Task 3 hunk matched. | Public-repository safety and response allowlist claims are closed. |
| Same manifest | `git diff --check` and final cached diff check | Exit 0 | Task 3 whitespace and staged content are clean. |

Per the task brief, full frontend/server/CT/E2E/public-release and live/provider verification remain deferred to the Stage 4 and merged-main gates. No email, push, provider, deployment, production runtime, or migration action was performed.

## Per-file SHA-256

The following 21-line manifest covers every runtime, test, exporter, and fixture file in Task 3. Its own SHA-256 is `2ab99675036a9d2bc30feb5aad32ae447494e5f27a6ee7ad9323d6eca88b95d5`. The report is excluded to avoid a self-referential hash; the brief hash is recorded above.

```text
670d24a17b9e8ded5c7bba9a80361515848c1bfea00d0c3088c9307427f61e5f  front/features/host/api/host-person-api.test.ts
e305d088cd70e517ebfbdc643fe195df1966d91d029b983402fb67b3e8bdeffc  front/features/host/api/host-person-api.ts
c4bf41217ae39095eb3dd90d8914ffb54c765089b802e7bc1d32d6a3cdaebc80  front/features/host/api/host-person-contracts.ts
4ed5d1961645496c3a6f216e147d2af66d95a59052caae55bebede0e25fe5ceb  front/features/host/queries/host-person-queries.test.ts
4327e91a1f59e35592fdf603908cc3c4ec44c356a6bd6bd2a1266981ab99b27b  front/features/host/queries/host-person-queries.ts
deebd4d8fbe6b2e335a93cb1c1ba4aec7dc7b04f7da460186f8b5b635f056a2c  front/scripts/export-zod-fixtures.ts
0e81aefa69bd3fbd0a46e789a4ad857e2fd57765609743bde0e8f3c34d195a51  front/tests/unit/__fixtures__/host-person-detail.json
0e81aefa69bd3fbd0a46e789a4ad857e2fd57765609743bde0e8f3c34d195a51  front/tests/unit/__fixtures__/zod-schemas/host-person-detail.json
c0568520502e10fdcaad61371c2dc8153e757fb32a552b660a1a109ea7c0c79b  front/tests/unit/cloudflare-bff.test.ts
7223836a59249d4ac7782d6a8ad480034561bec7e4721f8a8613f4af250c547b  server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostPersonCursorCodec.kt
36334e3c0b7b0c212860f387742e2bad34710dc1092e3c32796328371e4de8e8  server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostPersonDetailController.kt
9a80ba11c28cd0073f5087727cdd3d74066f56f2917baa9ca9bcd5d9457f75c3  server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostPersonDetailAdapter.kt
b38852dbc2998d93f8cccbc5eeb082bca34cd0fdc90d5fc0874b990ccd56573b  server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostPersonDetailModels.kt
a979a86217f33f736333d7e0d3c6ffe48e422ca91ece8251c40a54826901a31e  server/src/main/kotlin/com/readmates/hostworkspace/application/port/in/GetHostPersonDetailUseCase.kt
aea396096e8b49a3d0655b87a35ee3ceb3857a4d5c0d000e7b8775c175e9003a  server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostPersonDetailQueryPort.kt
7c8643f38666825526d403473b4715aa423c285e2df114c63107ab5ca1a92344  server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostPersonDetailService.kt
66b1948f4e591ae07ce0c36ecaf0c7dfe2d980b614a94bd47038b7936f3618c0  server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt
3873e959304664ee93b0225538b6cb25b4129f43090a77b00c879530f02882d2  server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt
89481ad3195bcc0dbe7745d1dee85a94211cc8c2070e5d2016d42a0571c7e384  server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostPersonDetailAdapterTest.kt
2f67a065c4e45168dd15357e649c15aa9b169f4a80945971f233726371778adf  server/src/test/kotlin/com/readmates/hostworkspace/api/HostPersonDetailControllerTest.kt
2cc72d8a4805d7194f193dcf380efb73f104b8e974a7ab702199a3dd4b1ebaa4  server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostPersonDetailServiceTest.kt
```

## Finding closure

| Load-bearing finding | Closure |
| --- | --- |
| A person detail could be assembled by scanning the paged member list or crossing feature persistence boundaries. | The service issues one exact hostworkspace-owned query by club and target membership; architecture inventory/boundary tests pass. |
| Host authority or URL club context could be bypassed. | `CurrentMember.isHost` requires ACTIVE HOST, service fails before query on authority loss, target query includes trusted club ID, and controlled 403/404 plus cross-club-not-found behavior are tested. |
| Response or access telemetry could expose private identity/activity data. | Explicit DTO/Zod allowlists, forbidden-key assertions/scans, membership-club-access-only SQL, hourly truncation, and terminal lifecycle masking close the privacy boundary. |
| Attendance continuation could duplicate, skip, or cross club/host/person/purpose/key lifetime boundaries. | Stable keyset tuple plus `limit + 1`, evaluated anchor, strict canonical HMAC cursor, persistence continuity test, and cursor boundary/rotation tests close the paging boundary. |
| Frontend/server contract drift or BFF trust drift could be accepted silently. | Strict Zod parsing, deterministic dual fixtures, two server contract tests, frontend API/query tests, and generic BFF proof close the contract boundary. |

Status: `READY`. No load-bearing Task 3 finding remains open.

## Review round 1 — mutation-bound attendance continuation

- Review base: `79cd9fd63c13a3d9b16bbd05ec68ce23891238e1`
- Finding: the first implementation ordered attendance by mutable `session_date`/`start_time`, while its `evaluatedAt` anchor limited only row creation. A reschedule could move an already emitted row below the old tuple and duplicate it; reopen/close could remove or insert a pending row and create a gap.
- ADR impact remains `none`; this is a correctness repair to the approved signed continuation contract. No migration or response-wire change was introduced.

Cursor v2 now binds a strict lowercase SHA-256 history fingerprint. The fingerprint is domain-separated and length-framed, and covers target membership lifecycle/role plus every pre-anchor target participation's session identity/number/state/date/time/deletion/revisions and participant identity/status/attendance/revision. The adapter recomputes and compares it in the same MySQL `REPEATABLE_READ` transaction as the page query. Any relevant mutation fails closed as controlled `INVALID_CURSOR` before returning attendance rows. Both session and participant creation times are anchored, while the existing schedule-time/session-number/session-ID total order remains the unchanged-generation continuation order.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Review base `79cd9fd6`; two new MySQL mutation tests | `./server/gradlew -p server integrationTest --tests '*continuation fails closed when an emitted attendance session is rescheduled*' --tests '*continuation fails closed when a pending attendance session is reopened*' --no-configuration-cache` | RED, 2 tests run and 2 failed at the expected no-exception assertions: both corrupted continuations returned instead of failing closed. | Proved reschedule duplication and lifecycle omission were not protected by the original `evaluatedAt` anchor. |
| Review delta manifest `c2ac279a8d6308727aab24a3ca4d97e55f3dbe0e8bfcfd3b160b167773b81ee8` | Same exact two-test command after the fingerprint implementation | GREEN, 2/2 | Both changed-generation continuations now fail closed before page return. |
| Same manifest | `./server/gradlew -p server integrationTest --tests com.readmates.hostworkspace.adapter.out.persistence.JdbcHostPersonDetailAdapterTest --rerun-tasks --no-configuration-cache` | Fresh GREEN, 5/5 | Existing direct lookup, access provenance, lifecycle, unchanged-generation no-gap/no-duplicate pagination, and both mutation regressions pass against real MySQL. |
| Same manifest | `./server/gradlew -p server unitTest --tests com.readmates.hostworkspace.application.service.HostPersonDetailServiceTest --tests com.readmates.hostworkspace.api.HostPersonDetailControllerTest --no-configuration-cache` | GREEN, 8/8 | Fingerprint propagation and signed v2 cursor decoding preserve privacy, auth, purpose, expiry and key-rotation behavior. |
| Same manifest | `./server/gradlew -p server architectureTest --tests '*host workspace composition keeps foreign features behind outbound input-port adapters*' --no-configuration-cache` | GREEN, 1/1 | The repair remains inside the hostworkspace-owned query boundary. |
| Same manifest | Focused Task 3 filtering after fresh `ktlintMainSourceSetCheck ktlintTestSourceSetCheck` and `detekt` reruns | Zero Task 3 findings. Overall commands still exit 1 only from the sealed base Task 2 notification/contract findings recorded above. | The eight-file review delta is style/static-analysis clean without reopening unrelated findings. |
| Same manifest | `git diff --check` and final cached diff check | Exit 0 | Review delta whitespace is clean. |

Frontend, BFF and response-contract tests were not rerun because the explicit response DTO and Zod/wire schema are byte-for-byte unchanged; the history fingerprint is internal and exists only inside the signed opaque cursor. Full Stage gates remain deferred as before.

The following eight-file manifest supersedes the changed-file hashes from the original 21-file manifest. Its own SHA-256 is `c2ac279a8d6308727aab24a3ca4d97e55f3dbe0e8bfcfd3b160b167773b81ee8`; the report is excluded to avoid self-reference.

```text
989030d765a86b9e4bfb458cf942ef939890e6371db12d9066c471eadb048555  server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostPersonCursorCodec.kt
edc069814c0a215720c0ab5352d4e32ae20a40445fd6132fc74a3dcbe79315f4  server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostPersonDetailController.kt
61beb23f90612b9c384d377cba60056fcb77e60c1c965f3d370178e81c18ab0c  server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostPersonDetailAdapter.kt
bfef7a8991e1054af32fccf1c3b6c0564edd1d9919c61bb5bfd2eca6283fef3f  server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostPersonDetailModels.kt
0fdcff5e4727077faef4fabac2669a1177ff3edb6c2429a9cf014b50f324c3f7  server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostPersonDetailService.kt
e9e8f1f4fe5c50c15dc72541ba2ed9c9f1deda266de39148ac62c36e87a0e8f4  server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostPersonDetailAdapterTest.kt
36cc6f5906d5a98b517d5a0409fd5f3b4990684a2ad78856fda7d332bf889f15  server/src/test/kotlin/com/readmates/hostworkspace/api/HostPersonDetailControllerTest.kt
c602f664ab10f0c3a103bcfff3a9db832b2cab27f30c08b3c3236eaa59bbe52a  server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostPersonDetailServiceTest.kt
```

Review round 1 finding status: `CLOSED`. No new load-bearing claim remains.
