alter table sessions
  add column schedule_revision bigint not null default 1,
  add constraint sessions_schedule_revision_check check (schedule_revision >= 1);

alter table session_participants
  add column seen_schedule_revision bigint null,
  add column seen_schedule_at datetime(6) null,
  add constraint session_participants_schedule_seen_pair_check check (
    (seen_schedule_revision is null and seen_schedule_at is null)
    or (
      seen_schedule_revision is not null
      and seen_schedule_revision >= 1
      and seen_schedule_at is not null
    )
  );

create index session_participants_schedule_seen_idx
  on session_participants (club_id, session_id, participation_status, seen_schedule_revision);

create table membership_club_access (
  membership_id char(36) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
  club_id char(36) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
  last_access_at datetime(6) not null,
  primary key (membership_id, club_id),
  constraint membership_club_access_membership_fk
    foreign key (membership_id, club_id) references memberships(id, club_id) on delete cascade
);

alter table host_session_mutation_receipts
  add column schedule_revision bigint not null default 1 after session_revision,
  add constraint host_session_mutation_receipts_schedule_revision_check check (schedule_revision >= 1);
