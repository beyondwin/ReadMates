# Admin vNext S2 — Platform Ops Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip `/admin/health` from COMING-SOON to a READY 7-card grid backed by a `/api/admin/health/snapshot` endpoint that composes in-process Micrometer signals + local Prometheus HTTP queries on a 10s refresh.

**Architecture:** New backend package `com.readmates.admin.health` with controller + service + `HealthCardProvider` interface and seven implementations + two outbound ports (`PrometheusQueryPort`, `DeployLedgerPort`). Snapshot is computed every 10s by `@Scheduled` into an `AtomicReference<PlatformHealthSnapshot>`; requests read the cache lock-free. Per-card failures stay contained (one provider fails → that card only is `status=unknown`). Frontend ships a new `/admin/health` route + grid/card components + Playwright happy path; the route catalog and permission matrix get one-line toggles.

**Tech Stack:** Kotlin/Spring Boot 3 (`RestClient` for Prometheus HTTP), Micrometer (in-process), AssertJ + JUnit 5 + in-tree fakes (no MockK; project uses Mockito). React 18 + react-router-dom + TanStack Query + Vitest + Playwright.

**Spec:** [`docs/superpowers/specs/2026-05-26-readmates-admin-vnext-s2-platform-ops-health-design.md`](../specs/2026-05-26-readmates-admin-vnext-s2-platform-ops-health-design.md)

---

## File Structure

**Create (backend):**

- `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCard.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCardStatus.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCardSource.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCardDrill.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/model/PlatformHealthSnapshot.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/model/DeployAttemptStripEntry.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/port/out/PrometheusQueryPort.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/port/out/DeployLedgerPort.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/HealthCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DbPoolHealthCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboxBacklogHealthCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProvider.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`
- `server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt`
- `server/src/main/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapter.kt`
- `server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt`
- `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`

**Create (backend tests):**

- one `*Test.kt` next to each provider, plus `PlatformAdminHealthServiceTest.kt`, `HttpPrometheusQueryAdapterTest.kt`, `JsonlDeployLedgerAdapterTest.kt`, `PlatformAdminHealthControllerTest.kt`.

**Create (frontend):**

- `front/features/platform-admin/api/platform-admin-health-contracts.ts`
- `front/features/platform-admin/api/platform-admin-health-api.ts`
- `front/features/platform-admin/queries/platform-admin-health-queries.ts`
- `front/features/platform-admin/route/admin-health-route.tsx`
- `front/features/platform-admin/route/admin-health-data.ts`
- `front/features/platform-admin/ui/admin-health-grid.tsx`
- `front/features/platform-admin/ui/admin-health-card.tsx`
- `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`

**Create (frontend tests):**

- one `*.test.ts(x)` next to each new module + a Playwright spec `front/tests/e2e/admin-health.spec.ts`.

**Modify:**

- `front/features/platform-admin/model/admin-route-catalog.ts` — flip `health` to `status: "ready"` (drop `comingSoon` block).
- `front/src/app/routes/admin.tsx` — add `health` arm in `readyChild`.
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` — add `com.readmates.admin` to known package list (if necessary; verify first).
- `CHANGELOG.md` — Unreleased Engineering entry.
- `docs/operations/observability/README.md` — one bullet linking to `/admin/health`.

---

### Task 1: Domain types + ports

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCardStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCardSource.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCardDrill.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/HealthCard.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/DeployAttemptStripEntry.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/PlatformHealthSnapshot.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/port/out/PrometheusQueryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/port/out/DeployLedgerPort.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/HealthCardProvider.kt`

- [ ] **Step 1: Create `HealthCardStatus.kt`**

```kotlin
package com.readmates.admin.health.application.model

enum class HealthCardStatus { OK, WARN, CRIT, UNKNOWN }
```

- [ ] **Step 2: Create `HealthCardSource.kt`**

```kotlin
package com.readmates.admin.health.application.model

enum class HealthCardSource { IN_PROCESS, PROMETHEUS, FILE }
```

- [ ] **Step 3: Create `HealthCardDrill.kt`**

```kotlin
package com.readmates.admin.health.application.model

sealed interface HealthCardDrill {
    data class AdminRoute(val target: String) : HealthCardDrill
}
```

- [ ] **Step 4: Create `HealthCard.kt`**

```kotlin
package com.readmates.admin.health.application.model

import java.time.Instant

data class HealthCardMetric(
    val value: Double?,
    val unit: String,
    val label: String?,
)

data class HealthCardThresholds(
    val warn: Double?,
    val crit: Double?,
)

data class HealthCard(
    val id: String,
    val title: String,
    val status: HealthCardStatus,
    val metric: HealthCardMetric?,
    val thresholds: HealthCardThresholds?,
    val lastCheckedAt: Instant,
    val source: HealthCardSource,
    val drill: HealthCardDrill?,
    val reason: String?,
    val deployStrip: List<DeployAttemptStripEntry>? = null,
)
```

- [ ] **Step 5: Create `DeployAttemptStripEntry.kt`**

```kotlin
package com.readmates.admin.health.application.model

import java.time.Instant

enum class DeployAttemptFinalStatus { SUCCEEDED, FAILED, RUNNING }

data class DeployAttemptStripEntry(
    val attemptId: String,
    val startedAt: Instant,
    val endedAt: Instant?,
    val finalStatus: DeployAttemptFinalStatus,
    val imageTag: String?,
    val durationSeconds: Long?,
)
```

- [ ] **Step 6: Create `PlatformHealthSnapshot.kt`**

```kotlin
package com.readmates.admin.health.application.model

import java.time.Instant

data class PlatformHealthSnapshot(
    val schema: String,
    val generatedAt: Instant,
    val cards: List<HealthCard>,
) {
    companion object {
        const val SCHEMA = "platform.health_snapshot.v1"
    }
}
```

- [ ] **Step 7: Create `PrometheusQueryPort.kt`**

```kotlin
package com.readmates.admin.health.application.port.out

data class PromInstantValue(
    val labels: Map<String, String>,
    val value: Double,
)

data class PromQueryResult(
    val values: List<PromInstantValue>,
)

interface PrometheusQueryPort {
    fun query(promql: String): PromQueryResult
}
```

- [ ] **Step 8: Create `DeployLedgerPort.kt`**

```kotlin
package com.readmates.admin.health.application.port.out

import com.readmates.admin.health.application.model.DeployAttemptStripEntry

interface DeployLedgerPort {
    fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry>
}
```

- [ ] **Step 9: Create `HealthCardProvider.kt`**

```kotlin
package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard

interface HealthCardProvider {
    val cardId: String

    fun compute(): HealthCard
}
```

- [ ] **Step 10: Compile**

Run: `./server/gradlew -p server compileKotlin`
Expected: `BUILD SUCCESSFUL`. No tests yet — just type structure.

- [ ] **Step 11: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/health
git commit -m "platform-admin: introduce admin health domain model and outbound ports"
```

---

### Task 2: In-process providers (DB pool, Redis, Outbox backlog)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DbPoolHealthCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/DbPoolHealthCardProviderTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProviderTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboxBacklogHealthCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/OutboxBacklogHealthCardProviderTest.kt`

All three providers read `MeterRegistry` (already a Spring bean). Each provider has a private `Clock` injected for deterministic `lastCheckedAt` in tests.

- [ ] **Step 1: Write failing test for `DbPoolHealthCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/DbPoolHealthCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class DbPoolHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK when hikari pending is zero`() {
        val registry = SimpleMeterRegistry()
        registry.gauge("hikaricp.connections.pending", 0.0)

        val card = DbPoolHealthCardProvider(registry, clock).compute()

        assertThat(card.id).isEqualTo("db_pool")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
        assertThat(card.thresholds?.warn).isEqualTo(1.0)
        assertThat(card.thresholds?.crit).isEqualTo(5.0)
        assertThat(card.reason).isNull()
    }

    @Test
    fun `status is WARN when hikari pending is between warn and crit`() {
        val registry = SimpleMeterRegistry()
        registry.gauge("hikaricp.connections.pending", 2.0)
        val card = DbPoolHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.WARN)
    }

    @Test
    fun `status is CRIT when hikari pending is at or above crit`() {
        val registry = SimpleMeterRegistry()
        registry.gauge("hikaricp.connections.pending", 5.0)
        assertThat(DbPoolHealthCardProvider(registry, clock).compute().status)
            .isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when hikari gauge is absent`() {
        val registry = SimpleMeterRegistry()
        val card = DbPoolHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("hikari_gauge_unavailable")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.DbPoolHealthCardProviderTest"`
Expected: FAIL — `DbPoolHealthCardProvider` not found.

- [ ] **Step 3: Implement `DbPoolHealthCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DbPoolHealthCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class DbPoolHealthCardProvider(
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "db_pool"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val gauge = meterRegistry.find("hikaricp.connections.pending").gauge()
        if (gauge == null) {
            return HealthCard(
                id = cardId,
                title = "DB pool",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = THRESHOLDS,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = "hikari_gauge_unavailable",
            )
        }
        val pending = gauge.value()
        val status =
            when {
                pending >= WARN_THRESHOLD * 5 -> HealthCardStatus.CRIT
                pending >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "DB pool",
            status = status,
            metric = HealthCardMetric(value = pending, unit = "connections", label = "pending"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 1.0
        private const val CRIT_THRESHOLD = 5.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
    }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.DbPoolHealthCardProviderTest"`
Expected: PASS.

- [ ] **Step 5: Write failing test for `RedisHealthCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class RedisHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK when redis operation errors counter is zero`() {
        val registry = SimpleMeterRegistry()
        Counter.builder("readmates.redis.operation.errors").register(registry)
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.id).isEqualTo("redis")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
    }

    @Test
    fun `status is WARN when error count is moderately positive`() {
        val registry = SimpleMeterRegistry()
        val counter = Counter.builder("readmates.redis.operation.errors").register(registry)
        repeat(5) { counter.increment() }
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.WARN)
    }

    @Test
    fun `status is CRIT when error count is at or above crit threshold`() {
        val registry = SimpleMeterRegistry()
        val counter = Counter.builder("readmates.redis.operation.errors").register(registry)
        repeat(100) { counter.increment() }
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when counter is absent`() {
        val registry = SimpleMeterRegistry()
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("redis_metrics_unavailable")
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.RedisHealthCardProviderTest"`
Expected: FAIL — class missing.

- [ ] **Step 7: Implement `RedisHealthCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class RedisHealthCardProvider(
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "redis"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val counter = meterRegistry.find("readmates.redis.operation.errors").counter()
        if (counter == null) {
            return HealthCard(
                id = cardId,
                title = "Redis",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = THRESHOLDS,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = "redis_metrics_unavailable",
            )
        }
        val errorCount = counter.count()
        val status =
            when {
                errorCount >= CRIT_THRESHOLD -> HealthCardStatus.CRIT
                errorCount >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "Redis",
            status = status,
            metric = HealthCardMetric(value = errorCount, unit = "errors", label = "since boot"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 1.0
        private const val CRIT_THRESHOLD = 50.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
    }
}
```

Note: Using cumulative counter value (not 5-min rate) for in-process simplicity. Spec section 4.2 mentioned 0.05/s rate — the Prometheus alert rule (`RedisOperationErrors`) handles the rate-based alert; this card is a simple "has anything erred?" indicator. Adjust copy in `label` to `"since boot"`.

- [ ] **Step 8: Run the test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.RedisHealthCardProviderTest"`
Expected: PASS.

- [ ] **Step 9: Write failing test for `OutboxBacklogHealthCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/OutboxBacklogHealthCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardStatus
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.atomic.AtomicLong

class OutboxBacklogHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK and drill to admin notifications when backlog under warn`() {
        val registry = SimpleMeterRegistry()
        val backlog = AtomicLong(42L)
        Gauge.builder("readmates.notifications.outbox.backlog", backlog) { it.get().toDouble() }
            .tag("status", "pending")
            .register(registry)

        val card = OutboxBacklogHealthCardProvider(registry, clock).compute()

        assertThat(card.id).isEqualTo("outbox_backlog")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(42.0)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/notifications"))
    }

    @Test
    fun `status is WARN at warn threshold and CRIT at crit threshold`() {
        val registry = SimpleMeterRegistry()
        val backlog = AtomicLong(0L)
        Gauge.builder("readmates.notifications.outbox.backlog", backlog) { it.get().toDouble() }
            .tag("status", "pending")
            .register(registry)

        backlog.set(150L)
        assertThat(OutboxBacklogHealthCardProvider(registry, clock).compute().status)
            .isEqualTo(HealthCardStatus.WARN)

        backlog.set(1500L)
        assertThat(OutboxBacklogHealthCardProvider(registry, clock).compute().status)
            .isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when pending gauge missing`() {
        val registry = SimpleMeterRegistry()
        val card = OutboxBacklogHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("outbox_gauge_unavailable")
    }
}
```

- [ ] **Step 10: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.OutboxBacklogHealthCardProviderTest"`
Expected: FAIL.

- [ ] **Step 11: Implement `OutboxBacklogHealthCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboxBacklogHealthCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class OutboxBacklogHealthCardProvider(
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "outbox_backlog"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val gauge =
            meterRegistry
                .find("readmates.notifications.outbox.backlog")
                .tag("status", "pending")
                .gauge()
        if (gauge == null) {
            return HealthCard(
                id = cardId,
                title = "Outbox backlog",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = THRESHOLDS,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = DRILL,
                reason = "outbox_gauge_unavailable",
            )
        }
        val pending = gauge.value()
        val status =
            when {
                pending >= CRIT_THRESHOLD -> HealthCardStatus.CRIT
                pending >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "Outbox backlog",
            status = status,
            metric = HealthCardMetric(value = pending, unit = "rows", label = "pending"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = DRILL,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 100.0
        private const val CRIT_THRESHOLD = 1000.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
        private val DRILL = HealthCardDrill.AdminRoute("/admin/notifications")
    }
}
```

- [ ] **Step 12: Run the test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.OutboxBacklogHealthCardProviderTest"`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/health/application/service/providers/{DbPool,Redis,OutboxBacklog}HealthCardProvider.kt \
        server/src/test/kotlin/com/readmates/admin/health/application/service/providers/{DbPool,Redis,OutboxBacklog}HealthCardProviderTest.kt
git commit -m "platform-admin: add in-process health card providers (db pool, redis, outbox)"
```

---

### Task 3: Prometheus port + HTTP adapter + Prometheus-backed providers

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapterTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProviderTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProviderTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProviderTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`

- [ ] **Step 1: Write failing test for `HttpPrometheusQueryAdapter`**

Create `server/src/test/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapterTest.kt`:

```kotlin
package com.readmates.admin.health.adapter.out.prometheus

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.web.client.RestClient
import java.time.Duration

class HttpPrometheusQueryAdapterTest {
    private lateinit var server: MockWebServer

    @BeforeEach
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @AfterEach
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `parses instant vector with single value`() {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"status":"success","data":{"resultType":"vector","result":[
                       {"metric":{"provider":"CLAUDE"},"value":[1717000000,"0.97"]}
                    ]}}""".trimIndent(),
                ),
        )

        val adapter = newAdapter()
        val result = adapter.query("sum by (provider) (rate(readmates_aigen_jobs_completed_total[5m]))")

        assertThat(result.values).hasSize(1)
        assertThat(result.values[0].labels).containsEntry("provider", "CLAUDE")
        assertThat(result.values[0].value).isEqualTo(0.97)
    }

    @Test
    fun `returns empty values when prometheus returns no data`() {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody("""{"status":"success","data":{"resultType":"vector","result":[]}}"""),
        )

        val result = newAdapter().query("up")
        assertThat(result.values).isEmpty()
    }

    @Test
    fun `throws when prometheus returns non-200`() {
        server.enqueue(MockResponse().setResponseCode(500).setBody("boom"))
        try {
            newAdapter().query("up")
            throw AssertionError("expected exception")
        } catch (ex: PrometheusQueryException) {
            assertThat(ex.message).contains("500")
        }
    }

    private fun newAdapter(): HttpPrometheusQueryAdapter {
        val restClient =
            RestClient
                .builder()
                .baseUrl(server.url("/").toString())
                .build()
        return HttpPrometheusQueryAdapter(restClient, Duration.ofSeconds(5))
    }
}
```

Note: `okhttp3.mockwebserver.MockWebServer` is available in the project (used by other integration adapters; if not on `test` classpath, add `testImplementation("com.squareup.okhttp3:mockwebserver")` to `server/build.gradle.kts` and reload).

- [ ] **Step 2: Confirm MockWebServer is on the classpath**

Run: `grep -n "mockwebserver" /Users/kws/source/web/ReadMates/server/build.gradle.kts`
- If present → continue.
- If not → add `testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")` (or the existing okhttp version used in main) to the `dependencies {}` block in `server/build.gradle.kts`, then `./server/gradlew -p server --refresh-dependencies dependencies > /dev/null` once to seed cache. Commit this dependency add together with Task 3.

- [ ] **Step 3: Implement `HttpPrometheusQueryAdapter`**

Create `server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt`:

```kotlin
package com.readmates.admin.health.adapter.out.prometheus

import com.fasterxml.jackson.databind.JsonNode
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.time.Duration

class PrometheusQueryException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

class HttpPrometheusQueryAdapter(
    private val restClient: RestClient,
    @Suppress("UnusedPrivateProperty") private val requestTimeout: Duration,
) : PrometheusQueryPort {
    override fun query(promql: String): PromQueryResult {
        return try {
            val body =
                restClient
                    .get()
                    .uri { builder -> builder.path("api/v1/query").queryParam("query", promql).build() }
                    .retrieve()
                    .body(JsonNode::class.java)
                    ?: throw PrometheusQueryException("empty body")
            val status = body.path("status").asText()
            if (status != "success") {
                throw PrometheusQueryException("prometheus status=$status")
            }
            val results = body.path("data").path("result")
            val values =
                results.map { entry ->
                    val labels =
                        entry
                            .path("metric")
                            .fields()
                            .asSequence()
                            .associate { it.key to it.value.asText() }
                    val valueArray = entry.path("value")
                    val raw = valueArray.path(1).asText()
                    PromInstantValue(labels = labels, value = raw.toDouble())
                }
            PromQueryResult(values = values)
        } catch (ex: RestClientResponseException) {
            throw PrometheusQueryException("prometheus http ${ex.statusCode.value()}", ex)
        }
    }
}
```

- [ ] **Step 4: Run the adapter test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.adapter.out.prometheus.HttpPrometheusQueryAdapterTest"`
Expected: PASS (all three cases).

- [ ] **Step 5: Write failing test for `KafkaLagHealthCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class KafkaLagHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakePrometheus(private val behaviour: () -> PromQueryResult) : PrometheusQueryPort {
        override fun query(promql: String): PromQueryResult = behaviour()
    }

    @Test
    fun `status OK when max lag below warn`() {
        val card =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 12.0))) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(12.0)
    }

    @Test
    fun `status WARN at warn and CRIT at crit thresholds`() {
        val warn =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 50.0))) },
                clock,
            ).compute()
        val crit =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 500.0))) },
                clock,
            ).compute()
        assertThat(warn.status).isEqualTo(HealthCardStatus.WARN)
        assertThat(crit.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN when prometheus returns empty`() {
        val card =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(emptyList()) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("no_data")
    }

    @Test
    fun `status UNKNOWN when prometheus throws`() {
        val card =
            KafkaLagHealthCardProvider(
                FakePrometheus { throw PrometheusQueryException("boom") },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("prometheus_unreachable")
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.KafkaLagHealthCardProviderTest"`
Expected: FAIL.

- [ ] **Step 7: Implement `KafkaLagHealthCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class KafkaLagHealthCardProvider(
    private val prometheusQueryPort: PrometheusQueryPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "kafka_consumer_lag"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val maxLag =
            try {
                val result = prometheusQueryPort.query(PROMQL)
                result.values.maxOfOrNull { it.value }
            } catch (ex: PrometheusQueryException) {
                return failure(now, reason = "prometheus_unreachable")
            }
        if (maxLag == null) {
            return failure(now, reason = "no_data")
        }
        val status =
            when {
                maxLag >= CRIT_THRESHOLD -> HealthCardStatus.CRIT
                maxLag >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "Kafka consumer lag",
            status = status,
            metric = HealthCardMetric(value = maxLag, unit = "records", label = "max across partitions"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = null,
            reason = null,
        )
    }

    private fun failure(now: java.time.Instant, reason: String) =
        HealthCard(
            id = cardId,
            title = "Kafka consumer lag",
            status = HealthCardStatus.UNKNOWN,
            metric = null,
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = null,
            reason = reason,
        )

    private companion object {
        private const val WARN_THRESHOLD = 50.0
        private const val CRIT_THRESHOLD = 500.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
        private const val PROMQL =
            "max by (topic) (kafka_consumer_records_lag{consumer_group=\"readmates-aigen-worker\"})"
    }
}
```

- [ ] **Step 8: Run the test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.KafkaLagHealthCardProviderTest"`
Expected: PASS.

- [ ] **Step 9: Write failing test for `AiProviderAvailabilityCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class AiProviderAvailabilityCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakePrometheus(private val behaviour: () -> PromQueryResult) : PrometheusQueryPort {
        override fun query(promql: String): PromQueryResult = behaviour()
    }

    @Test
    fun `status OK when minimum provider success ratio is at least warn threshold`() {
        val card =
            AiProviderAvailabilityCardProvider(
                FakePrometheus {
                    PromQueryResult(
                        listOf(
                            PromInstantValue(mapOf("provider" to "CLAUDE"), 1.0),
                            PromInstantValue(mapOf("provider" to "OPENAI"), 0.995),
                        ),
                    )
                },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.995)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/ai-ops"))
    }

    @Test
    fun `status WARN at warn threshold and CRIT at crit threshold`() {
        val warn =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(mapOf("provider" to "OPENAI"), 0.98))) },
                clock,
            ).compute()
        val crit =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(mapOf("provider" to "OPENAI"), 0.90))) },
                clock,
            ).compute()
        assertThat(warn.status).isEqualTo(HealthCardStatus.WARN)
        assertThat(crit.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN when no provider data`() {
        val card =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { PromQueryResult(emptyList()) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("no_data")
    }

    @Test
    fun `status UNKNOWN when prometheus throws`() {
        val card =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { throw PrometheusQueryException("boom") },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("prometheus_unreachable")
    }
}
```

- [ ] **Step 10: Run test, expect failure**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.AiProviderAvailabilityCardProviderTest"`
Expected: FAIL.

- [ ] **Step 11: Implement `AiProviderAvailabilityCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

@Component
class AiProviderAvailabilityCardProvider(
    private val prometheusQueryPort: PrometheusQueryPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "ai_provider_availability"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val minRatio =
            try {
                val result = prometheusQueryPort.query(PROMQL)
                result.values.minOfOrNull { it.value }
            } catch (ex: PrometheusQueryException) {
                return failure(now, "prometheus_unreachable")
            }
        if (minRatio == null) {
            return failure(now, "no_data")
        }
        val status =
            when {
                minRatio < CRIT_THRESHOLD -> HealthCardStatus.CRIT
                minRatio < WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "AI provider 가용성",
            status = status,
            metric = HealthCardMetric(value = minRatio, unit = "ratio", label = "min over providers (5m)"),
            thresholds = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD),
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = DRILL,
            reason = null,
        )
    }

    private fun failure(now: Instant, reason: String) =
        HealthCard(
            id = cardId,
            title = "AI provider 가용성",
            status = HealthCardStatus.UNKNOWN,
            metric = null,
            thresholds = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD),
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = DRILL,
            reason = reason,
        )

    private companion object {
        private const val WARN_THRESHOLD = 0.99
        private const val CRIT_THRESHOLD = 0.95
        private val DRILL = HealthCardDrill.AdminRoute("/admin/ai-ops")
        private const val PROMQL =
            "sum by (provider) (rate(readmates_aigen_jobs_completed_total{status=\"SUCCEEDED\"}[5m])) / " +
                "clamp_min(sum by (provider) (rate(readmates_aigen_jobs_completed_total[5m])), 1)"
    }
}
```

- [ ] **Step 12: Run test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.AiProviderAvailabilityCardProviderTest"`
Expected: PASS.

- [ ] **Step 13: Write failing test for `NotificationDispatchSuccessCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class NotificationDispatchSuccessCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakePrometheus(private val behaviour: () -> PromQueryResult) : PrometheusQueryPort {
        override fun query(promql: String): PromQueryResult = behaviour()
    }

    @Test
    fun `status OK at high ratio with admin notifications drill`() {
        val card =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 0.999))) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.999)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/notifications"))
    }

    @Test
    fun `status WARN below warn threshold and CRIT below crit threshold`() {
        val warn =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 0.98))) },
                clock,
            ).compute()
        val crit =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 0.80))) },
                clock,
            ).compute()
        assertThat(warn.status).isEqualTo(HealthCardStatus.WARN)
        assertThat(crit.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN on empty result or prometheus error`() {
        val empty =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(emptyList()) },
                clock,
            ).compute()
        val error =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { throw PrometheusQueryException("boom") },
                clock,
            ).compute()
        assertThat(empty.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(empty.reason).isEqualTo("no_data")
        assertThat(error.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(error.reason).isEqualTo("prometheus_unreachable")
    }
}
```

- [ ] **Step 14: Run test, expect failure**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.NotificationDispatchSuccessCardProviderTest"`
Expected: FAIL.

- [ ] **Step 15: Implement `NotificationDispatchSuccessCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

@Component
class NotificationDispatchSuccessCardProvider(
    private val prometheusQueryPort: PrometheusQueryPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "notification_dispatch_success"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val ratio =
            try {
                prometheusQueryPort.query(PROMQL).values.firstOrNull()?.value
            } catch (ex: PrometheusQueryException) {
                return failure(now, "prometheus_unreachable")
            }
        if (ratio == null) {
            return failure(now, "no_data")
        }
        val status =
            when {
                ratio < CRIT_THRESHOLD -> HealthCardStatus.CRIT
                ratio < WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "알림 발송 성공률",
            status = status,
            metric = HealthCardMetric(value = ratio, unit = "ratio", label = "5m"),
            thresholds = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD),
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = DRILL,
            reason = null,
        )
    }

    private fun failure(now: Instant, reason: String) =
        HealthCard(
            id = cardId,
            title = "알림 발송 성공률",
            status = HealthCardStatus.UNKNOWN,
            metric = null,
            thresholds = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD),
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = DRILL,
            reason = reason,
        )

    private companion object {
        private const val WARN_THRESHOLD = 0.99
        private const val CRIT_THRESHOLD = 0.95
        private val DRILL = HealthCardDrill.AdminRoute("/admin/notifications")
        private const val PROMQL =
            "sum(rate(readmates_outbox_publish_total{result=\"success\"}[5m])) / " +
                "clamp_min(sum(rate(readmates_outbox_publish_total[5m])), 1)"
    }
}
```

- [ ] **Step 16: Run test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.NotificationDispatchSuccessCardProviderTest"`
Expected: PASS.

- [ ] **Step 17: Create `PlatformAdminHealthConfig.kt` — bean wiring**

Create `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`:

```kotlin
package com.readmates.admin.health.config

import com.readmates.admin.health.adapter.out.prometheus.HttpPrometheusQueryAdapter
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient
import java.time.Clock
import java.time.Duration

@Configuration
class PlatformAdminHealthConfig {
    @Bean
    fun platformAdminHealthClock(): Clock = Clock.systemUTC()

    @Bean
    fun prometheusQueryPort(
        @Value("\${readmates.admin.health.prometheus.base-url:http://prometheus:9090}") baseUrl: String,
        @Value("\${readmates.admin.health.prometheus.timeout-ms:5000}") timeoutMs: Long,
    ): PrometheusQueryPort {
        val restClient = RestClient.builder().baseUrl(ensureTrailingSlash(baseUrl)).build()
        return HttpPrometheusQueryAdapter(restClient, Duration.ofMillis(timeoutMs))
    }

    private fun ensureTrailingSlash(s: String): String = if (s.endsWith("/")) s else "$s/"
}
```

- [ ] **Step 18: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/health/{adapter/out/prometheus,application/service/providers/Kafka,application/service/providers/AiProvider,application/service/providers/NotificationDispatch,config} \
        server/src/test/kotlin/com/readmates/admin/health/{adapter/out/prometheus,application/service/providers/Kafka,application/service/providers/AiProvider,application/service/providers/NotificationDispatch}
git commit -m "platform-admin: add Prometheus query adapter and three Prometheus-backed providers"
```

(Adjust the `git add` paths to actual files you created — globbing above is descriptive.)

---

### Task 4: Deploy ledger port + adapter + strip provider

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapterTest.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProvider.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProviderTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt` — add `@Bean DeployLedgerPort` using the `JsonlDeployLedgerAdapter` with path from `READMATES_DEPLOY_LEDGER` env / config property.

- [ ] **Step 1: Write failing test for `JsonlDeployLedgerAdapter`**

Create `server/src/test/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapterTest.kt`:

```kotlin
package com.readmates.admin.health.adapter.out.persistence

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class JsonlDeployLedgerAdapterTest {
    private val mapper = ObjectMapper()

    @Test
    fun `groups events into attempts and returns latest first`(@TempDir tmp: Path) {
        val ledger = tmp.resolve("deploy-attempts.jsonl")
        Files.writeString(
            ledger,
            listOf(
                """{"ts":"2026-05-26T10:00:00Z","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v1","attemptId":"a","durationSeconds":0}""",
                """{"ts":"2026-05-26T10:00:30Z","stage":"post-deploy-watch","event":"WATCH_OK","status":"SUCCEEDED","detail":"","attemptId":"a","durationSeconds":30}""",
                """{"ts":"2026-05-26T11:00:00Z","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v2","attemptId":"b","durationSeconds":0}""",
                """{"ts":"2026-05-26T11:00:20Z","stage":"post-deploy-watch","event":"WATCH_FAILED","status":"FAILED","detail":"","attemptId":"b","durationSeconds":20}""",
            ).joinToString("\n"),
        )

        val attempts = JsonlDeployLedgerAdapter({ ledger }, mapper).tailLatestAttempts(5)

        assertThat(attempts).hasSize(2)
        assertThat(attempts[0].attemptId).isEqualTo("b")
        assertThat(attempts[0].finalStatus).isEqualTo(DeployAttemptFinalStatus.FAILED)
        assertThat(attempts[0].imageTag).isEqualTo("v2")
        assertThat(attempts[1].attemptId).isEqualTo("a")
        assertThat(attempts[1].finalStatus).isEqualTo(DeployAttemptFinalStatus.SUCCEEDED)
        assertThat(attempts[1].imageTag).isEqualTo("v1")
    }

    @Test
    fun `returns empty list when file missing`(@TempDir tmp: Path) {
        val absent = tmp.resolve("does-not-exist.jsonl")
        assertThat(JsonlDeployLedgerAdapter({ absent }, mapper).tailLatestAttempts(5)).isEmpty()
    }

    @Test
    fun `final status is RUNNING when no terminal event seen`(@TempDir tmp: Path) {
        val ledger = tmp.resolve("ledger.jsonl")
        Files.writeString(
            ledger,
            """{"ts":"2026-05-26T12:00:00Z","stage":"05-deploy-compose-stack.sh","event":"STARTED","status":"RUNNING","detail":"image=v3","attemptId":"c","durationSeconds":0}""",
        )
        val attempts = JsonlDeployLedgerAdapter({ ledger }, mapper).tailLatestAttempts(5)
        assertThat(attempts).hasSize(1)
        assertThat(attempts[0].finalStatus).isEqualTo(DeployAttemptFinalStatus.RUNNING)
    }
}
```

- [ ] **Step 2: Run test, expect failure**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.adapter.out.persistence.JsonlDeployLedgerAdapterTest"`
Expected: FAIL.

- [ ] **Step 3: Implement `JsonlDeployLedgerAdapter`**

Create `server/src/main/kotlin/com/readmates/admin/health/adapter/out/persistence/JsonlDeployLedgerAdapter.kt`:

```kotlin
package com.readmates.admin.health.adapter.out.persistence

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

class JsonlDeployLedgerAdapter(
    private val ledgerPathSupplier: () -> Path,
    private val objectMapper: ObjectMapper,
) : DeployLedgerPort {
    override fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry> {
        val path = ledgerPathSupplier()
        if (!Files.exists(path)) return emptyList()

        val grouped = LinkedHashMap<String, MutableList<JsonNode>>()
        Files.newBufferedReader(path).use { reader ->
            reader.lineSequence()
                .mapNotNull { line ->
                    if (line.isBlank()) return@mapNotNull null
                    runCatching { objectMapper.readTree(line) }.getOrNull()
                }
                .forEach { event ->
                    val attemptId = event.path("attemptId").asText().ifBlank { return@forEach }
                    grouped.getOrPut(attemptId) { mutableListOf() }.add(event)
                }
        }

        val entries =
            grouped.map { (attemptId, events) ->
                val sorted = events.sortedBy { it.path("ts").asText() }
                val firstStarted = sorted.firstOrNull { it.path("event").asText() == "STARTED" } ?: sorted.first()
                val terminal = sorted.lastOrNull { it.path("status").asText() in TERMINAL_STATUSES }
                val finalStatus =
                    when (terminal?.path("status")?.asText()) {
                        "SUCCEEDED" -> DeployAttemptFinalStatus.SUCCEEDED
                        "FAILED" -> DeployAttemptFinalStatus.FAILED
                        else -> DeployAttemptFinalStatus.RUNNING
                    }
                val startedAt = Instant.parse(firstStarted.path("ts").asText())
                val endedAt = terminal?.path("ts")?.asText()?.let(Instant::parse)
                val duration = terminal?.path("durationSeconds")?.takeIf { it.isNumber }?.asLong()
                val imageTag = extractImageTag(firstStarted.path("detail").asText())
                DeployAttemptStripEntry(
                    attemptId = attemptId,
                    startedAt = startedAt,
                    endedAt = endedAt,
                    finalStatus = finalStatus,
                    imageTag = imageTag,
                    durationSeconds = duration,
                )
            }
        return entries.sortedByDescending { it.startedAt }.take(limit)
    }

    private fun extractImageTag(detail: String): String? {
        val prefix = "image="
        return detail
            .split(' ')
            .firstOrNull { it.startsWith(prefix) }
            ?.removePrefix(prefix)
            ?.takeIf { it.isNotBlank() }
    }

    private companion object {
        private val TERMINAL_STATUSES = setOf("SUCCEEDED", "FAILED")
    }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.adapter.out.persistence.JsonlDeployLedgerAdapterTest"`
Expected: PASS (3 cases).

- [ ] **Step 5: Wire `DeployLedgerPort` bean in `PlatformAdminHealthConfig.kt`**

Edit `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt` — add inside the existing `@Configuration class PlatformAdminHealthConfig`:

```kotlin
    @Bean
    fun deployLedgerPort(
        @Value("\${readmates.admin.health.deploy-ledger-path:/var/log/readmates/deploy-attempts.jsonl}") ledgerPath: String,
        objectMapper: com.fasterxml.jackson.databind.ObjectMapper,
    ): com.readmates.admin.health.application.port.out.DeployLedgerPort =
        com.readmates.admin.health.adapter.out.persistence.JsonlDeployLedgerAdapter(
            ledgerPathSupplier = { java.nio.file.Paths.get(ledgerPath) },
            objectMapper = objectMapper,
        )
```

(Use fully qualified names inline or add the appropriate imports.)

- [ ] **Step 6: Write failing test for `DeployAttemptsStripCardProvider`**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProviderTest.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class DeployAttemptsStripCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakeLedger(private val behaviour: () -> List<DeployAttemptStripEntry>) : DeployLedgerPort {
        override fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry> = behaviour()
    }

    @Test
    fun `populates deploy strip with up to 5 attempts and status OK when latest succeeded`() {
        val entry =
            DeployAttemptStripEntry(
                attemptId = "a",
                startedAt = Instant.parse("2026-05-26T10:00:00Z"),
                endedAt = Instant.parse("2026-05-26T10:01:00Z"),
                finalStatus = DeployAttemptFinalStatus.SUCCEEDED,
                imageTag = "v1",
                durationSeconds = 60,
            )
        val card = DeployAttemptsStripCardProvider(FakeLedger { listOf(entry) }, clock).compute()
        assertThat(card.id).isEqualTo("deploy_attempts_strip")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.deployStrip).containsExactly(entry)
    }

    @Test
    fun `status CRIT when latest attempt failed`() {
        val entry =
            DeployAttemptStripEntry(
                attemptId = "a",
                startedAt = Instant.parse("2026-05-26T10:00:00Z"),
                endedAt = Instant.parse("2026-05-26T10:01:00Z"),
                finalStatus = DeployAttemptFinalStatus.FAILED,
                imageTag = "v1",
                durationSeconds = 60,
            )
        val card = DeployAttemptsStripCardProvider(FakeLedger { listOf(entry) }, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN when ledger empty`() {
        val card = DeployAttemptsStripCardProvider(FakeLedger { emptyList() }, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("ledger_unavailable")
    }
}
```

- [ ] **Step 7: Run test, expect failure**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.DeployAttemptsStripCardProviderTest"`
Expected: FAIL.

- [ ] **Step 8: Implement `DeployAttemptsStripCardProvider`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProvider.kt`:

```kotlin
package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class DeployAttemptsStripCardProvider(
    private val deployLedgerPort: DeployLedgerPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "deploy_attempts_strip"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val attempts = deployLedgerPort.tailLatestAttempts(STRIP_LIMIT)
        if (attempts.isEmpty()) {
            return HealthCard(
                id = cardId,
                title = "최근 deploy",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = null,
                lastCheckedAt = now,
                source = HealthCardSource.FILE,
                drill = null,
                reason = "ledger_unavailable",
                deployStrip = null,
            )
        }
        val status =
            when (attempts.first().finalStatus) {
                DeployAttemptFinalStatus.FAILED -> HealthCardStatus.CRIT
                DeployAttemptFinalStatus.RUNNING -> HealthCardStatus.WARN
                DeployAttemptFinalStatus.SUCCEEDED -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "최근 deploy",
            status = status,
            metric = null,
            thresholds = null,
            lastCheckedAt = now,
            source = HealthCardSource.FILE,
            drill = null,
            reason = null,
            deployStrip = attempts,
        )
    }

    private companion object {
        private const val STRIP_LIMIT = 5
    }
}
```

- [ ] **Step 9: Run test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.providers.DeployAttemptsStripCardProviderTest"`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/health/adapter/out/persistence \
        server/src/test/kotlin/com/readmates/admin/health/adapter/out/persistence \
        server/src/main/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProvider.kt \
        server/src/test/kotlin/com/readmates/admin/health/application/service/providers/DeployAttemptsStripCardProviderTest.kt \
        server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt
git commit -m "platform-admin: add deploy ledger tail adapter and deploy strip card"
```

---

### Task 5: `PlatformAdminHealthService` — composer + cache + scheduler

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt`

- [ ] **Step 1: Write failing test**

Create `server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt`:

```kotlin
package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class PlatformAdminHealthServiceTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class StubProvider(
        override val cardId: String,
        private val behaviour: () -> HealthCard,
    ) : HealthCardProvider {
        override fun compute(): HealthCard = behaviour()
    }

    private fun okCard(id: String) =
        HealthCard(
            id = id,
            title = id,
            status = HealthCardStatus.OK,
            metric = null,
            thresholds = null,
            lastCheckedAt = Instant.parse("2026-05-26T00:00:00Z"),
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )

    @Test
    fun `refresh combines all providers and stores snapshot`() {
        val service =
            PlatformAdminHealthService(
                providers = listOf(StubProvider("a") { okCard("a") }, StubProvider("b") { okCard("b") }),
                clock = clock,
            )
        service.refresh()
        val snapshot = service.snapshot()
        assertThat(snapshot.schema).isEqualTo(PlatformHealthSnapshot.SCHEMA)
        assertThat(snapshot.generatedAt).isEqualTo(Instant.parse("2026-05-26T00:00:00Z"))
        assertThat(snapshot.cards.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `failing provider produces UNKNOWN card with provider_threw reason while others succeed`() {
        val service =
            PlatformAdminHealthService(
                providers =
                    listOf(
                        StubProvider("a") { throw IllegalStateException("boom") },
                        StubProvider("b") { okCard("b") },
                    ),
                clock = clock,
            )
        service.refresh()
        val snapshot = service.snapshot()
        val a = snapshot.cards.first { it.id == "a" }
        assertThat(a.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(a.reason).isEqualTo("provider_threw")
        val b = snapshot.cards.first { it.id == "b" }
        assertThat(b.status).isEqualTo(HealthCardStatus.OK)
    }

    @Test
    fun `first snapshot call triggers lazy refresh when scheduler has not run`() {
        val service =
            PlatformAdminHealthService(
                providers = listOf(StubProvider("a") { okCard("a") }),
                clock = clock,
            )
        // do NOT call refresh — snapshot() should still return a result
        val snapshot = service.snapshot()
        assertThat(snapshot.cards.map { it.id }).containsExactly("a")
    }
}
```

- [ ] **Step 2: Run test, expect failure**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.PlatformAdminHealthServiceTest"`
Expected: FAIL.

- [ ] **Step 3: Implement `PlatformAdminHealthService`**

Create `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`:

```kotlin
package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.concurrent.atomic.AtomicReference

@Service
class PlatformAdminHealthService(
    private val providers: List<HealthCardProvider>,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val cache = AtomicReference<PlatformHealthSnapshot?>(null)

    @Scheduled(fixedRateString = "\${readmates.admin.health.refresh-interval-ms:10000}")
    fun refresh() {
        val now = clock.instant()
        val cards =
            providers.map { provider ->
                try {
                    provider.compute()
                } catch (ex: RuntimeException) {
                    log.warn("health card {} provider threw", provider.cardId, ex)
                    HealthCard(
                        id = provider.cardId,
                        title = provider.cardId,
                        status = HealthCardStatus.UNKNOWN,
                        metric = null,
                        thresholds = null,
                        lastCheckedAt = now,
                        source = HealthCardSource.IN_PROCESS,
                        drill = null,
                        reason = "provider_threw",
                    )
                }
            }
        cache.set(PlatformHealthSnapshot(PlatformHealthSnapshot.SCHEMA, now, cards))
    }

    fun snapshot(): PlatformHealthSnapshot {
        cache.get()?.let { return it }
        refresh()
        return cache.get()!!
    }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.PlatformAdminHealthServiceTest"`
Expected: PASS.

- [ ] **Step 5: Enable `@Scheduled` if not already**

Check `server/src/main/kotlin/com/readmates/Application.kt` (or equivalent) for `@EnableScheduling`. If absent, add it. Likely present (notification relay polling exists). Confirm with:

```
grep -rn "@EnableScheduling" server/src/main/kotlin | head -3
```

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt \
        server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt
git commit -m "platform-admin: compose health card providers into snapshot with 10s scheduled refresh"
```

---

### Task 6: Web controller + permission gate + JSON response shape

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt`

- [ ] **Step 1: Write failing test for the controller**

Create `server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt`:

```kotlin
package com.readmates.admin.health.adapter.`in`.web

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import com.readmates.admin.health.application.service.PlatformAdminHealthService
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.util.UUID

class PlatformAdminHealthControllerTest {
    private val mapper = ObjectMapper()

    private class StubHealthService(private val payload: PlatformHealthSnapshot) :
        PlatformAdminHealthService(providers = emptyList(), clock = Clock.systemUTC()) {
        override fun snapshot(): PlatformHealthSnapshot = payload
    }

    private fun snapshot(): PlatformHealthSnapshot =
        PlatformHealthSnapshot(
            schema = PlatformHealthSnapshot.SCHEMA,
            generatedAt = Instant.parse("2026-05-26T00:00:00Z"),
            cards =
                listOf(
                    HealthCard(
                        id = "outbox_backlog",
                        title = "Outbox backlog",
                        status = HealthCardStatus.OK,
                        metric = null,
                        thresholds = null,
                        lastCheckedAt = Instant.parse("2026-05-26T00:00:00Z"),
                        source = HealthCardSource.IN_PROCESS,
                        drill = HealthCardDrill.AdminRoute("/admin/notifications"),
                        reason = null,
                    ),
                ),
        )

    @Test
    fun `snapshot endpoint returns serialized snapshot for OPERATOR`() {
        val controller = PlatformAdminHealthController(StubHealthService(snapshot()))

        val response =
            controller.snapshot(
                CurrentPlatformAdmin(userId = UUID.randomUUID(), email = "ops@example.com", role = PlatformAdminRole.OPERATOR),
            )

        val json = mapper.writeValueAsString(response)
        val node = mapper.readTree(json)
        assertThat(node.get("schema").asText()).isEqualTo("platform.health_snapshot.v1")
        assertThat(node.get("generated_at").asText()).isEqualTo("2026-05-26T00:00:00Z")
        assertThat(node.get("cards").get(0).get("id").asText()).isEqualTo("outbox_backlog")
        assertThat(node.get("cards").get(0).get("drill").get("kind").asText()).isEqualTo("admin_route")
        assertThat(node.get("cards").get(0).get("drill").get("target").asText()).isEqualTo("/admin/notifications")
    }
}
```

- [ ] **Step 2: Run test, expect failure**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.adapter.in.web.PlatformAdminHealthControllerTest"`
Expected: FAIL.

- [ ] **Step 3: Implement `PlatformAdminHealthController`**

Create `server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt`:

```kotlin
package com.readmates.admin.health.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonProperty
import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import com.readmates.admin.health.application.service.PlatformAdminHealthService
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/api/admin/health")
class PlatformAdminHealthController(
    private val service: PlatformAdminHealthService,
) {
    @GetMapping("/snapshot")
    fun snapshot(@Suppress("UNUSED_PARAMETER") admin: CurrentPlatformAdmin): PlatformHealthSnapshotResponse =
        PlatformHealthSnapshotResponse.from(service.snapshot())
}

data class PlatformHealthSnapshotResponse(
    val schema: String,
    @JsonProperty("generated_at") val generatedAt: Instant,
    val cards: List<HealthCardResponse>,
) {
    companion object {
        fun from(snapshot: PlatformHealthSnapshot): PlatformHealthSnapshotResponse =
            PlatformHealthSnapshotResponse(
                schema = snapshot.schema,
                generatedAt = snapshot.generatedAt,
                cards = snapshot.cards.map(HealthCardResponse.Companion::from),
            )
    }
}

data class HealthCardResponse(
    val id: String,
    val title: String,
    val status: HealthCardStatus,
    val metric: HealthCardMetricResponse?,
    val thresholds: HealthCardThresholdsResponse?,
    @JsonProperty("last_checked_at") val lastCheckedAt: Instant,
    val source: HealthCardSource,
    val drill: HealthCardDrillResponse?,
    val reason: String?,
    @JsonProperty("deploy_strip") val deployStrip: List<DeployAttemptStripEntryResponse>?,
) {
    companion object {
        fun from(card: HealthCard): HealthCardResponse =
            HealthCardResponse(
                id = card.id,
                title = card.title,
                status = card.status,
                metric = card.metric?.let(HealthCardMetricResponse::from),
                thresholds = card.thresholds?.let(HealthCardThresholdsResponse::from),
                lastCheckedAt = card.lastCheckedAt,
                source = card.source,
                drill = card.drill?.let(HealthCardDrillResponse::from),
                reason = card.reason,
                deployStrip = card.deployStrip?.map(DeployAttemptStripEntryResponse::from),
            )
    }
}

data class HealthCardMetricResponse(val value: Double?, val unit: String, val label: String?) {
    companion object {
        fun from(metric: HealthCardMetric) = HealthCardMetricResponse(metric.value, metric.unit, metric.label)
    }
}

data class HealthCardThresholdsResponse(val warn: Double?, val crit: Double?) {
    companion object {
        fun from(t: HealthCardThresholds) = HealthCardThresholdsResponse(t.warn, t.crit)
    }
}

data class HealthCardDrillResponse(val kind: String, val target: String) {
    companion object {
        fun from(drill: HealthCardDrill): HealthCardDrillResponse =
            when (drill) {
                is HealthCardDrill.AdminRoute -> HealthCardDrillResponse(kind = "admin_route", target = drill.target)
            }
    }
}

data class DeployAttemptStripEntryResponse(
    @JsonProperty("attempt_id") val attemptId: String,
    @JsonProperty("started_at") val startedAt: Instant,
    @JsonProperty("ended_at") val endedAt: Instant?,
    @JsonProperty("final_status") val finalStatus: DeployAttemptFinalStatus,
    @JsonProperty("image_tag") val imageTag: String?,
    @JsonProperty("duration_seconds") val durationSeconds: Long?,
) {
    companion object {
        fun from(e: DeployAttemptStripEntry) =
            DeployAttemptStripEntryResponse(
                attemptId = e.attemptId,
                startedAt = e.startedAt,
                endedAt = e.endedAt,
                finalStatus = e.finalStatus,
                imageTag = e.imageTag,
                durationSeconds = e.durationSeconds,
            )
    }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `./server/gradlew -p server unitTest --tests "com.readmates.admin.health.adapter.in.web.PlatformAdminHealthControllerTest"`
Expected: PASS.

- [ ] **Step 5: Confirm SecurityConfig already gates `/api/admin/**`**

```
grep -n '/api/admin' server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt
```

Expected: a match showing that `/api/admin/**` requires authenticated platform admin. If not, the controller is still protected by the `CurrentPlatformAdmin` resolver throwing on unauthenticated callers (existing pattern). No new auth rule needed for S2.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt \
        server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt
git commit -m "platform-admin: expose health snapshot endpoint at /api/admin/health/snapshot"
```

---

### Task 7: Architecture test baseline (admin package)

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Run the architecture test as-is**

Run: `./server/gradlew -p server architectureTest`
- If it PASSES with the new `com.readmates.admin` package → skip to Step 4 (nothing to do).
- If it FAILS with a message about an unknown package or missing slice → continue with Step 2.

- [ ] **Step 2: Inspect the rule list in `ServerArchitectureBoundaryTest.kt`**

Find the place where the known top-level packages are enumerated (e.g., a list of `"com.readmates.club"`, `"com.readmates.auth"`, …). Add `"com.readmates.admin"` in alphabetical position.

- [ ] **Step 3: Re-run architecture test**

Run: `./server/gradlew -p server architectureTest`
Expected: PASS.

- [ ] **Step 4: Commit**

If you modified the test:

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "architecture: recognise com.readmates.admin top-level package"
```

If unchanged (Step 1 already passed), skip this commit.

---

### Task 8: Frontend API contracts + fetch + query factory

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-health-contracts.ts`
- Create: `front/features/platform-admin/api/platform-admin-health-api.ts`
- Create: `front/features/platform-admin/queries/platform-admin-health-queries.ts`
- Create: `front/features/platform-admin/api/platform-admin-health-contracts.test.ts` (only if there's type-shape logic worth asserting; otherwise skip)

- [ ] **Step 1: Create contracts**

Create `front/features/platform-admin/api/platform-admin-health-contracts.ts`:

```ts
export type HealthCardStatus = "OK" | "WARN" | "CRIT" | "UNKNOWN";
export type HealthCardSource = "IN_PROCESS" | "PROMETHEUS" | "FILE";
export type DeployAttemptFinalStatus = "SUCCEEDED" | "FAILED" | "RUNNING";

export type HealthCardMetric = {
  value: number | null;
  unit: string;
  label: string | null;
};

export type HealthCardThresholds = {
  warn: number | null;
  crit: number | null;
};

export type HealthCardDrill = {
  kind: "admin_route";
  target: string;
};

export type DeployAttemptStripEntry = {
  attempt_id: string;
  started_at: string;
  ended_at: string | null;
  final_status: DeployAttemptFinalStatus;
  image_tag: string | null;
  duration_seconds: number | null;
};

export type HealthCard = {
  id: string;
  title: string;
  status: HealthCardStatus;
  metric: HealthCardMetric | null;
  thresholds: HealthCardThresholds | null;
  last_checked_at: string;
  source: HealthCardSource;
  drill: HealthCardDrill | null;
  reason: string | null;
  deploy_strip: DeployAttemptStripEntry[] | null;
};

export type PlatformHealthSnapshotResponse = {
  schema: "platform.health_snapshot.v1";
  generated_at: string;
  cards: HealthCard[];
};
```

- [ ] **Step 2: Create the fetcher**

Create `front/features/platform-admin/api/platform-admin-health-api.ts`:

```ts
import { readmatesFetch } from "@/shared/api/client";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";

export function fetchPlatformAdminHealthSnapshot() {
  return readmatesFetch<PlatformHealthSnapshotResponse>(
    "/api/admin/health/snapshot",
    undefined,
    { clubSlug: undefined },
  );
}
```

- [ ] **Step 3: Create the query factory**

Create `front/features/platform-admin/queries/platform-admin-health-queries.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { fetchPlatformAdminHealthSnapshot } from "@/features/platform-admin/api/platform-admin-health-api";
import { platformAdminKeys } from "@/features/platform-admin/queries/platform-admin-queries";

const REFRESH_INTERVAL_MS = 15_000;
const STALE_TIME_MS = 5_000;

export function platformAdminHealthSnapshotQuery() {
  return queryOptions({
    queryKey: [...platformAdminKeys.all, "health-snapshot"] as const,
    queryFn: fetchPlatformAdminHealthSnapshot,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
  });
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --dir front tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/api/platform-admin-health-contracts.ts \
        front/features/platform-admin/api/platform-admin-health-api.ts \
        front/features/platform-admin/queries/platform-admin-health-queries.ts
git commit -m "platform-admin: add health snapshot API contract, fetcher, and query factory"
```

---

### Task 9: Frontend route + loader + UI grid/card components

**Files:**
- Create: `front/features/platform-admin/route/admin-health-data.ts`
- Create: `front/features/platform-admin/route/admin-health-route.tsx`
- Create: `front/features/platform-admin/route/admin-health-route.test.tsx`
- Create: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Create: `front/features/platform-admin/ui/admin-health-card.tsx`
- Create: `front/features/platform-admin/ui/admin-health-card.test.tsx`
- Create: `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`

- [ ] **Step 1: Loader factory**

Create `front/features/platform-admin/route/admin-health-data.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";

export function adminHealthLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminHealth() {
    await queryClient.fetchQuery(platformAdminHealthSnapshotQuery());
    return null;
  };
}
```

- [ ] **Step 2: Card UI test (failing first)**

Create `front/features/platform-admin/ui/admin-health-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { HealthCard } from "@/features/platform-admin/api/platform-admin-health-contracts";
import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";

function card(overrides: Partial<HealthCard> = {}): HealthCard {
  return {
    id: "outbox_backlog",
    title: "Outbox backlog",
    status: "OK",
    metric: { value: 42, unit: "rows", label: "pending" },
    thresholds: { warn: 100, crit: 1000 },
    last_checked_at: "2026-05-26T00:00:00Z",
    source: "IN_PROCESS",
    drill: { kind: "admin_route", target: "/admin/notifications" },
    reason: null,
    deploy_strip: null,
    ...overrides,
  };
}

describe("AdminHealthCard", () => {
  it("renders title, metric value, and drill link when status OK", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Outbox backlog")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /자세히/ })).toHaveAttribute("href", "/admin/notifications");
  });

  it("renders reason when status is UNKNOWN and metric is null", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card({ status: "UNKNOWN", metric: null, reason: "prometheus_unreachable" })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/prometheus_unreachable/)).toBeInTheDocument();
  });

  it("does not render drill link when drill is null", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card({ drill: null })} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /자세히/ })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front test -- --run features/platform-admin/ui/admin-health-card.test.tsx`
Expected: FAIL (component missing).

- [ ] **Step 4: Implement `AdminHealthCard`**

Create `front/features/platform-admin/ui/admin-health-card.tsx`:

```tsx
import { Link } from "react-router-dom";
import type { HealthCard } from "@/features/platform-admin/api/platform-admin-health-contracts";

const STATUS_LABEL: Record<HealthCard["status"], string> = {
  OK: "정상",
  WARN: "주의",
  CRIT: "위험",
  UNKNOWN: "확인 불가",
};

const STATUS_PILL_CLASS: Record<HealthCard["status"], string> = {
  OK: "admin-health-card__pill admin-health-card__pill--ok",
  WARN: "admin-health-card__pill admin-health-card__pill--warn",
  CRIT: "admin-health-card__pill admin-health-card__pill--crit",
  UNKNOWN: "admin-health-card__pill admin-health-card__pill--unknown",
};

export function AdminHealthCard({ card }: { card: HealthCard }) {
  return (
    <article className="admin-health-card" aria-labelledby={`health-${card.id}`}>
      <header className="admin-health-card__header">
        <h3 id={`health-${card.id}`}>{card.title}</h3>
        <span className={STATUS_PILL_CLASS[card.status]}>{STATUS_LABEL[card.status]}</span>
      </header>
      <div className="admin-health-card__body">
        {card.metric ? (
          <p className="admin-health-card__metric">
            <span className="admin-health-card__metric-value">{formatValue(card.metric.value, card.metric.unit)}</span>
            {card.metric.label ? (
              <span className="admin-health-card__metric-label">{card.metric.label}</span>
            ) : null}
          </p>
        ) : null}
        {card.thresholds ? (
          <p className="admin-health-card__thresholds">
            경고 ≥ {card.thresholds.warn ?? "—"} · 위험 ≥ {card.thresholds.crit ?? "—"}
          </p>
        ) : null}
        {card.reason ? <p className="admin-health-card__reason">{card.reason}</p> : null}
      </div>
      <footer className="admin-health-card__footer">
        <time dateTime={card.last_checked_at} className="admin-health-card__time">
          최근 확인 {relativeFromNow(card.last_checked_at)}
        </time>
        {card.drill ? (
          <Link to={card.drill.target} className="admin-health-card__drill">
            자세히 →
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (unit === "ratio") return `${(value * 100).toFixed(2)}%`;
  return `${value.toLocaleString()} ${unit}`;
}

function relativeFromNow(iso: string): string {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분 전`;
  return `${Math.round(seconds / 3600)}시간 전`;
}
```

- [ ] **Step 5: Run the card test, expect pass**

Run: `pnpm --dir front test -- --run features/platform-admin/ui/admin-health-card.test.tsx`
Expected: PASS.

- [ ] **Step 6: Implement `AdminHealthDeployStrip`**

Create `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`:

```tsx
import type { DeployAttemptStripEntry } from "@/features/platform-admin/api/platform-admin-health-contracts";

const STATUS_LABEL: Record<DeployAttemptStripEntry["final_status"], string> = {
  SUCCEEDED: "성공",
  FAILED: "실패",
  RUNNING: "진행 중",
};

const STATUS_DOT_CLASS: Record<DeployAttemptStripEntry["final_status"], string> = {
  SUCCEEDED: "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--ok",
  FAILED: "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--crit",
  RUNNING: "admin-health-deploy-strip__dot admin-health-deploy-strip__dot--running",
};

export function AdminHealthDeployStrip({ entries }: { entries: DeployAttemptStripEntry[] }) {
  if (entries.length === 0) {
    return <p className="admin-health-deploy-strip__empty">아직 기록된 배포가 없습니다.</p>;
  }
  return (
    <ol className="admin-health-deploy-strip">
      {entries.map((entry) => (
        <li key={entry.attempt_id} className="admin-health-deploy-strip__item">
          <span className={STATUS_DOT_CLASS[entry.final_status]} aria-hidden />
          <div className="admin-health-deploy-strip__detail">
            <p className="admin-health-deploy-strip__title">
              {entry.image_tag ?? "image-unknown"} · {STATUS_LABEL[entry.final_status]}
            </p>
            <time dateTime={entry.started_at} className="admin-health-deploy-strip__time">
              {new Date(entry.started_at).toLocaleString()}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 7: Implement `AdminHealthGrid`**

Create `front/features/platform-admin/ui/admin-health-grid.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";

export function AdminHealthGrid() {
  const query = useQuery(platformAdminHealthSnapshotQuery());
  if (query.isLoading) return <p className="admin-health-grid__loading">로딩 중…</p>;
  if (query.isError || !query.data) {
    return <p className="admin-health-grid__error">스냅샷을 불러오지 못했습니다.</p>;
  }
  const stripCard = query.data.cards.find((c) => c.id === "deploy_attempts_strip");
  const rest = query.data.cards.filter((c) => c.id !== "deploy_attempts_strip");
  return (
    <div className="admin-health-grid">
      <div className="admin-health-grid__cards">
        {rest.map((card) => (
          <AdminHealthCard key={card.id} card={card} />
        ))}
      </div>
      {stripCard ? (
        <section className="admin-health-grid__strip" aria-label="최근 deploy">
          <header className="admin-health-grid__strip-header">
            <h2>최근 deploy</h2>
            {stripCard.reason ? <p>{stripCard.reason}</p> : null}
          </header>
          {stripCard.deploy_strip ? <AdminHealthDeployStrip entries={stripCard.deploy_strip} /> : null}
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8: Implement the route component**

Create `front/features/platform-admin/route/admin-health-route.tsx`:

```tsx
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";

export function AdminHealthRoute() {
  return (
    <section className="admin-health" aria-labelledby="admin-health-title">
      <header className="admin-health__header">
        <h1 id="admin-health-title" className="h1 editorial">Platform Health</h1>
        <p className="admin-health__lede">서비스·큐·AI 가용성·outbox·배포 신호를 한 화면에서 봅니다.</p>
      </header>
      <AdminHealthGrid />
    </section>
  );
}
```

- [ ] **Step 9: Route test**

Create `front/features/platform-admin/route/admin-health-route.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import * as api from "@/features/platform-admin/api/platform-admin-health-api";
import { AdminHealthRoute } from "@/features/platform-admin/route/admin-health-route";

describe("AdminHealthRoute", () => {
  it("renders fetched cards", async () => {
    const fetchSpy = vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockResolvedValueOnce({
      schema: "platform.health_snapshot.v1",
      generated_at: "2026-05-26T00:00:00Z",
      cards: [
        {
          id: "outbox_backlog",
          title: "Outbox backlog",
          status: "OK",
          metric: { value: 42, unit: "rows", label: "pending" },
          thresholds: { warn: 100, crit: 1000 },
          last_checked_at: "2026-05-26T00:00:00Z",
          source: "IN_PROCESS",
          drill: { kind: "admin_route", target: "/admin/notifications" },
          reason: null,
          deploy_strip: null,
        },
      ],
    });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminHealthRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Outbox backlog")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run all new frontend tests**

Run: `pnpm --dir front test -- --run features/platform-admin/ui/admin-health-card.test.tsx features/platform-admin/route/admin-health-route.test.tsx`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add front/features/platform-admin/route/admin-health-data.ts \
        front/features/platform-admin/route/admin-health-route.tsx \
        front/features/platform-admin/route/admin-health-route.test.tsx \
        front/features/platform-admin/ui/admin-health-grid.tsx \
        front/features/platform-admin/ui/admin-health-card.tsx \
        front/features/platform-admin/ui/admin-health-card.test.tsx \
        front/features/platform-admin/ui/admin-health-deploy-strip.tsx
git commit -m "platform-admin: add /admin/health grid, card, and deploy strip components"
```

---

### Task 10: Toggle route catalog + wire ready route in app router

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts` — `health` entry: status `coming_soon` → `ready`, drop `comingSoon` block.
- Modify: `front/features/platform-admin/model/admin-route-catalog.test.ts` — if the test asserts coming-soon shape for `health`, adjust to expect ready.
- Modify: `front/src/app/routes/admin.tsx` — add `health` arm in `readyChild` switch.

- [ ] **Step 1: Flip route catalog entry**

Edit `front/features/platform-admin/model/admin-route-catalog.ts` — locate the `path: "health"` entry and replace the whole object with:

```ts
  {
    path: "health",
    label: "헬스",
    group: "today",
    groupLabel: "오늘/헬스",
    slice: "S2",
    status: "ready",
    requiredCapability: "view_health",
  },
```

- [ ] **Step 2: Update catalog test if needed**

Run: `pnpm --dir front test -- --run features/platform-admin/model/admin-route-catalog.test.ts`
- If PASS → continue.
- If FAIL on a `health` expectation → update the expected status (e.g., assertion that `health.status === "coming_soon"` becomes `"ready"`, and the assertion that some specific coming-soon copy exists is removed).

- [ ] **Step 3: Add `health` arm in router**

Edit `front/src/app/routes/admin.tsx` — inside `readyChild`'s `switch (route.path)`, add right before the `default` case:

```ts
    case "health":
      return {
        path: "health",
        hydrateFallbackElement: adminChildHydrateFallback,
        lazy: async () => {
          const [{ AdminHealthRoute }, { adminHealthLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-health-route"),
            import("@/features/platform-admin/route/admin-health-data"),
          ]);
          return { Component: AdminHealthRoute, loader: adminHealthLoaderFactory(queryClient) };
        },
      };
```

- [ ] **Step 4: Run admin shell tests**

Run: `pnpm --dir front test -- --run features/platform-admin`
Expected: PASS (admin-shell-layout test should not break, admin-route-catalog updated to expect health=ready).

- [ ] **Step 5: Type-check + lint**

Run: `pnpm --dir front tsc --noEmit && pnpm --dir front lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/model/admin-route-catalog.ts \
        front/features/platform-admin/model/admin-route-catalog.test.ts \
        front/src/app/routes/admin.tsx
git commit -m "platform-admin: flip /admin/health to ready and wire AdminHealthRoute"
```

---

### Task 11: Playwright E2E happy path

**Files:**
- Create: `front/tests/e2e/admin-health.spec.ts`

- [ ] **Step 1: Inspect existing admin E2E for the login + nav pattern**

Run: `ls front/tests/e2e/ 2>/dev/null && grep -l '/admin/' front/tests/e2e/*.ts 2>/dev/null`
- Pick the existing admin E2E spec (e.g., `admin-ai-ops.spec.ts` or `admin-today.spec.ts`) and use its login helper + page fixture as the template.

- [ ] **Step 2: Write the spec**

Create `front/tests/e2e/admin-health.spec.ts`. Use the existing helpers in the file you read in Step 1 (e.g., `loginAsPlatformAdmin`, `mockPlatformAdminSummary`). The spec body should:

1. Mock `GET /api/admin/health/snapshot` with a deterministic 3-card response (one OK, one WARN, one UNKNOWN).
2. Login as a platform admin via the existing helper.
3. Navigate to `/admin/health`.
4. Assert that:
   - Page heading "Platform Health" is visible.
   - Each card title from the mock is visible.
   - Drill link "자세히 →" of the OK card targets `/admin/notifications`.
   - UNKNOWN card reason text is visible.

A skeleton (refine to match the existing helpers):

```ts
import { expect, test } from "@playwright/test";
import { loginAsPlatformAdmin, mockPlatformAdminSummary } from "./fixtures/platform-admin";

test("operator views /admin/health grid", async ({ page }) => {
  await mockPlatformAdminSummary(page);
  await page.route("**/api/admin/health/snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "platform.health_snapshot.v1",
        generated_at: "2026-05-26T00:00:00Z",
        cards: [
          {
            id: "outbox_backlog", title: "Outbox backlog", status: "OK",
            metric: { value: 42, unit: "rows", label: "pending" },
            thresholds: { warn: 100, crit: 1000 },
            last_checked_at: "2026-05-26T00:00:00Z",
            source: "IN_PROCESS",
            drill: { kind: "admin_route", target: "/admin/notifications" },
            reason: null, deploy_strip: null,
          },
          {
            id: "kafka_consumer_lag", title: "Kafka consumer lag", status: "WARN",
            metric: { value: 75, unit: "records", label: "max across partitions" },
            thresholds: { warn: 50, crit: 500 },
            last_checked_at: "2026-05-26T00:00:00Z",
            source: "PROMETHEUS",
            drill: null, reason: null, deploy_strip: null,
          },
          {
            id: "redis", title: "Redis", status: "UNKNOWN",
            metric: null, thresholds: { warn: 1, crit: 50 },
            last_checked_at: "2026-05-26T00:00:00Z",
            source: "IN_PROCESS",
            drill: null, reason: "redis_metrics_unavailable", deploy_strip: null,
          },
        ],
      }),
    });
  });

  await loginAsPlatformAdmin(page);
  await page.goto("/admin/health");

  await expect(page.getByRole("heading", { name: "Platform Health" })).toBeVisible();
  await expect(page.getByText("Outbox backlog")).toBeVisible();
  await expect(page.getByText("Kafka consumer lag")).toBeVisible();
  await expect(page.getByText("Redis")).toBeVisible();
  await expect(page.getByText("redis_metrics_unavailable")).toBeVisible();
  await expect(
    page.locator("article", { hasText: "Outbox backlog" }).getByRole("link", { name: /자세히/ }),
  ).toHaveAttribute("href", "/admin/notifications");
});
```

If the existing E2E helpers in `front/tests/e2e/fixtures/` use slightly different names, use whatever the existing admin spec uses.

- [ ] **Step 3: Run the spec**

Run: `pnpm --dir front test:e2e -- admin-health`
Expected: PASS. If it fails due to a missing fixture, copy the exact pattern from the existing admin E2E (do not invent helpers).

- [ ] **Step 4: Commit**

```bash
git add front/tests/e2e/admin-health.spec.ts
git commit -m "platform-admin: add Playwright happy path for /admin/health grid"
```

---

### Task 12: Docs + CHANGELOG + final verification

**Files:**
- Modify: `CHANGELOG.md` — append to `## Unreleased` → `### Engineering`.
- Modify: `docs/operations/observability/README.md` — one bullet linking to `/admin/health`.

- [ ] **Step 1: Append CHANGELOG entry**

Edit `CHANGELOG.md` — under the existing `## Unreleased` → `### Engineering` block, append:

```markdown
- **platform-admin:** introduce health snapshot route covering service, queue, AI, outbox, deploy signals.
  `/admin/health` flips from COMING-SOON to READY with a 7-card grid backed by `/api/admin/health/snapshot`.
  In-process Micrometer for DB pool, Redis, outbox backlog, and the deploy attempt tail; local Prometheus
  HTTP for Kafka consumer lag, AI provider availability (`readmates_aigen_jobs_completed_total`), and
  notification dispatch success ratio. 10-second `@Scheduled` refresh into an `AtomicReference` cache;
  per-card failures stay isolated (one provider down → that card only is `status=unknown`).
```

- [ ] **Step 2: Append observability README bullet**

Edit `docs/operations/observability/README.md` — add near the top, under the existing "운영 진입점" (or 시작점) section:

```markdown
- 운영자 진입점: `/admin/health` — DB / Redis / Kafka / AI provider / outbox / 알림 발송 성공률 / 최근 deploy attempt 7개 카드를 한 화면에서 봅니다 (S2).
```

- [ ] **Step 3: Run the smallest-relevant-checks set**

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
./server/gradlew -p server detekt ktlintMainSourceSetCheck ktlintTestSourceSetCheck
pnpm --dir front test
pnpm --dir front lint
pnpm --dir front build
./scripts/pre-push-check.sh
```

Expected: every command exits 0. If any fail, fix the underlying issue and rerun.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/operations/observability/README.md
git commit -m "docs: changelog and observability README entry for /admin/health (S2)"
```

- [ ] **Step 5: Push to origin/main when the user authorizes**

```bash
git push origin main
```

(Do not push without explicit user authorization. The S1 + observability foundation slices were pushed; this slice should follow the same flow.)

---

## Out of scope (deferred to later slices)

- Grafana drill links (slice H). The card model has a `drill: HealthCardDrill` sealed interface that can grow a `External(url)` variant when slice H ships.
- SSE / WebSocket live dashboard. Card freshness comes from the 15s frontend refetch + 10s server scheduler.
- Alert rule files for the new card-only thresholds (Kafka lag, AI provider). A follow-up slice should add `kafka-rules.yml` and a `AiProviderSuccessRateLow` alert rule using the same thresholds defined in this slice.
- Card customization per role, threshold editing UI, historic sparklines — all out.
- Removing the duplicate placeholder gauge in `AiGenerationJobConsumer.kt` was already resolved as part of the observability foundation merge (commit `36008a9a`).
