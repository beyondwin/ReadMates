-- FK columns must match the COLLATION of the referenced columns. In production,
-- `clubs.id` is utf8mb4_0900_ai_ci while the schema default collation is
-- utf8mb4_unicode_ci. Without the explicit COLLATE on the new column, MySQL
-- rejects the FK with errno 3780 ("Referencing column and referenced column are
-- incompatible"). Test-container databases happen to agree on the default so
-- the regression is invisible there.
CREATE TABLE ai_generation_club_defaults (
  club_id        CHAR(36)    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL PRIMARY KEY,
  default_model  VARCHAR(64) NOT NULL,
  updated_at     DATETIME(6) NOT NULL,
  updated_by     CHAR(36)    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  CONSTRAINT fk_aigen_default_club FOREIGN KEY (club_id) REFERENCES clubs(id)
);
