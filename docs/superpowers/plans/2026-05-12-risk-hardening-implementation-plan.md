# ReadMates Risk Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four highest-priority repository risks found during the project-wide review without changing ReadMates feature behavior outside the affected security, release, and architecture boundaries.

**Architecture:** Keep BFF trust decisions inside server security filters, keep HTTP status mapping in inbound web adapters, keep database behavior behind outbound ports, and keep public release safety enforced by both candidate generation and scanner scripts. Each risk is implemented test-first and can be reviewed independently.

**Tech Stack:** Kotlin, Spring Boot, JUnit 5, Mockito, Awaitility, ArchUnit, Bash, Vite/React frontend checks, Cloudflare Pages Functions BFF.

---

## Source Documents

- Detailed implementation document: `docs/superpowers/specs/2026-05-12-risk-hardening-detailed-implementation.md`
- Architecture source of truth: `docs/development/architecture.md`
- Surface guides: `docs/agents/server.md`, `docs/agents/front.md`, `docs/agents/docs.md`

## File Map

### Create

- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretAuditMode.kt`: enum for audit recording policy.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretAuditExecutorConfig.kt`: bounded executor bean for BFF audit writes.

### Modify

- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt`: parse trusted BFF secrets from the same multi-secret setting as `BffSecretFilter`.
- `server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt`: cover multi-secret trusted client IP behavior.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`: apply audit mode and bounded executor.
- `server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterAuditTest.kt`: cover rotation-only, all, off, failure, and rejection behavior.
- `docs/deploy/oci-backend.md`: document audit mode and retention check in public-safe terms.
- `scripts/build-public-release-candidate.sh`: exclude generated frontend test artifacts.
- `scripts/public-release-check.sh`: reject generated frontend test artifacts.
- `scripts/verify-public-release-fixtures.sh`: prove the scanner rejects generated frontend artifact paths.
- `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`: expose platform admin persistence outcomes without web exceptions.
- `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminService.kt`: map port outcomes to `PlatformAdminException`.
- `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt`: remove `HttpStatus` and `ResponseStatusException` from persistence.
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`: prevent Spring Web/HTTP imports in persistence adapters.
- `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`: adjust or add assertions if port outcome changes expose a missing coverage gap.

## Task 1: Preflight Scope Check

**Files:**
- Read only: repository status and target files.

- [ ] **Step 1: Confirm branch state and unrelated edits**

Run:

```bash
git status --short --branch
```

Expected: the branch may be ahead of `origin/main`; unrelated existing edits such as `.gitignore` must be preserved.

- [ ] **Step 2: Confirm the current risk facts**

Run:

```bash
rg -n "readmates\\.bff-secret|readmates\\.security\\.bff\\.secrets|X-Readmates-Client-IP" server/src/main/kotlin/com/readmates/auth/infrastructure/security front/functions/_shared/proxy.ts
rg -n "CompletableFuture|bff_secret_rotation_audit|recordUsage" server/src/main/kotlin/com/readmates/auth
rg -n "test-results|playwright-report|coverage|nyc_output" scripts/build-public-release-candidate.sh scripts/public-release-check.sh scripts/verify-public-release-fixtures.sh
rg -n "ResponseStatusException|HttpStatus" server/src/main/kotlin/com/readmates/club/adapter/out/persistence server/src/main/kotlin/com/readmates/club/application
```

Expected: `RateLimitFilter` still only trusts legacy BFF secret, `BffSecretFilter` still audits every successful API request, release scripts still lack the frontend artifact paths, and `JdbcPlatformAdminAdapter` still imports Spring Web/HTTP types.

## Task 2: Align RateLimitFilter With BFF Multi-Secret Configuration

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt`

- [ ] **Step 1: Add failing tests for configured BFF secret list**

Append these tests to `RateLimitFilterTest` before the helper methods:

```kotlin
@Test
fun `uses configured primary bff secret for trusted client ip header`() {
    val port = RecordingRateLimitPort(RateLimitDecision.allowed())
    val filter = RateLimitFilter(
        rateLimitPort = port,
        properties = RateLimitProperties(enabled = true),
        legacyExpectedBffSecret = "",
        configuredBffSecretsRaw = "primary-bff-test,secondary-bff-test",
    )
    val firstRequest = invitationPreviewRequest("raw-token").apply {
        remoteAddr = "198.51.100.10"
        addHeader("X-Readmates-Bff-Secret", "primary-bff-test")
        addHeader("X-Readmates-Client-IP", "203.0.113.10")
    }
    val secondRequest = invitationPreviewRequest("raw-token").apply {
        remoteAddr = "198.51.100.10"
        addHeader("X-Readmates-Bff-Secret", "primary-bff-test")
        addHeader("X-Readmates-Client-IP", "203.0.113.20")
    }

    filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
    filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

    val keys = port.checks.map { it.key }
    assertEquals(2, keys.distinct().size)
    assertFalse(keys.any { it.contains("203.0.113") })
}

@Test
fun `uses configured secondary bff secret for trusted client ip header`() {
    val port = RecordingRateLimitPort(RateLimitDecision.allowed())
    val filter = RateLimitFilter(
        rateLimitPort = port,
        properties = RateLimitProperties(enabled = true),
        legacyExpectedBffSecret = "",
        configuredBffSecretsRaw = "primary-bff-test,secondary-bff-test",
    )
    val firstRequest = invitationPreviewRequest("raw-token").apply {
        remoteAddr = "198.51.100.10"
        addHeader("X-Readmates-Bff-Secret", "secondary-bff-test")
        addHeader("X-Readmates-Client-IP", "203.0.113.10")
    }
    val secondRequest = invitationPreviewRequest("raw-token").apply {
        remoteAddr = "198.51.100.10"
        addHeader("X-Readmates-Bff-Secret", "secondary-bff-test")
        addHeader("X-Readmates-Client-IP", "203.0.113.20")
    }

    filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
    filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

    val keys = port.checks.map { it.key }
    assertEquals(2, keys.distinct().size)
    assertFalse(keys.any { it.contains("203.0.113") })
}

@Test
fun `configured bff secret list takes priority over legacy bff secret`() {
    val port = RecordingRateLimitPort(RateLimitDecision.allowed())
    val filter = RateLimitFilter(
        rateLimitPort = port,
        properties = RateLimitProperties(enabled = true),
        legacyExpectedBffSecret = "legacy-bff-test",
        configuredBffSecretsRaw = "primary-bff-test",
    )
    val firstRequest = invitationPreviewRequest("raw-token").apply {
        remoteAddr = "198.51.100.10"
        addHeader("X-Readmates-Bff-Secret", "legacy-bff-test")
        addHeader("X-Readmates-Client-IP", "203.0.113.10")
    }
    val secondRequest = invitationPreviewRequest("raw-token").apply {
        remoteAddr = "198.51.100.10"
        addHeader("X-Readmates-Bff-Secret", "legacy-bff-test")
        addHeader("X-Readmates-Client-IP", "203.0.113.20")
    }

    filter.doFilter(firstRequest, MockHttpServletResponse(), MockFilterChain())
    filter.doFilter(secondRequest, MockHttpServletResponse(), MockFilterChain())

    val keys = port.checks.map { it.key }
    assertEquals(1, keys.distinct().size)
    assertFalse(keys.any { it.contains("203.0.113") })
}
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.RateLimitFilterTest'
```

Expected: compilation fails because `RateLimitFilter` does not yet expose `configuredBffSecretsRaw`.

- [ ] **Step 3: Update RateLimitFilter constructor and trusted secret parsing**

In `RateLimitFilter.kt`, replace the constructor secret fields with:

```kotlin
@param:Value("\${readmates.bff-secret:}")
private val legacyExpectedBffSecret: String = "",
@param:Value("\${READMATES_IP_HASH_BASE_SECRET:}")
private val ipHashBaseSecret: String = "",
@param:Value("\${readmates.security.bff.secrets:}")
private val configuredBffSecretsRaw: String = "",
```

Add this property near `log`:

```kotlin
private val trustedBffSecrets: List<String> = run {
    val configured = configuredBffSecretsRaw
        .split(',')
        .map { it.trim() }
        .filter { it.isNotEmpty() }
    val legacy = legacyExpectedBffSecret.trim()
        .takeIf { it.isNotEmpty() }
        ?.let { listOf(it) }
        ?: emptyList()
    configured.ifEmpty { legacy }
}
```

Replace `trustedClientIp` and `secretMatches` with:

```kotlin
private fun HttpServletRequest.trustedClientIp(): String? {
    if (trustedBffSecrets.isEmpty()) {
        return null
    }

    val provided = getHeader(BFF_SECRET_HEADER) ?: return null
    if (!secretMatchesAny(provided, trustedBffSecrets)) {
        return null
    }

    return getHeader(CLIENT_IP_HEADER).trimmedIdentifier()
}

private fun secretMatchesAny(provided: String, expectedSecrets: List<String>): Boolean {
    val providedBytes = provided.toByteArray(StandardCharsets.UTF_8)
    var matched = false
    for (expected in expectedSecrets) {
        if (MessageDigest.isEqual(providedBytes, expected.toByteArray(StandardCharsets.UTF_8))) {
            matched = true
        }
    }
    return matched
}
```

- [ ] **Step 4: Run the targeted test and confirm pass**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.RateLimitFilterTest'
```

Expected: all `RateLimitFilterTest` tests pass.

- [ ] **Step 5: Commit the rate limit slice**

Run:

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilter.kt server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt
git commit -m "fix: align rate limit bff secret trust"
```

Expected: one focused commit. If this work is being batched intentionally, record the completed files and defer the commit until the batch checkpoint.

## Task 3: Control BFF Secret Audit Volume

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretAuditMode.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretAuditExecutorConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterAuditTest.kt`
- Modify: `docs/deploy/oci-backend.md`

- [ ] **Step 1: Replace the primary audit expectation with default rotation-only behavior**

In `BffSecretFilterAuditTest.kt`, replace `primary secret records primary alias` with:

```kotlin
@Test
fun `default audit mode skips primary secret`() {
    val capturedAlias = AtomicReference<String>()
    val filter = BffSecretFilter(
        configuredSecretsRaw = "primary-bff-test,secondary-bff-test",
        legacyExpectedSecret = "",
        bffSecretRequired = true,
        allowedOriginPort = noopAllowedOriginPort(),
        ipHashBaseSecret = "",
        auditPort = capturingAuditPort(capturedAlias),
    )
    val request = MockHttpServletRequest("GET", "/api/something").apply {
        servletPath = "/api/something"
        addHeader(BffSecretFilter.BFF_SECRET_HEADER, "primary-bff-test")
    }

    filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

    Thread.sleep(100)
    assertEquals(null, capturedAlias.get())
}
```

- [ ] **Step 2: Add tests for all and off audit modes**

Add these tests to `BffSecretFilterAuditTest.kt`:

```kotlin
@Test
fun `all audit mode records primary secret`() {
    val capturedAlias = AtomicReference<String>()
    val filter = BffSecretFilter(
        configuredSecretsRaw = "primary-bff-test,secondary-bff-test",
        legacyExpectedSecret = "",
        bffSecretRequired = true,
        allowedOriginPort = noopAllowedOriginPort(),
        ipHashBaseSecret = "",
        auditPort = capturingAuditPort(capturedAlias),
        auditModeRaw = "all",
    )
    val request = MockHttpServletRequest("GET", "/api/something").apply {
        servletPath = "/api/something"
        addHeader(BffSecretFilter.BFF_SECRET_HEADER, "primary-bff-test")
    }

    filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

    await().atMost(Duration.ofSeconds(2)).until { capturedAlias.get() != null }
    assertEquals("primary", capturedAlias.get())
}

@Test
fun `off audit mode skips secondary secret`() {
    val capturedAlias = AtomicReference<String>()
    val filter = BffSecretFilter(
        configuredSecretsRaw = "primary-bff-test,secondary-bff-test",
        legacyExpectedSecret = "",
        bffSecretRequired = true,
        allowedOriginPort = noopAllowedOriginPort(),
        ipHashBaseSecret = "",
        auditPort = capturingAuditPort(capturedAlias),
        auditModeRaw = "off",
    )
    val request = MockHttpServletRequest("GET", "/api/something").apply {
        servletPath = "/api/something"
        addHeader(BffSecretFilter.BFF_SECRET_HEADER, "secondary-bff-test")
    }

    filter.doFilter(request, MockHttpServletResponse(), MockFilterChain())

    Thread.sleep(100)
    assertEquals(null, capturedAlias.get())
}
```

- [ ] **Step 3: Run the audit test and confirm failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.BffSecretFilterAuditTest'
```

Expected: compilation fails because `auditModeRaw` does not exist, or the default primary behavior still records.

- [ ] **Step 4: Create BffSecretAuditMode**

Create `BffSecretAuditMode.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

enum class BffSecretAuditMode {
    ROTATION_ONLY,
    ALL,
    OFF;

    fun shouldRecord(alias: String): Boolean =
        when (this) {
            ROTATION_ONLY -> alias != "primary"
            ALL -> true
            OFF -> false
        }

    companion object {
        fun from(raw: String): BffSecretAuditMode =
            when (raw.trim().lowercase()) {
                "", "rotation-only", "rotation_only" -> ROTATION_ONLY
                "all" -> ALL
                "off" -> OFF
                else -> throw IllegalArgumentException(
                    "readmates.security.bff.audit-mode must be one of rotation-only, all, off",
                )
            }
    }
}
```

- [ ] **Step 5: Create the bounded executor bean**

Create `BffSecretAuditExecutorConfig.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor

@Configuration
class BffSecretAuditExecutorConfig {
    @Bean("bffSecretAuditExecutor")
    fun bffSecretAuditExecutor(): ThreadPoolTaskExecutor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = 1
            maxPoolSize = 2
            queueCapacity = 1_000
            setThreadNamePrefix("bff-secret-audit-")
            setWaitForTasksToCompleteOnShutdown(false)
            initialize()
        }
}
```

- [ ] **Step 6: Update BffSecretFilter constructor imports and fields**

In `BffSecretFilter.kt`, remove:

```kotlin
import java.util.concurrent.CompletableFuture
```

Add:

```kotlin
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.core.task.TaskExecutor
import org.springframework.core.task.TaskRejectedException
```

Add these constructor parameters after `auditPort`:

```kotlin
@param:Value("\${readmates.security.bff.audit-mode:rotation-only}")
private val auditModeRaw: String = "rotation-only",
@param:Qualifier("bffSecretAuditExecutor")
@param:Autowired(required = false)
private val auditExecutor: TaskExecutor? = null,
```

Add this field near `secrets`:

```kotlin
private val auditMode = BffSecretAuditMode.from(auditModeRaw)
```

- [ ] **Step 7: Replace auditAsync**

Replace `auditAsync` in `BffSecretFilter.kt` with:

```kotlin
private fun auditAsync(alias: String, request: HttpServletRequest) {
    val port = auditPort ?: return
    if (!auditMode.shouldRecord(alias)) {
        return
    }

    val clientIpHash = ClientIpHashing.hashClientIp(request.remoteAddr, ipHashBaseSecret)
    val path = request.requestURI
    val task = Runnable {
        try {
            port.recordUsage(alias, clientIpHash, path)
        } catch (ex: Exception) {
            operationalLogger.warn("BFF audit record failed: {}", ex.message)
        }
    }

    try {
        auditExecutor?.execute(task) ?: task.run()
    } catch (ex: TaskRejectedException) {
        operationalLogger.warn("BFF audit record skipped: {}", ex.message)
    }
}
```

- [ ] **Step 8: Add executor rejection coverage**

Add this test to `BffSecretFilterAuditTest.kt`:

```kotlin
@Test
fun `audit executor rejection does not affect response`() {
    val filter = BffSecretFilter(
        configuredSecretsRaw = "primary-bff-test,secondary-bff-test",
        legacyExpectedSecret = "",
        bffSecretRequired = true,
        allowedOriginPort = noopAllowedOriginPort(),
        ipHashBaseSecret = "",
        auditPort = capturingAuditPort(AtomicReference()),
        auditExecutor = org.springframework.core.task.TaskExecutor {
            throw org.springframework.core.task.TaskRejectedException("queue full")
        },
    )
    val request = MockHttpServletRequest("GET", "/api/auth/me").apply {
        servletPath = "/api/auth/me"
        addHeader(BffSecretFilter.BFF_SECRET_HEADER, "secondary-bff-test")
    }
    val response = MockHttpServletResponse()

    filter.doFilter(request, response, MockFilterChain())

    assertEquals(200, response.status)
}
```

- [ ] **Step 9: Run the audit tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.BffSecretFilterAuditTest'
```

Expected: all audit tests pass.

- [ ] **Step 10: Document audit mode and retention**

In `docs/deploy/oci-backend.md`, add a short operational note near existing BFF secret rotation guidance:

````markdown
### BFF Secret Audit Volume

`readmates.security.bff.audit-mode` controls successful BFF secret audit writes.
Use `rotation-only` for normal operation so only non-primary aliases are recorded during rotation checks.
Use `all` only for short incident windows, and use `off` only when the audit table or database is under pressure and request authorization is already covered by other logs.

Retention can be handled with a scheduled database job:

```sql
delete from bff_secret_rotation_audit
where used_at < utc_timestamp() - interval 30 day;
```
````

- [ ] **Step 11: Commit the audit slice**

Run:

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretAuditMode.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretAuditExecutorConfig.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterAuditTest.kt docs/deploy/oci-backend.md
git commit -m "fix: limit bff secret audit volume"
```

Expected: one focused commit. If the implementation is batched, note these files in the checkpoint.

## Task 4: Block Frontend Test Artifacts From Public Release Candidates

**Files:**
- Modify: `scripts/build-public-release-candidate.sh`
- Modify: `scripts/public-release-check.sh`
- Modify: `scripts/verify-public-release-fixtures.sh`

- [ ] **Step 1: Add a failing fixture for frontend artifact paths**

In `scripts/verify-public-release-fixtures.sh`, add a fixture block after the existing forbidden-path fixture checks:

```bash
artifact_fixture="$fixture_root/artifact-paths"
mkdir -p "$artifact_fixture/front/test-results"
printf '{}\n' > "$artifact_fixture/front/test-results/.last-run.json"

if ./scripts/public-release-check.sh "$artifact_fixture" > "$artifact_fixture.out" 2> "$artifact_fixture.err"; then
  fail "public release check should reject front/test-results"
fi
assert_file_contains "$artifact_fixture.out" "forbidden candidate path: front/test-results/.last-run.json"
```

- [ ] **Step 2: Run the fixture script and confirm failure**

Run:

```bash
./scripts/verify-public-release-fixtures.sh
```

Expected: the new fixture fails because `front/test-results` is not yet forbidden.

- [ ] **Step 3: Exclude generated frontend artifacts from candidate copy**

In `scripts/build-public-release-candidate.sh`, update the `copy_dir "front"` call:

```bash
copy_dir "front" \
  --exclude='/output/' \
  --exclude='/node_modules/' \
  --exclude='/dist/' \
  --exclude='/test-results/' \
  --exclude='/playwright-report/' \
  --exclude='/coverage/' \
  --exclude='/.nyc_output/'
```

- [ ] **Step 4: Reject generated frontend artifacts in public-release-check**

In `scripts/public-release-check.sh`, add these cases inside `is_forbidden_path` near the existing `front/dist` checks:

```bash
front/test-results|front/test-results/*) return 0 ;;
front/playwright-report|front/playwright-report/*) return 0 ;;
front/coverage|front/coverage/*) return 0 ;;
front/.nyc_output|front/.nyc_output/*) return 0 ;;
```

- [ ] **Step 5: Run script syntax checks**

Run:

```bash
bash -n scripts/build-public-release-candidate.sh scripts/public-release-check.sh scripts/verify-public-release-fixtures.sh
```

Expected: no syntax output and exit code 0.

- [ ] **Step 6: Run fixture verification**

Run:

```bash
./scripts/verify-public-release-fixtures.sh
```

Expected: fixture verification passes, including the new frontend artifact path case.

- [ ] **Step 7: Build and scan the public release candidate**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: candidate builds and public-release check passes.

- [ ] **Step 8: Confirm excluded paths are absent from the candidate**

Run:

```bash
find .tmp/public-release-candidate/front \( -path '*/test-results*' -o -path '*/playwright-report*' -o -path '*/coverage*' -o -path '*/.nyc_output*' \) -print
```

Expected: no output.

- [ ] **Step 9: Commit the release safety slice**

Run:

```bash
git add scripts/build-public-release-candidate.sh scripts/public-release-check.sh scripts/verify-public-release-fixtures.sh
git commit -m "fix: exclude frontend artifacts from public release"
```

Expected: one focused commit.

## Task 5: Remove Spring Web Exceptions From Platform Admin Persistence

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`

- [ ] **Step 1: Add an architecture test for persistence Web/HTTP imports**

In `ServerArchitectureBoundaryTest.kt`, add this test after `persistence adapters require jdbc template directly`:

```kotlin
@Test
fun `persistence adapters do not depend on spring web http types`() {
    val forbiddenPrefixes = listOf(
        "org.springframework.http.",
        "org.springframework.web.",
    )
    val violations = persistenceAdapterSourceFiles()
        .flatMap { sourceFile ->
            sourceFile.readLines()
                .filter { line ->
                    val importName = line.trim().removePrefix("import ").trim()
                    forbiddenPrefixes.any { forbiddenPrefix -> importName.startsWith(forbiddenPrefix) }
                }
                .map { line -> "${sourceFile.relativeTo(sourceRoot())}: ${line.trim()}" }
        }
        .distinct()
        .sorted()

    assertTrue(
        violations.isEmpty(),
        "Persistence adapters must not depend on Spring HTTP/Web types:\n${violations.joinToString("\n")}",
    )
}
```

- [ ] **Step 2: Run architecture test and confirm failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

Expected: fails with `JdbcPlatformAdminAdapter.kt` importing `org.springframework.http.HttpStatus` and `org.springframework.web.server.ResponseStatusException`.

- [ ] **Step 3: Add port result type**

In `PlatformAdminPorts.kt`, add:

```kotlin
sealed interface CreateClubDomainResult {
    data class Created(val domain: PlatformAdminClubDomain) : CreateClubDomainResult
    data object ClubNotFound : CreateClubDomainResult
    data object DuplicateHostname : CreateClubDomainResult
}
```

Change `CreateClubDomainPort.createClubDomain` return type:

```kotlin
): CreateClubDomainResult
```

Change `UpdateClubDomainProvisioningPort.updateClubDomainProvisioning` return type:

```kotlin
): PlatformAdminClubDomain?
```

- [ ] **Step 4: Map create port outcomes in PlatformAdminService**

Add import:

```kotlin
import com.readmates.club.application.port.out.CreateClubDomainResult
```

Replace the direct `return createClubDomainPort.createClubDomain(...)` block with:

```kotlin
return when (
    val result = createClubDomainPort.createClubDomain(
        clubId = clubId,
        hostname = hostname,
        kind = command.kind,
        isPrimary = command.isPrimary,
    )
) {
    is CreateClubDomainResult.Created -> result.domain
    CreateClubDomainResult.ClubNotFound -> throw PlatformAdminException(
        PlatformAdminError.CLUB_DOMAIN_NOT_FOUND,
        "Club not found",
    )
    CreateClubDomainResult.DuplicateHostname -> throw PlatformAdminException(
        PlatformAdminError.CLUB_DOMAIN_CONFLICT,
        "Club domain hostname already exists",
    )
}
```

- [ ] **Step 5: Map nullable update outcome in PlatformAdminService**

Replace the return of `updateClubDomainProvisioningPort.updateClubDomainProvisioning(...)` with:

```kotlin
return updateClubDomainProvisioningPort.updateClubDomainProvisioning(
    domainId = domainId,
    status = status,
    verifiedAt = now.takeIf { status == ClubDomainStatus.ACTIVE },
    lastCheckedAt = now,
    errorCode = result.errorCode.takeIf { status == ClubDomainStatus.FAILED },
) ?: throw PlatformAdminException(PlatformAdminError.CLUB_DOMAIN_NOT_FOUND, "Club domain not found")
```

- [ ] **Step 6: Update JdbcPlatformAdminAdapter imports**

In `JdbcPlatformAdminAdapter.kt`, add:

```kotlin
import com.readmates.club.application.port.out.CreateClubDomainResult
```

Remove:

```kotlin
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
```

- [ ] **Step 7: Return port results from createClubDomain**

Change the method return type to:

```kotlin
): CreateClubDomainResult {
```

Replace the club missing branch:

```kotlin
if (clubExists == 0L) {
    return CreateClubDomainResult.ClubNotFound
}
```

Replace the duplicate catch:

```kotlin
} catch (_: DuplicateKeyException) {
    return CreateClubDomainResult.DuplicateHostname
}
```

Replace the final return:

```kotlin
return CreateClubDomainResult.Created(
    PlatformAdminClubDomain(
        id = domainId,
        clubId = clubId,
        hostname = hostname,
        kind = kind,
        status = ClubDomainStatus.ACTION_REQUIRED,
        isPrimary = primary,
        verifiedAt = null,
        lastCheckedAt = null,
        errorCode = null,
    ),
)
```

- [ ] **Step 8: Return nullable from updateClubDomainProvisioning**

Change the method return type to:

```kotlin
): PlatformAdminClubDomain? {
```

Replace the `updatedRows == 0` branch:

```kotlin
if (updatedRows == 0) {
    return null
}
```

Replace the final return:

```kotlin
return loadClubDomain(domainId)
```

- [ ] **Step 9: Run compile-focused platform admin tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest' --tests 'com.readmates.club.api.PlatformAdminControllerTest'
```

Expected: architecture and platform admin controller tests pass. If controller coverage reveals a changed status, adjust `PlatformAdminService` mapping, not the expected public API status.

- [ ] **Step 10: Search for forbidden persistence imports**

Run:

```bash
rg -n "ResponseStatusException|org\\.springframework\\.http" server/src/main/kotlin/com/readmates/club/adapter/out/persistence
```

Expected: no output.

- [ ] **Step 11: Commit the platform admin boundary slice**

Run:

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminService.kt server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt
git commit -m "fix: keep platform admin persistence web-free"
```

Expected: one focused commit.

## Task 6: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: server tests pass.

- [ ] **Step 2: Run frontend checks because BFF behavior and release checks touch frontend-adjacent surfaces**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: lint, tests, and build pass.

- [ ] **Step 3: Run E2E because auth/BFF trust behavior changed**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: E2E tests pass.

- [ ] **Step 4: Run public release checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
./scripts/verify-public-release-fixtures.sh
```

Expected: candidate build, candidate scan, and fixture verification pass.

- [ ] **Step 5: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/deploy/oci-backend.md docs/superpowers/specs/2026-05-12-risk-hardening-detailed-implementation.md docs/superpowers/plans/2026-05-12-risk-hardening-implementation-plan.md
```

Expected: no whitespace errors.

- [ ] **Step 6: Run targeted public-safety scans for changed docs**

Run:

```bash
rg -n '(/)Users/|readmates[.]kr|ocid1[.]|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}' docs/deploy/oci-backend.md docs/superpowers/specs/2026-05-12-risk-hardening-detailed-implementation.md docs/superpowers/plans/2026-05-12-risk-hardening-implementation-plan.md
```

Expected: no output.

- [ ] **Step 7: Review git diff**

Run:

```bash
git diff --stat
git diff -- server/src/main/kotlin/com/readmates/auth/infrastructure/security server/src/test/kotlin/com/readmates/auth/infrastructure/security scripts server/src/main/kotlin/com/readmates/club server/src/test/kotlin/com/readmates/architecture docs/deploy/oci-backend.md
```

Expected: diff is limited to the risk-hardening files listed in this plan plus expected generated `.tmp` changes that remain untracked.

## Task 7: Release Readiness Notes

**Files:**
- No required code files.
- Optional PR body or handoff note.

- [ ] **Step 1: Capture remaining validation limits**

If a local tool is missing, record the exact command and reason. Example:

```text
Skipped: shellcheck, because it is not installed in the local environment.
```

Expected: no skipped check is described as passing.

- [ ] **Step 2: Confirm unrelated work remains untouched**

Run:

```bash
git status --short --branch
```

Expected: existing unrelated files are still present if they were present before implementation, and no unrelated file was reverted.

- [ ] **Step 3: Prepare PR summary**

Use this summary format:

```markdown
## Summary
- Aligned rate limit trusted client IP handling with BFF multi-secret rotation settings.
- Reduced BFF secret audit writes to rotation-only by default with bounded async execution.
- Blocked generated frontend test artifacts from public release candidates and scanner fixtures.
- Removed Spring Web/HTTP exception types from platform admin persistence adapters.

## Checks
- ./server/gradlew -p server clean test
- pnpm --dir front lint
- pnpm --dir front test
- pnpm --dir front build
- pnpm --dir front test:e2e
- ./scripts/build-public-release-candidate.sh
- ./scripts/public-release-check.sh .tmp/public-release-candidate
- ./scripts/verify-public-release-fixtures.sh
```

Expected: the PR summary names the four changed surfaces and the checks actually run.
