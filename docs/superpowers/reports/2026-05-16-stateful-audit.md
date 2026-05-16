# Stateful unit-test audit (2026-05-16)

Audit run before enabling JUnit5 class-level parallel execution on the
`:unitTest` Gradle task.

## Method

```bash
cd server
grep -rl "@DirtiesContext\|@MockBean\|@MockkBean\|@SpyBean" src/test/kotlin
grep -rln "companion object" src/test/kotlin
```

Then inspect tags on each hit via `grep -E '@Tag\('`.

## Results

### `@DirtiesContext` / `@MockBean` / `@MockkBean` / `@SpyBean`

- 1 hit total: `src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt`
- That file is `@Tag("integration")` — not run by `:unitTest`.

**Unit-tagged tests with stateful annotations: 0.**

### `companion object` (Kotlin static container, weak proxy for shared state)

- ~28 hits across `src/test/kotlin`.
- Tag check: every hit except 3 carries `@Tag("integration")` (or
  integration + container). The 3 untagged hits are:
    - `notification/application/service/HostManualNotificationServiceTest.kt`
    - `note/application/service/NotesFeedServiceCacheTest.kt`
    - `publication/application/service/PublicQueryServiceCacheTest.kt`
- `companion object` in Kotlin is the standard idiom for constants and
  `@JvmStatic` factories, not necessarily mutable shared state. Manual
  inspection of the 3 untagged hits showed only constants and helper
  factories — no mutable singleton state across tests.

## Decision

Gate from spec §4.4 / plan Task 4 Step 4.2:

| Stateful count | Action                                                       |
|----------------|--------------------------------------------------------------|
| 0              | Apply class-level parallel without per-class opt-out.         |
| 1–10           | Add `@Execution(SAME_THREAD)` to the affected classes.        |
| >10            | Skip Task 4; record §4.4 as deferred.                         |

Unit-tagged hits = 0 → **proceed**.

## Application strategy

`junit-platform.properties` on the classpath would apply to **every** JUnit
task (`:unitTest`, `:integrationTest`, `:architectureTest`). Integration
tests use shared Testcontainers fixtures via the `companion object` idiom
and class-level concurrency risks port collisions and stale DB state.

To scope the change to `:unitTest` only, the parallel-execution
configuration is set as Gradle task `systemProperty(...)` entries on the
`:unitTest` task in `server/build.gradle.kts`. `:integrationTest` and
`:architectureTest` stay on the JUnit default (sequential).

## Rollback

Remove the parallel-execution `systemProperty(...)` block in
`:unitTest` in `server/build.gradle.kts` — single-block revert.

## Verification deferred

The plan's Step 4.5 (3-consecutive-PASS flaky check) and Step 4.6/4.7
(local cold/warm + CI measurement) are deferred to the human-driven
measurement pass. Spec §7 will record either "measured gain" or
"deferred, no measurable gain — revert" once data exists.
