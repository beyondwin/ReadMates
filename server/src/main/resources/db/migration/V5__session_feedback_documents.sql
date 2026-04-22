create table session_feedback_documents (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  session_id uuid not null,
  version integer not null,
  source_text text not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_feedback_documents_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_feedback_documents_version_check check (version > 0),
  constraint session_feedback_documents_source_text_check check (length(trim(source_text)) > 0),
  constraint session_feedback_documents_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%' and position(chr(92) in file_name) = 0),
  constraint session_feedback_documents_content_type_check check (content_type in ('text/markdown', 'text/plain')),
  constraint session_feedback_documents_file_size_check check (file_size > 0),
  unique (session_id, version)
);
