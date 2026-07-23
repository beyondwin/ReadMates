alter table ai_generation_commit_receipts
  add column draft_revision bigint null after club_id,
  add column base_live_revision bigint null after draft_revision,
  add column request_sha256 char(64) null after base_live_revision,
  add constraint ai_generation_commit_receipts_draft_revision_check
    check (draft_revision is null or draft_revision > 0),
  add constraint ai_generation_commit_receipts_base_live_revision_check
    check (base_live_revision is null or base_live_revision >= 0),
  add constraint ai_generation_commit_receipts_request_sha_check
    check (request_sha256 is null or length(request_sha256) = 64);
