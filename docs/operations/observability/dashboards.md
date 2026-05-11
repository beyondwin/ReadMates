# 권장 대시보드

본 문서는 Grafana(또는 호환 도구)에서 구성할 패널과 PromQL 쿼리를 정리합니다. 실 배포 dashboard JSON은 도구 도입 후 export 권장.

## Dashboard 1 — Service Health
<a id="service-health"></a>

### Panel: HTTP request rate (per route)
- 목적: 라우트별 요청량 추이 파악. 급증/급감 시 배포 또는 클라이언트 이상 징후.
- 메트릭: `http_server_requests_seconds_count`
- PromQL:
  ```promql
  sum by (uri) (rate(http_server_requests_seconds_count[1m]))
  ```
- 임계 (참고): 평소 baseline의 ±50% 이상 변화 시 조사.

### Panel: HTTP error rate
- 목적: 5xx 비율 모니터링. 1%를 초과하면 서비스 이상.
- 메트릭: `http_server_requests_seconds_count`
- PromQL:
  ```promql
  sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
    / sum(rate(http_server_requests_seconds_count[5m]))
  ```
- 임계 (참고): > 1%이면 alert.

### Panel: HTTP latency p50/p95/p99 (by route)
- 목적: 엔드포인트별 응답 지연 분포 추적.
- 메트릭: `http_server_requests_seconds_bucket`
- PromQL:
  ```promql
  histogram_quantile(0.99,
    sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m])))
  ```
- 임계 (참고): read endpoint p95 > 500ms 지속 시 조사.

### Panel: JVM heap 사용률
- 목적: 힙 메모리 사용량 추적. 80% 이상 지속 시 OOM 위험.
- 메트릭: `jvm_memory_used_bytes`, `jvm_memory_max_bytes`
- PromQL:
  ```promql
  jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"}
  ```
- 임계 (참고): > 80% 지속 시 조사.

### Panel: GC pause 평균
- 목적: GC 일시 정지 시간 추적. 과도한 GC는 latency spike 유발.
- 메트릭: `jvm_gc_pause_seconds_sum`, `jvm_gc_pause_seconds_count`
- PromQL:
  ```promql
  rate(jvm_gc_pause_seconds_sum[5m]) / rate(jvm_gc_pause_seconds_count[5m])
  ```
- 임계 (참고): 평균 > 200ms 지속 시 조사.

### Panel: Hikari connection pool
- 목적: DB 커넥션 풀 상태. pending 발생 시 pool exhaustion 전조.
- 메트릭: `hikaricp_connections_active`, `hikaricp_connections_pending`
- PromQL:
  ```promql
  hikaricp_connections_active
  ```
  ```promql
  hikaricp_connections_pending
  ```
- 임계 (참고): `pending > 0`이 2분 이상 지속.

## Dashboard 2 — Notification Pipeline
<a id="notification-pipeline"></a>

### Panel: Outbox backlog (status별)
- 목적: notification_deliveries 테이블의 status별 적체 행 수. 증가 지속 시 발송 장애.
- 메트릭: `readmates_notifications_outbox_backlog`
- PromQL:
  ```promql
  readmates_notifications_outbox_backlog
  ```
  또는 status별 분리:
  ```promql
  readmates_notifications_outbox_backlog{status="pending"}
  ```
  ```promql
  readmates_notifications_outbox_backlog{status="failed"}
  ```
  ```promql
  readmates_notifications_outbox_backlog{status="dead"}
  ```
  ```promql
  readmates_notifications_outbox_backlog{status="sending"}
  ```
- 임계 (참고): `pending` > 100이 5분 이상 지속, 또는 `dead` > 0 지속 시 조사.

### Panel: Notification send rate (event_type별)
- 목적: 알림 발송 성공 처리량 추적. 기대 발송 수에 비해 급감 시 이상.
- 메트릭: `readmates_notifications_sent_total`
- PromQL:
  ```promql
  sum by (event_type) (rate(readmates_notifications_sent_total[5m]))
  ```
- 임계 (참고): 평소 baseline 대비 50% 이상 감소 지속 시 조사.

### Panel: Notification failure rate (event_type별)
- 목적: 알림 발송 실패(재시도 가능) 비율. 지속 증가 시 다운스트림 장애 신호.
- 메트릭: `readmates_notifications_failed_total`
- PromQL:
  ```promql
  sum by (event_type) (rate(readmates_notifications_failed_total[5m]))
  ```
- 임계 (참고): > 0.5/min 지속 시 조사.

### Panel: Dead-letter rate (event_type별)
- 목적: 재시도 포기 건수. 0이 정상. 발생 시 즉시 조사.
- 메트릭: `readmates_notifications_dead_total`
- PromQL:
  ```promql
  sum by (event_type) (rate(readmates_notifications_dead_total[5m]))
  ```
- 임계 (참고): > 0/min 지속 시 alert.

### Panel: Logback ERROR (notification 서비스 컨텍스트)
- 목적: ERROR 레벨 로그 발생 추이. 알림 처리 중 예외 빈도 파악.
- 메트릭: `logback_events_total`
- PromQL:
  ```promql
  rate(logback_events_total{level="error"}[5m])
  ```
- 임계 (참고): baseline 대비 급증 시 조사 (절대값 임계는 운영 경험 기반으로 조정).

### Panel: Delivery state 분포 (SQL)
- 목적: notification_deliveries 테이블 status 분포 수동 확인용 (Prometheus 메트릭 아님).
- 쿼리 (MySQL):
  ```sql
  SELECT status, count(*) FROM notification_deliveries GROUP BY status;
  ```
- 임계 (참고): `dead` 행 존재 시 즉시 조사.

### Panel: DEAD state 발생 추이
- 목적: dead-letter 누적 추이 확인. 전용 Grafana alert 기반으로 활용.
- 메트릭: `readmates_notifications_dead_total`
- PromQL:
  ```promql
  increase(readmates_notifications_dead_total[1h])
  ```
- 임계 (참고): 1시간 내 increase > 0 시 조사.

## Dashboard 3 — Database
<a id="database"></a>

### Panel: HTTP request → DB query count (by route)
- 목적: 라우트별 DB 쿼리 수 추적 (현재 측정 메트릭 부재).
- 메트릭: 없음 — `QueryCountingDataSource`는 테스트 전용. 운영 dashboard 후속 메트릭 후보.
- 임계 (참고): 조사 기준 미정 (메트릭 미구현).

### Panel: MySQL slow query
- 목적: 슬로우 쿼리 발생 빈도 파악.
- 쿼리: MySQL slow log 또는 `performance_schema.events_statements_summary_by_digest` (HeatWave 권한 필요).
- 임계 (참고): 조사 기준 미정 (운영 환경 기준으로 조정 필요).

### Panel: Hikari acquire time
- 목적: 커넥션 획득 지연 최대값. 높은 값은 pool 경합 또는 DB 부하 신호.
- 메트릭: `hikaricp_connections_acquire_seconds_max`
- PromQL:
  ```promql
  hikaricp_connections_acquire_seconds_max
  ```
- 임계 (참고): > 100ms 지속 시 조사.

## Dashboard 4 — Redis Cache
<a id="redis-cache"></a>

### Panel: Notes cache hit/miss ratio
- 목적: Notes Redis 캐시 효율성 추적. 비율 급락 시 캐시 무효화 과다 또는 Redis 장애.
- 메트릭: `readmates_notes_cache_hit_total`, `readmates_notes_cache_miss_total`
- PromQL:
  ```promql
  sum by (scope) (rate(readmates_notes_cache_hit_total[5m]))
    / (sum by (scope) (rate(readmates_notes_cache_hit_total[5m]))
       + sum by (scope) (rate(readmates_notes_cache_miss_total[5m])))
  ```
- 임계 (참고): hit ratio < 0.5 지속 시 조사.

### Panel: Public read cache hit/miss ratio
- 목적: Public read Redis 캐시 효율성 추적.
- 메트릭: `readmates_public_cache_hit_total`, `readmates_public_cache_miss_total`
- PromQL:
  ```promql
  sum by (scope) (rate(readmates_public_cache_hit_total[5m]))
    / (sum by (scope) (rate(readmates_public_cache_hit_total[5m]))
       + sum by (scope) (rate(readmates_public_cache_miss_total[5m])))
  ```
- 임계 (참고): hit ratio < 0.5 지속 시 조사.

### Panel: Auth session cache hit/miss ratio
- 목적: Auth session Redis 캐시 효율성 추적.
- 메트릭: `readmates_auth_session_cache_hit_total`, `readmates_auth_session_cache_miss_total`
- PromQL:
  ```promql
  rate(readmates_auth_session_cache_hit_total[5m])
    / (rate(readmates_auth_session_cache_hit_total[5m])
       + rate(readmates_auth_session_cache_miss_total[5m]))
  ```
- 임계 (참고): hit ratio < 0.7 지속 시 조사.

### Panel: Redis fallbacks rate (feature별)
- 목적: Redis 오류 발생 시 graceful fallback 처리 빈도. 증가 지속 시 Redis 불안정 신호.
- 메트릭: `readmates_redis_fallbacks_total`
- PromQL:
  ```promql
  sum by (feature) (rate(readmates_redis_fallbacks_total[5m]))
  ```
- 임계 (참고): > 0.1/sec 지속 시 Redis 불안정 — 즉시 조사.

### Panel: Redis operation errors rate (feature/operation별)
- 목적: Redis 명령 실행 오류 횟수. 오류 유형 및 어댑터별 분류.
- 메트릭: `readmates_redis_operation_errors_total`
- PromQL:
  ```promql
  sum by (feature, operation) (rate(readmates_redis_operation_errors_total[5m]))
  ```
- 임계 (참고): > 0 지속 시 조사. fallbacks rate와 함께 확인.

### Panel: Rate-limit denied rate (sensitive별)
- 목적: 요청 차단 빈도 추적. 민감 엔드포인트의 급증은 공격 또는 클라이언트 버그 신호.
- 메트릭: `readmates_rate_limit_denied_total`
- PromQL:
  ```promql
  sum by (sensitive) (rate(readmates_rate_limit_denied_total[5m]))
  ```
- 임계 (참고): `sensitive="true"` baseline 대비 큰 변화 시 조사.

## 패널 작성 규약

- 모든 panel에 *임계 (참고)* 를 명시. 임계가 없으면 "조사 기준 미정"으로 적기.
- PromQL은 *복사-붙여넣기 가능*하게 단일 쿼리.
- 도구 종속 (Grafana variables 등)은 일반화된 PromQL 위주로.
- Micrometer 네이밍 규칙: `.`은 `_`으로 변환, counter는 `_total` suffix 자동 부착. 예: `readmates.notifications.sent` → `readmates_notifications_sent_total`.
