create table mutation_idempotency_keys (
  club_id char(36) not null,
  actor_membership_id char(36) not null,
  operation varchar(64) character set ascii collate ascii_bin not null,
  resource_slot varchar(128) character set ascii collate ascii_bin not null,
  idempotency_key varchar(128) character set ascii collate ascii_bin not null,
  canonical_schema_version int not null,
  digest_key_version int not null,
  request_hmac binary(32) not null,
  status varchar(16) character set ascii collate ascii_bin not null,
  receipt_id char(36),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  expires_at datetime(6) not null,
  primary key (club_id, actor_membership_id, operation, resource_slot, idempotency_key),
  key mutation_idempotency_keys_expires_idx (expires_at, digest_key_version),
  key mutation_idempotency_keys_digest_idx (digest_key_version, expires_at),
  constraint mutation_idempotency_keys_schema_check check (canonical_schema_version > 0),
  constraint mutation_idempotency_keys_digest_check check (digest_key_version >= 0),
  constraint mutation_idempotency_keys_status_check check (
    binary status in (binary 'IN_PROGRESS', binary 'COMPLETED')
  ),
  constraint mutation_idempotency_keys_receipt_check check (
    (binary status = binary 'IN_PROGRESS' and receipt_id is null)
    or (binary status = binary 'COMPLETED' and receipt_id is not null)
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table mutation_digest_key_state (
  digest_key_version int not null,
  last_referenced_at datetime(6) not null,
  unreferenced_since datetime(6),
  primary key (digest_key_version),
  constraint mutation_digest_key_state_version_check check (digest_key_version >= 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_session_mutation_receipts (
  id char(36) not null,
  club_id char(36) not null,
  actor_membership_id char(36) not null,
  operation varchar(64) character set ascii collate ascii_bin not null,
  resource_id char(36) not null,
  session_revision bigint not null,
  exposure_revision bigint not null,
  participant_set_revision bigint not null,
  record_draft_revision bigint,
  live_record_revision bigint,
  publication_revision bigint not null,
  notification_decision varchar(32) character set ascii collate ascii_bin not null,
  dispatch_receipt_id char(36),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key host_session_mutation_receipts_club_idx (club_id, created_at desc, id desc),
  constraint host_session_mutation_receipts_revision_check check (
    session_revision >= 0
    and exposure_revision >= 0
    and participant_set_revision >= 0
    and publication_revision >= 0
    and (record_draft_revision is null or record_draft_revision > 0)
    and (live_record_revision is null or live_record_revision > 0)
  ),
  constraint host_session_mutation_receipts_decision_check check (
    (
      binary notification_decision = binary 'NOT_SENT'
      and dispatch_receipt_id is null
    )
    or (
      binary notification_decision = binary 'DISPATCH_REFERENCED'
      and dispatch_receipt_id is not null
    )
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table session_record_drafts
  add column base_session_revision bigint not null default 0 after base_live_revision,
  add column base_exposure_revision bigint not null default 0 after base_session_revision,
  add column base_publication_revision bigint not null default 0 after base_exposure_revision,
  add column base_vector_known boolean not null default false after base_publication_revision;

update session_record_drafts d
join sessions s
  on s.id = d.session_id and s.club_id = d.club_id
left join session_publication_versions p
  on p.session_id = d.session_id
set d.base_session_revision = s.session_revision,
    d.base_exposure_revision = s.exposure_revision,
    d.base_publication_revision = coalesce(p.publication_revision, 0),
    d.base_vector_known = true
where d.base_session_updated_at = s.updated_at;

alter table session_record_drafts
  add constraint session_record_drafts_base_session_revision_check check (base_session_revision >= 0),
  add constraint session_record_drafts_base_exposure_revision_check check (base_exposure_revision >= 0),
  add constraint session_record_drafts_base_publication_revision_check check (base_publication_revision >= 0),
  add constraint session_record_drafts_base_vector_known_check check (base_vector_known in (false, true));
