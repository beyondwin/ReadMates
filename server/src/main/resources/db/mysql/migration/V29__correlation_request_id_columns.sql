-- Phase 0 (observability backbone): correlation id columns for log/audit join.
-- Nullable varchar(64) matches RequestIdFilter regex ^[A-Za-z0-9-]{12,64}$.

alter table notification_event_outbox
  add column request_id varchar(64) null after event_type;

alter table notification_manual_dispatch_previews
  add column request_id varchar(64) null;

alter table notification_manual_dispatches
  add column request_id varchar(64) null;
