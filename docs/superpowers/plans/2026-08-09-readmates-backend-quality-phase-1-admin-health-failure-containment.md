# ReadMates Backend Quality Phase 1 — Admin Health Failure Containment

> **Execution:** Use subagent-driven development in this session. Run one implementer and one independent reviewer per task, sequentially. Keep the plan-specific ledger and reports under the workspace returned by `scripts/sdd-workspace`.

**Goal:** Prevent a hung or degraded health provider from exhausting request threads or the health executor while preserving an observable last-known-good admin snapshot and deterministic recovery.

**Plan base:** Phase 0 final HEAD `eebc8f3a32eeaff45705cfaeabdb1d454c329a83` plus this plan commit.

**Approved source:** `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md` §8.1, §8.4, Wave 2, validation, and final acceptance criteria.

**Architecture:** The admin-health application service owns single-flight refresh coordination and immutable snapshot state. Web and scheduling inbound adapters depend only on application input ports. A dedicated bounded executor isolates provider work. Prometheus uses an actual timeout-configured HTTP request factory. Application-owned failure types and metrics ports prevent adapters from leaking into the application layer. The existing v1 response remains backward compatible and gains additive refresh metadata consumed by the platform-admin frontend.

**Technology:** Kotlin 2.4, Spring Boot 4 / Spring Framework 7, Apache HttpClient 5 through `HttpComponentsClientHttpRequestFactory`, Micrometer, JUnit 5, AssertJ, React/Vite, TanStack Query, Vitest, Playwright.

## Scope and fixed decisions

- Preserve `GET /api/admin/health/snapshot`, its platform-admin authorization, all existing card identifiers, and existing response fields.
- Add only these v1 response fields: `lastSuccessfulAt`, `refreshState`, and `staleAgeSeconds`.
- `refreshState` values are `FRESH`, `REFRESHING`, `STALE`, and `UNAVAILABLE`.
- A refresh is successful when every provider invocation completes without timeout, rejection, or uncaught exception. A provider may legitimately return an `UNKNOWN` card and still count as a successful invocation.
- After a previous successful refresh, any failed refresh returns the whole previous last-known-good snapshot with `STALE`; partial new cards never overwrite it.
- Before the first success, failed providers become deterministic `UNKNOWN` cards while successful providers remain visible and the response is `UNAVAILABLE`.
- `generatedAt` remains the creation time of the visible card snapshot. `lastSuccessfulAt` records the last fully completed provider wave. `staleAgeSeconds` is derived from injected `Clock` and never negative.
- A stale cached read starts one lazy refresh and returns immediately. The first ever read waits only for the single-flight future, whose provider futures are bounded by the logical deadline or fast rejection.
- Scheduled and lazy triggers share the same in-flight future. Late completion of a logically timed-out supplier cannot mutate state.
- The executor uses no caller-runs policy. Queue saturation is converted to a typed rejected provider result.
- Metrics use only fixed provider card IDs and enums as tags; never URLs, exception messages, paths, user IDs, club IDs, job IDs, or deployment data.
- Do not call a live provider, send email, use production data, push, create a PR, tag, deploy, or change Flyway migrations.

## Typed configuration contract

Create `PlatformAdminHealthProperties` with prefix `readmates.admin.health` and these defaults:

```text
refreshInterval       10s
freshness             30s
providerDeadline      2500ms
executor.threads      4
executor.queueCapacity 16
executor.shutdownAwait 5s
prometheus.baseUrl    http://prometheus:9090
prometheus.connectTimeout 500ms
prometheus.connectionRequestTimeout 500ms
prometheus.readTimeout 2000ms
```

Fail application startup when:

- any duration is zero or negative;
- threads is outside `1..16`;
- queue capacity is outside `1..1024`;
- refresh interval is greater than or equal to freshness;
- Prometheus connect, connection-request, or read timeout exceeds the provider deadline;
- the Prometheus base URL is not absolute `http` or `https`.

## Metrics contract

Expose:

```text
readmates.admin.health.provider.outcomes{provider,result}
  result = SUCCESS | ERROR | TIMEOUT | REJECTED
readmates.admin.health.refresh.overlap{trigger}
  trigger = LAZY | SCHEDULED
readmates.admin.health.refresh.duration{result}
  result = FRESH | STALE | UNAVAILABLE
readmates.admin.health.snapshot.stale.age.seconds
```

The stale-age metric is a current-value gauge updated from the application metrics port. Counters and timers have no unbounded tags.

---

### Task 1: Typed Configuration And Real Prometheus Transport Timeouts

**Files:**
- Modify: `server/build.gradle.kts`
- Create: `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/port/out/PrometheusQueryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/AiProviderAvailabilityCardProvider.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/KafkaLagHealthCardProvider.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/NotificationDispatchSuccessCardProvider.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/config/PlatformAdminHealthPropertiesTest.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/config/PlatformAdminHealthTransportConfigTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapterTest.kt`
- Modify: the three provider tests matching the production providers above
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt` only if a focused removal fixture is required; do not change approved seeds.

**RED:**

1. Add parameterized property tests for every invalid bound and cross-field constraint. Run them against the current scalar `@Value` configuration and capture missing typed binding/validation failures.
2. Start a local public-safe HTTP server that accepts the Prometheus request but withholds the body. Construct the adapter through the production configuration and assert it throws an application-owned `PrometheusQueryException(kind=TIMEOUT)` inside the configured read timeout and before the provider deadline. The current unused timeout must fail this test.
3. Prove HTTP 5xx, invalid Prometheus status/body, and connection failures map to bounded application-owned failure kinds without response bodies in messages.
4. Change the three application providers to expect an application-owned port exception rather than the adapter exception; capture the architecture/source failure before GREEN.

**GREEN:**

- Add managed Apache HttpClient 5 only if it is not already on the production classpath.
- Build a closeable client/request factory with actual connect, connection-request, and read/response timeouts from typed properties.
- Remove the unused `requestTimeout` field and both timeout suppressions.
- Move the typed Prometheus failure contract into `application.port.out`; the adapter maps transport/framework exceptions to it, and provider application code no longer imports `adapter.out`.
- Remove the three obsolete provider-to-adapter rows from the current boundary baseline and append those exact identities to the retired boundary ledger. Keep the approved seed fixed.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.admin.health.config.PlatformAdminHealthPropertiesTest \
  --tests com.readmates.admin.health.config.PlatformAdminHealthTransportConfigTest \
  --tests com.readmates.admin.health.adapter.out.prometheus.HttpPrometheusQueryAdapterTest \
  --tests 'com.readmates.admin.health.application.service.providers.*' \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerArchitectureInventoryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `feat(server): bound admin health transport`

---

### Task 2: Bounded Health Executor And Lifecycle

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/config/PlatformAdminHealthExecutorTest.kt`

**RED:**

- Configure one worker and one queued task, block both slots, submit a third task, and assert immediate `RejectedExecutionException` without running on the submitting thread.
- Assert worker names have the `platform-admin-health-` prefix and distinct suffixes.
- Assert configured core/max threads, queue capacity, daemon policy, graceful shutdown wait, and no caller-runs handler.
- Prove invalid executor properties fail before bean creation.

**GREEN:**

- Replace `newFixedThreadPool` and its unbounded queue with a configured `ThreadPoolTaskExecutor` or equally explicit bounded executor.
- Use equal core/max size, fixed queue capacity, an abort/reject policy, distinct thread names, wait-for-tasks shutdown, and bounded await termination.
- Expose it under the existing `platformAdminHealthExecutor` qualifier; do not share it with request handling, Kafka, mail, or AI work.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.admin.health.config.PlatformAdminHealthExecutorTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `feat(server): bound admin health executor`

---

### Task 3: Single-Flight Refresh And Last-Known-Good State

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/port/in/PlatformAdminHealthUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/PlatformHealthRefreshState.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/model/PlatformHealthView.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/application/port/out/PlatformAdminHealthMetricsPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`
- Modify: `server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt` only if a focused removal fixture is required.

**RED scenarios:**

1. Twenty concurrent lazy/scheduled refresh calls share one provider wave and the same future.
2. A stale cached read starts a refresh but returns the last-known-good snapshot without waiting.
3. One provider hangs past the logical deadline while another succeeds. After an earlier full success, the entire earlier snapshot remains visible as `STALE`.
4. Before any full success, the same failure returns successful cards plus deterministic `UNKNOWN` failure cards and `UNAVAILABLE`.
5. Queue rejection is handled synchronously per provider and never escapes to the request thread.
6. A late supplier completion after logical timeout cannot replace state.
7. A failed in-flight future is cleared by compare-and-set; the next refresh can recover to `FRESH` and advances `lastSuccessfulAt`.
8. `staleAgeSeconds` uses injected `Clock`, is deterministic at the expiry boundary, and never becomes negative.
9. Controller depends on the read input port and preserves the existing v1 JSON fields before Task 5 adds metadata.

**GREEN:**

- Replace the snapshot-only atomic cache with one immutable application-owned state and an `AtomicReference` to the exact in-flight future.
- Model provider execution as typed success/error/timeout/rejected results. Logical timeout completes the result but does not pretend to cancel the supplier.
- On full success, atomically install a new last-known-good snapshot. On failure, preserve the earlier full snapshot; only the no-success-yet case builds the deterministic unavailable snapshot.
- Clear in-flight with `compareAndSet(exactFuture, null)` in completion cleanup.
- Make the service implement input ports. Remove `@Scheduled` from the application service.
- Change the controller to depend on the read port, retiring the exact controller-to-concrete-service baseline row.
- Keep the external response shape unchanged in this Task.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.admin.health.application.service.PlatformAdminHealthServiceTest \
  --tests com.readmates.admin.health.adapter.in.web.PlatformAdminHealthControllerTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerArchitectureInventoryTest \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `feat(server): isolate admin health refreshes`

---

### Task 4: Scheduling Adapter And Observable Refresh Metrics

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/health/adapter/in/scheduling/PlatformAdminHealthRefreshScheduler.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/observability/MicrometerPlatformAdminHealthMetricsAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/port/out/PlatformAdminHealthMetricsPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/adapter/in/scheduling/PlatformAdminHealthRefreshSchedulerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/admin/health/adapter/out/observability/MicrometerPlatformAdminHealthMetricsAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthServiceTest.kt`

**RED:**

- Scheduler invokes only the refresh input port with `SCHEDULED`, returns without waiting for provider completion, and records/logs completion failure without throwing through the scheduler thread.
- The source-driven architecture registry fails when the new scheduling inbound root exists but is not registered.
- `SimpleMeterRegistry` tests assert the exact metric names and bounded tag sets for timeout, rejection, overlap, duration, and stale age.
- Service tests assert one metric event per provider result, one overlap event per joined trigger, one duration per actual wave, and a current stale-age gauge update.

**GREEN:**

- Move scheduling ownership into `adapter.in.scheduling` and register that root in `serverSlices`.
- Implement Micrometer behind the application metrics port. Cache fixed meters or otherwise prevent duplicate/unbounded registration.
- Use only fixed provider IDs and enums as tags.
- Keep application packages free of Micrometer and scheduling annotations.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.admin.health.adapter.in.scheduling.PlatformAdminHealthRefreshSchedulerTest \
  --tests com.readmates.admin.health.adapter.out.observability.MicrometerPlatformAdminHealthMetricsAdapterTest \
  --tests com.readmates.admin.health.application.service.PlatformAdminHealthServiceTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `feat(server): observe admin health refreshes`

---

### Task 5: Additive API Metadata And Frontend Failure State

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthController.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/health/adapter/in/web/PlatformAdminHealthControllerTest.kt`
- Modify: `front/features/platform-admin/model/platform-admin-health-model.ts`
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- Modify: `front/features/platform-admin/route/admin-health-route.tsx`
- Modify: `front/features/platform-admin/route/admin-health-route.test.tsx`
- Modify: `front/tests/e2e/admin-health.spec.ts`

**RED:**

- Server MockMvc contract requires additive `lastSuccessfulAt`, `refreshState`, and `staleAgeSeconds`, including null last-success for `UNAVAILABLE` and deterministic stale age.
- Frontend type/tests require `FRESH`, `REFRESHING`, `STALE`, and `UNAVAILABLE` copy driven by server metadata, not TanStack `dataUpdatedAt`.
- Refresh button refetch remains safe and cannot claim freshness merely because HTTP returned a cached stale snapshot.
- E2E fixtures render stale age, refreshing, and no-success failure states while preserving all existing cards and authorization behavior.

**GREEN:**

- Flatten view metadata into additive v1 response fields; preserve `schema`, `generatedAt`, and `cards` unchanged.
- Remove the frontend-local 30-second staleness decision. Render the server state and stale age; use query `isFetching` only as a transport hint, never as proof of backend freshness.
- Keep the existing GET/refetch behavior and all platform-admin permissions.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.admin.health.adapter.in.web.PlatformAdminHealthControllerTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
corepack pnpm --dir front test -- \
  features/platform-admin/ui/admin-health-grid.test.tsx \
  features/platform-admin/route/admin-health-route.test.tsx
corepack pnpm --dir front test:e2e -- tests/e2e/admin-health.spec.ts
```

If `corepack` is unavailable, use `npx --yes corepack@0.35.0` with the same pnpm arguments and record the exact fallback.

**Commit:** `feat(admin): expose health refresh state`

---

### Task 6: Active Documentation, Operator Evidence, And Canonical Closeout

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/operations/observability/metrics-catalog.md`
- Modify: `docs/operations/observability/operator-guide.md`
- Modify: `CHANGELOG.md`

**Required documentation:**

- Typed property names, defaults, bounds, and startup-failure behavior.
- Actual connect/connection-request/read timeout ownership.
- Dedicated bounded executor, no caller-runs, single-flight, and exact shutdown policy.
- Last-known-good and initial-unavailable behavior.
- Metric names, meanings, units, and bounded tag values.
- The scheduling adapter and input-port direction.
- Additive admin API metadata and frontend semantics.
- No external API removal, authorization change, schema migration, live provider, or email behavior change.

**Canonical verification:**

```bash
./server/gradlew -p server compileKotlin \
  --rerun-tasks --no-build-cache --no-configuration-cache --no-daemon
./server/gradlew -p server architectureTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: production warnings remain zero; all server and frontend gates pass; the full Testcontainers and E2E lanes use local/fake infrastructure; public-release scanning finds no leaks; worktree is clean.

**Commit:** `docs: record admin health failure containment`

---

## Plan-wide review contract

After every Task, require explicit task-review verdicts for spec compliance and code quality. After Task 6, request a strongest-model whole-plan review over this plan base through final HEAD. It must inspect:

- real transport timeouts rather than logical fallback alone;
- queue bounds, rejection propagation, shutdown, and thread ownership;
- single-flight CAS/cleanup and late-completion races;
- last-known-good, no-success, stale-age, and recovery semantics;
- transaction absence on the read-only service;
- metric cardinality and operational meaning;
- input-port and scheduling adapter direction;
- API/frontend backward compatibility and authorization;
- architecture baseline removals and matching tombstones;
- test capability to reproduce hung transport, saturation, overlap, stale fallback, and recovery;
- public-repository safety and final verification evidence.

Any material finding gets one bundled fix wave, focused regression, canonical rerun, and scoped re-review. Do not begin the Flyway plan while a load-bearing health finding remains open.
