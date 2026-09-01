create table host_invitation_links (
  id char(36) not null,
  club_id char(36) not null,
  created_by_membership_id char(36) not null,
  name varchar(120) not null,
  token_hash char(64) character set ascii collate ascii_bin not null,
  status varchar(16) character set ascii collate ascii_bin not null,
  max_uses int not null,
  used_count int not null default 0,
  expires_at datetime(6) not null,
  revision bigint not null default 0,
  created_at datetime(6) not null,
  updated_at datetime(6) not null,
  primary key (id),
  unique key host_invitation_links_token_hash_uk (token_hash),
  unique key host_invitation_links_id_club_uk (id, club_id),
  key host_invitation_links_club_created_idx (club_id, created_at, id),
  constraint host_invitation_links_club_fk foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_invitation_links_creator_fk
    foreign key (created_by_membership_id, club_id) references memberships(id, club_id),
  constraint host_invitation_links_status_check
    check (binary status in (binary 'ACTIVE', binary 'PAUSED', binary 'EXHAUSTED', binary 'EXPIRED')),
  constraint host_invitation_links_usage_check check (max_uses between 1 and 10000 and used_count between 0 and max_uses),
  constraint host_invitation_links_revision_check check (revision >= 0),
  constraint host_invitation_links_name_check check (length(trim(name)) between 1 and 120),
  constraint host_invitation_links_time_check check (expires_at > created_at and updated_at >= created_at)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_invitation_link_events (
  id char(36) not null,
  link_id char(36) not null,
  club_id char(36) not null,
  revision bigint not null,
  action varchar(24) character set ascii collate ascii_bin not null,
  before_settings_json json not null,
  after_settings_json json not null,
  actor_membership_id char(36),
  idempotency_key_hash char(64) character set ascii collate ascii_bin not null,
  request_hash char(64) character set ascii collate ascii_bin not null,
  occurred_at datetime(6) not null,
  primary key (id),
  unique key host_invitation_link_events_revision_uk (link_id, revision),
  unique key host_invitation_link_events_command_uk (club_id, actor_membership_id, idempotency_key_hash),
  key host_invitation_link_events_history_idx (club_id, link_id, occurred_at, id),
  constraint host_invitation_link_events_club_fk foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_invitation_link_events_link_fk foreign key (link_id, club_id)
    references host_invitation_links(id, club_id),
  constraint host_invitation_link_events_actor_fk
    foreign key (actor_membership_id, club_id) references memberships(id, club_id),
  constraint host_invitation_link_events_action_check
    check (binary action in (binary 'CREATED', binary 'UPDATED', binary 'ACCEPTED')),
  constraint host_invitation_link_events_revision_check check (revision >= 0),
  constraint host_invitation_link_events_json_check
    check (json_type(before_settings_json) = 'OBJECT' and json_type(after_settings_json) = 'OBJECT')
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
