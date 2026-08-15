# ReadMates Backend Quality Phase 1 — Notification Runtime Reliability

> **Execution:** Use subagent-driven development in this session. Run one fresh implementer and one independent reviewer per task, sequentially. Keep this plan's ledger, task briefs, reports, and review packages under the workspace returned by `scripts/sdd-workspace`.

**Goal:** Make the notification event relay and email-delivery runtime fail fast on invalid configuration, terminate expired or permanent work deterministically, expose truthful relay and delivery state, and preserve the existing outbox/claim idempotency contract without live SMTP delivery.

**Plan base:** Flyway immutability final HEAD `3d001032c4f83656a25aa1f33dbd928311abea09` plus this plan commit.

**Approved source:** `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md` §8.3, §8.4, Wave 3, validation, and final acceptance criteria.

**Architecture:** Existing notification event persistence, Kafka publication, delivery-row dedupe, `FOR UPDATE SKIP LOCKED` claims, exact `lockedAt` compare-and-set transitions, and Kafka duplicate recovery remain authoritative. Feature-owned configuration properties supply every timeout, batch, lease, retry, and deadline. Application services use one injected `Clock` value per transition. The SMTP adapter converts framework/provider failures into an application-owned bounded failure kind. Event-outbox and delivery backlog remain distinct models and metrics. Scheduling stays in an inbound scheduling adapter; application code contains no `@Scheduled` or transport exception types.

**Technology:** Kotlin 2.4, Spring Boot 4 / Spring Framework 7, Spring Kafka 4, JavaMail, JDBC/MySQL, Micrometer, JUnit 5, AssertJ, Testcontainers.

## Scope and fixed decisions

- Preserve all notification REST/BFF/frontend contracts, authorization, recipient planning, Kafka topics, event schemas, delivery dedupe keys, and database schema.
- Preserve the existing event-outbox and delivery-row claim/lease algorithms. Do not replace them with a second queue, DLT, or notification event.
- Use no Flyway migration in this plan. Both `notification_event_outbox.created_at` and `notification_deliveries.created_at` already supply the wall-clock deadline basis.
- Preserve existing retry delay defaults: `5m`, `15m`, `1h`, and `4h`; max publish and delivery attempts default to `5`.
- Default event and delivery maximum age is `24h`. At or after the exact deadline, work becomes `DEAD` before Kafka or SMTP is invoked. Before the deadline, existing attempt-based behavior remains.
- An event with a missing payload remains immediately terminal. A failed publish-state CAS after a successful Kafka send is observed as `stale_lease`; it is not reported as success.
- SMTP failures are application-owned `PERMANENT`, `RETRYABLE`, or `AMBIGUOUS` outcomes. Address/message preparation, authentication, and explicit permanent SMTP rejection become `PERMANENT`; transport/timeouts and unknown post-send acceptance become `AMBIGUOUS`; explicit transient provider rejection becomes `RETRYABLE`.
- `PERMANENT` becomes `DEAD` immediately. `RETRYABLE` and `AMBIGUOUS` retain bounded attempt/deadline retry. `AMBIGUOUS` is never described as proof that no message was accepted.
- SMTP delivery is at-least-once. A provider may accept a message before the process crashes or the `SENT` CAS commits; this plan documents that irreducible duplicate window and does not claim exactly-once email.
- `readmates.notifications.outbox.backlog{status}` means `notification_event_outbox`, with fixed `pending|failed|dead|publishing` tags.
- Add `readmates.notifications.delivery.backlog{status}` for `notification_deliveries`, with fixed `pending|failed|dead|sending` tags.
- Emit `readmates.outbox.publish{result}` so Prometheus exports `readmates_outbox_publish_total`; the only results are `success|failure|dead|missing_payload|expired|stale_lease`.
- Keep all metric tags enum/fixed-value only. Never attach exception text, email, club/member/delivery/event IDs, topic, hostname, or provider response.
- Use fake mail, local Kafka/Testcontainers, and `SimpleMeterRegistry` only. Do not send real email, call a billable provider, use real member data, or persist secrets/private domains.
- Do not push, open a PR, tag, or deploy.

## Typed configuration contract

Create feature-owned validated properties for the existing `readmates.notifications` configuration. Preserve environment compatibility where practical; when replacing an unused or misleading key, update `application.yml`, `.env.example`, deployment sync, and active docs in the same plan.

Defaults:

```text
enabled                         false (existing environment policy)
senderEmail                     required when enabled
senderName                      required when enabled
worker.enabled                  true
worker.fixedDelay               30s
worker.relayBatchSize           50
worker.deliveryBatchSize        20
worker.claimLease               15m
worker.eventMaxAge              24h
worker.deliveryMaxAge           24h
worker.retryDelays              [5m, 15m, 1h, 4h]
worker.backlogRefreshInterval   60s
worker.backlogInitialDelay      5s
kafka.sendTimeout               10s
kafka.maxPublishAttempts        5
kafka.maxDeliveryAttempts       5
kafka.deliveryRetryBackoff      5m
kafka.deliveryRetryMaxAttempts  72
smtp.connectionTimeout          5s
smtp.readTimeout                5s
smtp.writeTimeout               5s
```

Startup must fail when:

- an enabled sender email/name, bootstrap server, topic, DLT topic, or consumer group is blank;
- a duration is zero or negative;
- a batch size or maximum attempt count is outside `1..1000`;
- a retry-delay list is empty, contains a nonpositive value, or is not nondecreasing;
- event/delivery maximum age is less than the last configured retry delay;
- Kafka send timeout is greater than or equal to the claim lease;
- the sum of SMTP connection/read/write timeouts is greater than or equal to the claim lease;
- the backlog initial delay is greater than the refresh interval.

The production mail sender must receive the same validated SMTP timeout values. It is insufficient to validate one property namespace while JavaMail uses different scalar values.

## Failure and observability matrix

| Path | Deadline | Retry owner | Idempotency / lease | Terminal state | Evidence added here |
| --- | --- | --- | --- | --- | --- |
| event outbox → Kafka | `createdAt + eventMaxAge` and transport `sendTimeout` | relay service with fixed delays/attempts | existing outbox claim + exact `lockedAt` CAS | `DEAD` on expiry, missing payload, or exhaustion | deadline boundaries, publish outcome metric, real outbox/Kafka duplicate regression |
| Kafka event → delivery rows | existing consumer retry/DLT policy | Spring Kafka typed error handler | existing unique event/channel/recipient rows | existing DLT | configuration startup checks and existing Testcontainers regression only |
| delivery row → SMTP | `createdAt + deliveryMaxAge` and validated SMTP timeouts | delivery engine by bounded failure kind | existing claim + exact `lockedAt` CAS | immediate permanent/expired `DEAD`; retry exhaustion `DEAD` | fake SMTP classification, boundary clock, stale-lease, concurrent claim regression |
| operational observation | cached read only; refresh bounded by scheduling interval | scheduling adapter | current-value snapshots | last successful snapshot retained on query failure | truthful outbox/delivery gauges and publish outcomes |

---

### Task 1: Typed Notification Runtime Configuration And Mail Transport Wiring

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/application/config/NotificationRuntimeProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/config/NotificationWorkerConfiguration.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt`
- Create or modify the narrow mail configuration under `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationEventRelayScheduler.kt`
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/test/kotlin/com/readmates/notification/application/config/NotificationRuntimePropertiesTest.kt`
- Create or modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/mail/NotificationMailTransportConfigurationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapterTest.kt`
- Create or modify: `server/src/test/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationEventRelaySchedulerTest.kt`

**RED:**

1. Use `ApplicationContextRunner` to prove every invalid bound and cross-field constraint currently starts successfully or fails only at first use.
2. Configure distinct connection/read/write timeout values and inspect the production `JavaMailSenderImpl` JavaMail properties. The current application-local configuration must fail because timeout values are supplied only by external deployment sync and are not owned or validated by the feature.
3. Omit required enabled sender/Kafka fields and prove startup fails with a bounded property path, not after the first scheduled run.
4. Prove scheduler batch and fixed delay are read from typed properties and that deprecated unused `worker.batch-size` / `worker.max-attempts` values cannot silently diverge.

**GREEN:**

- Register immutable constructor-bound configuration properties and Jakarta validation or an equally fail-fast feature validator.
- Replace notification runtime scalar `@Value` injection in the touched scheduler/mail paths.
- Wire the validated SMTP values into the actual production `JavaMailSender` without duplicating credentials or replacing Boot TLS/auth behavior.
- Keep the scheduler conditional behavior and topic/group defaults unchanged.
- Remove unused configuration keys or wire them to their actual owner; do not leave two authorities for attempts or batch size.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.application.config.NotificationRuntimePropertiesTest \
  --tests com.readmates.notification.adapter.out.mail.NotificationMailTransportConfigurationTest \
  --tests com.readmates.notification.adapter.out.mail.SmtpMailDeliveryAdapterTest \
  --tests com.readmates.notification.adapter.in.scheduler.NotificationEventRelaySchedulerTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `refactor(server): type notification runtime configuration`

---

### Task 2: Deterministic Event Relay Deadline And Publish Outcomes

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
- Modify application metrics/model ports only as required to keep Micrometer out of newly extracted policy code
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationRelayServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`

**RED scenarios:**

1. Fixed `Clock` at one nanosecond before `createdAt + eventMaxAge` permits publish; exact equality becomes `DEAD` without publisher invocation.
2. Missing payload records `missing_payload`; max-attempt exhaustion records `dead`; a retryable publish error records `failure`; successful publish+CAS records `success`; successful Kafka send followed by a false publish CAS records `stale_lease`.
3. Every claimed item records exactly one fixed publish result and no exception message or ID becomes a tag.
4. One transition uses one injected instant for deadline/latency decisions; negative clock skew clamps latency to zero.
5. Existing DB mark-loss duplicate delivery test remains one logical delivery row after adding metrics/deadline policy.

**GREEN:**

- Inject `Clock` and typed properties into the relay; remove `Instant.now()` and hardcoded retry arrays/attempt coercion.
- Check the wall-clock deadline before payload load/publish and persist a bounded safe terminal reason.
- Emit the fixed publish-result metric from one application-owned metrics boundary.
- Preserve the exact `lockedAt` CAS and existing Kafka dedupe behavior.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.application.service.NotificationRelayServiceTest \
  --tests com.readmates.notification.application.service.ReadmatesOperationalMetricsTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `fix(server): bound notification event relay lifetime`

---

### Task 3: Application-Owned SMTP Failure Classification And Delivery Deadline

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/MailDeliveryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngine.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryClaimOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/mail/SmtpMailDeliveryAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngineTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapterTest.kt`

**RED scenarios:**

1. Address/message preparation, authentication, and explicit permanent SMTP rejection are application-owned `PERMANENT` failures and become `DEAD` on the first attempt.
2. Explicit transient rejection is `RETRYABLE`; timeout/connection-loss after send begins is `AMBIGUOUS`; both follow the configured retry schedule and attempt ceiling.
3. Raw provider exception text, response text, email address, and stack-trace content never enter error state, logs, or metric labels.
4. Fixed `Clock` one nanosecond before `createdAt + deliveryMaxAge` permits the fake mail call; exact equality becomes `DEAD` without a mail call.
5. A false status CAS after provider success/failure still raises the existing stale-lease error; metrics never claim a terminal transition that did not commit.
6. Existing concurrent claim, expired lease reclaim, and retry-to-DEAD Testcontainers cases remain green.

**GREEN:**

- Add a bounded application-owned mail failure type/kind to the output-port contract; no Spring Mail or Jakarta Mail types cross into application packages.
- Map known safe exception structures in the SMTP adapter. Unknown transport acceptance is `AMBIGUOUS`, not permanent.
- Add delivery `createdAt` to the claimed application model and JDBC mapper; do not change schema.
- Inject `Clock` and typed configuration into the engine. Check deadline before constructing/sending mail and use the configured attempts/delays without coercion fallbacks.
- Keep `SENT`, `FAILED`, and `DEAD` exact-lease CAS semantics and existing metric increments.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.adapter.out.mail.SmtpMailDeliveryAdapterTest \
  --tests com.readmates.notification.application.service.NotificationDeliveryEngineTest \
  --tests com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `fix(server): classify terminal notification delivery failures`

---

### Task 4: Truthful Event-Outbox And Delivery Backlog Observation

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/in/NotificationBacklogUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventOutboxBacklogPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/CachedNotificationBacklogProvider.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationBacklogRefreshScheduler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
- Create or modify narrow event-outbox backlog SQL helper under the same persistence package
- Modify: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/observability/MicrometerPlatformAdminHealthLocalReadingsAdapter.kt` only if its metric lookup contract requires a source-grounded change
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/CachedNotificationBacklogProviderTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetricsTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationBacklogRefreshSchedulerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**RED scenarios:**

1. Seed event-outbox and delivery rows with different status counts. Prove `readmates.notifications.outbox.backlog` currently reports delivery counts and cannot expose a dead relay before delivery rows exist.
2. Assert exact event tags `pending|failed|dead|publishing` and delivery tags `pending|failed|dead|sending`; no cross-population and no extra status/tag.
3. A persistence query failure preserves the last successful cached values and emits a bounded observation-failure signal; it must not publish a false zero.
4. Scheduler depends only on a refresh input port, uses typed interval/initial delay, and application packages contain no `@Scheduled`.
5. Source-driven inbound registry and architecture rules cover the new scheduling adapter and prohibit Micrometer/scheduling imports from notification application policy packages.
6. Admin health's notification backlog reading still resolves the event-outbox metric intended by the SLO.

**GREEN:**

- Introduce separate event-outbox and delivery backlog models/ports/snapshots.
- Query `notification_event_outbox` for the outbox gauge and retain `notification_deliveries` under the new delivery gauge.
- Move refresh scheduling into an inbound adapter behind a narrow input port. Application service owns only last-success snapshot state.
- Fail open to the exact last successful snapshot on query error, with an observable fixed result; never overwrite it with zero.
- Register the new inbound package only if source-driven architecture inventory requires it. Preserve the approved architecture seed and use current→retired identity movement for any removed boundary row.

**Focused GREEN:**

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.notification.application.service.CachedNotificationBacklogProviderTest \
  --tests com.readmates.notification.application.service.ReadmatesOperationalMetricsTest \
  --tests com.readmates.notification.adapter.in.scheduler.NotificationBacklogRefreshSchedulerTest \
  --tests com.readmates.admin.health.adapter.out.observability.MicrometerPlatformAdminHealthLocalReadingsAdapterTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --tests com.readmates.architecture.ServerArchitectureInventoryTest \
  --rerun-tasks --no-build-cache --no-configuration-cache
```

**Commit:** `feat(server): expose truthful notification pipeline state`

---

### Task 5: Operations Configuration, Alerts, And Residual-Risk Contract

**Files:**

- Modify: `.env.example`
- Modify: `.github/workflows/sync-config.yml`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/operations/runbooks/secrets-management.md`
- Modify: `docs/operations/observability/metrics-catalog.md`
- Modify: `docs/operations/observability/dashboards.md`
- Modify: `docs/operations/observability/alerts.md`
- Modify: `docs/operations/observability/slos.md`
- Modify: `docs/operations/observability/operator-guide.md`
- Modify: `docs/operations/runbooks/correlation-id-lookup.md`
- Modify: `ops/prometheus/alerts/notification-rules.yml`
- Modify: `ops/grafana/dashboards/notification-dispatch.json`
- Modify: `server/src/main/resources/slo/slos.yaml`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`
- Modify public-release fixture allowlists only if an existing required-file contract rejects these already-public paths

**RED:**

- Add focused source/config fixtures or scans proving `.env.example`, sync workflow, application defaults, and deploy docs currently disagree on SMTP read timeout and omit feature-owned validation values.
- Prove the current dashboard/SLO query references a counter the application does not emit.
- Prove current alerts call delivery rows an outbox and therefore cannot detect an event relay blocked before delivery creation.

**GREEN:**

- Align public-safe environment examples, deployment sync, application defaults, and docs to the same validated timeout/runtime values without adding credentials or private endpoints.
- Update dashboards/SLO/alerts to the now-emitted `readmates_outbox_publish_total` and truthful event/delivery backlog gauges. Preserve the SLO objective unless evidence requires only a denominator safety guard.
- Document retry exhaustion, event/delivery deadlines, immediate permanent failure, ambiguous SMTP acceptance, at-least-once duplicate window, exact operator evidence, and safe recovery steps.
- State explicitly that a stronger exactly-once mail guarantee requires a provider API with an idempotency key/receipt and is outside this approved slice.
- Update `CHANGELOG.md` under Unreleased. Do not create a version file or release tag.

**Focused GREEN:**

```bash
git diff --check -- .env.example .github/workflows/sync-config.yml docs ops server/src/main/resources
bash -n <(sed -n '/run: |/,$p' .github/workflows/sync-config.yml) 2>/dev/null || true
./scripts/verify-public-release-fixtures.sh
```

Use repository-provided YAML/JSON/shell validation commands discovered from the active guides; do not treat the illustrative process-substitution line as the sole workflow validation.

**Commit:** `docs(ops): record notification failure contract`

---

### Task 6: Plan Closeout And Canonical Verification

**Files:**

- Modify only factual drift found in the planned documentation files above.
- Write the ignored Task 6 report and update the plan ledger; do not commit SDD artifacts.

**Review before gates:**

- Verify existing duplicate-event, concurrent claim, expired-lease reclaim, retry exhaustion, Kafka DLT, and publish-mark-loss tests still exercise their load-bearing assertions.
- Verify no test weakens attempt ceilings, lease CAS, architecture seeds, baselines, or suppressions.
- Verify no live mail sender/provider, real address, private domain, token-shaped value, or local absolute path entered tracked files or emitted reports.
- Verify the documented failure matrix answers timeout/deadline, retry classification, idempotency, lease, exhaustion/recovery, and observation for both relay and SMTP paths.

**Canonical gates, sequentially at final HEAD:**

```bash
./server/gradlew -p server compileKotlin --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --rerun-tasks --no-build-cache --no-configuration-cache
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Frontend E2E is not required because this plan preserves REST/BFF/frontend and authorization contracts. If implementation evidence shows any API/auth contract changed, stop that change, restore the contract, or add the exact frontend contract/E2E gate before closeout.

**Commit:** Create a narrow factual-doc correction commit only when required; otherwise Task 6 is verification/report-only.

## Plan-level review contract

After every task's implementer and reviewer approve, generate one review package from the plan-base commit through final HEAD and request an independent `gpt-5.6-sol` reviewer with `reasoning=high` or stronger. The reviewer must issue separate verdicts for spec compliance, code quality, and readiness for the next plan.

Review at minimum:

- deadline boundary and one-Clock transition semantics;
- permanent/retryable/ambiguous classification and sanitized failure evidence;
- exact claim/lease CAS and duplicate Kafka behavior;
- no false success after a stale CAS;
- no false-zero backlog on persistence failure;
- metric meaning, result cardinality, SLO/dashboard/alert agreement;
- startup validation and actual JavaMail timeout wiring;
- architecture direction and scheduling ownership;
- no baseline/allowlist/suppression growth;
- public-repository and release-candidate safety;
- SMTP accepted-before-commit residual stated without an exactly-once claim.

Bundle material findings into one fresh-implementer correction wave, rerun all relevant focused and canonical gates, and request re-review. Do not begin the admin replay plan until this plan is approved and the worktree is clean.

## Acceptance mapping

- **Async/cache/provider row:** fake mail, local Kafka/Testcontainers, deadline, retry classification, duplicate delivery, lease CAS, terminal failure, and observable recovery evidence.
- **Persistence/transaction row:** existing outbox/delivery claim and duplicate behavior are regression-tested; no migration is added.
- **Operations/public release row:** runtime configuration, metrics, alerts, dashboards, SLO, operator contract, release-candidate scan.
- **Architecture row:** scheduling inbound adapter and application-owned failure types; no transport exception leakage.
- **Auth/API/frontend rows:** excluded because public and authorization contracts remain unchanged.

## Explicit residual and excluded scope

- SMTP accepted-before-`SENT`/commit can cause a duplicate after lease reclaim; a provider idempotency API is required to close it.
- Admin notification replay preview/confirm atomicity is a separate following plan and reserves V48.
- AI Kafka generic exhaustion, Redis clock/config, restart recovery, and queue false-zero are a separate following plan.
- Public cache invalidation fail-open can expose stale public summaries until TTL; stronger invalidation requires a separate approved design.
- Rate-limit fail-open is an existing explicit policy, not changed here.
- Global notification replay batch/retention policy, malformed AI record DLT, remote Alertmanager routing, live SMTP delivery, and production mutation are excluded.
