create table notification_manual_dispatch_previews (
  id char(36) not null,
  club_id char(36) not null,
  host_membership_id char(36) not null,
  selection_hash char(64) not null,
  expires_at datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key notification_manual_dispatch_previews_host_idx (club_id, host_membership_id, expires_at),
  constraint notification_manual_dispatch_previews_club_fk foreign key (club_id) references clubs(id),
  constraint notification_manual_dispatch_previews_host_fk foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint notification_manual_dispatch_previews_hash_check check (length(selection_hash) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table notification_manual_dispatches (
  id char(36) not null,
  club_id char(36) not null,
  event_id char(36) not null,
  session_id char(36) not null,
  event_type varchar(60) not null,
  requested_by_membership_id char(36) not null,
  requested_channels varchar(20) not null,
  audience varchar(40) not null,
  excluded_count int not null default 0,
  included_count int not null default 0,
  target_count int not null default 0,
  expected_in_app_count int not null default 0,
  expected_email_count int not null default 0,
  resend boolean not null default false,
  send_mode varchar(20) not null default 'NOW',
  scheduled_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key notification_manual_dispatches_event_uk (event_id),
  key notification_manual_dispatches_duplicate_idx (club_id, session_id, event_type, created_at),
  key notification_manual_dispatches_host_idx (club_id, requested_by_membership_id, created_at),
  constraint notification_manual_dispatches_event_fk foreign key (event_id, club_id) references notification_event_outbox(id, club_id),
  constraint notification_manual_dispatches_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint notification_manual_dispatches_host_fk foreign key (requested_by_membership_id, club_id) references memberships(id, club_id),
  constraint notification_manual_dispatches_requested_channels_check check (requested_channels in ('IN_APP', 'EMAIL', 'BOTH')),
  constraint notification_manual_dispatches_audience_check check (audience in ('ALL_ACTIVE_MEMBERS', 'SESSION_PARTICIPANTS', 'CONFIRMED_ATTENDEES')),
  constraint notification_manual_dispatches_send_mode_check check (send_mode in ('NOW')),
  constraint notification_manual_dispatches_counts_check check (
    excluded_count >= 0 and included_count >= 0 and target_count >= 0 and expected_in_app_count >= 0 and expected_email_count >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
