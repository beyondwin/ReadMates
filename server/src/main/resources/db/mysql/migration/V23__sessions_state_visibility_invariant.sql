alter table sessions
  add constraint sessions_published_visibility_check
    check (state <> 'PUBLISHED' or visibility in ('MEMBER', 'PUBLIC'));

alter table sessions
  add constraint sessions_draft_visibility_check
    check (state <> 'DRAFT' or visibility in ('HOST_ONLY', 'MEMBER'));
