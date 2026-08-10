alter table admin_notification_replay_previews
  add column contract_version tinyint unsigned not null default 1,
  add column actor_platform_role varchar(30) character set ascii collate ascii_bin,
  add column club_id char(36);

create table admin_notification_replay_preview_targets (
  preview_id char(36) not null,
  delivery_id char(36) not null,
  club_id char(36) not null,
  expected_status varchar(10) character set ascii collate ascii_bin not null,
  expected_attempt_count int not null,
  expected_failure_code varchar(30) character set ascii collate ascii_bin not null,
  expected_updated_at datetime(6) not null,
  primary key (preview_id, delivery_id),
  key admin_notification_replay_preview_targets_confirm_idx (
    preview_id,
    delivery_id,
    expected_status,
    expected_attempt_count,
    expected_updated_at
  ),
  constraint admin_notification_replay_preview_targets_preview_fk
    foreign key (preview_id) references admin_notification_replay_previews(id) on delete cascade,
  constraint admin_notification_replay_preview_targets_status_check check (
    binary expected_status in (binary 'FAILED', binary 'DEAD')
  ),
  constraint admin_notification_replay_preview_targets_attempt_count_check check (
    expected_attempt_count >= 0
  ),
  constraint admin_notification_replay_preview_targets_failure_code_check check (
    binary expected_failure_code in (binary 'MAIL_RETRYABLE', binary 'MAIL_PERMANENT')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table admin_notification_replay_confirmations (
  id char(36) not null,
  preview_id char(36) not null,
  actor_user_id char(36) not null,
  actor_platform_role varchar(30) character set ascii collate ascii_bin not null,
  club_id char(36),
  selection_hash char(64) not null,
  replayed_count int not null,
  skipped_count int not null,
  platform_audit_event_id char(36) not null,
  confirmed_at datetime(6) not null,
  primary key (id),
  unique key admin_notification_replay_confirmations_preview_uk (preview_id),
  constraint admin_notification_replay_confirmations_preview_fk
    foreign key (preview_id) references admin_notification_replay_previews(id) on delete restrict,
  constraint admin_notification_replay_confirmations_actor_fk
    foreign key (actor_user_id) references users(id) on delete restrict,
  constraint admin_notification_replay_confirmations_club_fk
    foreign key (club_id) references clubs(id) on delete restrict,
  constraint admin_notification_replay_confirmations_audit_fk
    foreign key (platform_audit_event_id) references platform_audit_events(id) on delete restrict,
  constraint admin_notification_replay_confirmations_role_check check (
    binary actor_platform_role in (binary 'OWNER', binary 'OPERATOR')
  ),
  constraint admin_notification_replay_confirmations_hash_check check (
    octet_length(selection_hash) = 64
    and unhex(selection_hash) is not null
    and binary selection_hash = binary lower(hex(unhex(selection_hash)))
  ),
  constraint admin_notification_replay_confirmations_counts_check check (
    replayed_count >= 0 and skipped_count >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table admin_notification_replay_previews
  add column consumed_confirmation_id char(36),
  add constraint admin_notification_replay_previews_confirmation_fk
    foreign key (consumed_confirmation_id) references admin_notification_replay_confirmations(id) on delete restrict,
  add constraint admin_notification_replay_previews_versioned_check check (
    (
      contract_version = 1
      and consumed_confirmation_id is null
    )
    or
    (
      contract_version = 2
      and actor_platform_role is not null
      and binary actor_platform_role in (binary 'OWNER', binary 'OPERATOR')
      and octet_length(selection_hash) = 64
      and unhex(selection_hash) is not null
      and binary selection_hash = binary lower(hex(unhex(selection_hash)))
      and (
        (consumed_at is null and consumed_confirmation_id is null)
        or (consumed_at is not null and consumed_confirmation_id is not null)
      )
    )
  );
