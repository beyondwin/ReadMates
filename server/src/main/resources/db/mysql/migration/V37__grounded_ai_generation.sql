CREATE TABLE ai_generation_commit_receipts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  job_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  revision BIGINT NOT NULL,
  session_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  club_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  committed_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_aigen_commit_receipt_job_revision (job_id, revision),
  KEY idx_aigen_commit_receipt_committed_at (committed_at)
) ENGINE=InnoDB;

ALTER TABLE ai_generation_audit_log
  ADD COLUMN pipeline_version VARCHAR(64) NULL,
  ADD COLUMN input_turn_count INT NULL,
  ADD COLUMN speaker_count INT NULL,
  ADD COLUMN grounding_status VARCHAR(32) NULL,
  ADD COLUMN grounding_warning_count INT NOT NULL DEFAULT 0,
  ADD COLUMN reviewed_section_count INT NOT NULL DEFAULT 0,
  ADD COLUMN user_edited_section_count INT NOT NULL DEFAULT 0;

UPDATE ai_generation_club_defaults
SET default_model = 'gemini-3-flash-preview'
WHERE default_model = 'gemini-3-flash';
