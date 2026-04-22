alter table memberships drop check memberships_status_check;

alter table memberships
  add constraint memberships_status_check
  check (status in ('INVITED', 'PENDING_APPROVAL', 'ACTIVE', 'INACTIVE'));

update users
set auth_provider = 'GOOGLE',
    password_hash = null,
    password_set_at = null,
    updated_at = utc_timestamp(6)
where auth_provider = 'PASSWORD';
