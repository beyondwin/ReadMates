create table admin_public_takedown_previews (
  id char(36) not null,
  actor_admin_id char(36) not null,
  actor_role_snapshot varchar(16) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) not null,
  session_id_snapshot char(36) not null,
  publication_id_snapshot char(36) not null,
  target_generation bigint not null,
  binding_digest_key_version int not null,
  binding_hmac binary(32) not null,
  expires_at datetime(6) not null,
  created_at datetime(6) not null,
  primary key (id),
  key admin_public_takedown_previews_expiry_idx (expires_at),
  constraint admin_public_takedown_previews_generation_check check (target_generation > 0),
  constraint admin_public_takedown_previews_digest_key_check check (binding_digest_key_version >= 0),
  constraint admin_public_takedown_previews_role_check check (
    binary actor_role_snapshot in (binary 'OWNER', binary 'OPERATOR')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table admin_public_takedown_receipts (
  id char(36) not null,
  actor_admin_id char(36) not null,
  actor_role_snapshot varchar(16) character set ascii collate ascii_bin not null,
  capability_snapshot varchar(64) character set ascii collate ascii_bin not null,
  club_id_snapshot char(36) not null,
  session_id_snapshot char(36) not null,
  publication_id_snapshot char(36) not null,
  preview_id_snapshot char(36) not null,
  idempotency_key_hmac binary(32) not null,
  canonical_schema_version int not null,
  digest_key_version int not null,
  request_hmac binary(32) not null,
  reason_category varchar(32) character set ascii collate ascii_bin not null,
  reason_summary varchar(32) character set ascii collate ascii_bin not null,
  origin_result varchar(16) character set ascii collate ascii_bin not null,
  committed_generation bigint not null,
  committed_club_generation bigint not null,
  convergence_id char(36) not null,
  created_at datetime(6) not null,
  primary key (id),
  unique key admin_public_takedown_receipts_scope_uk (
    actor_admin_id, capability_snapshot, club_id_snapshot, publication_id_snapshot,
    idempotency_key_hmac
  ),
  unique key admin_public_takedown_receipts_convergence_uk (convergence_id),
  key admin_public_takedown_receipts_target_idx (
    club_id_snapshot, session_id_snapshot, created_at desc
  ),
  constraint admin_public_takedown_receipts_generation_check check (
    committed_generation > 0 and committed_club_generation > 0
  ),
  constraint admin_public_takedown_receipts_contract_check check (
    binary capability_snapshot = binary 'EMERGENCY_PUBLIC_TAKEDOWN'
    and binary reason_summary = binary 'REDACTED_NON_EMPTY'
    and binary origin_result = binary 'DENIED'
    and canonical_schema_version = 1
    and digest_key_version >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
