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

- **정의**: 30일 rolling window에서 outbox row 생성 → PUBLISHED 상태 전환까지 p95 < 5분.
- **측정**:
  - 직접 메트릭 부재. 간접 측정 (MySQL 8.x — PERCENTILE_CONT 미지원이므로 변환 함수가 필요):
    ```sql
    -- Approximation: 30일 내 PUBLISHED 처리된 outbox 행의 latency 분포 (직접 PERCENTILE 미지원).
    -- MySQL 환경에서는 window 함수로 95번째 percentile에 가까운 행을 추정한다.
    WITH latencies AS (
      SELECT
        TIMESTAMPDIFF(SECOND, created_at, published_at) AS latency_s,
        ROW_NUMBER() OVER (ORDER BY TIMESTAMPDIFF(SECOND, created_at, published_at)) AS rn,
        COUNT(*) OVER () AS total
      FROM notification_event_outbox
      WHERE status = 'PUBLISHED'
        AND published_at IS NOT NULL
        AND created_at > NOW() - INTERVAL 30 DAY
    )
    SELECT latency_s AS p95_latency_seconds
    FROM latencies
    WHERE rn = CEIL(total * 0.95);
    ```
    컬럼/테이블 확인 근원: `server/src/main/resources/db/mysql/migration/V20__kafka_notification_pipeline.sql` (`notification_event_outbox` 정의: `created_at`, `published_at`, `status`).
- **에러 예산**: 5%.
- **위반 시**: `readmates_notifications_outbox_backlog{status="pending"}` gauge 추이 + Kafka consumer 로그 확인. backlog가 정상인데 latency가 늘면 consumer 처리량 부족, backlog도 증가하면 producer-consumer 매치 실패.
- **근거**: 알림은 사용자 흐름 외 비동기. 5분 이내면 *세션 직전 안내* 같은 use case에 충분.
- **현재**: 미측정. 후속 메트릭 도입 후 자동화 권고 (`notification_delivery_latency_seconds` histogram in metrics-catalog.md 후속 후보 참조).

## SLO 보고

월 1회 (또는 incident 발생 시) SLO 측정치를 `docs/operations/slo-reports/YYYY-MM.md`에 기록 (디렉토리 후속 신설).

## 후속

- SLO-3을 위한 직접 메트릭 (`notification_delivery_latency_seconds` histogram).
- Frontend 측 SLO (route load time) — RUM 도입 후.
- SLO 위반 시 자동 post-mortem trigger.
