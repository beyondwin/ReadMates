CREATE TABLE ai_generation_club_defaults (
  club_id        CHAR(36)    NOT NULL PRIMARY KEY,
  default_model  VARCHAR(64) NOT NULL,
  updated_at     DATETIME(6) NOT NULL,
  updated_by     CHAR(36)    NOT NULL,
  CONSTRAINT fk_aigen_default_club FOREIGN KEY (club_id) REFERENCES clubs(id)
);
