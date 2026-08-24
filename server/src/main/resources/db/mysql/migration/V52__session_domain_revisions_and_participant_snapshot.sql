alter table sessions
  add column session_revision bigint not null default 0,
  add column exposure_revision bigint not null default 0,
  add column participant_set_revision bigint not null default 0,
  add constraint sessions_session_revision_check check (session_revision >= 0),
  add constraint sessions_exposure_revision_check check (exposure_revision >= 0),
  add constraint sessions_participant_set_revision_check check (participant_set_revision >= 0);

create or replace view active_sessions as
  select * from sessions where deleted_at is null;

alter table session_participants
  add column attendance_revision bigint not null default 0,
  add constraint session_participants_attendance_revision_check check (attendance_revision >= 0);

create table session_publication_versions (
  session_id char(36) not null,
  publication_revision bigint not null default 0,
  primary key (session_id),
  constraint session_publication_versions_session_fk
    foreign key (session_id) references sessions(id) on delete cascade,
  constraint session_publication_versions_revision_check check (publication_revision >= 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

insert into session_publication_versions (session_id, publication_revision)
select id, 0 from sessions;

create table club_host_list_epochs (
  club_id char(36) not null,
  meeting_epoch bigint not null default 0,
  record_epoch bigint not null default 0,
  primary key (club_id),
  constraint club_host_list_epochs_club_fk foreign key (club_id) references clubs(id),
  constraint club_host_list_epochs_meeting_epoch_check check (meeting_epoch >= 0),
  constraint club_host_list_epochs_record_epoch_check check (record_epoch >= 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch)
select id, 0, 0 from clubs;

create table session_participant_change_audit (
  id char(36) not null,
  actor_membership_id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  before_status varchar(16) character set ascii collate ascii_bin not null,
  after_status varchar(16) character set ascii collate ascii_bin not null,
  participant_set_revision bigint not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key session_participant_change_audit_history_idx (club_id, session_id, created_at desc, id desc),
  constraint session_participant_change_audit_status_check check (
    binary before_status in (binary 'ACTIVE', binary 'REMOVED')
    and binary after_status in (binary 'ACTIVE', binary 'REMOVED')
    and binary before_status <> binary after_status
  ),
  constraint session_participant_change_audit_revision_check check (participant_set_revision >= 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
