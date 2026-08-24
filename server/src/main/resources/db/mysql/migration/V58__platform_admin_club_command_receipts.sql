alter table clubs
  add column admin_revision bigint not null default 0,
  add constraint clubs_admin_revision_check check (admin_revision >= 0);

create table platform_admin_club_command_previews (
  id char(36) character set ascii collate ascii_bin not null,
  command_type varchar(96) character set ascii collate ascii_bin not null,
  actor_user_id_snapshot char(36) character set ascii collate ascii_bin not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  actor_capabilities_json json not null,
  target_kind varchar(24) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) character set ascii collate ascii_bin,
  new_club_slot_id_snapshot char(36) character set ascii collate ascii_bin,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  request_hmac varbinary(32) not null,
  sanitized_impact_json json not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  consumed_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  created_at datetime(6) not null,
  primary key (id),
  key platform_admin_club_previews_expiry_idx (expires_at, id),
  key platform_admin_club_previews_target_idx (club_id_snapshot, created_at, id),
  constraint platform_admin_club_previews_command_check check (
    regexp_like(command_type, '^[a-z0-9._:-]{1,96}$', 'c')
  ),
  constraint platform_admin_club_previews_role_check check (
    binary actor_platform_role_snapshot in (binary 'OWNER', binary 'OPERATOR', binary 'SUPPORT')
  ),
  constraint platform_admin_club_previews_target_check check (
    (
      binary target_kind = binary 'EXISTING_CLUB'
      and club_id_snapshot is not null
      and new_club_slot_id_snapshot is null
    ) or (
      binary target_kind = binary 'NEW_CLUB'
      and club_id_snapshot is null
      and new_club_slot_id_snapshot is not null
    )
  ),
  constraint platform_admin_club_previews_schema_check check (
    regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
  ),
  constraint platform_admin_club_previews_hmac_check check (
    digest_key_version >= 0 and octet_length(request_hmac) = 32
  ),
  constraint platform_admin_club_previews_json_check check (
    json_type(actor_capabilities_json) = 'ARRAY'
    and json_length(actor_capabilities_json) between 1 and 24
    and octet_length(cast(actor_capabilities_json as char)) <= 4096
    and json_type(sanitized_impact_json) = 'OBJECT'
    and json_length(sanitized_impact_json) between 1 and 24
    and octet_length(cast(sanitized_impact_json as char)) <= 8192
  ),
  constraint platform_admin_club_previews_expiry_check check (expires_at > created_at),
  constraint platform_admin_club_previews_consumption_check check (
    (
      consumed_at is null
      and consumed_receipt_id_snapshot is null
    ) or (
      consumed_at is not null
      and consumed_at >= created_at
      and consumed_receipt_id_snapshot is not null
    )
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table platform_admin_club_command_receipts (
  id char(36) character set ascii collate ascii_bin not null,
  command_type varchar(96) character set ascii collate ascii_bin not null,
  actor_user_id_snapshot char(36) character set ascii collate ascii_bin not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  actor_capabilities_json json not null,
  club_id_snapshot char(36) character set ascii collate ascii_bin not null,
  -- L1 receipts may omit a preview; L2/L3 writers must supply this immutable snapshot.
  preview_id_snapshot char(36) character set ascii collate ascii_bin,
  before_admin_revision bigint,
  after_admin_revision bigint not null,
  outcome varchar(16) character set ascii collate ascii_bin not null,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  request_hmac varbinary(32) not null,
  -- Logical immutable link for the global audit union. The Task 3/4 writer persists
  -- the audit event and receipt in one transaction; no deletable user/club FK is copied here.
  platform_audit_event_id_snapshot char(36) character set ascii collate ascii_bin not null,
  origin_at datetime(6) not null,
  safe_result_json json not null,
  primary key (id),
  unique key platform_admin_club_receipts_audit_uk (platform_audit_event_id_snapshot),
  unique key platform_admin_club_receipts_preview_uk (preview_id_snapshot),
  unique key platform_admin_club_receipts_id_preview_uk (id, preview_id_snapshot),
  key platform_admin_club_receipts_target_idx (club_id_snapshot, origin_at, id),
  constraint platform_admin_club_receipts_command_check check (
    regexp_like(command_type, '^[a-z0-9._:-]{1,96}$', 'c')
  ),
  constraint platform_admin_club_receipts_role_check check (
    binary actor_platform_role_snapshot in (binary 'OWNER', binary 'OPERATOR', binary 'SUPPORT')
  ),
  constraint platform_admin_club_receipts_revision_check check (
    (before_admin_revision is null or before_admin_revision >= 0)
    and after_admin_revision >= 0
    and (before_admin_revision is null or after_admin_revision >= before_admin_revision)
  ),
  constraint platform_admin_club_receipts_outcome_check check (
    binary outcome in (binary 'SUCCEEDED', binary 'PARTIAL', binary 'FAILED')
  ),
  constraint platform_admin_club_receipts_schema_check check (
    regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
  ),
  constraint platform_admin_club_receipts_hmac_check check (
    digest_key_version >= 0 and octet_length(request_hmac) = 32
  ),
  constraint platform_admin_club_receipts_json_check check (
    json_type(actor_capabilities_json) = 'ARRAY'
    and json_length(actor_capabilities_json) between 1 and 24
    and octet_length(cast(actor_capabilities_json as char)) <= 4096
    and json_type(safe_result_json) = 'OBJECT'
    and json_length(safe_result_json) between 1 and 24
    and octet_length(cast(safe_result_json as char)) <= 8192
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table platform_admin_club_command_previews
  add constraint platform_admin_club_previews_consumed_receipt_fk
    foreign key (consumed_receipt_id_snapshot, id)
    references platform_admin_club_command_receipts(id, preview_id_snapshot)
    on delete restrict;

create table platform_admin_club_command_convergence (
  id char(36) character set ascii collate ascii_bin not null,
  receipt_id_snapshot char(36) character set ascii collate ascii_bin not null,
  effect_type varchar(32) character set ascii collate ascii_bin not null,
  state varchar(16) character set ascii collate ascii_bin not null,
  attempt_count int not null,
  next_attempt_no int not null,
  lease_owner varchar(128) character set ascii collate ascii_bin,
  lease_expires_at datetime(6),
  last_safe_error_code varchar(64) character set ascii collate ascii_bin,
  available_at datetime(6),
  created_at datetime(6) not null,
  updated_at datetime(6) not null,
  primary key (id),
  -- Current rows are retained with their receipt so append-only events cannot become orphans.
  unique key platform_admin_club_convergence_identity_uk (id, receipt_id_snapshot, effect_type),
  unique key platform_admin_club_convergence_receipt_effect_uk (receipt_id_snapshot, effect_type),
  key platform_admin_club_convergence_available_idx (state, available_at, lease_expires_at, id),
  constraint platform_admin_club_convergence_receipt_fk
    foreign key (receipt_id_snapshot)
    references platform_admin_club_command_receipts(id)
    on delete restrict,
  constraint platform_admin_club_convergence_effect_check check (
    binary effect_type in (binary 'HOST_INVITATION', binary 'DOMAIN_PROVISIONING')
  ),
  constraint platform_admin_club_convergence_state_check check (
    (
      binary state = binary 'PENDING'
      and available_at is not null
    ) or (
      binary state = binary 'SUCCEEDED'
      and available_at is null
      and last_safe_error_code is null
    ) or (
      binary state = binary 'FAILED'
      and available_at is null
      and last_safe_error_code is not null
    )
  ),
  constraint platform_admin_club_convergence_error_code_check check (
    last_safe_error_code is null
    or regexp_like(last_safe_error_code, '^[A-Z][A-Z0-9_]{0,63}$', 'c')
  ),
  constraint platform_admin_club_convergence_attempt_check check (
    attempt_count >= 0 and next_attempt_no = attempt_count + 1
  ),
  constraint platform_admin_club_convergence_lease_check check (
    (
      lease_owner is null
      and lease_expires_at is null
    ) or (
      binary state = binary 'PENDING'
      and regexp_like(lease_owner, '^[A-Za-z0-9._:-]{1,128}$', 'c')
      and lease_expires_at is not null
    )
  ),
  constraint platform_admin_club_convergence_time_check check (updated_at >= created_at)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table platform_admin_club_command_convergence_events (
  convergence_id char(36) character set ascii collate ascii_bin not null,
  receipt_id_snapshot char(36) character set ascii collate ascii_bin not null,
  effect_type varchar(32) character set ascii collate ascii_bin not null,
  attempt_no int not null,
  event_seq tinyint not null,
  state varchar(16) character set ascii collate ascii_bin not null,
  safe_error_code varchar(64) character set ascii collate ascii_bin,
  observed_at datetime(6) not null,
  primary key (convergence_id, attempt_no, event_seq),
  key platform_admin_club_convergence_events_receipt_idx (
    receipt_id_snapshot,
    observed_at,
    convergence_id,
    attempt_no,
    event_seq
  ),
  constraint platform_admin_club_convergence_events_identity_fk
    foreign key (convergence_id, receipt_id_snapshot, effect_type)
    references platform_admin_club_command_convergence(id, receipt_id_snapshot, effect_type)
    on delete restrict,
  constraint platform_admin_club_convergence_events_effect_check check (
    binary effect_type in (binary 'HOST_INVITATION', binary 'DOMAIN_PROVISIONING')
  ),
  constraint platform_admin_club_convergence_events_attempt_check check (attempt_no > 0),
  constraint platform_admin_club_convergence_events_contract_check check (
    (
      event_seq = 0
      and binary state = binary 'PENDING'
      and safe_error_code is null
    ) or (
      event_seq = 1
      and binary state = binary 'SUCCEEDED'
      and safe_error_code is null
    ) or (
      event_seq = 1
      and binary state = binary 'FAILED'
      and safe_error_code is not null
    )
  ),
  constraint platform_admin_club_convergence_events_error_code_check check (
    safe_error_code is null
    or regexp_like(safe_error_code, '^[A-Z][A-Z0-9_]{0,63}$', 'c')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
