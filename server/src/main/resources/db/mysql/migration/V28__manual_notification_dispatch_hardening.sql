alter table notification_manual_dispatch_previews
  add column consumed_at datetime(6),
  add column consumed_event_id char(36);

alter table notification_manual_dispatch_previews
  add key notification_manual_dispatch_previews_consumed_event_idx (consumed_event_id, club_id),
  add constraint notification_manual_dispatch_previews_consumed_event_fk
    foreign key (consumed_event_id, club_id) references notification_event_outbox(id, club_id),
  add constraint notification_manual_dispatch_previews_consumed_check
    check (
      (consumed_at is null and consumed_event_id is null)
      or (consumed_at is not null and consumed_event_id is not null)
    );

alter table notification_manual_dispatches
  add column preview_id char(36) after event_id,
  add unique key notification_manual_dispatches_preview_uk (preview_id),
  add constraint notification_manual_dispatches_preview_fk
    foreign key (preview_id) references notification_manual_dispatch_previews(id);
