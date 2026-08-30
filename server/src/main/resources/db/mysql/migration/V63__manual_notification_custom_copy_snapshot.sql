alter table notification_manual_dispatch_previews
  add column schedule_revision bigint not null default 0 after target_snapshot_hash,
  add column target_snapshot_revision char(64) character set ascii collate ascii_bin not null default '' after schedule_revision,
  add column target_membership_ids_json json null after target_snapshot_revision,
  add column eligibility_fingerprint char(64) null after target_membership_ids_json,
  add column custom_subject varchar(200) null after eligibility_fingerprint,
  add column custom_body text null after custom_subject,
  add column content_hash char(64) null after custom_body,
  add constraint notification_manual_dispatch_previews_schedule_revision_check
    check (schedule_revision >= 0),
  add constraint notification_manual_dispatch_previews_target_revision_check
    check (target_snapshot_revision = '' or regexp_like(target_snapshot_revision, '^[0-9a-f]{64}$', 'c')),
  add constraint notification_manual_dispatch_previews_eligibility_hash_check
    check (eligibility_fingerprint is null or regexp_like(eligibility_fingerprint, '^[0-9a-f]{64}$', 'c')),
  add constraint notification_manual_dispatch_previews_copy_check
    check (
      (custom_subject is null and custom_body is null and content_hash is null)
      or (
        char_length(trim(custom_subject)) between 1 and 200
        and char_length(trim(custom_body)) between 1 and 4000
        and regexp_like(content_hash, '^[0-9a-f]{64}$', 'c')
        and target_membership_ids_json is not null
        and eligibility_fingerprint is not null
      )
    );

alter table notification_manual_dispatches
  add column content_hash char(64) null after content_revision,
  add constraint notification_manual_dispatches_content_hash_check
    check (content_hash is null or regexp_like(content_hash, '^[0-9a-f]{64}$', 'c'));
