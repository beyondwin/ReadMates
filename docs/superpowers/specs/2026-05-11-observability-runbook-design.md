# Observability Runbook 설계

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: docs / portfolio · operations

## 목적

ReadMates의 observability(메트릭/로그/트레이스/대시보드/알림) 현황을 단일 진입점에서 발견 가능하게 만든다. 1순위 독자는 *"이 사람이 운영을 *측정 가능한* 형태로 다루는가"*를 평가하는 시니어 면접관, 2순위는 합류 후 oncall을 맡을 동료. 첫 라운드는 **현재 배포된 메트릭 인벤토리 + 권장 대시보드/알림 룰 + SLO 후보**를 문서화한다 (신규 메트릭 도입 없음).

## 현재 맥락

### 이미 배포된 observability 자산

- **Spring Boot Actuator + Micrometer + Prometheus registry** (`server/build.gradle.kts:23, 37`):
  - `/actuator/prometheus` endpoint으로 JVM/HTTP/JDBC/Hikari 표준 메트릭.
  - `/actuator/health` 헬스체크.
- **Custom gauges / counters**:
  - `CachedNotificationBacklogProvider` — 1분 주기로 outbox backlog count를 gauge로 export.
  - `bff_secret_rotation_audit` — DB row count로 회전 이력 추적 가능 (메트릭은 아니지만 query로 dashboard 구성 가능).
  - (추가 메트릭은 plan에서 grep으로 인벤토리화.)
- **Request tracing**:
  - Spring `RequestIdFilter` (정확한 위치는 plan에서 grep) — traceId가 모든 응답/로그에 부착.
  - `ApiErrorResponse.traceId` (shared/adapter/in/web/ApiErrorResponse.kt) — 에러 응답에도 traceId 포함.
- **로그**:
  - 표준 Spring Boot 로그 (logback). production은 OCI Compute에서 stdout → docker logs.
  - Cloudflare Pages function 로그는 Cloudflare dashboard에서 조회.
- **테스트 환경 관측**:
  - `QueryCountingDataSource` — 테스트에서 N+1 감지.
  - `MySqlExplainTestSupport` — 쿼리 플랜 분석.
  - `ServerQueryBudgetTest` — route별 query count 예산.

### 이미 배포된 자동 검증 (test=observability proxy)

- `MySqlQueryPlanTest`, `ServerQueryBudgetTest` — 성능 회귀를 *코드 머지 전에* 차단. 운영 alert의 부담을 시프트-레프트로 줄인 결과.
- `FrontendZodSchemaContractTest` — schema drift를 머지 전에 차단.

### 빠진 것

- **메트릭 카탈로그 단일 진입점**. Prometheus endpoint이 노출되지만, *어떤 메트릭이 의미 있는지*가 코드 외부에 정리되지 않음.
- **권장 대시보드 구성**. Grafana 같은 도구를 도입했는지 여부와 무관하게, *어떤 패널을 볼 것인지* 권장 구성이 없음.
- **알림 룰**. backlog가 X 이상이면, p99 latency가 Y 이상이면 등 임계 정책 부재.
- **SLO 정의**. "이 정도면 잘 운영된 것"의 합의 부재.
- **로그 검색 전략**. traceId가 있으나 검색 진입점/필드 매핑 가이드 없음.

## 결정

`docs/operations/observability/` 디렉토리를 신설하고, 다음 5개 문서로 구성한다:

```text
docs/operations/observability/
  README.md                        # 진입점 + 용어/스택
  metrics-catalog.md               # 메트릭 인벤토리 (이름/타입/라벨/의미/근원 코드)
  dashboards.md                    # 권장 패널 구성 + 쿼리 예시
  alerts.md                        # 알림 룰 후보 (Prometheus alertmanager 양식)
  slos.md                          # SLO 정의와 측정 방법
```

추가로 `docs/operations/README.md`(post-mortem plan에서 생성)에 observability 섹션 링크를 추가한다.

### `metrics-catalog.md` 형식

각 메트릭을 다음 표로 기술:

| 이름 | 타입 | 라벨 | 단위 | 의미 | 근원 코드 | 대시보드 패널 | 알림 룰 |
|------|------|------|------|------|----------|--------------|--------|

표준 actuator/JVM 메트릭은 *그룹으로* 묶고, 도메인 특정 custom 메트릭만 row 단위로 상세 기술.

#### 도메인 메트릭 후보 (현재)

- `notification_outbox_backlog` (gauge) — `CachedNotificationBacklogProvider`. unbounded 자라면 consumer 죽음 신호.
- (그 외 custom 메트릭은 plan 실행 중 grep으로 발견 후 추가.)

#### 표준 메트릭 그룹

- HTTP: `http_server_requests_seconds_*` (count/sum/max, by uri/status/method).
- JVM: `jvm_memory_*`, `jvm_gc_*`, `jvm_threads_*`.
- HikariCP: `hikaricp_connections_*`, `hikaricp_connections_pending`, `hikaricp_connections_acquire_seconds_*`.
- Logback: `logback_events_total{level=...}`.

### `dashboards.md` 형식

Grafana 도입 가정 (또는 다른 호환 도구). 패널별로:

```markdown
### Panel: <이름>

- 목적: ...
- 메트릭: ...
- 쿼리(PromQL):
  ```promql
  histogram_quantile(0.99, sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m])))
  ```
- 임계 (참고): p99 > 500ms이면 조사.
```

#### 권장 대시보드 (3개)

1. **Service Health** — HTTP traffic, error rate, p50/p95/p99, JVM memory/GC, Hikari connection pool.
2. **Notification Pipeline** — outbox backlog, delivery state distribution, consumer lag (fetch from Kafka if available).
3. **Database** — query duration histogram, connection wait, slow queries (logback events level=WARN/ERROR).

### `alerts.md` 형식

```yaml
# 예시 (Prometheus alertmanager rule 형식)
groups:
  - name: readmates.notification
    rules:
      - alert: NotificationOutboxBacklogHigh
        expr: notification_outbox_backlog > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Notification outbox backlog over 100 for 10 minutes"
          runbook: "docs/operations/runbooks/notification-backlog.md"
```

#### 첫 라운드 알림 후보 (4개)

- `NotificationOutboxBacklogHigh` (warning, 10m).
- `NotificationDeliveryDeadStateAppearing` (info, on first DEAD row in 24h).
- `HttpErrorRateHigh` (critical, 5xx rate > 1% for 5m).
- `HikariConnectionPoolExhaustionImminent` (warning, pending > 0 for 2m).

### `slos.md` 형식

각 SLO:

- 정의 (예: "current session route는 95%의 요청에 200ms 안에 응답한다").
- 측정 메트릭과 PromQL.
- 측정 윈도우 (예: 30일).
- 에러 예산 정책.
- 위반 시 행동.

#### 첫 라운드 SLO 후보 (3개)

1. **API availability** — `/api/**` 5xx ratio < 1% (30d window).
2. **Read latency** — `GET /api/**` p95 < 500ms (30d).
3. **Notification delivery latency** — outbox row 생성 → PUBLISHED transition p95 < 5min (30d). (현재 메트릭이 직접 측정하지 않으면 후속 메트릭 추가 필요 — *간접 측정* 방법을 spec에 명시.)

SLO는 *목표*이지 *현재 달성치*가 아님을 명시. 현재 측정치가 있으면 함께 기록.

## 비목표

- 신규 메트릭 도입. 첫 라운드는 *기존 메트릭 인벤토리화 + 권장 대시보드/알림 정의*. 신규 메트릭이 필요하다고 판단되면 별도 spec.
- alertmanager 실 배포. 본 작업은 *룰 정의*만. 배포는 별도 작업 (운영 비용/통보 채널 설정 필요).
- Grafana/Prometheus 인프라 자체 구축. 현재 `/actuator/prometheus` endpoint이 노출됨을 가정. 스크래퍼는 Grafana Cloud free tier 또는 Prometheus self-host 권장 (배포 가이드는 후속).
- distributed tracing (Jaeger/Tempo) 도입.
- Sentry/Datadog 도입.
- 영어 번역.

## 검증

작성 완료 시:

1. `docs/operations/observability/`에 5개 파일 (README + 4 영역).
2. `metrics-catalog.md`의 모든 custom 메트릭 entry가 *근원 코드 path:line*을 보유.
3. `dashboards.md`의 모든 PromQL 쿼리가 표기상 valid (구문 검사).
4. `alerts.md`의 alertmanager rule이 valid YAML.
5. `slos.md`의 각 SLO가 *측정 가능*함 (PromQL 또는 다른 명시적 측정 절차).
6. `docs/operations/README.md`가 observability 섹션을 link.
7. README(루트)에서 observability 진입 가능 (직접 link 또는 docs/operations/README.md 경유).
8. `./scripts/public-release-check.sh` 통과.

## 위험과 완화

| 위험 | 완화 |
|------|------|
| 권장 대시보드/알림이 *현재 배포되지 않은 도구*를 가정 → 면접관에게 *aspirational*로 보임 | 각 문서 상단에 "현재 상태: 메트릭 endpoint 노출 + 카탈로그/룰 정의. 대시보드 인프라 배포는 후속" 명시. honesty가 깊이를 더한다. |
| 인용 코드 라인 drift | 라인보다 함수/심볼 우선 인용. |
| Custom 메트릭이 grep 결과보다 많거나 적음 | plan Task에서 sub-task로 grep 결과를 모두 검토 후 카탈로그 작성. *추정* 항목 금지. |
| SLO가 임의 숫자로 보임 | 각 SLO에 *근거* 한 줄 (예: "p95 < 500ms는 사용자 perceived snappiness 임계로 통상 사용"). 측정치가 있으면 비교. |
| 알림 룰이 *모든 환경*에 동일 적용되어 false positive | severity별로 환경(dev/staging/prod) suffix 권고. 첫 라운드는 prod-only 가정 명시. |

## 대안과 기각 사유

| 대안 | 기각 이유 |
|------|----------|
| README에 inline 섹션만 | 5개 영역을 inline화하면 README 무거워짐. 운영 진입점을 별도 폴더로. |
| `docs/development/observability/` | 이건 운영 영역. development와 분리. |
| Grafana JSON dashboard export 파일 | 도구 종속. PromQL + 패널 의도를 마크다운으로 적으면 도구 무관. |
| OpenTelemetry 도입 후 문서화 | 인프라 비용 + 학습 비용. 현재 규모에 과잉. 도입 시 별도 spec. |

## 후속 (범위 밖)

- alertmanager / Prometheus 실 배포 가이드 (`docs/deploy/observability-stack.md`).
- runbook (`docs/operations/runbooks/`) — 알림이 발화되었을 때의 대응 절차.
- Grafana dashboard JSON export.
- Notification delivery latency 메트릭 *직접 측정* (현재 간접) — outbox row 생성 timestamp와 PUBLISHED transition timestamp 비교.
- Frontend RUM (real user monitoring) — Cloudflare Web Analytics 또는 Sentry Browser SDK.
- distributed tracing (Tempo/Jaeger).
- 영어 번역.
