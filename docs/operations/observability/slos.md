# SLO

> 운영 흐름은 [Observability README](README.md)에서 시작합니다. 배포 전후 검증은 [Deploy observability check](../runbooks/deploy-observability-check.md)를 따릅니다.

ReadMates의 운영 목표(SLO)와 측정 방법입니다. 기준은 `server/src/main/resources/slo/slos.yaml`이고, 이 문서는 사람이 읽기 위한 view입니다. `SloCatalogDocsConsistencyTest`가 yaml의 모든 SLO ID가 이 문서에 있는지, 이 문서에 없는 ID가 없는지 검사합니다. PromQL 문구는 자동 검사하지 않으므로 yaml을 바꾸면 이 문서도 함께 고칩니다.

## 한눈에 보기

| SLO ID | 목표 | Window | 메트릭 상태 |
| --- | --- | --- | --- |
| `api_availability` | 5xx 제외 비율 ≥ 99% | 30d | 측정 가능 |
| `api_read_latency_p95` | GET p95 < 500ms | 30d | HTTP histogram bucket 필요 (아래 참고) |
| `bff_api_p95` | BFF→Spring p95 < 800ms | 7d | 내보내는 코드 없음 |
| `frontend_route_load_p95` | route load p95 < 1500ms | 7d | 측정 가능 |
| `frontend_runtime_error_ratio` | 오류 비율 < 1% | 7d | 측정 가능 |
| `login_success_ratio` | 로그인 성공률 ≥ 99% | 7d | 내보내는 코드 없음 |
| `notification_dispatch_success_ratio` | relay 성공 비율 ≥ 99% | 7d | 측정 가능 |
| `notification_delivery_latency_p95` | outbox 생성→PUBLISHED p95 < 5분 | 30d | 측정 가능 |

"내보내는 코드 없음"은 `slos.yaml`이 참조하는 메트릭을 현재 server 코드가 만들지 않는다는 뜻입니다. 이 SLO는 결과가 비어 있어도 위반이나 성공으로 해석하지 않습니다. 월간 보고서에서는 `CHECK`로 남깁니다.

## SLO 작성 규약

각 SLO는 다음을 포함:

1. **정의** — 측정 대상, 임계, 윈도우.
2. **측정** — PromQL 또는 명시적 절차.
3. **에러 예산** — 위반 허용량.
4. **위반 시 행동**.
5. **근거** — 왜 이 임계인가.
6. **현재** — 지금 측정 가능한지와 이유.

## `api_availability`

- **정의**: 30일 rolling window에서 `/api/**` 요청의 5xx ratio < 1% (objective 0.99).
- **측정**:
  ```promql
  sum(rate(http_server_requests_seconds_count{uri=~"/api/.*", status!~"5.."}[5m]))
    /
  sum(rate(http_server_requests_seconds_count{uri=~"/api/.*"}[5m]))
  ```
- **에러 예산**: 30일 window에서 1%. 초과 시 신규 기능 배포보다 안정화 우선.
- **위반 시 행동**: post-mortem 작성 (SEV2 이상) → action item에서 근본 원인 추적.
- **근거**: 1%는 일반적 web service availability target의 보수적 기준. 사용자 100명, 사용자당 일평균 요청 10건 가정 시
  일 10건/사용자 × 30일 × 1% = 사용자당 월 3건의 5xx. 우회 가능 + post-mortem 의무라는 의미.
- **현재**: 측정 가능.

## `api_read_latency_p95`

- **정의**: 30일 rolling window에서 `GET /api/**` p95 < 500ms.
- **측정**:
  ```promql
  histogram_quantile(0.95,
    sum by (le) (rate(http_server_requests_seconds_bucket{uri=~"/api/.*", method="GET"}[5m]))) * 1000
  ```
- **에러 예산**: 5% (즉, 95%만 < 500ms 만족).
- **위반 시 행동**: slow query log + DB explain. ServerQueryBudgetTest 회귀 확인.
- **근거**: 500ms는 사용자 perceived snappiness 임계 (Nielsen 1-second rule의 보수적 변형). read는 사용자 직접 인지.
- **현재**: `http_server_requests_seconds_bucket`이 있어야 측정됩니다. `application.yml`에 HTTP histogram 설정이 없어 bucket이 없을 수 있습니다. [메트릭 카탈로그 HTTP](metrics-catalog.md#http) 참고.

## `bff_api_p95`

- **정의**: 7일 rolling window에서 BFF→Spring 호출 p95 < 800ms (custom timer 기반).
- **측정**:
  ```promql
  histogram_quantile(0.95, sum(rate(readmates_bff_api_latency_seconds_bucket[5m])) by (le)) * 1000
  ```
- **에러 예산**: 5%.
- **위반 시 행동**: BFF 측 로그 + 다운스트림 Spring p95(`api_read_latency_p95`) 동시 확인. 두 값이 같이 튀면 서버 측,
  BFF만 튀면 fetch/네트워크 hop 의심.
- **근거**: BFF는 사용자 액션 → 서버 응답 사이에 추가 hop을 만들기 때문에 서버 p95(500ms)보다 살짝 느슨한 800ms로 설정.
- **현재**: 측정 불가. `readmates_bff_api_latency_seconds`를 내보내는 코드가 없습니다(BFF는 Cloudflare Pages Functions라 Spring Micrometer로 잡히지 않음).

## `frontend_route_load_p95`

- **정의**: 7일 rolling window에서 browser route load p95 < 1500ms.
- **측정**:
  ```promql
  histogram_quantile(0.95,
    sum by (le) (rate(readmates_frontend_route_load_seconds_bucket[5m]))) * 1000
  ```
- **에러 예산**: 측정 시작 단계. 첫 production baseline이 쌓일 때까지 release hard gate로 쓰지 않는다.
- **위반 시 행동**: frontend bundle/chunk 변화, route lazy loading, CDN/cache, API failure panel, browser console reproduction 순서로 확인한다.
- **근거**: 서버 read p95보다 느슨한 browser route-level threshold로 초기 baseline을 잡는다.
- **현재**: 측정 가능.

## `frontend_runtime_error_ratio`

- **정의**: 7일 rolling window에서 route load 대비 runtime error 비율 < 1%.
- **측정**:
  ```promql
  sum(rate(readmates_frontend_runtime_errors_total[5m]))
    /
  sum(rate(readmates_frontend_route_load_seconds_count[5m]))
  ```
- **에러 예산**: 측정 시작 단계. 반복 error code와 route pattern이 보이면 우선 triage한다.
- **위반 시 행동**: 최근 frontend deploy, route error boundary, API failure panel, user-visible route fallback을 확인한다.
- **근거**: 서버 5xx가 없어도 사용자가 흰 화면이나 route fallback을 겪는 blind spot을 닫기 위한 baseline.
- **현재**: 측정 가능. yaml은 good = route load − runtime error로 계산합니다.

## `login_success_ratio`

- **정의**: 7일 rolling window에서 Google OAuth 로그인 성공률 > 99% (objective 0.99).
- **측정**:
  ```promql
  sum(rate(readmates_login_total{result="success"}[5m]))
    /
  sum(rate(readmates_login_total[5m]))
  ```
- **에러 예산**: 7일 window 기준 1%. 일시적 IdP 장애는 면책 (incident log에 명시).
- **위반 시 행동**: Google IdP status page + `readmates_login_total{result="failure"}` 분포 확인. 우리 측 OAuth client
  설정 회귀가 의심되면 가장 최근 배포 롤백 후보.
- **근거**: 로그인 실패는 사용자가 첫 인터랙션에서 막히므로 다른 어떤 임계보다 엄격. 99% = 100회 중 1회 허용.
- **현재**: 측정 불가. `readmates_login_total`을 내보내는 코드가 없습니다.

## `notification_dispatch_success_ratio`

- **정의**: 7일 rolling window에서 모든 고정 relay 결과(`success`, `failure`, `dead`, `missing_payload`, `expired`, `stale_lease`) 중 `success` 비율 > 99% (objective 0.99).
- **측정**:
  ```promql
  (sum(rate(readmates_outbox_publish_total{result="success"}[5m])) or vector(0))
    /
  clamp_min((sum(rate(readmates_outbox_publish_total[5m])) or vector(0)), 1e-9)
  ```
- **에러 예산**: 7일 window 기준 1%.
- **위반 시 행동**: `sum by (result) (rate(readmates_outbox_publish_total[5m]))`와 `readmates_notifications_outbox_backlog`의 `pending|failed|dead|publishing`을 함께 확인합니다. 이 counter에는 `event_type` tag가 없으므로 존재하지 않는 tag로 원인을 추론하지 않습니다.
- **근거**: 알림 발송 실패는 사용자 흐름과 비동기이지만 누락 시 신뢰가 무너지므로 99% 유지.
- **현재**: 측정 가능. 해석은 문서 끝 메모 참고.

## `notification_delivery_latency_p95`

- **정의**: 30일 rolling window에서 `notification_event_outbox` row 생성 → PUBLISHED 상태 전환까지 p95 < 5분 (300,000ms).
- **측정**:
  ```promql
  histogram_quantile(0.95,
    sum by (le) (rate(readmates_notifications_delivery_latency_seconds_bucket[5m]))) * 1000
  ```
  히스토그램은 `NotificationRelayService`가 `markPublished` CAS 성공 직후
  `ReadmatesOperationalMetrics.recordDeliveryLatency(eventType, item.createdAt → publishedAt)`로 기록한다.
  컬럼 근원: `server/src/main/resources/db/mysql/migration/V20__kafka_notification_pipeline.sql`
  (`notification_event_outbox` 정의: `created_at`, `published_at`, `status`).
- **에러 예산**: 5%.
- **위반 시 행동**: `readmates_notifications_outbox_backlog{status="pending"}` gauge 추이 + Kafka consumer 로그 확인.
  backlog가 정상인데 latency가 늘면 consumer 처리량 부족, backlog도 증가하면 producer-consumer 매치 실패.
- **근거**: 알림은 사용자 흐름 외 비동기. 5분 이내면 *세션 직전 안내* 같은 use case에 충분.
- **현재**: 측정 가능.

## SLO 보고

월 1회(또는 incident 뒤) `scripts/generate-slo-report.py`로 측정치를 `docs/operations/slo-reports/YYYY-MM.md`에 기록합니다. 디렉토리는 아직 없으므로 첫 보고서 때 만듭니다. 절차는 [SLO monthly report runbook](../runbooks/slo-monthly-report.md)입니다.

## 후속

- 전체 script 로드 실패를 잡는 외부 blackbox/synthetic check.
- SLO 위반 시 자동 post-mortem trigger.

## 해석 메모: notification dispatch

Notification dispatch success ratio는 `readmates_outbox_publish_total`의 모든 고정 결과를 분모로 사용합니다. Lazy counter가 아직 등록되지 않은 aggregate는 `or vector(0)`으로 0을 채우고, per-second rate 분모의 `clamp_min(..., 1e-9)`은 0으로 나누기만 막으면서 5분에 한 건인 정상 저빈도 traffic의 비율을 보존합니다. 따라서 series가 하나도 없으면 SLO/Grafana ratio는 0이며 성공 증거가 아닙니다. Admin health도 정상 Prometheus 응답의 0은 `CRIT`로 평가하고, transport 실패나 빈 query result만 `UNKNOWN(no_data)`로 평가합니다. Scrape 또는 backlog observation 실패를 성공 증거로 바꾸지 않으며, `stale_lease`는 uncommitted CAS outcome이고 event-outbox와 delivery backlog는 별도 운영 신호입니다.
