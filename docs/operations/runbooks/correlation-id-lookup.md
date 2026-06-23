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

- [ReadMates observability operator guide](../observability/operator-guide.md)
- [Deploy observability check](deploy-observability-check.md)
- [Metrics catalog](../observability/metrics-catalog.md)
- [Alerts](../observability/alerts.md)
- [SLO](../observability/slos.md)
