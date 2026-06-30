# ReadMates Production Observability v1 Design

작성일: 2026-06-30
상태: APPROVED DESIGN SPEC
대상 표면: OCI observability compose, Prometheus/Grafana/Alertmanager operations, observability runbooks

## 1. 배경

ReadMates는 이미 Spring Boot Actuator, Micrometer Prometheus registry, JSON structured log, `requestId` correlation, Prometheus alert rules, Grafana dashboard JSON, SLO 문서, `/admin/health` 운영 화면을 가지고 있다. 따라서 운영 관측성의 핵심 문제는 새 관측성 체계를 고르는 것이 아니라, 기존 Prometheus/Grafana/Alertmanager 자산을 production runtime에 안전하게 연결하고 운영자가 볼 수 있는 검증 절차로 닫는 것이다.

첨부 검토 문서는 세 가지 운영 방향을 제시했다.

1. OCI Native Monitoring/Logging 중심
2. Prometheus/Grafana/Alertmanager 중심
3. SaaS Observability 중심

ReadMates에는 2번이 가장 적합하다. 이유는 repository의 코드와 문서가 이미 Prometheus, PromQL, Grafana dashboard, Alertmanager, `/admin/health`의 Prometheus query provider를 전제로 하고 있기 때문이다. OCI Logging, frontend RUM/error tracking, exporter 계층은 유효한 후속 후보지만, v1의 성공 조건은 먼저 운영 VM에서 app metrics가 실제로 scrape되고 Grafana에서 보이는 것이다.

## 2. 목표

성공 기준:

- 운영 VM에서 `readmates-api:8081/actuator/prometheus`를 Prometheus가 scrape한다.
- Grafana가 같은 compose project/network의 Prometheus datasource를 자동 provision한다.
- 기존 `ops/grafana/dashboards/*.json` dashboard가 운영 Grafana에 자동 로드된다.
- Alertmanager는 SMTP 환경변수가 준비된 경우에만 실제 email alert receiver로 운영한다.
- Grafana와 Prometheus UI는 public internet에 직접 공개하지 않는다.
- 운영자는 SSH tunnel 또는 동등한 private access 경로로 Grafana에 접속한다.
- `/admin/health`의 Prometheus 기반 카드가 운영 Prometheus를 찾을 수 있는 topology를 유지한다.
- 배포 전후 검증은 local provisioning proof와 production health proof를 명확히 구분한다.
- 알림을 실제로 켜기 전에 주요 alert의 runbook 링크와 triage 문구를 public-safe하게 정리한다.

## 3. Non-goals

- OCI Logging, Loki, ELK, OpenSearch 중 하나를 이번 v1에서 확정하거나 배포하지 않는다.
- Sentry, Cloudflare Web Analytics, browser RUM을 이번 v1에 포함하지 않는다.
- `node-exporter`, `cadvisor`, `blackbox-exporter`, `redis-exporter`를 v1 필수 범위로 넣지 않는다.
- 별도 observability VM으로 topology를 분리하지 않는다.
- Prometheus/Grafana/Alertmanager admin UI를 인터넷에 직접 공개하지 않는다.
- 실제 VM IP, private domain, SMTP credential, Grafana password, OCID, deployment state, real member data, token-shaped examples를 Git에 기록하지 않는다.
- Alert threshold를 운영 증거 없이 크게 재조정하지 않는다.
- 백업/복구 정책을 이번 작업에서 다시 설계하지 않는다. ReadMates에는 이미 DB backup runbook과 Object Storage 기반 백업 문서가 있다.

## 4. 선택한 접근

선택한 접근은 **같은 OCI VM, 같은 Docker Compose project 안에 observability stack을 붙이는 v1**이다.

검토한 대안:

1. **같은 VM + 같은 compose project** - 추천
   - 장점: `readmates-api:8081`, `prometheus:9090`, `alertmanager:9093` 같은 Docker DNS가 바로 맞는다. `/admin/health` 기본값 `http://prometheus:9090`과도 자연스럽다. 운영 비용과 네트워크 설정이 작다.
   - 단점: app VM 자체가 죽으면 observability stack도 같이 죽는다. 장기적으로 별도 VM 또는 외부 uptime check가 필요할 수 있다.

2. **별도 observability VM**
   - 장점: app VM 장애를 외부에서 관측할 수 있다. blackbox synthetic monitoring과 장기 운영에는 더 좋다.
   - 단점: 현재 규모 대비 네트워크, 보안그룹, TLS, credential 관리 복잡도가 크다.

3. **SaaS 중심**
   - 장점: 운영 부담이 낮고 frontend error/RUM까지 빠르게 붙일 수 있다.
   - 단점: 현재 Prometheus/Grafana/Alertmanager repo 자산을 덜 활용하고, 비용/데이터 반출/개인정보 정책 검토가 필요하다.

v1은 1번을 선택한다. 후속으로 exporter, OCI Logging, frontend RUM, 별도 observability VM을 단계적으로 붙일 수 있게 boundary를 남긴다.

## 5. Architecture

운영 v1 topology:

```text
Cloudflare Pages / BFF
  -> OCI Caddy
  -> readmates-api
       - /internal/health
       - /actuator/health
       - /actuator/prometheus
       - JSON logs with requestId
  -> Redis / Redpanda / MySQL

Same OCI Docker Compose project:
  -> Prometheus
       - scrape readmates-api:8081
       - load ops/prometheus/alerts/*.yml
  -> Alertmanager
       - optional SMTP receiver through VM-local env file
  -> Grafana
       - datasource: http://prometheus:9090
       - dashboard files: ops/grafana/dashboards/*.json
       - UI bound to 127.0.0.1 only
```

The runtime contract is service-name based. Prometheus must scrape `readmates-api:8081`, not a public IP. Grafana must query `http://prometheus:9090` inside the compose network. Alertmanager must remain `alertmanager:9093` from Prometheus's point of view.

## 6. Components

### 6.1 Spring Actuator Surface

`readmates-api` already exposes management port `8081` inside the OCI compose runtime. The app must keep:

- `READMATES_MANAGEMENT_ADDRESS=0.0.0.0` in container runtime
- `READMATES_MANAGEMENT_PORT=8081`
- `management.endpoints.web.exposure.include=health,prometheus`

Security expectations:

- Browser-facing traffic still goes through Cloudflare Pages Functions BFF and OCI Caddy.
- Management endpoints are not public user APIs.
- Prometheus access is internal Docker network access.

### 6.2 Prometheus

Prometheus is the metric source of truth for v1.

Responsibilities:

- scrape `readmates-api:8081/actuator/prometheus`,
- scrape itself,
- scrape Alertmanager when Alertmanager is enabled,
- load all rule files from `ops/prometheus/alerts/`,
- retain enough short-term data for operational triage.

Prometheus UI is not public. If an operator needs the Prometheus expression browser, they should use SSH tunnel or compose exec on the VM.

### 6.3 Grafana

Grafana is the default human-facing dashboard.

Responsibilities:

- provision Prometheus datasource from Git-tracked provisioning YAML,
- load dashboard JSON from `ops/grafana/dashboards/`,
- keep admin credential in VM-local `grafana.env`,
- bind UI to `127.0.0.1:3001` on the VM,
- support local browser access through SSH tunnel.

The expected operator access pattern:

```bash
ssh -i <ssh-key> -L 13001:127.0.0.1:3001 ubuntu@<vm-public-ip>
```

Then open `http://localhost:13001`.

### 6.4 Alertmanager

Alertmanager is useful only when receiver credentials are ready.

Responsibilities:

- load Git-tracked `deploy/oci/alertmanager/alertmanager.yml`,
- receive alerts from Prometheus at `alertmanager:9093`,
- send email through SMTP env values stored outside Git,
- stay optional during the first Prometheus + Grafana bring-up.

The deployment script should support:

- full stack: `prometheus alertmanager grafana`,
- metrics/dashboard first: `prometheus grafana`.

When Alertmanager is skipped, Prometheus may show the Alertmanager target as down. That state is acceptable for the metrics/dashboard-first phase and should be documented so operators do not misread it as app monitoring failure.

### 6.5 Runbooks And Alert Links

Before alerting is treated as production-ready, the primary alert surfaces need public-safe triage guidance.

Minimum runbook coverage:

- `ScrapeTargetDown`
- `HttpErrorRateHigh`
- `HttpLatencyP95High`
- `HikariConnectionPoolPending`
- `JvmHeapHigh`
- `RedisFallbacksHigh`
- `RedisOperationErrors`
- `NotificationOutboxBacklogHigh`
- `NotificationOutboxBacklogCritical`
- `NotificationFailRateHigh`
- `NotificationDeadLetters`

The runbook language should answer:

- What does this alert mean?
- Which Grafana panel or Prometheus query should the operator inspect first?
- Which source-of-truth row, log search, or compose command should be checked next?
- What immediate mitigations are allowed?
- What evidence remains unproven?

The docs may use placeholder commands and public-safe sample values only.

## 7. Data Flow

Metrics flow:

```text
Spring Micrometer meter
  -> /actuator/prometheus
  -> Prometheus scrape
  -> PromQL
  -> Grafana panel
  -> Alertmanager rule evaluation and notifications
```

Operator triage flow:

```text
Grafana symptom
  -> Prometheus query
  -> /admin/health card
  -> requestId log lookup or source-of-truth DB row
  -> mitigation or rollback decision
  -> incident note / follow-up
```

The design intentionally separates symptom confirmation from root-cause proof. A Grafana spike narrows the time and affected surface. Logs, DB rows, deploy attempts, and dependency status are used to establish root cause.

## 8. Error Handling

- If Prometheus cannot scrape `readmates-server`, deployment smoke fails for full metrics bring-up.
- If Grafana does not become healthy, deployment smoke fails for dashboard bring-up.
- If Alertmanager is requested but SMTP env is missing, deployment should fail before touching the VM.
- If Alertmanager is not requested, deployment should still allow Prometheus + Grafana and document the expected partial state.
- If a dashboard file is invalid JSON or missing core Grafana fields, `lint-grafana-dashboards.sh` should block.
- If a Prometheus rule/config file is invalid, promtool-based validation should block.
- If production smoke fails, the script should print bounded service logs and leave rollback/manual investigation to the operator.

## 9. Security And Public Repo Safety

Rules:

- No real SMTP host, account, password, email recipient, VM IP, private domain, OCID, Grafana password, or token-like value in Git.
- `grafana.env` and `alertmanager.env` are VM-local files only.
- Grafana binds to `127.0.0.1`; public firewall ports are not opened for Grafana or Prometheus.
- Prometheus scrape targets use Docker service DNS names.
- Metric labels remain low-cardinality and public-safe.
- Logs may carry `requestId`, `eventType`, `source`, and similar operational fields, but not raw credentials, transcript body, private document body, or member PII.

## 10. Testing And Verification

Static/local checks:

```bash
bash -n deploy/oci/06-deploy-observability-stack.sh
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
./scripts/validate-alertmanager-config.sh
git diff --check -- <changed-files>
```

Compose config check with placeholder env:

```bash
docker compose -f deploy/oci/compose.infra.yml config
```

Public release safety check for deploy/docs/script changes:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Production-only checks after private env is available:

```bash
VM_PUBLIC_IP=<vm-public-ip> \
READMATES_GRAFANA_ADMIN_PASSWORD=<password> \
./deploy/oci/06-deploy-observability-stack.sh
```

Then verify:

- Prometheus target list includes `readmates-server` with health `up`.
- Grafana `/api/health` returns healthy through container-local check.
- Grafana SSH tunnel opens the provisioned dashboards.
- `/admin/health` no longer treats Prometheus-backed cards as unknown solely because Prometheus is absent.
- If Alertmanager is enabled, a controlled test alert reaches the configured operator inbox.

## 11. Rollout Plan

Phase 1: Metrics and dashboard first

- Deploy Prometheus + Grafana.
- Confirm `readmates-server` scrape is up.
- Open Grafana through SSH tunnel.
- Confirm dashboard provisioning.
- Record exact verification commands and results outside public Git if they contain private host data.

Phase 2: Alertmanager

- Add SMTP env through Git-outside secret channel.
- Deploy Alertmanager with Prometheus.
- Confirm rule load and Alertmanager readiness.
- Send a controlled test alert.
- Keep noisy alerts at warning level until thresholds have initial production evidence.

Phase 3: Runbook closure

- Replace placeholder alert runbook language in active alert docs with actionable triage guidance.
- Add or link concise triage sections for notification, HTTP, JVM/Hikari, Redis, and target-down alerts.
- Make docs explicit about what local checks prove versus production checks.

Phase 4: Follow-up candidates

- OCI Logging or Loki for durable log search.
- Cloudflare Web Analytics and Sentry/browser RUM for frontend signals.
- `node-exporter`, `cadvisor`, `blackbox-exporter`, and Redis/Redpanda exporter coverage.
- Separate observability VM or managed uptime check if app VM failure visibility becomes important.

## 12. Release And Safety Notes

This is an operations enablement change. It touches deployment configuration, scripts, and runbooks, but it should not change user-facing product behavior, database schema, auth cookie contract, OAuth flow, or BFF trust boundary.

Residual risk after v1:

- Same-VM observability cannot report if the entire VM is unreachable.
- No central durable log search exists yet; `requestId` tracing still depends on VM logs or future OCI Logging/Loki work.
- Frontend runtime errors and real-user performance are not covered by Prometheus/Grafana alone.
- Alert thresholds may need tuning after real production data accumulates.

These risks are acceptable for v1 because the immediate goal is to make existing backend metrics and dashboards operational, not to complete the entire observability program in one change.
