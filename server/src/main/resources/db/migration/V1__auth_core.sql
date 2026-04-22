create table clubs (
  id uuid primary key,
  slug varchar(80) not null unique,
  name varchar(120) not null,
  tagline varchar(255) not null,
  about text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  google_subject_id varchar(255) not null unique,
  email varchar(255) not null unique,
  name varchar(120) not null,
  profile_image_url varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  user_id uuid not null references users(id),
  role varchar(20) not null,
  status varchar(20) not null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table invitations (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  invited_by_membership_id uuid not null references memberships(id),
  invited_email varchar(255) not null,
  role varchar(20) not null,
  token_hash varchar(255) not null unique,
  status varchar(20) not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
