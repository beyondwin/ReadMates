alter table memberships
  add column short_name varchar(50);

update memberships
join users on users.id = memberships.user_id
set memberships.short_name = users.short_name;

alter table memberships
  modify short_name varchar(50) not null;

alter table memberships
  add constraint memberships_club_short_name_key unique (club_id, short_name);
