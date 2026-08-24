set @v60_support_migrated_at = utc_timestamp(6);

set @v60_legacy_reasons_redacted_count = (
  select count(*)
  from support_access_grants
);

set @v60_duplicate_active_grants_revoked_count = (
  select count(*)
  from (
    select row_number() over (
      partition by club_id, grantee_user_id, scope
      order by created_at desc, id desc
    ) as active_rank
    from support_access_grants
    where revoked_at is null
      and expires_at > @v60_support_migrated_at
  ) ranked_active_grants
  where active_rank > 1
);

alter table support_access_grants
  add column active_slot tinyint,
  add column reason_category varchar(48) character set ascii collate ascii_bin,
  add column note_present tinyint,
  add column reason_evidence_version tinyint not null default 0;

update support_access_grants grants
join (
  select ranked_grants.id, ranked_grants.active_rank
  from (
    select id,
           row_number() over (
             partition by club_id, grantee_user_id, scope
             order by created_at desc, id desc
           ) as active_rank
    from support_access_grants
    where revoked_at is null
      and expires_at > @v60_support_migrated_at
  ) ranked_grants
) active_grants on active_grants.id = grants.id
set grants.active_slot = case when active_grants.active_rank = 1 then 1 else null end,
    grants.revoked_at = case
      when active_grants.active_rank = 1 then grants.revoked_at
      else @v60_support_migrated_at
    end;

update support_access_grants
set reason = '[REDACTED]',
    reason_category = 'LEGACY_UNCLASSIFIED',
    note_present = 1,
    reason_evidence_version = 0;

alter table support_access_grants
  drop check support_access_grants_reason_check;

alter table support_access_grants
  modify column reason varchar(10) character set ascii collate ascii_bin not null,
  modify column reason_category varchar(48) character set ascii collate ascii_bin not null,
  modify column note_present tinyint not null,
  modify column reason_evidence_version tinyint not null default 1,
  add unique key support_access_grants_active_slot_uk (
    club_id,
    grantee_user_id,
    scope,
    active_slot
  ),
  add constraint support_access_grants_active_slot_check check (
    active_slot is null or (active_slot = 1 and revoked_at is null)
  ),
  add constraint support_access_grants_reason_sentinel_check check (
    binary reason = binary '[REDACTED]'
  ),
  add constraint support_access_grants_reason_evidence_check check (
    (
      reason_evidence_version = 0
      and binary reason_category = binary 'LEGACY_UNCLASSIFIED'
      and note_present = 1
    ) or (
      reason_evidence_version = 1
      and binary reason_category in (
        binary 'INCIDENT_INVESTIGATION',
        binary 'MEMBER_ASSISTANCE',
        binary 'DATA_CORRECTION',
        binary 'SECURITY_REVIEW'
      )
      and note_present in (0, 1)
    )
  );

create table platform_admin_support_migration_evidence (
  migration_version int not null,
  duplicate_active_grants_revoked_count bigint not null,
  legacy_reasons_redacted_count bigint not null,
  recorded_at datetime(6) not null,
  primary key (migration_version),
  constraint platform_admin_support_migration_version_check check (migration_version = 60),
  constraint platform_admin_support_migration_counts_check check (
    duplicate_active_grants_revoked_count >= 0
    and legacy_reasons_redacted_count >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

insert into platform_admin_support_migration_evidence (
  migration_version,
  duplicate_active_grants_revoked_count,
  legacy_reasons_redacted_count,
  recorded_at
) values (
  60,
  @v60_duplicate_active_grants_revoked_count,
  @v60_legacy_reasons_redacted_count,
  @v60_support_migrated_at
);

create table platform_admin_support_command_previews (
  id char(36) character set ascii collate ascii_bin not null,
  command_type varchar(16) character set ascii collate ascii_bin not null,
  actor_user_id_snapshot char(36) character set ascii collate ascii_bin not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  actor_capabilities_json json not null,
  grant_id_snapshot char(36) character set ascii collate ascii_bin,
  club_id_snapshot char(36) character set ascii collate ascii_bin not null,
  create_slot_id_snapshot char(36) character set ascii collate ascii_bin,
  scope_snapshot varchar(60) character set ascii collate ascii_bin not null,
  grant_expires_at_snapshot datetime(6) not null,
  reason_category varchar(48) character set ascii collate ascii_bin not null,
  note_present tinyint not null,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  request_hmac varbinary(32) not null,
  safe_impact_json json not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  consumed_receipt_id_snapshot char(36) character set ascii collate ascii_bin,
  created_at datetime(6) not null,
  primary key (id),
  key platform_admin_support_previews_expiry_idx (expires_at, id),
  key platform_admin_support_previews_club_idx (club_id_snapshot, created_at, id),
  constraint platform_admin_support_previews_command_check check (
    binary command_type in (binary 'CREATE', binary 'REVOKE')
  ),
  constraint platform_admin_support_previews_target_check check (
    (
      binary command_type = binary 'CREATE'
      and grant_id_snapshot is null
      and create_slot_id_snapshot is not null
    ) or (
      binary command_type = binary 'REVOKE'
      and grant_id_snapshot is not null
      and create_slot_id_snapshot is null
    )
  ),
  constraint platform_admin_support_previews_role_check check (
    binary actor_platform_role_snapshot in (
      binary 'OWNER', binary 'OPERATOR', binary 'SUPPORT'
    )
  ),
  constraint platform_admin_support_previews_scope_check check (
    binary scope_snapshot in (binary 'METADATA_READ', binary 'HOST_SUPPORT_READ')
  ),
  constraint platform_admin_support_previews_reason_check check (
    binary reason_category in (
      binary 'INCIDENT_INVESTIGATION',
      binary 'MEMBER_ASSISTANCE',
      binary 'DATA_CORRECTION',
      binary 'SECURITY_REVIEW'
    )
    and note_present in (0, 1)
  ),
  constraint platform_admin_support_previews_schema_check check (
    regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
  ),
  constraint platform_admin_support_previews_hmac_check check (
    digest_key_version >= 0 and octet_length(request_hmac) = 32
  ),
  constraint platform_admin_support_previews_json_check check (
    json_type(actor_capabilities_json) = 'ARRAY'
    and json_length(actor_capabilities_json) between 1 and 24
    and octet_length(cast(actor_capabilities_json as char)) <= 4096
    and json_type(safe_impact_json) = 'OBJECT'
    and json_length(safe_impact_json) between 1 and 24
    and octet_length(cast(safe_impact_json as char)) <= 8192
  ),
  constraint platform_admin_support_previews_expiry_check check (
    expires_at > created_at and grant_expires_at_snapshot > created_at
  ),
  constraint platform_admin_support_previews_consumption_check check (
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

create table platform_admin_support_command_receipts (
  id char(36) character set ascii collate ascii_bin not null,
  preview_id_snapshot char(36) character set ascii collate ascii_bin not null,
  command_type varchar(16) character set ascii collate ascii_bin not null,
  actor_user_id_snapshot char(36) character set ascii collate ascii_bin not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  actor_capabilities_json json not null,
  grant_id_snapshot char(36) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) character set ascii collate ascii_bin not null,
  scope_snapshot varchar(60) character set ascii collate ascii_bin not null,
  grant_expires_at_snapshot datetime(6) not null,
  reason_category varchar(48) character set ascii collate ascii_bin not null,
  note_present tinyint not null,
  before_status varchar(16) character set ascii collate ascii_bin not null,
  after_status varchar(16) character set ascii collate ascii_bin not null,
  outcome varchar(16) character set ascii collate ascii_bin not null,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  request_hmac varbinary(32) not null,
  platform_audit_event_id_snapshot char(36) character set ascii collate ascii_bin not null,
  created_at datetime(6) not null,
  primary key (id),
  unique key platform_admin_support_receipts_preview_uk (preview_id_snapshot),
  unique key platform_admin_support_receipts_audit_uk (platform_audit_event_id_snapshot),
  unique key platform_admin_support_receipts_id_preview_uk (id, preview_id_snapshot),
  key platform_admin_support_receipts_grant_idx (grant_id_snapshot, created_at, id),
  key platform_admin_support_receipts_club_idx (club_id_snapshot, created_at, id),
  constraint platform_admin_support_receipts_command_check check (
    binary command_type in (binary 'CREATE', binary 'REVOKE')
  ),
  constraint platform_admin_support_receipts_transition_check check (
    (
      binary command_type = binary 'CREATE'
      and binary before_status = binary 'ABSENT'
      and binary after_status = binary 'ACTIVE'
    ) or (
      binary command_type = binary 'REVOKE'
      and binary before_status = binary 'ACTIVE'
      and binary after_status = binary 'REVOKED'
    )
  ),
  constraint platform_admin_support_receipts_role_check check (
    binary actor_platform_role_snapshot in (
      binary 'OWNER', binary 'OPERATOR', binary 'SUPPORT'
    )
  ),
  constraint platform_admin_support_receipts_scope_check check (
    binary scope_snapshot in (binary 'METADATA_READ', binary 'HOST_SUPPORT_READ')
  ),
  constraint platform_admin_support_receipts_reason_check check (
    binary reason_category in (
      binary 'INCIDENT_INVESTIGATION',
      binary 'MEMBER_ASSISTANCE',
      binary 'DATA_CORRECTION',
      binary 'SECURITY_REVIEW'
    )
    and note_present in (0, 1)
  ),
  constraint platform_admin_support_receipts_outcome_check check (
    binary outcome = binary 'SUCCEEDED'
  ),
  constraint platform_admin_support_receipts_schema_check check (
    regexp_like(canonical_schema_version, '^[A-Za-z0-9._:-]{1,64}$', 'c')
  ),
  constraint platform_admin_support_receipts_hmac_check check (
    digest_key_version >= 0 and octet_length(request_hmac) = 32
  ),
  constraint platform_admin_support_receipts_json_check check (
    json_type(actor_capabilities_json) = 'ARRAY'
    and json_length(actor_capabilities_json) between 1 and 24
    and octet_length(cast(actor_capabilities_json as char)) <= 4096
  ),
  constraint platform_admin_support_receipts_expiry_check check (
    grant_expires_at_snapshot > created_at
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table platform_admin_support_command_previews
  add constraint platform_admin_support_previews_consumed_receipt_fk
    foreign key (consumed_receipt_id_snapshot, id)
    references platform_admin_support_command_receipts(id, preview_id_snapshot)
    on delete restrict;
