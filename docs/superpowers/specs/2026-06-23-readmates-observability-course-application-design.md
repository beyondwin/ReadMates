# ReadMates Observability Course Application Design

- Status: Approved
- Author: Codex
- Date: 2026-06-23
- Related code/docs:
  - `server/src/main/resources/application.yml`
  - `server/src/main/resources/logback-spring.xml`
  - `server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt`
  - `docs/operations/observability/`
  - `docs/operations/runbooks/`
  - `scripts/observability-local-smoke.sh`

## 1. Goal

Apply the public logging and monitoring course concepts to ReadMates without introducing a new logging platform in this phase.

The outcome is a practical ReadMates observability package that helps operators:

1. trace incidents from symptoms to likely cause,
2. validate observability risk before and after deploys,
3. understand logs, metrics, dashboards, alerts, and SLOs in junior-friendly terms,
4. map the course concepts to real ReadMates code, docs, and local commands.

This is primarily a documentation, runbook, and verification-gate design. Code instrumentation is only included later if the implementation plan finds a concrete gap in the existing behavior.

## 2. Current Context

ReadMates already has a working observability foundation:

- Spring Boot Actuator exposes Prometheus metrics at the management endpoint `/actuator/prometheus`.
- Management server binding is controlled by `READMATES_MANAGEMENT_ADDRESS` and `READMATES_MANAGEMENT_PORT`, with a loopback-only default.
- `RequestIdFilter` accepts or generates `X-Readmates-Request-Id`, binds it to MDC key `requestId`, returns it in the response header, and clears MDC after the request.
- `logback-spring.xml` emits structured JSON console logs through `LogstashEncoder`.
- JSON logs include selected MDC fields: `requestId`, `clubSlug`, `sessionId`, `actorId`, `source`, and `eventType`.
- `ApiErrorResponse` includes `traceId` from the same request MDC.
- Notification outbox and Kafka paths already preserve request correlation for relevant asynchronous work.
- Prometheus alert rules and Grafana dashboards are kept as repo files under `ops/prometheus/alerts/` and `ops/grafana/dashboards/`.
- Observability docs already describe metrics, dashboards, alerts, SLOs, and bootstrap procedures.
- `scripts/observability-local-smoke.sh` checks local Prometheus readiness, rule loading, readmates-server target registration, and Grafana dashboard provisioning.

The main missing product is not raw instrumentation. It is an operator-ready path that connects these pieces into incident response, deploy verification, and course-style learning.

## 3. Scope

### 3.1 In Scope

- Strengthen the observability entry point so operators know where to start.
- Add a ReadMates-specific course mapping guide for:
  - Logback,
  - MDC and request ID,
  - Actuator,
  - Prometheus,
  - Grafana,
  - alert rules,
  - SLOs,
  - ELK/Kibana as a concept and future option.
- Improve incident tracing guidance around `requestId`, Grafana symptoms, Prometheus metrics, JSON logs, outbox rows, Kafka, and admin health signals.
- Add or update a deploy observability check runbook that separates:
  - checks possible without a running Spring server,
  - checks requiring local Spring management port,
  - checks that only prove local provisioning,
  - checks that do not prove production health.
- Preserve public-repo safety and avoid real operational data.
- Keep the design compatible with current architecture and docs source-of-truth ordering.

### 3.2 Out of Scope

- Deploying Elasticsearch, Logstash, Kibana, OpenSearch, Loki, or any other central log store.
- Adding real production domains, member data, emails, tokens, OCIDs, private deployment state, or provider credentials to docs.
- Adding new Prometheus metrics just to mirror course examples.
- Changing alert thresholds without current operational evidence.
- Changing production deployment topology.
- Treating passing tests or local smoke checks as proof that production has no operational risk.

## 4. Architecture

The applied architecture keeps the existing ReadMates flow:

```text
Spring Boot
  -> Logback JSON logs + MDC requestId
  -> Actuator /actuator/prometheus
  -> Prometheus scrape
  -> Grafana dashboards / Prometheus alert rules
  -> runbooks and scripts for incident response and deploy checks
```

ELK/Kibana is documented as a course concept, not as a committed ReadMates runtime dependency. ReadMates is already prepared to feed a later log search system because server logs are structured JSON and carry a safe correlation ID. A future phase can choose OCI Logs, Loki, ELK, or OpenSearch after cost, retention, access control, and operational ownership are explicit.

## 5. Components

### 5.1 Log Correlation

ReadMates maps the course's "MDC logging filter with UUID" concept to `RequestIdFilter`.

The guide should explain:

- `X-Readmates-Request-Id` is the external correlation handle.
- MDC `requestId` is the server-side logging context.
- The response header lets a reported failure include a lookup key.
- JSON logs expose `requestId` without exposing private request details.
- Asynchronous notification paths can preserve correlation through outbox and Kafka when the original request produces notification work.

The runbook should show a public-safe example:

```bash
journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<request-id>")'
```

### 5.2 Metrics Exposure

ReadMates maps the course's Actuator and Prometheus sections to:

- `management.endpoints.web.exposure.include=health,prometheus`,
- `management.server.address`,
- `management.server.port`,
- `management.metrics.tags.application`,
- `docs/operations/observability/metrics-catalog.md`.

The guide should distinguish:

- logs answer "what happened?",
- metrics answer "how is the system behaving?",
- DB row queries answer "what does the source of truth say?",
- admin health cards aggregate selected operator-facing signals.

Metric examples must use existing low-cardinality labels and repeat the existing tag policy: never put user IDs, member IDs, club IDs, session IDs, email, raw tokens, transcript text, or private document body into metric labels.

### 5.3 Dashboards And Alerts

ReadMates maps the course's Grafana and alerting sections to:

- dashboard JSON under `ops/grafana/dashboards/`,
- Prometheus rules under `ops/prometheus/alerts/`,
- human-facing docs under `docs/operations/observability/dashboards.md` and `alerts.md`,
- local smoke via `scripts/observability-local-smoke.sh`.

The implementation plan should prefer explaining existing dashboards and rules before adding new ones. If a rule has a missing or placeholder runbook link, the plan may add a public-safe runbook stub only when it materially improves operator flow.

### 5.4 Deploy Observability Checks

The deploy check runbook should split checks into three groups.

Checks that do not require a running Spring server:

```bash
./scripts/validate-prometheus-rules.sh
./scripts/lint-grafana-dashboards.sh
git diff --check -- <changed-docs>
```

Checks that can run against local Prometheus/Grafana provisioning:

```bash
./scripts/observability-local-smoke.sh
```

Targeted server behavior checks when docs describe request correlation behavior:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.observability.RequestIdFilterTest --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

The runbook must state what each command proves and what it does not prove. For example, local Grafana provisioning proves dashboard files can load locally; it does not prove production Grafana is deployed, reachable, or wired to the same data source.

### 5.5 Course Mapping Guide

The guide should be written as a practical bridge from the course to this repo:

| Course concept | ReadMates mapping |
| --- | --- |
| Logback | `logback-spring.xml` with JSON console logs |
| MDC UUID filter | `RequestIdFilter` and `X-Readmates-Request-Id` |
| Actuator health | management `/actuator/health` |
| Actuator Prometheus metrics | management `/actuator/prometheus` |
| Prometheus scrape | `ops/observability/local/prometheus.yml` and deploy Prometheus config |
| Grafana dashboard | `ops/grafana/dashboards/*.json` |
| Alerting | `ops/prometheus/alerts/*.yml` |
| ELK/Kibana | future central log search option; not deployed in this phase |

Each section should include:

- the real file or command,
- what to inspect,
- the expected public-safe shape of output,
- a common beginner misunderstanding,
- a short "when you are debugging" note.

## 6. Incident Flow

The incident flow should stay concrete:

1. Confirm the symptom in Grafana or Prometheus.
2. Identify the affected surface: HTTP route, notification pipeline, Redis/cache, AI generation, DB/Hikari, JVM, or deploy target.
3. Use `requestId`, time window, route, event type, or outbox status to inspect logs and rows.
4. Check SLO and alert context to estimate severity and duration.
5. Apply a fix or rollback using the relevant operational process.
6. Re-run the observability checks that match the changed surface.
7. Record what remains unproven, especially production-only checks.

This flow deliberately separates symptom confirmation from root-cause tracing. A high 5xx rate is a symptom. A SQL timeout in logs or a persistent Hikari pending connection signal is stronger root-cause evidence.

## 7. Error Handling And Safety

The docs and examples must follow these rules:

- Use placeholders such as `<request-id>`, `https://api.example.com`, and `host@example.com`.
- Do not include real member data, private club names, private domains, OCIDs, deployment state, local absolute paths, credentials, or token-shaped examples.
- Do not claim local smoke checks prove production health.
- Do not claim tests prove no operational risk remains.
- Mark ELK/Kibana as a future option unless a later approved plan explicitly adopts it.
- Keep metric labels low-cardinality and public-safe.

## 8. Deliverables

The implementation plan should create or update a narrow set of docs, likely:

- `docs/operations/observability/README.md`
- `docs/operations/observability/lecture-guide.md`
- `docs/operations/runbooks/correlation-id-lookup.md`
- `docs/operations/runbooks/deploy-observability-check.md`
- targeted references from `metrics-catalog.md`, `alerts.md`, `slos.md`, or `dashboards.md` only when links or statements need alignment

The plan may also add small validation improvements if current scripts already exist but docs cannot be verified reliably. Any such script/test change must stay scoped to observability validation.

## 9. Verification Plan

Minimum verification after the implementation plan is executed:

```bash
git diff --check -- <changed-docs>
./scripts/validate-prometheus-rules.sh
./scripts/lint-grafana-dashboards.sh
```

Run when Docker and local ports are available:

```bash
./scripts/observability-local-smoke.sh
```

Run when docs describe request correlation or logback behavior in detail:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.observability.RequestIdFilterTest --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

Run a targeted public-safety scan over changed docs for:

- token-shaped examples,
- private domains,
- OCIDs,
- real emails,
- local absolute paths,
- secrets or credential placeholders that look real.

## 10. Risks

- **Scope creep into log platform deployment**: ELK/Kibana is attractive because the course covers it, but it changes infra, cost, access control, and retention. Keep it as a follow-up option.
- **Docs drift from code**: Every behavior claim must cite current config, code, scripts, or existing docs.
- **Metric noise**: Adding custom metrics without a clear operational question can create storage and alert fatigue. Prefer documenting existing metrics first.
- **False confidence**: Local smoke checks and passing tests are evidence, not proof. The docs must preserve this distinction.
- **Public-repo leakage**: Operational docs are high risk for accidental private details. Use placeholders and scans.

## 11. Open Questions For Implementation Planning

- Should the course guide live directly under `docs/operations/observability/lecture-guide.md`, or should it use a shorter title such as `course-map.md`?
- Should deploy observability checks be a standalone runbook or a section inside the bootstrap runbook?
- Which existing alert rules still have missing or placeholder runbook links that are worth addressing in this phase?
- Can `observability-local-smoke.sh` run in the current developer environment, or should it be documented as optional Docker-dependent verification?

## 12. Next Step

After this design is reviewed, invoke the writing-plans workflow to produce an implementation plan. The plan should turn the deliverables above into file-by-file tasks with exact verification commands and public-safety checks.
