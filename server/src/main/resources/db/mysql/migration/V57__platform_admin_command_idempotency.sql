create table platform_admin_command_idempotency (
  -- UUID values use the repository-wide DbColumns.UUID.dbString() representation.
  id char(36) character set ascii collate ascii_bin not null,
  platform_admin_user_id char(36) character set ascii collate ascii_bin not null,
  command_type varchar(96) character set ascii collate ascii_bin not null,
  target_type varchar(64) character set ascii collate ascii_bin not null,
  target_id varchar(128) character set ascii collate ascii_bin not null,
  canonical_schema_version varchar(64) character set ascii collate ascii_bin not null,
  state varchar(16) character set ascii collate ascii_bin not null,
  -- Retained after completion so completion remains guarded by the original CAS token.
  claim_token char(36) character set ascii collate ascii_bin not null,
  receipt_type varchar(96) character set ascii collate ascii_bin,
  receipt_id varchar(128) character set ascii collate ascii_bin,
  created_at datetime(6) not null,
  updated_at datetime(6) not null,
  expires_at datetime(6) not null,
  primary key (id),
  unique key platform_admin_command_scope_uk (
    id,
    platform_admin_user_id,
    command_type,
    target_type,
    target_id
  ),
  key platform_admin_command_expiry_idx (state, expires_at, id),
  constraint platform_admin_command_schema_version_check check (
    char_length(canonical_schema_version) between 1 and 64
  ),
  constraint platform_admin_command_state_check check (
    binary state in (binary 'IN_PROGRESS', binary 'COMPLETED')
  ),
  constraint platform_admin_command_receipt_check check (
    (
      binary state = binary 'IN_PROGRESS'
      and receipt_type is null
      and receipt_id is null
    ) or (
      binary state = binary 'COMPLETED'
      and receipt_type is not null
      and receipt_id is not null
    )
  ),
  constraint platform_admin_command_expiry_check check (expires_at > created_at)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table platform_admin_command_idempotency_keys (
  claim_id char(36) character set ascii collate ascii_bin not null,
  platform_admin_user_id char(36) character set ascii collate ascii_bin not null,
  command_type varchar(96) character set ascii collate ascii_bin not null,
  target_type varchar(64) character set ascii collate ascii_bin not null,
  target_id varchar(128) character set ascii collate ascii_bin not null,
  digest_key_version int not null,
  idempotency_key_hmac varbinary(32) not null,
  request_hmac varbinary(32) not null,
  created_at datetime(6) not null,
  unique key platform_admin_command_alias_identity_uk (
    platform_admin_user_id,
    command_type,
    target_type,
    target_id,
    digest_key_version,
    idempotency_key_hmac
  ),
  unique key platform_admin_command_alias_claim_version_uk (claim_id, digest_key_version),
  constraint platform_admin_command_alias_version_check check (digest_key_version >= 0),
  constraint platform_admin_command_alias_hmac_check check (
    octet_length(idempotency_key_hmac) = 32
    and octet_length(request_hmac) = 32
  ),
  constraint platform_admin_command_alias_claim_fk foreign key (
    claim_id,
    platform_admin_user_id,
    command_type,
    target_type,
    target_id
  ) references platform_admin_command_idempotency (
    id,
    platform_admin_user_id,
    command_type,
    target_type,
    target_id
  ) on delete cascade
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table platform_admin_command_digest_key_state (
  digest_key_version int not null,
  last_referenced_at datetime(6) not null,
  unreferenced_since datetime(6),
  primary key (digest_key_version),
  constraint platform_admin_command_digest_key_version_check check (digest_key_version >= 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
