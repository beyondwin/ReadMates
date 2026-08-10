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
SELECT id, event_type, status, attempt_count, next_attempt_at, locked_at,
       last_error, created_at, published_at, updated_at, request_id
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

- Event-outbox `PENDING`, `FAILED`, `PUBLISHING`, `DEAD`는 relay/Kafka publication 조사 대상입니다. 이 row만으로 SMTP delivery 실패라고 판단하지 않습니다.
- Event-outbox `DEAD`는 missing payload, event deadline 또는 retry exhaustion의 bounded reason을 확인하고, 원인 제거 전 blind replay/new event를 금지합니다.
- No rows can be normal if the request did not enqueue notification work.

Matching event ID가 있으면 delivery를 별도로 조회합니다.

```sql
SELECT id, event_id, channel, status, attempt_count, next_attempt_at, locked_at,
       last_error, created_at, updated_at
FROM notification_deliveries
WHERE event_id IN (
  SELECT id FROM notification_event_outbox WHERE request_id = '<request-id>'
);
```

Deadline은 row의 `created_at`에 현재 배포 환경의 `READMATES_NOTIFICATION_EVENT_MAX_AGE` 또는 `READMATES_NOTIFICATION_DELIVERY_MAX_AGE`를 더해 계산하고, 현재 UTC 시각이 그 시각과 같거나 늦으면 만료로 판단합니다. 문서 기본값 `24h`를 실제 배포값으로 가정하지 않습니다. `next_attempt_at`은 retry 예약 시각이지 deadline이 아니며, `locked_at`은 현재 `READMATES_NOTIFICATION_CLAIM_LEASE`와 함께 stale 여부를 판단합니다. `last_error`는 bounded safe failure evidence로만 취급하고 ticket에 raw provider 응답을 복사하지 않습니다.

Delivery `DEAD`는 failure kind·attempt/deadline·lease와 허용된 provider/recipient evidence를 확인한 뒤 exact 대상만 recovery합니다. Host가 한 건을 복구할 때는 해당 club의 exact delivery ID를 다시 확인하고 `POST /api/host/notifications/items/{id}/restore`를 명시적으로 실행합니다. 이 action은 한 EMAIL delivery를 `PENDING`으로 되돌리고 `next_attempt_at`을 현재 시각으로 설정하는 restore이며 새 event를 만들지 않습니다. Composer의 manual preview/confirm은 새 event를 만드는 별도 발송이므로 restore 대신 사용하지 않습니다. Platform admin replay는 OWNER/OPERATOR가 기본 최대 1,000개(설정 범위 `1..5000`)의 byte-exact `EMAIL` + `FAILED|DEAD` + `MAIL_RETRYABLE|MAIL_PERMANENT` delivery를 preview의 exact snapshot과 selection hash로 고정하는 별도 복구 경로입니다. Confirm은 status·attempt·failure code·`updated_at`이 snapshot과 같고 active lease가 없는 대상만 직접 `PENDING`으로 되돌리며, 달라진 대상은 skip하고 새 event/outbox row를 만들지 않습니다. Reset·audit·receipt·preview consume은 한 DB transaction이고 같은 actor/hash 명령 재시도는 저장된 receipt를 반환하며, legacy v1 preview는 새 preview가 필요합니다. `AMBIGUOUS`는 provider/recipient evidence로 미수락이 확인되지 않으면 host restore, admin replay, blind resend 대상에 포함하지 않습니다. SMTP 수락 후 `SENT` CAS/commit 전 중단은 lease reclaim 뒤 중복 발송될 수 있는 at-least-once 경계로 남습니다.

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
| Event relay backlog | `readmates_notifications_outbox_backlog` |
| Email delivery backlog | `readmates_notifications_delivery_backlog` |
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

- [ReadMates observability operator guide](../observability/operator-guide.md)
- [Deploy observability check](deploy-observability-check.md)
- [Metrics catalog](../observability/metrics-catalog.md)
- [Alerts](../observability/alerts.md)
- [SLO](../observability/slos.md)

알림 조사에는 correlation ID, fixed publish result, outbox/delivery status, attempt count, deadline/lease와 transition timestamp만 사용합니다. Raw SMTP response, email address, payload, stack trace는 조회 키나 incident 증거로 복사하지 않습니다. Relay와 SMTP recovery는 위 evidence gate를 각각 통과해야 하며 서로의 replay action으로 대체하지 않습니다.
