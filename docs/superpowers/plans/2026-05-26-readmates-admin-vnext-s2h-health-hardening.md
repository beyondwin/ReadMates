# ReadMates Admin vNext S2H Health Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

```yaml waygent-task
id: phase_1_front_contract_card_strip
title: Phase 1 — Align frontend health contract with server camelCase and harden card/strip components. Do not create git commits from the task worktree.
dependencies: []
file_claims:
  - path: front/features/platform-admin/model/platform-admin-health-model.ts
    mode: owned
  - path: front/features/platform-admin/api/platform-admin-health-contracts.ts
    mode: owned
  - path: front/features/platform-admin/ui/admin-health-card.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-health-card.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-health-deploy-strip.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-health-deploy-strip.test.tsx
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm --dir front exec vitest run features/platform-admin/ui/admin-health-card.test.tsx features/platform-admin/ui/admin-health-deploy-strip.test.tsx
instructions:
  - Implement Tasks 1 and 2 from the plan body.
  - Keep the response type names stable; change field names only where the current server already emits camelCase.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_2_front_grid_route_e2e_css
title: Phase 2 — Add health grid refresh/stale affordances, product CSS, route tests, and seven-card E2E. Do not create git commits from the task worktree.
dependencies: [phase_1_front_contract_card_strip]
file_claims:
  - path: front/features/platform-admin/route/admin-health-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-health-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-health-grid.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-health-grid.test.tsx
    mode: owned
  - path: front/src/styles/globals.css
    mode: owned
  - path: front/tests/e2e/admin-health.spec.ts
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm --dir front exec vitest run features/platform-admin/route/admin-health-route.test.tsx features/platform-admin/ui/admin-health-grid.test.tsx
  - pnpm --dir front exec playwright test tests/e2e/admin-health.spec.ts --project=chromium
instructions:
  - Implement Tasks 3, 4, and 5 from the plan body.
  - Use the exact seven-card fixture shape from the plan body and keep all sample values public-safe.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_3_backend_health_service
title: Phase 3 — Harden health service provider execution and server contract tests. Do not create git commits from the task worktree.
dependencies: []
file_claims:
  - path: server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt
    mode: owned
  - path: server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProviderTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - ./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.PlatformAdminHealthServiceTest" --tests "com.readmates.admin.health.application.service.providers.RedisHealthCardProviderTest" --tests "com.readmates.admin.health.adapter.in.web.PlatformAdminHealthControllerTest"
instructions:
  - Implement Task 6 from the plan body.
  - Preserve the seven-card provider order and keep provider failures card-local.
  - Do not execute git add or git commit from the task worktree.
```

```yaml waygent-task
id: phase_4_release_notes
title: Phase 4 — Add release note for the S2H hardening behavior. Do not create git commits from the task worktree.
dependencies: [phase_1_front_contract_card_strip, phase_2_front_grid_route_e2e_css, phase_3_backend_health_service]
file_claims:
  - path: CHANGELOG.md
    mode: owned
risk: low
verify_isolation: fast
verify:
  - git diff --check -- CHANGELOG.md
instructions:
  - Implement Task 7 from the plan body.
  - Add one public-safe bullet under the existing Unreleased engineering section.
  - Do not execute git add or git commit from the task worktree.
```

**Goal:** Close S2H `/admin/health` as the first product-grade admin operating entry point by aligning the frontend contract to the current server JSON, rendering the full seven-card snapshot and deploy strip, adding refresh/stale affordances, hardening provider execution, and pinning the flow with focused unit, E2E, and browser-smoke verification.

**Architecture:** Keep the existing S2 architecture. The server remains the contract source for `/api/admin/health/snapshot` and emits camelCase JSON through `PlatformAdminHealthController`. Frontend response types mirror that JSON directly in `front/features/platform-admin/model`; route and grid modules own TanStack Query orchestration; card and strip UI components remain prop-only. Backend health card providers stay behind `HealthCardProvider`, and `PlatformAdminHealthService` composes them into the existing cached snapshot while isolating provider failures.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vitest, Playwright, Vite, Kotlin/Spring Boot, MockMvc, JUnit 5, AssertJ, Micrometer.

**Spec:** [`docs/superpowers/specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md`](../specs/2026-05-26-readmates-admin-vnext-operating-roadmap-reset-design.md)

---

## Current Source State

S2 already exists in code:

- `/admin/health` is wired as a READY lazy route in `front/src/app/routes/admin.tsx`.
- `front/features/platform-admin/model/admin-route-catalog.ts` marks `health` as READY.
- The frontend calls `/api/admin/health/snapshot` through `fetchPlatformAdminHealthSnapshot`.
- `PlatformAdminHealthController` returns `generatedAt`, `lastCheckedAt`, `deployStrip`, `attemptId`, `startedAt`, `endedAt`, `finalStatus`, `imageTag`, and `durationSeconds`.
- The current frontend model and tests still expect `generated_at`, `last_checked_at`, `deploy_strip`, `attempt_id`, `started_at`, `ended_at`, `final_status`, `image_tag`, and `duration_seconds`.
- `admin-health-*` class names exist in components but not in `front/src/styles/globals.css`.
- The current Playwright fixture has three cards, not the S2 seven-card contract.

This plan treats the server's current camelCase response as the contract. It does not rename server JSON to snake_case because the surrounding platform-admin frontend already uses camelCase response fields such as `lastCheckedAt`, `clubId`, and `platformRole`.

## File Structure

Modify frontend:

- `front/features/platform-admin/model/platform-admin-health-model.ts`
- `front/features/platform-admin/api/platform-admin-health-contracts.ts`
- `front/features/platform-admin/route/admin-health-route.tsx`
- `front/features/platform-admin/route/admin-health-route.test.tsx`
- `front/features/platform-admin/ui/admin-health-grid.tsx`
- `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- `front/features/platform-admin/ui/admin-health-card.tsx`
- `front/features/platform-admin/ui/admin-health-card.test.tsx`
- `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`
- `front/features/platform-admin/ui/admin-health-deploy-strip.test.tsx`
- `front/src/styles/globals.css`
- `front/tests/e2e/admin-health.spec.ts`

Modify server:

- `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`
- `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt`
- `server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt`
- `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProviderTest.kt`
- `server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt`

Modify release note:

- `CHANGELOG.md`

No database migrations, BFF secret handling, production deploy scripts, or private operational data are touched.

## Task 1 — Frontend Contract Alignment

- [ ] Replace the health response model with camelCase names that match the current server response.

`front/features/platform-admin/model/platform-admin-health-model.ts` should end with this shape:

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
  kind: "ADMIN_ROUTE";
  target: string;
};

export type DeployAttemptStripEntry = {
  attemptId: string;
  startedAt: string;
  endedAt: string | null;
  finalStatus: DeployAttemptFinalStatus;
  imageTag: string | null;
  durationSeconds: number | null;
};

export type HealthCard = {
  id: string;
  title: string;
  status: HealthCardStatus;
  metric: HealthCardMetric | null;
  thresholds: HealthCardThresholds | null;
  lastCheckedAt: string;
  source: HealthCardSource;
  drill: HealthCardDrill | null;
  reason: string | null;
  deployStrip: DeployAttemptStripEntry[] | null;
};

export type PlatformHealthSnapshot = {
  schema: "platform.health_snapshot.v1";
  generatedAt: string;
  cards: HealthCard[];
};
```

- [ ] Keep `front/features/platform-admin/api/platform-admin-health-contracts.ts` as a simple re-export of these model types.
- [ ] Update all existing TypeScript references from the old snake_case names to the new camelCase names.
- [ ] Do not add a normalization layer unless a failing test proves that a second input shape must be supported. S2H's goal is one stable contract, not dual compatibility.

## Task 2 — Card And Deploy Strip Components

- [ ] Update `AdminHealthCard` to read `card.lastCheckedAt` and `card.deployStrip`.
- [ ] Guard timestamp formatting so invalid or absent dates never render `NaN시간 전`.

Use this helper in `front/features/platform-admin/ui/admin-health-card.tsx`:

```ts
function relativeFromNow(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "확인 시각 없음";

  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분 전`;
  return `${Math.round(seconds / 3600)}시간 전`;
}
```

- [ ] Update the drill link to keep using `card.drill.target`; no UI branching on `kind` is needed because the current server only emits `ADMIN_ROUTE`.
- [ ] Update `AdminHealthDeployStrip` to use `attemptId`, `startedAt`, `finalStatus`, `imageTag`, and `durationSeconds`.
- [ ] Add `front/features/platform-admin/ui/admin-health-deploy-strip.test.tsx` with these cases:
  - empty array renders `아직 기록된 배포가 없습니다.`
  - `SUCCEEDED`, `FAILED`, and `RUNNING` entries render Korean labels
  - list item keys and visible text come from `attemptId`, `imageTag`, and `startedAt`
- [ ] Update `admin-health-card.test.tsx` fixtures to use camelCase and `kind: "ADMIN_ROUTE"`.
- [ ] Add a card test for invalid `lastCheckedAt` that asserts `NaN` is not present and `확인 시각 없음` is visible.

Representative test fixture:

```ts
function card(overrides: Partial<HealthCard> = {}): HealthCard {
  return {
    id: "outbox_backlog",
    title: "Outbox backlog",
    status: "OK",
    metric: { value: 42, unit: "rows", label: "pending" },
    thresholds: { warn: 100, crit: 1000 },
    lastCheckedAt: "2026-05-26T00:00:00Z",
    source: "IN_PROCESS",
    drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
    reason: null,
    deployStrip: null,
    ...overrides,
  };
}
```

## Task 3 — Health Grid Refresh And Stale Affordance

- [ ] Update `AdminHealthGrid` so it renders a small operations toolbar above the cards:
  - `schema`
  - generated timestamp
  - query update state
  - manual refresh button
- [ ] Keep the grid component responsible for the query because it already owns the health snapshot fetch.
- [ ] Do not move fetch logic into `ui` children; `AdminHealthCard` and `AdminHealthDeployStrip` must stay prop-only.
- [ ] Use `query.refetch()` from TanStack Query for manual refresh.
- [ ] Disable the refresh button while `query.isFetching` is true.
- [ ] Show a stale state when `query.dataUpdatedAt` is older than 30 seconds.
- [ ] Use `deployStrip`, not `deploy_strip`, when rendering the deploy card.
- [ ] Keep `deploy_attempts_strip` out of the card grid and render it as a separate section.

Core implementation shape:

```tsx
const STALE_AFTER_MS = 30_000;

export function AdminHealthGrid() {
  const query = useQuery(platformAdminHealthSnapshotQuery());

  if (query.isLoading) return <p className="admin-health-grid__loading">로딩 중...</p>;
  if (query.isError || !query.data) {
    return <p className="admin-health-grid__error">스냅샷을 불러오지 못했습니다.</p>;
  }

  const now = Date.now();
  const isStale = query.dataUpdatedAt > 0 && now - query.dataUpdatedAt > STALE_AFTER_MS;
  const stripCard = query.data.cards.find((card) => card.id === "deploy_attempts_strip");
  const rest = query.data.cards.filter((card) => card.id !== "deploy_attempts_strip");

  return (
    <div className="admin-health-grid">
      <div className="admin-health-grid__toolbar" aria-label="Health snapshot controls">
        <div>
          <p className="eyebrow">Snapshot</p>
          <p className="admin-health-grid__timestamp">
            생성 {new Date(query.data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="admin-health-grid__toolbar-actions">
          <span className={isStale ? "admin-health-grid__stale admin-health-grid__stale--warn" : "admin-health-grid__stale"}>
            {query.isFetching ? "갱신 중" : isStale ? "30초 이상 경과" : "최신"}
          </span>
          <button
            type="button"
            className="admin-health-grid__refresh"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            새로고침
          </button>
        </div>
      </div>

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
          {stripCard.deployStrip ? <AdminHealthDeployStrip entries={stripCard.deployStrip} /> : null}
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] Add `front/features/platform-admin/ui/admin-health-grid.test.tsx`:
  - renders six health cards plus the separate deploy strip from a seven-card snapshot
  - refresh button calls `fetchPlatformAdminHealthSnapshot` a second time
  - stale label changes after advancing timers beyond 30 seconds
  - deploy strip reads `deployStrip`

Use a test `QueryClient` with `retry: false` and fake timers for the stale case.

## Task 4 — Route Fixture Coverage And Product CSS

- [ ] Update `front/features/platform-admin/route/admin-health-route.test.tsx` to mock a full seven-card snapshot with camelCase fields.
- [ ] Assert that the route renders:
  - `Platform Health`
  - all six non-strip health card headings
  - `최근 deploy`
  - at least one deploy image tag
  - no visible `NaN`
- [ ] Keep `AdminHealthRoute` as the route-level shell. It should remain a thin page with the heading, explanatory subtitle, and `AdminHealthGrid`.
- [ ] Add `admin-health-*` rules to `front/src/styles/globals.css` near the existing `.platform-admin-*` block.
- [ ] Keep the visual language aligned with the admin shell: warm paper surface, ink hierarchy, clear status pills, restrained borders, no gradients, no glass, no decorative background blobs.
- [ ] Add responsive rules inside the existing media query near the `.platform-admin-*` responsive rules.

CSS must define these selectors:

```css
.admin-health-grid
.admin-health-grid__toolbar
.admin-health-grid__toolbar-actions
.admin-health-grid__timestamp
.admin-health-grid__stale
.admin-health-grid__stale--warn
.admin-health-grid__refresh
.admin-health-grid__loading
.admin-health-grid__error
.admin-health-grid__cards
.admin-health-grid__strip
.admin-health-grid__strip-header
.admin-health-card
.admin-health-card__header
.admin-health-card__pill
.admin-health-card__pill--ok
.admin-health-card__pill--warn
.admin-health-card__pill--crit
.admin-health-card__pill--unknown
.admin-health-card__body
.admin-health-card__metric
.admin-health-card__metric-value
.admin-health-card__metric-label
.admin-health-card__thresholds
.admin-health-card__reason
.admin-health-card__footer
.admin-health-card__time
.admin-health-card__drill
.admin-health-deploy-strip
.admin-health-deploy-strip__empty
.admin-health-deploy-strip__item
.admin-health-deploy-strip__dot
.admin-health-deploy-strip__dot--ok
.admin-health-deploy-strip__dot--crit
.admin-health-deploy-strip__dot--running
.admin-health-deploy-strip__detail
.admin-health-deploy-strip__title
.admin-health-deploy-strip__time
```

Minimum layout rules:

- cards grid uses `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))`
- card border radius is `8px`
- card status is communicated with text and border/pill styling, not color alone
- refresh button has visible focus
- mobile stacks toolbar actions vertically and keeps buttons full-width enough for thumb use

## Task 5 — Seven-Card Playwright Flow

- [ ] Update `front/tests/e2e/admin-health.spec.ts` to use the full seven-card fixture:
  - `outbox_backlog`
  - `kafka_consumer_lag`
  - `redis`
  - `db_pool`
  - `notification_dispatch_success`
  - `ai_provider_availability`
  - `deploy_attempts_strip`
- [ ] Use the camelCase response fields from Task 1.
- [ ] Include two deploy strip entries with public-safe image tags such as `readmates-api:dev-20260526` and `readmates-api:previous`.
- [ ] Assert:
  - page heading is visible
  - six non-strip card headings are visible
  - `최근 deploy` section is visible
  - deploy image tag is visible
  - outbox drill link points to `/admin/notifications`
  - refresh button is visible and can be clicked
  - no `NaN` text appears

Fixture skeleton:

```ts
const HEALTH_SNAPSHOT: PlatformHealthSnapshotResponse = {
  schema: "platform.health_snapshot.v1",
  generatedAt: "2026-05-26T00:00:00Z",
  cards: [
    {
      id: "outbox_backlog",
      title: "Outbox backlog",
      status: "OK",
      metric: { value: 42, unit: "rows", label: "pending" },
      thresholds: { warn: 100, crit: 1000 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "kafka_consumer_lag",
      title: "Kafka consumer lag",
      status: "WARN",
      metric: { value: 75, unit: "records", label: "max across partitions" },
      thresholds: { warn: 50, crit: 500 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: null,
      reason: null,
      deployStrip: null,
    },
    {
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      thresholds: { warn: 1, crit: 50 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: "redis_metrics_unavailable",
      deployStrip: null,
    },
    {
      id: "db_pool",
      title: "DB pool",
      status: "OK",
      metric: { value: 3, unit: "connections", label: "active" },
      thresholds: { warn: 8, crit: 12 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: null,
      deployStrip: null,
    },
    {
      id: "notification_dispatch_success",
      title: "Notification dispatch success",
      status: "OK",
      metric: { value: 0.997, unit: "ratio", label: "last 5m" },
      thresholds: { warn: 0.95, crit: 0.9 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "ai_provider_availability",
      title: "AI provider availability",
      status: "OK",
      metric: { value: 1, unit: "ratio", label: "last 5m" },
      thresholds: { warn: 0.98, crit: 0.9 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "deploy_attempts_strip",
      title: "Deploy attempts",
      status: "OK",
      metric: null,
      thresholds: null,
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "FILE",
      drill: null,
      reason: null,
      deployStrip: [
        {
          attemptId: "deploy-dev-001",
          startedAt: "2026-05-26T00:00:00Z",
          endedAt: "2026-05-26T00:02:00Z",
          finalStatus: "SUCCEEDED",
          imageTag: "readmates-api:dev-20260526",
          durationSeconds: 120,
        },
        {
          attemptId: "deploy-dev-000",
          startedAt: "2026-05-25T23:00:00Z",
          endedAt: "2026-05-25T23:01:30Z",
          finalStatus: "FAILED",
          imageTag: "readmates-api:previous",
          durationSeconds: 90,
        },
      ],
    },
  ],
};
```

## Task 6 — Backend Service And Contract Hardening

- [ ] Keep `PlatformAdminHealthController` response names camelCase.
- [ ] Update `PlatformAdminHealthControllerTest` to assert the complete contract:
  - `$.generatedAt`
  - `$.cards[0].lastCheckedAt`
  - `$.cards[0].drill.kind == "ADMIN_ROUTE"`
  - `$.cards[?].deployStrip[0].attemptId`
  - no assertion uses snake_case JSON paths
- [ ] Add a bounded provider executor bean in `PlatformAdminHealthConfig`.

Config shape:

```kotlin
@Bean(destroyMethod = "shutdown")
fun platformAdminHealthExecutor(): ExecutorService =
    Executors.newFixedThreadPool(
        4,
        ThreadFactory { runnable ->
            Thread(runnable, "platform-admin-health").apply { isDaemon = true }
        },
    )
```

- [ ] Inject this executor into `PlatformAdminHealthService` with `@Qualifier("platformAdminHealthExecutor")`.
- [ ] Compute providers concurrently while preserving the original `providers` list order in the resulting snapshot.
- [ ] Keep failure isolation card-local:
  - thrown provider becomes `UNKNOWN` with `reason = "provider_error"`
  - timed-out provider becomes `UNKNOWN` with `reason = "provider_timeout"`
  - other cards still render
- [ ] Use a 2500 ms timeout per provider. This can be a private constant in the service for S2H.

Service shape:

```kotlin
private fun computeCards(now: Instant): List<HealthCard> =
    providers
        .map { provider ->
            CompletableFuture
                .supplyAsync({ provider.compute() }, executor)
                .completeOnTimeout(
                    providerFailureCard(provider, now, "provider_timeout"),
                    PROVIDER_TIMEOUT.toMillis(),
                    TimeUnit.MILLISECONDS,
                )
                .exceptionally { ex ->
                    log.warn("HealthCardProvider {} threw; marking card unknown", provider.cardId, ex)
                    providerFailureCard(provider, now, "provider_error")
                }
        }
        .map { it.join() }
```

- [ ] Update `PlatformAdminHealthServiceTest`:
  - simple tests use a direct executor: `Executor { command -> command.run() }`
  - provider order/schema test still passes
  - provider exception test still yields one `UNKNOWN` card
  - refresh cache replacement test still passes
  - new concurrency test proves two blocking providers both start before either is released and the final snapshot order matches provider order
- [ ] Update the scheduled refresh test name and assertions so it matches actual behavior: provider exceptions become an unknown card and replace the cache, while unexpected refresh-level exceptions remain swallowed by `scheduledRefresh`.
- [ ] Keep Redis provider honest about its metric semantics. If it still uses the Micrometer counter total, change the label from `since boot` to `process lifetime` and assert that label in `RedisHealthCardProviderTest`. Do not describe it as a five-minute rate unless the provider actually calculates a recent window.

Concurrency test skeleton:

```kotlin
@Test
fun `refresh computes providers concurrently while preserving provider order`() {
    val executor = Executors.newFixedThreadPool(2)
    val bothStarted = CountDownLatch(2)
    val release = CountDownLatch(1)
    val service =
        PlatformAdminHealthService(
            providers =
                listOf(
                    BlockingProvider("first", bothStarted, release),
                    BlockingProvider("second", bothStarted, release),
                ),
            clock = clock,
            executor = executor,
        )

    try {
        val refresh = CompletableFuture.supplyAsync { service.refresh() }

        assertThat(bothStarted.await(1, TimeUnit.SECONDS)).isTrue()
        release.countDown()

        assertThat(refresh.get(1, TimeUnit.SECONDS).cards.map { it.id })
            .containsExactly("first", "second")
    } finally {
        executor.shutdownNow()
    }
}
```

## Task 7 — Release Note

- [ ] Add one bullet under `CHANGELOG.md` `## Unreleased` → `### Engineering`.
- [ ] Use product behavior wording, not plan wording.

Exact bullet:

```md
- Hardened `/admin/health` with a pinned camelCase snapshot contract, seven-card fixture coverage, refresh/stale UI, deploy strip rendering, and isolated provider refresh behavior.
```

Do not edit historical S2 planning notes or operational docs unless implementation changes an operator procedure beyond the screen behavior described above.

## Verification Plan

Run focused checks after each phase:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-health-card.test.tsx features/platform-admin/ui/admin-health-deploy-strip.test.tsx
pnpm --dir front exec vitest run features/platform-admin/route/admin-health-route.test.tsx features/platform-admin/ui/admin-health-grid.test.tsx
pnpm --dir front exec playwright test tests/e2e/admin-health.spec.ts --project=chromium
./server/gradlew -p server unitTest --tests "com.readmates.admin.health.application.service.PlatformAdminHealthServiceTest" --tests "com.readmates.admin.health.application.service.providers.RedisHealthCardProviderTest" --tests "com.readmates.admin.health.adapter.in.web.PlatformAdminHealthControllerTest"
git diff --check -- front/features/platform-admin/model/platform-admin-health-model.ts front/features/platform-admin/api/platform-admin-health-contracts.ts front/features/platform-admin/route/admin-health-route.tsx front/features/platform-admin/route/admin-health-route.test.tsx front/features/platform-admin/ui/admin-health-grid.tsx front/features/platform-admin/ui/admin-health-grid.test.tsx front/features/platform-admin/ui/admin-health-card.tsx front/features/platform-admin/ui/admin-health-card.test.tsx front/features/platform-admin/ui/admin-health-deploy-strip.tsx front/features/platform-admin/ui/admin-health-deploy-strip.test.tsx front/src/styles/globals.css front/tests/e2e/admin-health.spec.ts server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt server/src/main/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProvider.kt server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt server/src/test/kotlin/com/readmates/admin/health/application/service/providers/RedisHealthCardProviderTest.kt server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt CHANGELOG.md
```

Run full surface checks before claiming S2H complete:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server unitTest
./server/gradlew -p server architectureTest
pnpm --dir front test:e2e
```

Browser smoke after implementation:

```bash
pnpm --dir front dev
```

Open `http://localhost:5173/admin/health` with the dev platform-admin shortcut available in the current app. Confirm desktop and mobile:

- `Platform Health` is visible.
- Six health cards render in a styled grid.
- `최근 deploy` renders separately.
- manual refresh does not break the page.
- no `NaN` timestamp appears.
- no text overlaps at mobile width.

If the dev server chooses another port, use the actual Vite URL printed by the command.

## Out Of Scope

- No S5 `/admin/notifications` implementation.
- No new health card categories.
- No Grafana or Alertmanager integration.
- No database migration.
- No private operational logs, private domains, secrets, token-shaped examples, or real member data in fixtures or docs.
- No public-release candidate build unless implementation expands into release packaging or deploy scripts.

## Completion Criteria

- The frontend health contract uses the server's camelCase JSON shape everywhere.
- Server and frontend tests pin the same JSON fields.
- The route and E2E fixtures cover all seven S2 card slots.
- The deploy strip renders from `deployStrip` and camelCase entry fields.
- The health grid has manual refresh, stale state, and product-grade CSS.
- Provider refresh is isolated and preserves card order.
- Focused checks pass, full frontend/server checks either pass or are explicitly reported with failure evidence.
- Browser smoke verifies `/admin/health` desktop and mobile layout before S2H is called complete.
