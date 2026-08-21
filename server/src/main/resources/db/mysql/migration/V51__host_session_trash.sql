alter table sessions
  add column deleted_at datetime(6),
  add column deleted_by_membership_id char(36),
  add column purge_after datetime(6),
  add constraint sessions_trash_contract_check check (
    (deleted_at is null and deleted_by_membership_id is null and purge_after is null)
    or (deleted_at is not null and deleted_by_membership_id is not null and purge_after is not null)
  );

create index sessions_club_deleted_state_number_idx
  on sessions (club_id, deleted_at, state, number desc);
create index sessions_purge_after_idx on sessions (purge_after, id);
create view active_sessions as
  select * from sessions where deleted_at is null;

alter table host_session_lifecycle_audit
  drop check host_session_lifecycle_audit_contract_check;

alter table host_session_lifecycle_audit
  add constraint host_session_lifecycle_audit_contract_check check (
    (binary action_type = binary 'OPENED' and binary from_state = binary 'DRAFT' and binary to_state = binary 'OPEN' and reason_code is null)
    or (binary action_type = binary 'CLOSED' and binary from_state = binary 'OPEN' and binary to_state = binary 'CLOSED' and reason_code is null)
    or (binary action_type = binary 'PUBLISHED' and binary from_state = binary 'CLOSED' and binary to_state = binary 'PUBLISHED' and reason_code is null)
    or (binary action_type = binary 'REOPENED' and binary from_state = binary 'CLOSED' and binary to_state = binary 'OPEN' and reason_code is not null)
    or (binary action_type = binary 'UNPUBLISHED' and binary from_state = binary 'PUBLISHED' and binary to_state = binary 'CLOSED' and reason_code is not null)
    or (binary action_type = binary 'RETURNED_TO_DRAFT' and binary from_state = binary 'OPEN' and binary to_state = binary 'DRAFT' and reason_code is not null)
    or (binary action_type = binary 'DELETED' and binary from_state in (binary 'DRAFT', binary 'OPEN') and to_state is null and binary reason_code = binary 'EMPTY_SESSION_DELETED')
    or (binary action_type = binary 'RESTORED' and binary from_state = binary to_state and binary from_state in (binary 'DRAFT', binary 'OPEN') and binary reason_code = binary 'OPERATIONAL_RECOVERY')
  );
