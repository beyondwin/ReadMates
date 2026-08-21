create table host_session_lifecycle_audit (
  id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  actor_membership_id char(36) not null,
  action_type varchar(32) character set ascii collate ascii_bin not null,
  from_state varchar(16) character set ascii collate ascii_bin not null,
  to_state varchar(16) character set ascii collate ascii_bin,
  reason_code varchar(40) character set ascii collate ascii_bin,
  reason_note varchar(500),
  request_id varchar(100) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key host_session_lifecycle_audit_history_idx (club_id, session_id, created_at desc, id desc),
  key host_session_lifecycle_audit_actor_idx (club_id, actor_membership_id, created_at desc),
  constraint host_session_lifecycle_audit_contract_check check (
    (binary action_type = binary 'OPENED' and binary from_state = binary 'DRAFT' and binary to_state = binary 'OPEN' and reason_code is null)
    or (binary action_type = binary 'CLOSED' and binary from_state = binary 'OPEN' and binary to_state = binary 'CLOSED' and reason_code is null)
    or (binary action_type = binary 'PUBLISHED' and binary from_state = binary 'CLOSED' and binary to_state = binary 'PUBLISHED' and reason_code is null)
    or (binary action_type = binary 'REOPENED' and binary from_state = binary 'CLOSED' and binary to_state = binary 'OPEN' and reason_code is not null)
    or (binary action_type = binary 'UNPUBLISHED' and binary from_state = binary 'PUBLISHED' and binary to_state = binary 'CLOSED' and reason_code is not null)
    or (binary action_type = binary 'RETURNED_TO_DRAFT' and binary from_state = binary 'OPEN' and binary to_state = binary 'DRAFT' and reason_code is not null)
    or (binary action_type = binary 'DELETED' and binary from_state in (binary 'DRAFT', binary 'OPEN') and to_state is null and binary reason_code = binary 'EMPTY_SESSION_DELETED')
  ),
  constraint host_session_lifecycle_audit_reason_check check (
    reason_code is null
    or binary reason_code in (
      binary 'ACCIDENTAL_TRANSITION', binary 'MEETING_RESCHEDULED',
      binary 'CONTENT_CORRECTION', binary 'OPERATIONAL_RECOVERY',
      binary 'OTHER_OPERATIONAL_REASON', binary 'LEGACY_UNSPECIFIED',
      binary 'EMPTY_SESSION_DELETED'
    )
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
