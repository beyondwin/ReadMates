# ReadMates Test Runtime Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ReadMates test execution faster and more predictable by fixing JVM drift, adding server fast lanes, consolidating Spring integration test setup, reducing E2E setup overhead, and splitting Vitest node/jsdom work.

**Architecture:** Keep the existing single Spring Boot server module and Vite frontend. Add test-runtime configuration and support helpers around the current tests instead of reducing coverage or changing product behavior. Full `clean test`, frontend unit/build, and E2E checks remain the release baseline.

**Tech Stack:** Kotlin 2.2, Spring Boot 4, Gradle 9.1, JUnit 5, Testcontainers, MySQL, Redis, Kafka, React 19, Vite 8, Vitest 3.2.4, Playwright.

---

## File Map

- Modify: `server/build.gradle.kts`
  - Force server test JVM to Java 21 and add `unitTest`, `integrationTest`, `architectureTest` fast lanes.
- Create: `server/src/test/kotlin/com/readmates/support/ReadmatesSpringTestSupport.kt`
  - Provides shared Spring Boot integration annotations and Testcontainers base classes.
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
  - Adds `@Tag("architecture")`.
- Modify: selected `server/src/test/kotlin/**` Spring Boot integration tests
  - Replaces repeated `@SpringBootTest` and datasource registration with shared support.
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
  - Adds SQL builder helpers and batched E2E reset entry point.
- Modify: selected `front/tests/e2e/*.spec.ts`
  - Uses batched reset helper where setup currently calls multiple MySQL subprocesses.
- Modify: `front/playwright.config.ts`
  - Adds opt-in `PLAYWRIGHT_WORKERS` without changing the safe default of 1.
- Modify: `front/vitest.config.ts`
  - Splits node and jsdom test projects using Vitest `projects`.
- Modify: `docs/development/test-guide.md`
  - Documents JDK 21 runtime expectation and new fast-lane commands.

## Task 1: Pin Server Test Runtime To JDK 21

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `docs/development/test-guide.md`

- [ ] **Step 1: Add a Java 21 launcher for tests**

In `server/build.gradle.kts`, add this after `val colimaDockerSocket = ...` and before the `tasks.withType<Test>` block:

```kotlin
val serverTestJavaLauncher = javaToolchains.launcherFor {
    languageVersion.set(JavaLanguageVersion.of(21))
}
```

- [ ] **Step 2: Apply the launcher to every Test task**

In the existing `tasks.withType<Test>` block, preserve the current body and add this line near the top:

```kotlin
javaLauncher.set(serverTestJavaLauncher)
```

The block should contain these runtime essentials:

```kotlin
tasks.withType<Test> {
    useJUnitPlatform()
    javaLauncher.set(serverTestJavaLauncher)
    jvmArgs("-Xshare:off")
    systemProperty(
        "readmates.frontend.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__").absolutePath,
    )
    systemProperty(
        "readmates.frontend.zod.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__/zod-schemas").absolutePath,
    )

    if (System.getenv("DOCKER_HOST").isNullOrBlank() && colimaDockerSocket.exists()) {
        environment("DOCKER_HOST", "unix://${colimaDockerSocket.absolutePath}")
        environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
    }
}
```

If the current branch already contains an `excludeTestsMatching("*$*")` filter, keep it in the block unless a targeted run proves it hides valid nested tests.

- [ ] **Step 3: Verify the targeted server test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.domain.MembershipStatusTest --info
```

Expected:

- `BUILD SUCCESSFUL`.
- The `--info` output shows a Java 21 executable for the test process.

- [ ] **Step 4: Verify the full server suite**

Run:

```bash
./server/gradlew -p server clean test
```

Expected:

- `BUILD SUCCESSFUL`.
- No `NoClassDefFoundError` cascade.
- No Gradle `output.bin.idx` failure.

- [ ] **Step 5: Update test guide**

In `docs/development/test-guide.md`, under `## Backend`, add:

```markdown
Backend tests are expected to run on JDK 21. `server/build.gradle.kts` pins the Gradle `Test` JVM to the Java 21 toolchain so local shells using a newer current JVM do not change test runtime behavior. If Gradle cannot find a JDK 21 toolchain locally, install one or set `JAVA_HOME` to a JDK 21 installation before running backend tests.
```

- [ ] **Step 6: Commit**

Run:

```bash
git add server/build.gradle.kts docs/development/test-guide.md
git commit -m "test: pin server test runtime to JDK 21"
```

Expected: commit succeeds. If commits are deferred in the active branch, stage only these files and record the deferral in the handoff.

## Task 2: Add Server Test Fast Lanes

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `docs/development/test-guide.md`

- [ ] **Step 1: Extract shared Test task configuration**

Replace the current `tasks.withType<Test>` body with a helper plus `configureEach`:

```kotlin
fun Test.configureReadmatesTestRuntime() {
    useJUnitPlatform()
    javaLauncher.set(serverTestJavaLauncher)
    jvmArgs("-Xshare:off")
    systemProperty(
        "readmates.frontend.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__").absolutePath,
    )
    systemProperty(
        "readmates.frontend.zod.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__/zod-schemas").absolutePath,
    )

    if (System.getenv("DOCKER_HOST").isNullOrBlank() && colimaDockerSocket.exists()) {
        environment("DOCKER_HOST", "unix://${colimaDockerSocket.absolutePath}")
        environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
    }
}

tasks.withType<Test>().configureEach {
    configureReadmatesTestRuntime()
}
```

If the current `test` task has a filter for generated Kotlin nested classes, preserve it in `configureReadmatesTestRuntime()`.

- [ ] **Step 2: Register `unitTest`**

Add this after the `tasks.withType<Test>().configureEach` block:

```kotlin
tasks.register<Test>("unitTest") {
    description = "Runs ReadMates unit tests without Spring/Testcontainers integration tags."
    group = "verification"
    configureReadmatesTestRuntime()
    useJUnitPlatform {
        excludeTags("integration", "container", "architecture")
    }
}
```

- [ ] **Step 3: Register `integrationTest`**

Add:

```kotlin
tasks.register<Test>("integrationTest") {
    description = "Runs ReadMates Spring Boot and Testcontainers integration tests."
    group = "verification"
    configureReadmatesTestRuntime()
    shouldRunAfter("unitTest")
    useJUnitPlatform {
        includeTags("integration", "container")
    }
}
```

- [ ] **Step 4: Register `architectureTest`**

Add:

```kotlin
tasks.register<Test>("architectureTest") {
    description = "Runs ReadMates ArchUnit architecture boundary tests."
    group = "verification"
    configureReadmatesTestRuntime()
    shouldRunAfter("unitTest")
    useJUnitPlatform {
        includeTags("architecture")
    }
}
```

- [ ] **Step 5: Verify task graph**

Run:

```bash
./server/gradlew -p server unitTest integrationTest architectureTest --dry-run
```

Expected:

- `BUILD SUCCESSFUL`.
- Gradle lists all three tasks.

- [ ] **Step 6: Document fast lanes**

In `docs/development/test-guide.md`, under `## Backend`, add:

````markdown
For faster local feedback, backend tests are also grouped into fast lanes:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest
./server/gradlew -p server architectureTest
```

These commands do not replace the release baseline. Before shipping backend changes, still run:

```bash
./server/gradlew -p server clean test
```
````

- [ ] **Step 7: Commit**

Run:

```bash
git add server/build.gradle.kts docs/development/test-guide.md
git commit -m "test: add backend test fast lanes"
```

Expected: commit succeeds or is intentionally deferred.

## Task 3: Tag Architecture Tests

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Add JUnit tag import**

Add:

```kotlin
import org.junit.jupiter.api.Tag
```

- [ ] **Step 2: Tag the class**

Change the class declaration to:

```kotlin
@Tag("architecture")
class ServerArchitectureBoundaryTest {
```

- [ ] **Step 3: Verify architecture fast lane**

Run:

```bash
./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Verify unit lane excludes architecture**

Run:

```bash
./server/gradlew -p server unitTest --dry-run
```

Expected: task graph succeeds. Full exclusion correctness is verified after all tags are applied.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "test: tag server architecture boundary tests"
```

Expected: commit succeeds or is intentionally deferred.

## Task 4: Add Shared Spring Integration Test Support

**Files:**
- Create: `server/src/test/kotlin/com/readmates/support/ReadmatesSpringTestSupport.kt`
- Test: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt`

- [ ] **Step 1: Create support file**

Create `server/src/test/kotlin/com/readmates/support/ReadmatesSpringTestSupport.kt`:

```kotlin
package com.readmates.support

import org.junit.jupiter.api.Tag
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@Tag("integration")
annotation class ReadmatesDbIntegrationTest

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.redis.enabled=true",
        "management.health.redis.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
annotation class ReadmatesRedisIntegrationTest

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "spring.kafka.consumer.auto-offset-reset=earliest",
    ],
)
@Tag("integration")
@Tag("container")
annotation class ReadmatesKafkaIntegrationTest

abstract class ReadmatesMySqlIntegrationTestSupport {
    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

abstract class ReadmatesRedisIntegrationTestSupport : ReadmatesMySqlIntegrationTestSupport() {
    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerRedisProperties(registry: DynamicPropertyRegistry) {
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}

abstract class ReadmatesKafkaIntegrationTestSupport : ReadmatesMySqlIntegrationTestSupport() {
    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.kafka.bootstrap-servers") { KafkaTestContainer.container.bootstrapServers }
        }
    }
}
```

- [ ] **Step 2: Verify support file compiles**

Run:

```bash
./server/gradlew -p server compileTestKotlin
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Convert one MySQL representative test**

In `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`:

1. Replace the `@SpringBootTest(...)` annotation with:

```kotlin
@ReadmatesDbIntegrationTest
```

2. Make the class extend the shared support:

```kotlin
class HostDashboardControllerTest : ReadmatesMySqlIntegrationTestSupport() {
```

3. Remove the class-local datasource-only `@DynamicPropertySource` method if it only called `MySqlTestContainer.registerDatasourceProperties(registry)`.

4. Add imports:

```kotlin
import com.readmates.support.ReadmatesDbIntegrationTest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
```

- [ ] **Step 4: Verify representative MySQL test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostDashboardControllerTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Convert one Redis representative test**

In `server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt`:

1. Replace the Spring annotation with:

```kotlin
@ReadmatesRedisIntegrationTest
```

2. Make the class extend:

```kotlin
class RedisAuthSessionCacheAdapterTest : ReadmatesRedisIntegrationTestSupport() {
```

3. Keep any class-local dynamic properties that are not provided by `ReadmatesRedisIntegrationTestSupport`.

- [ ] **Step 6: Verify Redis representative test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.auth.adapter.out.redis.RedisAuthSessionCacheAdapterTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Convert one Kafka representative test**

In `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`:

1. Replace the Spring annotation with:

```kotlin
@ReadmatesKafkaIntegrationTest
```

2. Make the class extend:

```kotlin
class NotificationKafkaPipelineIntegrationTest : ReadmatesKafkaIntegrationTestSupport() {
```

3. Keep any test-specific Kafka consumer group/topic properties that are unique to the class.

- [ ] **Step 8: Verify Kafka representative test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 9: Commit**

Run:

```bash
git add server/src/test/kotlin/com/readmates/support/ReadmatesSpringTestSupport.kt \
  server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt \
  server/src/test/kotlin/com/readmates/auth/adapter/out/redis/RedisAuthSessionCacheAdapterTest.kt \
  server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt
git commit -m "test: add shared Spring integration test support"
```

Expected: commit succeeds or is intentionally deferred.

## Task 5: Migrate Remaining Spring Integration Tests In Small Batches

**Files:**
- Modify: `server/src/test/kotlin/**`

- [ ] **Step 1: List remaining direct `@SpringBootTest` usage**

Run:

```bash
rg -n "@SpringBootTest|@DynamicPropertySource" server/src/test/kotlin
```

Expected: output lists remaining classes that still need migration.

- [ ] **Step 2: Convert MySQL-only tests in one package**

Start with one package, for example `server/src/test/kotlin/com/readmates/session/api`.

For each MySQL-only class:

```kotlin
@ReadmatesDbIntegrationTest
class ClassName : ReadmatesMySqlIntegrationTestSupport() {
    // existing tests
}
```

Remove only datasource-only dynamic property methods.

- [ ] **Step 3: Run package-level integration tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.*'
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Repeat by package**

Repeat Step 2 and Step 3 for:

```text
com.readmates.archive.api
com.readmates.auth.api
com.readmates.club.api
com.readmates.contract
com.readmates.feedback.api
com.readmates.note.api
com.readmates.notification.api
com.readmates.notification.adapter.out.persistence
com.readmates.performance
com.readmates.publication.api
com.readmates.support
```

Expected: each package-level run passes before moving to the next package.

- [ ] **Step 5: Verify all fast lanes**

Run:

```bash
./server/gradlew -p server unitTest integrationTest architectureTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Verify full compatibility**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

Run:

```bash
git add server/src/test/kotlin
git commit -m "test: consolidate Spring integration test setup"
```

Expected: commit succeeds. Use a narrower `git add` list if unrelated user changes exist under `server/src/test/kotlin`.

## Task 6: Batch E2E Database Reset Helpers

**Files:**
- Modify: `front/tests/e2e/readmates-e2e-db.ts`

- [ ] **Step 1: Extract SQL builders**

In `front/tests/e2e/readmates-e2e-db.ts`, add these private helpers next to the existing cleanup functions:

```ts
function resetSeedGoogleLoginsSql(emails: string[]) {
  const emailList = sqlEmailList(emails);

  return `
update users
set google_subject_id = ${seedGoogleSubjectCase(emails)},
    auth_provider = 'GOOGLE',
    updated_at = utc_timestamp(6)
where lower(email) in (${emailList});
`;
}

function cleanupGeneratedSessionsSql() {
  return `
delete from feedback_reports
where session_id in (select id from sessions where session_number >= 900);

delete from session_feedback_documents
where session_id in (select id from sessions where session_number >= 900);

delete from public_session_publications
where session_id in (select id from sessions where session_number >= 900);

delete from highlights
where session_id in (select id from sessions where session_number >= 900);

delete from one_line_reviews
where session_id in (select id from sessions where session_number >= 900);

delete from long_reviews
where session_id in (select id from sessions where session_number >= 900);

delete from questions
where session_id in (select id from sessions where session_number >= 900);

delete from reading_checkins
where session_id in (select id from sessions where session_number >= 900);

delete from session_participants
where session_id in (select id from sessions where session_number >= 900);

delete from sessions
where session_number >= 900;
`;
}
```

If the current cleanup SQL uses a different generated-session marker, preserve the existing marker exactly.

- [ ] **Step 2: Rewire existing functions to use builders**

Change `resetSeedGoogleLogins`:

```ts
export function resetSeedGoogleLogins(emails: string[]) {
  runMysql(resetSeedGoogleLoginsSql(emails));
}
```

Change `cleanupGeneratedSessions` so it calls:

```ts
runMysql(cleanupGeneratedSessionsSql());
```

and still calls invited member cleanup when `invitedEmails` is not empty.

- [ ] **Step 3: Add batched reset entry point**

Add:

```ts
type E2eResetOptions = {
  googleLoginEmails?: string[];
  invitedEmails?: string[];
  cleanupGeneratedSessions?: boolean;
  cleanupManualNotifications?: boolean;
};

export function resetE2eState(options: E2eResetOptions) {
  const statements: string[] = [];

  if (options.cleanupManualNotifications) {
    statements.push(cleanupManualNotificationArtifactsSql());
  }

  if (options.cleanupGeneratedSessions) {
    statements.push(cleanupGeneratedSessionsSql());
  }

  if (options.invitedEmails?.length) {
    statements.push(cleanupInvitedMembersSql(options.invitedEmails));
  }

  if (options.googleLoginEmails?.length) {
    statements.push(resetSeedGoogleLoginsSql(options.googleLoginEmails));
  }

  runMysql(statements.join("\n"));
}
```

If `cleanupManualNotificationArtifactsSql` or `cleanupInvitedMembersSql` does not exist yet, extract those from the existing public functions in the same way as Step 1.

- [ ] **Step 4: Verify helper compiles through an E2E config test**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/playwright-e2e-config.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

Run:

```bash
git add front/tests/e2e/readmates-e2e-db.ts
git commit -m "test: batch E2E database reset helpers"
```

Expected: commit succeeds or is intentionally deferred.

## Task 7: Use Batched E2E Reset In High-Churn Specs

**Files:**
- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`
- Modify: `front/tests/e2e/google-auth-invite-flow.spec.ts`
- Modify: `front/tests/e2e/member-lifecycle.spec.ts`

- [ ] **Step 1: Update manual notification setup**

In `front/tests/e2e/manual-notifications.spec.ts`, replace separate cleanup/reset calls in `beforeEach` and `afterEach` with:

```ts
resetE2eState({
  cleanupManualNotifications: true,
  cleanupGeneratedSessions: true,
  googleLoginEmails: ["host@example.com", "member1@example.com"],
});
```

Import `resetE2eState` from `./readmates-e2e-db`.

- [ ] **Step 2: Run manual notification E2E spec**

Run:

```bash
pnpm --dir front test:e2e -- manual-notifications
```

Expected: all tests in `manual-notifications.spec.ts` pass.

- [ ] **Step 3: Update dev login session flow setup**

In `front/tests/e2e/dev-login-session-flow.spec.ts`, replace separate setup calls with:

```ts
resetE2eState({
  cleanupGeneratedSessions: true,
  invitedEmails: [invitedEmail],
  googleLoginEmails: ["host@example.com", "member1@example.com", "member5@example.com"],
});
```

- [ ] **Step 4: Run dev login session E2E spec**

Run:

```bash
pnpm --dir front test:e2e -- dev-login-session-flow
```

Expected: all tests in the spec pass.

- [ ] **Step 5: Update invite and lifecycle setup**

Apply the same pattern:

```ts
resetE2eState({
  cleanupGeneratedSessions: true,
  invitedEmails: [invitedEmail],
  googleLoginEmails: ["host@example.com"],
});
```

for invite flow, and:

```ts
resetE2eState({
  cleanupGeneratedSessions: true,
  googleLoginEmails: ["host@example.com", lifecycleMemberEmail],
});
```

for member lifecycle.

- [ ] **Step 6: Run changed E2E specs**

Run:

```bash
pnpm --dir front test:e2e -- google-auth-invite-flow member-lifecycle
```

Expected: all changed specs pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add front/tests/e2e/manual-notifications.spec.ts \
  front/tests/e2e/dev-login-session-flow.spec.ts \
  front/tests/e2e/google-auth-invite-flow.spec.ts \
  front/tests/e2e/member-lifecycle.spec.ts
git commit -m "test: reduce E2E database setup overhead"
```

Expected: commit succeeds or is intentionally deferred.

## Task 8: Add Opt-In Playwright Worker Count

**Files:**
- Modify: `front/playwright.config.ts`
- Modify: `docs/development/test-guide.md`

- [ ] **Step 1: Add worker env parsing**

In `front/playwright.config.ts`, after the `port` constant, add:

```ts
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? 1);
```

- [ ] **Step 2: Use worker constant**

Change:

```ts
workers: 1,
```

to:

```ts
workers,
```

- [ ] **Step 3: Verify default still runs single-worker**

Run:

```bash
pnpm --dir front exec playwright test --list
```

Expected: command succeeds. The config still defaults to one worker unless `PLAYWRIGHT_WORKERS` is set.

- [ ] **Step 4: Document opt-in worker mode**

In `docs/development/test-guide.md`, under Playwright E2E, add:

````markdown
The default Playwright worker count remains 1 because current E2E flows share seeded database state. To experiment with worker parallelism after validating state isolation, opt in explicitly:

```bash
PLAYWRIGHT_WORKERS=2 pnpm --dir front test:e2e
```

Do not make worker parallelism the default until repeated `--repeat-each` runs pass without database cleanup conflicts.
````

- [ ] **Step 5: Commit**

Run:

```bash
git add front/playwright.config.ts docs/development/test-guide.md
git commit -m "test: make Playwright worker parallelism opt-in"
```

Expected: commit succeeds or is intentionally deferred.

## Task 9: Split Vitest Node And JSDOM Projects

**Files:**
- Modify: `front/vitest.config.ts`

- [ ] **Step 1: Replace Vitest config**

Change `front/vitest.config.ts` to:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

const frontRoot = path.resolve(__dirname);

export default defineConfig({
  root: frontRoot,
  cacheDir: path.resolve(frontRoot, "node_modules/.vite"),
  resolve: {
    alias: {
      "@": frontRoot,
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          exclude: [
            "tests/unit/**/*.test.tsx",
            "tests/unit/cloudflare-*.test.ts",
            "tests/unit/proxy-bff-secret.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "tests/unit/**/*.test.tsx",
            "tests/unit/cloudflare-*.test.ts",
            "tests/unit/proxy-bff-secret.test.ts",
          ],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 2: Run pure node representative tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts tests/unit/cache.test.ts --reporter=verbose
```

Expected: tests pass under the `node` project.

- [ ] **Step 3: Run jsdom representative tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx tests/unit/current-session.test.tsx --reporter=verbose
```

Expected: tests pass under the `jsdom` project.

- [ ] **Step 4: Run full frontend unit suite**

Run:

```bash
pnpm --dir front test -- --reporter=verbose
```

Expected: all tests pass. Compare wall time to the previous 7 second baseline.

- [ ] **Step 5: Move failing node tests back to jsdom if needed**

If a `.test.ts` file fails because it relies on DOM/Web APIs, add that exact file to the jsdom `include` list and exclude it from the node project. Example:

```ts
include: [
  "tests/unit/**/*.test.tsx",
  "tests/unit/cloudflare-*.test.ts",
  "tests/unit/proxy-bff-secret.test.ts",
  "tests/unit/readmates-fetch.test.ts",
],
```

Then add the same file to the node `exclude` list:

```ts
exclude: [
  "tests/unit/**/*.test.tsx",
  "tests/unit/cloudflare-*.test.ts",
  "tests/unit/proxy-bff-secret.test.ts",
  "tests/unit/readmates-fetch.test.ts",
],
```

- [ ] **Step 6: Commit**

Run:

```bash
git add front/vitest.config.ts
git commit -m "test: split Vitest node and jsdom projects"
```

Expected: commit succeeds or is intentionally deferred.

## Task 10: Final Verification And Runtime Report

**Files:**
- Modify: `docs/development/test-guide.md`
- Optional modify: `docs/superpowers/specs/2026-05-14-readmates-test-runtime-optimization-detailed-implementation.md`

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass. Record wall times.

- [ ] **Step 2: Run backend fast lanes**

Run:

```bash
./server/gradlew -p server unitTest integrationTest architectureTest
```

Expected: all pass. Record wall times and test counts.

- [ ] **Step 3: Run backend full suite**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: `BUILD SUCCESSFUL`. Record wall time.

- [ ] **Step 4: Run targeted E2E checks**

Run:

```bash
pnpm --dir front test:e2e -- manual-notifications
pnpm --dir front test:e2e -- dev-login-session-flow
```

Expected: both pass.

- [ ] **Step 5: Update test guide with final command list**

Ensure `docs/development/test-guide.md` includes:

````markdown
Backend fast lanes:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest
./server/gradlew -p server architectureTest
```

Release baseline:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```
````

- [ ] **Step 6: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/development/test-guide.md docs/superpowers/plans/2026-05-14-readmates-test-runtime-optimization-implementation-plan.md docs/superpowers/specs/2026-05-14-readmates-test-runtime-optimization-detailed-implementation.md
```

Expected: no output and exit 0.

- [ ] **Step 7: Commit final docs**

Run:

```bash
git add docs/development/test-guide.md \
  docs/superpowers/plans/2026-05-14-readmates-test-runtime-optimization-implementation-plan.md \
  docs/superpowers/specs/2026-05-14-readmates-test-runtime-optimization-detailed-implementation.md
git commit -m "docs: document test runtime optimization workflow"
```

Expected: commit succeeds or is intentionally deferred.

## Self-Review Checklist

- [ ] The plan keeps existing release checks and does not reduce coverage.
- [ ] The first implementation task fixes JDK 21 drift before speed tuning.
- [ ] Server fast lanes are additive and do not change the canonical `test` task behavior.
- [ ] Spring integration support avoids mixing Redis/Kafka containers into MySQL-only tests.
- [ ] Playwright worker count remains safe by default.
- [ ] Vitest project split uses `projects`, not deprecated environment glob options.
- [ ] All examples use synthetic emails and relative repo paths only.
