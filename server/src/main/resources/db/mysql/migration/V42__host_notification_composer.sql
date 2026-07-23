create table session_record_apply_receipts (
  id char(36) not null,
  apply_request_id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  host_membership_id char(36) not null,
  expected_draft_revision bigint not null,
  expected_live_revision bigint not null,
  draft_sha256 char(64) not null,
  composer_event_type varchar(60) not null,
  revision_id char(36) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key session_record_apply_receipts_request_uk (club_id, session_id, apply_request_id),
  unique key session_record_apply_receipts_revision_uk (revision_id),
  constraint session_record_apply_receipts_session_fk
    foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_record_apply_receipts_host_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint session_record_apply_receipts_revision_fk
    foreign key (revision_id) references session_record_revisions(id),
  constraint session_record_apply_receipts_revisions_check check (
    expected_draft_revision > 0 and expected_live_revision >= 0
  ),
  constraint session_record_apply_receipts_hash_check check (length(draft_sha256) = 64),
  constraint session_record_apply_receipts_event_check check (
    composer_event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'SESSION_RECORD_UPDATED')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table club_notification_policies (
  club_id char(36) not null,
  session_reminder_enabled boolean not null default false,
  updated_by_membership_id char(36) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (club_id),
  constraint club_notification_policies_club_fk foreign key (club_id) references clubs(id),
  constraint club_notification_policies_updated_by_fk
    foreign key (updated_by_membership_id, club_id) references memberships(id, club_id)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table notification_manual_dispatches
  add column content_revision char(64) null after event_type,
  add key notification_manual_dispatches_revision_idx (
    club_id, session_id, event_type, content_revision, created_at
  );

alter table notification_manual_dispatches
  drop check notification_manual_dispatches_audience_check,
  add constraint notification_manual_dispatches_audience_check
    check (audience in (
      'ALL_ACTIVE_MEMBERS',
      'SESSION_PARTICIPANTS',
      'CONFIRMED_ATTENDEES',
      'SELECTED_MEMBERS'
    )),
  add constraint notification_manual_dispatches_content_revision_check
    check (content_revision is null or regexp_like(content_revision, '^[0-9a-f]{64}$', 'c'));
