alter table sessions
  add column visibility varchar(20) not null default 'HOST_ONLY' after state;

update sessions
left join public_session_publications on public_session_publications.session_id = sessions.id
  and public_session_publications.club_id = sessions.club_id
set sessions.visibility = case
  when sessions.state = 'PUBLISHED' and public_session_publications.visibility = 'PUBLIC' then 'PUBLIC'
  when sessions.state in ('CLOSED', 'PUBLISHED') then 'MEMBER'
  else 'HOST_ONLY'
end;

alter table sessions
  add constraint sessions_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
