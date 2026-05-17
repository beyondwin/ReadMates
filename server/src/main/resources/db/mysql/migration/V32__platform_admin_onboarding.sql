alter table clubs
  add column public_visibility varchar(20) not null default 'PUBLIC' after status;

alter table clubs
  add constraint clubs_public_visibility_check check (public_visibility in ('PRIVATE', 'PUBLIC'));

create index clubs_status_public_visibility_idx
  on clubs (status, public_visibility);

alter table invitations
  drop foreign key invitations_inviter_fk;

alter table invitations
  modify column invited_by_membership_id char(36) null;

-- Explicit COLLATE matches users.id (utf8mb4_0900_ai_ci) — without it the new
-- column inherits the invitations table default which under some prod schemas
-- diverges from users.id and rejects the FK below with errno 3780.
alter table invitations
  add column invited_by_platform_admin_user_id char(36)
    character set utf8mb4 collate utf8mb4_0900_ai_ci
    after invited_by_membership_id;

alter table invitations
  add constraint invitations_inviter_fk
  foreign key (invited_by_membership_id, club_id) references memberships(id, club_id);

alter table invitations
  add constraint invitations_platform_admin_inviter_fk
  foreign key (invited_by_platform_admin_user_id) references users(id);

alter table invitations
  add constraint invitations_inviter_source_check
  check (
    invited_by_membership_id is not null
    or invited_by_platform_admin_user_id is not null
  );
