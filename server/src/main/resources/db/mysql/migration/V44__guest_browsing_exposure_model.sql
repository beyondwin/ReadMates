alter table sessions
  add column access_scope varchar(24) not null default 'HOST_ONLY' after visibility;

update sessions
set access_scope = case
  when visibility in ('MEMBER', 'PUBLIC') then 'GUEST_READABLE'
  else 'HOST_ONLY'
end;

alter table sessions
  add constraint sessions_access_scope_check
  check (access_scope in ('HOST_ONLY', 'GUEST_READABLE'));

alter table public_session_publications
  add column site_visibility varchar(24) not null default 'HIDDEN' after visibility;

update public_session_publications p
join sessions s on s.id = p.session_id and s.club_id = p.club_id
set p.site_visibility = case
  when s.state in ('CLOSED', 'PUBLISHED')
   and s.visibility in ('MEMBER', 'PUBLIC')
   and (p.visibility = 'PUBLIC' or p.is_public = true)
    then 'PUBLIC_RECORD'
  else 'HIDDEN'
end;

alter table public_session_publications
  add constraint public_session_publications_site_visibility_check
  check (site_visibility in ('HIDDEN', 'PUBLIC_RECORD'));

create index sessions_club_access_state_number_idx
  on sessions (club_id, access_scope, state, number desc);
