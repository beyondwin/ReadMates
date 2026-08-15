# ReadMates Backend Quality Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved backend quality baseline into fail-closed compiler, static-analysis, coverage, slice-registry, and dependency-growth gates without changing ReadMates runtime behavior.

**Architecture:** Keep the single Spring Boot module and existing Gradle lanes. Add test-owned quality readers and architecture inventories under the architecture test suite, clean the current production compiler warnings before enabling warnings-as-errors, and pin existing dependency debt in reviewable text baselines that may only shrink. Phase 1 operational reliability and Phase 2 boundary removal remain separate implementation plans built on this ratchet.

**Tech Stack:** Kotlin 2.4, Java 25, Spring Boot 4, Gradle 9.6.1, JUnit 5, AssertJ, ArchUnit 1.3.2, JaCoCo 0.8.14, Detekt 2.0.0-alpha.5, ktlint 1.7.1, JDBC, and repository shell/public-release checks.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md`.
- This plan covers Phase 0 only. Do not implement administrator-health timeouts, Flyway immutability, actor migration, async recovery, or feature-cycle removal here.
- Do not change API response shapes, HTTP status numbers, authorization meaning, database schema, Flyway migrations, BFF behavior, or deployment behavior.
- Keep the server as one Gradle/Spring Boot module and preserve the existing `unitTest`, `architectureTest`, `integrationTest`, and `check` lane split.
- Apply warnings-as-errors to production `compileKotlin` only. Test compiler warnings are measured separately and are not a Phase 0 blocker.
- Static-analysis ceilings start at exactly 461 Detekt issues and 171 ktlint errors. A change may lower either value but may not increase it.
- JaCoCo LINE `COVEREDRATIO` minimum is 0.43. Do not widen the existing `Application`/`dto`/`config` exclusions.
- Boundary-import debt starts at 39 entries and application feature-dependency debt starts at 41 edges. Both baseline files must exactly match current source and may only shrink.
- `com.readmates.shared.adapter.in.web` remains the intentional common inbound web-error contract in Phase 0; cross-feature web helpers such as club-context resolution and host-session parsing remain explicit debt.
- Do not add real member data, private domains, deployment state, local absolute paths, secrets, OCIDs, or token-shaped examples.
- Use TDD RED/GREEN, focused regression, `./scripts/server-ci-check.sh`, the full integration lane at final HEAD, `git diff --check`, narrow commits, and a final independent review before closeout.
- Execute this plan in an isolated worktree created with the `using-git-worktrees` skill; do not develop directly on local `main`.

---

## File Structure

- Create `server/src/test/kotlin/com/readmates/architecture/ServerQualityBaselineReader.kt`: secure XML reader for Detekt and ktlint baseline counts.
- Create `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`: architecture-tagged parser tests, repository baseline ceilings, and JaCoCo floor source contract.
- Modify `server/build.gradle.kts`: enable production warnings-as-errors and raise JaCoCo LINE minimum to 0.43.
- Modify the 13 production files listed in Task 2: remove all 29 current compiler warnings without suppression.
- Modify `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`: use the non-deprecated Spring 7 status constant while preserving numeric 422.
- Create `server/src/test/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentErrorHandlerTest.kt`: pin the feedback invalid-document status at numeric 422.
- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`: register `sessionimport`, represent every inbound package, and use inbound rather than web-only registry terminology.
- Create `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt`: pure source import, feature-edge, baseline, and cyclic-component inventory helpers.
- Create `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`: fixture coverage plus repository no-growth contracts.
- Create `server/config/architecture/boundary-import-baseline.txt`: exact 39-entry Phase 0 dependency-debt inventory.
- Create `server/config/architecture/feature-dependency-baseline.txt`: exact 41-edge application feature-dependency inventory.
- Modify `docs/development/test-guide.md`: document the 0.43 coverage floor and the three non-growth baselines.
- Modify `docs/development/adr/0002-server-clean-architecture-with-archunit.md`: document all-inbound registry coverage and the Phase 0 debt-baseline policy.
- Modify `docs/development/architecture.md`: align the current server verification boundary with the new registry and inventory gates.
- Modify `CHANGELOG.md`: record the backend quality ratchet under `Unreleased`.

---

### Task 1: Static-Analysis Baseline Ceiling

**Files:**
- Create: `server/src/test/kotlin/com/readmates/architecture/ServerQualityBaselineReader.kt`
- Create: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`

**Interfaces:**
- Produces: `data class ServerQualityBaselineCounts(val detektIssues: Int, val ktlintErrors: Int)`.
- Produces: `ServerQualityBaselineReader.read(detektBaseline: Path, ktlintBaseline: Path): ServerQualityBaselineCounts`.
- Produces: architecture test `static analysis baselines never grow` with ceilings 461 and 171.
- Consumes: `server/config/detekt/baseline.xml` and `server/config/ktlint/baseline.xml`.

- [ ] **Step 1: Write the failing baseline-reader tests**

Create `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt` with the parser and repository contracts below. Leave `ServerQualityBaselineReader` undefined for this RED step.

```kotlin
package com.readmates.architecture

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

@Tag("architecture")
class ServerQualityRatchetTest {
    @Test
    fun `baseline reader counts detekt ids and ktlint errors`(@TempDir tempDir: Path) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(
            detekt,
            """<?xml version="1.0"?><SmellBaseline><CurrentIssues><ID>one</ID><ID>two</ID></CurrentIssues></SmellBaseline>""",
        )
        Files.writeString(
            ktlint,
            """<?xml version="1.0"?><baseline><file name="A.kt"><error line="1"/><error line="2"/></file><file name="B.kt"><error line="3"/></file></baseline>""",
        )

        val counts = ServerQualityBaselineReader.read(detekt, ktlint)

        assertThat(counts).isEqualTo(ServerQualityBaselineCounts(detektIssues = 2, ktlintErrors = 3))
    }

    @Test
    fun `baseline reader fails closed for malformed xml`(@TempDir tempDir: Path) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(detekt, "<SmellBaseline><ID>broken")
        Files.writeString(ktlint, "<baseline/>")

        assertThatThrownBy { ServerQualityBaselineReader.read(detekt, ktlint) }
            .isInstanceOf(Exception::class.java)
    }

    @Test
    fun `static analysis baselines never grow`() {
        val root = projectRoot()
        val counts =
            ServerQualityBaselineReader.read(
                root.resolve("server/config/detekt/baseline.xml"),
                root.resolve("server/config/ktlint/baseline.xml"),
            )

        assertThat(counts.detektIssues).isLessThanOrEqualTo(MAX_DETEKT_BASELINE_ISSUES)
        assertThat(counts.ktlintErrors).isLessThanOrEqualTo(MAX_KTLINT_BASELINE_ERRORS)
    }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

    private companion object {
        const val MAX_DETEKT_BASELINE_ISSUES = 461
        const val MAX_KTLINT_BASELINE_ERRORS = 171
    }
}
```

- [ ] **Step 2: Run the RED architecture test**

Run:

```bash
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerQualityRatchetTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: FAIL at test compilation because `ServerQualityBaselineReader` and `ServerQualityBaselineCounts` do not exist.

- [ ] **Step 3: Implement the secure XML reader**

Create `server/src/test/kotlin/com/readmates/architecture/ServerQualityBaselineReader.kt`:

```kotlin
package com.readmates.architecture

import org.w3c.dom.Document
import java.nio.file.Path
import javax.xml.parsers.DocumentBuilderFactory

data class ServerQualityBaselineCounts(
    val detektIssues: Int,
    val ktlintErrors: Int,
)

object ServerQualityBaselineReader {
    fun read(
        detektBaseline: Path,
        ktlintBaseline: Path,
    ): ServerQualityBaselineCounts =
        ServerQualityBaselineCounts(
            detektIssues = parse(detektBaseline).getElementsByTagName("ID").length,
            ktlintErrors = parse(ktlintBaseline).getElementsByTagName("error").length,
        )

    private fun parse(path: Path): Document {
        val factory = DocumentBuilderFactory.newInstance()
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        factory.isXIncludeAware = false
        factory.isExpandEntityReferences = false
        return factory.newDocumentBuilder().parse(path.toFile())
    }
}
```

- [ ] **Step 4: Run the GREEN architecture test**

Run the command from Step 2 again.

Expected: PASS with fixture counts `2/3` and repository counts at or below `461/171`.

- [ ] **Step 5: Commit the static-analysis ratchet**

```bash
git add \
  server/src/test/kotlin/com/readmates/architecture/ServerQualityBaselineReader.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt
git commit -m "test(server): ratchet static analysis baselines"
```

---

### Task 2: Production Compiler Warning Zero Gate

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentErrorHandlerTest.kt`

**Interfaces:**
- Produces: production `compileKotlin` fails on every warning through `allWarningsAsErrors`.
- Preserves: every HTTP 422 response as numeric status 422 using `HttpStatus.UNPROCESSABLE_CONTENT`.
- Preserves: current JSON parsing, aggregate-query results, transaction results, and Redis key scanning behavior.

- [ ] **Step 1: Enable the compiler gate before fixing warnings**

Add this block immediately after the existing Kotlin compile configuration in `server/build.gradle.kts`:

```kotlin
tasks.named<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>("compileKotlin") {
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}
```

- [ ] **Step 2: Run the RED production compile**

```bash
./server/gradlew -p server compileKotlin \
  --rerun-tasks --no-build-cache --no-configuration-cache --no-daemon
```

Expected: FAIL because the current 29 production warnings are promoted to errors. The output must name only the 13 production files in this task; if a new file appears, add its warning to this same cleanup before proceeding.

- [ ] **Step 3: Replace deprecated Jackson and Spring APIs**

Apply these exact semantic replacements:

```kotlin
// tools.jackson.databind.JsonNode in JsonlDeployLedgerAdapter and HttpPrometheusQueryAdapter
node.asText()
// becomes
node.asString()

// Spring 7 keeps the same numeric 422 status under the new name.
HttpStatus.UNPROCESSABLE_ENTITY
// becomes
HttpStatus.UNPROCESSABLE_CONTENT
```

Update all `asText()` calls in the two admin-health adapters. Update all three production occurrences and every test expectation/provider row in `AiGenerationErrorHandler.kt` and `AiGenerationErrorHandlerTest.kt`. Update the one feedback-handler occurrence.

Create `server/src/test/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentErrorHandlerTest.kt`:

```kotlin
package com.readmates.feedback.adapter.`in`.web

import com.readmates.feedback.application.FeedbackDocumentError
import com.readmates.feedback.application.FeedbackDocumentException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class FeedbackDocumentErrorHandlerTest {
    @Test
    fun `invalid stored document remains numeric 422`() {
        val response =
            FeedbackDocumentErrorHandler().handleFeedbackDocumentException(
                FeedbackDocumentException(
                    FeedbackDocumentError.INVALID_STORED_DOCUMENT,
                    "invalid stored document",
                ),
            )

        assertThat(response.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT)
        assertThat(response.statusCode.value()).isEqualTo(422)
    }
}
```

- [ ] **Step 4: Run focused JSON and error-contract tests**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.admin.health.adapter.out.persistence.JsonlDeployLedgerAdapterTest \
  --tests com.readmates.admin.health.adapter.out.prometheus.HttpPrometheusQueryAdapterTest \
  --tests com.readmates.aigen.adapter.in.web.AiGenerationErrorHandlerTest \
  --tests com.readmates.feedback.adapter.in.web.FeedbackDocumentErrorHandlerTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: PASS; the AI and feedback tests must still assert numeric 422.

- [ ] **Step 5: Remove Kotlin 2.4/Spring 7 nullability and unused-expression warnings**

Make the following exact changes without adding suppression annotations:

```kotlin
// JdbcTemplate.query now has a non-null list contract.
jdbcTemplate.query(/* existing arguments */) ?: emptyList()
// becomes
jdbcTemplate.query(/* unchanged arguments */)

// Aggregate queryForObject calls in the listed files now have non-null Kotlin types.
jdbcTemplate.queryForObject(/* existing aggregate SQL and mapper */) ?: fallback
// becomes
jdbcTemplate.queryForObject(/* unchanged aggregate SQL and mapper */)

// Query returns a non-null list before firstOrNull.
jdbcTemplate.query(/* existing arguments */)?.firstOrNull()
// becomes
jdbcTemplate.query(/* unchanged arguments */).firstOrNull()

// TransactionTemplate.execute is non-null for this non-null callback.
val persisted = transactionTemplate.execute { persistOnboarding(admin, normalized) }
    ?: error("Platform admin onboarding transaction returned no result")
// becomes
val persisted = transactionTemplate.execute { persistOnboarding(admin, normalized) }
```

Apply those forms at the warning sites reported by Step 2:

- `JdbcAdminAnalyticsAdapter.kt`: remove the list fallback after the benchmark query.
- `JdbcAdminClubOperationsAdapter.kt`: remove the four aggregate/list fallbacks for member activity, session progress, failure clusters, and AI usage.
- `JdbcPlatformAdminAdapter.kt`: remove both list fallbacks and the unnecessary safe call before `firstOrNull()`.
- `JdbcPlatformAdminClubAdapter.kt`: remove the club-list fallback.
- `PlatformAdminOnboardingService.kt`: remove the impossible null transaction fallback.
- `JdbcAdminNotificationOperationsAdapter.kt`: remove the `OffsetDateTime.now()` fallback from `select utc_timestamp(6)`.
- `JdbcPublicQueryAdapter.kt`: remove the aggregate public-stats fallback.
- `HostSessionQueries.kt`: remove the host-dashboard aggregate fallback.

Remove the unused explicit `Unit` from `RedisReadCacheInvalidationAdapter.scanKeys` so the `use` block is the callback result:

```kotlin
redisTemplate.execute<Unit> { connection ->
    connection.keyCommands().scan(options).use { cursor ->
        while (cursor.hasNext()) {
            collected.add(String(cursor.next(), Charsets.UTF_8))
        }
    }
}
```

- [ ] **Step 6: Run production compile and focused persistence regression**

Run the Step 2 compile command first.

Expected: PASS with no `w:` production warning lines.

Then run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.admin.analytics.adapter.out.persistence.JdbcAdminAnalyticsAdapterTest \
  --tests com.readmates.club.adapter.out.persistence.JdbcAdminTodayClosingRiskTest \
  --tests com.readmates.club.adapter.out.persistence.JdbcAdminClubOperationsTrendTest \
  --tests com.readmates.club.adapter.out.persistence.JdbcAdminClubOperationsClosingRiskTest \
  --tests com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubAvatarAllocationTest \
  --tests com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubFailureCountsTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationOperationsAdapterTest \
  --tests com.readmates.publication.adapter.out.persistence.JdbcPublicQueryAdapterTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: PASS with the aggregate-query and list behavior unchanged.

- [ ] **Step 7: Commit the warning-zero gate**

```bash
git add \
  server/build.gradle.kts \
  server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt \
  server/src/main/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapter.kt \
  server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt \
  server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt \
  server/src/main/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentErrorHandler.kt \
  server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcAdminNotificationOperationsAdapter.kt \
  server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt \
  server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt \
  server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt \
  server/src/test/kotlin/com/readmates/feedback/adapter/in/web/FeedbackDocumentErrorHandlerTest.kt
git commit -m "build(server): fail on production compiler warnings"
```

---

### Task 3: JaCoCo 43 Percent Floor

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`
- Modify: `server/build.gradle.kts`
- Modify: `docs/development/test-guide.md`

**Interfaces:**
- Produces: architecture source contract that pins the approved JaCoCo floor.
- Produces: Gradle LINE `COVEREDRATIO` minimum `0.43`.
- Consumes: unit-lane JaCoCo XML. The 2026-08-09 starting measurement is `15461` missed and `13051` covered, or approximately `0.4577`.

- [ ] **Step 1: Write the failing coverage-floor source contract**

Add this test to `ServerQualityRatchetTest`:

```kotlin
@Test
fun `jacoco line floor stays at approved phase zero minimum`() {
    val buildScript = projectRoot().resolve("server/build.gradle.kts").toFile().readText()

    assertThat(buildScript).contains(
        """minimum = "0.43".toBigDecimal()""",
    )
}
```

- [ ] **Step 2: Run the RED source contract**

Run the focused architecture command from Task 1 Step 2.

Expected: FAIL because `server/build.gradle.kts` still contains `minimum = "0.23"`.

- [ ] **Step 3: Raise the Gradle coverage gate**

Replace the existing JaCoCo limit block comment and minimum with:

```kotlin
// Phase 0 baseline 0.4577 (measured 2026-08-09) -2pp safety margin.
minimum = "0.43".toBigDecimal()
```

Do not change `executionData`, `classDirectories`, or any exclusion pattern.

- [ ] **Step 4: Run the GREEN source contract and real coverage gate**

```bash
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerQualityRatchetTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server jacocoTestCoverageVerification \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: both commands PASS and the JaCoCo report remains at or above 0.43.

- [ ] **Step 5: Update the active test guide**

In `docs/development/test-guide.md`, replace the backend JaCoCo 0.23 description with 0.43 and record the current rule as “stable measurement minus approximately 2 percentage points.” Do not change the frontend coverage section.

- [ ] **Step 6: Commit the coverage ratchet**

```bash
git add server/build.gradle.kts server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt docs/development/test-guide.md
git commit -m "test(server): raise jacoco quality floor"
```

---

### Task 4: Complete Server Slice And Inbound Registry

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**
- Produces: `ServerSlice.inboundAdapterPackages` replacing web-only terminology.
- Produces: `sessionimport` as a `WORKFLOW` slice.
- Produces: inbound coverage for web, Kafka/messaging, scheduler, adapter security, and auth servlet-security packages.
- Preserves: existing no-persistence and no-repository inbound rules.

- [ ] **Step 1: Extend the registry expectation before the registry**

Add `"sessionimport"` to the required set in `server architecture registry includes recent workflow and migrated slices` and add this test:

```kotlin
@Test
fun `non web inbound adapters are registered`() {
    val inboundPackages = serverSlices.flatMap(ServerSlice::inboundAdapterPackages).toSet()

    assertTrue(inboundPackages.contains("com.readmates.aigen.adapter.in.messaging.."))
    assertTrue(inboundPackages.contains("com.readmates.aigen.adapter.in.scheduling.."))
    assertTrue(inboundPackages.contains("com.readmates.notification.adapter.in.kafka.."))
    assertTrue(inboundPackages.contains("com.readmates.notification.adapter.in.scheduler.."))
    assertTrue(inboundPackages.contains("com.readmates.auth.adapter.in.security.."))
    assertTrue(inboundPackages.contains("com.readmates.auth.infrastructure.security.."))
}
```

For this RED step, rename neither the data-class property nor registry entries yet.

- [ ] **Step 2: Run the RED registry test**

```bash
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: FAIL at compilation because `inboundAdapterPackages` is not defined; after defining only the property, it must still fail because `sessionimport` and non-web packages are absent.

- [ ] **Step 3: Rename the registry property and add the missing slice**

Change the data class and derived array to:

```kotlin
private data class ServerSlice(
    val name: String,
    val type: ServerSliceType,
    val inboundAdapterPackages: List<String> = emptyList(),
    val applicationPackages: List<String> = emptyList(),
)

private val migratedInboundAdapterPackages =
    serverSlices
        .flatMap(ServerSlice::inboundAdapterPackages)
        .toTypedArray()
```

Rename all `webAdapterPackages` constructor arguments and test references to `inboundAdapterPackages`. Add this registry entry immediately before `sessionrecord`:

```kotlin
ServerSlice(
    name = "sessionimport",
    type = ServerSliceType.WORKFLOW,
    inboundAdapterPackages = listOf("com.readmates.sessionimport.adapter.in.web.."),
    applicationPackages = listOf("com.readmates.sessionimport.application.."),
),
```

- [ ] **Step 4: Register every current non-web inbound package**

Keep each existing web package and use this exact additional package matrix:

```text
aigen:
  com.readmates.aigen.adapter.in.messaging..
  com.readmates.aigen.adapter.in.scheduling..
auth:
  com.readmates.auth.adapter.in.security..
  com.readmates.auth.infrastructure.security..
notification:
  com.readmates.notification.adapter.in.kafka..
  com.readmates.notification.adapter.in.scheduler..
```

Update the persistence/repository rule to use `migratedInboundAdapterPackages`. Rename the rule from “migrated web adapters” to “registered inbound adapters.” Do not broaden its forbidden target list in this task.

- [ ] **Step 5: Run the GREEN registry and full architecture suite**

Run the Step 2 command, then:

```bash
./server/gradlew -p server architectureTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: PASS; all registered inbound packages remain free of persistence and repository dependencies.

- [ ] **Step 6: Commit the complete registry**

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "test(server): cover all inbound architecture slices"
```

---

### Task 5: Boundary-Debt And Feature-Dependency No-Growth Inventories

**Files:**
- Create: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt`
- Create: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Create: `server/config/architecture/boundary-import-baseline.txt`
- Create: `server/config/architecture/feature-dependency-baseline.txt`

**Interfaces:**
- Produces: `boundaryDebtImports(sourceRoot: Path): Set<String>` using `source|importedSymbol` rows.
- Produces: `applicationFeatureEdges(sourceRoot: Path): Set<String>` using `sourceSlice|targetSlice` rows.
- Produces: `readArchitectureBaseline(path: Path): Set<String>` with duplicate detection.
- Produces: `cyclicFeatureComponents(edges: Set<String>): Set<Set<String>>`.
- Preserves: shared inbound error contracts as an allowed platform-web dependency.

- [ ] **Step 1: Write the failing inventory tests**

Create `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`:

```kotlin
package com.readmates.architecture

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

@Tag("architecture")
class ServerArchitectureInventoryTest {
    @Test
    fun `boundary inventory detects forbidden directions but permits shared web errors`(@TempDir root: Path) {
        write(root, "com/readmates/sample/adapter/in/web/SampleController.kt", """
            package com.readmates.sample.adapter.`in`.web
            import com.readmates.sample.application.service.SampleService
            import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
        """)
        write(root, "com/readmates/sample/application/service/SampleService.kt", """
            package com.readmates.sample.application.service
            import com.readmates.sample.adapter.out.persistence.SampleAdapter
        """)
        write(root, "com/readmates/sample/adapter/out/persistence/SampleAdapter.kt", """
            package com.readmates.sample.adapter.out.persistence
            import com.readmates.sample.application.service.SampleService
        """)

        assertThat(boundaryDebtImports(root)).containsExactlyInAnyOrder(
            "com/readmates/sample/adapter/in/web/SampleController.kt|com.readmates.sample.application.service.SampleService",
            "com/readmates/sample/application/service/SampleService.kt|com.readmates.sample.adapter.out.persistence.SampleAdapter",
            "com/readmates/sample/adapter/out/persistence/SampleAdapter.kt|com.readmates.sample.application.service.SampleService",
        )
    }

    @Test
    fun `repository boundary import baseline exactly matches source`() {
        val root = projectRoot()
        val actual = boundaryDebtImports(root.resolve("server/src/main/kotlin"))
        val baseline = readArchitectureBaseline(root.resolve("server/config/architecture/boundary-import-baseline.txt"))

        assertThat(baseline).hasSizeLessThanOrEqualTo(39)
        assertThat(actual).isEqualTo(baseline)
    }

    @Test
    fun `repository feature dependency baseline exactly matches source and cycles do not grow`() {
        val root = projectRoot()
        val actual = applicationFeatureEdges(root.resolve("server/src/main/kotlin"))
        val baseline = readArchitectureBaseline(root.resolve("server/config/architecture/feature-dependency-baseline.txt"))
        val components = cyclicFeatureComponents(actual)
        val knownComponent = setOf("auth", "club", "notification", "session", "sessionimport", "sessionrecord")

        assertThat(baseline).hasSizeLessThanOrEqualTo(41)
        assertThat(actual).isEqualTo(baseline)
        assertThat(components).allMatch { component -> knownComponent.containsAll(component) }
    }

    private fun write(root: Path, relative: String, content: String) {
        val path = root.resolve(relative)
        Files.createDirectories(path.parent)
        Files.writeString(path, content.trimIndent())
    }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }
}
```

- [ ] **Step 2: Run the RED inventory test**

```bash
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerArchitectureInventoryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected: FAIL at compilation because the four inventory functions do not exist.

- [ ] **Step 3: Implement the pure inventory helpers**

Create `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt`:

```kotlin
package com.readmates.architecture

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readLines
import kotlin.io.path.relativeTo

private val featurePackageRoots =
    linkedMapOf(
        "session" to "com/readmates/session",
        "note" to "com/readmates/note",
        "publication" to "com/readmates/publication",
        "archive" to "com/readmates/archive",
        "browse" to "com/readmates/browse",
        "sessionclosing" to "com/readmates/sessionclosing",
        "feedback" to "com/readmates/feedback",
        "auth" to "com/readmates/auth",
        "notification" to "com/readmates/notification",
        "club" to "com/readmates/club",
        "admin.audit" to "com/readmates/admin/audit",
        "admin.health" to "com/readmates/admin/health",
        "admin.operations" to "com/readmates/admin/operations",
        "observability" to "com/readmates/observability",
        "admin.analytics" to "com/readmates/admin/analytics",
        "aigen" to "com/readmates/aigen",
        "sessionimport" to "com/readmates/sessionimport",
        "sessionrecord" to "com/readmates/sessionrecord",
        "shared" to "com/readmates/shared",
    )

fun boundaryDebtImports(sourceRoot: Path): Set<String> =
    kotlinFiles(sourceRoot)
        .flatMap { source ->
            val relative = source.relativeTo(sourceRoot).toString().replace('\\', '/')
            source.readLines().mapNotNull { line ->
                val imported = normalizedReadmatesImport(line) ?: return@mapNotNull null
                if (isBoundaryDebt(relative, imported)) "$relative|$imported" else null
            }
        }.toSortedSet()

fun applicationFeatureEdges(sourceRoot: Path): Set<String> =
    featurePackageRoots
        .flatMap { (sourceFeature, packageRoot) ->
            val applicationRoot = sourceRoot.resolve(packageRoot).resolve("application")
            if (!Files.exists(applicationRoot)) return@flatMap emptyList()
            kotlinFiles(applicationRoot).flatMap { source ->
                source.readLines().mapNotNull { line ->
                    val imported = normalizedReadmatesImport(line) ?: return@mapNotNull null
                    val targetFeature = featureFor(imported) ?: return@mapNotNull null
                    if (targetFeature == sourceFeature) null else "$sourceFeature|$targetFeature"
                }
            }
        }.toSortedSet()

fun readArchitectureBaseline(path: Path): Set<String> {
    val rows =
        path.readLines()
            .map(String::trim)
            .filter { row -> row.isNotEmpty() && !row.startsWith("#") }
    require(rows.size == rows.toSet().size) { "Duplicate architecture baseline row in $path" }
    return rows.toSortedSet()
}

fun cyclicFeatureComponents(edges: Set<String>): Set<Set<String>> {
    val pairs = edges.map { edge -> edge.split('|').let { it[0] to it[1] } }
    val nodes = pairs.flatMap { (source, target) -> listOf(source, target) }.toSet()
    val adjacency = nodes.associateWith { node -> pairs.filter { it.first == node }.map { it.second }.toSet() }
    fun reachable(start: String): Set<String> {
        val seen = mutableSetOf<String>()
        val pending = ArrayDeque<String>().apply { add(start) }
        while (pending.isNotEmpty()) {
            val current = pending.removeFirst()
            if (seen.add(current)) adjacency.getValue(current).forEach(pending::addLast)
        }
        return seen
    }
    val reachability = nodes.associateWith(::reachable)
    return nodes
        .map { node -> nodes.filterTo(sortedSetOf()) { candidate ->
            candidate in reachability.getValue(node) && node in reachability.getValue(candidate)
        } }
        .filter { component -> component.size > 1 }
        .toSet()
}

private fun normalizedReadmatesImport(line: String): String? {
    val trimmed = line.trim()
    if (!trimmed.startsWith("import com.readmates.")) return null
    return trimmed.removePrefix("import ").replace("`", "")
}

private fun isBoundaryDebt(source: String, imported: String): Boolean {
    val rootedSource = "/$source"
    val inbound = "/adapter/in/" in rootedSource || "/infrastructure/security/" in rootedSource
    val application = "/application/" in rootedSource
    val outbound = "/adapter/out/" in rootedSource
    val crossFeatureInbound =
        ".adapter.in." in imported && !imported.startsWith("com.readmates.shared.adapter.in.web.")
    return (inbound && (".application.service." in imported || ".adapter.out." in imported || crossFeatureInbound)) ||
        (application && ".adapter." in imported) ||
        (outbound && (".adapter.in." in imported || ".application.service." in imported))
}

private fun featureFor(imported: String): String? =
    featurePackageRoots
        .mapValues { (_, path) -> path.replace('/', '.') }
        .entries
        .filter { (_, packageRoot) -> imported == packageRoot || imported.startsWith("$packageRoot.") }
        .maxByOrNull { (_, packageRoot) -> packageRoot.length }
        ?.key

private fun kotlinFiles(root: Path): List<Path> =
    Files.walk(root).use { paths ->
        paths.filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }.toList()
    }
```

- [ ] **Step 4: Add the exact boundary-import baseline**

Create `server/config/architecture/boundary-import-baseline.txt` with exactly these 39 non-comment rows:

```text
# Phase 2 removes these concrete-service, cross-adapter, and adapter-owned-contract dependencies.
com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt|com.readmates.admin.health.application.service.PlatformAdminHealthService
com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProvider.kt|com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProvider.kt|com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProvider.kt|com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProvider.kt|com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt|com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt|com.readmates.aigen.application.service.AiGenerationWorker
com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoveryScheduler.kt|com.readmates.aigen.application.service.AiGenerationCommitRecoveryService
com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt|com.readmates.aigen.adapter.out.messaging.AiGenerationJobPublishException
com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapper.kt|com.readmates.aigen.application.service.ProviderFailureClass
com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt|com.readmates.aigen.application.service.AiGenerationMetrics
com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt|com.readmates.aigen.application.service.CapDenialReason
com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt|com.readmates.aigen.application.service.AiGenerationMetrics
com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt|com.readmates.aigen.application.service.ProviderCircuitState
com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/adapter/in/web/AuthMeController.kt|com.readmates.club.adapter.in.web.ClubContextSource
com/readmates/auth/adapter/in/web/AuthMeController.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/adapter/in/web/MemberProfileController.kt|com.readmates.auth.application.service.MemberProfileError
com/readmates/auth/adapter/in/web/MemberProfileController.kt|com.readmates.auth.application.service.MemberProfileException
com/readmates/auth/adapter/in/web/MemberProfileController.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/adapter/in/web/PendingApprovalController.kt|com.readmates.auth.application.service.PendingApprovalAppResponse
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.AuthenticatedMemberResolver
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.AuthoritySynthesisRequest
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.AuthoritySynthesisService
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.auth.application.service.ClubContextInput
com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.AuthSessionService
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.GoogleLoginException
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.GoogleLoginService
com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt|com.readmates.auth.application.service.InvitationService
com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt|com.readmates.auth.application.service.AuthSessionService
com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt|com.readmates.auth.application.service.AuthenticatedMemberResolver
com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt|com.readmates.club.adapter.in.web.resolveClubContext
com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt|com.readmates.notification.adapter.in.kafka.NotificationUnsupportedSchemaVersionException
com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt|com.readmates.notification.application.service.NotificationDeliveryRetryableException
com/readmates/sessionclosing/adapter/in/web/HostSessionClosingController.kt|com.readmates.session.adapter.in.web.parseHostSessionId
com/readmates/sessionimport/adapter/in/web/SessionImportErrorHandler.kt|com.readmates.sessionimport.application.service.InvalidSessionImportException
com/readmates/sessionrecord/adapter/out/persistence/JdbcHostSessionHistoryAdapter.kt|com.readmates.sessionrecord.application.service.typeSort
com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt|com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodec
```

- [ ] **Step 5: Add the exact application feature-dependency baseline**

Create `server/config/architecture/feature-dependency-baseline.txt` with exactly these 41 non-comment rows:

```text
# Phase 2 removes cycles; every source change must remove matching rows in the same commit.
admin.analytics|shared
admin.audit|club
admin.audit|shared
admin.health|shared
admin.operations|club
admin.operations|shared
aigen|club
aigen|feedback
aigen|notification
aigen|session
aigen|sessionimport
aigen|sessionrecord
aigen|shared
archive|notification
archive|shared
auth|club
auth|session
auth|shared
browse|shared
club|auth
club|shared
feedback|shared
note|shared
notification|club
notification|shared
publication|club
publication|shared
session|notification
session|sessionrecord
session|shared
sessionclosing|session
sessionclosing|sessionrecord
sessionclosing|shared
sessionimport|feedback
sessionimport|session
sessionimport|sessionrecord
sessionimport|shared
sessionrecord|notification
sessionrecord|session
sessionrecord|sessionimport
sessionrecord|shared
```

- [ ] **Step 6: Run the GREEN inventory and prove the ceiling fails on growth**

Run the Step 2 command.

Expected: PASS with 39 boundary rows, 41 feature edges, and the known cyclic component contained within `auth/club/notification/session/sessionimport/sessionrecord`.

Then use `apply_patch` to add these two temporary rows without creating matching source dependencies:

```text
server/config/architecture/boundary-import-baseline.txt:
com/readmates/example/adapter/in/web/Example.kt|com.readmates.example.application.service.ExampleService

server/config/architecture/feature-dependency-baseline.txt:
example|shared
```

Rerun the focused test and verify it FAILS on both the size ceiling and exact source/baseline equality. Use `apply_patch` to remove the two temporary rows, then rerun the focused test.

Expected after restoration: PASS. Do not commit the synthetic rows.

- [ ] **Step 7: Commit the architecture inventories**

```bash
git add \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt \
  server/config/architecture/boundary-import-baseline.txt \
  server/config/architecture/feature-dependency-baseline.txt
git commit -m "test(server): prevent architecture debt growth"
```

---

### Task 6: Active Documentation And Final Evidence

**Files:**
- Modify: `docs/development/test-guide.md`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: active contributor guidance for the compiler, coverage, static-analysis, registry, boundary-import, and feature-edge gates.
- Produces: an `Unreleased` changelog entry with no claim of runtime behavior change.
- Consumes: the exact final verification output from this plan.

- [ ] **Step 1: Update active architecture and test documentation**

Make these exact documentation changes:

```text
docs/development/test-guide.md
- production compileKotlin warnings are errors; test warnings are not yet a hard gate
- Detekt baseline ceiling: 461
- ktlint baseline ceiling: 171
- JaCoCo LINE minimum: 0.43, based on stable measurement minus about 2 percentage points
- boundary-import baseline: 39 maximum entries
- feature-dependency baseline: 41 maximum edges
- removal requires deleting the matching baseline row in the same change

docs/development/adr/0002-server-clean-architecture-with-archunit.md
- registry covers web, messaging/Kafka, scheduler, adapter security, and auth servlet-security inbound packages
- sessionimport is a registered WORKFLOW slice
- shared.adapter.in.web remains the Phase 0 common web-error contract
- boundary and feature baseline files represent removable debt, not approved target architecture

docs/development/architecture.md
- server verification describes the all-inbound registry and no-growth inventories
- Phase 2, not Phase 0, owns removal of actor, cross-adapter, and feature-cycle debt
```

Do not rewrite unrelated architecture or release sections.

- [ ] **Step 2: Update `CHANGELOG.md` under `Unreleased`**

Replace the placeholder highlight with a concise backend-quality entry that states:

```markdown
- **백엔드 품질 래칫:** 프로덕션 Kotlin 경고를 0건으로 만들고 신규 경고를 빌드 오류로 처리합니다. Detekt·ktlint baseline, JaCoCo 43%, 전체 인바운드 슬라이스 registry, 기존 경계 import와 기능 의존 edge를 단방향 gate로 고정해 새 품질·아키텍처 부채가 추가되지 않도록 했습니다. 외부 API, 권한, DB schema와 런타임 기능은 변경하지 않습니다.
```

- [ ] **Step 3: Run focused and canonical server verification**

```bash
./server/gradlew -p server compileKotlin \
  --rerun-tasks --no-build-cache --no-configuration-cache --no-daemon
./server/gradlew -p server architectureTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

Expected:

- `compileKotlin`: PASS with zero production warning lines.
- `architectureTest`: all quality, registry, inventory, and existing boundary tests PASS.
- `server-ci-check.sh`: ktlint, Detekt, unit, architecture, and JaCoCo 0.43 gate PASS.
- `integrationTest`: all Testcontainers integration tests PASS.

- [ ] **Step 4: Run documentation and public-repository safety checks**

```bash
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  docs/development/test-guide.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/architecture.md \
  CHANGELOG.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: `git diff --check` and both public-release commands PASS; the targeted sensitive-value scan prints no matches and therefore exits 1, which is the expected no-match result.

- [ ] **Step 5: Request an independent code review**

Use the `requesting-code-review` skill against the full implementation diff from the plan base through final HEAD. Require the reviewer to check:

```text
- no runtime/API/auth/DB behavior change
- warnings fixed rather than suppressed
- baseline counts and dependency inventories cannot grow
- removed debt must remove its baseline row
- all inbound package types are registered
- JaCoCo exclusions did not widen
- docs match the actual commands and thresholds
```

Address every confirmed P0/P1/P2 finding, rerun the smallest affected test, and then rerun the canonical server gate.

- [ ] **Step 6: Commit documentation and verified closeout**

```bash
git add \
  docs/development/test-guide.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/architecture.md \
  CHANGELOG.md
git commit -m "docs: record backend quality phase zero"
```

- [ ] **Step 7: Verify final HEAD and hand off Phase 1 planning**

```bash
git status --short --branch
git log --oneline --decorate --max-count=8
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
git diff --check HEAD~6..HEAD
```

Expected: the worktree is clean, the six narrow plan commits are visible, both server gates PASS on final HEAD, and the diff check is clean. Do not merge, push, deploy, call a live AI provider, or send email without a separate user instruction.

After final verification, create the next independent implementation plan for administrator-health failure containment and Flyway migration immutability using the fresh Phase 0 baseline; do not implement Phase 1 from this plan.

---

### Task 7: Human-Adjudicated Temporal Ratchet Tombstones

**Decision:** After the Phase 0 whole-plan breaker identified that a removed approved identity could later return without a control-data change, the user selected the recommended hermetic retired-identity tombstone design. This Task is the explicit human adjudication addendum and is not a second implicit final-review fix wave.

**Files:**
- Create: `server/config/detekt/phase-0-retired-identities.txt`
- Create: `server/config/ktlint/phase-0-retired-identities.txt`
- Create: `server/config/architecture/phase-0-retired-boundary-imports.txt`
- Create: `server/config/architecture/phase-0-retired-feature-dependencies.txt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerIdentityRatchet.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityBaselineReader.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`

**Interfaces:**
- Preserves each immutable approved Phase 0 seed at `461`, `171`, `39`, and `41` identities.
- Adds an append-only retired identity ledger for each ratchet.
- Requires the current and retired identities to form an exact disjoint partition of the approved seed.
- Keeps current source-to-baseline equality, JaCoCo `0.43`, all-inbound discovery, and exact OAuth repository exceptions unchanged.

- [ ] **Step 1: Add RED temporal-monotonicity fixtures**

For the shared ratchet helper and real-file contracts, add fixtures that prove:

```text
seed={a,b}, current={a,b}, retired={}       -> PASS
seed={a,b}, current={a},   retired={b}      -> PASS
seed={a,b}, current={a,b}, retired={b}      -> FAIL (reintroduction)
seed={a,b}, current={a},   retired={}       -> FAIL (removal without tombstone)
seed={a,b}, current={a,c}, retired={b}      -> FAIL (unapproved substitution)
```

Also prove that duplicate, malformed, or outside-seed retired rows fail closed. Run only `ServerQualityRatchetTest` and `ServerArchitectureInventoryTest` and capture the expected RED against the current subset-only helper.

- [ ] **Step 2: Implement the minimal hermetic partition contract**

Enforce all five invariants for every ratchet:

```text
approvedSeed.size == approvedCeiling
current subsetOf approvedSeed
retired subsetOf approvedSeed
current intersect retired == empty
current union retired == approvedSeed
```

The four initial retired ledgers contain only a public-safe comment because current baselines still exactly equal the approved seeds. Reuse the existing strict normalized identity readers; do not weaken malformed/duplicate rejection.

- [ ] **Step 3: Verify removal and reintroduction behavior**

Use temporary test fixtures only. Demonstrate that removing an identity requires moving it to retired, and that putting it back into current while it remains retired fails. Do not modify any current production debt or active baseline file.

- [ ] **Step 4: Update active contributor guidance**

Document the exact removal workflow in the active test guide and ADR:

1. remove source debt;
2. remove the matching current baseline row in the same change;
3. append that exact identity to the matching retired ledger;
4. never delete a retired identity or grow an approved seed.

Do not rewrite unrelated commands or architecture sections.

- [ ] **Step 5: Commit narrow slices**

```bash
git add \
  server/config/detekt/phase-0-retired-identities.txt \
  server/config/ktlint/phase-0-retired-identities.txt \
  server/config/architecture/phase-0-retired-boundary-imports.txt \
  server/config/architecture/phase-0-retired-feature-dependencies.txt \
  server/src/test/kotlin/com/readmates/architecture/ServerIdentityRatchet.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerQualityBaselineReader.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt
git commit -m "test(server): prevent quality debt reintroduction"

git add \
  docs/development/test-guide.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md
git commit -m "docs: record temporal quality ratchets"
```

- [ ] **Step 6: Run canonical and public-safety verification**

```bash
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerQualityRatchetTest \
  --tests com.readmates.architecture.ServerArchitectureInventoryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all commands PASS, the four retired ledgers contain zero identities, the worktree is clean, and no production/API/auth/DB/migration behavior changed.

- [ ] **Step 7: Request fresh task and whole-plan reviews**

Require the task reviewer to verify the partition algebra and realistic removal/reintroduction fixtures. Then request a fresh whole-plan review over `58fc2895..HEAD`, treating this human-approved addendum as the governing resolution of the prior breaker. Do not begin Phase 1 until both reviews are clean.
