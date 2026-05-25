# Observability Foundation (Slice O) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Prometheus + Alertmanager onto the existing observability assets, reconcile `slos.yaml` ↔ `slos.md`, add the notification delivery latency histogram, and replace the AI gen queue depth placeholder with a Redis-job-state-backed gauge.

**Architecture:** Two new containers (`prometheus`, `alertmanager`) in `deploy/oci/compose.infra.yml` scrape Spring actuator over the docker network. Alertmanager routes to a single SMTP receiver with severity-aware `group_wait`/`repeat_interval`. All secrets come from env. `slos.yaml` becomes SSOT enforced by a docs↔catalog consistency test. Two new metrics (`readmates.notifications.delivery.latency` Timer; real `readmates.aigen.queue.depth` gauge) close the spec's "implemented but placeholder" gap.

**Tech Stack:** Spring Boot 3 (Kotlin), Micrometer, Prometheus v2.55.0, Alertmanager v0.27.0, Docker Compose, Jackson YAML, JUnit 5, AssertJ, MockK.

**Spec:** `docs/superpowers/specs/2026-05-25-readmates-observability-foundation-design.md`

---

## File Structure

**Create:**

- `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogDocsConsistencyTest.kt` — enforces yaml↔docs SLO id consistency.
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt` — `@PostConstruct` binds real queue depth supplier.
- `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinderTest.kt`
- `deploy/oci/prometheus/prometheus.yml` — scrape + rule_files config.
- `deploy/oci/alertmanager/alertmanager.yml` — env-templated single SMTP receiver.
- `ops/prometheus/alerts/notification-rules.yml` — migrated from `docs/operations/observability/alerts.md`.
- `ops/prometheus/alerts/http-rules.yml`
- `ops/prometheus/alerts/jvm-rules.yml`
- `ops/prometheus/alerts/security-rules.yml`
- `ops/prometheus/alerts/redis-rules.yml`
- `ops/prometheus/alerts/targets-rules.yml` — new dead-target alert.
- `scripts/validate-prometheus-rules.sh` — promtool check rules wrapper.
- `scripts/validate-prometheus-config.sh` — promtool check config wrapper.
- `scripts/validate-alertmanager-config.sh` — amtool check-config wrapper.
- `docs/operations/runbooks/observability-bootstrap.md` — first-time bring-up.
- `docs/operations/runbooks/slo-monthly-report.md` — monthly snapshot procedure.

**Modify:**

- `server/src/main/resources/slo/slos.yaml` — expand to 6 SLOs.
- `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt` — add `createdAt: OffsetDateTime` to `NotificationEventOutboxItem`.
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt` — include `created_at` in SELECT + mapping.
- `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt` — add `recordDeliveryLatency` Timer.
- `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt` — call `recordDeliveryLatency` after successful `markPublished`.
- `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogLoaderTest.kt` — adjust to 6 SLOs.
- `server/src/test/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetricsTest.kt` — add latency timer assertions.
- `deploy/oci/compose.infra.yml` — add prometheus + alertmanager services + named volumes.
- `docs/operations/observability/slos.md` — sync IDs with yaml; add `notification_delivery_latency_p95`; change "미측정" → "측정 중".
- `docs/operations/observability/alerts.md` — annotate rules as file-backed.
- `docs/operations/observability/README.md` — link new runbooks.
- `docs/operations/README.md` + `docs/operations/runbooks/README.md` — add bootstrap + monthly report links.
- `docs/deploy/security-public-repo.md` — append "Observability secrets" section.
- `scripts/public-release-check.sh` — scan new dirs for real emails/SMTP hosts.
- `scripts/pre-push-check.sh` — opt-in `--full` runs the 3 validate-* scripts.
- `CHANGELOG.md` — Unreleased Engineering entry.

---

### Task 1: SLO catalog reconciliation + docs consistency test

**Files:**
- Create: `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogDocsConsistencyTest.kt`
- Modify: `server/src/main/resources/slo/slos.yaml`
- Modify: `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogLoaderTest.kt`
- Modify: `docs/operations/observability/slos.md`

- [ ] **Step 1: Write failing consistency test**

Create `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogDocsConsistencyTest.kt`:

```kotlin
package com.readmates.shared.observability.slo

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertTrue
import java.nio.file.Files
import java.nio.file.Paths

class SloCatalogDocsConsistencyTest {
    @Test
    fun `every SLO id in slos_yaml appears in slos_md`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        val slosMd = Files
            .readString(Paths.get("../docs/operations/observability/slos.md"))
        val missing = catalog.slos.map { it.id }.filterNot { id -> slosMd.contains(id) }
        assertTrue(missing.isEmpty()) {
            "slos.md is missing references for ids: $missing. " +
                "Update docs/operations/observability/slos.md to include every id from slos.yaml."
        }
    }

    @Test
    fun `slos_md does not reference unknown ids`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        val slosMd = Files
            .readString(Paths.get("../docs/operations/observability/slos.md"))
        val knownIds = catalog.slos.map { it.id }.toSet()
        val pattern = Regex("`([a-z][a-z0-9_]+)`")
        val mentionedSloIds = pattern.findAll(slosMd)
            .map { it.groupValues[1] }
            .filter { it.contains("_") && it.length >= 8 }
            .toSet()
        val unknown = mentionedSloIds.filter { it.endsWith("_ratio") || it.endsWith("_p95") || it == "api_availability" }
            .filterNot { it in knownIds }
        assertTrue(unknown.isEmpty()) {
            "slos.md references unknown SLO ids: $unknown. " +
                "Either add them to slos.yaml or remove from slos.md."
        }
    }
}
```

- [ ] **Step 2: Verify it fails**

Run: `./server/gradlew -p server test --tests "com.readmates.shared.observability.slo.SloCatalogDocsConsistencyTest"`

Expected: FAIL — current `slos.md` uses IDs like "SLO-1" / "SLO-2" / "SLO-3" while `slos.yaml` uses `notification_dispatch_success_ratio` etc. Mismatch.

- [ ] **Step 3: Expand `slos.yaml` to 6 SLOs**

Replace `server/src/main/resources/slo/slos.yaml` with:

```yaml
# SSOT for SLO definitions. Docs at docs/operations/observability/slos.md
# is a human-readable view; consistency enforced by SloCatalogDocsConsistencyTest.
version: 1
slos:
  - id: api_availability
    description: /api/** 5xx ratio (30d rolling)
    objective: 0.99
    window: 30d
    sli:
      type: prometheus
      query_good: sum(rate(http_server_requests_seconds_count{uri=~"/api/.*", status!~"5.."}[5m]))
      query_total: sum(rate(http_server_requests_seconds_count{uri=~"/api/.*"}[5m]))

  - id: api_read_latency_p95
    description: GET /api/** p95 latency (30d rolling)
    objective_ms: 500
    window: 30d
    sli:
      type: prometheus
      query_latency_p95: histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{uri=~"/api/.*", method="GET"}[5m]))) * 1000

  - id: bff_api_p95
    description: BFF→Spring p95 latency (custom timer)
    objective_ms: 800
    window: 7d
    sli:
      type: prometheus
      query_latency_p95: histogram_quantile(0.95, sum(rate(readmates_bff_api_latency_seconds_bucket[5m])) by (le)) * 1000

  - id: login_success_ratio
    description: Google OAuth login success ratio
    objective: 0.99
    window: 7d
    sli:
      type: prometheus
      query_good: sum(rate(readmates_login_total{result="success"}[5m]))
      query_total: sum(rate(readmates_login_total[5m]))

  - id: notification_dispatch_success_ratio
    description: Outbox publish success ratio (DEAD excluded)
    objective: 0.99
    window: 7d
    sli:
      type: prometheus
      query_good: sum(rate(readmates_outbox_publish_total{result="success"}[5m]))
      query_total: sum(rate(readmates_outbox_publish_total[5m]))

  - id: notification_delivery_latency_p95
    description: notification_event_outbox row create → PUBLISHED p95 (30d rolling)
    objective_ms: 300000
    window: 30d
    sli:
      type: prometheus
      query_latency_p95: histogram_quantile(0.95, sum by (le) (rate(readmates_notifications_delivery_latency_seconds_bucket[5m]))) * 1000
```

- [ ] **Step 4: Update `SloCatalogLoaderTest` to expect 6 SLOs**

Edit `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogLoaderTest.kt`:

Replace the first test with:

```kotlin
    @Test
    fun `loads valid catalog with six SLOs`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        assertEquals(1, catalog.version)
        assertEquals(6, catalog.slos.size)
        val ids = catalog.slos.map { it.id }.toSet()
        assertEquals(
            setOf(
                "api_availability",
                "api_read_latency_p95",
                "bff_api_p95",
                "login_success_ratio",
                "notification_dispatch_success_ratio",
                "notification_delivery_latency_p95",
            ),
            ids,
        )
    }
```

- [ ] **Step 5: Update `slos.md` to reference yaml IDs**

Edit `docs/operations/observability/slos.md` — rewrite each SLO section heading to include the yaml id and remove SLO-1/2/3 numbering. For each of the 6 IDs add a section with id in backticks. Mark each "현재" as "측정 중 (Prometheus 스크래퍼 배포 완료, 첫 측정은 `docs/operations/slo-reports/2026-06.md` 참조)" — placeholder ok, will be filled after rollout.

Specifically, the 3 new SLOs (`api_availability`, `api_read_latency_p95`, `notification_delivery_latency_p95`) get full sections including PromQL identical to slos.yaml's `sli` queries. `bff_api_p95`, `login_success_ratio`, `notification_dispatch_success_ratio` get sections derived from existing yaml entries.

Each section follows the existing 6-bullet format (정의 / 측정 / 에러 예산 / 위반 시 행동 / 근거 / 현재).

- [ ] **Step 6: Run the SLO tests, expect pass**

Run: `./server/gradlew -p server test --tests "com.readmates.shared.observability.slo.*"`

Expected: PASS (both `SloCatalogLoaderTest` and `SloCatalogDocsConsistencyTest`).

- [ ] **Step 7: Commit**

```bash
git add server/src/main/resources/slo/slos.yaml \
        server/src/test/kotlin/com/readmates/shared/observability/slo/ \
        docs/operations/observability/slos.md
git commit -m "observability: reconcile SLO catalog as SSOT with docs consistency test"
```

---

### Task 2: Add `createdAt` to `NotificationEventOutboxItem` + adapter mapping

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt:94-108`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt:135-200, 349+`

- [ ] **Step 1: Add `createdAt` field**

Edit `NotificationModels.kt` — change `NotificationEventOutboxItem`:

```kotlin
data class NotificationEventOutboxItem(
    val id: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val payload: NotificationEventPayload,
    val status: NotificationEventOutboxStatus,
    val kafkaTopic: String,
    val kafkaKey: String,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val requestId: String? = null,
)
```

- [ ] **Step 2: Update `claimPublishable` SELECT to include `created_at`**

In `JdbcNotificationEventOutboxAdapter.kt:135-200` (the `claimPublishable` SQL), ensure the SELECT column list includes `created_at`. (It likely already does for the row mapper; verify the SQL has it.)

- [ ] **Step 3: Update `toNotificationEventOutboxItem` row mapper**

In `JdbcNotificationEventOutboxAdapter.kt:349+`, the existing `ResultSet.toNotificationEventOutboxItem()` must now pass `createdAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC)` (use the existing pattern from `lockedAt` mapping in the same function).

- [ ] **Step 4: Run notification adapter tests**

Run: `./server/gradlew -p server test --tests "*JdbcNotificationEventOutboxAdapter*"`

Expected: PASS. If fixture builders construct `NotificationEventOutboxItem` directly with named args, add `createdAt = OffsetDateTime.now()` (any non-null instant) to all such constructions. The compiler will fail-fast at each call site.

- [ ] **Step 5: Run the full notification suite**

Run: `./server/gradlew -p server test --tests "com.readmates.notification.*"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/ \
        server/src/test/kotlin/com/readmates/notification/
git commit -m "notification: thread createdAt through outbox item for latency telemetry"
```

---

### Task 3: Add `readmates.notifications.delivery.latency` Timer + record at PUBLISHED transition

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt:48-55`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetricsTest.kt`

- [ ] **Step 1: Write failing test for delivery latency Timer**

Add to `ReadmatesOperationalMetricsTest.kt`:

```kotlin
    @Test
    fun `recordDeliveryLatency emits histogram bucket for event_type`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry, cachedBacklogProvider = null)

        metrics.recordDeliveryLatency(
            NotificationEventType.NEXT_BOOK_PUBLISHED,
            Duration.ofSeconds(42),
        )

        val timer = registry.find("readmates.notifications.delivery.latency")
            .tag("event_type", "NEXT_BOOK_PUBLISHED")
            .timer()
        assertNotNull(timer)
        assertEquals(1, timer!!.count())
        assertEquals(42.0, timer.totalTime(TimeUnit.SECONDS), 0.001)
    }
```

Add the imports if not already present: `io.micrometer.core.instrument.simple.SimpleMeterRegistry`, `java.time.Duration`, `java.util.concurrent.TimeUnit`, `org.junit.jupiter.api.Assertions.assertNotNull`.

- [ ] **Step 2: Verify it fails**

Run: `./server/gradlew -p server test --tests "*ReadmatesOperationalMetricsTest*"`

Expected: FAIL — `recordDeliveryLatency` is unresolved.

- [ ] **Step 3: Implement `recordDeliveryLatency`**

Add to `ReadmatesOperationalMetrics.kt`:

```kotlin
    /**
     * Records `readmates.notifications.delivery.latency` — time between
     * notification_event_outbox row creation and the PUBLISHED transition.
     *
     * **Metric tag policy:** only enum / low-cardinality values are permitted as tag values.
     * Never add high-cardinality identifiers such as `club_id`, `user_id`, `membership_id`,
     * `recipient_email`, `event_id`, `delivery_id`, or `session_id` as tags. For row-level
     * audit queries use the `notification_event_outbox` table instead.
     */
    fun recordDeliveryLatency(
        eventType: NotificationEventType,
        latency: java.time.Duration,
    ) {
        io.micrometer.core.instrument.Timer
            .builder("readmates.notifications.delivery.latency")
            .description("notification_event_outbox row create -> PUBLISHED transition latency")
            .tag("event_type", eventType.name)
            .publishPercentileHistogram(true)
            .serviceLevelObjectives(
                java.time.Duration.ofSeconds(10),
                java.time.Duration.ofSeconds(30),
                java.time.Duration.ofMinutes(1),
                java.time.Duration.ofMinutes(5),
                java.time.Duration.ofMinutes(15),
            )
            .register(meterRegistry)
            .record(latency)
    }
```

(Move imports to the top of the file rather than inline if your style guide requires; this inline form is given to make the diff self-contained.)

- [ ] **Step 4: Wire the call in `NotificationRelayService`**

Edit `NotificationRelayService.kt`. Constructor: add `private val operationalMetrics: ReadmatesOperationalMetrics`. Update the `publish` body where `markPublished` returns successfully:

```kotlin
    private fun publish(item: NotificationEventOutboxItem) {
        try {
            notificationEventPublisherPort.publish(message, item.kafkaTopic, item.kafkaKey, item.requestId)
            val publishedAt = java.time.Instant.now() // captured pre-UPDATE as a proxy for SQL `published_at`
            val publishedOk = notificationEventOutboxPort.markPublished(item.id, item.lockedAt)
            if (publishedOk) {
                operationalMetrics.recordDeliveryLatency(
                    item.eventType,
                    java.time.Duration.between(item.createdAt.toInstant(), publishedAt),
                )
            }
            logger.info(
                "Notification event published eventId={} topic={} key={}",
                item.id,
                item.kafkaTopic,
                item.kafkaKey,
            )
        } catch (exception: Exception) {
            // existing exception handling unchanged
            ...
        }
    }
```

Keep the existing exception branch byte-for-byte; only the success branch gains the latency record. The reason for guarding on `publishedOk` is that `markPublished` returns false when another worker won the CAS — we must not record latency for that lost race.

- [ ] **Step 5: Update `NotificationRelayService` constructor callers / tests**

The Spring `@Service` autowire picks up the new dep. Test fixtures that construct `NotificationRelayService` directly need `operationalMetrics = ReadmatesOperationalMetrics(SimpleMeterRegistry())` added. Compile to find each site.

- [ ] **Step 6: Run notification + metrics tests**

Run: `./server/gradlew -p server test --tests "com.readmates.notification.*" --tests "*ReadmatesOperationalMetricsTest*"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/ \
        server/src/test/kotlin/com/readmates/notification/
git commit -m "observability: record notification delivery latency histogram at PUBLISHED transition"
```

---

### Task 4: Wire `readmates.aigen.queue.depth` gauge to Redis job state

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinderTest.kt`

- [ ] **Step 1: Write failing test**

Create `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinderTest.kt`:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AiGenerationQueueDepthGaugeBinderTest {
    @Test
    fun `gauge reflects PENDING plus RUNNING job count from job store`() {
        val registry = SimpleMeterRegistry()
        val metrics = AiGenerationMetrics(registry)
        val store = mockk<AiGenerationJobStore>()
        every { store.loadActiveJobs(any()) } returns listOf(
            fakeJob(JobStatus.PENDING),
            fakeJob(JobStatus.PENDING),
            fakeJob(JobStatus.RUNNING),
            fakeJob(JobStatus.SUCCEEDED),
        )

        AiGenerationQueueDepthGaugeBinder(metrics, store).bind()

        val gauge = registry.find("readmates.aigen.queue.depth").gauge()
        assertEquals(3.0, gauge!!.value())
    }

    private fun fakeJob(status: JobStatus): JobRecord = mockk<JobRecord>(relaxed = true).also {
        every { it.status } returns status
    }
}
```

- [ ] **Step 2: Verify it fails**

Run: `./server/gradlew -p server test --tests "*AiGenerationQueueDepthGaugeBinderTest*"`

Expected: FAIL — class does not exist.

- [ ] **Step 3: Implement the binder**

Create `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt`:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import jakarta.annotation.PostConstruct
import org.springframework.stereotype.Component

/**
 * Binds the `readmates.aigen.queue.depth` gauge to a live supplier backed by
 * `AiGenerationJobStore.loadActiveJobs()`. The gauge reports the count of jobs
 * whose status is PENDING or RUNNING — i.e. the AI generation pipeline backlog
 * the operator cares about for `AiGenQueueLagHigh`.
 *
 * The supplier is invoked each time Prometheus scrapes (~30s). `loadActiveJobs`
 * caps at 200 to keep the call O(1) on cardinality; if the real backlog ever
 * exceeds 200 the gauge under-reports — the alert threshold (50) fires far
 * earlier so this is safe in practice.
 */
@Component
class AiGenerationQueueDepthGaugeBinder(
    private val metrics: AiGenerationMetrics,
    private val jobStore: AiGenerationJobStore,
) {
    @PostConstruct
    fun bind() {
        metrics.registerQueueDepthGauge {
            jobStore
                .loadActiveJobs(QUEUE_DEPTH_PROBE_LIMIT)
                .count { it.status == JobStatus.PENDING || it.status == JobStatus.RUNNING }
        }
    }

    companion object {
        private const val QUEUE_DEPTH_PROBE_LIMIT = 200
    }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `./server/gradlew -p server test --tests "*AiGenerationQueueDepthGaugeBinderTest*"`

Expected: PASS.

- [ ] **Step 5: Run the full aigen suite**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.*"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt \
        server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinderTest.kt
git commit -m "observability: wire aigen queue depth gauge to Redis job state"
```

---

### Task 5: Migrate alert rules from `alerts.md` into `ops/prometheus/alerts/*.yml`

**Files:**
- Create: `ops/prometheus/alerts/notification-rules.yml`
- Create: `ops/prometheus/alerts/http-rules.yml`
- Create: `ops/prometheus/alerts/jvm-rules.yml`
- Create: `ops/prometheus/alerts/security-rules.yml`
- Create: `ops/prometheus/alerts/redis-rules.yml`
- Create: `ops/prometheus/alerts/targets-rules.yml`
- Create: `scripts/validate-prometheus-rules.sh`

- [ ] **Step 1: Create `ops/prometheus/alerts/notification-rules.yml`**

```yaml
# Notification pipeline alert rules. Mirrors docs/operations/observability/alerts.md
# §룰 readmates.notification group with critical severity escalation added.
groups:
  - name: readmates.notification
    interval: 30s
    rules:
      - alert: NotificationOutboxBacklogHigh
        expr: max(readmates_notifications_outbox_backlog{status="pending"}) > 100
        for: 10m
        labels:
          severity: warning
          component: notification
        annotations:
          summary: "Notification pending backlog over 100 for 10 minutes"
          description: "Consumer가 처리 속도를 따라가지 못하거나 죽었을 가능성. consumer 로그 확인."
          runbook_url: "https://github.com/${READMATES_REPO}/blob/main/docs/operations/runbooks/observability-bootstrap.md#notification-backlog"

      - alert: NotificationOutboxBacklogCritical
        expr: max(readmates_notifications_outbox_backlog{status="pending"}) > 1000
        for: 5m
        labels:
          severity: critical
          component: notification
        annotations:
          summary: "Notification pending backlog over 1000"
          description: "Consumer가 죽었거나 의존 인프라가 unreachable. 즉시 조사."

      - alert: NotificationFailRateHigh
        expr: |
          sum(rate(readmates_notifications_failed_total[5m]))
            / clamp_min(sum(rate(readmates_notifications_sent_total[5m]))
                       + sum(rate(readmates_notifications_failed_total[5m])), 1) > 0.05
        for: 10m
        labels:
          severity: warning
          component: notification
        annotations:
          summary: "Notification 실패율 5% 초과 (10분)"
          description: "발송 실패가 지속. 외부 채널 장애 또는 payload 변경 의심."

      - alert: NotificationDeadLetters
        expr: increase(readmates_notifications_dead_total[1h]) > 0
        for: 0m
        labels:
          severity: warning
          component: notification
        annotations:
          summary: "Notification dead-letter 발생 (1시간 내)"
          description: "발송이 최종 포기된 알림. notification_deliveries.status='DEAD' 로우 조사."
```

- [ ] **Step 2: Create `ops/prometheus/alerts/http-rules.yml`**

```yaml
groups:
  - name: readmates.http
    interval: 30s
    rules:
      - alert: HttpErrorRateHigh
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
            / clamp_min(sum(rate(http_server_requests_seconds_count[5m])), 1) > 0.01
        for: 5m
        labels:
          severity: critical
          component: http
        annotations:
          summary: "HTTP 5xx ratio over 1% for 5 minutes"
          description: "에러 폭증. 최근 배포 / 외부 의존 의심."

      - alert: HttpLatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum by (le, uri) (rate(http_server_requests_seconds_bucket{uri=~"/api/.*"}[5m])))
            > 0.5
        for: 10m
        labels:
          severity: warning
          component: http
        annotations:
          summary: "p95 latency over 500ms for 10 minutes"
          description: "DB slow query, GC pause, Hikari 부족 등 의심."
```

- [ ] **Step 3: Create `ops/prometheus/alerts/jvm-rules.yml`**

```yaml
groups:
  - name: readmates.jvm
    interval: 30s
    rules:
      - alert: HikariConnectionPoolPending
        expr: hikaricp_connections_pending > 0
        for: 2m
        labels:
          severity: warning
          component: jvm
        annotations:
          summary: "Hikari connection pool에 대기 요청 누적 (2분)"
          description: "Pool size 부족 또는 long-running query. slow query log 확인."

      - alert: JvmHeapHigh
        expr: |
          jvm_memory_used_bytes{area="heap"}
            / jvm_memory_max_bytes{area="heap"} > 0.85
        for: 10m
        labels:
          severity: warning
          component: jvm
        annotations:
          summary: "JVM heap 사용률 85% 초과 (10분)"
          description: "Memory leak 또는 GC 비효율. heap dump 검토 후보."
```

- [ ] **Step 4: Create `ops/prometheus/alerts/security-rules.yml`**

```yaml
groups:
  - name: readmates.security
    interval: 30s
    rules:
      - alert: RateLimitDenied
        expr: sum(rate(readmates_rate_limit_denied_total{sensitive="true"}[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
          component: security
        annotations:
          summary: "민감 엔드포인트 rate-limit 차단 발생 (5m 평균 > 0.1/s)"
          description: "지속적인 abuse 시도 가능. IP/계정 패턴 조사."
```

- [ ] **Step 5: Create `ops/prometheus/alerts/redis-rules.yml`**

```yaml
groups:
  - name: readmates.redis
    interval: 30s
    rules:
      - alert: RedisFallbacksHigh
        expr: sum(rate(readmates_redis_fallbacks_total[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
          component: redis
        annotations:
          summary: "Redis fallback 발생률 > 0.1/s (5분)"
          description: "Redis 불안정 또는 연결 문제. Redis 자체 로그 + 노드 상태 확인."

      - alert: RedisOperationErrors
        expr: sum(rate(readmates_redis_operation_errors_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
          component: redis
        annotations:
          summary: "Redis 명령 실행 오류율 > 0.05/s (5분)"
          description: "특정 어댑터/명령에서 오류 지속. 영향 범위 파악."
```

- [ ] **Step 6: Create `ops/prometheus/alerts/targets-rules.yml`**

```yaml
groups:
  - name: readmates.targets
    interval: 30s
    rules:
      - alert: ScrapeTargetDown
        expr: up == 0
        for: 5m
        labels:
          severity: critical
          component: observability
        annotations:
          summary: "Prometheus target {{ $labels.job }} down for 5m"
          description: "Scrape 실패 지속. compose ps + container logs 확인."
```

- [ ] **Step 7: Create `scripts/validate-prometheus-rules.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Validate every Prometheus rule file in ops/prometheus/alerts/.
# Uses docker so contributors don't need promtool installed locally.

cd "$(git rev-parse --show-toplevel)"

docker run --rm \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  prom/prometheus:v2.55.0 \
  promtool check rules /etc/prometheus/alerts/*.yml

echo "All Prometheus rule files OK"
```

Make it executable: `chmod +x scripts/validate-prometheus-rules.sh`.

- [ ] **Step 8: Run validation**

Run: `./scripts/validate-prometheus-rules.sh`

Expected: every file passes `promtool check rules`. Fix any syntax/format errors.

- [ ] **Step 9: Commit**

```bash
git add ops/prometheus/alerts/ scripts/validate-prometheus-rules.sh
git commit -m "observability: file-ize notification/http/jvm/security/redis/targets alert rules"
```

---

### Task 6: Prometheus config + validation script

**Files:**
- Create: `deploy/oci/prometheus/prometheus.yml`
- Create: `scripts/validate-prometheus-config.sh`

- [ ] **Step 1: Create `deploy/oci/prometheus/prometheus.yml`**

```yaml
# ReadMates Prometheus scrape + rule config.
# Target hostnames are docker network DNS names — no real OCI hostnames here.
global:
  scrape_interval: 30s
  scrape_timeout: 10s
  evaluation_interval: 30s
  external_labels:
    app: readmates

rule_files:
  - /etc/prometheus/alerts/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  - job_name: readmates-server
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["server:8081"]

  - job_name: prometheus-self
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: alertmanager
    static_configs:
      - targets: ["alertmanager:9093"]
```

- [ ] **Step 2: Create `scripts/validate-prometheus-config.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

docker run --rm \
  -v "$PWD/deploy/oci/prometheus:/etc/prometheus:ro" \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  prom/prometheus:v2.55.0 \
  promtool check config /etc/prometheus/prometheus.yml

echo "Prometheus config OK"
```

Make executable: `chmod +x scripts/validate-prometheus-config.sh`.

- [ ] **Step 3: Run validation**

Run: `./scripts/validate-prometheus-config.sh`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add deploy/oci/prometheus/ scripts/validate-prometheus-config.sh
git commit -m "observability: add Prometheus scrape config for OCI stack"
```

---

### Task 7: Alertmanager config + validation script

**Files:**
- Create: `deploy/oci/alertmanager/alertmanager.yml`
- Create: `scripts/validate-alertmanager-config.sh`

- [ ] **Step 1: Create `deploy/oci/alertmanager/alertmanager.yml`**

```yaml
# ReadMates Alertmanager — single SMTP receiver, severity-aware grouping.
# All identity/credential values come from env via `--config.file=` template substitution
# at container start. Real values never appear in git.
global:
  smtp_smarthost: '${READMATES_ALERT_SMTP_HOST}:${READMATES_ALERT_SMTP_PORT}'
  smtp_from: '${READMATES_ALERT_SMTP_FROM}'
  smtp_auth_username: '${READMATES_ALERT_SMTP_USER}'
  smtp_auth_password: '${READMATES_ALERT_SMTP_PASSWORD}'
  smtp_require_tls: true
  resolve_timeout: 5m

route:
  receiver: ops-email
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers:
        - severity = "critical"
      receiver: ops-email
      group_wait: 10s
      repeat_interval: 1h
    - matchers:
        - severity =~ "warn|warning"
      receiver: ops-email
      group_wait: 2m
      repeat_interval: 12h
    - matchers:
        - severity = "info"
      receiver: ops-email
      group_wait: 10m
      repeat_interval: 24h

receivers:
  - name: ops-email
    email_configs:
      - to: '${READMATES_ALERT_EMAIL_TO}'
        send_resolved: true
        headers:
          Subject: '[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .CommonLabels.alertname }} ({{ .CommonLabels.severity }})'

inhibit_rules:
  - source_matchers:
      - severity = "critical"
    target_matchers:
      - severity =~ "warn|warning"
    equal: ['alertname', 'component']
```

- [ ] **Step 2: Create `scripts/validate-alertmanager-config.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Substitute env placeholders with dummy values so amtool can lint structure
# without requiring real credentials.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed -e 's|\${READMATES_ALERT_SMTP_HOST}|smtp.example.com|g' \
    -e 's|\${READMATES_ALERT_SMTP_PORT}|587|g' \
    -e 's|\${READMATES_ALERT_SMTP_FROM}|alerts@example.com|g' \
    -e 's|\${READMATES_ALERT_SMTP_USER}|user|g' \
    -e 's|\${READMATES_ALERT_SMTP_PASSWORD}|pass|g' \
    -e 's|\${READMATES_ALERT_EMAIL_TO}|ops@example.com|g' \
    deploy/oci/alertmanager/alertmanager.yml > "$tmp"

docker run --rm -v "$tmp:/etc/alertmanager/alertmanager.yml:ro" \
  prom/alertmanager:v0.27.0 \
  amtool check-config /etc/alertmanager/alertmanager.yml

echo "Alertmanager config OK"
```

Make executable: `chmod +x scripts/validate-alertmanager-config.sh`.

- [ ] **Step 3: Run validation**

Run: `./scripts/validate-alertmanager-config.sh`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add deploy/oci/alertmanager/ scripts/validate-alertmanager-config.sh
git commit -m "observability: add Alertmanager config with SMTP receiver and severity routing"
```

---

### Task 8: Add prometheus + alertmanager services to `compose.infra.yml`

**Files:**
- Modify: `deploy/oci/compose.infra.yml`

- [ ] **Step 1: Append the two services**

Add at the end of `deploy/oci/compose.infra.yml`'s `services:` map:

```yaml
  prometheus:
    image: prom/prometheus:v2.55.0
    restart: unless-stopped
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=30d"
      - "--web.enable-lifecycle"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ../../ops/prometheus/alerts:/etc/prometheus/alerts:ro
      - readmates_prom_data:/prometheus
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:9090/-/ready >/dev/null"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s

  alertmanager:
    image: prom/alertmanager:v0.27.0
    restart: on-failure:3
    env_file:
      - ./alertmanager.env
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
      - "--storage.path=/alertmanager"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - readmates_alertmanager_data:/alertmanager
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:9093/-/ready >/dev/null"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 15s
```

Add to the bottom of `compose.infra.yml` (or extend existing volumes block):

```yaml
volumes:
  readmates_prom_data:
  readmates_alertmanager_data:
```

(If a `volumes:` top-level key already exists in the file, append the two named volumes inside it instead of creating a duplicate block.)

- [ ] **Step 2: Verify compose parses**

Run: `docker compose -f deploy/oci/compose.infra.yml config --quiet`

Expected: no output, exit 0. If `compose.infra.yml` depends on env vars not present locally, set `READMATES_ALERT_SMTP_HOST=smtp.example.com ... docker compose ...` with dummies just for the `config` validation.

- [ ] **Step 3: Commit**

```bash
git add deploy/oci/compose.infra.yml
git commit -m "observability: add prometheus and alertmanager services to OCI infra compose"
```

---

### Task 9: Public release safety scan + docs

**Files:**
- Modify: `scripts/public-release-check.sh`
- Modify: `docs/deploy/security-public-repo.md`

- [ ] **Step 1: Add scan rule to `public-release-check.sh`**

Open `scripts/public-release-check.sh` and locate the existing scan section. Add the following check (idiomatic shape — match the file's actual structure):

```bash
# Observability secrets / placeholders — fail if real email domains, SMTP hosts,
# or IP literals appear in deploy/oci/{prometheus,alertmanager}/ or
# ops/prometheus/alerts/.
observability_targets=(
  "deploy/oci/prometheus"
  "deploy/oci/alertmanager"
  "ops/prometheus/alerts"
)
for target in "${observability_targets[@]}"; do
  if [ -d "$target" ]; then
    # IPv4 literal scan
    if grep -REn '(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)' "$target" \
         | grep -vE '\b(127\.0\.0\.1|0\.0\.0\.0)\b' >/dev/null; then
      echo "FAIL: real IPv4 literal in $target — must use docker service name." >&2
      exit 1
    fi
    # Email outside example.com / localhost
    if grep -REn '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$target" \
         | grep -vE '@(example\.com|localhost)' >/dev/null; then
      echo "FAIL: non-placeholder email address in $target." >&2
      exit 1
    fi
  fi
done
```

Adjust to match the existing script style (functions vs inline, `bash -e` vs `set -euo pipefail`, etc.).

- [ ] **Step 2: Append `Observability secrets` section to `docs/deploy/security-public-repo.md`**

Append:

```markdown
## Observability secrets

Prometheus/Alertmanager 자체는 자격증명을 git에 두지 않는다. SMTP receiver는 env 6개로만 주입된다.

| 변수 | 의미 | placeholder 예시 |
|------|------|------------------|
| `READMATES_ALERT_SMTP_HOST` | SMTP server host | `smtp.example.com` |
| `READMATES_ALERT_SMTP_PORT` | SMTP port | `587` |
| `READMATES_ALERT_SMTP_USER` | SMTP user | — |
| `READMATES_ALERT_SMTP_PASSWORD` | SMTP password | — |
| `READMATES_ALERT_SMTP_FROM` | sender address | `alerts@example.com` |
| `READMATES_ALERT_EMAIL_TO` | operator recipient(들) | `ops@example.com` |

`scripts/public-release-check.sh`가 `deploy/oci/{prometheus,alertmanager}/`, `ops/prometheus/alerts/`에 placeholder 아닌 이메일 도메인이나 IPv4 literal이 들어오면 fail시킨다. Prometheus target은 docker network DNS(`server:8081`, `alertmanager:9093`)만 사용한다.
```

- [ ] **Step 3: Run the scanner**

Run: `./scripts/public-release-check.sh .` (or whatever the script's existing entry point is; refer to `scripts/README.md`).

Expected: PASS (no observability leaks). If it fails, fix the offending file before commit.

- [ ] **Step 4: Commit**

```bash
git add scripts/public-release-check.sh docs/deploy/security-public-repo.md
git commit -m "observability: add public-release scan for observability dirs"
```

---

### Task 10: Operational runbooks

**Files:**
- Create: `docs/operations/runbooks/observability-bootstrap.md`
- Create: `docs/operations/runbooks/slo-monthly-report.md`
- Modify: `docs/operations/runbooks/README.md`
- Modify: `docs/operations/README.md`
- Modify: `docs/operations/observability/README.md`

- [ ] **Step 1: Create `observability-bootstrap.md`**

```markdown
# Observability Bootstrap

운영자가 OCI VM에서 Prometheus + Alertmanager를 처음 띄울 때 따라가는 절차.

## 사전 준비

OCI VM의 `.env`(또는 systemd EnvironmentFile)에 6개 변수 채우기:

```
READMATES_ALERT_SMTP_HOST=...
READMATES_ALERT_SMTP_PORT=587
READMATES_ALERT_SMTP_USER=...
READMATES_ALERT_SMTP_PASSWORD=...
READMATES_ALERT_SMTP_FROM=alerts@<운영 도메인>
READMATES_ALERT_EMAIL_TO=<운영자 이메일>
```

## Bring-up

```bash
cd /opt/readmates/deploy/oci
docker compose -f compose.infra.yml up -d prometheus alertmanager
```

## Smoke check

1. Target healthy: `docker exec readmates-prometheus wget -qO- http://localhost:9090/api/v1/targets | grep -c '"health":"up"'` — 3 이상이어야 (server, prometheus-self, alertmanager).
2. Alertmanager ready: `docker exec readmates-alertmanager wget -qO- http://localhost:9093/-/ready` — 200 OK.
3. Rule load: `docker exec readmates-prometheus wget -qO- http://localhost:9090/api/v1/rules | grep -c '"name"'` — 최소 6 그룹.
4. Test alert: Prometheus expr 브라우저에서 `vector(1)`로 임시 룰 추가 또는 alertmanager API에 `amtool alert add` — 운영자 inbox 수신 확인. (구체 절차는 alertmanager 공식 docs 참조.)

## Trouble

- `up{job="readmates-server"} == 0`: app container가 `READMATES_MANAGEMENT_ADDRESS=0.0.0.0` 설정인지, docker network에 같이 떠 있는지 확인.
- SMTP 실패: `docker logs readmates-alertmanager | grep 'failed to send email'`. SMTP 자격증명 / smarthost 확인.
- Notification backlog alert: §`notification-backlog` 참고 — outbox 직접 SQL drill-down.

## 후속

- 1주 후 첫 SLO 측정치는 `slo-monthly-report.md` 절차로 `docs/operations/slo-reports/2026-06.md`에 기록.
```

- [ ] **Step 2: Create `slo-monthly-report.md`**

```markdown
# Monthly SLO Report

매월 첫 주에 한 번. SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`에 기록한다.

## 절차

1. `slos.yaml`의 6개 SLO 각각에 대해 Prometheus query 실행. 운영자 PC에서 `kubectl/ssh port-forward 9090` 후 브라우저 또는 `curl 'http://localhost:9090/api/v1/query?query=...'`.
2. 결과를 아래 템플릿에 채워 `docs/operations/slo-reports/YYYY-MM.md`로 commit.

## 템플릿

```
# SLO Report YYYY-MM

| SLO id | objective | measured | window | 위반 여부 |
|--------|-----------|----------|--------|-----------|
| api_availability | < 1% 5xx | __% | 30d | __ |
| api_read_latency_p95 | < 500ms | __ms | 30d | __ |
| bff_api_p95 | < 800ms | __ms | 7d | __ |
| login_success_ratio | > 99% | __% | 7d | __ |
| notification_dispatch_success_ratio | > 99% | __% | 7d | __ |
| notification_delivery_latency_p95 | < 5m | __m | 30d | __ |

## 비고
- incident 발생: ...
- 임계 재조정 필요: ...
```

## 자동화 follow-up

스크립트로 6개 query를 일괄 실행하여 markdown 생성하는 작업은 별도 spec.
```

- [ ] **Step 3: Update `docs/operations/runbooks/README.md`**

Add links to the two new runbooks in alphabetical position with one-line descriptions.

- [ ] **Step 4: Update `docs/operations/README.md`**

Add a pointer to `observability-bootstrap.md` under the observability section (or create one if absent).

- [ ] **Step 5: Update `docs/operations/observability/README.md`**

Add link to `observability-bootstrap.md` and `slo-monthly-report.md` near the top.

- [ ] **Step 6: Commit**

```bash
git add docs/operations/runbooks/observability-bootstrap.md \
        docs/operations/runbooks/slo-monthly-report.md \
        docs/operations/runbooks/README.md \
        docs/operations/README.md \
        docs/operations/observability/README.md
git commit -m "observability: add bootstrap and monthly SLO report runbooks"
```

---

### Task 11: Update `slos.md` and `alerts.md` to reflect file-ization + measurement state

**Files:**
- Modify: `docs/operations/observability/slos.md`
- Modify: `docs/operations/observability/alerts.md`

- [ ] **Step 1: Verify Task 1's slos.md edits already cover the wedge**

`slos.md` should already be fully aligned to `slos.yaml` by Task 1 Step 5. If "현재" lines still say "미측정" instead of "측정 중", update them now.

- [ ] **Step 2: Edit `alerts.md`**

Replace the `## 룰` opening sentence with:

```markdown
## 룰 (파일화 완료)

본 문서의 후보 룰들은 모두 `ops/prometheus/alerts/{notification,http,jvm,security,redis,targets}-rules.yml`에
파일화되어 Prometheus가 실제로 로드한다. 본 문서는 사람-읽기용 참고이며 SSOT는 rules 디렉토리다.
새 alert 추가는 항상 rules 디렉토리 파일 PR로 한다 — docs는 그 PR과 함께 동기화한다.
```

Append a note immediately after the existing "파일화된 AI 세션 생성 룰" table that the targets-rules.yml's `ScrapeTargetDown` is the dead-target watch.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/observability/slos.md docs/operations/observability/alerts.md
git commit -m "observability: mark slos.md as measuring and alerts.md as file-backed"
```

---

### Task 12: Wire `--full` mode to invoke the 3 validate-* scripts

**Files:**
- Modify: `scripts/pre-push-check.sh`

- [ ] **Step 1: Add config validation calls to the `--full` branch**

In `scripts/pre-push-check.sh`'s full mode section (look for the `--full`/`full` flag handling), add three invocations after the existing checks:

```bash
echo "==> validating Prometheus rules"
./scripts/validate-prometheus-rules.sh

echo "==> validating Prometheus config"
./scripts/validate-prometheus-config.sh

echo "==> validating Alertmanager config"
./scripts/validate-alertmanager-config.sh
```

Match the existing script's style (functions, error-bailing, etc.).

- [ ] **Step 2: Run full mode once to confirm**

Run: `./scripts/pre-push-check.sh --full` (only if docker is available locally).

Expected: PASS through all three new steps in addition to existing ones. If docker is unavailable in the executor, document the limitation in the existing scripts/README.md.

- [ ] **Step 3: Commit**

```bash
git add scripts/pre-push-check.sh
git commit -m "scripts: wire observability config validators into pre-push --full"
```

---

### Task 13: CHANGELOG Unreleased entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Engineering bullet**

Open `CHANGELOG.md`. Under the existing `## Unreleased` → `### Engineering` block, append:

```markdown
- **observability:** wire Prometheus + Alertmanager into OCI compose with SMTP routing.
  Adds `deploy/oci/prometheus/`, `deploy/oci/alertmanager/`, rule files mirroring
  `docs/operations/observability/alerts.md` (notification/http/jvm/security/redis/targets).
  Introduces `readmates.notifications.delivery.latency` histogram at the outbox
  PUBLISHED transition and wires `readmates.aigen.queue.depth` to the Redis job
  store (PENDING+RUNNING count). Reconciles `slos.yaml` as SSOT with `slos.md`
  enforced by `SloCatalogDocsConsistencyTest`. Adds `observability-bootstrap` and
  `slo-monthly-report` runbooks, and a public-release scan for observability dirs.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for observability foundation slice"
```

---

## Final Verification

After all tasks land, run the project's smallest-relevant-checks set (per `AGENTS.md`):

```bash
./server/gradlew -p server clean test       # full server tests including new ones
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
./scripts/validate-alertmanager-config.sh
./scripts/public-release-check.sh           # whatever the existing entry expects
./scripts/pre-push-check.sh                 # standard mode
```

All must pass. Optional `--full` adds the three validators (already invoked above).

## Out of Scope (Follow-ups)

These belong to other slices/specs and **must not** be added here:

- Grafana deployment (slice H).
- Automated post-mortem trigger from alertmanager webhook.
- Dead-man's-switch / Prometheus self-monitoring meta-alert.
- SMTP failure local-file sink fallback.
- AI gen queue depth via Kafka AdminClient (Redis state suffices).
- SLO monthly report automation (manual script in this slice).
- Frontend SLO / RUM.
