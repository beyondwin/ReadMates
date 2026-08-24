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

create table public_club_projection_generations (
  club_id char(36) not null,
  generation bigint not null,
  origin_readable boolean not null,
  convergence_id char(36),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (club_id),
  constraint public_club_projection_generation_check check (generation >= 0),
  constraint public_club_projection_readable_check check (origin_readable in (false, true))
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table public_projection_current (
  session_id char(36) not null,
  club_id char(36) not null,
  publication_id_snapshot char(36),
  generation bigint not null,
  club_generation bigint not null,
  live_record_revision bigint,
  origin_readable boolean not null,
  emergency_denied boolean not null default false,
  convergence_id char(36),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (session_id),
  key public_projection_current_club_idx (club_id, club_generation, generation),
  constraint public_projection_current_generation_check check (
    generation >= 0 and club_generation >= 0
    and (live_record_revision is null or live_record_revision >= 0)
  ),
  constraint public_projection_current_readable_check check (origin_readable in (false, true)),
  constraint public_projection_current_emergency_deny_check check (
    emergency_denied = false or origin_readable = false
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table public_mutation_convergence_links (
  mutation_receipt_id char(36) not null,
  convergence_id char(36) not null,
  club_id_snapshot char(36) not null,
  session_id_snapshot char(36),
  publication_id_snapshot char(36),
  committed_generation bigint,
  committed_club_generation bigint not null,
  live_record_revision bigint,
  origin_readable boolean not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (mutation_receipt_id),
  unique key public_mutation_convergence_links_convergence_uk (convergence_id),
  key public_mutation_convergence_links_resource_idx (
    club_id_snapshot, session_id_snapshot, created_at desc
  ),
  constraint public_mutation_convergence_links_generation_check check (
    ((session_id_snapshot is null and committed_generation is null)
      or (session_id_snapshot is not null and committed_generation > 0))
    and committed_club_generation > 0
    and (live_record_revision is null or live_record_revision >= 0)
  ),
  constraint public_mutation_convergence_links_readable_check check (origin_readable in (false, true))
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table auth_public_projection_mutation_receipts (
  id char(36) not null,
  mutation_group_id char(36) not null,
  club_id_snapshot char(36) not null,
  actor_membership_id_snapshot char(36),
  subject_membership_id_snapshot char(36) not null,
  session_id_snapshot char(36),
  operation varchar(64) character set ascii collate ascii_bin not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key auth_public_projection_receipts_group_idx (mutation_group_id, created_at),
  key auth_public_projection_receipts_subject_idx (
    club_id_snapshot, subject_membership_id_snapshot, created_at desc
  ),
  constraint auth_public_projection_receipts_operation_check check (trim(operation) <> '')
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table club_public_projection_mutation_receipts (
  id char(36) not null,
  mutation_group_id char(36) not null,
  club_id_snapshot char(36) not null,
  actor_user_id_snapshot char(36),
  session_id_snapshot char(36),
  operation varchar(64) character set ascii collate ascii_bin not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key club_public_projection_receipts_group_idx (mutation_group_id, created_at),
  constraint club_public_projection_receipts_operation_check check (trim(operation) <> '')
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table public_convergence_work (
  convergence_id char(36) not null,
  club_id_snapshot char(36),
  session_id_snapshot char(36),
  publication_id_snapshot char(36),
  next_attempt_no int not null default 1,
  lease_owner varchar(128) character set ascii collate ascii_bin,
  lease_expires_at datetime(6),
  available_at datetime(6) not null default (utc_timestamp(6)),
  retention_until datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (convergence_id),
  key public_convergence_work_available_idx (available_at, lease_expires_at, convergence_id),
  key public_convergence_work_retention_until_idx (retention_until),
  constraint public_convergence_work_attempt_check check (next_attempt_no > 0),
  constraint public_convergence_work_lease_check check (
    (lease_owner is null and lease_expires_at is null)
    or (length(trim(lease_owner)) > 0 and lease_expires_at is not null)
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table public_convergence_events (
  convergence_id char(36) not null,
  club_id_snapshot char(36),
  publication_id_snapshot char(36),
  session_id_snapshot char(36),
  attempt_no int not null,
  event_seq int not null,
  pending_event_seq int not null default 0,
  status varchar(16) character set ascii collate ascii_bin not null,
  observed_at datetime(6) not null,
  result_category varchar(64) character set ascii collate ascii_bin,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (convergence_id, attempt_no, event_seq),
  key public_convergence_events_publication_idx (
    publication_id_snapshot,
    observed_at desc,
    convergence_id,
    attempt_no,
    event_seq
  ),
  constraint public_convergence_events_attempt_check check (attempt_no > 0),
  constraint public_convergence_events_pending_reference_check check (pending_event_seq = 0),
  constraint public_convergence_events_sequence_check check (
    (event_seq = 0 and binary status = binary 'PENDING' and result_category is null)
    or (
      event_seq = 1
      and binary status in (binary 'SUCCEEDED', binary 'FAILED')
      and result_category is not null
      and length(trim(result_category)) > 0
    )
  ),
  constraint public_convergence_events_pending_fk foreign key (
    convergence_id, attempt_no, pending_event_seq
  ) references public_convergence_events (convergence_id, attempt_no, event_seq)
    on update restrict on delete restrict
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

insert into public_club_projection_generations (club_id, generation, origin_readable)
select clubs.id,
       case when exists (
         select 1 from public_session_publications publications where publications.club_id = clubs.id
       ) then 1 else 0 end,
       (
         binary clubs.status = binary 'ACTIVE'
         and binary clubs.public_visibility = binary 'PUBLIC'
       )
from clubs;

insert into public_projection_current (
  session_id, club_id, publication_id_snapshot, generation, club_generation,
  live_record_revision, origin_readable, convergence_id, updated_at
)
select publications.session_id,
       publications.club_id,
       publications.id,
       1,
       1,
       coalesce((
         select max(revisions.version)
         from session_record_revisions revisions
         where revisions.session_id = publications.session_id
           and revisions.club_id = publications.club_id
       ), 0),
       (
         sessions.deleted_at is null
         and binary clubs.status = binary 'ACTIVE'
         and binary clubs.public_visibility = binary 'PUBLIC'
         and binary sessions.state = binary 'PUBLISHED'
         and binary sessions.access_scope = binary 'GUEST_READABLE'
         and binary publications.site_visibility = binary 'PUBLIC_RECORD'
       ),
       null,
       utc_timestamp(6)
from public_session_publications publications
join sessions on sessions.id = publications.session_id and sessions.club_id = publications.club_id
join clubs on clubs.id = sessions.club_id;
