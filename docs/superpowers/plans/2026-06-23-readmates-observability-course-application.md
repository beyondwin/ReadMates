# ReadMates Observability Course Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved observability course application design into operator-ready ReadMates docs, runbooks, and verification gates without introducing a new log platform.

**Architecture:** Keep the existing ReadMates observability stack: Spring Boot JSON logs with MDC `requestId`, Actuator `/actuator/prometheus`, Prometheus rules, Grafana dashboards, SLO docs, and local validation scripts. This plan strengthens the documentation and operational flow around those components rather than adding Elasticsearch, Logstash, Kibana, OpenSearch, Loki, or new production topology.

**Tech Stack:** Markdown docs, Bash validation scripts already in `scripts/`, Spring Boot Actuator, Logback JSON encoder, Prometheus, Grafana, Micrometer, Kotlin server unit tests for request correlation behavior.

## Global Constraints

- Do not deploy Elasticsearch, Logstash, Kibana, OpenSearch, Loki, or any other central log store in this phase.
- Do not add real production domains, member data, emails, tokens, OCIDs, private deployment state, local absolute paths, provider credentials, or token-shaped examples to docs.
- Do not add new Prometheus metrics just to mirror course examples.
- Do not change alert thresholds without current operational evidence.
- Do not change production deployment topology.
- Do not claim local smoke checks prove production health.
- Do not claim tests prove no operational risk remains.
- Keep metric labels low-cardinality and public-safe; never use user IDs, member IDs, club IDs, session IDs, email, raw tokens, transcript text, or private document body as metric labels.
- Use `docs/agents/docs.md` rules for docs edits and keep Korean-first style for operations docs.

---

## Scope

This plan implements `docs/superpowers/specs/2026-06-23-readmates-observability-course-application-design.md`.

The plan resolves the design open questions as follows:

- Course guide path: `docs/operations/observability/lecture-guide.md`.
- Deploy check path: standalone runbook at `docs/operations/runbooks/deploy-observability-check.md`.
- Existing alert rule runbook links: mention the current limitation but do not create new alert-specific runbooks in this slice.
- `observability-local-smoke.sh`: document as optional Docker-dependent verification; local target presence/provisioning is not production proof.

## File Structure

- Modify: `docs/operations/observability/README.md`
  - Adds a clearer operator entry map and links the course guide and deploy observability check runbook.
- Create: `docs/operations/observability/lecture-guide.md`
  - Maps the course concepts to ReadMates files, commands, and debugging behavior.
- Modify: `docs/operations/runbooks/correlation-id-lookup.md`
  - Expands incident tracing from a short lookup note into a symptom-to-cause flow using `requestId`, metrics, logs, outbox rows, and Kafka context.
- Create: `docs/operations/runbooks/deploy-observability-check.md`
  - Defines pre/post-deploy observability checks, separating config-only checks, local provisioning checks, server-behavior checks, and production-only evidence.
- Modify: `scripts/README.md`
  - Links the new deploy observability check runbook from the existing observability script descriptions.
- Modify: `docs/operations/runbooks/README.md`
  - Adds the new deploy observability check runbook to the runbook index.

No production code files should change in this implementation unless the executor discovers a current behavior claim in the docs is false. If that happens, stop and revise the plan before implementing code changes.

## Task 1: Strengthen The Observability Entry Point And Add The Course Guide

**Files:**
- Modify: `docs/operations/observability/README.md`
- Create: `docs/operations/observability/lecture-guide.md`

**Interfaces:**
- Consumes: Current observability stack files: `server/src/main/resources/application.yml`, `server/src/main/resources/logback-spring.xml`, `server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt`, `ops/observability/local/prometheus.yml`, `ops/grafana/dashboards/*.json`, `ops/prometheus/alerts/*.yml`.
- Produces: A stable docs entrypoint and `lecture-guide.md` that later runbooks can link as the conceptual explanation.

- [ ] **Step 1: Verify current source facts before editing**

Run:

```bash
rg -n "management:|base-path: /actuator|include: health,prometheus|LogstashEncoder|X-Readmates-Request-Id|requestId" \
  server/src/main/resources/application.yml \
  server/src/main/resources/logback-spring.xml \
  server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt
```

Expected: output confirms management `/actuator` exposure, JSON Logback encoder, `X-Readmates-Request-Id`, and MDC key `requestId`.

- [ ] **Step 2: Update `docs/operations/observability/README.md` entry map**

Replace the current "운영 진입점" and "현재 상태" sections with this content, preserving the existing document title and later "문서"/"용어" sections:

```markdown
## 운영 진입점

| 상황 | 먼저 볼 곳 | 목적 |
| --- | --- | --- |
| 장애 증상 확인 | Grafana dashboard 또는 Prometheus query | 5xx, p95 latency, JVM, Hikari, Redis, notification backlog 같은 숫자로 실제 증상을 확인 |
| 단일 요청 추적 | [Correlation ID lookup runbook](../runbooks/correlation-id-lookup.md) | 사용자 신고나 알림 실패를 `requestId` 기준으로 로그/outbox/Kafka 흐름에 연결 |
| 배포 전후 관측성 확인 | [Deploy observability check runbook](../runbooks/deploy-observability-check.md) | rule/dashboard/SLO/script가 깨지지 않았는지 확인하고 증거의 한계를 기록 |
| 강의 개념을 코드에 매핑 | [ReadMates observability lecture guide](lecture-guide.md) | Logback, MDC, Actuator, Prometheus, Grafana, alert, ELK 개념을 이 repo의 파일과 명령어로 이해 |
| 운영자 health 화면 | `/admin/health` | DB / Redis / Kafka / AI provider / outbox / 알림 발송 성공률 / 최근 deploy attempt 카드를 aggregate로 확인 |
| 로컬 provisioning smoke | `./scripts/observability-local-smoke.sh` | Prometheus/Grafana provisioning, alert rule load, dashboard import를 공개-safe 로컬 stack으로 확인 |

## 현재 상태

- Spring Boot Actuator + Micrometer + Prometheus registry가 server에 활성화되어 있습니다. Prometheus scrape endpoint는 management server의 `/actuator/prometheus`입니다.
- Management server는 기본적으로 `127.0.0.1:8081`에 바인딩됩니다. 외부 공개 포트가 필요하면 reverse proxy나 방화벽 보호를 별도로 설계해야 합니다.
- `RequestIdFilter`가 `X-Readmates-Request-Id`를 생성/수용하고 MDC `requestId`에 바인딩합니다. 같은 값은 응답 헤더와 에러 응답의 `traceId` lookup에도 쓰입니다.
- 서버 로그는 `logback-spring.xml`의 `LogstashEncoder`로 JSON 출력되며 `requestId`, `clubSlug`, `sessionId`, `actorId`, `source`, `eventType` MDC field를 포함할 수 있습니다.
- Custom 메트릭으로 notification, Redis/cache, AI generation, outbound resilience meter set이 export됩니다. 자세한 이름과 label 정책은 [메트릭 카탈로그](metrics-catalog.md)를 기준으로 합니다.
- `ops/grafana/dashboards/`와 `ops/prometheus/alerts/`가 dashboard/rule source of truth입니다. 문서는 사람이 읽는 해설입니다.
- 대시보드/알림 인프라 자체의 외부 배포 상태는 Git만으로 확인하지 않습니다. 로컬 smoke와 production health evidence를 구분해 기록합니다.
```

- [ ] **Step 3: Create `docs/operations/observability/lecture-guide.md`**

Create the file with this content:

```markdown
# ReadMates Observability Lecture Guide

이 문서는 로그/메트릭/Actuator/Prometheus/Grafana/ELK 강의 개념을 ReadMates 코드 기준으로 다시 설명합니다.

## 한 줄 구분

| 질문 | ReadMates에서 보는 곳 |
| --- | --- |
| 서버가 살아 있나? | management `/actuator/health` |
| 요청이 늘었나, 느려졌나, 실패하나? | Prometheus/Grafana의 HTTP/JVM/Hikari/Redis/notification metric |
| 어떤 요청에서 왜 실패했나? | JSON log의 `requestId`와 correlation lookup runbook |
| 알림/AI/Redis 같은 비동기 또는 선택 계층 상태는? | metrics catalog, alert rules, `/admin/health`, source-of-truth DB row |
| 중앙 로그 검색 도구가 있나? | 이 phase에서는 도입하지 않음. JSON stdout log는 후속 OCI Logs/Loki/ELK/OpenSearch 연동 후보 |

## 1. Logback

강의에서 Logback은 Spring Boot가 로그를 쓰는 도구입니다. ReadMates에서는 `server/src/main/resources/logback-spring.xml`이 기준입니다.

확인 명령:

```bash
sed -n '1,120p' server/src/main/resources/logback-spring.xml
```

볼 것:

- `net.logstash.logback.encoder.LogstashEncoder`
- `requestId`, `clubSlug`, `sessionId`, `actorId`, `source`, `eventType` MDC field
- `ts`, `msg`, `logger`, `thread` field 이름

디버깅할 때는 사람이 읽는 plain text 로그를 기대하지 말고 JSON 한 줄을 `jq`로 필터링합니다.

```bash
journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<request-id>")'
```

초보자가 자주 헷갈리는 점: JSON 로그를 쓴다고 자동으로 Kibana가 생기지는 않습니다. JSON은 수집기가 이해하기 쉬운 출력 형식이고, 검색 UI는 별도 운영 구성입니다.

## 2. MDC And Request ID

강의의 `MdcLoggingFilter로 UUID 부여하기`는 ReadMates에서 `RequestIdFilter`로 구현됩니다.

확인 명령:

```bash
sed -n '1,120p' server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt
```

볼 것:

- Header: `X-Readmates-Request-Id`
- MDC key: `requestId`
- 요청이 끝난 뒤 `MDC.remove`
- 응답 header에 같은 request id 반환

디버깅할 때 사용자는 오류 신고에 request id를 줄 수 있고, 운영자는 같은 id로 서버 로그와 일부 outbox/Kafka 흐름을 따라갑니다.

초보자가 자주 헷갈리는 점: `requestId`는 인증 토큰이나 사용자 식별자가 아닙니다. 한 요청을 찾기 위한 public-safe lookup key입니다.

## 3. Actuator

Actuator는 운영용 진단 endpoint를 제공합니다. ReadMates 설정은 `server/src/main/resources/application.yml`의 `management` 블록입니다.

확인 명령:

```bash
rg -n "management:|base-path: /actuator|include: health,prometheus|server:" server/src/main/resources/application.yml
```

주요 endpoint:

```text
GET http://<server-host>:8081/actuator/health
GET http://<server-host>:8081/actuator/prometheus
```

기본 관리 주소는 loopback입니다. 운영에서 외부 scrape가 필요하면 보호된 reverse proxy나 같은 private network scrape를 설계합니다.

초보자가 자주 헷갈리는 점: Actuator는 대시보드가 아니라 데이터를 노출하는 endpoint입니다. Prometheus와 Grafana가 그 데이터를 수집하고 보여줍니다.

## 4. Prometheus

Prometheus는 Actuator의 metric을 주기적으로 scrape합니다. 로컬 실습 설정은 `ops/observability/local/prometheus.yml`입니다.

확인 명령:

```bash
sed -n '1,120p' ops/observability/local/prometheus.yml
```

볼 것:

- `scrape_interval`
- `metrics_path: /actuator/prometheus`
- `job_name: readmates-server`
- `target: host.docker.internal:8081`

대표 metric은 [metrics-catalog.md](metrics-catalog.md)를 기준으로 봅니다. HTTP, JVM, HikariCP, Logback, notification, Redis/cache, AI generation, outbound resilience metric이 핵심입니다.

초보자가 자주 헷갈리는 점: metric label에 `user_id`, `email`, `session_id` 같은 값을 넣으면 검색이 편해 보이지만 Prometheus time series 폭발과 개인정보 노출 위험이 생깁니다. ReadMates metric label은 enum이나 낮은 cardinality 값만 허용합니다.

## 5. Grafana

Grafana는 Prometheus query를 dashboard로 보여줍니다. ReadMates dashboard source of truth는 `ops/grafana/dashboards/`입니다.

확인 명령:

```bash
ls ops/grafana/dashboards
./scripts/lint-grafana-dashboards.sh
```

장애 때 보는 순서:

1. HTTP 5xx ratio와 p95 latency로 증상 확인
2. Hikari/JVM/Redis/notification panel로 영향 surface 좁히기
3. `requestId` 또는 시간대 기준으로 로그와 DB row 확인

초보자가 자주 헷갈리는 점: Grafana 그래프는 원인을 자동으로 말해주지 않습니다. 그래프는 증상과 범위를 좁혀주고, 원인은 로그/DB row/최근 배포/외부 의존성 증거와 함께 판단합니다.

## 6. Alerts And SLOs

Prometheus alert rule source는 `ops/prometheus/alerts/*.yml`입니다. SLO 사람 읽기용 문서는 `docs/operations/observability/slos.md`이고, 서버 resource source는 `server/src/main/resources/slo/slos.yaml`입니다.

확인 명령:

```bash
./scripts/validate-prometheus-rules.sh
sed -n '1,160p' docs/operations/observability/slos.md
```

알림은 "조사해야 할 신호"입니다. SLO는 "얼마나 자주/오래 사용자가 영향을 받았는지"를 보는 기준입니다.

초보자가 자주 헷갈리는 점: 알림이 울리지 않았다고 장애가 없는 것은 아닙니다. 반대로 알림 하나만으로 root cause가 확정되는 것도 아닙니다.

## 7. ELK/Kibana

강의에서 ELK는 로그를 중앙 수집, 저장, 검색, 시각화하는 스택입니다.

ReadMates의 현재 결정:

- 이 phase에서는 ELK/Kibana를 도입하지 않습니다.
- 서버는 JSON stdout log와 `requestId`를 이미 제공합니다.
- 후속으로 OCI Logs, Loki, ELK, OpenSearch 중 하나를 선택할 수 있습니다.

후속 도입 전에 결정할 것:

- 로그 보관 기간
- 운영자 접근 권한
- 비용과 디스크 사용량
- private data redaction 정책
- production, preview, local 환경 분리

초보자가 자주 헷갈리는 점: Kibana는 로그를 "보는 화면"이고, Logback은 로그를 "쓰는 라이브러리"입니다. 둘 사이에는 수집기와 저장소가 필요합니다.
```

- [ ] **Step 4: Verify links and docs whitespace for Task 1**

Run:

```bash
git diff --check -- docs/operations/observability/README.md docs/operations/observability/lecture-guide.md
rg -n "lecture-guide|deploy-observability-check|correlation-id-lookup" docs/operations/observability/README.md docs/operations/observability/lecture-guide.md
```

Expected: no whitespace errors; links are present.

- [ ] **Step 5: Commit Task 1**

```bash
git add docs/operations/observability/README.md docs/operations/observability/lecture-guide.md
git commit -m "docs: map observability course to ReadMates"
```

## Task 2: Expand Correlation ID Incident Lookup

**Files:**
- Modify: `docs/operations/runbooks/correlation-id-lookup.md`

**Interfaces:**
- Consumes: Task 1 course guide link target `../observability/lecture-guide.md`.
- Produces: A practical incident lookup flow that Task 3 can reference from deploy verification.

- [ ] **Step 1: Replace the short correlation runbook with the expanded flow**

Replace `docs/operations/runbooks/correlation-id-lookup.md` with:

```markdown
# Correlation ID Lookup Runbook

> Phase 0 (Observability Backbone) — single `requestId` joins BFF, Spring API, selected outbox rows, Kafka headers, and consumer logs.

## When To Use

- A user reports a failed action and provides a request id from `X-Readmates-Request-Id` or an error response `traceId`.
- Grafana or Prometheus shows a spike and you need representative request logs for the same time window.
- A notification outbox row is `FAILED` or `DEAD` and needs request context.

## What This Proves

- A matching `requestId` ties log lines and selected asynchronous work to the same originating request.
- Matching rows narrow investigation to a feature surface, status, event type, and timestamp.

## What This Does Not Prove

- It does not prove production log retention is healthy.
- It does not prove every scheduled or async path has an upstream request id.
- It does not replace metric-based severity assessment.

## Step 1: Confirm The Symptom

Use Grafana or Prometheus first when the issue is broad.

Common starting signals:

- HTTP 5xx ratio or p95 latency spike
- `hikaricp_connections_pending > 0`
- `readmates_notifications_outbox_backlog{status="pending"}` rising
- Redis fallback or operation error rate rising
- JVM heap or GC pause sustained above baseline

This separates "the user saw one failure" from "the service is currently degraded".

## Step 2: Search Server Logs By Request ID

```bash
journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<request-id>")'
```

If the incident time is known, tighten the time window:

```bash
journalctl -u readmates-server --since "2026-06-23 14:00:00" --until "2026-06-23 14:10:00" \
  | jq 'select(.requestId == "<request-id>")'
```

Expected useful fields:

- `requestId`
- `level`
- `logger`
- `msg`
- optional `clubSlug`, `sessionId`, `actorId`, `source`, `eventType`

Do not paste raw log bodies containing private member data into public docs or tickets.

## Step 3: Check Notification Source-Of-Truth Rows

Use this only for notification-related incidents.

```sql
SELECT id, event_type, status, created_at, published_at, request_id
FROM notification_event_outbox
WHERE request_id = '<request-id>';

SELECT id, template, created_at, request_id
FROM notification_manual_dispatch_previews
WHERE request_id = '<request-id>';

SELECT id, template, status, created_at, request_id
FROM notification_manual_dispatches
WHERE request_id = '<request-id>';
```

Interpretation:

- `PENDING` or `FAILED` rows point to relay/publisher/channel investigation.
- `DEAD` rows require delivery failure review and operator action.
- No rows can be normal if the request did not enqueue notification work.

## Step 4: Check Consumer Logs

Consumer logs use the same JSON log lookup when Kafka headers carry `readmates-request-id`.

```bash
journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<request-id>")'
```

If logs show `requestId = "unknown"`, the work likely came from a scheduled or async path without an upstream request. Cross-reference by `eventType`, status, and timestamp.

## Step 5: Estimate Impact

Use the symptom metric that matches the incident:

| Surface | Metric or evidence |
| --- | --- |
| API failures | `http_server_requests_seconds_count{status=~"5.."}` |
| API latency | `http_server_requests_seconds_bucket` p95 |
| DB pool pressure | `hikaricp_connections_pending` |
| Notification backlog | `readmates_notifications_outbox_backlog` |
| Redis instability | `readmates_redis_fallbacks_total`, `readmates_redis_operation_errors_total` |
| Log error volume | `logback_events_total{level="error"}` |

For SLO context, see `docs/operations/observability/slos.md`.

## Step 6: Record Remaining Gaps

In the incident note or release evidence, explicitly record:

- whether the request id was present,
- whether matching logs were found,
- whether matching outbox/Kafka evidence existed,
- which metric showed user-visible impact,
- which checks were skipped and why.

## Related Docs

- [ReadMates observability lecture guide](../observability/lecture-guide.md)
- [Deploy observability check](deploy-observability-check.md)
- [Metrics catalog](../observability/metrics-catalog.md)
- [Alerts](../observability/alerts.md)
- [SLO](../observability/slos.md)
```

- [ ] **Step 2: Verify Task 2 formatting and links**

Run:

```bash
git diff --check -- docs/operations/runbooks/correlation-id-lookup.md
rg -n "requestId|traceId|deploy-observability-check|lecture-guide|What This Does Not Prove" docs/operations/runbooks/correlation-id-lookup.md
```

Expected: no whitespace errors; the expanded proof/limit sections are present.

- [ ] **Step 3: Commit Task 2**

```bash
git add docs/operations/runbooks/correlation-id-lookup.md
git commit -m "docs: expand request correlation runbook"
```

## Task 3: Add Deploy Observability Check Runbook And Script Index Links

**Files:**
- Create: `docs/operations/runbooks/deploy-observability-check.md`
- Modify: `docs/operations/runbooks/README.md`
- Modify: `scripts/README.md`

**Interfaces:**
- Consumes: Task 1 course guide and Task 2 correlation runbook.
- Produces: A deployment-oriented verification path with exact commands and expected evidence boundaries.

- [ ] **Step 1: Create `docs/operations/runbooks/deploy-observability-check.md`**

Create the file with:

```markdown
# Deploy Observability Check Runbook

Use this before and after a release when docs, scripts, dashboards, alert rules, SLOs, request correlation, or operations evidence changed.

## What This Runbook Proves

- Prometheus rule files are syntactically valid.
- Grafana dashboard JSON files are structurally valid.
- The local Prometheus/Grafana provisioning stack can load configured rules and dashboards when Docker is available.
- Targeted request correlation tests still match documented `RequestIdFilter` and Logback behavior when server behavior docs changed.

## What This Runbook Does Not Prove

- It does not prove production Prometheus, Grafana, or Alertmanager are deployed or reachable.
- It does not prove production scrape targets are healthy.
- It does not prove alert receivers are configured or delivering messages.
- It does not prove there is no operational risk after release.

## Check 1: Docs Whitespace

Run this for changed docs:

```bash
git diff --check -- docs/operations/observability docs/operations/runbooks scripts/README.md
```

Expected: no output.

## Check 2: Public Safety Scan

Run this over changed operations docs before commit:

```bash
rg -n "ocid1\\.|/(Users|home)/|https://[^ ]*(readmates|private)|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{16}" \
  docs/operations/observability docs/operations/runbooks scripts/README.md
```

Expected: no output. If the scan finds a public-safe placeholder such as `https://api.example.com`, leave it only if it is clearly generic.

## Check 3: Prometheus Rules

```bash
./scripts/validate-prometheus-rules.sh
```

Expected: promtool validates `ops/prometheus/alerts/*.yml`.

This proves rule syntax and structure. It does not prove production Prometheus loaded the newest files.

## Check 4: Grafana Dashboard JSON

```bash
./scripts/lint-grafana-dashboards.sh
```

Expected: dashboard JSON is parseable and contains required fields.

This proves dashboard files are structurally valid. It does not prove a production Grafana instance imported them.

## Check 5: Local Provisioning Smoke

Run only when Docker is available and ports `9090` and `3001` are free:

```bash
./scripts/observability-local-smoke.sh
```

Expected:

- Prometheus readiness passes.
- Grafana readiness passes.
- Prometheus has alert rule groups.
- Prometheus has a configured `readmates-server` target.
- Grafana has provisioned ReadMates dashboards.

If the Spring server is not running on management port `8081`, record that scrape health was not proven. Target registration and dashboard provisioning can still be valid local evidence.

## Check 6: Request Correlation Behavior

Run when docs changed behavior claims about request id, MDC, Logback JSON fields, or error response `traceId`:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.observability.RequestIdFilterTest --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

Expected: both targeted tests pass.

This proves the documented filter and JSON encoder behavior still matches those tests. It does not prove every application flow carries domain-specific MDC fields.

## Post-Deploy Evidence To Record

For production or staging release notes, record:

- which checks ran,
- which checks were skipped and why,
- whether production scrape targets were checked separately,
- whether alert delivery was checked separately,
- whether any request correlation lookup was sampled.

Use explicit language: "local provisioning passed" is different from "production Grafana is healthy".

## Related Docs

- [ReadMates observability lecture guide](../observability/lecture-guide.md)
- [Correlation ID lookup](correlation-id-lookup.md)
- [Observability bootstrap](observability-bootstrap.md)
- [SLO monthly report](slo-monthly-report.md)
```

- [ ] **Step 2: Update `docs/operations/runbooks/README.md`**

Add this bullet near the existing observability/correlation entries:

```markdown
- [Deploy observability check](deploy-observability-check.md) — 배포 전후 Prometheus rule, Grafana dashboard, local provisioning, request correlation 증거와 한계를 분리해 확인.
```

- [ ] **Step 3: Update `scripts/README.md` observability script sections**

In the `lint-grafana-dashboards.sh`, `validate-prometheus-rules.sh`, and `observability-local-smoke.sh` sections, add this sentence after the command examples:

```markdown
배포 전후 어떤 증거로 해석해야 하는지는 [Deploy observability check runbook](../docs/operations/runbooks/deploy-observability-check.md)을 기준으로 기록합니다.
```

- [ ] **Step 4: Verify Task 3 docs**

Run:

```bash
git diff --check -- docs/operations/runbooks/deploy-observability-check.md docs/operations/runbooks/README.md scripts/README.md
rg -n "Deploy observability check|observability-local-smoke|validate-prometheus-rules|lint-grafana" \
  docs/operations/runbooks/deploy-observability-check.md docs/operations/runbooks/README.md scripts/README.md
```

Expected: no whitespace errors; the new runbook is linked from both indexes.

- [ ] **Step 5: Commit Task 3**

```bash
git add docs/operations/runbooks/deploy-observability-check.md docs/operations/runbooks/README.md scripts/README.md
git commit -m "docs: add deploy observability check runbook"
```

## Task 4: Cross-Link Existing Observability Docs And Run Verification

**Files:**
- Modify only if needed: `docs/operations/observability/metrics-catalog.md`
- Modify only if needed: `docs/operations/observability/alerts.md`
- Modify only if needed: `docs/operations/observability/slos.md`
- Modify only if needed: `docs/operations/observability/dashboards.md`

**Interfaces:**
- Consumes: Task 1-3 docs.
- Produces: Final aligned observability documentation with verified commands and documented skipped checks.

- [ ] **Step 1: Check whether cross-links are missing**

Run:

```bash
rg -n "lecture-guide|deploy-observability-check|correlation-id-lookup" docs/operations/observability docs/operations/runbooks
```

Expected: `README.md`, `lecture-guide.md`, `correlation-id-lookup.md`, and `deploy-observability-check.md` are linked. If `metrics-catalog.md`, `alerts.md`, `slos.md`, or `dashboards.md` already have sufficient navigation through README, do not edit them.

- [ ] **Step 2: Add only necessary cross-links**

If a reader can land directly on `metrics-catalog.md`, `alerts.md`, `slos.md`, or `dashboards.md` and miss the new course or deploy runbook, add this short note near the top of the affected file:

```markdown
> 운영 흐름으로 읽으려면 [Observability README](README.md)에서 시작하고, 배포 전후 검증은 [Deploy observability check](../runbooks/deploy-observability-check.md)를 기준으로 기록합니다.
```

Do not rewrite metric tables, PromQL, SLO objectives, or alert thresholds in this task.

- [ ] **Step 3: Run docs whitespace and public-safety checks**

Run:

```bash
git diff --check -- docs/operations/observability docs/operations/runbooks scripts/README.md
rg -n "ocid1\\.|/(Users|home)/|https://[^ ]*(readmates|private)|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{16}" \
  docs/operations/observability docs/operations/runbooks scripts/README.md
```

Expected: `git diff --check` has no output. The public-safety scan has no output, except generic safe domains such as `https://api.example.com` if they appear and are intentionally generic.

- [ ] **Step 4: Run observability config validators**

Run:

```bash
./scripts/validate-prometheus-rules.sh
./scripts/lint-grafana-dashboards.sh
```

Expected: both pass. If Docker is missing for `validate-prometheus-rules.sh`, record the exact failure and do not claim it passed.

- [ ] **Step 5: Run targeted server tests if behavior docs changed**

Run because Task 1 and Task 2 describe request correlation and Logback behavior:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.observability.RequestIdFilterTest --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

Expected: targeted tests pass. If Java/Gradle/Testcontainers environment is unavailable, record the exact reason and do not claim it passed.

- [ ] **Step 6: Optionally run local provisioning smoke**

Run only if Docker is available and ports `9090` and `3001` are free:

```bash
./scripts/observability-local-smoke.sh
```

Expected: Prometheus/Grafana readiness, rule group loading, target registration, and dashboard provisioning pass. If the Spring server is not running, record that scrape health was not proven.

- [ ] **Step 7: Commit final alignment**

If Task 4 changed files, commit them:

```bash
git add docs/operations/observability docs/operations/runbooks scripts/README.md
git commit -m "docs: align observability verification references"
```

If Task 4 changed no files, do not create an empty commit.

## Final Verification

After all tasks:

```bash
git status --short
git log --oneline -4
git diff --check HEAD~4..HEAD
./scripts/validate-prometheus-rules.sh
./scripts/lint-grafana-dashboards.sh
./server/gradlew -p server unitTest --tests com.readmates.shared.observability.RequestIdFilterTest --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

Also run the public-safety scan over the final touched set:

```bash
rg -n "ocid1\\.|/(Users|home)/|https://[^ ]*(readmates|private)|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{16}" \
  docs/operations/observability docs/operations/runbooks scripts/README.md
```

Optional if Docker and ports are available:

```bash
./scripts/observability-local-smoke.sh
```

Final response must name changed surfaces, list checks actually run, list skipped checks with reasons, and call out that ELK/Kibana remains a future option rather than implemented runtime infrastructure.
