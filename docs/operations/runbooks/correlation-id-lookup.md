# Correlation ID Lookup Runbook

> Phase 0 (Observability Backbone) — single `requestId` joins BFF, Spring API, outbox row, Kafka header, and consumer log.

## When to use
- A user reports a failed action and provides a request id from the BFF response (`X-Readmates-Request-Id` header).
- An outbox `FAILED`/`DEAD` row needs end-to-end context.

## Steps

1. **Search server logs**
   ```bash
   journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<id>")'
   ```

2. **Find originating outbox row**
   ```sql
   SELECT * FROM notification_event_outbox WHERE request_id = '<id>';
   SELECT * FROM notification_manual_dispatch_previews WHERE request_id = '<id>';
   SELECT * FROM notification_manual_dispatches WHERE request_id = '<id>';
   ```

3. **Find consumer log lines**
   - Same `journalctl` filter; consumer lines log with the same `requestId` bound from the Kafka `readmates-request-id` header.

## Notes
- `requestId = "unknown"` indicates scheduled or async path with no upstream request. Cross-reference by `eventType` and timestamp.
- Migration V29 introduces `request_id` columns nullable; pre-V29 rows have NULL.
