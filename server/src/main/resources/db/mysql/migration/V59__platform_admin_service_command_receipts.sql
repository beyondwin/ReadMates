alter table admin_notification_replay_previews
  drop foreign key admin_notification_replay_previews_confirmation_fk;

alter table admin_notification_replay_confirmations
  drop foreign key admin_notification_replay_confirmations_preview_fk,
  drop foreign key admin_notification_replay_confirmations_actor_fk,
  drop foreign key admin_notification_replay_confirmations_club_fk,
  drop foreign key admin_notification_replay_confirmations_audit_fk,
  drop check admin_notification_replay_confirmations_hash_check;

alter table admin_notification_replay_confirmations
  modify column id char(36) character set ascii collate ascii_bin not null,
  modify column actor_user_id char(36) character set ascii collate ascii_bin not null,
  modify column club_id char(36) character set ascii collate ascii_bin,
  modify column selection_hash char(64) null,
  modify column platform_audit_event_id char(36) character set ascii collate ascii_bin not null,
  add column actor_capabilities_json json,
  add column command_type varchar(96) character set ascii collate ascii_bin,
  add column target_kind varchar(48) character set ascii collate ascii_bin,
  add column target_id_snapshot char(36) character set ascii collate ascii_bin,
  add column identity_mode varchar(32) character set ascii collate ascii_bin,
  add column canonical_schema_version varchar(64) character set ascii collate ascii_bin,
  add column digest_key_version int,
  add column request_hmac varbinary(32),
  add column skipped_reason_counts_json json,
  add column origin_outcome varchar(16) character set ascii collate ascii_bin;

update admin_notification_replay_confirmations
set command_type = 'notification.replay',
    target_kind = 'NOTIFICATION_REPLAY_TARGET_SET',
    target_id_snapshot = id,
    identity_mode = 'LEGACY_SELECTION_SHA',
    skipped_reason_counts_json = json_object(),
    origin_outcome = 'SUCCEEDED';

alter table admin_notification_replay_confirmations
  modify column command_type varchar(96) character set ascii collate ascii_bin not null,
  modify column target_kind varchar(48) character set ascii collate ascii_bin not null,
  modify column target_id_snapshot char(36) character set ascii collate ascii_bin not null,
  modify column identity_mode varchar(32) character set ascii collate ascii_bin not null,
  modify column skipped_reason_counts_json json not null,
  modify column origin_outcome varchar(16) character set ascii collate ascii_bin not null,
  add unique key admin_notification_confirmations_audit_uk (platform_audit_event_id),
  add unique key admin_notification_confirmations_id_preview_uk (id, preview_id),
  add constraint admin_notification_confirmations_command_check check (
    binary command_type = binary 'notification.replay'
    and binary target_kind = binary 'NOTIFICATION_REPLAY_TARGET_SET'
    and binary target_id_snapshot = binary id
    and binary origin_outcome = binary 'SUCCEEDED'
  ),
  add constraint admin_notification_confirmations_identity_check check (
    (
      binary identity_mode = binary 'LEGACY_SELECTION_SHA'
      and selection_hash is not null
      and octet_length(selection_hash) = 64
      and unhex(selection_hash) is not null
      and binary selection_hash = binary lower(hex(unhex(selection_hash)))
      and canonical_schema_version is null
      and digest_key_version is null
      and request_hmac is null
      and actor_capabilities_json is null
    ) or (
      binary identity_mode = binary 'HMAC'
      and selection_hash is null
      and canonical_schema_version is not null
      and regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
      and digest_key_version is not null
      and digest_key_version >= 0
      and request_hmac is not null
      and octet_length(request_hmac) = 32
      and actor_capabilities_json is not null
    )
  ),
  add constraint admin_notification_confirmations_json_check check (
    (
      actor_capabilities_json is null
      or (
        json_type(actor_capabilities_json) = 'ARRAY'
        and json_length(actor_capabilities_json) between 1 and 24
        and octet_length(cast(actor_capabilities_json as char)) <= 4096
      )
    )
    and json_type(skipped_reason_counts_json) = 'OBJECT'
    and json_length(skipped_reason_counts_json) between 0 and 24
    and octet_length(cast(skipped_reason_counts_json as char)) <= 8192
  );

alter table admin_notification_replay_previews
  modify column consumed_confirmation_id char(36) character set ascii collate ascii_bin,
  add constraint admin_notification_replay_previews_confirmation_fk
    foreign key (consumed_confirmation_id, id)
    references admin_notification_replay_confirmations(id, preview_id)
    on delete restrict;

create table admin_notification_replay_confirmation_targets (
  confirmation_id char(36) character set ascii collate ascii_bin not null,
  delivery_id_snapshot char(36) character set ascii collate ascii_bin not null,
  primary key (confirmation_id, delivery_id_snapshot),
  key admin_notification_confirmation_targets_delivery_idx (delivery_id_snapshot, confirmation_id),
  constraint admin_notification_confirmation_targets_receipt_fk
    foreign key (confirmation_id)
    references admin_notification_replay_confirmations(id)
    on delete restrict
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table ai_generation_admin_command_previews (
  id char(36) character set ascii collate ascii_bin not null,
  action varchar(24) character set ascii collate ascii_bin not null,
  actor_user_id_snapshot char(36) character set ascii collate ascii_bin not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  actor_capabilities_json json not null,
  job_id_snapshot char(36) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) character set ascii collate ascii_bin not null,
  job_status_snapshot varchar(24) character set ascii collate ascii_bin not null,
  job_revision_snapshot bigint not null,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  request_hmac varbinary(32) not null,
  sanitized_impact_json json not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  consumed_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  created_at datetime(6) not null,
  primary key (id),
  key ai_generation_admin_previews_expiry_idx (expires_at, id),
  key ai_generation_admin_previews_job_idx (job_id_snapshot, created_at, id),
  constraint ai_generation_admin_previews_action_check check (
    (
      binary action = binary 'FORCE_CANCEL'
      and binary job_status_snapshot in (binary 'PENDING', binary 'RUNNING', binary 'SUCCEEDED')
    ) or (
      binary action = binary 'RETRY_COMMIT'
      and binary job_status_snapshot = binary 'COMMIT_RETRY'
    )
  ),
  constraint ai_generation_admin_previews_role_check check (
    binary actor_platform_role_snapshot in (binary 'OWNER', binary 'OPERATOR')
  ),
  constraint ai_generation_admin_previews_revision_check check (job_revision_snapshot >= 0),
  constraint ai_generation_admin_previews_schema_check check (
    regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
  ),
  constraint ai_generation_admin_previews_hmac_check check (
    digest_key_version >= 0 and octet_length(request_hmac) = 32
  ),
  constraint ai_generation_admin_previews_json_check check (
    json_type(actor_capabilities_json) = 'ARRAY'
    and json_length(actor_capabilities_json) between 1 and 24
    and octet_length(cast(actor_capabilities_json as char)) <= 4096
    and json_type(sanitized_impact_json) = 'OBJECT'
    and json_length(sanitized_impact_json) between 1 and 24
    and octet_length(cast(sanitized_impact_json as char)) <= 8192
  ),
  constraint ai_generation_admin_previews_expiry_check check (expires_at > created_at),
  constraint ai_generation_admin_previews_consumption_check check (
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

create table ai_generation_admin_command_receipts (
  id char(36) character set ascii collate ascii_bin not null,
  preview_id_snapshot char(36) character set ascii collate ascii_bin not null,
  action varchar(24) character set ascii collate ascii_bin not null,
  effect_type_snapshot varchar(32) character set ascii collate ascii_bin generated always as (
    case action
      when 'FORCE_CANCEL' then 'AI_JOB_CANCEL'
      when 'RETRY_COMMIT' then 'AI_COMMIT_RETRY'
      else null
    end
  ) stored,
  actor_user_id_snapshot char(36) character set ascii collate ascii_bin not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  actor_capabilities_json json not null,
  job_id_snapshot char(36) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) character set ascii collate ascii_bin not null,
  before_job_status_snapshot varchar(24) character set ascii collate ascii_bin not null,
  before_job_revision_snapshot bigint not null,
  after_job_status_snapshot varchar(24) character set ascii collate ascii_bin not null,
  after_job_revision_snapshot bigint not null,
  origin_outcome varchar(16) character set ascii collate ascii_bin not null,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  request_hmac varbinary(32) not null,
  safe_reason_code varchar(64) character set ascii collate ascii_bin,
  safe_result_json json not null,
  platform_audit_event_id_snapshot char(36) character set ascii collate ascii_bin not null,
  origin_at datetime(6) not null,
  primary key (id),
  unique key ai_generation_admin_receipts_preview_uk (preview_id_snapshot),
  unique key ai_generation_admin_receipts_audit_uk (platform_audit_event_id_snapshot),
  unique key ai_generation_admin_receipts_id_preview_uk (id, preview_id_snapshot),
  unique key ai_generation_admin_receipts_effect_target_uk (
    id,
    effect_type_snapshot,
    job_id_snapshot
  ),
  key ai_generation_admin_receipts_job_idx (job_id_snapshot, origin_at, id),
  constraint ai_generation_admin_receipts_action_check check (
    (
      binary action = binary 'FORCE_CANCEL'
      and binary before_job_status_snapshot in (binary 'PENDING', binary 'RUNNING', binary 'SUCCEEDED')
    ) or (
      binary action = binary 'RETRY_COMMIT'
      and binary before_job_status_snapshot = binary 'COMMIT_RETRY'
    )
  ),
  constraint ai_generation_admin_receipts_role_check check (
    binary actor_platform_role_snapshot in (binary 'OWNER', binary 'OPERATOR')
  ),
  constraint ai_generation_admin_receipts_revision_check check (
    before_job_revision_snapshot >= 0
    and after_job_revision_snapshot >= before_job_revision_snapshot
  ),
  constraint ai_generation_admin_receipts_status_check check (
    binary after_job_status_snapshot in (
      binary 'PENDING', binary 'RUNNING', binary 'SUCCEEDED', binary 'COMMITTING',
      binary 'COMMIT_RETRY', binary 'COMMITTED', binary 'FAILED', binary 'CANCELLED'
    )
  ),
  constraint ai_generation_admin_receipts_outcome_check check (
    binary origin_outcome in (binary 'ACCEPTED', binary 'SUCCEEDED', binary 'FAILED')
  ),
  constraint ai_generation_admin_receipts_schema_check check (
    regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
  ),
  constraint ai_generation_admin_receipts_hmac_check check (
    digest_key_version >= 0 and octet_length(request_hmac) = 32
  ),
  constraint ai_generation_admin_receipts_reason_check check (
    safe_reason_code is null
    or regexp_like(safe_reason_code, '^[A-Z][A-Z0-9_]{0,63}$', 'c')
  ),
  constraint ai_generation_admin_receipts_json_check check (
    json_type(actor_capabilities_json) = 'ARRAY'
    and json_length(actor_capabilities_json) between 1 and 24
    and octet_length(cast(actor_capabilities_json as char)) <= 4096
    and json_type(safe_result_json) = 'OBJECT'
    and json_length(safe_result_json) between 1 and 24
    and octet_length(cast(safe_result_json as char)) <= 8192
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table ai_generation_admin_command_previews
  add constraint ai_generation_admin_previews_consumed_receipt_fk
    foreign key (consumed_receipt_id_snapshot, id)
    references ai_generation_admin_command_receipts(id, preview_id_snapshot)
    on delete restrict;

create table admin_service_command_convergence (
  id char(36) character set ascii collate ascii_bin not null,
  notification_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  ai_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  effect_type varchar(32) character set ascii collate ascii_bin not null,
  effect_target_id_snapshot char(36) character set ascii collate ascii_bin not null,
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
  unique key admin_service_convergence_notification_identity_uk (
    id,
    notification_receipt_id_snapshot,
    effect_type,
    effect_target_id_snapshot
  ),
  unique key admin_service_convergence_ai_identity_uk (
    id,
    ai_receipt_id_snapshot,
    effect_type,
    effect_target_id_snapshot
  ),
  unique key admin_service_convergence_notification_effect_uk (
    notification_receipt_id_snapshot,
    effect_type,
    effect_target_id_snapshot
  ),
  unique key admin_service_convergence_ai_effect_uk (
    ai_receipt_id_snapshot,
    effect_type,
    effect_target_id_snapshot
  ),
  key admin_service_convergence_available_idx (state, available_at, lease_expires_at, id),
  constraint admin_service_convergence_notification_receipt_fk
    foreign key (notification_receipt_id_snapshot)
    references admin_notification_replay_confirmations(id)
    on delete restrict,
  constraint admin_service_convergence_ai_receipt_fk
    foreign key (ai_receipt_id_snapshot, effect_type, effect_target_id_snapshot)
    references ai_generation_admin_command_receipts(id, effect_type_snapshot, job_id_snapshot)
    on delete restrict,
  constraint admin_service_convergence_parent_check check (
    (
      notification_receipt_id_snapshot is not null
      and ai_receipt_id_snapshot is null
      and binary effect_type = binary 'NOTIFICATION_REPLAY'
      and binary effect_target_id_snapshot = binary notification_receipt_id_snapshot
    ) or (
      notification_receipt_id_snapshot is null
      and ai_receipt_id_snapshot is not null
      and binary effect_type in (binary 'AI_JOB_CANCEL', binary 'AI_COMMIT_RETRY')
    )
  ),
  constraint admin_service_convergence_state_check check (
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
  constraint admin_service_convergence_attempt_check check (
    attempt_count >= 0
    and next_attempt_no = attempt_count + 1
    and (binary state = binary 'PENDING' or attempt_count > 0)
  ),
  constraint admin_service_convergence_lease_check check (
    (
      lease_owner is null
      and lease_expires_at is null
    ) or (
      binary state = binary 'PENDING'
      and lease_owner is not null
      and regexp_like(lease_owner, '^[A-Za-z0-9._:-]{1,128}$', 'c')
      and lease_expires_at is not null
    )
  ),
  constraint admin_service_convergence_error_code_check check (
    last_safe_error_code is null
    or regexp_like(last_safe_error_code, '^[A-Z][A-Z0-9_]{0,63}$', 'c')
  ),
  constraint admin_service_convergence_time_check check (updated_at >= created_at)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table admin_service_command_convergence_events (
  convergence_id char(36) character set ascii collate ascii_bin not null,
  notification_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  ai_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  effect_type varchar(32) character set ascii collate ascii_bin not null,
  effect_target_id_snapshot char(36) character set ascii collate ascii_bin not null,
  attempt_no int not null,
  event_seq tinyint not null,
  start_event_seq tinyint generated always as (
    case when event_seq = 1 then 0 else null end
  ) stored,
  state varchar(16) character set ascii collate ascii_bin not null,
  safe_error_code varchar(64) character set ascii collate ascii_bin,
  observed_at datetime(6) not null,
  primary key (convergence_id, attempt_no, event_seq),
  key admin_service_convergence_events_notification_idx (
    notification_receipt_id_snapshot,
    observed_at,
    convergence_id,
    attempt_no,
    event_seq
  ),
  key admin_service_convergence_events_ai_idx (
    ai_receipt_id_snapshot,
    observed_at,
    convergence_id,
    attempt_no,
    event_seq
  ),
  constraint admin_service_convergence_events_notification_identity_fk
    foreign key (
      convergence_id,
      notification_receipt_id_snapshot,
      effect_type,
      effect_target_id_snapshot
    ) references admin_service_command_convergence(
      id,
      notification_receipt_id_snapshot,
      effect_type,
      effect_target_id_snapshot
    ) on delete restrict,
  constraint admin_service_convergence_events_ai_identity_fk
    foreign key (
      convergence_id,
      ai_receipt_id_snapshot,
      effect_type,
      effect_target_id_snapshot
    ) references admin_service_command_convergence(
      id,
      ai_receipt_id_snapshot,
      effect_type,
      effect_target_id_snapshot
    ) on delete restrict,
  constraint admin_service_convergence_events_start_fk
    foreign key (convergence_id, attempt_no, start_event_seq)
    references admin_service_command_convergence_events(convergence_id, attempt_no, event_seq)
    on delete restrict,
  constraint admin_service_convergence_events_parent_check check (
    (
      notification_receipt_id_snapshot is not null
      and ai_receipt_id_snapshot is null
      and binary effect_type = binary 'NOTIFICATION_REPLAY'
      and binary effect_target_id_snapshot = binary notification_receipt_id_snapshot
    ) or (
      notification_receipt_id_snapshot is null
      and ai_receipt_id_snapshot is not null
      and binary effect_type in (binary 'AI_JOB_CANCEL', binary 'AI_COMMIT_RETRY')
    )
  ),
  constraint admin_service_convergence_events_attempt_check check (attempt_no > 0),
  constraint admin_service_convergence_events_contract_check check (
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
      and binary state in (binary 'PENDING', binary 'FAILED')
      and safe_error_code is not null
    )
  ),
  constraint admin_service_convergence_events_error_code_check check (
    safe_error_code is null
    or regexp_like(safe_error_code, '^[A-Z][A-Z0-9_]{0,63}$', 'c')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
