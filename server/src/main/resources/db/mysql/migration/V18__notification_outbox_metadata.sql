alter table notification_outbox
  add column metadata json null after deep_link_path;
