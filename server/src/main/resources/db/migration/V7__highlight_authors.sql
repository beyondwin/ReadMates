alter table highlights
  add column membership_id uuid;

alter table highlights
  add constraint highlights_membership_club_fk
  foreign key (membership_id, club_id) references memberships(id, club_id);
