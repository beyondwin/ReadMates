alter table session_record_drafts
  add column base_session_updated_at datetime(6) not null default (utc_timestamp(6))
    after base_live_revision;

update session_record_drafts draft
join sessions session
  on session.id = draft.session_id
 and session.club_id = draft.club_id
set draft.base_session_updated_at = session.updated_at;
