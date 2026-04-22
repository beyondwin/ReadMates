alter table questions
  drop constraint if exists questions_priority_check;

alter table questions
  add constraint questions_priority_check check (priority between 1 and 5);
