alter table clubs
  add column status varchar(30) not null default 'ACTIVE';

alter table clubs
  add constraint clubs_status_check check (status in ('SETUP_REQUIRED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'));

create table club_domains (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  hostname varchar(255) not null unique,
  kind varchar(30) not null,
  status varchar(30) not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  last_checked_at timestamptz,
  provisioning_error_code varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_domains_kind_check check (kind in ('SUBDOMAIN', 'CUSTOM_DOMAIN')),
  constraint club_domains_status_check check (status in ('REQUESTED', 'ACTION_REQUIRED', 'PROVISIONING', 'ACTIVE', 'FAILED', 'DISABLED')),
  constraint club_domains_hostname_check check (length(trim(hostname)) > 0)
);

create index club_domains_club_status_idx
  on club_domains (club_id, status, is_primary);

create table platform_admins (
  user_id uuid primary key references users(id),
  role varchar(30) not null,
  status varchar(30) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_role_check check (role in ('OWNER', 'OPERATOR', 'SUPPORT')),
  constraint platform_admins_status_check check (status in ('ACTIVE', 'DISABLED'))
);

create table club_audit_events (
  id uuid primary key,
  actor_user_id uuid references users(id),
  actor_platform_role varchar(30),
  club_id uuid references clubs(id),
  event_type varchar(80) not null,
  metadata_json text not null,
  created_at timestamptz not null default now(),
  constraint club_audit_events_event_type_check check (length(trim(event_type)) > 0)
);

create index club_audit_events_club_created_idx
  on club_audit_events (club_id, created_at);

create index club_audit_events_actor_created_idx
  on club_audit_events (actor_user_id, created_at);

create table platform_audit_events (
  id uuid primary key,
  actor_user_id uuid references users(id),
  actor_platform_role varchar(30),
  target_user_id uuid references users(id),
  event_type varchar(80) not null,
  metadata_json text not null,
  created_at timestamptz not null default now(),
  constraint platform_audit_events_event_type_check check (length(trim(event_type)) > 0)
);

create index platform_audit_events_actor_created_idx
  on platform_audit_events (actor_user_id, created_at);

create index platform_audit_events_target_created_idx
  on platform_audit_events (target_user_id, created_at);

create table support_access_grants (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  granted_by_user_id uuid not null references users(id),
  grantee_user_id uuid not null references users(id),
  scope varchar(60) not null,
  reason varchar(500) not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_access_grants_scope_check check (scope in ('METADATA_READ', 'HOST_SUPPORT_READ')),
  constraint support_access_grants_reason_check check (length(trim(reason)) > 0)
);

create index support_access_grants_club_expires_idx
  on support_access_grants (club_id, expires_at);

create index support_access_grants_grantee_expires_idx
  on support_access_grants (grantee_user_id, expires_at);
