alter table session_feedback_documents
  add column document_title varchar(255);

alter table session_participants
  add column participation_status varchar(20) not null default 'ACTIVE';

alter table session_participants
  add constraint session_participants_participation_status_check
  check (participation_status in ('ACTIVE', 'REMOVED'));

create table notification_outbox (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  event_type varchar(60) not null,
  aggregate_type varchar(60) not null,
  aggregate_id uuid not null,
  recipient_membership_id uuid,
  recipient_email varchar(320) not null,
  recipient_display_name varchar(100),
  subject varchar(200) not null,
  body_text text not null,
  deep_link_path varchar(500) not null,
  status varchar(20) not null default 'PENDING',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error varchar(500),
  dedupe_key varchar(180) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_recipient_membership_fk foreign key (recipient_membership_id, club_id) references memberships(id, club_id),
  constraint notification_outbox_status_check check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD')),
  constraint notification_outbox_attempt_count_check check (attempt_count >= 0),
  constraint notification_outbox_email_check check (length(trim(recipient_email)) > 0),
  constraint notification_outbox_subject_check check (length(trim(subject)) > 0),
  constraint notification_outbox_body_check check (length(trim(body_text)) > 0),
  constraint notification_outbox_deep_link_path_check check (deep_link_path like '/%'),
  constraint notification_outbox_dedupe_key_check check (length(trim(dedupe_key)) > 0)
);

create unique index notification_outbox_dedupe_key_uk
  on notification_outbox (dedupe_key);

create index notification_outbox_status_next_idx
  on notification_outbox (status, next_attempt_at, created_at);

create index notification_outbox_club_created_idx
  on notification_outbox (club_id, created_at);

create index sessions_club_state_visibility_number_idx
  on sessions (club_id, state, visibility, number, session_date);

create index session_participants_club_session_status_member_idx
  on session_participants (club_id, session_id, participation_status, membership_id);

create index questions_club_session_created_idx
  on questions (club_id, session_id, created_at, priority);

create index one_line_reviews_club_visibility_created_idx
  on one_line_reviews (club_id, visibility, created_at, session_id);

create index long_reviews_club_visibility_created_idx
  on long_reviews (club_id, visibility, created_at, session_id);

create index highlights_club_session_created_idx
  on highlights (club_id, session_id, created_at, sort_order);

create index session_feedback_documents_club_session_version_idx
  on session_feedback_documents (club_id, session_id, version, created_at);

create index notification_outbox_club_status_updated_idx
  on notification_outbox (club_id, status, updated_at, created_at);

create index notification_outbox_club_status_next_idx
  on notification_outbox (club_id, status, next_attempt_at, created_at);
