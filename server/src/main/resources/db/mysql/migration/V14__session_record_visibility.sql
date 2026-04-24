alter table public_session_publications
  add column visibility varchar(20) not null default 'HOST_ONLY' after is_public;

update public_session_publications
set visibility = case
  when is_public then 'PUBLIC'
  else 'HOST_ONLY'
end;

alter table public_session_publications
  add constraint public_session_publications_visibility_check
  check (visibility in ('HOST_ONLY', 'MEMBER', 'PUBLIC'));
