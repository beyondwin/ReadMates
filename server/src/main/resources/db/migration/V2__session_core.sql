alter table memberships
  add constraint memberships_id_club_id_key unique (id, club_id);

create table sessions (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  number integer not null,
  title varchar(255) not null,
  book_title varchar(255) not null,
  book_author varchar(255) not null,
  book_translator varchar(255),
  book_link varchar(500),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  location_label varchar(255) not null,
  question_deadline_at timestamptz not null,
  state varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_state_check check (state in ('DRAFT', 'OPEN', 'CLOSED', 'PUBLISHED')),
  unique (id, club_id),
  unique (club_id, number)
);

create table session_participants (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  membership_id uuid not null,
  rsvp_status varchar(20) not null,
  attendance_status varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_participants_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_participants_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint session_participants_rsvp_status_check check (rsvp_status in ('NO_RESPONSE', 'GOING', 'MAYBE', 'DECLINED')),
  constraint session_participants_attendance_status_check check (attendance_status in ('UNKNOWN', 'ATTENDED', 'ABSENT')),
  unique (session_id, membership_id)
);

create table reading_checkins (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  membership_id uuid not null,
  reading_progress integer not null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reading_checkins_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint reading_checkins_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint reading_checkins_progress_check check (reading_progress between 0 and 100),
  unique (session_id, membership_id)
);

create table questions (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  membership_id uuid not null,
  priority integer not null,
  text text not null,
  draft_thought text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint questions_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint questions_priority_check check (priority between 1 and 3),
  constraint questions_text_check check (length(trim(text)) > 0),
  unique (session_id, membership_id, priority)
);

create table one_line_reviews (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  membership_id uuid not null,
  text varchar(500) not null,
  visibility varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_line_reviews_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint one_line_reviews_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint one_line_reviews_text_check check (length(trim(text)) > 0),
  constraint one_line_reviews_visibility_check check (visibility in ('PRIVATE', 'PUBLIC')),
  unique (session_id, membership_id)
);

create table long_reviews (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  membership_id uuid not null,
  body text not null,
  visibility varchar(20) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint long_reviews_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint long_reviews_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint long_reviews_body_check check (length(trim(body)) > 0),
  constraint long_reviews_visibility_check check (visibility in ('PRIVATE', 'PUBLIC')),
  unique (session_id, membership_id)
);
