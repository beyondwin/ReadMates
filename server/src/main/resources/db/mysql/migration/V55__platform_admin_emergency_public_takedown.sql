create table admin_public_takedown_previews (
  id char(36) not null,
  actor_user_id_snapshot char(36) not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) not null,
  session_id_snapshot char(36) not null,
  publication_id_snapshot char(36) not null,
  target_generation bigint not null,
  current_surfaces_json json not null,
  expires_at datetime(6) not null,
  created_at datetime(6) not null,
  primary key (id),
  key admin_public_takedown_previews_expiry_idx (expires_at, id),
  constraint admin_public_takedown_previews_generation_check check (target_generation > 0),
  constraint admin_public_takedown_previews_role_check check (
    binary actor_platform_role_snapshot in (binary 'OWNER', binary 'OPERATOR')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
create table admin_public_takedown_receipts (
  id char(36) not null,
  convergence_id char(36) not null,
  actor_user_id_snapshot char(36) not null,
  actor_platform_role_snapshot varchar(30) character set ascii collate ascii_bin not null,
  reason_category varchar(64) character set ascii collate ascii_bin not null,
  reason_redacted boolean not null,
  club_id_snapshot char(36) not null,
  session_id_snapshot char(36) not null,
  publication_id_snapshot char(36) not null,
  committed_generation bigint not null,
  origin_result varchar(16) character set ascii collate ascii_bin not null,
  current_surfaces_json json not null,
  remote_copy_limitation_code varchar(64) character set ascii collate ascii_bin not null,
  created_at datetime(6) not null,
  primary key (id),
  unique key admin_public_takedown_receipts_convergence_unique (convergence_id),
  key admin_public_takedown_receipts_target_idx (
    club_id_snapshot,
    publication_id_snapshot,
    created_at desc,
    id
  ),
  constraint admin_public_takedown_receipts_generation_check check (committed_generation > 1),
  constraint admin_public_takedown_receipts_origin_check check (binary origin_result = binary 'DENIED'),
  constraint admin_public_takedown_receipts_reason_check check (
    length(trim(reason_category)) > 0 and reason_redacted = true
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table admin_public_takedown_idempotency (
  actor_user_id char(36) not null,
  operation varchar(64) character set ascii collate ascii_bin not null,
  club_id char(36) not null,
  publication_id char(36) not null,
  idempotency_key varchar(128) character set ascii collate ascii_bin not null,
  request_hmac binary(32) not null,
  canonical_schema_version int not null,
  digest_key_version int not null,
  receipt_id char(36),
  created_at datetime(6) not null,
  completed_at datetime(6),
  expires_at datetime(6) not null,
  primary key (actor_user_id, operation, club_id, publication_id, idempotency_key),
  key admin_public_takedown_idempotency_expiry_idx (expires_at, actor_user_id, idempotency_key),
  constraint admin_public_takedown_idempotency_operation_check check (
    binary operation = binary 'EMERGENCY_PUBLIC_TAKEDOWN'
  ),
  constraint admin_public_takedown_idempotency_key_check check (
    length(idempotency_key) between 8 and 128
  ),
  constraint admin_public_takedown_idempotency_schema_check check (
    canonical_schema_version = 1 and digest_key_version >= 0
  ),
  constraint admin_public_takedown_idempotency_completion_check check (
    (receipt_id is null and completed_at is null)
    or (receipt_id is not null and completed_at is not null)
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
