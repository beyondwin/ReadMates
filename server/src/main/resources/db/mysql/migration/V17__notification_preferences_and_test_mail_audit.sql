create table notification_preferences (
  membership_id char(36) not null,
  club_id char(36) not null,
  email_enabled boolean not null default true,
  next_book_published_enabled boolean not null default true,
  session_reminder_due_enabled boolean not null default true,
  feedback_document_published_enabled boolean not null default true,
  review_published_enabled boolean not null default false,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (membership_id, club_id),
  constraint notification_preferences_membership_fk
    foreign key (membership_id, club_id) references memberships(id, club_id)
);

create table notification_test_mail_audit (
  id char(36) not null,
  club_id char(36) not null,
  host_membership_id char(36) not null,
  recipient_masked_email varchar(320) not null,
  recipient_email_hash char(64) not null,
  status varchar(20) not null,
  last_error varchar(500),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  key notification_test_mail_audit_club_created_idx (club_id, created_at),
  key notification_test_mail_audit_host_created_idx (host_membership_id, club_id, created_at),
  key notification_test_mail_audit_recipient_hash_idx (recipient_email_hash, created_at),
  constraint notification_test_mail_audit_club_fk foreign key (club_id) references clubs(id),
  constraint notification_test_mail_audit_host_membership_fk
    foreign key (host_membership_id, club_id) references memberships(id, club_id),
  constraint notification_test_mail_audit_status_check check (status in ('SENT', 'FAILED')),
  constraint notification_test_mail_audit_mask_check check (length(trim(recipient_masked_email)) > 0),
  constraint notification_test_mail_audit_hash_check check (regexp_like(recipient_email_hash, '^[0-9a-f]{64}$', 'c'))
);
