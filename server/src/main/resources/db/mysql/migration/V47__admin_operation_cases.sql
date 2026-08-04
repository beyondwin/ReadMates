create table admin_operation_cases (
  id char(36) not null,
  source_type varchar(40) not null,
  source_key varchar(255) not null,
  club_id char(36),
  state varchar(30) not null,
  severity varchar(30) not null,
  safe_summary_code varchar(120) not null,
  first_observed_at datetime(6) not null,
  last_observed_at datetime(6) not null,
  acknowledged_at datetime(6),
  snoozed_until datetime(6),
  assignee_admin_id char(36),
  resolved_at datetime(6),
  reopen_count int not null default 0,
  version bigint not null default 0,
  impact_count int not null default 0,
  detail_href varchar(1000) not null,
  resolution_code varchar(120),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key admin_operation_cases_source_identity_uk (source_type, source_key),
  key admin_operation_cases_state_severity_first_idx (state, severity, first_observed_at, id),
  key admin_operation_cases_assignee_state_first_idx (assignee_admin_id, state, first_observed_at),
  constraint admin_operation_cases_club_fk
    foreign key (club_id) references clubs(id) on delete set null,
  constraint admin_operation_cases_assignee_fk
    foreign key (assignee_admin_id) references users(id) on delete set null,
  constraint admin_operation_cases_source_type_check check (
    source_type in ('CLUB_READINESS','NOTIFICATION','AI_JOB','CLOSING_RISK')
  ),
  constraint admin_operation_cases_state_check check (
    state in ('OPEN','ACKNOWLEDGED','SNOOZED','RESOLVED')
  ),
  constraint admin_operation_cases_severity_check check (
    severity in ('CRITICAL','WARNING','READY','INFO')
  ),
  constraint admin_operation_cases_impact_count_check check (impact_count >= 0),
  constraint admin_operation_cases_reopen_count_check check (reopen_count >= 0),
  constraint admin_operation_cases_version_check check (version >= 0),
  constraint admin_operation_cases_source_key_check check (length(trim(source_key)) > 0),
  constraint admin_operation_cases_summary_code_check check (length(trim(safe_summary_code)) > 0),
  constraint admin_operation_cases_detail_href_check check (length(trim(detail_href)) > 0),
  constraint admin_operation_cases_snooze_check check (state <> 'SNOOZED' or snoozed_until is not null),
  constraint admin_operation_cases_resolved_check check (state <> 'RESOLVED' or resolved_at is not null)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table admin_operation_case_events (
  id char(36) not null,
  case_id char(36) not null,
  from_state varchar(30),
  to_state varchar(30) not null,
  action varchar(30),
  actor_admin_id char(36),
  reason_code varchar(120) not null,
  occurred_at datetime(6) not null,
  case_version bigint not null,
  primary key (id),
  key admin_operation_case_events_case_occurred_idx (case_id, occurred_at, id),
  constraint admin_operation_case_events_case_fk
    foreign key (case_id) references admin_operation_cases(id) on delete restrict,
  constraint admin_operation_case_events_actor_fk
    foreign key (actor_admin_id) references users(id) on delete set null,
  constraint admin_operation_case_events_from_state_check check (
    from_state is null or from_state in ('OPEN','ACKNOWLEDGED','SNOOZED','RESOLVED')
  ),
  constraint admin_operation_case_events_to_state_check check (
    to_state in ('OPEN','ACKNOWLEDGED','SNOOZED','RESOLVED')
  ),
  constraint admin_operation_case_events_action_check check (
    action is null or action in ('ACKNOWLEDGE','SNOOZE','RESOLVE')
  ),
  constraint admin_operation_case_events_reason_check check (
    reason_code in (
      'OPERATOR_ACKNOWLEDGED',
      'OPERATOR_SNOOZED',
      'OPERATOR_RESOLVED',
      'SIGNAL_OPENED',
      'SIGNAL_REOPENED',
      'SIGNAL_CLEARED'
    )
  ),
  constraint admin_operation_case_events_version_check check (case_version >= 0)
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;

create table admin_operation_source_status (
  source_type varchar(40) not null,
  status varchar(30) not null,
  attempted_at datetime(6) not null,
  last_successful_at datetime(6),
  authoritative boolean not null,
  primary key (source_type),
  constraint admin_operation_source_status_source_type_check check (
    source_type in ('CLUB_READINESS','NOTIFICATION','AI_JOB','CLOSING_RISK')
  ),
  constraint admin_operation_source_status_status_check check (
    status in ('AVAILABLE','PARTIAL','UNAVAILABLE','DISABLED')
  )
) default character set utf8mb4 collate utf8mb4_0900_ai_ci;
