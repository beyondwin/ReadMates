alter table invitations
  add constraint invitations_status_check check (status in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  add constraint invitations_role_check check (role in ('MEMBER', 'HOST'));

alter table memberships
  add constraint memberships_status_check check (status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  add constraint memberships_role_check check (role in ('MEMBER', 'HOST'));

create index invitations_club_email_idx
  on invitations (club_id, lower(invited_email));

create index invitations_club_created_idx
  on invitations (club_id, created_at desc);
