# ReadMates Ops Depth + Confidence Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen `/admin/analytics` into an operator decision surface and add repeatable confidence evidence for analytics, query budgets, visual review, and release safety.

**Architecture:** Keep the existing route-first frontend and `admin.analytics` ops read-side server slice. The current code already has analytics series and CSV export; this plan closes the remaining gaps: explicit measurement-unavailable semantics, route-to-action drilldowns, query-budget evidence, non-private visual evidence, and reviewer-facing docs.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vite, Vitest, Playwright, Kotlin/Spring Boot, JdbcTemplate, MySQL/Flyway, Gradle.

---

## Current Baseline

The implementation starts from these existing facts:

- `front/features/platform-admin/model/platform-admin-analytics-model.ts` already defines `AdminAnalyticsOverview`, `series`, CSV helpers, KPI labels, and window parsing.
- `front/features/platform-admin/ui/admin-analytics-overview.tsx` already renders KPI tiles, a trend table, a benchmark table, and a CSV download link.
- `front/tests/e2e/admin-analytics.spec.ts` already mocks public-safe analytics responses and checks window switching and CSV filename.
- `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt` already exposes `admin.analytics_overview.v1`, KPI cards, benchmark rows, and series points.
- `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt` already derives ratios, deltas, availability, and series values from raw aggregates.
- `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt` already counts prepared statements for selected HTTP flows.

## File Structure

### Server analytics contract

- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt`
  - Owns wire schema, KPI keys, units, availability enum, and read models.
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt`
  - Owns derived values and honest availability semantics.
- Modify: `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt`
  - Pins the schema and availability semantics.
- Modify: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt`
  - Pins the public wire schema and public-safety response.

### Frontend analytics route

- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
  - Owns schema type, availability formatting, CSV serialization, and KPI-to-route decision helpers.
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`
  - Pins formatting, CSV content, route helpers, and unavailable copy.
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
  - Renders measurement-unavailable states and KPI drilldown links.
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
  - Pins UI copy, links, and CSV behavior.
- Modify: `front/tests/e2e/admin-analytics.spec.ts`
  - Covers operator drilldowns, unavailable states, desktop/mobile screenshot evidence, and public-safety assertions.

### Confidence evidence

- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
  - Adds an admin analytics query-budget test using a real admin session cookie.
- Modify: `docs/development/test-guide.md`
  - Documents analytics/query-budget/visual-evidence commands.
- Modify: `docs/showcase/engineering-confidence.md`
  - Adds analytics confidence evidence.
- Modify: `docs/showcase/operational-proof.md`
  - Connects analytics decisions to release and public-safety evidence.
- Modify: `CHANGELOG.md`
  - Records the shipped operator-facing and reviewer-facing change under `## Unreleased`.

## Task 1: Pin Analytics v2 Availability Semantics

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`

- [ ] **Step 1: Write the failing server service test**

Append this test to `AdminAnalyticsServiceTest`:

```kotlin
@Test
fun `overview uses v2 schema and reserves measurement unavailable for failed measurement inputs`() {
    val raw =
        sample().copy(
            notifTerminalCurrent = -1,
            notifSentCurrent = -1,
            notifTerminalPrior = -1,
            notifSentPrior = -1,
        )

    val overview = service(raw).overview(admin, AnalyticsWindow.LAST_30D)
    val notification = overview.kpis.first { it.key == KpiKey.NOTIFICATION_DELIVERY }

    assertThat(overview.schema).isEqualTo("admin.analytics_overview.v2")
    assertThat(notification.availability).isEqualTo(Availability.MEASUREMENT_UNAVAILABLE)
    assertThat(notification.current).isNull()
    assertThat(notification.prior).isNull()
    assertThat(notification.deltaDirection).isEqualTo(DeltaDirection.NONE)
}
```

- [ ] **Step 2: Run the focused server test and verify it fails**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest
```

Expected: FAIL because `Availability.MEASUREMENT_UNAVAILABLE` and schema `admin.analytics_overview.v2` do not exist yet.

- [ ] **Step 3: Update the Kotlin analytics contract**

In `AdminAnalyticsModels.kt`, change the availability enum and schema default:

```kotlin
enum class Availability { AVAILABLE, NOT_ENOUGH_DATA, MEASUREMENT_UNAVAILABLE }
```

```kotlin
data class AdminAnalyticsOverview(
    val schema: String = "admin.analytics_overview.v2",
    val generatedAt: OffsetDateTime,
    val window: AnalyticsWindow,
    val kpis: List<AdminAnalyticsKpiCard>,
    val clubBenchmark: AdminAnalyticsBenchmark,
    val series: List<AdminAnalyticsKpiSeries> = emptyList(),
)
```

- [ ] **Step 4: Update service derivation for negative measurement sentinels**

In `AdminAnalyticsService.kt`, replace `percent(...)` with this version:

```kotlin
private fun percent(
    key: KpiKey,
    numCurrent: Int,
    denCurrent: Int,
    numPrior: Int,
    denPrior: Int,
): AdminAnalyticsKpiCard {
    val measurementFailed = numCurrent < 0 || denCurrent < 0 || numPrior < 0 || denPrior < 0
    val cur = if (measurementFailed) null else ratePercent(numCurrent, denCurrent)
    val pri = if (measurementFailed) null else ratePercent(numPrior, denPrior)
    return AdminAnalyticsKpiCard(
        key = key,
        unit = KpiUnit.PERCENT,
        availability =
            when {
                measurementFailed -> Availability.MEASUREMENT_UNAVAILABLE
                denCurrent > 0 -> Availability.AVAILABLE
                else -> Availability.NOT_ENOUGH_DATA
            },
        current = cur,
        prior = pri,
        deltaDirection = direction(cur, pri),
    )
}
```

Do not emit negative values from `JdbcAdminAnalyticsAdapter`; this sentinel is for service-level isolation if a future aggregate provider reports a failed measurement. Current JDBC paths continue returning zero or positive counts.

- [ ] **Step 5: Update the controller schema assertion**

In `PlatformAdminAnalyticsControllerTest`, change:

```kotlin
jsonPath("$.schema") { value("admin.analytics_overview.v1") }
```

to:

```kotlin
jsonPath("$.schema") { value("admin.analytics_overview.v2") }
```

- [ ] **Step 6: Write failing frontend model tests**

In `platform-admin-analytics-model.test.ts`, update imports to include `formatAvailabilityLabel`, then add:

```ts
it("formats measurement unavailable separately from not enough data", () => {
  expect(formatAvailabilityLabel("NOT_ENOUGH_DATA")).toBe("데이터 부족");
  expect(formatAvailabilityLabel("MEASUREMENT_UNAVAILABLE")).toBe("측정 불가");
  expect(formatKpiValue(card({ availability: "MEASUREMENT_UNAVAILABLE", current: null }))).toBe("측정 불가");
});
```

Update the `overview` fixture schema in the CSV test:

```ts
schema: "admin.analytics_overview.v2",
```

- [ ] **Step 7: Run the focused frontend model test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-analytics-model.test.ts
```

Expected: FAIL because the schema literal and `formatAvailabilityLabel` are not updated.

- [ ] **Step 8: Update the TypeScript analytics contract and formatting**

In `platform-admin-analytics-model.ts`, change:

```ts
export type Availability = "AVAILABLE" | "NOT_ENOUGH_DATA";
```

to:

```ts
export type Availability = "AVAILABLE" | "NOT_ENOUGH_DATA" | "MEASUREMENT_UNAVAILABLE";
```

Change the overview schema type:

```ts
export type AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v2";
  generatedAt: string;
  window: AnalyticsWindow;
  kpis: AdminAnalyticsKpiCard[];
  clubBenchmark: AdminAnalyticsBenchmark;
  series: AdminAnalyticsKpiSeries[];
};
```

Add this helper near the label helpers:

```ts
export function formatAvailabilityLabel(availability: Availability): string {
  switch (availability) {
    case "AVAILABLE":
      return "측정됨";
    case "NOT_ENOUGH_DATA":
      return "데이터 부족";
    case "MEASUREMENT_UNAVAILABLE":
      return "측정 불가";
  }
}
```

Change `formatKpiValue`:

```ts
export function formatKpiValue(card: AdminAnalyticsKpiCard): string {
  if (card.availability !== "AVAILABLE" || card.current === null) {
    return formatAvailabilityLabel(card.availability);
  }
  switch (card.unit) {
    case "PERCENT":
      return `${card.current}%`;
    case "USD":
      return `$${card.current.toFixed(4)}`;
    case "COUNT":
      return `${card.current}`;
  }
}
```

Change `formatSeriesPointValue`:

```ts
export function formatSeriesPointValue(point: AdminAnalyticsKpiSeriesPoint, unit: KpiUnit): string {
  if (point.availability !== "AVAILABLE" || point.value === null) {
    return formatAvailabilityLabel(point.availability);
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
```

- [ ] **Step 9: Update frontend analytics fixtures to v2**

Replace `admin.analytics_overview.v1` with `admin.analytics_overview.v2` in these files:

```text
front/features/platform-admin/model/platform-admin-analytics-model.test.ts
front/features/platform-admin/ui/admin-analytics-overview.test.tsx
front/tests/e2e/admin-analytics.spec.ts
```

- [ ] **Step 10: Run focused tests and verify they pass**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest'
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-analytics-model.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 11: Commit Task 1**

Run:

```bash
git add \
  server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt \
  server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt \
  server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt \
  server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt \
  front/features/platform-admin/model/platform-admin-analytics-model.ts \
  front/features/platform-admin/model/platform-admin-analytics-model.test.ts \
  front/features/platform-admin/ui/admin-analytics-overview.test.tsx \
  front/tests/e2e/admin-analytics.spec.ts
git commit -m "feat(admin): pin analytics v2 availability states"
```

## Task 2: Add Operator Drilldowns From Analytics KPI Cards

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
- Modify: `front/tests/e2e/admin-analytics.spec.ts`
- Modify: `front/src/styles/globals.css`

- [ ] **Step 1: Write the failing route-helper model test**

In `platform-admin-analytics-model.test.ts`, update imports to include `analyticsActionForKpi`, then add:

```ts
it("maps KPI cards to operator drilldown routes", () => {
  expect(analyticsActionForKpi("NOTIFICATION_DELIVERY")).toEqual({
    label: "알림 운영 보기",
    href: "/admin/notifications",
  });
  expect(analyticsActionForKpi("AI_COST_PER_SESSION")).toEqual({
    label: "AI Ops 보기",
    href: "/admin/ai-ops",
  });
  expect(analyticsActionForKpi("SESSION_COMPLETION")).toEqual({
    label: "클럽 운영 보기",
    href: "/admin/clubs",
  });
});
```

- [ ] **Step 2: Run the model test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-analytics-model.test.ts
```

Expected: FAIL because `analyticsActionForKpi` is not defined.

- [ ] **Step 3: Add the KPI action helper**

In `platform-admin-analytics-model.ts`, add:

```ts
export type AnalyticsKpiAction = {
  label: string;
  href: string;
};

const KPI_ACTIONS: Record<KpiKey, AnalyticsKpiAction> = {
  ACTIVE_MEMBERS: { label: "클럽 운영 보기", href: "/admin/clubs" },
  SESSION_COMPLETION: { label: "클럽 운영 보기", href: "/admin/clubs" },
  RSVP_RATE: { label: "클럽 운영 보기", href: "/admin/clubs" },
  AI_COST_PER_SESSION: { label: "AI Ops 보기", href: "/admin/ai-ops" },
  NOTIFICATION_DELIVERY: { label: "알림 운영 보기", href: "/admin/notifications" },
};

export function analyticsActionForKpi(key: KpiKey): AnalyticsKpiAction {
  return KPI_ACTIONS[key];
}
```

- [ ] **Step 4: Write the failing UI test**

In `admin-analytics-overview.test.tsx`, add these assertions to the existing render test:

```ts
expect(screen.getAllByRole("link", { name: "클럽 운영 보기" }).at(0)).toHaveAttribute("href", "/admin/clubs");
expect(screen.getByRole("link", { name: "AI Ops 보기" })).toHaveAttribute("href", "/admin/ai-ops");
expect(screen.getByRole("link", { name: "알림 운영 보기" })).toHaveAttribute("href", "/admin/notifications");
```

- [ ] **Step 5: Run the UI test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-analytics-overview.test.tsx
```

Expected: FAIL because the links are not rendered.

- [ ] **Step 6: Render KPI drilldown links**

In `admin-analytics-overview.tsx`, update imports:

```ts
import {
  analyticsActionForKpi,
  analyticsCsvFilename,
  analyticsCsvHref,
  deltaLabel,
  formatKpiValue,
  formatSeriesPointValue,
  labelKpi,
  labelWindow,
  type AdminAnalyticsBenchmarkRow,
  type AdminAnalyticsKpiCard,
  type AdminAnalyticsKpiSeries,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";
```

Replace `AdminAnalyticsKpiTile` with:

```tsx
function AdminAnalyticsKpiTile({ card }: { card: AdminAnalyticsKpiCard }) {
  const unavailable = card.availability !== "AVAILABLE";
  const action = analyticsActionForKpi(card.key);
  return (
    <li className={`admin-analytics__kpi${unavailable ? " admin-analytics__kpi--empty" : ""}`}>
      <span className="admin-analytics__kpi-label">{labelKpi(card.key)}</span>
      <span className="admin-analytics__kpi-value">{formatKpiValue(card)}</span>
      <span className="admin-analytics__kpi-delta">{deltaLabel(card)}</span>
      <a className="admin-analytics__kpi-action" href={action.href}>
        {action.label}
      </a>
    </li>
  );
}
```

- [ ] **Step 7: Add CSS for KPI actions**

In `front/src/styles/globals.css`, near the `.admin-analytics__kpi-delta` rule, add:

```css
.admin-analytics__kpi-action {
  align-self: flex-start;
  color: #4f3f2b;
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.admin-analytics__kpi-action:focus-visible {
  border-radius: 4px;
  outline: 2px solid #6f5b3e;
  outline-offset: 3px;
}
```

- [ ] **Step 8: Extend the E2E test**

In `admin-analytics.spec.ts`, after checking the CSV link, add:

```ts
await expect(page.getByRole("link", { name: "알림 운영 보기" })).toHaveAttribute("href", "/admin/notifications");
await expect(page.getByRole("link", { name: "AI Ops 보기" })).toHaveAttribute("href", "/admin/ai-ops");
await expect(page.getByRole("link", { name: "클럽 운영 보기" }).first()).toHaveAttribute("href", "/admin/clubs");
```

- [ ] **Step 9: Run focused frontend checks**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-analytics-model.test.ts features/platform-admin/ui/admin-analytics-overview.test.tsx
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

Expected: all selected tests PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add \
  front/features/platform-admin/model/platform-admin-analytics-model.ts \
  front/features/platform-admin/model/platform-admin-analytics-model.test.ts \
  front/features/platform-admin/ui/admin-analytics-overview.tsx \
  front/features/platform-admin/ui/admin-analytics-overview.test.tsx \
  front/tests/e2e/admin-analytics.spec.ts \
  front/src/styles/globals.css
git commit -m "feat(admin): link analytics kpis to operating routes"
```

## Task 3: Add Admin Analytics Query-Budget Evidence

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
- Modify: `docs/development/test-guide.md`

- [ ] **Step 1: Write the failing query-budget test**

In `ServerQueryBudgetTest.kt`, add imports:

```kotlin
import com.readmates.auth.application.service.AuthSessionService
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import java.util.UUID
```

Update the constructor:

```kotlin
class ServerQueryBudgetTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) : ReadmatesMySqlIntegrationTestSupport() {
```

Add this field and cleanup method inside the class:

```kotlin
private val createdSessionTokenHashes = linkedSetOf<String>()

@AfterEach
fun cleanupAuthSessions() {
    if (createdSessionTokenHashes.isEmpty()) {
        return
    }
    val bindMarkers = createdSessionTokenHashes.joinToString(",") { "?" }
    jdbcTemplate.update(
        "delete from auth_sessions where session_token_hash in ($bindMarkers)",
        *createdSessionTokenHashes.toTypedArray(),
    )
    createdSessionTokenHashes.clear()
}
```

Add this test:

```kotlin
@Test
fun `admin analytics overview stays within aggregate query budget`() {
    assertQueryBudget(
        budget = 60,
        reason = "admin analytics overview uses aggregate queries and bounded bucket queries for the selected window",
    ) {
        mockMvc
            .get("/api/admin/analytics/overview?window=30d") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
            }
    }
}
```

Add this helper and constant:

```kotlin
private fun sessionCookieForUser(userId: String): Cookie {
    val issuedSession =
        authSessionService.issueSession(
            userId = UUID.fromString(userId).toString(),
            userAgent = "ServerQueryBudgetTest",
            ipAddress = "127.0.0.1",
        )
    createdSessionTokenHashes += issuedSession.storedTokenHash
    return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
}

private companion object {
    private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
}
```

If the file already has a companion object by execution time, place `OWNER_USER_ID` in that companion object instead of creating a second one.

- [ ] **Step 2: Run the query-budget test and capture the observed count**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: the new test should PASS with budget `60`. If it fails, read the assertion output and set the budget to the lowest integer that is at least the observed count and no more than 5 above it. Do not set the budget above 60 without first reducing query count or documenting why the analytics endpoint intentionally needs more queries.

- [ ] **Step 3: Document the analytics query-budget command**

In `docs/development/test-guide.md`, in the query budget section near the `ServerQueryBudgetTest` command, add this text:

````markdown
Admin analytics overview도 query budget 대상입니다. `/api/admin/analytics/overview?window=30d`는 운영 분석 집계를 위해 여러 aggregate와 bucket query를 실행하지만, `ServerQueryBudgetTest`가 bounded query count를 핀해 accidental N+1 회귀를 막습니다.

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```
````

- [ ] **Step 4: Run docs and integration checks**

Run:

```bash
git diff --check -- docs/development/test-guide.md
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: whitespace check PASS and integration test PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add \
  server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt \
  docs/development/test-guide.md
git commit -m "test(admin): pin analytics query budget"
```

## Task 4: Add Non-Private Visual Evidence For Analytics

**Files:**
- Modify: `front/tests/e2e/admin-analytics.spec.ts`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/showcase/engineering-confidence.md`

- [ ] **Step 1: Write the visual evidence E2E test**

Append this test to `front/tests/e2e/admin-analytics.spec.ts`:

```ts
test("owner captures public-safe analytics visual evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAnalytics(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "분석" })).toBeVisible();
  await expect(page.getByRole("table", { name: "KPI 추세" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-analytics-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "분석" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CSV 내려받기" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-analytics-mobile.png"),
    fullPage: true,
  });

  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
});
```

This stores screenshots under Playwright `test-results`, which is already excluded from the public release candidate. Do not commit generated PNG files.

- [ ] **Step 2: Run the focused E2E test**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

Expected: PASS. The output should include the new test. The generated screenshots should be under `front/test-results/` and must remain untracked.

- [ ] **Step 3: Verify no generated screenshots are staged or tracked**

Run:

```bash
git status --short
git ls-files front/test-results front/playwright-report
```

Expected: `git ls-files` prints nothing. `git status --short` must not show PNG files.

- [ ] **Step 4: Document the visual evidence command**

In `docs/development/test-guide.md`, add this subsection near the E2E commands:

````markdown
Admin analytics visual evidence:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

The spec captures desktop and mobile screenshots into Playwright `test-results` using public-safe mocked analytics data. Generated screenshots are evidence artifacts only and are not committed.
````

In `docs/showcase/engineering-confidence.md`, add a row to the Boundary Evidence table:

```markdown
| Admin analytics visual evidence | `front/tests/e2e/admin-analytics.spec.ts` | desktop/mobile analytics layout drift and private-data leakage in mocked operating views |
```

- [ ] **Step 5: Run docs validation**

Run:

```bash
git diff --check -- docs/development/test-guide.md docs/showcase/engineering-confidence.md
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add \
  front/tests/e2e/admin-analytics.spec.ts \
  docs/development/test-guide.md \
  docs/showcase/engineering-confidence.md
git commit -m "test(admin): capture analytics visual evidence"
```

## Task 5: Update Release Evidence And Public-Safety Docs

**Files:**
- Modify: `docs/showcase/operational-proof.md`
- Modify: `docs/development/release-readiness-review.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update operational proof**

In `docs/showcase/operational-proof.md`, under `## Product Loop Evidence`, add:

````markdown
## Analytics Confidence Evidence

Admin analytics should prove both operator value and release confidence:

```text
Aggregate-only analytics contract
  -> honest availability state
  -> operator drilldown route
  -> query budget guard
  -> visual evidence artifact
  -> public release safety scan when docs or public surfaces change
```

Analytics evidence must stay aggregate-only. It should not include real member data, private domains, raw provider errors, transcripts, generated session bodies, or deployment identifiers.
````

- [ ] **Step 2: Update release-readiness review checklist**

In `docs/development/release-readiness-review.md`, under `## 필수 확인 항목`, add:

```markdown
- 운영 분석 또는 observability 표면이 바뀌면 데이터 부족, 측정 실패, 위험 신호가 UI/API/docs에서 서로 구분되는지 확인합니다. Analytics 변경은 가능한 경우 query budget evidence와 public-safe visual evidence를 함께 남깁니다.
```

- [ ] **Step 3: Update CHANGELOG Unreleased**

Under `CHANGELOG.md` `## Unreleased`, add one bullet:

```markdown
- **platform-admin analytics confidence:** `/admin/analytics`를 운영 판단 표면으로 심화하고, 데이터 부족과 측정 불가 상태를 구분하며, KPI별 운영 route drilldown, analytics query-budget guard, public-safe desktop/mobile visual evidence, showcase/release-readiness 문서 연결을 추가했습니다.
```

If `## Unreleased` currently contains only the default "다음 릴리즈 후보 변경을 이 섹션에 기록합니다." line, replace that line with this concrete bullet.

- [ ] **Step 4: Run docs checks and public-release safety scan**

Run:

```bash
git diff --check -- \
  docs/showcase/operational-proof.md \
  docs/development/release-readiness-review.md \
  CHANGELOG.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: `git diff --check` PASS, release candidate build PASS, and public-release check PASS.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add \
  docs/showcase/operational-proof.md \
  docs/development/release-readiness-review.md \
  CHANGELOG.md
git commit -m "docs: connect analytics confidence evidence"
```

## Task 6: Final Verification And Release-Readiness Notes

**Files:**
- No new source file required.
- Inspect all files changed by Tasks 1-5.

- [ ] **Step 1: Run frontend focused and full checks**

Run:

```bash
pnpm --dir front exec vitest run \
  features/platform-admin/model/platform-admin-analytics-model.test.ts \
  features/platform-admin/ui/admin-analytics-overview.test.tsx \
  features/platform-admin/route/admin-analytics-route.test.tsx
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands PASS.

- [ ] **Step 2: Run server focused and architecture checks**

Run:

```bash
./server/gradlew -p server unitTest --tests com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest'
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
./server/gradlew -p server architectureTest
```

Expected: all commands PASS.

- [ ] **Step 3: Run docs and public-release checks**

Run:

```bash
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: whitespace check PASS, release candidate build PASS, public-release check PASS.

- [ ] **Step 4: Confirm generated artifacts are not committed**

Run:

```bash
git status --short
git ls-files front/test-results front/playwright-report .tmp
```

Expected: `git ls-files` prints nothing for generated artifact directories. `git status --short` should show only intentional source/doc changes before the final commit, or be clean after the final commit.

- [ ] **Step 5: Review diff for public safety and scope**

Run:

```bash
git diff --stat HEAD~5..HEAD
git diff HEAD~5..HEAD -- \
  front/features/platform-admin \
  front/tests/e2e/admin-analytics.spec.ts \
  server/src/main/kotlin/com/readmates/admin/analytics \
  server/src/test/kotlin/com/readmates/admin/analytics \
  server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt \
  docs/development/test-guide.md \
  docs/development/release-readiness-review.md \
  docs/showcase/engineering-confidence.md \
  docs/showcase/operational-proof.md \
  CHANGELOG.md
```

Expected: diff is limited to analytics, confidence evidence, docs, and changelog. No real member data, private domain, local absolute path, OCID, secret, token-shaped example, raw provider error, transcript, generated session body, or raw email body appears.

- [ ] **Step 6: Commit final verification note if needed**

If Task 6 only runs checks and produces no file changes, do not create a commit. If verification reveals a small docs correction in the release-readiness notes, commit the exact changed docs:

```bash
git add docs/development/release-readiness-review.md docs/showcase/operational-proof.md docs/showcase/engineering-confidence.md docs/development/test-guide.md CHANGELOG.md
git commit -m "docs: record analytics confidence verification"
```

## Expected Final Report

When implementation is complete, report:

- Changed surfaces: `front/features/platform-admin`, `front/tests/e2e`, `server/admin.analytics`, `ServerQueryBudgetTest`, docs/showcase/release-readiness, `CHANGELOG.md`.
- Checks actually run:
  - frontend focused tests
  - `pnpm --dir front lint`
  - `pnpm --dir front test`
  - `pnpm --dir front build`
  - `pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts`
  - server analytics unit/integration tests
  - `ServerQueryBudgetTest`
  - `architectureTest`
  - `git diff --check`
  - public release candidate build/check
- Skipped checks and reason, if any.
- Remaining risk:
  - Visual screenshots are nonblocking evidence artifacts, not a strict pixel-diff gate.
  - Query budget is a bounded regression guard, not proof that every SQL plan is optimal.
