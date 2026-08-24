create table public_projection_generations (
  publication_id char(36) not null,
  club_id char(36) not null,
  session_id char(36) not null,
  generation bigint not null,
  live_record_revision bigint,
  origin_readable boolean not null,
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (publication_id),
  unique key public_projection_generations_session_unique (session_id),
  key public_projection_generations_club_idx (club_id, generation, publication_id),
  constraint public_projection_generations_publication_fk
    foreign key (publication_id) references public_session_publications(id) on delete cascade,
  constraint public_projection_generations_generation_check check (generation > 0),
  constraint public_projection_generations_live_revision_check check (
    live_record_revision is null or live_record_revision > 0
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

insert into public_projection_generations (
  publication_id,
  club_id,
  session_id,
  generation,
  live_record_revision,
  origin_readable
)
select
  publication.id,
  publication.club_id,
  publication.session_id,
  1,
  (
    select max(revision.version)
    from session_record_revisions revision
    where revision.club_id = publication.club_id
      and revision.session_id = publication.session_id
  ),
  (
    sessions.state = 'PUBLISHED'
    and sessions.access_scope = 'GUEST_READABLE'
    and publication.site_visibility = 'PUBLIC_RECORD'
  )
from public_session_publications publication
join sessions on sessions.id = publication.session_id
  and sessions.club_id = publication.club_id;

create table public_mutation_convergence_receipts (
  mutation_receipt_id char(36) not null,
  convergence_id char(36) not null,
  publication_id_snapshot char(36) not null,
  session_id_snapshot char(36) not null,
  committed_generation bigint not null,
  origin_readable boolean not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (mutation_receipt_id),
  unique key public_mutation_convergence_receipts_convergence_unique (convergence_id),
  key public_mutation_convergence_receipts_publication_idx (
    publication_id_snapshot,
    created_at desc,
    convergence_id
  ),
  constraint public_mutation_convergence_receipts_generation_check check (committed_generation > 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table public_convergence_work (
  convergence_id char(36) not null,
  next_attempt_no int not null,
  lease_owner varchar(128) character set ascii collate ascii_bin,
  lease_expires_at datetime(6),
  available_at datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (convergence_id),
  key public_convergence_work_available_idx (available_at, lease_expires_at, convergence_id),
  key public_convergence_work_retention_idx (created_at, convergence_id, lease_expires_at),
  constraint public_convergence_work_receipt_fk
    foreign key (convergence_id) references public_mutation_convergence_receipts(convergence_id),
  constraint public_convergence_work_attempt_check check (next_attempt_no > 0),
  constraint public_convergence_work_lease_check check (
    (lease_owner is null and lease_expires_at is null)
    or (length(trim(lease_owner)) > 0 and lease_expires_at is not null)
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table public_convergence_events (
  convergence_id char(36) not null,
  publication_id_snapshot char(36) not null,
  session_id_snapshot char(36) not null,
  attempt_no int not null,
  event_seq int not null,
  status varchar(16) character set ascii collate ascii_bin not null,
  observed_at datetime(6) not null,
  result_category varchar(64) character set ascii collate ascii_bin,
  primary key (convergence_id, attempt_no, event_seq),
  key public_convergence_events_publication_idx (
    publication_id_snapshot,
    observed_at desc,
    convergence_id,
    attempt_no,
    event_seq
  ),
  constraint public_convergence_events_attempt_check check (attempt_no > 0),
  constraint public_convergence_events_status_check check (
    (event_seq = 0 and binary status = binary 'PENDING' and result_category is null)
    or (
      event_seq = 1
      and binary status in (binary 'SUCCEEDED', binary 'FAILED')
      and result_category is not null
      and length(trim(result_category)) > 0
    )
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create view public_convergence_current as
select
  convergence_id,
  publication_id_snapshot,
  session_id_snapshot,
  attempt_no,
  event_seq,
  status,
  observed_at,
  result_category
from (
  select
    event.*,
    row_number() over (
      partition by event.convergence_id
      order by event.attempt_no desc, event.event_seq desc, event.observed_at desc, event.status desc
    ) as current_rank
  from public_convergence_events event
) ranked
where current_rank = 1;
