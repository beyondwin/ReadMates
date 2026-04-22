create table highlights (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  text text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint highlights_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint highlights_text_check check (length(trim(text)) > 0),
  constraint highlights_sort_order_check check (sort_order >= 0),
  unique (session_id, sort_order)
);

create table public_session_publications (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  public_summary text not null,
  is_public boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_session_publications_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint public_session_publications_summary_check check (length(trim(public_summary)) > 0),
  constraint public_session_publications_published_at_check check (not is_public or published_at is not null),
  unique (session_id)
);

create table feedback_reports (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  membership_id uuid not null,
  version integer not null,
  stored_path varchar(500) not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_reports_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint feedback_reports_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint feedback_reports_version_check check (version > 0),
  constraint feedback_reports_stored_path_check check (length(trim(stored_path)) > 0),
  constraint feedback_reports_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%'),
  constraint feedback_reports_content_type_check check (content_type = 'text/html'),
  constraint feedback_reports_file_size_check check (file_size > 0),
  unique (session_id, membership_id, version)
);
