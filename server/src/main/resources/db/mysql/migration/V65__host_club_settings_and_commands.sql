alter table clubs
  add column approval_policy varchar(24) character set ascii collate ascii_bin not null default 'HOST_APPROVAL',
  add column default_timezone varchar(64) character set ascii collate ascii_bin not null default 'Asia/Seoul',
  add column schedule_reminder_enabled boolean not null default true,
  add column record_publication_default varchar(16) character set ascii collate ascii_bin not null default 'HOST_ONLY',
  add column host_settings_revision bigint not null default 0,
  add constraint clubs_approval_policy_check check (binary approval_policy in (binary 'INVITE_ONLY', binary 'HOST_APPROVAL')),
  add constraint clubs_record_publication_default_check check (binary record_publication_default in (binary 'HOST_ONLY', binary 'MEMBER', binary 'PUBLIC')),
  add constraint clubs_host_settings_revision_check check (host_settings_revision >= 0);

create table host_club_settings_history (
  id char(36) not null,
  club_id char(36) not null,
  revision bigint not null,
  action varchar(32) character set ascii collate ascii_bin not null,
  actor_membership_id char(36) not null,
  subject_membership_id char(36),
  before_settings_json json not null,
  after_settings_json json not null,
  occurred_at datetime(6) not null,
  primary key (id),
  unique key host_club_settings_history_revision_uk (club_id, revision),
  key host_club_settings_history_page_idx (club_id, occurred_at, id),
  constraint host_club_settings_history_club_fk foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_club_settings_history_actor_fk foreign key (actor_membership_id, club_id) references memberships(id, club_id),
  constraint host_club_settings_history_subject_fk foreign key (subject_membership_id, club_id) references memberships(id, club_id),
  constraint host_club_settings_history_action_check
    check (binary action in (binary 'SETTINGS_UPDATED', binary 'CO_HOST_PROMOTED', binary 'CO_HOST_DEMOTED', binary 'CLUB_ENDED')),
  constraint host_club_settings_history_json_check
    check (json_type(before_settings_json) = 'OBJECT' and json_type(after_settings_json) = 'OBJECT')
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_club_command_receipts (
  id char(36) not null,
  club_id char(36) not null,
  actor_membership_id char(36) not null,
  action varchar(32) character set ascii collate ascii_bin not null,
  idempotency_key_hash char(64) character set ascii collate ascii_bin not null,
  request_hash char(64) character set ascii collate ascii_bin not null,
  result_revision bigint not null,
  safe_result_json json not null,
  occurred_at datetime(6) not null,
  primary key (id),
  unique key host_club_command_receipts_id_club_uk (id, club_id),
  unique key host_club_command_receipts_command_uk (club_id, actor_membership_id, idempotency_key_hash),
  key host_club_command_receipts_page_idx (club_id, occurred_at, id),
  constraint host_club_command_receipts_club_fk foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_club_command_receipts_actor_fk foreign key (actor_membership_id, club_id) references memberships(id, club_id),
  constraint host_club_command_receipts_revision_check check (result_revision >= 0),
  constraint host_club_command_receipts_json_check check (json_type(safe_result_json) = 'OBJECT')
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_club_close_previews (
  id char(36) not null,
  club_id char(36) not null,
  actor_membership_id char(36) not null,
  club_revision bigint not null,
  effect_hash char(64) character set ascii collate ascii_bin not null,
  effects_json json not null,
  expires_at datetime(6) not null,
  consumed_receipt_id char(36),
  created_at datetime(6) not null,
  primary key (id),
  key host_club_close_previews_target_idx (club_id, expires_at, id),
  constraint host_club_close_previews_club_fk foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_club_close_previews_actor_fk foreign key (actor_membership_id, club_id) references memberships(id, club_id),
  constraint host_club_close_previews_receipt_fk foreign key (consumed_receipt_id, club_id) references host_club_command_receipts(id, club_id),
  constraint host_club_close_previews_revision_check check (club_revision >= 0),
  constraint host_club_close_previews_json_check check (json_type(effects_json) = 'OBJECT'),
  constraint host_club_close_previews_expiry_check check (expires_at > created_at)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
