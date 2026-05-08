alter table users
  change column password_hash legacy_password_hash varchar(255) null,
  change column password_set_at legacy_password_set_at datetime(6) null;
