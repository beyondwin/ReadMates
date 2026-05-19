CREATE TABLE ai_generation_admin_action_audit (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id           CHAR(36)     NOT NULL,
  club_id          CHAR(36)     NOT NULL,
  session_id       CHAR(36)     NOT NULL,
  admin_user_id    CHAR(36)     NOT NULL,
  admin_role       VARCHAR(32)  NOT NULL,
  action           VARCHAR(32)  NOT NULL,
  previous_status  VARCHAR(32)  NULL,
  next_status      VARCHAR(32)  NULL,
  result           VARCHAR(32)  NOT NULL,
  safe_error_code  VARCHAR(64)  NULL,
  created_at       DATETIME(6)  NOT NULL,
  INDEX idx_aigen_admin_action_job_created (job_id, created_at),
  INDEX idx_aigen_admin_action_admin_created (admin_user_id, created_at)
);

CREATE INDEX idx_aigen_audit_job_created
  ON ai_generation_audit_log (job_id, created_at);

CREATE INDEX idx_aigen_audit_status_created
  ON ai_generation_audit_log (status, created_at);

CREATE INDEX idx_aigen_audit_error_created
  ON ai_generation_audit_log (error_code, created_at);

CREATE INDEX idx_aigen_audit_model_created
  ON ai_generation_audit_log (provider, model, created_at);
