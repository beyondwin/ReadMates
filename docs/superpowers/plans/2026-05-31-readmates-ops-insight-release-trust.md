# ReadMates Ops Insight & Release Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/admin/analytics` with additive trend/export capability, align observability truth for AI queue depth, and reclassify release-readiness residual risk with current evidence.

**Architecture:** Keep `admin.analytics` as a read-only slice: JDBC returns raw counts, application service derives rates/availability/series, controller serializes a public-safe additive response. Frontend keeps route-first boundaries with pure model helpers for CSV/formatting and prop-driven UI. Observability and release-readiness updates are documentation-only truth alignment against current code, tests, scripts, and runbooks.

**Tech Stack:** Kotlin/Spring Boot/JDBC, React 19, TypeScript, Vite, TanStack Query, Vitest, Testing Library, Playwright, Markdown docs.

---

## File Structure

Create:

- `docs/superpowers/plans/2026-05-31-readmates-ops-insight-release-trust.md` — this implementation plan.

Modify:

- `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt` — additive raw series and derived KPI series DTOs.
- `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt` — derive KPI series from raw bucket rows.
- `server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt` — load fixed bucket rows using the existing read-only adapter.
- `server/src/main/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsController.kt` — keep schema `admin.analytics_overview.v1` and serialize additive `series`.
- `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt` — service derivation tests.
- `server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt` — response shape and public-safety assertions.
- `server/src/test/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapterTest.kt` — bucket coverage if the existing adapter integration test has seeded data helpers.
- `front/features/platform-admin/model/platform-admin-analytics-model.ts` — additive series types, CSV builder, filename builder, trend value formatting.
- `front/features/platform-admin/model/platform-admin-analytics-model.test.ts` — model and CSV tests.
- `front/features/platform-admin/ui/admin-analytics-overview.tsx` — trend table and CSV download link.
- `front/features/platform-admin/ui/admin-analytics-overview.test.tsx` — UI assertions for trend/export.
- `front/src/styles/globals.css` — responsive trend/export styling.
- `front/tests/e2e/admin-analytics.spec.ts` — route-heavy browser proof for trend/export and public safety.
- `docs/operations/observability/metrics-catalog.md` — AI queue depth meaning.
- `docs/operations/observability/dashboards.md` — dashboard panel label/purpose.
- `docs/operations/observability/alerts.md` — alert wording for queue depth.
- `docs/operations/runbooks/ai-session-generation.md` — `AiGenQueueLagHigh` current triage.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt` — KDoc/description text only.
- `docs/development/release-readiness-review.md` — current residual classification.
- `CHANGELOG.md` — `Unreleased` entry for analytics v2, observability truth cleanup, and release-readiness classification.

Do not create production Flyway migrations. Analytics v2 is read-only and additive.

## Task 1: Server Analytics Series Model and Service

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt`

- [ ] **Step 1: Add the failing service test**

Append this test to `AdminAnalyticsServiceTest`:

```kotlin
@Test
fun `derives KPI series with unavailable buckets kept honest`() {
    val raw =
        sample().copy(
            series = listOf(
                AdminAnalyticsSeriesRawPoint(
                    bucketStart = LocalDate.parse("2026-05-01"),
                    sessions = 0,
                    completedSessions = 0,
                    participants = 0,
                    goingMaybe = 0,
                    activeMembers = 0,
                    aiCost = BigDecimal.ZERO,
                    notifTerminal = 0,
                    notifSent = 0,
                ),
                AdminAnalyticsSeriesRawPoint(
                    bucketStart = LocalDate.parse("2026-05-08"),
                    sessions = 4,
                    completedSessions = 3,
                    participants = 8,
                    goingMaybe = 6,
                    activeMembers = 5,
                    aiCost = BigDecimal("2.0000"),
                    notifTerminal = 10,
                    notifSent = 9,
                ),
            ),
        )

    val overview = service(raw).overview(admin, AnalyticsWindow.LAST_30D)

    assertThat(overview.series).hasSize(5)
    val completionSeries = overview.series.first { it.key == KpiKey.SESSION_COMPLETION }
    assertThat(completionSeries.unit).isEqualTo(KpiUnit.PERCENT)
    assertThat(completionSeries.points.map { it.bucketStart.toString() })
        .containsExactly("2026-05-01", "2026-05-08")
    assertThat(completionSeries.points[0].availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
    assertThat(completionSeries.points[0].value).isNull()
    assertThat(completionSeries.points[1].availability).isEqualTo(Availability.AVAILABLE)
    assertThat(completionSeries.points[1].value).isEqualTo(75.0)

    val costSeries = overview.series.first { it.key == KpiKey.AI_COST_PER_SESSION }
    assertThat(costSeries.points[1].value).isEqualTo(0.5)
}
```

Add imports at the top of the test file:

```kotlin
import com.readmates.admin.analytics.application.model.AdminAnalyticsSeriesRawPoint
import com.readmates.admin.analytics.application.model.KpiUnit
import java.time.LocalDate
```

- [ ] **Step 2: Run the targeted service test and verify failure**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest'
```

Expected: FAIL because `AdminAnalyticsSeriesRawPoint` and `AdminAnalyticsOverview.series` are not defined.

- [ ] **Step 3: Add additive model types**

In `AdminAnalyticsModels.kt`, add the `series` property at the end of `AdminAnalyticsRawAggregates`:

```kotlin
    val benchmark: List<AdminAnalyticsBenchmarkRaw>,
    val series: List<AdminAnalyticsSeriesRawPoint> = emptyList(),
)
```

Add these model types below `AdminAnalyticsBenchmarkRaw`:

```kotlin
data class AdminAnalyticsSeriesRawPoint(
    val bucketStart: java.time.LocalDate,
    val sessions: Int,
    val completedSessions: Int,
    val participants: Int,
    val goingMaybe: Int,
    val activeMembers: Int,
    val aiCost: BigDecimal,
    val notifTerminal: Int,
    val notifSent: Int,
)
```

Add the `series` field at the end of `AdminAnalyticsOverview`:

```kotlin
    val clubBenchmark: AdminAnalyticsBenchmark,
    val series: List<AdminAnalyticsKpiSeries> = emptyList(),
)
```

Add these derived response models below `AdminAnalyticsKpiCard`:

```kotlin
data class AdminAnalyticsKpiSeries(
    val key: KpiKey,
    val unit: KpiUnit,
    val points: List<AdminAnalyticsKpiSeriesPoint>,
)

data class AdminAnalyticsKpiSeriesPoint(
    val bucketStart: java.time.LocalDate,
    val availability: Availability,
    val value: Double?,
)
```

- [ ] **Step 4: Derive series in the service**

In `AdminAnalyticsService.kt`, add imports:

```kotlin
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiSeries
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiSeriesPoint
import com.readmates.admin.analytics.application.model.AdminAnalyticsSeriesRawPoint
```

Change the `AdminAnalyticsOverview` construction:

```kotlin
        return AdminAnalyticsOverview(
            generatedAt = OffsetDateTime.now(clock),
            window = window,
            kpis = kpis(raw),
            clubBenchmark = benchmark(raw),
            series = series(raw.series),
        )
```

Add these private functions before `availability`:

```kotlin
    private fun series(points: List<AdminAnalyticsSeriesRawPoint>): List<AdminAnalyticsKpiSeries> =
        listOf(
            AdminAnalyticsKpiSeries(
                key = KpiKey.ACTIVE_MEMBERS,
                unit = KpiUnit.COUNT,
                points = points.map { point ->
                    AdminAnalyticsKpiSeriesPoint(
                        bucketStart = point.bucketStart,
                        availability = availability(point.sessions > 0),
                        value = if (point.sessions > 0) point.activeMembers.toDouble() else null,
                    )
                },
            ),
            AdminAnalyticsKpiSeries(
                key = KpiKey.SESSION_COMPLETION,
                unit = KpiUnit.PERCENT,
                points = points.map { point ->
                    val value = ratePercent(point.completedSessions, point.sessions)
                    AdminAnalyticsKpiSeriesPoint(
                        bucketStart = point.bucketStart,
                        availability = availability(value != null),
                        value = value,
                    )
                },
            ),
            AdminAnalyticsKpiSeries(
                key = KpiKey.RSVP_RATE,
                unit = KpiUnit.PERCENT,
                points = points.map { point ->
                    val value = ratePercent(point.goingMaybe, point.participants)
                    AdminAnalyticsKpiSeriesPoint(
                        bucketStart = point.bucketStart,
                        availability = availability(value != null),
                        value = value,
                    )
                },
            ),
            AdminAnalyticsKpiSeries(
                key = KpiKey.AI_COST_PER_SESSION,
                unit = KpiUnit.USD,
                points = points.map { point ->
                    val value = perSession(point.aiCost, point.sessions)
                    AdminAnalyticsKpiSeriesPoint(
                        bucketStart = point.bucketStart,
                        availability = availability(value != null),
                        value = value,
                    )
                },
            ),
            AdminAnalyticsKpiSeries(
                key = KpiKey.NOTIFICATION_DELIVERY,
                unit = KpiUnit.PERCENT,
                points = points.map { point ->
                    val value = ratePercent(point.notifSent, point.notifTerminal)
                    AdminAnalyticsKpiSeriesPoint(
                        bucketStart = point.bucketStart,
                        availability = availability(value != null),
                        value = value,
                    )
                },
            ),
        )
```

- [ ] **Step 5: Run the targeted service test and verify pass**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt \
  server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt \
  server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt
git commit -m "feat: derive admin analytics KPI series"
```

## Task 2: Server Analytics Bucket Loading and Response Shape

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsController.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapterTest.kt`

- [ ] **Step 1: Add controller response assertions**

In `PlatformAdminAnalyticsControllerTest`, extend `owner reads analytics overview with five kpis and no private data` with these jsonPath assertions:

```kotlin
                    jsonPath("$.series.length()") { value(5) }
                    jsonPath("$.series[0].key") { exists() }
                    jsonPath("$.series[0].points") { exists() }
```

- [ ] **Step 2: Run the controller test and verify failure**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest'
```

Expected: FAIL because the adapter returns no raw series and the serialized response has an empty or missing series assertion.

- [ ] **Step 3: Serialize the additive series field explicitly**

In `PlatformAdminAnalyticsController.kt`, change `AdminAnalyticsOverviewResponse` to include `series`:

```kotlin
data class AdminAnalyticsOverviewResponse(
    val schema: String,
    val generatedAt: String,
    val window: String,
    val kpis: Any,
    val clubBenchmark: Any,
    val series: Any,
) {
    companion object {
        fun from(overview: AdminAnalyticsOverview): AdminAnalyticsOverviewResponse =
            AdminAnalyticsOverviewResponse(
                schema = overview.schema,
                generatedAt = overview.generatedAt.toString(),
                window = overview.window.wire,
                kpis = overview.kpis,
                clubBenchmark = overview.clubBenchmark,
                series = overview.series,
            )
    }
}
```

- [ ] **Step 4: Add bucket loading to the JDBC adapter**

In `JdbcAdminAnalyticsAdapter.kt`, add imports:

```kotlin
import com.readmates.admin.analytics.application.model.AdminAnalyticsSeriesRawPoint
import java.sql.Date
import java.sql.Timestamp
import java.time.LocalDate
import java.time.ZoneOffset
```

Change the constructor field to use `clock`:

```kotlin
class JdbcAdminAnalyticsAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock,
) : AdminAnalyticsAggregatePort {
```

Add `series = series(window),` to `AdminAnalyticsRawAggregates` construction:

```kotlin
            benchmark = benchmark(w),
            series = series(window),
        )
```

Add these private functions before `scalarInt`:

```kotlin
    private fun series(window: AnalyticsWindow): List<AdminAnalyticsSeriesRawPoint> {
        val today = LocalDate.now(clock)
        val bucketDays = bucketDays(window)
        val firstStart = today.minusDays(window.days - 1)
        val buckets = mutableListOf<Pair<LocalDate, LocalDate>>()
        var start = firstStart
        while (!start.isAfter(today)) {
            val exclusiveEnd = start.plusDays(bucketDays).coerceAtMost(today.plusDays(1))
            buckets += start to exclusiveEnd
            start = exclusiveEnd
        }
        return buckets.map { (startInclusive, endExclusive) ->
            AdminAnalyticsSeriesRawPoint(
                bucketStart = startInclusive,
                sessions = sessionCountBetween(startInclusive, endExclusive),
                completedSessions = completedSessionCountBetween(startInclusive, endExclusive),
                participants = participantCountBetween(startInclusive, endExclusive, goingMaybeOnly = false),
                goingMaybe = participantCountBetween(startInclusive, endExclusive, goingMaybeOnly = true),
                activeMembers = activeMemberCountBetween(startInclusive, endExclusive),
                aiCost = aiCostBetween(startInclusive, endExclusive),
                notifTerminal = notifCountBetween(startInclusive, endExclusive, sentOnly = false),
                notifSent = notifCountBetween(startInclusive, endExclusive, sentOnly = true),
            )
        }
    }

    private fun bucketDays(window: AnalyticsWindow): Long =
        when (window) {
            AnalyticsWindow.LAST_7D -> 1
            AnalyticsWindow.LAST_30D -> 7
            AnalyticsWindow.LAST_90D -> 14
        }

    private fun sessionDateArgs(startInclusive: LocalDate, endExclusive: LocalDate): Array<Any> =
        arrayOf(Date.valueOf(startInclusive), Date.valueOf(endExclusive))

    private fun timestampArgs(startInclusive: LocalDate, endExclusive: LocalDate): Array<Any> =
        arrayOf(
            Timestamp.from(startInclusive.atStartOfDay().toInstant(ZoneOffset.UTC)),
            Timestamp.from(endExclusive.atStartOfDay().toInstant(ZoneOffset.UTC)),
        )

    private fun sessionCountBetween(startInclusive: LocalDate, endExclusive: LocalDate): Int =
        scalarInt(
            "select count(*) from sessions where session_date >= ? and session_date < ?",
            *sessionDateArgs(startInclusive, endExclusive),
        )

    private fun completedSessionCountBetween(startInclusive: LocalDate, endExclusive: LocalDate): Int =
        scalarInt(
            "select count(*) from sessions where state in ('CLOSED','PUBLISHED') and session_date >= ? and session_date < ?",
            *sessionDateArgs(startInclusive, endExclusive),
        )

    private fun participantCountBetween(startInclusive: LocalDate, endExclusive: LocalDate, goingMaybeOnly: Boolean): Int {
        val rsvpClause = if (goingMaybeOnly) " and sp.rsvp_status in ('GOING','MAYBE')" else ""
        return scalarInt(
            """
            select count(*)
            from session_participants sp
            join sessions s on s.id = sp.session_id
            where s.session_date >= ? and s.session_date < ?$rsvpClause
            """.trimIndent(),
            *sessionDateArgs(startInclusive, endExclusive),
        )
    }

    private fun activeMemberCountBetween(startInclusive: LocalDate, endExclusive: LocalDate): Int =
        scalarInt(
            """
            select count(distinct sp.membership_id)
            from session_participants sp
            join sessions s on s.id = sp.session_id
            where s.session_date >= ? and s.session_date < ?
            """.trimIndent(),
            *sessionDateArgs(startInclusive, endExclusive),
        )

    private fun aiCostBetween(startInclusive: LocalDate, endExclusive: LocalDate): BigDecimal =
        jdbcTemplate.queryForObject(
            "select coalesce(sum(cost_estimate_usd), 0) from ai_generation_audit_log where created_at >= ? and created_at < ?",
            BigDecimal::class.java,
            *timestampArgs(startInclusive, endExclusive),
        ) ?: BigDecimal.ZERO

    private fun notifCountBetween(startInclusive: LocalDate, endExclusive: LocalDate, sentOnly: Boolean): Int {
        val statusClause = if (sentOnly) "status = 'SENT'" else "status in ('SENT','FAILED','DEAD')"
        return scalarInt(
            "select count(*) from notification_deliveries where $statusClause and updated_at >= ? and updated_at < ?",
            *timestampArgs(startInclusive, endExclusive),
        )
    }
```

- [ ] **Step 5: Run the controller test and adapter test**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.analytics.adapter.out.persistence.JdbcAdminAnalyticsAdapterTest'
```

Expected: PASS. If the adapter test has no assertion for series, add one that calls `loadAggregates(AnalyticsWindow.LAST_30D)` and asserts `raw.series.isNotEmpty()` and `raw.series.size <= 5`.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt \
  server/src/main/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsController.kt \
  server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt \
  server/src/test/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapterTest.kt
git commit -m "feat: expose admin analytics trend buckets"
```

## Task 3: Frontend Analytics Model and CSV Export

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`

- [ ] **Step 1: Add failing model tests**

Append these tests to `platform-admin-analytics-model.test.ts`:

```ts
it("formats trend point values and keeps unavailable buckets honest", () => {
  expect(formatSeriesPointValue({ bucketStart: "2026-05-01", availability: "NOT_ENOUGH_DATA", value: null }, "PERCENT")).toBe("데이터 부족");
  expect(formatSeriesPointValue({ bucketStart: "2026-05-08", availability: "AVAILABLE", value: 75 }, "PERCENT")).toBe("75%");
  expect(formatSeriesPointValue({ bucketStart: "2026-05-08", availability: "AVAILABLE", value: 0.5 }, "USD")).toBe("$0.5000");
});

it("builds a CSV export from KPI series and club benchmark rows", () => {
  const overview: AdminAnalyticsOverview = {
    schema: "admin.analytics_overview.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    window: "30d",
    kpis: [card({ key: "SESSION_COMPLETION", unit: "PERCENT", current: 80, prior: 50 })],
    clubBenchmark: {
      availability: "AVAILABLE",
      rows: [
        {
          clubId: "club-1",
          slug: "fiction",
          name: "Fiction Club",
          activeMembers: 8,
          sessionCompletionRate: 75,
          rsvpRate: 90,
          aiCostUsd: "1.0000",
          notificationDeliveryRate: 95,
        },
      ],
    },
    series: [
      {
        key: "SESSION_COMPLETION",
        unit: "PERCENT",
        points: [
          { bucketStart: "2026-05-01", availability: "AVAILABLE", value: 75 },
          { bucketStart: "2026-05-08", availability: "NOT_ENOUGH_DATA", value: null },
        ],
      },
    ],
  };

  const csv = buildAnalyticsCsv(overview);

  expect(csv).toContain("section,window,kpi,bucketStart,value,availability,clubSlug,clubName");
  expect(csv).toContain("series,30d,세션 완료율,2026-05-01,75%,AVAILABLE,,");
  expect(csv).toContain("series,30d,세션 완료율,2026-05-08,데이터 부족,NOT_ENOUGH_DATA,,");
  expect(csv).toContain("benchmark,30d,,,,AVAILABLE,fiction,Fiction Club");
  expect(analyticsCsvFilename(overview)).toBe("readmates-admin-analytics-30d-2026-05-30.csv");
});
```

Update the import list:

```ts
  buildAnalyticsCsv,
  analyticsCsvFilename,
  formatSeriesPointValue,
  type AdminAnalyticsOverview,
```

- [ ] **Step 2: Run the model test and verify failure**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-analytics-model.test.ts
```

Expected: FAIL because `series`, `formatSeriesPointValue`, `buildAnalyticsCsv`, and `analyticsCsvFilename` are not defined.

- [ ] **Step 3: Add frontend types and helpers**

In `platform-admin-analytics-model.ts`, add these types after `AdminAnalyticsKpiCard`:

```ts
export type AdminAnalyticsKpiSeriesPoint = {
  bucketStart: string;
  availability: Availability;
  value: number | null;
};

export type AdminAnalyticsKpiSeries = {
  key: KpiKey;
  unit: KpiUnit;
  points: AdminAnalyticsKpiSeriesPoint[];
};
```

Add `series` to `AdminAnalyticsOverview`:

```ts
  clubBenchmark: AdminAnalyticsBenchmark;
  series: AdminAnalyticsKpiSeries[];
};
```

Add these helpers below `formatKpiValue`:

```ts
export function formatSeriesPointValue(point: AdminAnalyticsKpiSeriesPoint, unit: KpiUnit): string {
  if (point.availability === "NOT_ENOUGH_DATA" || point.value === null) {
    return "데이터 부족";
  }
  switch (unit) {
    case "PERCENT":
      return `${point.value}%`;
    case "USD":
      return `$${point.value.toFixed(4)}`;
    case "COUNT":
      return `${point.value}`;
  }
}

export function analyticsCsvFilename(overview: AdminAnalyticsOverview): string {
  const date = overview.generatedAt.slice(0, 10);
  return `readmates-admin-analytics-${overview.window}-${date}.csv`;
}

export function analyticsCsvHref(overview: AdminAnalyticsOverview): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(buildAnalyticsCsv(overview))}`;
}

export function buildAnalyticsCsv(overview: AdminAnalyticsOverview): string {
  const rows = [
    ["section", "window", "kpi", "bucketStart", "value", "availability", "clubSlug", "clubName"],
  ];

  for (const series of overview.series) {
    for (const point of series.points) {
      rows.push([
        "series",
        overview.window,
        labelKpi(series.key),
        point.bucketStart,
        formatSeriesPointValue(point, series.unit),
        point.availability,
        "",
        "",
      ]);
    }
  }

  for (const row of overview.clubBenchmark.rows) {
    rows.push([
      "benchmark",
      overview.window,
      "",
      "",
      "",
      overview.clubBenchmark.availability,
      row.slug,
      row.name,
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}
```

- [ ] **Step 4: Update existing test fixtures in frontend tests**

Every `AdminAnalyticsOverview` object in frontend tests must include `series: []` unless the test needs real series rows. Update:

```bash
front/features/platform-admin/ui/admin-analytics-overview.test.tsx
front/tests/e2e/admin-analytics.spec.ts
```

The minimal additive fixture line is:

```ts
  series: [],
```

- [ ] **Step 5: Run the model test and verify pass**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-analytics-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-analytics-model.ts \
  front/features/platform-admin/model/platform-admin-analytics-model.test.ts \
  front/features/platform-admin/ui/admin-analytics-overview.test.tsx \
  front/tests/e2e/admin-analytics.spec.ts
git commit -m "feat: add admin analytics CSV model helpers"
```

## Task 4: Frontend Analytics Trend and Export UI

**Files:**
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
- Modify: `front/src/styles/globals.css`

- [ ] **Step 1: Add failing UI assertions**

In `admin-analytics-overview.test.tsx`, change the `overview` fixture to include this `series`:

```ts
  series: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      points: [
        { bucketStart: "2026-05-01", availability: "AVAILABLE", value: 75 },
        { bucketStart: "2026-05-08", availability: "NOT_ENOUGH_DATA", value: null },
      ],
    },
  ],
```

Add assertions to the existing render test:

```ts
    expect(screen.getByRole("heading", { name: "KPI 추세" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "KPI 추세" })).toBeInTheDocument();
    expect(screen.getByText("2026-05-01")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    const exportLink = screen.getByRole("link", { name: "CSV 내려받기" });
    expect(exportLink).toHaveAttribute("download", "readmates-admin-analytics-30d-2026-05-30.csv");
    expect(exportLink.getAttribute("href")).toContain("data:text/csv");
```

- [ ] **Step 2: Run the UI test and verify failure**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-analytics-overview.test.tsx
```

Expected: FAIL because the trend section and CSV link are not rendered.

- [ ] **Step 3: Render trend and CSV controls**

Update imports in `admin-analytics-overview.tsx`:

```ts
  analyticsCsvFilename,
  analyticsCsvHref,
  formatSeriesPointValue,
  type AdminAnalyticsKpiSeries,
```

Inside the conditional block that currently renders KPI cards when `overview` is present, render the export action, KPI cards, series table, and benchmark:

```tsx
        <>
          <div className="admin-analytics__actions">
            <a
              className="admin-analytics__export"
              href={analyticsCsvHref(overview)}
              download={analyticsCsvFilename(overview)}
            >
              CSV 내려받기
            </a>
          </div>
          <ul className="admin-analytics__kpis" aria-label="핵심 지표">
            {overview.kpis.map((card) => (
              <AdminAnalyticsKpiTile key={card.key} card={card} />
            ))}
          </ul>
          <AdminAnalyticsSeriesTable series={overview.series} />
          <AdminAnalyticsBenchmarkTable benchmark={overview.clubBenchmark} />
        </>
```

Add this component above `AdminAnalyticsBenchmarkTable`:

```tsx
function AdminAnalyticsSeriesTable({ series }: { series: AdminAnalyticsKpiSeries[] }) {
  if (series.length === 0 || series.every((item) => item.points.length === 0)) {
    return <p className="admin-analytics__benchmark-empty">KPI 추세를 만들 충분한 데이터가 없습니다.</p>;
  }

  const bucketStarts = series[0]?.points.map((point) => point.bucketStart) ?? [];

  return (
    <section className="admin-analytics__trend" aria-labelledby="admin-analytics-trends-heading">
      <h2 id="admin-analytics-trends-heading">KPI 추세</h2>
      <div className="admin-analytics__trend-scroll">
        <table className="admin-analytics__trend-table" aria-label="KPI 추세">
          <thead>
            <tr>
              <th scope="col">지표</th>
              {bucketStarts.map((bucketStart) => (
                <th key={bucketStart} scope="col">{bucketStart}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr key={item.key}>
                <th scope="row">{labelKpi(item.key)}</th>
                {bucketStarts.map((bucketStart) => {
                  const point = item.points.find((candidate) => candidate.bucketStart === bucketStart);
                  return (
                    <td key={bucketStart}>
                      {point ? formatSeriesPointValue(point, item.unit) : "데이터 부족"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add styles**

In `front/src/styles/globals.css`, add these rules after `.admin-analytics__window[aria-pressed="true"]`:

```css
.admin-analytics__actions {
  display: flex;
  justify-content: flex-end;
}

.admin-analytics__export {
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  padding: 7px 14px;
  color: inherit;
  text-decoration: none;
  background: var(--bg);
}

.admin-analytics__export:focus-visible,
.admin-analytics__window:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.admin-analytics__trend {
  display: grid;
  gap: 12px;
}

.admin-analytics__trend h2 {
  margin: 0;
  font-size: 18px;
}

.admin-analytics__trend-scroll {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg);
}

.admin-analytics__trend-table {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
}

.admin-analytics__trend-table th,
.admin-analytics__trend-table td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run the UI test and verify pass**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-analytics-overview.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/ui/admin-analytics-overview.tsx \
  front/features/platform-admin/ui/admin-analytics-overview.test.tsx \
  front/src/styles/globals.css
git commit -m "feat: render admin analytics trends and CSV export"
```

## Task 5: Analytics E2E Proof

**Files:**
- Modify: `front/tests/e2e/admin-analytics.spec.ts`

- [ ] **Step 1: Update the mocked overview**

In `overview(windowValue)`, add a non-empty `clubBenchmark.rows` and `series`:

```ts
    clubBenchmark: {
      availability: "AVAILABLE",
      rows: [
        {
          clubId: "club-1",
          slug: "fiction",
          name: "Fiction Club",
          activeMembers: 8,
          sessionCompletionRate: 75,
          rsvpRate: 90,
          aiCostUsd: "1.0000",
          notificationDeliveryRate: 95,
        },
      ],
    },
    series: [
      {
        key: "SESSION_COMPLETION",
        unit: "PERCENT",
        points: [
          { bucketStart: "2026-05-01", availability: "AVAILABLE", value: windowValue === "7d" ? 65 : 75 },
          { bucketStart: "2026-05-08", availability: "NOT_ENOUGH_DATA", value: null },
        ],
      },
    ],
```

- [ ] **Step 2: Add failing E2E assertions**

In the test body after the `80%` assertion, replace the old benchmark empty assertion with:

```ts
  await expect(page.getByRole("heading", { name: "KPI 추세" })).toBeVisible();
  await expect(page.getByRole("table", { name: "KPI 추세" })).toBeVisible();
  await expect(page.getByText("2026-05-01")).toBeVisible();
  await expect(page.getByText("75%")).toBeVisible();
  await expect(page.getByText("Fiction Club")).toBeVisible();
  await expect(page.getByRole("link", { name: "CSV 내려받기" })).toHaveAttribute(
    "download",
    /readmates-admin-analytics-30d-2026-05-30\.csv/,
  );
```

After switching to 7d, add:

```ts
  await expect(page.getByText("65%")).toBeVisible();
```

- [ ] **Step 3: Run the targeted E2E spec**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

Expected: PASS after Tasks 3 and 4. If the local dev server port is occupied, Playwright config will allocate its configured port; do not change the spec to depend on a private host.

- [ ] **Step 4: Commit**

```bash
git add front/tests/e2e/admin-analytics.spec.ts
git commit -m "test: cover admin analytics trend export flow"
```

## Task 6: Observability Truth Cleanup

**Files:**
- Modify: `docs/operations/observability/metrics-catalog.md`
- Modify: `docs/operations/observability/dashboards.md`
- Modify: `docs/operations/observability/alerts.md`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a docs consistency check command and verify current mismatch**

Run:

```bash
rg -n "placeholder|consumer lag|Queue lag|Kafka consumer lag wiring" \
  docs/operations/observability/metrics-catalog.md \
  docs/operations/observability/dashboards.md \
  docs/operations/observability/alerts.md \
  docs/operations/runbooks/ai-session-generation.md \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt
```

Expected: output includes `metrics-catalog.md` placeholder wording, `dashboards.md` Queue lag wording, `ai-session-generation.md` placeholder/current-status wording, and `AiGenerationMetrics.kt` KDoc that still says consumer lag.

- [ ] **Step 2: Update `metrics-catalog.md`**

Replace the `readmates.aigen.queue.depth` row with:

```markdown
| `readmates.aigen.queue.depth` | gauge | (없음) | 건수 | Redis AI job store에서 `PENDING` + `RUNNING` active job 수를 scrape 시점에 읽은 backlog. `AiGenerationQueueDepthGaugeBinder`가 `AiGenerationJobStore.loadActiveJobs()`에 바인딩한다. | `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`, `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt` | dashboards.md#ai-session-generation | alerts.md#aigenqueuelaghigh |
```

Replace the follow-up bullet:

```markdown
- Kafka consumer group lag을 별도 Prometheus metric으로 노출할지 검토 — 현재 `readmates.aigen.queue.depth`는 Redis active job backlog 의미로 고정합니다.
```

- [ ] **Step 3: Update dashboard and alert wording**

In `dashboards.md`, replace:

```markdown
| Queue lag | `readmates_aigen_queue_depth` | Kafka consumer lag wiring 후 backlog 확인 |
```

with:

```markdown
| Active job backlog | `readmates_aigen_queue_depth` | Redis job store 기준 `PENDING` + `RUNNING` AI job 적체 확인 |
```

In `alerts.md`, replace:

```markdown
| `AiGenQueueLagHigh` | warn | `readmates_aigen_queue_depth > 50` for 5m | `#queue-lag-high` |
```

with:

```markdown
| `AiGenQueueLagHigh` | warn | Redis active AI job backlog `readmates_aigen_queue_depth > 50` for 5m | `#queue-lag-high` |
```

- [ ] **Step 4: Update AI runbook queue section**

In `docs/operations/runbooks/ai-session-generation.md`, replace the `AiGenQueueLagHigh` bullet block with:

```markdown
- **조건**: Redis active AI job backlog `readmates_aigen_queue_depth > 50` 5m 지속. 이 gauge는 `PENDING` + `RUNNING` job 수를 `AiGenerationJobStore.loadActiveJobs()`에서 읽는다.
- **즉시 triage**: `/admin/ai-ops`에서 `PENDING`/`RUNNING` job을 확인하고, worker 로그, Redis 연결 상태, provider latency burst를 순서대로 본다.
- **Kafka 확인**: Kafka consumer group lag은 같은 증상의 원인일 수 있지만 이 metric 자체의 의미는 아니다. Kafka lag이 필요하면 별도 consumer lag metric 또는 broker 도구로 확인한다.
```

- [ ] **Step 5: Update KDoc in `AiGenerationMetrics.kt`**

Replace the `registerQueueDepthGauge` KDoc with:

```kotlin
    /**
     * `readmates_aigen_queue_depth` — gauge bound to [supplier].
     *
     * Calling this multiple times replaces the active supplier; the gauge itself
     * is registered exactly once with Micrometer so Prometheus retains a stable
     * time series identity. `AiGenerationQueueDepthGaugeBinder` wires this to the
     * Redis-backed active job count (`PENDING` + `RUNNING`). Kafka consumer group
     * lag is a separate operational signal and should not be described with this
     * metric name.
     */
```

Change the gauge description string:

```kotlin
                .description("Active AI generation jobs in Redis job store")
```

- [ ] **Step 6: Add CHANGELOG entry**

Under `CHANGELOG.md` `## Unreleased` / `### Engineering`, add:

```markdown
- **observability:** clarified `readmates.aigen.queue.depth` as Redis active AI job backlog (`PENDING` + `RUNNING`) rather than a placeholder or Kafka consumer-lag metric. Metrics catalog, dashboard copy, alert wording, runbook triage, and KDoc now use the same meaning without adding high-cardinality labels.
```

- [ ] **Step 7: Run docs safety checks**

Run:

```bash
git diff --check -- \
  docs/operations/observability/metrics-catalog.md \
  docs/operations/observability/dashboards.md \
  docs/operations/observability/alerts.md \
  docs/operations/runbooks/ai-session-generation.md \
  CHANGELOG.md
rg -n "Users/|ocid1\.|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH|PRIVATE) KEY" \
  docs/operations/observability/metrics-catalog.md \
  docs/operations/observability/dashboards.md \
  docs/operations/observability/alerts.md \
  docs/operations/runbooks/ai-session-generation.md \
  CHANGELOG.md
```

Expected: `git diff --check` exits 0. The `rg` command exits 1 with no matches.

- [ ] **Step 8: Commit**

```bash
git add docs/operations/observability/metrics-catalog.md \
  docs/operations/observability/dashboards.md \
  docs/operations/observability/alerts.md \
  docs/operations/runbooks/ai-session-generation.md \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt \
  CHANGELOG.md
git commit -m "docs: align ai queue depth observability meaning"
```

## Task 7: Release-readiness Residual Classification

**Files:**
- Modify: `docs/development/release-readiness-review.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Capture current residual lines**

Run:

```bash
sed -n '1,45p' docs/development/release-readiness-review.md
```

Expected: output shows v1.11.0 residual items for production host smoke, OAuth happy path, and daily backup timer.

- [ ] **Step 2: Replace stale target-date residual wording**

In `docs/development/release-readiness-review.md`, replace the three unchecked v1.11.0 bullets with these current-state bullets:

```markdown
- [ ] [MANUAL OPERATIONAL ACTION REMAINS] Task 2 production host smoke — Google OAuth automation remains blocked at the Google sign-in page under automated browsers. Owner: kws. Current action: manually sign in through the production host flow, confirm redirect back to ReadMates, and record the date/result in this section. This is not closed by local Playwright or unit tests.
- [ ] [MANUAL OPERATIONAL ACTION REMAINS] Task 5 OAuth happy-path — automated checks can confirm redirect initiation, but credential entry remains blocked by Google automation controls. Owner: kws. Current action: manually verify `/login` -> Google -> ReadMates return on the production origin and record the concrete date/result here.
- [ ] [MANUAL OPERATIONAL ACTION REMAINS] Task 3 daily backup timer — local Object Storage upload and runbook evidence exist, but VM timer installation requires operator access. Owner: kws. Current action: bootstrap OCI CLI on the VM, install `backup-mysql.service` and `backup-mysql.timer`, run `systemctl list-timers backup-mysql.timer`, and record the sanitized result here.
```

Do not delete the preceding dated evidence lines; they explain why each item is still manual.

- [ ] **Step 3: Add current branch review note**

Below the v1.11.0 subsection, add:

```markdown
## 2026-05-31 Ops Insight & Release Trust residual policy

For the Ops Insight & Release Trust branch, residuals are classified as:

- **Closed by automated evidence** only when a repo command, script, test, or public-safe document proves the condition without private operator access.
- **Manual operational action remains** when Google OAuth credential entry, production host access, VM access, or provider console access is required.
- **Out of scope for this branch** when the item predates the branch and is not changed by analytics, observability, release-readiness, docs, scripts, or deploy behavior.

The v1.11.0 production OAuth and backup timer items remain manual operational actions until a human records sanitized production evidence. Analytics v2 and observability truth cleanup do not close those items by themselves.
```

- [ ] **Step 4: Add CHANGELOG entry**

Under `CHANGELOG.md` `## Unreleased` / `### Engineering`, add:

```markdown
- **release-readiness:** reclassified the v1.11.0 production OAuth and backup-timer residuals as current manual operational actions instead of stale target-date items. The release-readiness checklist now distinguishes automated closure, manual operator evidence, and out-of-scope pre-existing risk.
```

- [ ] **Step 5: Run docs checks**

Run:

```bash
git diff --check -- docs/development/release-readiness-review.md CHANGELOG.md
rg -n "Users/|ocid1\.|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH|PRIVATE) KEY" \
  docs/development/release-readiness-review.md \
  CHANGELOG.md
```

Expected: `git diff --check` exits 0. The `rg` command exits 1 with no matches.

- [ ] **Step 6: Commit**

```bash
git add docs/development/release-readiness-review.md CHANGELOG.md
git commit -m "docs: reclassify release readiness residuals"
```

## Task 8: Full Verification and Release-readiness Review

**Files:**
- Read: `docs/development/release-readiness-review.md`
- Modify if needed: `CHANGELOG.md`

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

Expected: all commands exit 0.

- [ ] **Step 2: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Run docs and public release checks**

Run:

```bash
git diff --check HEAD~7..HEAD
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: whitespace check exits 0, public release candidate builds, and public-release check passes.

- [ ] **Step 4: Run release-readiness scope commands**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
rg -n "^## Unreleased|\\(없음\\)" CHANGELOG.md
rg -n "baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch" \
  CHANGELOG.md \
  .github \
  deploy \
  scripts \
  server/src/main/kotlin \
  server/src/test/kotlin
```

Expected: scope commands produce review evidence. Any matches from the final `rg` must be reviewed and classified; do not treat matches as failure automatically.

- [ ] **Step 5: Write a release-readiness note if risk remains**

If verification skipped a command, append a short dated note under `docs/development/release-readiness-review.md` using this shape:

```markdown
## 2026-05-31 Ops Insight & Release Trust verification note

- Scope reviewed: `origin/main..HEAD`.
- Executed: frontend lint/test/build, targeted admin analytics E2E, server clean test, public release candidate checks.
- Skipped: none.
- Residual risk: v1.11.0 production OAuth and backup timer remain manual operational actions; this branch does not claim to close them.
```

If no command was skipped, the `Skipped: none.` line stays. If a command was skipped, replace `none` with the exact command and reason.

- [ ] **Step 6: Commit verification note if changed**

If Step 5 changed the file:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record ops insight release readiness evidence"
```

If Step 5 made no file changes, do not create an empty commit.

## Self-review Checklist

- Spec coverage: Task 1-5 cover analytics trend/export; Task 6 covers observability truth cleanup; Task 7-8 cover release-readiness residual classification and branch review.
- Public safety: all examples use repo paths, synthetic fixture names, or public-safe placeholder values.
- Contract choice: analytics keeps `admin.analytics_overview.v1` and adds `series` additively.
- CSV choice: export is client-side from server overview projection; no new endpoint or mutation is introduced.
- Verification: frontend, server, E2E, docs, public-release, and release-readiness checks are all explicit.
