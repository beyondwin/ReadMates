# Admin S6-T2 AI Ops Cost/Usage Windowed Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/admin/ai-ops` summary from a single month-to-date cost number to a 7/30/90-day windowed cost+usage trend with current-vs-prior delta, reusing the S8 analytics raw-count→pure-derive pattern, with no charting library.

**Architecture:** Server adds an aigen-local window enum and a `costTrend` block to `AiOpsSummary`; the JDBC adapter returns only raw cost+job-count for a window range, and the application service derives delta/availability (pure, unit-tested). The controller accepts `?window=`. The frontend adds `?window=` URL state, threads it through the summary query, and renders a delta metric with an honest empty state. The existing `monthToDateCostEstimateUsd` headline stays (additive, non-breaking).

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate, JUnit5/AssertJ (server); React/Vite, TanStack Query, react-router, Vitest, Playwright (frontend).

**Source spec:** `docs/superpowers/specs/2026-05-30-admin-vnext-s6-aiops-depth-s9-host-reinforcement-design.md` §5.1. This plan implements **Slice A only**; Slices B/C/D get their own plans.

**Charter constraints (do not violate):**
- No charting library — trend is current-vs-prior delta only.
- No AI generation state-machine changes.
- No provider raw error / transcript / result JSON exposure.
- aigen-local window enum — do **not** import `com.readmates.admin.analytics.*` (keeps the ai-ops filter model framework-independent).

---

## File Structure

**Server (create/modify):**
- Modify `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt` — add `AiOpsCostWindow`, `AiOpsTrendAvailability`, `AiOpsDeltaDirection`, `AiOpsWindowUsage`, `AiOpsCostTrend`; add `costTrend` to `AiOpsSummary`.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt` — add `windowUsageBetween`.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt` — add `window` param (defaulted) to `GetAiOpsSummaryUseCase.summary`.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt` — derive `costTrend`.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt` — implement `windowUsageBetween`.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt` — accept `?window=`.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt` — add `costTrend` to `AiOpsSummaryResponse`.

**Server tests (modify):**
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt` — configurable fake usage + trend derivation tests.
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepositoryTest.kt` — window usage query test.
- `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt` — window param + costTrend response.

**Frontend (modify):**
- `front/features/platform-admin/model/platform-admin-domain-types.ts` — add `costTrend` to `PlatformAdminAiOpsSummaryResponse`.
- `front/features/platform-admin/model/platform-admin-ai-ops-model.ts` — window URL-state helpers.
- `front/features/platform-admin/api/platform-admin-api.ts` — `fetchPlatformAdminAiOpsSummary(window?)`.
- `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts` — window-keyed summary query.
- `front/features/platform-admin/route/admin-ai-ops-data.ts` — seed window from search params.
- `front/features/platform-admin/route/admin-ai-ops-route.tsx` — window state + selector wiring.
- `front/features/platform-admin/ui/platform-admin-ai-ops.tsx` — render trend + window selector + view type.

**Frontend tests (modify/create co-located):**
- `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`
- `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- `front/tests/e2e/` — extend the existing admin ai-ops e2e.

**Docs:**
- `CHANGELOG.md` — Unreleased entry.

---

## Task 1: Server domain models for windowed cost trend

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/model/AiOpsCostWindowTest.kt` (create)

- [ ] **Step 1: Write the failing test**

Create `server/src/test/kotlin/com/readmates/aigen/application/model/AiOpsCostWindowTest.kt`:

```kotlin
package com.readmates.aigen.application.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AiOpsCostWindowTest {
    @Test
    fun `fromWire maps known wire values`() {
        assertThat(AiOpsCostWindow.fromWire("7d")).isEqualTo(AiOpsCostWindow.LAST_7D)
        assertThat(AiOpsCostWindow.fromWire("30d")).isEqualTo(AiOpsCostWindow.LAST_30D)
        assertThat(AiOpsCostWindow.fromWire("90d")).isEqualTo(AiOpsCostWindow.LAST_90D)
    }

    @Test
    fun `fromWire defaults to 30 days for null or unknown`() {
        assertThat(AiOpsCostWindow.fromWire(null)).isEqualTo(AiOpsCostWindow.LAST_30D)
        assertThat(AiOpsCostWindow.fromWire("bogus")).isEqualTo(AiOpsCostWindow.LAST_30D)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server compileTestKotlin`
Expected: FAIL — `AiOpsCostWindow` unresolved reference.

- [ ] **Step 3: Add the models**

In `AiGenerationOpsModels.kt`, add below the existing `enum class AiOpsAction { FORCE_CANCEL }` line:

```kotlin
enum class AiOpsCostWindow(val days: Long, val wire: String) {
    LAST_7D(7, "7d"),
    LAST_30D(30, "30d"),
    LAST_90D(90, "90d"),
    ;

    companion object {
        fun fromWire(value: String?): AiOpsCostWindow = entries.firstOrNull { it.wire == value } ?: LAST_30D
    }
}

enum class AiOpsTrendAvailability { AVAILABLE, NOT_ENOUGH_DATA }

enum class AiOpsDeltaDirection { UP, DOWN, FLAT, NONE }

data class AiOpsWindowUsage(
    val costUsd: BigDecimal,
    val jobCount: Long,
)

data class AiOpsCostTrend(
    val window: AiOpsCostWindow,
    val currentCostUsd: BigDecimal,
    val priorCostUsd: BigDecimal,
    val currentJobCount: Long,
    val priorJobCount: Long,
    val deltaDirection: AiOpsDeltaDirection,
    val availability: AiOpsTrendAvailability,
)
```

Then add `val costTrend: AiOpsCostTrend,` as the final field of `data class AiOpsSummary` (after `staleCandidateCount`).

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.model.AiOpsCostWindowTest"`
Expected: PASS. (Other modules referencing `AiOpsSummary` will not yet compile — fixed in Task 3/4; that is expected at this point.)

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt \
  server/src/test/kotlin/com/readmates/aigen/application/model/AiOpsCostWindowTest.kt
git commit -m "feat: add ai-ops windowed cost-trend domain models"
```

---

## Task 2: Adapter port + JDBC window usage query

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepositoryTest.kt`

- [ ] **Step 1: Write the failing test**

Add to `JdbcAiGenerationOpsAuditRepositoryTest`:

```kotlin
    @Test
    fun `windowUsageBetween sums cost and counts rows in the half-open range`() {
        val start = Instant.parse("2026-05-10T00:00:00Z")
        val end = Instant.parse("2026-05-20T00:00:00Z")
        // in range
        insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("0.1000"), createdAt = Instant.parse("2026-05-12T00:00:00Z"))
        insertAuditRow(provider = "CLAUDE", model = "claude-model", cost = BigDecimal("0.0500"), createdAt = Instant.parse("2026-05-19T23:59:59Z"))
        // out of range: before start, and on the exclusive end boundary
        insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("9.0000"), createdAt = Instant.parse("2026-05-09T23:59:59Z"))
        insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("9.0000"), createdAt = end)

        val usage = repository.windowUsageBetween(start, end)

        assertThat(usage.jobCount).isEqualTo(2L)
        assertThat(usage.costUsd).isEqualByComparingTo(BigDecimal("0.1500"))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server compileTestKotlin`
Expected: FAIL — `windowUsageBetween` unresolved.

- [ ] **Step 3: Add port method + JDBC implementation**

In `AiGenerationOpsAuditPorts.kt`, add the import `import com.readmates.aigen.application.model.AiOpsWindowUsage` and add to interface `AiGenerationAuditQueryPort`:

```kotlin
    fun windowUsageBetween(
        start: Instant,
        endExclusive: Instant,
    ): AiOpsWindowUsage
```

In `JdbcAiGenerationOpsAuditRepository.kt`, add the import `import com.readmates.aigen.application.model.AiOpsWindowUsage` and implement (place after `costSince`):

```kotlin
    override fun windowUsageBetween(
        start: Instant,
        endExclusive: Instant,
    ): AiOpsWindowUsage =
        jdbcTemplate.query(
            """
            select
              coalesce(sum(cost_estimate_usd), 0) as cost,
              count(*) as cnt
            from ai_generation_audit_log
            where created_at >= ?
              and created_at < ?
            """.trimIndent(),
            { rs, _ ->
                AiOpsWindowUsage(
                    costUsd = rs.getBigDecimal("cost"),
                    jobCount = rs.getLong("cnt"),
                )
            },
            Timestamp.from(start),
            Timestamp.from(endExclusive),
        ).first()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.adapter.out.persistence.JdbcAiGenerationOpsAuditRepositoryTest"`
Expected: PASS (integration-tagged; runs MySQL testcontainer).

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepositoryTest.kt
git commit -m "feat: query ai-ops window cost/usage from audit log"
```

---

## Task 3: Service derives costTrend

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`

- [ ] **Step 1: Write the failing test**

In `AiGenerationOpsServiceTest.kt`, replace the `EmptyAuditQueryPort` class with a configurable usage map and add trend tests. First, update the fake (replace the `windowUsageBetween` gap by adding a settable map keyed by start instant):

```kotlin
private class EmptyAuditQueryPort : AiGenerationAuditQueryPort {
    var jobById: AiOpsJobListItem? = null
    val usageByStart = mutableMapOf<Instant, AiOpsWindowUsage>()

    override fun countFailuresSince(since: Instant): Long = 0

    override fun costSince(since: Instant): BigDecimal = BigDecimal.ZERO

    override fun failureCodesSince(since: Instant): List<AiOpsFailureCodeCount> = emptyList()

    override fun providerCostsSince(since: Instant): List<AiOpsProviderCost> = emptyList()

    override fun windowUsageBetween(start: Instant, endExclusive: Instant): AiOpsWindowUsage =
        usageByStart[start] ?: AiOpsWindowUsage(BigDecimal.ZERO, 0)

    override fun listJobs(filters: AiOpsJobFilters): AiOpsJobList = AiOpsJobList(emptyList(), null)

    override fun findJobById(jobId: UUID): AiOpsJobListItem? = jobById
}
```

Add imports `com.readmates.aigen.application.model.AiOpsCostWindow`, `AiOpsDeltaDirection`, `AiOpsTrendAvailability`, `AiOpsWindowUsage`. Then add tests (clock is fixed at `2026-05-18T00:00:00Z`):

```kotlin
    @Test
    fun `summary derives 30d cost trend up when current exceeds prior`() {
        val now = Instant.parse("2026-05-18T00:00:00Z")
        auditQuery.usageByStart[now.minusSeconds(30 * 86400)] = AiOpsWindowUsage(BigDecimal("2.0000"), 5)
        auditQuery.usageByStart[now.minusSeconds(60 * 86400)] = AiOpsWindowUsage(BigDecimal("1.0000"), 4)

        val trend = service.summary(admin(PlatformAdminRole.OWNER)).costTrend

        assertThat(trend.window).isEqualTo(AiOpsCostWindow.LAST_30D)
        assertThat(trend.currentCostUsd).isEqualByComparingTo(BigDecimal("2.0000"))
        assertThat(trend.priorCostUsd).isEqualByComparingTo(BigDecimal("1.0000"))
        assertThat(trend.currentJobCount).isEqualTo(5L)
        assertThat(trend.deltaDirection).isEqualTo(AiOpsDeltaDirection.UP)
        assertThat(trend.availability).isEqualTo(AiOpsTrendAvailability.AVAILABLE)
    }

    @Test
    fun `summary reports NOT_ENOUGH_DATA when prior window had no jobs`() {
        val now = Instant.parse("2026-05-18T00:00:00Z")
        auditQuery.usageByStart[now.minusSeconds(7 * 86400)] = AiOpsWindowUsage(BigDecimal("0.5000"), 3)
        auditQuery.usageByStart[now.minusSeconds(14 * 86400)] = AiOpsWindowUsage(BigDecimal.ZERO, 0)

        val trend = service.summary(admin(PlatformAdminRole.OWNER), AiOpsCostWindow.LAST_7D).costTrend

        assertThat(trend.window).isEqualTo(AiOpsCostWindow.LAST_7D)
        assertThat(trend.availability).isEqualTo(AiOpsTrendAvailability.NOT_ENOUGH_DATA)
        assertThat(trend.deltaDirection).isEqualTo(AiOpsDeltaDirection.NONE)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server compileTestKotlin`
Expected: FAIL — `costTrend` and the second `summary` arg unresolved.

- [ ] **Step 3: Implement**

In `AiGenerationOpsUseCases.kt`, add import `com.readmates.aigen.application.model.AiOpsCostWindow` and change the interface method:

```kotlin
interface GetAiOpsSummaryUseCase {
    fun summary(
        admin: CurrentPlatformAdmin,
        window: AiOpsCostWindow = AiOpsCostWindow.LAST_30D,
    ): AiOpsSummary
}
```

In `AiGenerationOpsService.kt`, add imports for `AiOpsCostTrend`, `AiOpsCostWindow`, `AiOpsDeltaDirection`, `AiOpsTrendAvailability`, `AiOpsWindowUsage`. Change the override signature and append the trend:

```kotlin
    override fun summary(
        admin: CurrentPlatformAdmin,
        window: AiOpsCostWindow,
    ): AiOpsSummary {
        val now = clock.instant()
        val activeJobs = jobStore.loadActiveJobs()
        val monthStart =
            now
                .atZone(ZoneOffset.UTC)
                .withDayOfMonth(1)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
        return AiOpsSummary(
            activeJobCount = activeJobs.size,
            failedLast24h = auditQueryPort.countFailuresSince(now.minus(Duration.ofHours(24))),
            monthToDateCostEstimateUsd = auditQueryPort.costSince(monthStart),
            failureCodes = auditQueryPort.failureCodesSince(monthStart),
            providerCosts = auditQueryPort.providerCostsSince(monthStart),
            staleCandidateCount =
                activeJobs.count {
                    it.status in STALE_CANDIDATE_STATUSES &&
                        it.lastUpdatedAt.isBefore(now.minus(STALE_CANDIDATE_AGE))
                },
            costTrend = costTrend(now, window),
        )
    }

    private fun costTrend(
        now: java.time.Instant,
        window: AiOpsCostWindow,
    ): AiOpsCostTrend {
        val windowSeconds = Duration.ofDays(window.days)
        val currentStart = now.minus(windowSeconds)
        val priorStart = now.minus(windowSeconds.multipliedBy(2))
        val current = auditQueryPort.windowUsageBetween(currentStart, now)
        val prior = auditQueryPort.windowUsageBetween(priorStart, currentStart)
        val available = prior.jobCount > 0
        val direction =
            if (!available) {
                AiOpsDeltaDirection.NONE
            } else {
                when (current.costUsd.compareTo(prior.costUsd)) {
                    1 -> AiOpsDeltaDirection.UP
                    -1 -> AiOpsDeltaDirection.DOWN
                    else -> AiOpsDeltaDirection.FLAT
                }
            }
        return AiOpsCostTrend(
            window = window,
            currentCostUsd = current.costUsd,
            priorCostUsd = prior.costUsd,
            currentJobCount = current.jobCount,
            priorJobCount = prior.jobCount,
            deltaDirection = direction,
            availability = if (available) AiOpsTrendAvailability.AVAILABLE else AiOpsTrendAvailability.NOT_ENOUGH_DATA,
        )
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationOpsServiceTest"`
Expected: PASS (all existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt
git commit -m "feat: derive ai-ops windowed cost trend in summary service"
```

---

## Task 4: Controller window param + response DTO

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt`
- Test: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt`

- [ ] **Step 1: Write the failing test**

Open `AiGenerationOpsControllerTest.kt`, find the existing summary test for its setup style, and add a test asserting the window is parsed and `costTrend` is serialized. Mirror the existing mock/MockMvc style already in that file. Use this assertion shape (adapt the mock-setup lines to the file's existing helpers):

```kotlin
    @Test
    fun `summary passes window to use case and serializes cost trend`() {
        whenever(summaryUseCase.summary(any(), eq(AiOpsCostWindow.LAST_7D))).thenReturn(
            sampleSummary(
                costTrend = AiOpsCostTrend(
                    window = AiOpsCostWindow.LAST_7D,
                    currentCostUsd = BigDecimal("2.0000"),
                    priorCostUsd = BigDecimal("1.0000"),
                    currentJobCount = 5,
                    priorJobCount = 4,
                    deltaDirection = AiOpsDeltaDirection.UP,
                    availability = AiOpsTrendAvailability.AVAILABLE,
                ),
            ),
        )

        mockMvc.perform(get("/api/admin/ai-generation/summary?window=7d"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.costTrend.window").value("7d"))
            .andExpect(jsonPath("$.costTrend.currentCostUsd").value("2.0000"))
            .andExpect(jsonPath("$.costTrend.deltaDirection").value("UP"))
            .andExpect(jsonPath("$.costTrend.availability").value("AVAILABLE"))
    }
```

If the test file has no `sampleSummary(...)` helper, add one that builds an `AiOpsSummary` with empty lists/zeros and the given `costTrend` (default a `LAST_30D`, `NOT_ENOUGH_DATA`, `NONE`, zeros trend so existing tests still compile). Add imports for `AiOpsCostTrend`, `AiOpsCostWindow`, `AiOpsDeltaDirection`, `AiOpsTrendAvailability`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server compileTestKotlin`
Expected: FAIL — `costTrend` not on `AiOpsSummaryResponse`, `summary` has no window arg.

- [ ] **Step 3: Implement**

In `AiGenerationOpsController.kt`, add imports `import com.readmates.aigen.application.model.AiOpsCostWindow` and `import org.springframework.web.bind.annotation.RequestParam` (already imported). Change the summary mapping:

```kotlin
    @GetMapping("/summary")
    fun summary(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) window: String?,
    ): AiOpsSummaryResponse = AiOpsSummaryResponse.from(summaryUseCase.summary(admin, AiOpsCostWindow.fromWire(window)))
```

In `AiGenerationOpsWebDtos.kt`, add imports `import com.readmates.aigen.application.model.AiOpsCostTrend`. Add a `costTrend: AiOpsCostTrendResponse` field to `AiOpsSummaryResponse` (after `staleCandidateCount`), map it in `from(...)`, and add:

```kotlin
data class AiOpsCostTrendResponse(
    val window: String,
    val currentCostUsd: String,
    val priorCostUsd: String,
    val currentJobCount: Long,
    val priorJobCount: Long,
    val deltaDirection: String,
    val availability: String,
) {
    companion object {
        fun from(trend: AiOpsCostTrend): AiOpsCostTrendResponse =
            AiOpsCostTrendResponse(
                window = trend.window.wire,
                currentCostUsd = trend.currentCostUsd.toPlainString(),
                priorCostUsd = trend.priorCostUsd.toPlainString(),
                currentJobCount = trend.currentJobCount,
                priorJobCount = trend.priorJobCount,
                deltaDirection = trend.deltaDirection.name,
                availability = trend.availability.name,
            )
    }
}
```

In `AiOpsSummaryResponse.from`, add `costTrend = AiOpsCostTrendResponse.from(summary.costTrend),`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.adapter.in.web.AiGenerationOpsControllerTest"`
Expected: PASS.

- [ ] **Step 5: Server full check + commit**

Run: `./server/gradlew -p server unitTest`
Expected: PASS (whole server unit suite green).

```bash
git add server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt
git commit -m "feat: expose ai-ops window param and cost trend response"
```

---

## Task 5: Frontend contract type

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-domain-types.ts:147-154`

- [ ] **Step 1: Add `costTrend` to the response type**

In `platform-admin-domain-types.ts`, add to `PlatformAdminAiOpsSummaryResponse` (after `staleCandidateCount`):

```typescript
  costTrend: {
    window: "7d" | "30d" | "90d";
    currentCostUsd: string;
    priorCostUsd: string;
    currentJobCount: number;
    priorJobCount: number;
    deltaDirection: "UP" | "DOWN" | "FLAT" | "NONE";
    availability: "AVAILABLE" | "NOT_ENOUGH_DATA";
  };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir front exec tsc -p tsconfig.json --noEmit`
Expected: errors only where mock fixtures lack `costTrend` (fixed in Task 8 tests) — no errors in `platform-admin-domain-types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-domain-types.ts
git commit -m "feat: add ai-ops costTrend to admin summary contract type"
```

---

## Task 6: Frontend window URL-state model

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `platform-admin-ai-ops-model.test.ts`:

```typescript
import {
  AI_OPS_DEFAULT_WINDOW,
  aiOpsWindowFromSearchParams,
} from "./platform-admin-ai-ops-model";

describe("aiOpsWindowFromSearchParams", () => {
  it("reads a valid window", () => {
    expect(aiOpsWindowFromSearchParams(new URLSearchParams("window=7d"))).toBe("7d");
    expect(aiOpsWindowFromSearchParams(new URLSearchParams("window=90d"))).toBe("90d");
  });

  it("falls back to the default for missing or unknown window", () => {
    expect(aiOpsWindowFromSearchParams(new URLSearchParams())).toBe(AI_OPS_DEFAULT_WINDOW);
    expect(aiOpsWindowFromSearchParams(new URLSearchParams("window=year"))).toBe(AI_OPS_DEFAULT_WINDOW);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test platform-admin-ai-ops-model`
Expected: FAIL — `aiOpsWindowFromSearchParams` / `AI_OPS_DEFAULT_WINDOW` not exported.

- [ ] **Step 3: Implement**

Append to `platform-admin-ai-ops-model.ts`:

```typescript
export type AiOpsCostWindow = "7d" | "30d" | "90d";

export const AI_OPS_COST_WINDOWS: AiOpsCostWindow[] = ["7d", "30d", "90d"];

export const AI_OPS_DEFAULT_WINDOW: AiOpsCostWindow = "30d";

export function aiOpsWindowFromSearchParams(params: URLSearchParams): AiOpsCostWindow {
  const raw = params.get("window");
  return AI_OPS_COST_WINDOWS.includes(raw as AiOpsCostWindow) ? (raw as AiOpsCostWindow) : AI_OPS_DEFAULT_WINDOW;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test platform-admin-ai-ops-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-ai-ops-model.ts \
  front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts
git commit -m "feat: add ai-ops cost window url-state helpers"
```

---

## Task 7: Frontend api client + query thread window

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-api.ts:107-113`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
- Modify: `front/features/platform-admin/route/admin-ai-ops-data.ts`

- [ ] **Step 1: Update the api client**

In `platform-admin-api.ts`, replace `fetchPlatformAdminAiOpsSummary`:

```typescript
export function fetchPlatformAdminAiOpsSummary(window?: string) {
  const search = window ? `?window=${encodeURIComponent(window)}` : "";
  return readmatesFetch<PlatformAdminAiOpsSummaryResponse>(
    `/api/admin/ai-generation/summary${search}`,
    undefined,
    { clubSlug: undefined },
  );
}
```

- [ ] **Step 2: Update the query options**

In `platform-admin-ai-ops-queries.ts`, change the summary key + query to be window-keyed:

```typescript
export const platformAdminAiOpsKeys = {
  all: ["platform-admin", "ai-ops"] as const,
  summary: (window?: string) => [...platformAdminAiOpsKeys.all, "summary", window ?? null] as const,
  jobs: (filters?: PlatformAdminAiOpsFilters) =>
    [...platformAdminAiOpsKeys.all, "jobs", normalizeFilters(filters)] as const,
} as const;

export function platformAdminAiOpsSummaryQuery(window?: string) {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.summary(window),
    queryFn: () => fetchPlatformAdminAiOpsSummary(window),
  });
}
```

In `useForceCancelPlatformAdminAiJobMutation`, the existing `invalidateQueries({ queryKey: platformAdminAiOpsKeys.summary() })` still matches all windows because `summary()` (no arg) produces the prefix `[..., "summary", null]`; change it to invalidate the whole family instead for correctness:

```typescript
    onSuccess: () => queryClient.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
```

- [ ] **Step 3: Seed window in the loader**

In `admin-ai-ops-data.ts`, import `aiOpsWindowFromSearchParams` and seed the summary query with the window:

```typescript
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsWindowFromSearchParams,
  AI_OPS_DEFAULT_WINDOW,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
```

and inside the loader:

```typescript
    const filter = args
      ? aiOpsFilterFromSearchParams(new URL(args.request.url).searchParams)
      : EMPTY_AI_OPS_FILTER;
    const window = args
      ? aiOpsWindowFromSearchParams(new URL(args.request.url).searchParams)
      : AI_OPS_DEFAULT_WINDOW;
    await Promise.all([
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery(window)),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery(aiOpsFilterToQuery(filter))),
    ]);
```

- [ ] **Step 4: Typecheck + existing query test**

Run: `pnpm --dir front test platform-admin-ai-ops-queries`
Expected: PASS (update any summary-key assertion in that test to include the window segment if present).

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/api/platform-admin-api.ts \
  front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts \
  front/features/platform-admin/route/admin-ai-ops-data.ts \
  front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx
git commit -m "feat: thread ai-ops cost window through summary query and loader"
```

---

## Task 8: UI renders trend + window selector

**Files:**
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Test: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `platform-admin-ai-ops.test.tsx` (mirror the file's existing render helper / props):

```typescript
  it("shows the windowed cost trend with a delta direction", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={{
          activeJobCount: 0,
          failedLast24h: 0,
          monthToDateCostEstimateUsd: "1.0000",
          failureCodes: [],
          providerCosts: [],
          staleCandidateCount: 0,
          costTrend: {
            window: "30d",
            currentCostUsd: "2.0000",
            priorCostUsd: "1.0000",
            currentJobCount: 5,
            priorJobCount: 4,
            deltaDirection: "UP",
            availability: "AVAILABLE",
          },
        }}
        jobs={[]}
        window="30d"
      />,
    );
    expect(screen.getByText(/\$2\.0000/)).toBeInTheDocument();
    expect(screen.getByLabelText(/cost trend direction/i)).toHaveTextContent(/▲|UP/);
  });

  it("shows an honest empty state when the trend lacks prior data", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={{
          activeJobCount: 0,
          failedLast24h: 0,
          monthToDateCostEstimateUsd: "0.0000",
          failureCodes: [],
          providerCosts: [],
          staleCandidateCount: 0,
          costTrend: {
            window: "7d",
            currentCostUsd: "0.5000",
            priorCostUsd: "0.0000",
            currentJobCount: 3,
            priorJobCount: 0,
            deltaDirection: "NONE",
            availability: "NOT_ENOUGH_DATA",
          },
        }}
        jobs={[]}
        window="7d"
      />,
    );
    expect(screen.getByText("데이터 부족")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test platform-admin-ai-ops.test`
Expected: FAIL — `window` prop / `costTrend` view not handled.

- [ ] **Step 3: Implement the UI**

In `platform-admin-ai-ops.tsx`:

Add `costTrend` to `PlatformAdminAiOpsSummaryView` (after `staleCandidateCount`):

```typescript
  costTrend: {
    window: "7d" | "30d" | "90d";
    currentCostUsd: string;
    priorCostUsd: string;
    currentJobCount: number;
    priorJobCount: number;
    deltaDirection: "UP" | "DOWN" | "FLAT" | "NONE";
    availability: "AVAILABLE" | "NOT_ENOUGH_DATA";
  };
```

Add to `PlatformAdminAiOpsProps`:

```typescript
  window?: "7d" | "30d" | "90d";
  onSelectWindow?: (window: "7d" | "30d" | "90d") => void;
```

Destructure `window`, `onSelectWindow` in the component params. Add a trend block after the `platform-admin-ai-ops__metrics` div. Render the window selector (a small button group over `["7d","30d","90d"]` calling `onSelectWindow`), then:

```tsx
      <div className="platform-admin-ai-ops__trend" aria-label="cost trend">
        <div className="platform-admin-ai-ops__window" role="group" aria-label="cost window">
          {(["7d", "30d", "90d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className="btn btn-quiet btn-sm"
              aria-pressed={(window ?? summary?.costTrend.window) === w}
              onClick={() => onSelectWindow?.(w)}
            >
              {w}
            </button>
          ))}
        </div>
        {summary && summary.costTrend.availability === "NOT_ENOUGH_DATA" ? (
          <p className="small" style={{ color: "var(--text-3)" }}>데이터 부족</p>
        ) : (
          <p className="small">
            <span>${summary?.costTrend.currentCostUsd ?? "0.0000"}</span>{" "}
            <span aria-label="cost trend direction">{directionGlyph(summary?.costTrend.deltaDirection)}</span>{" "}
            <span style={{ color: "var(--text-3)" }}>직전 ${summary?.costTrend.priorCostUsd ?? "0.0000"}</span>
          </p>
        )}
      </div>
```

Add the helper near the bottom of the file:

```tsx
function directionGlyph(direction?: "UP" | "DOWN" | "FLAT" | "NONE"): string {
  switch (direction) {
    case "UP":
      return "▲";
    case "DOWN":
      return "▼";
    case "FLAT":
      return "→";
    default:
      return "·";
  }
}
```

In `admin-ai-ops-route.tsx`, add window state and wire it:

```tsx
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsSearchFromFilter,
  aiOpsWindowFromSearchParams,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
```

then inside the component:

```tsx
  const window = useMemo(() => aiOpsWindowFromSearchParams(searchParams), [searchParams]);
  const summaryQuery = useQuery(platformAdminAiOpsSummaryQuery(window));
```

Pass to the UI:

```tsx
        window={window}
        onSelectWindow={(next) => {
          const params = aiOpsSearchFromFilter(filter);
          params.set("window", next);
          setSearchParams(params);
        }}
```

Note: this preserves the active failure-code/club filter in the URL while changing the window (`aiOpsSearchFromFilter` serializes the current filter, then we add `window`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test platform-admin-ai-ops.test`
Expected: PASS.

- [ ] **Step 5: Frontend full checks + commit**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: PASS.

```bash
git add front/features/platform-admin/ui/platform-admin-ai-ops.tsx \
  front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx \
  front/features/platform-admin/route/admin-ai-ops-route.tsx
git commit -m "feat: render ai-ops windowed cost trend and window selector"
```

---

## Task 9: E2E — window toggle updates trend

**Files:**
- Modify: the existing admin ai-ops e2e spec under `front/tests/e2e/` (locate with the grep below) and its BFF/admin mock.

- [ ] **Step 1: Locate the existing ai-ops e2e + mock**

Run: `grep -rln "ai-generation/summary\|ai-ops\|AI Ops" front/tests/e2e`
Expected: find the spec and the mock that serves `/api/admin/ai-generation/summary`.

- [ ] **Step 2: Add `costTrend` to the mocked summary + a window assertion**

Add `costTrend` to the mocked summary payload (`window: "30d"`, `currentCostUsd: "2.0000"`, `priorCostUsd: "1.0000"`, `currentJobCount: 5`, `priorJobCount: 4`, `deltaDirection: "UP"`, `availability: "AVAILABLE"`) so the route renders. If the mock can vary by `?window=`, return `availability: "NOT_ENOUGH_DATA"` for `window=7d`. Add a test step: load `/admin/ai-ops`, assert the trend value renders; click the `7d` window button; assert the URL contains `window=7d` and (if mock varies) the empty state "데이터 부족" appears.

- [ ] **Step 3: Run the e2e**

Run: `pnpm --dir front test:e2e`
Expected: PASS (ai-ops spec green; no `@example.com` or raw JSON in rendered output).

- [ ] **Step 4: Commit**

```bash
git add front/tests/e2e
git commit -m "test: cover admin ai-ops cost window toggle e2e"
```

---

## Task 10: CHANGELOG + final verification

**Files:**
- Modify: `CHANGELOG.md` (Unreleased → Engineering)

- [ ] **Step 1: Add the Unreleased entry**

Under `## Unreleased` → `### Engineering`, add:

```markdown
- **platform-admin:** `/admin/ai-ops` summary now shows a 7/30/90-day cost/usage trend (`?window=`) with current-vs-prior delta. The JDBC adapter returns only raw window cost/count; the application service derives delta/availability (pure, unit-tested) and reports `NOT_ENOUGH_DATA` honestly when the prior window had no jobs. No charting library added; the month-to-date headline is unchanged. aigen-local window enum keeps the slice framework-independent.
```

- [ ] **Step 2: Full regression**

Run in sequence:
- `./server/gradlew -p server unitTest`
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- `pnpm --dir front test:e2e`

Expected: all PASS. If any check is skipped, report the exact command and reason.

- [ ] **Step 3: Public-safety quick scan**

Run: `git diff origin/main..HEAD -- front server | grep -niE "@example.com|@gmail|BEGIN .*KEY|ocid1\." || echo "clean"`
Expected: `clean` (no secrets/private data/token-shaped strings in the diff).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: record admin ai-ops cost/usage window trend in changelog"
```

---

## Self-Review Notes (verified before handoff)

- **Spec coverage (§5.1):** windowed trend (Tasks 1–4, 8), `?window=` URL state (Tasks 6–8), S8 raw→derive split (Tasks 2–3), no chart library (Task 8 uses text/glyph), `NOT_ENOUGH_DATA` honesty (Task 3 + Task 8 empty state), MTD headline preserved (Task 3 keeps the field), aigen-local enum / no analytics import (Task 1).
- **Type consistency:** `AiOpsCostTrend` fields (`window/currentCostUsd/priorCostUsd/currentJobCount/priorJobCount/deltaDirection/availability`) are identical across domain model (Task 1), web DTO (Task 4), frontend contract (Task 5), and UI view (Task 8). Window wire values `7d|30d|90d` consistent server↔front. `windowUsageBetween(start, endExclusive)` signature consistent across port (Task 2), JDBC impl (Task 2), and service caller (Task 3).
- **Compile-order caveat:** Task 1 leaves the server temporarily non-compiling (callers of `AiOpsSummary` lack `costTrend`) until Task 3/4. Run module-scoped `--tests` as written until Task 4's `unitTest`. The configurable fake (`EmptyAuditQueryPort`) is updated in Task 3 to satisfy the new port method.
- **Placeholder scan:** none — every code step contains concrete content.
