alter table memberships drop check memberships_status_check;

alter table memberships
  add constraint memberships_status_check
  check (status in ('INVITED', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE'));

alter table session_participants
  add column participation_status varchar(20) not null default 'ACTIVE';

alter table session_participants
  add constraint session_participants_participation_status_check
  check (participation_status in ('ACTIVE', 'REMOVED'));

alter table invitations
  add column apply_to_current_session boolean not null default true;
