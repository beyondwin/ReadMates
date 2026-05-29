# Admin Club Detail Trend Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the S3+ slice by giving `/admin/clubs/:clubId` a 7-day failure trend (delta), next-action links on every red signal, and a platform-owned vs host-owned UI split — reusing the same 7-day window the club list already ships.

**Architecture:** Additive fields on the existing `AdminClubOperationsSnapshot` model (schema literal stays `admin.club_operations_snapshot.v1`). The JDBC adapter gains windowed scalar aggregations reusing existing indexes. The frontend adds pure delta/route-mapping helpers in the model module and renders them in the operations page. No controller change (it serializes the model via `Any`).

**Tech Stack:** Kotlin + Spring JDBC (server), Vite + React + TanStack Query + Vitest + Playwright (front), MySQL (Testcontainers integration).

**Spec:** `docs/superpowers/specs/2026-05-30-readmates-admin-club-detail-trend-completion-design.md`

---

## File Structure

Server:
- Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt` — add 3 fields (defaults `0`).
- Modify `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt` — windowed aggregations.
- Create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsTrendTest.kt` — integration test.

Frontend:
- Modify `front/features/platform-admin/model/platform-admin-club-operations-model.ts` — type fields + pure helpers.
- Create `front/features/platform-admin/model/platform-admin-club-operations-model.test.ts` — helper unit tests.
- Modify `front/features/platform-admin/ui/admin-club-operations-page.tsx` — metric swap, delta, blocker links, section split.
- Modify `front/features/platform-admin/ui/admin-club-operations-page.test.tsx` — UI assertions.
- Modify `front/features/platform-admin/route/admin-club-detail-route.test.tsx` — snapshot fixture fields.
- Modify `front/tests/e2e/admin-club-operations.spec.ts` — mock fields + trend assertion.

Docs:
- Modify `CHANGELOG.md` — `Unreleased` entry.

---

## Task 1: Server model — additive trend fields

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt:47-66`

- [ ] **Step 1: Add fields to the two data classes**

In `AdminClubNotificationHealth`, add two trailing fields with defaults so existing positional constructors (service test) keep compiling:

```kotlin
data class AdminClubNotificationHealth(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val lastSuccessAt: OffsetDateTime?,
    val failureClusters: List<AdminClubNotificationFailureCluster>,
    val recentFailed7d: Int = 0,
    val priorFailed7d: Int = 0,
)
```

In `AdminClubAiUsage`, add one trailing field with default:

```kotlin
data class AdminClubAiUsage(
    val activeJobs: Int,
    val failedRecentJobs: Int,
    val staleCandidates: Int,
    val costEstimateUsd: String,
    val state: String,
    val priorFailedJobs7d: Int = 0,
)
```

- [ ] **Step 2: Compile to verify no breakage**

Run: `./server/gradlew -p server compileKotlin compileTestKotlin -q`
Expected: BUILD SUCCESSFUL (defaults keep `AdminClubOperationsServiceTest` positional constructors valid).

- [ ] **Step 3: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt
git commit -m "feat: add club operations trend fields to snapshot model"
```

---

## Task 2: Server adapter — windowed aggregation + integration test

**Files:**
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsTrendTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt:149-248`

- [ ] **Step 1: Write the failing integration test**

Mirror the seeding pattern from `JdbcPlatformAdminClubFailureCountsTest.kt`. Create the file:

```kotlin
package com.readmates.club.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.Clock
import java.util.UUID

private const val CLUB_ID = "00000000-0000-0000-0000-0000000fd001"
private const val USER_ID = "00000000-0000-0000-0000-0000000fd002"
private const val MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000fd003"
private const val EVENT_ID = "00000000-0000-0000-0000-0000000fd101"

private const val CLEANUP_SQL = """
    delete from ai_generation_audit_log where club_id = '$CLUB_ID';
    delete from notification_deliveries where club_id = '$CLUB_ID';
    delete from notification_event_outbox where club_id = '$CLUB_ID';
    delete from memberships where id = '$MEMBERSHIP_ID';
    delete from users where id = '$USER_ID';
    delete from clubs where id = '$CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminClubOperationsTrendTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClubOperationsAdapter(jdbcTemplate, Clock.systemUTC()) }

    @Test
    fun `windows recent and prior failure counts for notifications and ai`() {
        seedClubWithMember()
        // notifications: recent 7d window (DEAD@1d, FAILED@3d) = 2; prior window (FAILED@10d) = 1; 20d excluded.
        insertOutbox(EVENT_ID)
        insertDelivery("d-recent-dead", "DEAD", daysAgo = 1)
        insertDelivery("d-recent-failed", "FAILED", daysAgo = 3)
        insertDelivery("d-prior-failed", "FAILED", daysAgo = 10)
        insertDelivery("d-ancient-dead", "DEAD", daysAgo = 20)
        insertDelivery("d-sent", "SENT", daysAgo = 1)
        // ai: recent FAILED@2d = 1; prior FAILED@9d = 1; 20d excluded; SUCCESS excluded.
        insertAiAudit("FAILED", daysAgo = 2)
        insertAiAudit("FAILED", daysAgo = 9)
        insertAiAudit("FAILED", daysAgo = 20)
        insertAiAudit("SUCCESS", daysAgo = 1)

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        assertThat(snapshot).isNotNull
        assertThat(snapshot!!.notificationHealth.recentFailed7d).isEqualTo(2)
        assertThat(snapshot.notificationHealth.priorFailed7d).isEqualTo(1)
        assertThat(snapshot.aiUsage.failedRecentJobs).isEqualTo(1)
        assertThat(snapshot.aiUsage.priorFailedJobs7d).isEqualTo(1)
    }

    @Test
    fun `failure clusters only include the recent 7 day window`() {
        seedClubWithMember()
        insertOutbox(EVENT_ID)
        insertDelivery("d-recent", "FAILED", daysAgo = 2)
        insertDelivery("d-old", "FAILED", daysAgo = 12)

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        val total = snapshot!!.notificationHealth.failureClusters.sumOf { it.count }
        assertThat(total).isEqualTo(1)
    }

    @Test
    fun `clean club reports zero trend counts`() {
        seedClubWithMember()

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        assertThat(snapshot!!.notificationHealth.recentFailed7d).isEqualTo(0)
        assertThat(snapshot.notificationHealth.priorFailed7d).isEqualTo(0)
        assertThat(snapshot.aiUsage.priorFailedJobs7d).isEqualTo(0)
    }

    private fun seedClubWithMember() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) " +
                "values (?, 'ops-trend-club', 'Ops Trend Club', '', '', 'ACTIVE', 'PRIVATE')",
            CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, google_subject_id, email, name, short_name, auth_provider) " +
                "values (?, 'ops-trend-user', 'ops-trend@example.com', 'Ops Trend', 'OT', 'GOOGLE')",
            USER_ID,
        )
        jdbcTemplate.update(
            "insert into memberships (id, club_id, user_id, role, status, joined_at, short_name) " +
                "values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'OT')",
            MEMBERSHIP_ID,
            CLUB_ID,
            USER_ID,
        )
    }

    private fun insertOutbox(id: String) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?), 'PUBLISHED',
              ?, 1, null, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            id, CLUB_ID, CLUB_ID, CLUB_ID, CLUB_ID, "ops-trend-outbox-$id",
        )
    }

    private fun insertDelivery(
        id: String,
        status: String,
        daysAgo: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, 'EMAIL', ?, ?, 1, 'smtp timeout',
              utc_timestamp(6) - interval ? day, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            id, EVENT_ID, CLUB_ID, MEMBERSHIP_ID, status, "ops-trend-delivery-$id", daysAgo, daysAgo,
        )
    }

    private fun insertAiAudit(
        status: String,
        daysAgo: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, provider, model, status,
              input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            )
            values (?, ?, ?, ?, 'SESSION_RECORD', 'ANTHROPIC', 'claude-x', ?,
              0, 0, 0, 0, 0, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            UUID.randomUUID().toString(), CLUB_ID, CLUB_ID, USER_ID, status, daysAgo,
        )
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./server/gradlew -p server test --tests "com.readmates.club.adapter.out.persistence.JdbcAdminClubOperationsTrendTest" -q`
Expected: FAIL — `recentFailed7d`/`priorFailed7d`/`priorFailedJobs7d` are `0` (adapter not yet computing them) and the cluster window assertion sees `2`.

- [ ] **Step 3: Add windowed counts to `notificationHealth(...)`**

In `JdbcAdminClubOperationsAdapter.kt`, replace the `AdminClubNotificationHealth(...)` construction (lines ~150-189) so it passes the two new fields. Add these two `scalarInt` arguments after `failureClusters = failureClusters(clubId),`:

```kotlin
            failureClusters = failureClusters(clubId),
            recentFailed7d =
                scalarInt(
                    """
                    select count(*)
                    from notification_deliveries
                    where club_id = ? and status in ('FAILED', 'DEAD')
                      and updated_at >= utc_timestamp(6) - interval 7 day
                    """.trimIndent(),
                    clubId,
                ),
            priorFailed7d =
                scalarInt(
                    """
                    select count(*)
                    from notification_deliveries
                    where club_id = ? and status in ('FAILED', 'DEAD')
                      and updated_at >= utc_timestamp(6) - interval 14 day
                      and updated_at < utc_timestamp(6) - interval 7 day
                    """.trimIndent(),
                    clubId,
                ),
        )
```

- [ ] **Step 4: Window the failure clusters query**

In `failureClusters(clubId)` (lines ~191-217), add the recent-window predicate to the `where` clause:

```kotlin
            where club_id = ?
              and status in ('FAILED', 'DEAD')
              and updated_at >= utc_timestamp(6) - interval 7 day
            group by safe_error_code
```

- [ ] **Step 5: Add the prior-window AI count**

In `aiUsage(clubId)` (lines ~219-248), add a `prior_failed_jobs_7d` column to the select and read it. Add this `sum(...)` after the `failed_recent_jobs` line:

```kotlin
              sum(case when status = 'FAILED' and created_at >= timestampadd(day, -14, utc_timestamp(6)) and created_at < timestampadd(day, -7, utc_timestamp(6)) then 1 else 0 end) as prior_failed_jobs_7d,
```

Then in the row mapper, read it and pass to the constructor:

```kotlin
                val priorFailedJobs7d = rs.getInt("prior_failed_jobs_7d")
                AdminClubAiUsage(
                    activeJobs = activeJobs,
                    failedRecentJobs = failedRecentJobs,
                    staleCandidates = staleCandidates,
                    costEstimateUsd = rs.getBigDecimal("cost_estimate_usd").formatCost(),
                    state =
                        if (activeJobs + failedRecentJobs + staleCandidates == 0) {
                            "NO_RECENT_USAGE"
                        } else {
                            "HAS_ACTIVITY"
                        },
                    priorFailedJobs7d = priorFailedJobs7d,
                )
```

Also update the `?:` fallback (line ~248) to include the new field:

```kotlin
        ) ?: AdminClubAiUsage(0, 0, 0, "0.0000", "NO_RECENT_USAGE", 0)
```

- [ ] **Step 6: Run the integration test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.club.adapter.out.persistence.JdbcAdminClubOperationsTrendTest" -q`
Expected: PASS (3 tests green).

- [ ] **Step 7: Run server unit + architecture tests for regressions**

Run: `./server/gradlew -p server unitTest architectureTest -q`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsTrendTest.kt
git commit -m "feat: aggregate windowed failure trend in club operations snapshot"
```

---

## Task 3: Frontend model — types + pure delta/route helpers

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-club-operations-model.ts:29-42`
- Create: `front/features/platform-admin/model/platform-admin-club-operations-model.test.ts`

- [ ] **Step 1: Add the new type fields**

In `platform-admin-club-operations-model.ts`, add to `notificationHealth` (after `failureClusters`):

```ts
    failureClusters: Array<{ safeErrorCode: string; count: number }>;
    recentFailed7d: number;
    priorFailed7d: number;
  };
```

And to `aiUsage` (after `state`):

```ts
    state: string;
    priorFailedJobs7d: number;
  };
```

- [ ] **Step 2: Add pure helpers at the bottom of the same file**

```ts
export function notificationFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return snapshot.notificationHealth.recentFailed7d - snapshot.notificationHealth.priorFailed7d;
}

export function aiFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return snapshot.aiUsage.failedRecentJobs - snapshot.aiUsage.priorFailedJobs7d;
}

export type ClubNextAction = { label: string; href: string; kind: "ADMIN_ROUTE" | "HOST_ROUTE" };

export function blockerNextAction(code: string, slug: string): ClubNextAction | null {
  switch (code) {
    case "HOST_REQUIRED":
      return { label: "호스트 지정", href: `/clubs/${slug}/app`, kind: "HOST_ROUTE" };
    case "DOMAIN_ACTION_REQUIRED":
      return { label: "도메인 조치", href: `/clubs/${slug}/app`, kind: "HOST_ROUTE" };
    case "CLUB_NOT_ACTIVE":
      return { label: "클럽 상태 확인", href: `/clubs/${slug}/app`, kind: "HOST_ROUTE" };
    default:
      return null;
  }
}
```

- [ ] **Step 3: Write the failing helper unit test**

Create `platform-admin-club-operations-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aiFailureDelta,
  blockerNextAction,
  notificationFailureDelta,
  type AdminClubOperationsSnapshot,
} from "./platform-admin-club-operations-model";

function snapshot(overrides: Partial<AdminClubOperationsSnapshot> = {}): AdminClubOperationsSnapshot {
  return {
    schema: "admin.club_operations_snapshot.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    club: { clubId: "c1", slug: "alpha", name: "Alpha", status: "ACTIVE", publicVisibility: "PUBLIC" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    memberActivity: { activeCount: 0, dormantCount: 0, pendingViewerCount: 0, hostCount: 0 },
    sessionProgress: { upcomingCount: 0, currentOpenCount: 0, closedCount: 0, publishedRecordCount: 0, incompleteRecordCount: 0 },
    notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 0, priorFailed7d: 0 },
    aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "NO_RECENT_USAGE", priorFailedJobs7d: 0 },
    safeLinks: [],
    ...overrides,
  };
}

describe("club operations trend helpers", () => {
  it("computes a rising notification delta", () => {
    const s = snapshot({ notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 5, priorFailed7d: 2 } });
    expect(notificationFailureDelta(s)).toBe(3);
  });

  it("computes a falling ai delta as negative", () => {
    const s = snapshot({ aiUsage: { activeJobs: 0, failedRecentJobs: 1, staleCandidates: 0, costEstimateUsd: "0.0000", state: "HAS_ACTIVITY", priorFailedJobs7d: 4 } });
    expect(aiFailureDelta(s)).toBe(-3);
  });

  it("returns zero delta when both windows are empty", () => {
    expect(notificationFailureDelta(snapshot())).toBe(0);
    expect(aiFailureDelta(snapshot())).toBe(0);
  });

  it("maps known blocker codes to host next actions", () => {
    expect(blockerNextAction("HOST_REQUIRED", "alpha")).toEqual({ label: "호스트 지정", href: "/clubs/alpha/app", kind: "HOST_ROUTE" });
    expect(blockerNextAction("DOMAIN_ACTION_REQUIRED", "alpha")?.href).toBe("/clubs/alpha/app");
    expect(blockerNextAction("CLUB_NOT_ACTIVE", "alpha")?.label).toBe("클럽 상태 확인");
  });

  it("returns null for an unknown blocker code", () => {
    expect(blockerNextAction("MYSTERY_CODE", "alpha")).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --dir front test platform-admin-club-operations-model`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-club-operations-model.ts front/features/platform-admin/model/platform-admin-club-operations-model.test.ts
git commit -m "feat: add club operations trend and blocker-route model helpers"
```

---

## Task 4: Frontend UI — 7-day metric, deltas, blocker links, section split

**Files:**
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`

- [ ] **Step 1: Write the failing UI assertions**

In `admin-club-operations-page.test.tsx`, extend the `snapshot` fixture (lines 14-15) to include the new fields, and add tests. Replace the `notificationHealth`/`aiUsage` lines with:

```ts
  notificationHealth: { pending: 1, failed: 1, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 5, priorFailed7d: 2 },
  aiUsage: { activeJobs: 0, failedRecentJobs: 1, staleCandidates: 0, costEstimateUsd: "0.1200", state: "HAS_ACTIVITY", priorFailedJobs7d: 3 },
```

Then add these tests inside the `describe` block:

```ts
  it("shows the 7-day notification failure count with a trend delta", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText("알림 실패 (7일)")).toBeInTheDocument();
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/지난 7일 대비/).length).toBeGreaterThan(0);
  });

  it("links readiness blockers to a next action", () => {
    const blocked: AdminClubOperationsSnapshot = {
      ...snapshot,
      readiness: { state: "NEEDS_ATTENTION", blockingReasons: ["HOST_REQUIRED"], nextAction: "HOST_REQUIRED" },
    };
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={blocked} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "호스트 지정" })).toHaveAttribute("href", "/clubs/reading-sai/app");
  });

  it("separates platform-owned and host-owned sections", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "플랫폼 운영" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "호스트 운영" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir front test admin-club-operations-page`
Expected: FAIL — "알림 실패 (7일)", the delta text, the "호스트 지정" link, and the two regions are not yet rendered.

- [ ] **Step 3: Rewrite the operations page**

Replace the full contents of `admin-club-operations-page.tsx` with:

```tsx
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  aiFailureDelta,
  blockerNextAction,
  notificationFailureDelta,
  type AdminClubOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-club-operations-model";

type AdminClubOperationsPageProps = {
  snapshot: AdminClubOperationsSnapshot;
  supportGrantCount: number;
};

export function AdminClubOperationsPage({ snapshot, supportGrantCount }: AdminClubOperationsPageProps) {
  const notifDelta = notificationFailureDelta(snapshot);
  const aiDelta = aiFailureDelta(snapshot);

  return (
    <section className="admin-club-operations" aria-labelledby="admin-club-operations-title">
      <header className="admin-club-operations__header">
        <div>
          <p className="eyebrow">Operations snapshot</p>
          <h2 id="admin-club-operations-title" className="h3 editorial">
            {snapshot.club.name} 운영 스냅샷
          </h2>
        </div>
        <span className="platform-admin-domain-status">{snapshot.readiness.state}</span>
      </header>

      <div className="admin-club-operations__summary">
        <Metric label="활성 멤버" value={snapshot.memberActivity.activeCount} />
        <Metric label="호스트" value={snapshot.memberActivity.hostCount} />
        <Metric label="지원 grant" value={supportGrantCount} />
        <Metric label="열린 세션" value={snapshot.sessionProgress.currentOpenCount} />
        <Metric label="알림 실패 (7일)" value={snapshot.notificationHealth.recentFailed7d} delta={notifDelta} />
      </div>

      <section className="admin-club-operations__group" aria-label="플랫폼 운영">
        <h3 className="h4 editorial">플랫폼 운영</h3>
        {snapshot.readiness.blockingReasons.length > 0 ? (
          <ul className="admin-club-operations__blockers">
            {snapshot.readiness.blockingReasons.map((reason) => {
              const action = blockerNextAction(reason, snapshot.club.slug);
              return (
                <li key={reason}>
                  <span>{reason}</span>
                  {action ? (
                    <Link className="btn btn-ghost btn-sm" to={action.href}>
                      {action.label}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">차단 신호 없음</p>
        )}

        <div className="admin-club-operations__grid">
          <Panel title="Notification health">
            <Stat label="최근 7일 실패" value={snapshot.notificationHealth.recentFailed7d} />
            <Stat label="지난 7일 대비" value={formatDelta(notifDelta)} />
            <Stat label="Pending" value={snapshot.notificationHealth.pending} />
            <Stat label="Failed (전체)" value={snapshot.notificationHealth.failed} />
            <Stat label="Dead (전체)" value={snapshot.notificationHealth.dead} />
            <Link className="btn btn-ghost btn-sm" to={`/admin/notifications?clubId=${snapshot.club.clubId}`}>
              알림 ledger
            </Link>
          </Panel>

          <Panel title="AI usage">
            <Stat label="Active jobs" value={snapshot.aiUsage.activeJobs} />
            <Stat label="최근 7일 실패" value={snapshot.aiUsage.failedRecentJobs} />
            <Stat label="지난 7일 대비" value={formatDelta(aiDelta)} />
            <Stat label="Cost" value={`$${snapshot.aiUsage.costEstimateUsd}`} />
            <Link className="btn btn-ghost btn-sm" to={`/admin/ai-ops?clubId=${snapshot.club.clubId}`}>
              AI Ops
            </Link>
          </Panel>
        </div>
      </section>

      <section className="admin-club-operations__group" aria-label="호스트 운영">
        <h3 className="h4 editorial">호스트 운영</h3>
        <div className="admin-club-operations__grid">
          <Panel title="Session progress">
            <Stat label="예정" value={snapshot.sessionProgress.upcomingCount} />
            <Stat label="닫힘" value={snapshot.sessionProgress.closedCount} />
            <Stat label="공개 기록" value={snapshot.sessionProgress.publishedRecordCount} />
            <Stat label="미완료 기록" value={snapshot.sessionProgress.incompleteRecordCount} />
          </Panel>
          <Panel title="Member activity">
            <Stat label="활성" value={snapshot.memberActivity.activeCount} />
            <Stat label="휴면" value={snapshot.memberActivity.dormantCount} />
            <Stat label="대기" value={snapshot.memberActivity.pendingViewerCount} />
          </Panel>
        </div>
      </section>

      <div className="admin-club-operations__links">
        {snapshot.safeLinks.map((link) => (
          <Link key={`${link.kind}-${link.href}`} to={link.href} className="admin-club-operations__link">
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatDelta(delta: number): string {
  if (delta > 0) return `↑ ${delta} (지난 7일 대비)`;
  if (delta < 0) return `↓ ${Math.abs(delta)} (지난 7일 대비)`;
  return `→ 0 (지난 7일 대비)`;
}

function Metric({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <article className="surface admin-club-operations__metric">
      <p className="tiny muted">{label}</p>
      <strong className="editorial">{value}</strong>
      {delta !== undefined ? <p className="tiny muted">{formatDelta(delta)}</p> : null}
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-club-operations__panel" aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}>
      <h4 id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`} className="h5 editorial">{title}</h4>
      <div className="admin-club-operations__stats">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-club-operations__stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
```

Note: the summary metric and the "최근 7일 실패" panel stat both render the value `5`; the existing `getByText("5")` assertion uses a non-exact match that resolves the first match, which is fine. If a future test needs uniqueness, use `getAllByText`.

- [ ] **Step 4: Run the UI test**

Run: `pnpm --dir front test admin-club-operations-page`
Expected: PASS.

- [ ] **Step 5: Run lint + build**

Run: `pnpm --dir front lint && pnpm --dir front build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/ui/admin-club-operations-page.tsx front/features/platform-admin/ui/admin-club-operations-page.test.tsx
git commit -m "feat: surface club detail failure trend and next-action links"
```

---

## Task 5: Fixtures, E2E, CHANGELOG, public-safety

**Files:**
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx:31-32`
- Modify: `front/tests/e2e/admin-club-operations.spec.ts:73-74`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add new fields to the route-test snapshot fixture**

In `admin-club-detail-route.test.tsx`, replace the `notificationHealth`/`aiUsage` lines (31-32) with:

```ts
    notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 0, priorFailed7d: 0 },
    aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "NO_RECENT_USAGE", priorFailedJobs7d: 0 },
```

- [ ] **Step 2: Update the E2E mock and add a trend assertion**

In `admin-club-operations.spec.ts`, replace the mock `notificationHealth`/`aiUsage` lines (73-74) with:

```ts
      notificationHealth: { pending: 1, failed: 1, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 4, priorFailed7d: 1 },
      aiUsage: { activeJobs: 0, failedRecentJobs: 1, staleCandidates: 0, costEstimateUsd: "0.1200", state: "HAS_ACTIVITY", priorFailedJobs7d: 0 },
```

Then add an assertion inside the existing `test(...)` block, after the "알림 ledger" link check:

```ts
  await expect(page.getByText("알림 실패 (7일)")).toBeVisible();
  await expect(page.getByText(/지난 7일 대비/).first()).toBeVisible();
```

- [ ] **Step 3: Run frontend unit + e2e**

Run: `pnpm --dir front test admin-club-detail-route`
Expected: PASS.

Run: `pnpm --dir front test:e2e admin-club-operations`
Expected: PASS (owner views aggregate club operations with trend).

- [ ] **Step 4: Add the CHANGELOG entry**

In `CHANGELOG.md`, under the `Unreleased` section, add a bullet describing shipped behavior:

```markdown
- 플랫폼 admin 클럽 상세 운영 스냅샷에 최근 7일 알림/AI 실패 추이(지난 7일 대비 델타)와 readiness 차단 신호별 next-action 링크를 추가하고, 플랫폼 운영/호스트 운영 섹션을 구분했습니다.
```

- [ ] **Step 5: Public-safety scan on changed files**

Run: `git diff --check && git status --short`
Expected: no whitespace errors. Manually confirm no real member data, secrets, raw provider errors, transcript bodies, or token-shaped strings were added to any changed file (counts and safe labels only).

- [ ] **Step 6: Full regression gate**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: all green.

Run: `./server/gradlew -p server unitTest -q`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add front/features/platform-admin/route/admin-club-detail-route.test.tsx front/tests/e2e/admin-club-operations.spec.ts CHANGELOG.md
git commit -m "test: cover club detail trend e2e and note changelog"
```

---

## Self-Review Notes

- **Spec coverage:** recentFailed7d/priorFailed7d/priorFailedJobs7d (Task 1-2), windowed clusters (Task 2 Step 4), 7-day metric swap (Task 4 Step 3), delta lines (Task 4), blocker next-action links (Task 3 helper + Task 4), platform/host section split (Task 4), additive v1 schema (Task 1 defaults, no schema literal change), fixtures default 0 (Task 5), tests + CHANGELOG + public-safety (all tasks + Task 5). All S3+ detail Gate items mapped.
- **Type consistency:** `notificationFailureDelta`/`aiFailureDelta`/`blockerNextAction` defined in Task 3 and consumed identically in Task 4. Field names `recentFailed7d`/`priorFailed7d`/`priorFailedJobs7d` consistent across server model, frontend type, and all fixtures.
- **Open item for reviewer:** all three readiness blockers currently map to the host app route (`/clubs/:slug/app`) because no dedicated admin domains route exists; adjust labels/destinations in `blockerNextAction` if a better target lands.
