# Stage 5 Task 4 gate fix 2 report — isolated health integration fixture

## Authority and scope

- Base: `a3a24b668f083b2b7bd013c7af374a96f5cd505c`.
- Fix brief SHA-256: `c9d2b92e2b89a8bf999c8ab7b4abe2252f6f003cb4e80af0c15ea4ca0b55edbf`.
- ADR impact: `none`. No product, architecture, security or operational decision changed.
- This is a test-fixture-only correction. Production source, migrations, startup validators, unrelated tests/docs and the external mockup tree remain unchanged.

## Root cause and correction

`HealthControllerTest` intentionally disables Spring Boot Flyway so it can assert that the health surface does not require a Flyway bean at runtime. Its inherited datasource fixture registered a fresh shared MySQL Testcontainer but did not migrate it. The class therefore depended on another integration class having migrated the shared container earlier in the same worker. In exact isolation, `MutationIdempotencyStartupValidator` queried `mutation_idempotency_keys` during ApplicationContext creation and all four health tests failed before their assertions ran.

The fixture now owns both steps before context refresh: it asks `MySqlTestContainer` to apply the production MySQL migration location and then registers that same container as the Spring datasource. Flyway remains disabled inside the ApplicationContext, so the existing health assertion is unchanged; production startup validators still run against the migrated schema and no production behavior is weakened.

The regression would fail if the fixture stopped migrating the exact datasource it registers, if the production migrations no longer produced the validator tables, or if health/security behavior changed after the isolated context started.

## TDD and focused evidence

| Source hash | Literal command | Result | Finding closure |
| --- | --- | --- | --- |
| Base Health test `c1e4e8c509bfc83d61a2b5c23316ff75d10495426a2927d563bd9e8554c861b4`; base MySQL support `2d9f7619ead94ff8b23ad142e1d71b8a9bfd6d626f79a79ae0590efc8de3017a` | `./server/gradlew -p server integrationTest --rerun-tasks --tests 'com.readmates.shared.adapter.in.web.HealthControllerTest'` | Expected RED: 4/4 failed during context startup; root cause was `Table 'readmates.mutation_idempotency_keys' doesn't exist`. | Reproduced the exact order-dependent gate failure on the base fixture rather than relying on the preceding full-suite order. |
| Final fixture sources sealed by the delta manifest | `./server/gradlew -p server integrationTest --rerun-tasks --tests 'com.readmates.shared.adapter.in.web.HealthControllerTest'` | GREEN: 4/4, `BUILD SUCCESSFUL`. Compilation also emitted unchanged deprecation/redundant-annotation warnings in unrelated test files. | The exact class now migrates and starts independently while retaining all liveness, actuator authorization and Flyway-disabled assertions. |
| Final Health test `17bb1ff7d28348d66be4ce2d8b424e350fe2b2cc12b47b5e05e0081bcdcc7ac6`; final MySQL support `6a9445a377262b8d7f41f9664ff61fa4ec00a46e10d57b4cd10c4a32a2fce261` | `./server/gradlew -p server ktlintTestSourceSetCheck --no-configuration-cache` | GREEN: `BUILD SUCCESSFUL`. | Kotlin test-source formatting passed for the changed fixture surface. |
| Final scoped delta | `git diff --check -- server/src/test/kotlin/com/readmates/shared/adapter/in/web/HealthControllerTest.kt server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-brief.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-report.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-manifest.sha256` | GREEN: exit `0`, no output. | The scoped product/evidence delta has no whitespace errors. |
| Delta manifest | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-manifest.sha256` | GREEN: 3/3 entries `OK`. | The brief and both changed fixture sources are sealed together. |
| Same scoped sources and evidence artifacts | `python3 -c 'import pathlib,re,sys; pattern=re.compile("|".join(["/"+"Users"+"/","/"+"home"+"/","https?"+"://","BEGIN "+"PRIVATE KEY","AK"+"IA[0-9A-Z]{16}","sk"+"-[A-Za-z0-9]{32,}"])); hits=[f"{path}:{number}:{line}" for path in sys.argv[1:] for number,line in enumerate(pathlib.Path(path).read_text().splitlines(),1) if pattern.search(line)]; print("\n".join(hits)); raise SystemExit(bool(hits))' .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-brief.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-report.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-4-gate-fix-2-manifest.sha256 server/src/test/kotlin/com/readmates/shared/adapter/in/web/HealthControllerTest.kt server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt` | GREEN: no matches. `gitleaks` was unavailable, so no gitleaks result is claimed. | No machine-local path, private-domain URL, private-key marker or common secret-shaped value was persisted in the scoped delta/evidence. |

## Deliberately not run

Per the fix brief, no broad server/frontend suite, build, E2E, CT, public-release, provider, OAuth, email, club-end, deploy, tag, PR or push command ran. The controller can resume the interrupted Stage 5 gate after fresh scoped review.
