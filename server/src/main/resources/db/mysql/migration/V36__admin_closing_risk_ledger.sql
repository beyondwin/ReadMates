CREATE TABLE admin_closing_risk_ledger (
  id CHAR(36) NOT NULL,
  club_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  current_state VARCHAR(32) NOT NULL,
  primary_blocker VARCHAR(64) NULL,
  first_detected_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  resolved_at DATETIME(6) NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  last_host_closing_href VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY admin_closing_risk_ledger_club_session_uk (club_id, session_id),
  KEY admin_closing_risk_ledger_state_seen_idx (current_state, last_seen_at),
  KEY admin_closing_risk_ledger_club_state_seen_idx (club_id, current_state, last_seen_at),
  CONSTRAINT admin_closing_risk_ledger_state_check
    CHECK (current_state IN ('BLOCKED', 'IN_PROGRESS', 'READY', 'RESOLVED')),
  CONSTRAINT admin_closing_risk_ledger_club_fk
    FOREIGN KEY (club_id) REFERENCES clubs(id),
  CONSTRAINT admin_closing_risk_ledger_session_club_fk
    FOREIGN KEY (session_id, club_id) REFERENCES sessions(id, club_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
