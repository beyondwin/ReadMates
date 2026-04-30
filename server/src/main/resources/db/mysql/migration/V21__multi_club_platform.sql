alter table clubs
  add column status varchar(30) not null default 'ACTIVE';

alter table clubs
  add constraint clubs_status_check check (status in ('SETUP_REQUIRED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'));

create table club_domains (
  id char(36) not null,
  club_id char(36) not null,
  hostname varchar(255) not null,
  kind varchar(30) not null,
  status varchar(30) not null,
  is_primary boolean not null default false,
  verified_at datetime(6),
  last_checked_at datetime(6),
  provisioning_error_code varchar(120),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key club_domains_hostname_uk (hostname),
  key club_domains_club_status_idx (club_id, status, is_primary),
  constraint club_domains_club_fk foreign key (club_id) references clubs(id),
  constraint club_domains_kind_check check (kind in ('SUBDOMAIN', 'CUSTOM_DOMAIN')),
  constraint club_domains_status_check check (status in ('REQUESTED', 'ACTION_REQUIRED', 'PROVISIONING', 'ACTIVE', 'FAILED', 'DISABLED')),
  constraint club_domains_hostname_check check (length(trim(hostname)) > 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table platform_admins (
  user_id char(36) not null,
  role varchar(30) not null,
  status varchar(30) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (user_id),
  constraint platform_admins_user_fk foreign key (user_id) references users(id),
  constraint platform_admins_role_check check (role in ('OWNER', 'OPERATOR', 'SUPPORT')),
  constraint platform_admins_status_check check (status in ('ACTIVE', 'DISABLED'))
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table club_audit_events (
  id char(36) not null,
  actor_user_id char(36),
  actor_platform_role varchar(30),
  club_id char(36),
  event_type varchar(80) not null,
  metadata_json json not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key club_audit_events_club_created_idx (club_id, created_at),
  key club_audit_events_actor_created_idx (actor_user_id, created_at),
  constraint club_audit_events_actor_fk foreign key (actor_user_id) references users(id),
  constraint club_audit_events_club_fk foreign key (club_id) references clubs(id),
  constraint club_audit_events_event_type_check check (length(trim(event_type)) > 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table platform_audit_events (
  id char(36) not null,
  actor_user_id char(36),
  actor_platform_role varchar(30),
  target_user_id char(36),
  event_type varchar(80) not null,
  metadata_json json not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key platform_audit_events_actor_created_idx (actor_user_id, created_at),
  key platform_audit_events_target_created_idx (target_user_id, created_at),
  constraint platform_audit_events_actor_fk foreign key (actor_user_id) references users(id),
  constraint platform_audit_events_target_fk foreign key (target_user_id) references users(id),
  constraint platform_audit_events_event_type_check check (length(trim(event_type)) > 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table support_access_grants (
  id char(36) not null,
  club_id char(36) not null,
  granted_by_user_id char(36) not null,
  grantee_user_id char(36) not null,
  scope varchar(60) not null,
  reason varchar(500) not null,
  expires_at datetime(6) not null,
  revoked_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key support_access_grants_club_expires_idx (club_id, expires_at),
  key support_access_grants_grantee_expires_idx (grantee_user_id, expires_at),
  constraint support_access_grants_club_fk foreign key (club_id) references clubs(id),
  constraint support_access_grants_granted_by_fk foreign key (granted_by_user_id) references users(id),
  constraint support_access_grants_grantee_fk foreign key (grantee_user_id) references users(id),
  constraint support_access_grants_scope_check check (scope in ('METADATA_READ', 'HOST_SUPPORT_READ')),
  constraint support_access_grants_reason_check check (length(trim(reason)) > 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
