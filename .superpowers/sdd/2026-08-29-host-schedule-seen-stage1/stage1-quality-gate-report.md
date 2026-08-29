# Stage 1 quality-gate report

## Scope

- BASE: `2e93da088c674e85446429e39d9a3c6333763a8c`
- ADR impact: `none` — this is a behavior-preserving style and file-structure correction.

## Reproduction

Source hashes before correction:

| Source | SHA-256 |
| --- | --- |
| `ClubAccessController.kt` | `e863e6f3dc409c94532722d1f53b9354fdc130699b3e40c03dff9345d634d100` |
| `HostSessionQueries.kt` | `1179acaac305884148d250378681a9151dfee01828b48ff6669d0bca80a03234` |
| `HostSessionRowMappers.kt` | `565fac5c980e9bba4ba4ef65fb816525e51380560823fdce14a9a2628a5a7c04` |
| `JdbcCurrentSessionAdapter.kt` | `362c94e5a05a22fdf3569dfdce61fce9d12a51ca5ec9fe6590fb482504e7718c` |
| `HostSessionRevisionModels.kt` | `88e95829d94b7693825800ff3c52ee5b5bc84f05a8ff50a269b79644aab0f66a` |
| `MySqlFlywayMigrationTest.kt` | `24079587f3fa9879df7a933400c18a818d684b5952c1d8f5d41dcab94b7df2e6` |
| `host-contract-zod.test.ts` | `28403ba19da08a44a1d3d3bfa35dee6421652e71b019bcce1ddefb5f7e969bc3` |

| Command | Result |
| --- | --- |
| `./server/gradlew -p server detekt` | Exit 1: five `MaxLineLength` findings and one `TooManyFunctions` finding in the sealed Stage 1 scope. |
| `corepack pnpm --dir front lint` | Exit 1: unused `_scheduleRevision` in `host-contract-zod.test.ts`; two pre-existing Fast Refresh warnings remained warnings. |

## Closure

- Wrapped the five long lines without changing expressions or assertions.
- Moved only the schedule-seen-state mapper to `HostSessionScheduleSeenStateMapper.kt`, reducing `HostSessionRowMappers.kt` from 12 to 11 functions while preserving the future-revision fail-fast branch.
- Replaced the unused destructuring with a typed copy and deletion before the existing Zod rejection assertion.

Source hashes after correction:

| Source | SHA-256 |
| --- | --- |
| `ClubAccessController.kt` | `2dbd579a3ff4d56750ceffea07faec6a387a0bf82f52588b835c4481dfe7e00b` |
| `HostSessionQueries.kt` | `98e753b066bca84d25cc9b5b32115b8ac73d6b20d0efe4cdfba930ee49434613` |
| `HostSessionRowMappers.kt` | `124180c9208d9ada70d19512c5d418543a525df27b61d03da8d692b599c923ed` |
| `HostSessionScheduleSeenStateMapper.kt` | `238c74921f35c95381afb00e6137722d77b9e767bedaac527ac5baa74abaeea0` |
| `JdbcCurrentSessionAdapter.kt` | `ccc315df4177877466f6be813b2ffabbbb524abed0cfef81dca0206909261192` |
| `HostSessionRevisionModels.kt` | `45afca8010a6ce67fe41c25ca6874acff4b80420bf2ec2cdceffddad49d3df42` |
| `MySqlFlywayMigrationTest.kt` | `129482fa22a9dd0bbbb2d0895a0d2d8da6685fb2f95792c698139c99be368a1c` |
| `host-contract-zod.test.ts` | `817980f3469526e2a98363947e734f1c3ec82ae4ca580ae16afce4bb8e20f5da` |

| Command | Result |
| --- | --- |
| `./server/gradlew -p server detekt` | Exit 0. |
| `corepack pnpm --dir front lint` | Exit 0; the same two pre-existing Fast Refresh warnings remain. |
| `git diff --check` | Exit 0. |

## Node runtime confirmation

| Runtime and command | Result |
| --- | --- |
| `node --version` with Node 24 selected | `v24.18.0` |
| Node v24.18.0: `corepack pnpm --dir front lint` | Exit 0; the same two pre-existing Fast Refresh warnings remain. |

## Rounds 2–4: controller formatting correction

- Source before correction: `ClubAccessController.kt` SHA-256 `2dbd579a3ff4d56750ceffea07faec6a387a0bf82f52588b835c4481dfe7e00b`.
- Hypothesis 1: wrap the expression body after `=`. Detekt accepted the shorter lines, but ktlint `function-signature` rejected the wrap because the signature and expression body fit on one line.
- Hypothesis 2: use an explicit-return block body. Detekt accepted the shorter lines, but ktlint rejected the body with `Function body should be replaced with body expression`.
- Hypothesis 3: use a multiline parameter signature. Ktlint rejected the inner-parenthesis whitespace and still required the expression body on the signature line.
- Hypothesis 4: keep the required one-line expression body and shorten only the collaborator from `touchClubAccess` to `accessUseCase`. `./server/gradlew -p server ktlintMainSourceSetCheck detekt` passed ktlint but failed detekt `MaxLineLength`; the resulting line was still 122 characters.
- Closure: restored the descriptive `touchClubAccess` collaborator and renamed only the controller argument from `currentMember` to the repository-standard `member`. The required expression body is now 110 characters with identical command construction and use-case invocation.
- Source after correction: `ClubAccessController.kt` SHA-256 `05084852449c1e9d6bab9085f9d4a78a88065b58cc13a512e893a5c794e2ba41`.

| Source | Command | Result |
| --- | --- | --- |
| `05084852449c1e9d6bab9085f9d4a78a88065b58cc13a512e893a5c794e2ba41` | `./server/gradlew -p server ktlintMainSourceSetCheck detekt` | Exit 0; both ktlint and detekt passed. |

## Round 5: migration fixture formatting correction

- Root cause: ktlint requires the one-parameter private helper signature on one line, while the original `prepareV60ScheduleSeenUpgradeFixture` name exceeded detekt's maximum line length.
- Closure: renamed only the private helper and its call site to `prepareV60ScheduleSeenFixture`, then restored the one-line signature. The fixture body and assertions are unchanged.
- Source after correction: `MySqlFlywayMigrationTest.kt` SHA-256 `966992c5f6ebd23de8633c0ee33ba8dfce332a1c53eea35d3ed9dd412d1fb2eb`.

| Source | Command | Result |
| --- | --- | --- |
| `966992c5f6ebd23de8633c0ee33ba8dfce332a1c53eea35d3ed9dd412d1fb2eb` | `./server/gradlew -p server ktlintTestSourceSetCheck detekt` | Exit 0; both ktlint test source and detekt passed. |
