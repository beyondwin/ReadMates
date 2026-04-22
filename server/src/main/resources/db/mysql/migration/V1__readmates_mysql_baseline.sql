create table clubs (
  id char(36) primary key,
  slug varchar(80) not null unique,
  name varchar(120) not null,
  tagline varchar(255) not null,
  about text not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6)
);

create table users (
  id char(36) primary key,
  google_subject_id varchar(255),
  email varchar(320) not null unique,
  name varchar(120) not null,
  short_name varchar(50) not null,
  profile_image_url varchar(1000),
  password_hash varchar(255),
  password_set_at datetime(6),
  last_login_at datetime(6),
  auth_provider varchar(30) not null default 'PASSWORD',
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint users_auth_provider_check check (auth_provider in ('PASSWORD', 'GOOGLE'))
);

create unique index users_google_subject_id_idx on users (google_subject_id);

create table memberships (
  id char(36) primary key,
  club_id char(36) not null,
  user_id char(36) not null,
  role varchar(20) not null,
  status varchar(20) not null,
  joined_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint memberships_club_fk foreign key (club_id) references clubs(id),
  constraint memberships_user_fk foreign key (user_id) references users(id),
  constraint memberships_role_check check (role in ('MEMBER', 'HOST')),
  constraint memberships_status_check check (status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  unique (club_id, user_id),
  unique (id, club_id)
);

create table invitations (
  id char(36) primary key,
  club_id char(36) not null,
  invited_by_membership_id char(36) not null,
  invited_email varchar(320) not null,
  invited_name varchar(120) not null,
  role varchar(20) not null,
  token_hash varchar(64) not null unique,
  status varchar(20) not null,
  expires_at datetime(6) not null,
  accepted_at datetime(6),
  accepted_user_id char(36),
  revoked_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint invitations_club_fk foreign key (club_id) references clubs(id),
  constraint invitations_inviter_fk foreign key (invited_by_membership_id, club_id) references memberships(id, club_id),
  constraint invitations_accepted_user_fk foreign key (accepted_user_id) references users(id),
  constraint invitations_status_check check (status in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  constraint invitations_role_check check (role in ('MEMBER', 'HOST'))
);

create index invitations_club_email_idx on invitations (club_id, invited_email);
create index invitations_club_created_idx on invitations (club_id, created_at);

create table auth_sessions (
  id char(36) primary key,
  user_id char(36) not null,
  session_token_hash varchar(64) not null unique,
  created_at datetime(6) not null default current_timestamp(6),
  last_seen_at datetime(6) not null default current_timestamp(6),
  expires_at datetime(6) not null,
  revoked_at datetime(6),
  user_agent text,
  ip_hash varchar(64),
  constraint auth_sessions_user_fk foreign key (user_id) references users(id)
);

create index auth_sessions_user_idx on auth_sessions (user_id, expires_at);

create table password_reset_tokens (
  id char(36) primary key,
  user_id char(36) not null,
  token_hash varchar(64) not null unique,
  created_by_membership_id char(36) not null,
  created_at datetime(6) not null default current_timestamp(6),
  expires_at datetime(6) not null,
  used_at datetime(6),
  revoked_at datetime(6),
  constraint password_reset_tokens_user_fk foreign key (user_id) references users(id),
  constraint password_reset_tokens_creator_fk foreign key (created_by_membership_id) references memberships(id)
);

create index password_reset_tokens_user_idx on password_reset_tokens (user_id, expires_at);

create table sessions (
  id char(36) primary key,
  club_id char(36) not null,
  number integer not null,
  title varchar(255) not null,
  book_title varchar(255) not null,
  book_author varchar(255) not null,
  book_translator varchar(255),
  book_link varchar(1000),
  book_image_url varchar(1000),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  location_label varchar(255) not null,
  meeting_url varchar(1000),
  meeting_passcode varchar(255),
  question_deadline_at datetime(6) not null,
  state varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint sessions_club_fk foreign key (club_id) references clubs(id),
  constraint sessions_state_check check (state in ('DRAFT', 'OPEN', 'CLOSED', 'PUBLISHED')),
  unique (id, club_id),
  unique (club_id, number)
);

create table session_participants (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  rsvp_status varchar(20) not null,
  attendance_status varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint session_participants_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_participants_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint session_participants_rsvp_status_check check (rsvp_status in ('NO_RESPONSE', 'GOING', 'MAYBE', 'DECLINED')),
  constraint session_participants_attendance_status_check check (attendance_status in ('UNKNOWN', 'ATTENDED', 'ABSENT')),
  unique (session_id, membership_id)
);

create table reading_checkins (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  reading_progress integer not null,
  note text not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint reading_checkins_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint reading_checkins_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint reading_checkins_progress_check check (reading_progress between 0 and 100),
  unique (session_id, membership_id)
);

create table questions (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  priority integer not null,
  text text not null,
  draft_thought text,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint questions_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint questions_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint questions_priority_check check (priority between 1 and 5),
  constraint questions_text_check check (length(trim(text)) > 0),
  unique (session_id, membership_id, priority)
);

create table one_line_reviews (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  text varchar(500) not null,
  visibility varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint one_line_reviews_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint one_line_reviews_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint one_line_reviews_text_check check (length(trim(text)) > 0),
  constraint one_line_reviews_visibility_check check (visibility in ('PRIVATE', 'PUBLIC')),
  unique (session_id, membership_id)
);

create table long_reviews (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  body text not null,
  visibility varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint long_reviews_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint long_reviews_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint long_reviews_body_check check (length(trim(body)) > 0),
  constraint long_reviews_visibility_check check (visibility in ('PRIVATE', 'PUBLIC')),
  unique (session_id, membership_id)
);

create table highlights (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36),
  text text not null,
  sort_order integer not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint highlights_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint highlights_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint highlights_text_check check (length(trim(text)) > 0),
  constraint highlights_sort_order_check check (sort_order >= 0),
  unique (session_id, sort_order)
);

create table public_session_publications (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  public_summary text not null,
  is_public boolean not null default false,
  published_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint public_session_publications_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint public_session_publications_summary_check check (length(trim(public_summary)) > 0),
  constraint public_session_publications_published_at_check check (not is_public or published_at is not null),
  unique (session_id)
);

create table feedback_reports (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  version integer not null,
  stored_path varchar(500) not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint feedback_reports_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint feedback_reports_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint feedback_reports_version_check check (version > 0),
  constraint feedback_reports_stored_path_check check (length(trim(stored_path)) > 0),
  constraint feedback_reports_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%'),
  constraint feedback_reports_content_type_check check (content_type = 'text/html'),
  constraint feedback_reports_file_size_check check (file_size > 0),
  unique (session_id, membership_id, version)
);

create table session_feedback_documents (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  version integer not null,
  source_text longtext not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint session_feedback_documents_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_feedback_documents_version_check check (version > 0),
  constraint session_feedback_documents_source_text_check check (length(trim(source_text)) > 0),
  constraint session_feedback_documents_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%' and instr(file_name, char(92)) = 0),
  constraint session_feedback_documents_content_type_check check (content_type in ('text/markdown', 'text/plain')),
  constraint session_feedback_documents_file_size_check check (file_size > 0),
  unique (session_id, version)
);
