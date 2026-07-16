ALTER TABLE ai_generation_audit_log
  ADD COLUMN trace_id CHAR(32) NULL,
  ADD COLUMN provider_attempt TINYINT UNSIGNED NULL,
  ADD COLUMN provider_call_mode VARCHAR(32) NULL,
  ADD COLUMN cost_basis VARCHAR(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN cache_write_input_tokens INT NOT NULL DEFAULT 0;
