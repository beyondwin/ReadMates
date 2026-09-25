# Correlation ID Lookup Runbook

`requestId` 하나로 BFF, Spring API, notification outbox row, Kafka header, consumer 로그를 잇는 절차입니다.

## 언제 쓰나

- 사용자가 실패한 동작의 request id(`X-Readmates-Request-Id` 응답 헤더나 에러 응답 `traceId`)를 알려줄 때.
- Grafana/Prometheus에서 spike를 보고 같은 시간대의 대표 요청 로그가 필요할 때.
- notification outbox row가 `FAILED`/`DEAD`이고 원래 요청 맥락이 필요할 때.

## 알 수 있는 것과 없는 것

- 알 수 있음: 같은 `requestId`로 로그 줄과 일부 비동기 작업이 한 요청에서 나왔는지. 기능 영역, 상태, event type, 시각으로 조사 범위를 좁힐 수 있습니다.
- 알 수 없음: 운영 로그 보존이 건강한지, 모든 scheduled/async 경로에 upstream request id가 있는지. 심각도는 메트릭으로 따로 판단합니다.
- `requestId`는 로그 조회용 ID입니다. API → Kafka → AI provider 구간은 W3C trace ID(Tempo)로 따로 이어집니다.

## 1. 증상 확인

넓은 문제면 메트릭을 먼저 봅니다. "한 명이 한 번 실패"와 "지금 서비스가 나쁨"을 나누기 위해서입니다.

- HTTP 5xx 비율 또는 p95 latency 상승
- `hikaricp_connections_pending > 0`
- `readmates_notifications_outbox_backlog{status="pending"}` 증가
- Redis fallback/operation error rate 증가
- JVM heap이나 GC pause가 평소보다 계속 높음

## 2. 서버 로그에서 requestId 찾기

서버는 compose 서비스 `readmates-api`로 돌고, 로그는 한 줄에 JSON 하나입니다. VM에서 실행합니다.

```bash
sudo docker compose -f /opt/readmates/compose.yml logs --no-log-prefix --since 10m readmates-api \
  | jq -cR 'fromjson? | select(.requestId == "<request-id>")'
```

시각을 알면 범위를 좁힙니다.

```bash
sudo docker compose -f /opt/readmates/compose.yml logs --no-log-prefix \
  --since 2026-06-23T14:00:00Z --until 2026-06-23T14:10:00Z readmates-api \
  | jq -cR 'fromjson? | select(.requestId == "<request-id>")'
```

볼 만한 field: `ts`, `level`, `logger`, `msg`, `requestId`, `traceId`, 그리고 있을 수 있는 `clubSlug`, `sessionId`, `actorId`, `source`, `eventType`.

회원 개인정보가 담긴 로그 원문을 공개 문서나 ticket에 붙이지 않습니다.

## 3. Notification row 확인

알림 관련 incident일 때만 합니다.

```sql
SELECT id, event_type, status, attempt_count, next_attempt_at, locked_at,
       last_error, created_at, published_at, updated_at, request_id
FROM notification_event_outbox
WHERE request_id = '<request-id>';

SELECT id, created_at, consumed_at, consumed_event_id, request_id
FROM notification_manual_dispatch_previews
WHERE request_id = '<request-id>';

SELECT id, event_id, event_type, audience, created_at, request_id
FROM notification_manual_dispatches
WHERE request_id = '<request-id>';
```

해석:

- outbox `PENDING`, `PUBLISHING`, `FAILED`, `DEAD`는 relay/Kafka 발행 문제입니다. 이것만으로 SMTP 발송 실패라고 보지 않습니다.
- outbox `DEAD`는 payload 누락, event deadline, 재시도 소진 중 어떤 이유인지 확인합니다. 원인을 없애기 전에는 replay나 새 event를 만들지 않습니다.
- row가 없어도 정상일 수 있습니다. 그 요청이 알림 작업을 만들지 않았다면 그렇습니다.

event ID가 있으면 delivery를 따로 봅니다.

```sql
SELECT id, event_id, channel, status, attempt_count, next_attempt_at, locked_at,
       last_error, created_at, updated_at
FROM notification_deliveries
WHERE event_id IN (
  SELECT id FROM notification_event_outbox WHERE request_id = '<request-id>'
);
```

시간 판단:

- deadline = row `created_at` + 현재 배포값 `READMATES_NOTIFICATION_EVENT_MAX_AGE` 또는 `READMATES_NOTIFICATION_DELIVERY_MAX_AGE`. 현재 UTC가 그 시각 이상이면 만료입니다. 기본값 `24h`를 실제 배포값으로 가정하지 않습니다.
- `next_attempt_at`은 다음 재시도 예약 시각이지 deadline이 아닙니다.
- `locked_at`은 `READMATES_NOTIFICATION_CLAIM_LEASE`와 함께 stale 여부를 판단합니다.
- `last_error`는 bounded safe 값으로만 다룹니다. raw provider 응답을 ticket에 복사하지 않습니다.

### Delivery 복구 경로

delivery `DEAD`는 failure kind, attempt/deadline, lease, 허용된 provider/recipient 증거를 확인한 뒤 정확한 대상만 복구합니다. 세 경로는 서로 대신하지 않습니다.

| 경로 | 누가 | 동작 |
| --- | --- | --- |
| Host restore `POST /api/host/notifications/items/{id}/restore` | 해당 클럽 host | EMAIL delivery 한 건을 `PENDING`으로 되돌리고 `next_attempt_at`을 지금으로 설정. 새 event를 만들지 않음 |
| Platform admin replay (preview → confirm) | OWNER/OPERATOR | `EMAIL` + `FAILED`/`DEAD` + `MAIL_RETRYABLE`/`MAIL_PERMANENT` delivery를 기본 최대 1,000건(설정 `1..5000`) preview snapshot과 selection hash로 고정. confirm 때 status, attempt, failure code, `updated_at`이 같고 active lease가 없는 대상만 `PENDING`으로 되돌림. 달라진 대상은 skip. 새 event/outbox row 없음 |
| Composer manual preview/confirm | host | 새 event를 만드는 **별도 발송**. restore 대용으로 쓰지 않음 |

- admin replay의 reset, audit, receipt, preview 소비는 한 transaction입니다. 같은 actor/hash로 다시 보내면 저장된 receipt를 돌려줍니다. 예전 v1 preview는 새 preview가 필요합니다.
- `AMBIGUOUS`는 provider/recipient 증거로 미수락이 확인되기 전에는 restore, replay, 재발송 대상이 아닙니다.
- SMTP가 수락한 뒤 `SENT` 기록 전에 중단되면 lease 회수 후 한 번 더 발송될 수 있습니다(at-least-once).

## 4. Consumer 로그 확인

Kafka header `readmates-request-id`가 있으면 consumer 로그에도 같은 `requestId`가 찍힙니다. 2단계와 같은 명령을 씁니다.

`requestId`가 `"unknown"`이면 upstream 요청 없이 scheduled/async 경로에서 시작된 작업일 가능성이 큽니다. `eventType`, 상태, 시각으로 교차 확인합니다.

## 5. 영향 추정

| 영역 | 메트릭 |
| --- | --- |
| API 실패 | `http_server_requests_seconds_count{status=~"5.."}` |
| API latency | `http_server_requests_seconds_bucket` p95 (histogram이 켜져 있지 않으면 비어 있을 수 있음) |
| DB pool | `hikaricp_connections_pending` |
| Event relay backlog | `readmates_notifications_outbox_backlog` |
| Email delivery backlog | `readmates_notifications_delivery_backlog` |
| Redis | `readmates_redis_fallbacks_total`, `readmates_redis_operation_errors_total` |
| 로그 에러량 | `logback_events_total{level="error"}` |

SLO 맥락은 [SLO](../observability/slos.md)를 봅니다.

## 6. 남은 공백 기록

incident 노트나 release 증거에 적습니다.

- request id가 있었는지
- 일치하는 로그를 찾았는지
- 일치하는 outbox/Kafka 증거가 있었는지
- 어떤 메트릭이 사용자 영향을 보여 줬는지
- 건너뛴 확인과 이유

알림 조사에는 correlation ID, 고정 publish result, outbox/delivery status, attempt count, deadline/lease, 전이 시각만 씁니다. raw SMTP 응답, 이메일 주소, payload, stack trace는 조회 키나 증거로 복사하지 않습니다.

## 관련 문서

- [ReadMates observability operator guide](../observability/operator-guide.md)
- [Deploy observability check](deploy-observability-check.md)
- [Metrics catalog](../observability/metrics-catalog.md)
- [Alerts](../observability/alerts.md)
- [SLO](../observability/slos.md)
