# Observability Runbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/operations/observability/` 디렉토리를 신설하고, 메트릭 카탈로그/대시보드/알림/SLO 4개 문서 + 진입 README를 작성한다. 코드 변경 없음. 모든 메트릭 entry는 *현재 배포된* 메트릭만 (신규 메트릭 도입은 후속).

**Architecture:** 문서만. spec과 동일한 5개 파일. PromQL/YAML은 *마크다운 코드 블록*으로 기록 (실 배포 파일은 후속 plan).

**Tech Stack:** 마크다운 + PromQL/YAML (코드 블록).

**Spec:** `docs/superpowers/specs/2026-05-11-observability-runbook-design.md`

---

## File map

신규 작성:
- `docs/operations/observability/README.md`
- `docs/operations/observability/metrics-catalog.md`
- `docs/operations/observability/dashboards.md`
- `docs/operations/observability/alerts.md`
- `docs/operations/observability/slos.md`

수정:
- `docs/operations/README.md` — observability 섹션 link (post-mortem plan에서 이미 생성된 파일을 갱신).

수정 금지:
- 코드 (server/, front/).
- `application*.yml` 또는 actuator 설정 — 신규 메트릭 도입 없음.

---

## Task 1: 디렉토리 + 진입 README 작성

**Files:** 신규 `docs/operations/observability/README.md`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p docs/operations/observability
```

- [ ] **Step 2: README.md 작성**

```markdown
# Observability

ReadMates의 메트릭/로그/트레이스/대시보드/알림 가이드입니다.

## 현재 상태

- Spring Boot Actuator + Micrometer + Prometheus registry가 server에 활성화되어 있습니다 (`/actuator/prometheus`).
- request traceId가 모든 응답과 에러 응답에 포함됩니다.
- Custom 메트릭으로 notification outbox backlog gauge가 1분 주기로 export됩니다.
- **대시보드/알림 인프라 자체 (Grafana, Prometheus alertmanager 등)는 본 문서 작성 시점에 외부 배포되지 않았습니다.** 본 가이드는 *권장 구성*과 *현재 인용 가능한 측정점*을 정리합니다. 실 배포는 후속 plan.

## 문서

- [메트릭 카탈로그](metrics-catalog.md) — 어떤 메트릭이, 어떤 의미로, 어디서 나오는가.
- [대시보드](dashboards.md) — 권장 패널과 PromQL 쿼리.
- [알림 룰](alerts.md) — 임계 정책 후보 (alertmanager rule).
- [SLO](slos.md) — 운영 목표와 측정 방법.

## 용어

- **메트릭(metric)**: 시계열 수치. Prometheus가 scrape.
- **gauge**: 현재 값을 그대로 노출 (예: backlog count).
- **counter**: 단조 증가하는 누적값 (예: 처리된 요청 수).
- **histogram**: 분포를 bucket으로 (예: 응답 시간).
- **SLO**: Service Level Objective. 측정 가능한 운영 목표.
- **에러 예산**: SLO 위반 허용량. 위반 시 신규 기능 배포보다 신뢰성 작업 우선.
```

- [ ] **Step 3: 검증**

```bash
ls docs/operations/observability/
```

기대: `README.md` 1개.

---

## Task 2: `metrics-catalog.md` 작성

**Files:** 신규 `docs/operations/observability/metrics-catalog.md`

- [ ] **Step 1: 현재 배포된 custom 메트릭 grep**

```bash
grep -rn "MeterRegistry\|@Bean.*Gauge\|gauge\|counter\|@Timed" server/src/main/kotlin
grep -rn "CachedNotificationBacklogProvider" server/src/main/kotlin
grep -rn "registerMetric\|registerGauge\|registerCounter" server/src/main/kotlin
```

발견된 메트릭의 *이름, 라벨, 의미*를 추출. 결과를 메모.

- [ ] **Step 2: actuator 설정 확인**

```bash
grep -rn "management\.\|prometheus\|actuator" server/src/main/resources
```

`/actuator/prometheus`가 실제로 노출되는지, exclude/include 설정이 있는지 확인.

- [ ] **Step 3: 본문 작성**

```markdown
# 메트릭 카탈로그

## 노출 endpoint

`GET <server-base-url>/actuator/prometheus` — Prometheus exposition 형식. 인증 정책: <인증 필요/불필요는 설정 확인 후 기록>.

## Custom 메트릭

| 이름 | 타입 | 라벨 | 단위 | 의미 | 근원 코드 | 패널 | 알림 |
|------|------|------|------|------|----------|------|------|
| `notification_outbox_backlog` | gauge | (없음) | 행수 | 발송 대기 중인 outbox row 수 | `server/.../CachedNotificationBacklogProvider.kt` | dashboards.md#notification-pipeline | alerts.md#notificationoutboxbackloghigh |
| (Step 1 grep으로 발견된 추가 메트릭들) | ... | ... | ... | ... | ... | ... | ... |

## 표준 메트릭 그룹

### HTTP

- `http_server_requests_seconds_count` (counter, by `uri`, `status`, `method`, `outcome`)
- `http_server_requests_seconds_sum` (counter, 같은 라벨)
- `http_server_requests_seconds_max` (gauge, 같은 라벨)
- `http_server_requests_seconds_bucket` (histogram bucket)

라벨 `uri`는 Spring path template (예: `/api/sessions/current`). 정규화된 path를 사용하므로 cardinality 안전.

### JVM

- `jvm_memory_used_bytes` (gauge, by `area`/`id`)
- `jvm_memory_max_bytes` (gauge)
- `jvm_gc_pause_seconds` (histogram, by `action`/`cause`)
- `jvm_threads_live_threads` (gauge)
- `jvm_threads_states_threads` (gauge, by `state`)

### HikariCP (DB connection pool)

- `hikaricp_connections` (gauge — total)
- `hikaricp_connections_active` (gauge)
- `hikaricp_connections_idle` (gauge)
- `hikaricp_connections_pending` (gauge — *0이 정상*. 지속적으로 양수면 pool 부족)
- `hikaricp_connections_acquire_seconds_max` (gauge)
- `hikaricp_connections_usage_seconds_*` (histogram)

### Logback

- `logback_events_total` (counter, by `level=ERROR/WARN/INFO/DEBUG/TRACE`)

## DB row 기반 측정 (메트릭 아님, 쿼리)

다음은 메트릭으로 export되지 않지만 dashboard 패널 후보:

| 측정 | 쿼리 |
|------|------|
| BFF secret 회전 이력 | `SELECT count(*), max(rotated_at) FROM bff_secret_rotation_audit;` |
| Notification delivery state 분포 | `SELECT state, count(*) FROM notification_deliveries GROUP BY state;` |
| Notification outbox 분포 (state 보유 시) | `SELECT state, count(*) FROM notification_event_outbox GROUP BY state;` |

(테이블/컬럼명은 grep으로 정확히 확인 후 기재.)

## 후속 메트릭 후보 (현재 없음)

- `notification_delivery_latency_seconds` (histogram) — outbox 생성 → PUBLISHED transition latency.
- `bff_request_total` (counter, by `route`, `host`) — Cloudflare Worker analytics 의존.
- `frontend_route_load_seconds` (histogram) — RUM (Real User Monitoring) 도입 후.
```

- [ ] **Step 4: 검증**

```bash
grep -c "^| " docs/operations/observability/metrics-catalog.md
```

기대: 다수 (custom + standard).

---

## Task 3: `dashboards.md` 작성

**Files:** 신규 `docs/operations/observability/dashboards.md`

- [ ] **Step 1: 본문 작성**

```markdown
# 권장 대시보드

본 문서는 Grafana(또는 호환 도구)에서 구성할 패널과 PromQL 쿼리를 정리합니다. 실 배포 dashboard JSON은 도구 도입 후 export 권장.

## Dashboard 1 — Service Health

### Panel: HTTP request rate (per route)

- 메트릭: `http_server_requests_seconds_count`
- PromQL:
  ```promql
  sum by (uri) (rate(http_server_requests_seconds_count[1m]))
  ```
- 임계: 평소 baseline의 ±50% 이상 변화 시 조사.

### Panel: HTTP error rate

- PromQL:
  ```promql
  sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
    / sum(rate(http_server_requests_seconds_count[5m]))
  ```
- 임계: > 1%이면 alert.

### Panel: HTTP latency p50/p95/p99 (by route)

- PromQL:
  ```promql
  histogram_quantile(0.99,
    sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m])))
  ```
- 임계 (read endpoint): p95 > 500ms.

### Panel: JVM heap

- PromQL:
  ```promql
  jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"}
  ```
- 임계: > 80% 지속 시 조사.

### Panel: GC pause

- PromQL:
  ```promql
  rate(jvm_gc_pause_seconds_sum[5m]) / rate(jvm_gc_pause_seconds_count[5m])
  ```
- 임계: 평균 > 200ms 지속 시 조사.

### Panel: Hikari connection pool

- PromQL:
  ```promql
  hikaricp_connections_active
  hikaricp_connections_pending
  ```
- 임계: `pending > 0`이 2분 이상 지속.

## Dashboard 2 — Notification Pipeline

### Panel: Outbox backlog

- 메트릭: `notification_outbox_backlog`
- PromQL:
  ```promql
  notification_outbox_backlog
  ```
- 임계: > 100 in 10m → warning. > 1000 → critical.

### Panel: Logback errors (notification 관련)

- PromQL:
  ```promql
  sum(rate(logback_events_total{level="ERROR"}[5m]))
  ```
- 임계: > 0.1/sec 지속 시 조사.

### Panel: Delivery state distribution (DB query)

- 쿼리 (Grafana MySQL data source 또는 별도 dashboard):
  ```sql
  SELECT state, count(*) FROM notification_deliveries
  WHERE created_at > NOW() - INTERVAL 24 HOUR
  GROUP BY state;
  ```

### Panel: DEAD state appearance

- 쿼리:
  ```sql
  SELECT count(*) FROM notification_deliveries
  WHERE state = 'DEAD' AND updated_at > NOW() - INTERVAL 24 HOUR;
  ```
- 임계: > 0이면 즉시 조사 (DEAD는 자동 재시도 중단 상태).

## Dashboard 3 — Database

### Panel: HTTP request → DB query count (by route)

(현재 측정 메트릭 부재 — `QueryCountingDataSource`는 테스트 전용. 운영 dashboard 후속 메트릭 후보.)

### Panel: MySQL slow query log

- 쿼리: MySQL slow log 또는 `performance_schema.events_statements_summary_by_digest` (HeatWave 권한 필요).

### Panel: Hikari acquire time

- PromQL:
  ```promql
  hikaricp_connections_acquire_seconds_max
  ```
- 임계: > 100ms 지속 시 조사.

## 패널 작성 규약

- 모든 panel에 *임계 (참고)* 를 명시. 임계가 없으면 "조사 기준 미정"으로 적기.
- PromQL은 *복사-붙여넣기 가능*하게 단일 쿼리.
- 도구 종속 (Grafana variables 등)은 일반화된 PromQL 위주로.
```

- [ ] **Step 2: PromQL 구문 sanity check**

각 PromQL 코드 블록을 manual review. 괄호 매칭, label selector 따옴표, function 인자 갯수 확인.

- [ ] **Step 3: 검증**

```bash
grep -c "^### Panel:" docs/operations/observability/dashboards.md
```

기대: 8 이상.

---

## Task 4: `alerts.md` 작성

**Files:** 신규 `docs/operations/observability/alerts.md`

- [ ] **Step 1: 본문 작성**

```markdown
# 알림 룰 후보

본 문서는 Prometheus alertmanager rule 정의를 정리합니다. 실 배포는 후속 plan에서 별도 환경(`docs/deploy/observability-stack.md`)에 따라.

## 룰 작성 규약

- severity: `critical` | `warning` | `info`.
- `for:`로 일시적 spike 무시.
- annotations에 runbook 링크 (runbook 미작성 시 `TBD`).
- prod-only로 적용 가정. dev/staging은 룰 별도 set.

## 룰

```yaml
groups:
  - name: readmates.notification
    interval: 30s
    rules:
      - alert: NotificationOutboxBacklogHigh
        expr: notification_outbox_backlog > 100
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "Notification outbox backlog over 100 for 10 minutes"
          description: "Consumer가 처리 속도를 따라가지 못하거나 죽었을 가능성. consumer 로그 확인."
          runbook: "TBD - docs/operations/runbooks/notification-backlog.md"

      - alert: NotificationOutboxBacklogCritical
        expr: notification_outbox_backlog > 1000
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "Notification outbox backlog over 1000"
          description: "Consumer가 죽었거나 Kafka가 unreachable. 즉시 조사."
          runbook: "TBD"

  - name: readmates.http
    interval: 30s
    rules:
      - alert: HttpErrorRateHigh
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
            / sum(rate(http_server_requests_seconds_count[5m])) > 0.01
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "HTTP 5xx ratio over 1% for 5 minutes"
          description: "에러 폭증. 최근 배포/marigation 의심."
          runbook: "TBD"

      - alert: HttpLatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum by (le, uri) (rate(http_server_requests_seconds_bucket{uri=~"/api/.*"}[5m])))
            > 0.5
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "p95 latency over 500ms for 10 minutes"
          description: "DB slow query, GC pause, Hikari 부족 등 의심. Service Health dashboard 확인."

  - name: readmates.jvm
    interval: 30s
    rules:
      - alert: HikariConnectionPoolPending
        expr: hikaricp_connections_pending > 0
        for: 2m
        labels:
          severity: warning
          team: backend
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
          team: backend
        annotations:
          summary: "JVM heap 사용률 85% 초과 (10분)"
          description: "Memory leak 또는 GC 비효율. heap dump 검토 후보."
```

## DB 기반 알림 (Prometheus 외)

DEAD state notification delivery는 메트릭이 없으므로 별도 cron + 쿼리로 감시:

```sql
SELECT count(*) FROM notification_deliveries
WHERE state = 'DEAD' AND updated_at > NOW() - INTERVAL 24 HOUR;
```

count > 0이면 운영자에게 알림 (이메일 또는 in-app).

## 후속

- 위 룰을 `prometheus/rules/`에 yaml로 commit + alertmanager 설정 plan.
- 알림 채널 (이메일, Slack, Telegram 등) 설정.
- Runbook 작성 (각 alert별 대응 절차).
```

- [ ] **Step 2: YAML 구문 sanity check**

각 yaml 블록을 manual review. 들여쓰기/콜론/리스트 매칭.

- [ ] **Step 3: 검증**

```bash
grep -c "^      - alert:" docs/operations/observability/alerts.md
```

기대: 6 이상.

---

## Task 5: `slos.md` 작성

**Files:** 신규 `docs/operations/observability/slos.md`

- [ ] **Step 1: 본문 작성**

```markdown
# SLO

ReadMates의 운영 목표와 측정 방법을 정의합니다. 본 문서의 SLO는 *목표*이며, 현재 달성치가 함께 기록되었다면 별도 표시합니다.

## SLO 작성 규약

각 SLO는 다음을 포함:

1. **정의** — 측정 대상, 임계, 윈도우.
2. **측정** — PromQL 또는 명시적 절차.
3. **에러 예산** — 위반 허용량.
4. **위반 시 행동**.
5. **근거** — 왜 이 임계인가.
6. **현재 측정치** — 가능하면 (없으면 *미측정* 표기).

## SLO-1: API availability

- **정의**: 30일 rolling window에서 `/api/**` 요청의 5xx ratio < 1%.
- **측정**:
  ```promql
  1 - (
    sum(increase(http_server_requests_seconds_count{uri=~"/api/.*", status=~"5.."}[30d]))
      / sum(increase(http_server_requests_seconds_count{uri=~"/api/.*"}[30d]))
  )
  ```
- **에러 예산**: 30일 window에서 1%. 초과 시 신규 기능 배포보다 안정화 우선.
- **위반 시**: post-mortem 작성 (SEV2 이상) → action item에서 근본 원인 추적.
- **근거**: 1%는 일반적 web service availability target의 보수적 기준. 사용자 100명, 사용자당 일평균 요청 10건 가정 시 일 10건/사용자 × 30일 × 1% = 사용자당 월 3건의 5xx. 우회 가능 + post-mortem 의무라는 의미.
- **현재**: 미측정 (Prometheus 스크래퍼 미배포).

## SLO-2: Read latency

- **정의**: 30일 rolling window에서 `GET /api/**` p95 < 500ms.
- **측정**:
  ```promql
  histogram_quantile(0.95,
    sum by (le) (rate(http_server_requests_seconds_bucket{uri=~"/api/.*", method="GET"}[30d])))
  ```
- **에러 예산**: 5% (즉, 95%만 < 500ms 만족).
- **위반 시**: slow query log + DB explain. ServerQueryBudgetTest 회귀 확인.
- **근거**: 500ms는 사용자 perceived snappiness 임계 (Nielsen 1-second rule의 보수적 변형). read는 사용자 직접 인지.
- **현재**: 미측정.

## SLO-3: Notification delivery latency

- **정의**: 30일 rolling window에서 outbox row 생성 → PUBLISHED transition까지 p95 < 5분.
- **측정**:
  - 직접 메트릭 부재. 간접 측정:
    ```sql
    SELECT
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY TIMESTAMPDIFF(SECOND, o.created_at, d.published_at))
    FROM notification_event_outbox o
    JOIN notification_deliveries d ON d.outbox_id = o.id
    WHERE o.created_at > NOW() - INTERVAL 30 DAY
      AND d.state = 'PUBLISHED';
    ```
    (테이블/컬럼명은 실제와 일치하도록 plan 실행 중 확인.)
- **에러 예산**: 5%.
- **위반 시**: backlog gauge 추이 + Kafka consumer lag 확인.
- **근거**: 알림은 사용자 흐름 외 비동기. 5분 이내면 *세션 직전 안내* 같은 use case에 충분.
- **현재**: 미측정. 후속 메트릭 도입 후 자동화 권고.

## SLO 보고

월 1회 (또는 incident 발생 시) SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`에 기록 (디렉토리 후속 신설).

## 후속

- SLO-3을 위한 직접 메트릭 (`notification_delivery_latency_seconds` histogram).
- Frontend 측 SLO (route load time) — RUM 도입 후.
- SLO 위반 시 자동 post-mortem trigger.
```

- [ ] **Step 2: 검증**

```bash
grep -c "^## SLO-" docs/operations/observability/slos.md
```

기대: 3 이상.

---

## Task 6: `docs/operations/README.md` 갱신

**Files:** 수정 `docs/operations/README.md` (post-mortem plan에서 생성된 파일)

- [ ] **Step 1: 파일 존재 확인**

```bash
test -f docs/operations/README.md && cat docs/operations/README.md
```

post-mortem plan을 먼저 실행하지 않은 경우, 이 파일이 없을 수 있다. 그 경우 spec의 "후속 (TBD)" 섹션에 명시된 대로 *post-mortem plan과 함께 실행* 권고. 단독 실행 시:

```bash
mkdir -p docs/operations
```

후 minimal README를 생성:

```markdown
# Operations

## 하위 문서

- [Post-mortems](postmortems/README.md) — (post-mortem plan에서 생성)
- [Observability](observability/README.md) — 메트릭/대시보드/알림/SLO.
```

- [ ] **Step 2: observability link 추가/확인**

post-mortem plan이 이미 실행되어 README가 있으면 다음 행을 추가:

```markdown
- [Observability](observability/README.md) — 메트릭/대시보드/알림/SLO.
```

- [ ] **Step 3: 검증**

```bash
grep "observability/README.md" docs/operations/README.md
```

기대: 1행.

---

## Task 7: 최종 검증

- [ ] **Step 1: 파일 구조**

```bash
ls docs/operations/observability/
```

기대: 5개 (README + 4 영역).

- [ ] **Step 2: 모든 메트릭 카탈로그 entry가 근원 코드 인용**

```bash
grep -c "server/.*\.kt" docs/operations/observability/metrics-catalog.md
```

기대: custom 메트릭 수와 일치.

- [ ] **Step 3: 모든 PromQL 블록 syntax sanity**

manual review 완료 후 ✓.

- [ ] **Step 4: 모든 YAML 블록 valid**

```bash
# 시스템에 yamllint이 있다면
yamllint docs/operations/observability/alerts.md || echo "yamllint 미설치 — manual review로 대체"
```

- [ ] **Step 5: 깨진 cross-link 없음**

```bash
grep -oE "\(([a-zA-Z0-9_./-]+\.md[^)]*)\)" docs/operations/observability/*.md \
  | sed -E 's/.*\(([^)]+)\).*/\1/' \
  | while read p; do
      # relative resolve from observability/ directory
      target="docs/operations/observability/$p"
      [[ "$p" == /* ]] && target="$p"
      if [[ "$p" == ../* ]]; then
        target="docs/operations/${p#../}"
      fi
      test -f "$target" 2>/dev/null && echo "OK: $p" || echo "CHECK: $p"
    done
```

CHECK 표시된 경로는 manual 검증.

- [ ] **Step 6: Public release**

```bash
./scripts/public-release-check.sh
./scripts/verify-public-release-fixtures.sh
```

기대: 통과.

- [ ] **Step 7: 커밋 분리**

```text
docs(ops): add observability runbook (metrics catalog, dashboards, alerts, SLOs)
```

(실제 커밋은 사용자 요청 시.)

---

## 위험과 완화 (실행 시점)

| 위험 | 완화 |
|------|------|
| `metrics-catalog.md`의 custom 메트릭이 grep으로 다 안 잡힘 (예: SpEL/derived) | Task 2 Step 1에서 추가 grep 패턴 (registry 직접 참조, `@Timed`, `@Counted` annotation 등) 보강. |
| PromQL/YAML이 syntactically invalid | manual review + (가능 시) `promtool check rules` 도입. 첫 라운드는 manual. |
| 권장 알림이 *실 환경에 false positive* 가능 | spec 명시 — alert 룰은 *후보*. 실 배포 전 baseline 측정 후 조정 권고. |
| post-mortem plan과 실행 순서 의존 | Task 6에서 두 시나리오 분기 처리. 단독 실행도 가능하게. |
| SLO-3 간접 측정 SQL이 실제 컬럼/테이블명과 어긋남 | Task 5 Step 1에서 `notification_event_outbox`, `notification_deliveries` 컬럼을 manual로 확인 (서버 코드 또는 마이그레이션 SQL). 어긋나면 SQL 수정. |

---

## 완료 조건

- [ ] `docs/operations/observability/`에 5개 파일.
- [ ] `docs/operations/README.md`에 observability link.
- [ ] 모든 custom 메트릭이 근원 코드 인용.
- [ ] 모든 PromQL/YAML 블록이 manual review 통과.
- [ ] `./scripts/public-release-check.sh` 통과.
