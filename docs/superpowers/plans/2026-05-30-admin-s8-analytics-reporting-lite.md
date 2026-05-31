# S8 Analytics / Reporting Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip `/admin/analytics` from COMING-SOON to READY with a windowed (7/30/90d) cross-club KPI overview that reuses S3/S5 data sources and renders honest "데이터 부족" states.

**Architecture:** New read-only server slice `admin.analytics` (controller → service → port → JDBC adapter) aggregates raw counts across clubs over a selected window; the application service derives rates, deltas, and per-KPI availability (pure, unit-testable). Frontend adds a platform-admin analytics vertical (model → api → queries → route data → route → UI) mirroring the existing audit vertical, with a window selector via URL state. No charting library is added — trend is expressed as current-vs-prior-window value + delta, consistent with the existing `recentFailed7d`/`priorFailed7d` pattern.

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate, MySQL (Flyway, Testcontainers integration tests), React/Vite, TanStack Query, react-router-dom, Vitest + Testing Library, Playwright.

**Metric contract (v1 — pinned here; open to later product refinement):** For window `W` days, current window = `[now-W, now)`, prior window = `[now-2W, now-W)`.

- `ACTIVE_MEMBERS` (COUNT): distinct `session_participants.membership_id` whose `sessions.session_date` falls in the window. `NOT_ENOUGH_DATA` when no sessions exist in the window.
- `SESSION_COMPLETION` (PERCENT): sessions in window with `state in ('CLOSED','PUBLISHED')` ÷ all sessions in window. `NOT_ENOUGH_DATA` when 0 sessions in window.
- `RSVP_RATE` (PERCENT): participants of in-window sessions with `rsvp_status in ('GOING','MAYBE')` ÷ all participants of in-window sessions. `NOT_ENOUGH_DATA` when 0 participants.
- `AI_COST_PER_SESSION` (USD): `sum(ai_generation_audit_log.cost_estimate_usd)` for rows with `created_at` in window ÷ session count in window. `NOT_ENOUGH_DATA` when 0 sessions in window.
- `NOTIFICATION_DELIVERY` (PERCENT): `notification_deliveries` with `updated_at` in window and `status='SENT'` ÷ terminal (`SENT`+`FAILED`+`DEAD`) in window. `NOT_ENOUGH_DATA` when 0 terminal.

`deltaDirection` is purely numeric (`UP`/`DOWN`/`FLAT`/`NONE`); the UI decides good/bad coloring per KPI. Cross-club benchmark reuses the same per-window definitions, one row per club, ordered by `activeMembers` desc, limit 20.

**Public safety:** Responses expose only aggregate counts/rates and club slug/name/id — never member emails, raw provider errors, transcripts, or generated JSON. Tests assert `@example.com` and `{` are absent from the serialized body.

---

## File Structure

**Server (new slice `com.readmates.admin.analytics`):**
- `application/model/AdminAnalyticsModels.kt` — domain types: window enum, raw aggregates, overview, KPI card, benchmark.
- `application/port/in/GetAdminAnalyticsOverviewUseCase.kt` — inbound use case.
- `application/port/out/AdminAnalyticsAggregatePort.kt` — outbound port returning raw aggregates.
- `application/service/AdminAnalyticsService.kt` — derives rates/deltas/availability (pure logic).
- `adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt` — windowed cross-club SQL.
- `adapter/in/web/PlatformAdminAnalyticsController.kt` — `GET /api/admin/analytics/overview`, response DTO.

**Frontend (`front/features/platform-admin`):**
- `model/platform-admin-analytics-model.ts` — types, window parse/serialize, display helpers.
- `api/platform-admin-analytics-api.ts` — fetch wrapper.
- `queries/platform-admin-analytics-queries.ts` — query options + keys.
- `route/admin-analytics-data.ts` — loader factory.
- `route/admin-analytics-route.tsx` — route component (window URL state).
- `ui/admin-analytics-overview.tsx` — KPI cards + benchmark table + empty states.
- `model/admin-route-catalog.ts` (modify) — flip `analytics` to `ready`.
- `src/app/routes/admin.tsx` (modify) — add `analytics` `readyChild` case.
- `src/styles/globals.css` (modify) — `admin-analytics-*` styles.

**Tests:**
- Server: service unit test, JDBC adapter integration test, controller serialization/auth test, architecture registry update.
- Frontend: model test, route test, UI test, e2e spec `tests/e2e/admin-analytics.spec.ts`.

---

## Phase A — Server slice

### Task 1: Analytics domain model

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt`

- [ ] **Step 1: Write the domain types**

```kotlin
package com.readmates.admin.analytics.application.model

import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

enum class AnalyticsWindow(val days: Long, val wire: String) {
    LAST_7D(7, "7d"),
    LAST_30D(30, "30d"),
    LAST_90D(90, "90d"),
    ;

    companion object {
        fun fromWire(value: String?): AnalyticsWindow =
            entries.firstOrNull { it.wire == value } ?: LAST_30D
    }
}

enum class KpiKey { ACTIVE_MEMBERS, SESSION_COMPLETION, RSVP_RATE, AI_COST_PER_SESSION, NOTIFICATION_DELIVERY }

enum class KpiUnit { COUNT, PERCENT, USD }

enum class Availability { AVAILABLE, NOT_ENOUGH_DATA }

enum class DeltaDirection { UP, DOWN, FLAT, NONE }

// Raw aggregates from the adapter; the service derives rates/deltas/availability.
data class AdminAnalyticsRawAggregates(
    val sessionsCurrent: Int,
    val sessionsPrior: Int,
    val completedSessionsCurrent: Int,
    val completedSessionsPrior: Int,
    val participantsCurrent: Int,
    val participantsPrior: Int,
    val goingMaybeCurrent: Int,
    val goingMaybePrior: Int,
    val activeMembersCurrent: Int,
    val activeMembersPrior: Int,
    val aiCostCurrent: BigDecimal,
    val aiCostPrior: BigDecimal,
    val notifTerminalCurrent: Int,
    val notifSentCurrent: Int,
    val notifTerminalPrior: Int,
    val notifSentPrior: Int,
    val benchmark: List<AdminAnalyticsBenchmarkRaw>,
)

data class AdminAnalyticsBenchmarkRaw(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val activeMembers: Int,
    val sessions: Int,
    val completedSessions: Int,
    val participants: Int,
    val goingMaybe: Int,
    val aiCost: BigDecimal,
    val notifTerminal: Int,
    val notifSent: Int,
)

data class AdminAnalyticsOverview(
    val schema: String = "admin.analytics_overview.v1",
    val generatedAt: OffsetDateTime,
    val window: AnalyticsWindow,
    val kpis: List<AdminAnalyticsKpiCard>,
    val clubBenchmark: AdminAnalyticsBenchmark,
)

data class AdminAnalyticsKpiCard(
    val key: KpiKey,
    val unit: KpiUnit,
    val availability: Availability,
    val current: Double?,
    val prior: Double?,
    val deltaDirection: DeltaDirection,
)

data class AdminAnalyticsBenchmark(
    val availability: Availability,
    val rows: List<AdminAnalyticsBenchmarkRow>,
)

data class AdminAnalyticsBenchmarkRow(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val activeMembers: Int,
    val sessionCompletionRate: Double?,
    val rsvpRate: Double?,
    val aiCostUsd: String,
    val notificationDeliveryRate: Double?,
)
```

- [ ] **Step 2: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt
git commit -m "feat: add admin analytics overview domain model"
```

### Task 2: Use-case and aggregate ports

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/application/port/in/GetAdminAnalyticsOverviewUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/application/port/out/AdminAnalyticsAggregatePort.kt`

- [ ] **Step 1: Write the inbound use case**

```kotlin
@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.application.port.`in`

import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.shared.security.CurrentPlatformAdmin

interface GetAdminAnalyticsOverviewUseCase {
    fun overview(
        admin: CurrentPlatformAdmin,
        window: AnalyticsWindow,
    ): AdminAnalyticsOverview
}
```

- [ ] **Step 2: Write the outbound port**

```kotlin
package com.readmates.admin.analytics.application.port.out

import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow

interface AdminAnalyticsAggregatePort {
    fun loadAggregates(window: AnalyticsWindow): AdminAnalyticsRawAggregates
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/application/port
git commit -m "feat: add admin analytics use-case and aggregate ports"
```

### Task 3: Analytics service (rate/delta/availability derivation)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt`

- [ ] **Step 1: Write the failing service unit test**

```kotlin
package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.model.Availability
import com.readmates.admin.analytics.application.model.DeltaDirection
import com.readmates.admin.analytics.application.model.KpiKey
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AdminAnalyticsServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-05-30T00:00:00Z"), ZoneOffset.UTC)
    private val admin = CurrentPlatformAdmin(UUID.randomUUID(), "owner@example.com", PlatformAdminRole.OWNER)

    private fun service(raw: AdminAnalyticsRawAggregates) =
        AdminAnalyticsService(
            port = object : AdminAnalyticsAggregatePort {
                override fun loadAggregates(window: AnalyticsWindow) = raw
            },
            clock = clock,
        )

    @Test
    fun `derives completion percent and upward delta`() {
        val raw = sample(sessionsCurrent = 10, completedCurrent = 8, sessionsPrior = 10, completedPrior = 5)
        val card = service(raw).overview(admin, AnalyticsWindow.LAST_30D)
            .kpis.first { it.key == KpiKey.SESSION_COMPLETION }

        assertThat(card.availability).isEqualTo(Availability.AVAILABLE)
        assertThat(card.current).isEqualTo(80.0)
        assertThat(card.prior).isEqualTo(50.0)
        assertThat(card.deltaDirection).isEqualTo(DeltaDirection.UP)
    }

    @Test
    fun `marks not enough data when window has no sessions`() {
        val raw = sample(sessionsCurrent = 0, completedCurrent = 0, sessionsPrior = 0, completedPrior = 0)
        val card = service(raw).overview(admin, AnalyticsWindow.LAST_7D)
            .kpis.first { it.key == KpiKey.SESSION_COMPLETION }

        assertThat(card.availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
        assertThat(card.current).isNull()
        assertThat(card.deltaDirection).isEqualTo(DeltaDirection.NONE)
    }

    @Test
    fun `benchmark is not enough data when no rows`() {
        val overview = service(sample().copy(benchmark = emptyList())).overview(admin, AnalyticsWindow.LAST_30D)
        assertThat(overview.clubBenchmark.availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
    }

    private fun sample(
        sessionsCurrent: Int = 4,
        completedCurrent: Int = 2,
        sessionsPrior: Int = 4,
        completedPrior: Int = 2,
    ) = AdminAnalyticsRawAggregates(
        sessionsCurrent = sessionsCurrent,
        sessionsPrior = sessionsPrior,
        completedSessionsCurrent = completedCurrent,
        completedSessionsPrior = completedPrior,
        participantsCurrent = 10,
        participantsPrior = 10,
        goingMaybeCurrent = 7,
        goingMaybePrior = 7,
        activeMembersCurrent = 5,
        activeMembersPrior = 5,
        aiCostCurrent = BigDecimal("2.0000"),
        aiCostPrior = BigDecimal("2.0000"),
        notifTerminalCurrent = 20,
        notifSentCurrent = 19,
        notifTerminalPrior = 20,
        notifSentPrior = 18,
        benchmark = listOf(
            AdminAnalyticsBenchmarkRaw(
                clubId = UUID.randomUUID(), slug = "club-a", name = "Club A",
                activeMembers = 5, sessions = 4, completedSessions = 2,
                participants = 10, goingMaybe = 7, aiCost = BigDecimal("2.0000"),
                notifTerminal = 20, notifSent = 19,
            ),
        ),
    )
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server test --tests "com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest"`
Expected: FAIL — `AdminAnalyticsService` does not exist.

- [ ] **Step 3: Write the service**

```kotlin
package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmark
import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRow
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiCard
import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.Availability
import com.readmates.admin.analytics.application.model.DeltaDirection
import com.readmates.admin.analytics.application.model.KpiKey
import com.readmates.admin.analytics.application.model.KpiUnit
import com.readmates.admin.analytics.application.port.`in`.GetAdminAnalyticsOverviewUseCase
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Clock
import java.time.OffsetDateTime

@Service
class AdminAnalyticsService(
    private val port: AdminAnalyticsAggregatePort,
    private val clock: Clock,
) : GetAdminAnalyticsOverviewUseCase {
    override fun overview(
        admin: CurrentPlatformAdmin,
        window: AnalyticsWindow,
    ): AdminAnalyticsOverview {
        val raw = port.loadAggregates(window)
        return AdminAnalyticsOverview(
            generatedAt = OffsetDateTime.now(clock),
            window = window,
            kpis = kpis(raw),
            clubBenchmark = benchmark(raw),
        )
    }

    private fun kpis(raw: AdminAnalyticsRawAggregates): List<AdminAnalyticsKpiCard> =
        listOf(
            count(
                KpiKey.ACTIVE_MEMBERS,
                hasCurrent = raw.sessionsCurrent > 0, hasPrior = raw.sessionsPrior > 0,
                current = raw.activeMembersCurrent, prior = raw.activeMembersPrior,
            ),
            percent(
                KpiKey.SESSION_COMPLETION,
                numCurrent = raw.completedSessionsCurrent, denCurrent = raw.sessionsCurrent,
                numPrior = raw.completedSessionsPrior, denPrior = raw.sessionsPrior,
            ),
            percent(
                KpiKey.RSVP_RATE,
                numCurrent = raw.goingMaybeCurrent, denCurrent = raw.participantsCurrent,
                numPrior = raw.goingMaybePrior, denPrior = raw.participantsPrior,
            ),
            costPerSession(raw),
            percent(
                KpiKey.NOTIFICATION_DELIVERY,
                numCurrent = raw.notifSentCurrent, denCurrent = raw.notifTerminalCurrent,
                numPrior = raw.notifSentPrior, denPrior = raw.notifTerminalPrior,
            ),
        )

    private fun count(key: KpiKey, hasCurrent: Boolean, hasPrior: Boolean, current: Int, prior: Int): AdminAnalyticsKpiCard {
        val cur = if (hasCurrent) current.toDouble() else null
        val pri = if (hasPrior) prior.toDouble() else null
        return AdminAnalyticsKpiCard(key, KpiUnit.COUNT, availability(hasCurrent), cur, pri, direction(cur, pri))
    }

    private fun percent(key: KpiKey, numCurrent: Int, denCurrent: Int, numPrior: Int, denPrior: Int): AdminAnalyticsKpiCard {
        val cur = ratePercent(numCurrent, denCurrent)
        val pri = ratePercent(numPrior, denPrior)
        return AdminAnalyticsKpiCard(key, KpiUnit.PERCENT, availability(denCurrent > 0), cur, pri, direction(cur, pri))
    }

    private fun costPerSession(raw: AdminAnalyticsRawAggregates): AdminAnalyticsKpiCard {
        val cur = perSession(raw.aiCostCurrent, raw.sessionsCurrent)
        val pri = perSession(raw.aiCostPrior, raw.sessionsPrior)
        return AdminAnalyticsKpiCard(KpiKey.AI_COST_PER_SESSION, KpiUnit.USD, availability(raw.sessionsCurrent > 0), cur, pri, direction(cur, pri))
    }

    private fun benchmark(raw: AdminAnalyticsRawAggregates): AdminAnalyticsBenchmark =
        AdminAnalyticsBenchmark(
            availability = if (raw.benchmark.isEmpty()) Availability.NOT_ENOUGH_DATA else Availability.AVAILABLE,
            rows = raw.benchmark.map(::benchmarkRow),
        )

    private fun benchmarkRow(r: AdminAnalyticsBenchmarkRaw) =
        AdminAnalyticsBenchmarkRow(
            clubId = r.clubId,
            slug = r.slug,
            name = r.name,
            activeMembers = r.activeMembers,
            sessionCompletionRate = ratePercent(r.completedSessions, r.sessions),
            rsvpRate = ratePercent(r.goingMaybe, r.participants),
            aiCostUsd = r.aiCost.setScale(COST_SCALE, RoundingMode.HALF_UP).toPlainString(),
            notificationDeliveryRate = ratePercent(r.notifSent, r.notifTerminal),
        )

    private fun availability(hasData: Boolean): Availability =
        if (hasData) Availability.AVAILABLE else Availability.NOT_ENOUGH_DATA

    private fun ratePercent(numerator: Int, denominator: Int): Double? =
        if (denominator <= 0) {
            null
        } else {
            BigDecimal(numerator * 100.0 / denominator).setScale(1, RoundingMode.HALF_UP).toDouble()
        }

    private fun perSession(cost: BigDecimal, sessions: Int): Double? =
        if (sessions <= 0) {
            null
        } else {
            cost.divide(BigDecimal(sessions), COST_SCALE, RoundingMode.HALF_UP).toDouble()
        }

    private fun direction(current: Double?, prior: Double?): DeltaDirection =
        when {
            current == null || prior == null -> DeltaDirection.NONE
            current > prior -> DeltaDirection.UP
            current < prior -> DeltaDirection.DOWN
            else -> DeltaDirection.FLAT
        }

    private companion object {
        const val COST_SCALE = 4
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.admin.analytics.application.service.AdminAnalyticsServiceTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsService.kt \
        server/src/test/kotlin/com/readmates/admin/analytics/application/service/AdminAnalyticsServiceTest.kt
git commit -m "feat: derive admin analytics KPIs from raw aggregates"
```

### Task 4: JDBC analytics adapter (windowed cross-club SQL)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapterTest.kt`

> Note on date math: counts use `current_date()` for `session_date` (a DATE column) and `utc_timestamp(6)` for `created_at`/`updated_at` (DATETIME), matching the existing `JdbcAdminClubOperationsAdapter` style. `w` is `window.days`; the prior window is `[2w, w)` days ago.

- [ ] **Step 1: Write the failing integration test**

```kotlin
package com.readmates.admin.analytics.adapter.out.persistence

import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Clock

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class JdbcAdminAnalyticsAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter = JdbcAdminAnalyticsAdapter(jdbcTemplate, Clock.systemUTC())

    @Test
    fun `loads internally consistent aggregates against dev seed`() {
        val raw = adapter.loadAggregates(AnalyticsWindow.LAST_90D)

        assertThat(raw.sessionsCurrent).isGreaterThanOrEqualTo(0)
        assertThat(raw.completedSessionsCurrent).isLessThanOrEqualTo(raw.sessionsCurrent)
        assertThat(raw.goingMaybeCurrent).isLessThanOrEqualTo(raw.participantsCurrent)
        assertThat(raw.notifSentCurrent).isLessThanOrEqualTo(raw.notifTerminalCurrent)
        raw.benchmark.forEach { assertThat(it.slug).isNotBlank() }
    }
}
```

Note: `JdbcAdminAnalyticsAdapter` is constructed directly (not autowired) so the test passes an explicit `Clock`; it depends only on `JdbcTemplate`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server test --tests "com.readmates.admin.analytics.adapter.out.persistence.JdbcAdminAnalyticsAdapterTest"`
Expected: FAIL — `JdbcAdminAnalyticsAdapter` does not exist.

- [ ] **Step 3: Write the adapter**

```kotlin
package com.readmates.admin.analytics.adapter.out.persistence

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.time.Clock

@Repository
class JdbcAdminAnalyticsAdapter(
    private val jdbcTemplate: JdbcTemplate,
    @Suppress("unused") private val clock: Clock,
) : AdminAnalyticsAggregatePort {
    override fun loadAggregates(window: AnalyticsWindow): AdminAnalyticsRawAggregates {
        val w = window.days
        return AdminAnalyticsRawAggregates(
            sessionsCurrent = sessionCount(w, prior = false),
            sessionsPrior = sessionCount(w, prior = true),
            completedSessionsCurrent = completedSessionCount(w, prior = false),
            completedSessionsPrior = completedSessionCount(w, prior = true),
            participantsCurrent = participantCount(w, prior = false, goingMaybeOnly = false),
            participantsPrior = participantCount(w, prior = true, goingMaybeOnly = false),
            goingMaybeCurrent = participantCount(w, prior = false, goingMaybeOnly = true),
            goingMaybePrior = participantCount(w, prior = true, goingMaybeOnly = true),
            activeMembersCurrent = activeMemberCount(w, prior = false),
            activeMembersPrior = activeMemberCount(w, prior = true),
            aiCostCurrent = aiCost(w, prior = false),
            aiCostPrior = aiCost(w, prior = true),
            notifTerminalCurrent = notifCount(w, prior = false, sentOnly = false),
            notifSentCurrent = notifCount(w, prior = false, sentOnly = true),
            notifTerminalPrior = notifCount(w, prior = true, sentOnly = false),
            notifSentPrior = notifCount(w, prior = true, sentOnly = true),
            benchmark = benchmark(w),
        )
    }

    // session_date is a DATE; current window = last w days, prior = [2w, w) days ago.
    private fun sessionDatePredicate(prior: Boolean): String =
        if (prior) {
            "session_date >= current_date() - interval ? day and session_date < current_date() - interval ? day"
        } else {
            "session_date >= current_date() - interval ? day"
        }

    private fun sessionDateArgs(w: Long, prior: Boolean): Array<Any> =
        if (prior) arrayOf(2 * w, w) else arrayOf(w)

    private fun sessionCount(w: Long, prior: Boolean): Int =
        scalarInt(
            "select count(*) from sessions where ${sessionDatePredicate(prior)}",
            *sessionDateArgs(w, prior),
        )

    private fun completedSessionCount(w: Long, prior: Boolean): Int =
        scalarInt(
            "select count(*) from sessions where state in ('CLOSED','PUBLISHED') and ${sessionDatePredicate(prior)}",
            *sessionDateArgs(w, prior),
        )

    private fun participantCount(w: Long, prior: Boolean, goingMaybeOnly: Boolean): Int {
        val rsvpClause = if (goingMaybeOnly) " and sp.rsvp_status in ('GOING','MAYBE')" else ""
        return scalarInt(
            """
            select count(*)
            from session_participants sp
            join sessions s on s.id = sp.session_id
            where ${sessionDatePredicate(prior).replace("session_date", "s.session_date")}$rsvpClause
            """.trimIndent(),
            *sessionDateArgs(w, prior),
        )
    }

    private fun activeMemberCount(w: Long, prior: Boolean): Int =
        scalarInt(
            """
            select count(distinct sp.membership_id)
            from session_participants sp
            join sessions s on s.id = sp.session_id
            where ${sessionDatePredicate(prior).replace("session_date", "s.session_date")}
            """.trimIndent(),
            *sessionDateArgs(w, prior),
        )

    private fun aiCost(w: Long, prior: Boolean): BigDecimal {
        val predicate =
            if (prior) {
                "created_at >= utc_timestamp(6) - interval ? day and created_at < utc_timestamp(6) - interval ? day"
            } else {
                "created_at >= utc_timestamp(6) - interval ? day"
            }
        val args = if (prior) arrayOf<Any>(2 * w, w) else arrayOf<Any>(w)
        return jdbcTemplate.queryForObject(
            "select coalesce(sum(cost_estimate_usd), 0) from ai_generation_audit_log where $predicate",
            BigDecimal::class.java,
            *args,
        ) ?: BigDecimal.ZERO
    }

    private fun notifCount(w: Long, prior: Boolean, sentOnly: Boolean): Int {
        val statusClause = if (sentOnly) "status = 'SENT'" else "status in ('SENT','FAILED','DEAD')"
        val predicate =
            if (prior) {
                "updated_at >= utc_timestamp(6) - interval ? day and updated_at < utc_timestamp(6) - interval ? day"
            } else {
                "updated_at >= utc_timestamp(6) - interval ? day"
            }
        val args = if (prior) arrayOf<Any>(2 * w, w) else arrayOf<Any>(w)
        return scalarInt(
            "select count(*) from notification_deliveries where $statusClause and $predicate",
            *args,
        )
    }

    private fun benchmark(w: Long): List<AdminAnalyticsBenchmarkRaw> =
        jdbcTemplate.query(
            """
            select
              c.id as club_id, c.slug as slug, c.name as name,
              count(distinct sp.membership_id) as active_members,
              count(distinct s.id) as sessions,
              count(distinct case when s.state in ('CLOSED','PUBLISHED') then s.id end) as completed_sessions,
              count(sp.id) as participants,
              sum(case when sp.rsvp_status in ('GOING','MAYBE') then 1 else 0 end) as going_maybe,
              coalesce((
                select sum(a.cost_estimate_usd) from ai_generation_audit_log a
                where a.club_id = c.id and a.created_at >= utc_timestamp(6) - interval ? day
              ), 0) as ai_cost,
              coalesce((
                select count(*) from notification_deliveries n
                where n.club_id = c.id and n.status in ('SENT','FAILED','DEAD')
                  and n.updated_at >= utc_timestamp(6) - interval ? day
              ), 0) as notif_terminal,
              coalesce((
                select count(*) from notification_deliveries n
                where n.club_id = c.id and n.status = 'SENT'
                  and n.updated_at >= utc_timestamp(6) - interval ? day
              ), 0) as notif_sent
            from clubs c
            left join sessions s on s.club_id = c.id and s.session_date >= current_date() - interval ? day
            left join session_participants sp on sp.session_id = s.id
            group by c.id, c.slug, c.name
            having sessions > 0
            order by active_members desc, c.name asc
            limit 20
            """.trimIndent(),
            { rs, _ ->
                AdminAnalyticsBenchmarkRaw(
                    clubId = rs.uuid("club_id"),
                    slug = rs.getString("slug"),
                    name = rs.getString("name"),
                    activeMembers = rs.getInt("active_members"),
                    sessions = rs.getInt("sessions"),
                    completedSessions = rs.getInt("completed_sessions"),
                    participants = rs.getInt("participants"),
                    goingMaybe = rs.getInt("going_maybe"),
                    aiCost = rs.getBigDecimal("ai_cost") ?: BigDecimal.ZERO,
                    notifTerminal = rs.getInt("notif_terminal"),
                    notifSent = rs.getInt("notif_sent"),
                )
            },
            w, w, w, w,
        ) ?: emptyList()

    private fun scalarInt(sql: String, vararg args: Any): Int =
        jdbcTemplate.queryForObject(sql, Int::class.java, *args) ?: 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.admin.analytics.adapter.out.persistence.JdbcAdminAnalyticsAdapterTest"`
Expected: PASS. If a column/table name is wrong the SQL throws — fix against `V1__readmates_mysql_baseline.sql` and re-run.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapter.kt \
        server/src/test/kotlin/com/readmates/admin/analytics/adapter/out/persistence/JdbcAdminAnalyticsAdapterTest.kt
git commit -m "feat: aggregate windowed cross-club analytics in JDBC adapter"
```

### Task 5: Analytics controller + response DTO

`/api/admin/**` is already gated to `hasRole("PLATFORM_ADMIN")` (`SecurityConfig.kt:146`), so no security change is needed for a read-only GET.

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsController.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt`

- [ ] **Step 1: Write the failing controller integration test**

```kotlin
package com.readmates.admin.analytics.adapter.`in`.web

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminAnalyticsControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    @AfterEach
    fun cleanup() {
        if (createdSessionTokenHashes.isNotEmpty()) {
            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        createdSessionTokenHashes.clear()
    }

    @Test
    fun `owner reads analytics overview with five kpis and no private data`() {
        val body =
            mockMvc
                .get("/api/admin/analytics/overview?window=30d") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.analytics_overview.v1") }
                    jsonPath("$.window") { value("30d") }
                    jsonPath("$.kpis.length()") { value(5) }
                    jsonPath("$.kpis[0].key") { exists() }
                    jsonPath("$.clubBenchmark.availability") { exists() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain("@example.com")
        assertThat(body).doesNotContain("{\"raw")
    }

    @Test
    fun `defaults to 30d when window param is missing or invalid`() {
        mockMvc
            .get("/api/admin/analytics/overview?window=bogus") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.window") { value("30d") }
            }
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminAnalyticsControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server test --tests "com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest"`
Expected: FAIL — controller does not exist (404/no bean).

- [ ] **Step 3: Write the controller and response DTO**

```kotlin
@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.adapter.`in`.web

import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.port.`in`.GetAdminAnalyticsOverviewUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/admin/analytics")
class PlatformAdminAnalyticsController(
    private val useCase: GetAdminAnalyticsOverviewUseCase,
) {
    @GetMapping("/overview")
    fun overview(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) window: String?,
    ): AdminAnalyticsOverviewResponse =
        AdminAnalyticsOverviewResponse.from(useCase.overview(admin, AnalyticsWindow.fromWire(window)))
}

data class AdminAnalyticsOverviewResponse(
    val schema: String,
    val generatedAt: String,
    val window: String,
    val kpis: Any,
    val clubBenchmark: Any,
) {
    companion object {
        fun from(overview: AdminAnalyticsOverview): AdminAnalyticsOverviewResponse =
            AdminAnalyticsOverviewResponse(
                schema = overview.schema,
                generatedAt = overview.generatedAt.toString(),
                window = overview.window.wire,
                kpis = overview.kpis,
                clubBenchmark = overview.clubBenchmark,
            )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.admin.analytics.adapter.in.web.PlatformAdminAnalyticsControllerTest"`
Expected: PASS (2 tests). Enums serialize as their names (`ACTIVE_MEMBERS`, `PERCENT`, `AVAILABLE`, `UP`); the frontend types in Task 7 must match these exactly.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsController.kt \
        server/src/test/kotlin/com/readmates/admin/analytics/adapter/in/web/PlatformAdminAnalyticsControllerTest.kt
git commit -m "feat: expose admin analytics overview endpoint"
```

### Task 6: Register `admin.analytics` in the architecture boundary test

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Add the slice to the registry**

In the `serverSlices` list, after the `admin.health` `ServerSlice(...)` block (around line 101), insert:

```kotlin
            ServerSlice(
                name = "admin.analytics",
                type = ServerSliceType.READ,
                webAdapterPackages = listOf("com.readmates.admin.analytics.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.admin.analytics.application.."),
            ),
```

- [ ] **Step 2: Extend the registry assertion**

In `\`server architecture registry includes recent admin and aigen slices\``, change the assertion set to include the new slice:

```kotlin
        assertTrue(
            registered.containsAll(setOf("admin.audit", "admin.health", "admin.analytics", "aigen")),
            "Server slice registry must include admin.audit, admin.health, admin.analytics, and aigen.",
        )
```

- [ ] **Step 3: Run the architecture + new-slice tests**

Run: `./server/gradlew -p server test --tests "com.readmates.architecture.ServerArchitectureBoundaryTest"`
Expected: PASS. This proves the web adapter does not touch persistence and the application layer does not import adapters.

- [ ] **Step 4: Commit**

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "test: register admin.analytics server slice in architecture boundary"
```

- [ ] **Step 5: Run the full server unit suite**

Run: `./server/gradlew -p server unitTest`
Expected: PASS. (Use `clean test` if you need the integration-tagged tests too.)

---

## Phase B — Frontend vertical

### Task 7: Analytics model (types, window URL state, display helpers)

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-analytics-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`

- [ ] **Step 1: Write the failing model test**

```ts
import { describe, expect, it } from "vitest";
import {
  analyticsWindowFromSearchParams,
  analyticsSearchFromWindow,
  formatKpiValue,
  labelKpi,
  type AdminAnalyticsKpiCard,
} from "./platform-admin-analytics-model";

function card(partial: Partial<AdminAnalyticsKpiCard>): AdminAnalyticsKpiCard {
  return {
    key: "SESSION_COMPLETION",
    unit: "PERCENT",
    availability: "AVAILABLE",
    current: 80,
    prior: 50,
    deltaDirection: "UP",
    ...partial,
  };
}

describe("platform-admin-analytics-model", () => {
  it("defaults the window to 30d for missing or invalid params", () => {
    expect(analyticsWindowFromSearchParams(new URLSearchParams(""))).toBe("30d");
    expect(analyticsWindowFromSearchParams(new URLSearchParams("window=bogus"))).toBe("30d");
    expect(analyticsWindowFromSearchParams(new URLSearchParams("window=7d"))).toBe("7d");
  });

  it("serializes the window back to a search param", () => {
    expect(analyticsSearchFromWindow("90d").toString()).toBe("window=90d");
  });

  it("formats values per unit and shows a not-enough-data label", () => {
    expect(formatKpiValue(card({ unit: "PERCENT", current: 80 }))).toBe("80%");
    expect(formatKpiValue(card({ unit: "USD", current: 1.5 }))).toBe("$1.5000");
    expect(formatKpiValue(card({ unit: "COUNT", current: 12 }))).toBe("12");
    expect(formatKpiValue(card({ availability: "NOT_ENOUGH_DATA", current: null }))).toBe("데이터 부족");
  });

  it("labels each KPI in Korean", () => {
    expect(labelKpi("NOTIFICATION_DELIVERY")).toBe("알림 도달률");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test platform-admin-analytics-model`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the model**

```ts
export type AnalyticsWindow = "7d" | "30d" | "90d";
export type KpiKey =
  | "ACTIVE_MEMBERS"
  | "SESSION_COMPLETION"
  | "RSVP_RATE"
  | "AI_COST_PER_SESSION"
  | "NOTIFICATION_DELIVERY";
export type KpiUnit = "COUNT" | "PERCENT" | "USD";
export type Availability = "AVAILABLE" | "NOT_ENOUGH_DATA";
export type DeltaDirection = "UP" | "DOWN" | "FLAT" | "NONE";

export type AdminAnalyticsKpiCard = {
  key: KpiKey;
  unit: KpiUnit;
  availability: Availability;
  current: number | null;
  prior: number | null;
  deltaDirection: DeltaDirection;
};

export type AdminAnalyticsBenchmarkRow = {
  clubId: string;
  slug: string;
  name: string;
  activeMembers: number;
  sessionCompletionRate: number | null;
  rsvpRate: number | null;
  aiCostUsd: string;
  notificationDeliveryRate: number | null;
};

export type AdminAnalyticsBenchmark = {
  availability: Availability;
  rows: AdminAnalyticsBenchmarkRow[];
};

export type AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v1";
  generatedAt: string;
  window: AnalyticsWindow;
  kpis: AdminAnalyticsKpiCard[];
  clubBenchmark: AdminAnalyticsBenchmark;
};

const WINDOWS: AnalyticsWindow[] = ["7d", "30d", "90d"];
const DEFAULT_WINDOW: AnalyticsWindow = "30d";

export function analyticsWindowFromSearchParams(params: URLSearchParams): AnalyticsWindow {
  const raw = params.get("window");
  return WINDOWS.includes(raw as AnalyticsWindow) ? (raw as AnalyticsWindow) : DEFAULT_WINDOW;
}

export function analyticsSearchFromWindow(window: AnalyticsWindow): URLSearchParams {
  const params = new URLSearchParams();
  params.set("window", window);
  return params;
}

const KPI_LABELS: Record<KpiKey, string> = {
  ACTIVE_MEMBERS: "활성 멤버",
  SESSION_COMPLETION: "세션 완료율",
  RSVP_RATE: "RSVP 응답률",
  AI_COST_PER_SESSION: "AI 비용/세션",
  NOTIFICATION_DELIVERY: "알림 도달률",
};

export function labelKpi(key: KpiKey): string {
  return KPI_LABELS[key];
}

const WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
};

export function labelWindow(window: AnalyticsWindow): string {
  return WINDOW_LABELS[window];
}

export function formatKpiValue(card: AdminAnalyticsKpiCard): string {
  if (card.availability === "NOT_ENOUGH_DATA" || card.current === null) {
    return "데이터 부족";
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

export function deltaLabel(card: AdminAnalyticsKpiCard): string {
  if (card.deltaDirection === "NONE" || card.current === null || card.prior === null) {
    return "이전 구간 대비 비교 불가";
  }
  const diff = Math.round((card.current - card.prior) * 10000) / 10000;
  const arrow = card.deltaDirection === "UP" ? "▲" : card.deltaDirection === "DOWN" ? "▼" : "→";
  const sign = diff > 0 ? "+" : "";
  return `${arrow} ${sign}${diff} (이전 구간 대비)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test platform-admin-analytics-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-analytics-model.ts \
        front/features/platform-admin/model/platform-admin-analytics-model.test.ts
git commit -m "feat: add admin analytics model and display helpers"
```

### Task 8: Analytics API client

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-analytics-api.ts`

- [ ] **Step 1: Write the API client**

```ts
import { readmatesFetch } from "@/shared/api/client";
import {
  analyticsSearchFromWindow,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

export function fetchAdminAnalyticsOverview(window: AnalyticsWindow) {
  return readmatesFetch<AdminAnalyticsOverview>(
    `/api/admin/analytics/overview?${analyticsSearchFromWindow(window).toString()}`,
    undefined,
    { clubSlug: undefined },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add front/features/platform-admin/api/platform-admin-analytics-api.ts
git commit -m "feat: add admin analytics api client"
```

### Task 9: Analytics query options

**Files:**
- Create: `front/features/platform-admin/queries/platform-admin-analytics-queries.ts`

- [ ] **Step 1: Write the query module**

```ts
import { queryOptions } from "@tanstack/react-query";
import { fetchAdminAnalyticsOverview } from "@/features/platform-admin/api/platform-admin-analytics-api";
import type { AnalyticsWindow } from "@/features/platform-admin/model/platform-admin-analytics-model";

export const platformAdminAnalyticsKeys = {
  all: ["platform-admin", "analytics"] as const,
  overview: (window: AnalyticsWindow) => [...platformAdminAnalyticsKeys.all, "overview", window] as const,
} as const;

export function platformAdminAnalyticsOverviewQuery(window: AnalyticsWindow) {
  return queryOptions({
    queryKey: platformAdminAnalyticsKeys.overview(window),
    queryFn: () => fetchAdminAnalyticsOverview(window),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add front/features/platform-admin/queries/platform-admin-analytics-queries.ts
git commit -m "feat: add admin analytics query options"
```

### Task 10: Route loader

**Files:**
- Create: `front/features/platform-admin/route/admin-analytics-data.ts`

- [ ] **Step 1: Write the loader factory**

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { analyticsWindowFromSearchParams } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";

export function adminAnalyticsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAnalytics(args?: LoaderFunctionArgs) {
    const window = args
      ? analyticsWindowFromSearchParams(new URL(args.request.url).searchParams)
      : "30d";
    await queryClient.fetchQuery(platformAdminAnalyticsOverviewQuery(window));
    return null;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add front/features/platform-admin/route/admin-analytics-data.ts
git commit -m "feat: seed admin analytics overview in route loader"
```

### Task 11: Analytics overview UI (KPI cards + benchmark + empty states)

**Files:**
- Create: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
- Test: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`

- [ ] **Step 1: Write the failing UI test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsOverview } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { AdminAnalyticsOverviewView } from "./admin-analytics-overview";

const overview: AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v1",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    { key: "SESSION_COMPLETION", unit: "PERCENT", availability: "AVAILABLE", current: 80, prior: 50, deltaDirection: "UP" },
    { key: "RSVP_RATE", unit: "PERCENT", availability: "NOT_ENOUGH_DATA", current: null, prior: null, deltaDirection: "NONE" },
    { key: "ACTIVE_MEMBERS", unit: "COUNT", availability: "AVAILABLE", current: 12, prior: 9, deltaDirection: "UP" },
    { key: "AI_COST_PER_SESSION", unit: "USD", availability: "AVAILABLE", current: 1.5, prior: 1.2, deltaDirection: "UP" },
    { key: "NOTIFICATION_DELIVERY", unit: "PERCENT", availability: "AVAILABLE", current: 95, prior: 95, deltaDirection: "FLAT" },
  ],
  clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
};

describe("AdminAnalyticsOverviewView", () => {
  it("renders KPI values and a not-enough-data benchmark empty state", () => {
    render(
      <AdminAnalyticsOverviewView
        overview={overview}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(screen.getByText("세션 완료율")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("데이터 부족").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("클럽 비교에 충분한 데이터가 없습니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test admin-analytics-overview`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the UI component**

```tsx
import {
  analyticsSearchFromWindow,
  deltaLabel,
  formatKpiValue,
  labelKpi,
  labelWindow,
  type AdminAnalyticsBenchmarkRow,
  type AdminAnalyticsKpiCard,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

export type AdminAnalyticsOverviewViewProps = {
  overview: AdminAnalyticsOverview | null;
  window: AnalyticsWindow;
  loading: boolean;
  error: string | null;
  onWindowChange: (window: AnalyticsWindow) => void;
};

const WINDOWS: AnalyticsWindow[] = ["7d", "30d", "90d"];

export function AdminAnalyticsOverviewView({
  overview,
  window,
  loading,
  error,
  onWindowChange,
}: AdminAnalyticsOverviewViewProps) {
  return (
    <section className="admin-analytics" aria-labelledby="admin-analytics-heading">
      <header className="admin-analytics__header">
        <h1 id="admin-analytics-heading">분석</h1>
        <div className="admin-analytics__windows" role="group" aria-label="분석 기간 선택">
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              className="admin-analytics__window"
              aria-pressed={value === window}
              onClick={() => onWindowChange(value)}
            >
              {labelWindow(value)}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="admin-analytics__error" role="alert">{error}</p> : null}
      {loading && !overview ? <p className="admin-analytics__loading">분석 데이터를 불러오는 중…</p> : null}

      {overview ? (
        <>
          <ul className="admin-analytics__kpis" aria-label="핵심 지표">
            {overview.kpis.map((card) => (
              <AdminAnalyticsKpiTile key={card.key} card={card} />
            ))}
          </ul>
          <AdminAnalyticsBenchmarkTable benchmark={overview.clubBenchmark} />
        </>
      ) : null}
    </section>
  );
}

function AdminAnalyticsKpiTile({ card }: { card: AdminAnalyticsKpiCard }) {
  const unavailable = card.availability === "NOT_ENOUGH_DATA";
  return (
    <li className={`admin-analytics__kpi${unavailable ? " admin-analytics__kpi--empty" : ""}`}>
      <span className="admin-analytics__kpi-label">{labelKpi(card.key)}</span>
      <span className="admin-analytics__kpi-value">{formatKpiValue(card)}</span>
      <span className="admin-analytics__kpi-delta">{deltaLabel(card)}</span>
    </li>
  );
}

function AdminAnalyticsBenchmarkTable({
  benchmark,
}: {
  benchmark: AdminAnalyticsOverview["clubBenchmark"];
}) {
  if (benchmark.availability === "NOT_ENOUGH_DATA" || benchmark.rows.length === 0) {
    return <p className="admin-analytics__benchmark-empty">클럽 비교에 충분한 데이터가 없습니다.</p>;
  }
  return (
    <table className="admin-analytics__benchmark" aria-label="클럽 비교">
      <thead>
        <tr>
          <th scope="col">클럽</th>
          <th scope="col">활성 멤버</th>
          <th scope="col">세션 완료율</th>
          <th scope="col">RSVP 응답률</th>
          <th scope="col">AI 비용</th>
          <th scope="col">알림 도달률</th>
        </tr>
      </thead>
      <tbody>
        {benchmark.rows.map((row) => (
          <AdminAnalyticsBenchmarkRowView key={row.clubId} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function AdminAnalyticsBenchmarkRowView({ row }: { row: AdminAnalyticsBenchmarkRow }) {
  return (
    <tr>
      <th scope="row">{row.name}</th>
      <td>{row.activeMembers}</td>
      <td>{percentOrDash(row.sessionCompletionRate)}</td>
      <td>{percentOrDash(row.rsvpRate)}</td>
      <td>${row.aiCostUsd}</td>
      <td>{percentOrDash(row.notificationDeliveryRate)}</td>
    </tr>
  );
}

function percentOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test admin-analytics-overview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/admin-analytics-overview.tsx \
        front/features/platform-admin/ui/admin-analytics-overview.test.tsx
git commit -m "feat: render admin analytics KPI cards and club benchmark"
```

### Task 12: Analytics route component

**Files:**
- Create: `front/features/platform-admin/route/admin-analytics-route.tsx`
- Test: `front/features/platform-admin/route/admin-analytics-route.test.tsx`

- [ ] **Step 1: Write the failing route test**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import { AdminAnalyticsRoute } from "./admin-analytics-route";

function renderRoute(initialEntry = "/admin/analytics?window=7d") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(platformAdminAnalyticsOverviewQuery("7d").queryKey, {
    schema: "admin.analytics_overview.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    window: "7d",
    kpis: [
      { key: "SESSION_COMPLETION", unit: "PERCENT", availability: "AVAILABLE", current: 75, prior: 60, deltaDirection: "UP" },
    ],
    clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminAnalyticsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAnalyticsRoute", () => {
  it("renders the cached analytics overview from the URL window", () => {
    renderRoute();
    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test admin-analytics-route`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route component**

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  analyticsSearchFromWindow,
  analyticsWindowFromSearchParams,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";
import { platformAdminAnalyticsOverviewQuery } from "@/features/platform-admin/queries/platform-admin-analytics-queries";
import { AdminAnalyticsOverviewView } from "@/features/platform-admin/ui/admin-analytics-overview";

const GENERIC_ERROR = "분석 데이터를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminAnalyticsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const window = useMemo(() => analyticsWindowFromSearchParams(searchParams), [searchParams]);
  const query = useQuery(platformAdminAnalyticsOverviewQuery(window));

  function changeWindow(next: AnalyticsWindow) {
    setSearchParams(analyticsSearchFromWindow(next));
  }

  return (
    <AdminAnalyticsOverviewView
      overview={query.data ?? null}
      window={window}
      loading={query.isLoading}
      error={query.isError ? GENERIC_ERROR : null}
      onWindowChange={changeWindow}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test admin-analytics-route`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-analytics-route.tsx \
        front/features/platform-admin/route/admin-analytics-route.test.tsx
git commit -m "feat: wire admin analytics route to window URL state"
```

---

### Task 13: Wire analytics route into catalog + router + styles

Flip the `analytics` catalog entry from `coming_soon` to `ready`, wire the
lazy route into `admin.tsx`, and add the presentation styles the view uses.

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts:90-109`
- Modify: `front/features/platform-admin/model/admin-route-catalog.test.ts:37-64`
- Modify: `front/src/app/routes/admin.tsx:134-148`
- Modify: `front/src/styles/globals.css` (append `admin-analytics-*` block)

- [ ] **Step 1: Update the catalog test to expect analytics ready**

In `front/features/platform-admin/model/admin-route-catalog.test.ts`, change the
"requires no comingSoon block when status is ready" expectation to include
`"analytics"` in sorted position:

```ts
  it("requires no comingSoon block when status is ready", () => {
    const ready = ADMIN_ROUTES.filter((route) => route.status === "ready");
    expect(ready.map((route) => route.path).sort()).toEqual([
      "ai-ops",
      "analytics",
      "audit",
      "clubs",
      "health",
      "notifications",
      "support",
      "today",
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test admin-route-catalog`
Expected: FAIL — `analytics` is still `coming_soon`, so it is absent from the ready list.

- [ ] **Step 3: Flip the catalog entry to ready**

In `front/features/platform-admin/model/admin-route-catalog.ts`, replace the
`analytics` descriptor (lines 90-109) with the ready form (drop the `comingSoon` block):

```ts
  {
    path: "analytics",
    label: "분석",
    group: "review",
    groupLabel: "감사/분석",
    slice: "S8",
    status: "ready",
    requiredCapability: "view_analytics",
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test admin-route-catalog`
Expected: PASS.

- [ ] **Step 5: Wire the ready route in the router**

In `front/src/app/routes/admin.tsx`, add a `case "analytics"` to the `readyChild`
switch, immediately after the `case "audit"` block (before `default:` at line 146):

```tsx
    case "analytics":
      return {
        path: "analytics",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminAnalyticsRoute }, { adminAnalyticsLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-analytics-route"),
            import("@/features/platform-admin/route/admin-analytics-data"),
          ]);
          return { Component: AdminAnalyticsRoute, loader: adminAnalyticsLoaderFactory(queryClient) };
        },
      };
```

- [ ] **Step 6: Add the presentation styles**

Append to `front/src/styles/globals.css` (after the existing `.admin-audit*` block):

```css
.admin-analytics {
  display: grid;
  gap: 24px;
  max-width: 1160px;
}

.admin-analytics__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.admin-analytics__windows {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-analytics__window {
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  padding: 6px 14px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.admin-analytics__window[aria-pressed="true"] {
  border-color: var(--accent);
  background: var(--bg-sub);
}

.admin-analytics__kpis {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.admin-analytics__kpi {
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg);
  padding: 16px;
  display: grid;
  gap: 6px;
}

.admin-analytics__kpi--empty {
  background: var(--bg-sub);
}

.admin-analytics__kpi-label {
  color: var(--muted);
  font-size: 13px;
}

.admin-analytics__kpi-value {
  font-size: 24px;
  font-weight: 600;
}

.admin-analytics__kpi-delta {
  font-size: 13px;
  color: var(--muted);
}

.admin-analytics__benchmark {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg);
  overflow: hidden;
}

.admin-analytics__benchmark th,
.admin-analytics__benchmark td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

.admin-analytics__benchmark-empty,
.admin-analytics__error,
.admin-analytics__loading {
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  margin: 0;
  padding: 14px 16px;
  background: var(--bg-sub);
}

.admin-analytics__error {
  border-color: var(--danger);
  color: var(--danger);
  background: transparent;
}

@media (max-width: 720px) {
  .admin-analytics__benchmark {
    display: block;
    overflow-x: auto;
  }
}
```

- [ ] **Step 7: Run the frontend unit + build checks**

Run: `pnpm --dir front test admin-route-catalog admin-analytics`
Expected: PASS.

Run: `pnpm --dir front build`
Expected: build succeeds (analytics chunk emitted, no unresolved import).

- [ ] **Step 8: Commit**

```bash
git add front/features/platform-admin/model/admin-route-catalog.ts \
        front/features/platform-admin/model/admin-route-catalog.test.ts \
        front/src/app/routes/admin.tsx \
        front/src/styles/globals.css
git commit -m "feat: flip admin analytics route to ready and wire router"
```

---
### Task 14: End-to-end analytics route

Mirror `front/tests/e2e/admin-audit.spec.ts`: stub the platform-admin shell
(auth/me, summary, clubs) plus the analytics overview endpoint, then assert the
route renders KPI values, switches windows via URL, and leaks no private fields.

**Files:**
- Create: `front/tests/e2e/admin-analytics.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.com`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: `platform-${role.toLowerCase()}-user`, email, role },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routePlatformAdminShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

function overview(windowValue: "7d" | "30d" | "90d") {
  return {
    schema: "admin.analytics_overview.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    window: windowValue,
    kpis: [
      { key: "SESSION_COMPLETION", unit: "PERCENT", availability: "AVAILABLE", current: windowValue === "7d" ? 70 : 80, prior: 50, deltaDirection: "UP" },
      { key: "RSVP_RATE", unit: "PERCENT", availability: "NOT_ENOUGH_DATA", current: null, prior: null, deltaDirection: "NONE" },
      { key: "ACTIVE_MEMBERS", unit: "COUNT", availability: "AVAILABLE", current: 12, prior: 9, deltaDirection: "UP" },
      { key: "AI_COST_PER_SESSION", unit: "USD", availability: "AVAILABLE", current: 1.5, prior: 1.2, deltaDirection: "UP" },
      { key: "NOTIFICATION_DELIVERY", unit: "PERCENT", availability: "AVAILABLE", current: 95, prior: 95, deltaDirection: "FLAT" },
    ],
    clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
  };
}

async function routeAnalytics(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/analytics/overview**", async (route) => {
    const url = new URL(route.request().url());
    const windowParam = (url.searchParams.get("window") ?? "30d") as "7d" | "30d" | "90d";
    await json(route, 200, overview(windowParam));
  });
}

test("owner reviews admin analytics overview and switches window", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAnalytics(page);

  await page.goto("/admin/analytics");

  await expect(page.getByRole("heading", { name: "분석" })).toBeVisible();
  await expect(page.getByText("80%")).toBeVisible();
  await expect(page.getByText("클럽 비교에 충분한 데이터가 없습니다.")).toBeVisible();

  await page.getByRole("button", { name: "최근 7일" }).click();

  await expect(page).toHaveURL(/window=7d/);
  await expect(page.getByText("70%")).toBeVisible();

  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `pnpm --dir front test:e2e admin-analytics`
Expected: PASS — heading, KPI values, benchmark empty state, window switch, and no private fields.

- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e/admin-analytics.spec.ts
git commit -m "test: cover admin analytics overview e2e flow"
```

---
### Task 15: CHANGELOG + docs

Record the new analytics surface in `CHANGELOG.md` (Unreleased) so the release-tag
guard sees a concrete entry, and note in the closeout roadmap that S8 is the
first delivered slice.

**Files:**
- Modify: `CHANGELOG.md` (Unreleased → Highlights + Engineering)
- Modify: `docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md` (Slice Order: mark S8 delivered)

- [ ] **Step 1: Add the Highlights entry**

In `CHANGELOG.md`, under `## Unreleased` → `### Highlights`, append after the
last `/admin/clubs/:clubId` bullet:

```markdown
- **Admin vNext S8 분석/리포팅 lite**: `/admin/analytics`를 마지막 COMING-SOON 라우트에서 READY로 전환했습니다. 7/30/90일 윈도우 선택(URL state)으로 활성 멤버·세션 완료율·RSVP 응답률·AI 비용/세션·알림 도달률을 현재-대비-직전 윈도우 델타로 보여주고, 클럽 간 비교(cross-club benchmark)를 제공합니다. 분모가 0인 지표는 차트를 지어내지 않고 "데이터 부족" empty state로 정직하게 표기합니다. 새 read-only 서버 슬라이스 `admin.analytics`(controller → service → JDBC adapter)가 클럽 전반의 원시 카운트를 집계하고, 비율·델타·가용성 파생은 순수 application service에서 단위 테스트로 검증합니다.
```

- [ ] **Step 2: Add the Engineering entry**

In `CHANGELOG.md`, under `## Unreleased` → `### Engineering`, append:

```markdown
- **platform-admin:** add the read-only `admin.analytics` slice and `/admin/analytics` overview.
  `GET /api/admin/analytics/overview?window=7d|30d|90d` aggregates raw counts across clubs over
  current/prior windows; the application service derives rate/delta/availability (pure, unit-tested)
  while the JDBC adapter returns only counts. Metric contract pinned as `admin.analytics_overview.v1`:
  ACTIVE_MEMBERS, SESSION_COMPLETION, RSVP_RATE, AI_COST_PER_SESSION, NOTIFICATION_DELIVERY, with
  `NOT_ENOUGH_DATA` when a denominator is 0 and numeric `deltaDirection` (UP/DOWN/FLAT/NONE) leaving
  good/bad coloring to the UI. No charting library added — trend is current-vs-prior delta. Registered
  in `ServerArchitectureBoundaryTest` and covered by service/adapter/controller and e2e tests asserting
  no `@example.com` or raw JSON bodies leak.
```

- [ ] **Step 3: Mark S8 delivered in the closeout roadmap**

In `docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md`, in the
Slice Order section, annotate the S8 row/heading to reflect that it is the first delivered slice
(e.g., append `— delivered 2026-05-30 (`admin.analytics` slice, plan `2026-05-30-admin-s8-analytics-reporting-lite.md`)` to the S8 entry). Leave S6 and S9 unchanged as `pending`.

- [ ] **Step 4: Verify the release guard accepts the entries**

Run: `git diff --check -- CHANGELOG.md docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md`
Expected: no whitespace errors.

Run: `READMATES_PRE_PUSH_RELEASE=true ./scripts/pre-push-check.sh` (or the documented `--release` form)
Expected: CHANGELOG Unreleased guard passes (concrete category headers, feature-style bold markers, no placeholder-only bullets).

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md
git commit -m "docs: record admin analytics slice in changelog and roadmap"
```

---

## Final verification (run before opening the PR)

After all tasks, run the full gate set named in `front/AGENTS.md` and the server guide:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./server/gradlew -p server clean test
```

Expected: all pass. If any check is skipped, report the exact command and reason in the PR description.

Release-readiness (per `AGENTS.md`): confirm the CHANGELOG Unreleased entry, the
ArchUnit slice registration, and the public-release safety scan (`@example.com` /
raw JSON absent from serialized bodies) before merge.
