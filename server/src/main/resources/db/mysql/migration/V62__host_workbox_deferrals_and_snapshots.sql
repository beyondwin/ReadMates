create table host_work_item_deferrals (
  club_id char(36) not null,
  host_membership_id char(36) not null,
  work_item_key varchar(255) character set ascii collate ascii_bin not null,
  deferred_until datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (club_id, host_membership_id, work_item_key),
  key host_work_item_deferrals_expiry_idx (club_id, host_membership_id, deferred_until),
  constraint host_work_item_deferrals_club_fk
    foreign key (club_id) references clubs(id) on delete cascade,
  constraint host_work_item_deferrals_host_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id) on delete cascade,
  constraint host_work_item_deferrals_key_check
    check (char_length(work_item_key) between 1 and 255)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_workbox_snapshots (
  id char(36) primary key,
  club_id char(36) not null,
  host_membership_id char(36) not null,
  state varchar(20) not null,
  filter_fingerprint char(64) character set ascii collate ascii_bin not null,
  schema_version int not null,
  evaluated_at datetime(6) not null,
  source_availability_json json not null,
  expires_at datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  key host_workbox_snapshots_expiry_idx (expires_at),
  constraint host_workbox_snapshots_host_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id) on delete cascade
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_workbox_snapshot_items (
  snapshot_id char(36) not null,
  ordinal int not null,
  work_item_key varchar(255) character set ascii collate ascii_bin not null,
  projection_json json not null,
  primary key (snapshot_id, ordinal),
  unique key host_workbox_snapshot_item_key (snapshot_id, work_item_key),
  constraint host_workbox_snapshot_items_snapshot_fk
    foreign key (snapshot_id) references host_workbox_snapshots(id) on delete cascade
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
