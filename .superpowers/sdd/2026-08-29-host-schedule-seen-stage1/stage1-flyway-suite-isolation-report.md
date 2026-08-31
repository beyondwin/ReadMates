# Stage 1 Flyway suite-isolation correction report

## Status and scope

- Base: `a469cd869f40783e8d3d9ef533834a47a6a09f61`.
- ADR impact: `none` — this is a test-context isolation correction and adds no durable product or architecture decision.
- Changed surface: only `DevLoginProductionProfileControllerTest` Flyway locations and this report.
- `@ActiveProfiles("prod")`, `readmates.dev.login-enabled=true`, and the assertion that `POST /api/dev/login` returns `404` are unchanged.
- Evidence is repository-local Testcontainers MySQL evidence. No production or deployment state was accessed or changed.

## Root cause

The integration lane reuses one MySQL container across Spring contexts. A dev-seed context applies the repeatable migration under `db/mysql/dev`. The production-profile test then requested only `db/mysql/migration`, so Flyway could not resolve the already-applied dev repeatable migration and rejected the context before the endpoint assertion ran.

The test now resolves both test-suite migration locations. The `prod` profile still owns endpoint availability, so resolving the seed migration does not enable the controller.

## Source hash, command, result, and closure

| Source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Before: `64f643581a8fd9a99400d8e9de976705b69f931c962b2fc442bd88fe4a7ba0a4` | `./server/gradlew -p server integrationTest --rerun-tasks` | RED: `DevLoginProductionProfileControllerTest` failed during context construction with `FlywayValidateException`. The controller stopped this diagnostic lane after the load-bearing failure was captured; it is not claimed as a completed full gate. | Proved the failure occurs after other dev-seed contexts have populated the shared Flyway history and before the `404` assertion can execute. |
| After: `b3b2827f93b4192f722477f41c269c5bc437fcc4ac6464664984d8ed8faf3356` | `./server/gradlew -p server integrationTest --rerun-tasks --tests 'com.readmates.auth.api.DevLoginControllerTest' --tests 'com.readmates.auth.api.DevLoginProductionProfileControllerTest'` | GREEN: exit `0`; `DevLoginControllerTest` passed `10/10`, `DevLoginProductionProfileControllerTest` passed `1/1`. | Both the dev-seed login context and production-profile endpoint denial resolve the same Flyway history; prod still returns `404`. |
| After: `b3b2827f93b4192f722477f41c269c5bc437fcc4ac6464664984d8ed8faf3356` | `./server/gradlew -p server ktlintTestSourceSetCheck --rerun-tasks` | GREEN: exit `0`. | Kotlin test-source formatting is clean. |
| After: `b3b2827f93b4192f722477f41c269c5bc437fcc4ac6464664984d8ed8faf3356` | `git diff --check` | GREEN: exit `0`, no output. | Patch whitespace is clean. |

## Residual risk

- The focused two-class command may execute the production-profile context before the dev-seed context; the suite-order RED and the aligned resolver configuration together close the identified validation mismatch. The controller-owned Stage 1 full integration gate remains the authoritative complete-suite proof.
- No production code, migration, profile condition, security rule, or endpoint contract changed.
- The report contains no private data, secret, deployment identifier, private domain, token-shaped example, or local absolute path.
