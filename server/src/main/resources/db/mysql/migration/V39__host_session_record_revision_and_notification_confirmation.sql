create table session_record_drafts (
  session_id char(36) not null,
  club_id char(36) not null,
  base_live_revision bigint not null,
  draft_revision bigint not null,
  source varchar(30) not null,
  restored_from_revision_id char(36),
  snapshot_json longtext not null,
  snapshot_sha256 char(64) not null,
  updated_by_membership_id char(36) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (session_id, club_id),
  constraint session_record_drafts_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_record_drafts_host_fk foreign key (updated_by_membership_id, club_id) references memberships(id, club_id),
  constraint session_record_drafts_source_check check (source in ('MANUAL','JSON_IMPORT','AI_GENERATED','RESTORED')),
  constraint session_record_drafts_revision_check check (base_live_revision >= 0 and draft_revision > 0),
  constraint session_record_drafts_sha_check check (length(snapshot_sha256) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table session_record_revisions (
  id char(36) not null,
  session_id char(36) not null,
  club_id char(36) not null,
  version bigint not null,
  source varchar(30) not null,
  restored_from_revision_id char(36),
  snapshot_json longtext not null,
  snapshot_sha256 char(64) not null,
  applied_by_membership_id char(36) not null,
  applied_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key session_record_revisions_version_uk (club_id, session_id, version),
  key session_record_revisions_history_idx (club_id, session_id, applied_at desc, id desc),
  constraint session_record_revisions_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_record_revisions_host_fk foreign key (applied_by_membership_id, club_id) references memberships(id, club_id),
  constraint session_record_revisions_restore_fk foreign key (restored_from_revision_id) references session_record_revisions(id),
  constraint session_record_revisions_source_check check (
    source in ('BASELINE','MANUAL','JSON_IMPORT','AI_GENERATED','RESTORED')
  ),
  constraint session_record_revisions_version_check check (version > 0),
  constraint session_record_revisions_sha_check check (length(snapshot_sha256) = 64)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table session_record_drafts
  add constraint session_record_drafts_restore_fk
    foreign key (restored_from_revision_id) references session_record_revisions(id);

create table host_session_change_audit (
  id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  actor_membership_id char(36) not null,
  action_type varchar(40) not null,
  changed_fields_json longtext not null,
  request_id varchar(100),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key host_session_change_audit_history_idx (club_id, session_id, created_at desc, id desc),
  key host_session_change_audit_actor_idx (club_id, actor_membership_id, created_at desc),
  constraint host_session_change_audit_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint host_session_change_audit_actor_fk foreign key (actor_membership_id, club_id) references memberships(id, club_id),
  constraint host_session_change_audit_fields_json_check check (json_valid(changed_fields_json)),
  constraint host_session_change_audit_action_check check (action_type in ('BASIC_INFO_UPDATED','ATTENDANCE_UPDATED'))
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_action_notification_previews (
  id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  host_membership_id char(36) not null,
  action_type varchar(40) not null,
  event_type varchar(60) not null,
  request_hash char(64) not null,
  expected_draft_revision bigint,
  expected_live_revision bigint not null,
  target_count int not null,
  expected_in_app_count int not null,
  expected_email_count int not null,
  excluded_count int not null,
  expires_at datetime(6) not null,
  consumed_at datetime(6),
  consumed_decision_id char(36),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key host_action_notification_previews_host_idx (club_id, host_membership_id, expires_at),
  key host_action_notification_previews_session_idx (club_id, session_id, created_at desc),
  constraint host_action_notification_previews_session_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint host_action_notification_previews_host_fk foreign key (host_membership_id, club_id)
    references memberships(id, club_id),
  constraint host_action_notification_previews_action_check check (
    action_type in ('RECORD_APPLY','VISIBILITY_UPDATE')
  ),
  constraint host_action_notification_previews_event_check check (
    event_type in ('NEXT_BOOK_PUBLISHED','FEEDBACK_DOCUMENT_PUBLISHED','SESSION_RECORD_UPDATED')
  ),
  constraint host_action_notification_previews_hash_check check (length(request_hash) = 64),
  constraint host_action_notification_previews_revision_check check (
    expected_live_revision >= 0 and (expected_draft_revision is null or expected_draft_revision > 0)
  ),
  constraint host_action_notification_previews_counts_check check (
    target_count >= 0 and expected_in_app_count >= 0 and expected_email_count >= 0 and excluded_count >= 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table host_action_notification_decisions (
  id char(36) not null,
  preview_id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  host_membership_id char(36) not null,
  action_type varchar(40) not null,
  event_type varchar(60) not null,
  live_revision bigint not null,
  decision varchar(10) not null,
  target_count int not null,
  expected_in_app_count int not null,
  expected_email_count int not null,
  excluded_count int not null,
  event_id char(36),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  unique key host_action_notification_decisions_preview_uk (preview_id),
  unique key host_action_notification_decisions_revision_uk (club_id, session_id, action_type, live_revision),
  key host_action_notification_decisions_history_idx (club_id, session_id, created_at desc, id desc),
  constraint host_action_notification_decisions_preview_fk foreign key (preview_id)
    references host_action_notification_previews(id),
  constraint host_action_notification_decisions_session_fk foreign key (session_id, club_id)
    references sessions(id, club_id),
  constraint host_action_notification_decisions_host_fk foreign key (host_membership_id, club_id)
    references memberships(id, club_id),
  constraint host_action_notification_decisions_event_fk foreign key (event_id, club_id)
    references notification_event_outbox(id, club_id),
  constraint host_action_notification_decisions_action_check check (
    action_type in ('RECORD_APPLY','VISIBILITY_UPDATE')
  ),
  constraint host_action_notification_decisions_event_type_check check (
    event_type in ('NEXT_BOOK_PUBLISHED','FEEDBACK_DOCUMENT_PUBLISHED','SESSION_RECORD_UPDATED')
  ),
  constraint host_action_notification_decisions_decision_check check (decision in ('SEND','SKIP')),
  constraint host_action_notification_decisions_revision_check check (live_revision >= 0),
  constraint host_action_notification_decisions_counts_check check (
    target_count >= 0 and expected_in_app_count >= 0 and expected_email_count >= 0 and excluded_count >= 0
  ),
  constraint host_action_notification_decisions_event_presence_check check (
    (decision = 'SEND' and event_id is not null) or (decision = 'SKIP' and event_id is null)
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

alter table host_action_notification_previews
  add constraint host_action_notification_previews_decision_fk
    foreign key (consumed_decision_id) references host_action_notification_decisions(id),
  add constraint host_action_notification_previews_consumed_check
    check (
      (consumed_at is null and consumed_decision_id is null)
      or (consumed_at is not null and consumed_decision_id is not null)
    );
