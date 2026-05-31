create table admin_notification_replay_previews (
  id char(36) not null,
  actor_user_id char(36) not null,
  filter_json json not null,
  selection_hash char(64) not null,
  matched_count int not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key admin_notification_replay_previews_actor_created_idx (actor_user_id, created_at),
  key admin_notification_replay_previews_expires_idx (expires_at),
  constraint admin_notification_replay_previews_actor_fk foreign key (actor_user_id) references users(id),
  constraint admin_notification_replay_previews_count_check check (matched_count >= 0),
  constraint admin_notification_replay_previews_hash_check check (length(selection_hash) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
