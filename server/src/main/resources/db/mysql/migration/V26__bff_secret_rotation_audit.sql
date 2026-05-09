create table bff_secret_rotation_audit (
  id bigint unsigned not null auto_increment primary key,
  secret_alias varchar(64) not null,
  used_at datetime(6) not null,
  client_ip_hash char(64),
  request_path varchar(255),
  index bff_secret_rotation_audit_alias_used_at_idx (secret_alias, used_at)
);
