alter table memberships drop check memberships_status_check;

update memberships
set status = 'VIEWER',
    updated_at = utc_timestamp(6)
where status = 'PENDING_APPROVAL';

alter table memberships
  add constraint memberships_status_check
  check (status in ('INVITED', 'VIEWER', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE'));
