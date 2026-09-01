# Stage 4 Task 1 report — workbox persistence foundation

## Scope and authority

- Stage start: `d1e51114ba9a47c03f82c49d5f9949ae49c798e1`
- Task brief SHA-256: `74fda61038a4109b099cd9aa937acbc976135d1d707421121b40f661068d5675`
- Stage plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`
- ADR impact: `none`; this task implements the already-Proposed ADR-0048 persistence foundation without changing its decision.
- Acceptance-matrix rows selected: `Persistence or migration` for V62/Flyway/query behavior and `Club context` for exact club plus host-membership ownership. Actor/authorization, cursor collection, BFF/OAuth, UI/runtime and provider rows are excluded because Task 1 adds no route, security policy, cursor, frontend or provider action.

## Source hash -> command -> result -> finding closure

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Stage start `d1e51114...` plus migration catalog through V61 | `find server/src/main/resources/db/mysql/migration -maxdepth 1 -type f -name 'V*.sql' -print \| sort -V \| tail -12` | V61 was the highest version; V62 was free | V62 selected once; no renumber/re-read loop required |
| RED tests written against missing Task 1 contracts | `./server/gradlew -p server unitTest --tests 'com.readmates.hostworkspace.domain.HostWorkItemTest' --tests 'com.readmates.hostworkspace.application.model.HostWorkboxModelsTest'` | Expected `compileTestKotlin` failure for missing `HostWorkItemKey`, deferral, snapshot and adapter contracts | RED proved the requested surface did not already exist |
| Domain/model hashes below | Same focused `unitTest` command | GREEN: 11 tests, 0 failures/errors/skips | Visible-ASCII/255 key bounds, strict-future defer, snapshot uniqueness/metadata and app-relative projection guards closed |
| Migration/adapter hashes below | `./server/gradlew -p server integrationTest --tests 'com.readmates.hostworkspace.adapter.out.persistence.JdbcHostWorkboxAdapterTest' --tests 'com.readmates.support.MySqlFlywayMigrationTest.v62 creates scoped host workbox deferrals and immutable snapshots'` | GREEN: 4 tests, 0 failures/errors/skips | Exact ownership, overwrite, expiry-as-NOW, immutable insert-only snapshot, ordered page reads, expiry and bounded cleanup closed |
| Same integration source | First focused MySQL run | One fixture-construction failure: the test attempted `expiresAt < snapshot.evaluatedAt` | Harness fixture corrected to create the snapshot 20 minutes earlier; no production assertion failed; fresh command above passed |
| Architecture sources plus unchanged baselines | `./server/gradlew -p server ktlintCheck detekt architectureTest` | GREEN; architecture 105 tests, 0 failures/errors/skips | Application/domain zero cross-feature imports and foreign persistence-adapter prohibition closed; formatting/static-analysis clean |
| `boundary-import-baseline.txt` | `shasum -a 256` at Stage start and Task HEAD | both `92883c330541136d3f37e32f1948623689ba9a8b87c6612c0a51b285b4537989` | Baseline byte identity closed |
| `feature-dependency-baseline.txt` | `shasum -a 256` at Stage start and Task HEAD | both `a8d5c9bfb32f1fe1afe372d7fd4ae7c7fa495270936276f5ef27e093765e950c` | Baseline byte identity closed |
| Task 1 changed surface | `git diff --check` and targeted `rg` for local paths, secrets, token-shaped values, email/URL/provider-body/page-history/userId fields | No whitespace error or private value. Matches were limited to the deliberate external-destination rejection and forbidden-field assertions/local-safe seed column names | Public-repo safety closed; projection JSON allowlist excludes forbidden fields and external URLs |

The V62 tables use the repository-standard explicit `utf8mb4_0900_ai_ci` table default while preserving the approved columns, ASCII key/fingerprint columns, FKs, checks and indexes. This keeps the specified composite FKs compatible if a schema default has drifted; it does not add another data contract.

## Per-file SHA-256

| File | SHA-256 |
| --- | --- |
| `server/src/main/resources/db/mysql/migration/V62__host_workbox_deferrals_and_snapshots.sql` | `fd0eacf65539749f9d2929a72ee9ceee168e2c1f3ff0c5786bdbd5a3f26937ed` |
| `server/src/main/kotlin/com/readmates/hostworkspace/domain/HostWorkItem.kt` | `d0ca4e6accc4f0bbea109619fd3424ae8869321e232f67db92a56fecc2897efe` |
| `server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostWorkboxModels.kt` | `b152018f8c957574744a70efb8cfb34ace97ffb6a221647226faab0b51b73983` |
| `server/src/main/kotlin/com/readmates/hostworkspace/application/port/in/HostWorkboxUseCases.kt` | `28e01dee5c65fba40c1e4ca443db7dba0e8df0dfd8202628a1272c9f68596058` |
| `server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostWorkboxPorts.kt` | `b3ac751c856e6e29db10cffbffe3441e256d6282e9e7d2f854cb570c1dd0295f` |
| `server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostWorkboxAdapter.kt` | `ef9132ae54fa59184033beda046324193488d41f2762f9e266ae0b8da2690378` |
| `server/src/test/kotlin/com/readmates/hostworkspace/domain/HostWorkItemTest.kt` | `a6e84b4178b6434f092ff0610b4aafc0cdd26d0c060f1023bbd4e40cedf1fef6` |
| `server/src/test/kotlin/com/readmates/hostworkspace/application/model/HostWorkboxModelsTest.kt` | `504716a1989d4d568459831b9511cf9b26daf78c8acb2d466b38214f948f913d` |
| `server/src/test/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostWorkboxAdapterTest.kt` | `43a61797a326342b87784d72671e18e73a7d59f94191b3ddff7915c29523e525` |
| `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` | `1ed6461eb2746ae5d616558f750264c3286bf4eccfa021fc570153d0b501c212` |
| `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt` | `807fa99262e8fb5687488fd4e1843c336af713d1a54bad3dca9ab6a7c8c897d8` |

## Exclusions and residual scope

- No work-source predicate, derived completion, cursor codec, controller, route, `SecurityConfig`, frontend or notification/email action was implemented.
- Full server CI and the full integration lane are Stage-end evidence, not repeated for this task. Task 1 uses the focused gates above.
- The external untracked `design/mockups/2026-08-30-admin-operations-redesign/` directory remains untouched and unstaged.
