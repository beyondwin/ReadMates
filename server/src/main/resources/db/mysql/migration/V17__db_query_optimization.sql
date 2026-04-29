alter table session_feedback_documents
  add column document_title varchar(255);

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
