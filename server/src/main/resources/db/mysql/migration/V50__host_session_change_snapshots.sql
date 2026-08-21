alter table host_session_change_audit
  add column before_snapshot_json longtext,
  add column after_snapshot_json longtext,
  add column restored_from_change_id char(36),
  add constraint host_session_change_audit_before_json_check
    check (before_snapshot_json is null or json_valid(before_snapshot_json)),
  add constraint host_session_change_audit_after_json_check
    check (after_snapshot_json is null or json_valid(after_snapshot_json));
