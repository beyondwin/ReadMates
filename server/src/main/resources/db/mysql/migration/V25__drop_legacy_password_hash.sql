alter table users
  drop column legacy_password_hash,
  drop column legacy_password_set_at;
