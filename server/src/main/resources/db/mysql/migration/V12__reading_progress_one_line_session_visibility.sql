alter table reading_checkins
  drop column note;

alter table one_line_reviews
  drop check one_line_reviews_visibility_check;

alter table one_line_reviews
  add constraint one_line_reviews_visibility_check
  check (visibility in ('PRIVATE', 'PUBLIC', 'SESSION'));
