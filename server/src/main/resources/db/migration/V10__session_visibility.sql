alter table sessions
  add column visibility varchar(20) not null default 'HOST_ONLY';

update sessions
set visibility = case
  when state = 'PUBLISHED' and exists (
    select 1
    from public_session_publications
    where public_session_publications.session_id = sessions.id
      and public_session_publications.club_id = sessions.club_id
      and public_session_publications.is_public
  ) then 'PUBLIC'
  when state in ('CLOSED', 'PUBLISHED') then 'MEMBER'
  else 'HOST_ONLY'
end;

alter table sessions
  add constraint sessions_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
