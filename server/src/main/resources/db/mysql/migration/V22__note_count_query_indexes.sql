create index one_line_reviews_club_session_visibility_member_idx
  on one_line_reviews (club_id, session_id, visibility, membership_id);

create index long_reviews_club_session_visibility_member_idx
  on long_reviews (club_id, session_id, visibility, membership_id);
