insert into clubs (
  id, slug, name, tagline, about, status, public_visibility
) values (
  '10000000-0000-0000-0000-000000000001',
  'upgrade-fixture',
  'Upgrade Fixture Club',
  'Public-safe migration fixture',
  'Synthetic data for the Flyway upgrade integration test.',
  'ACTIVE',
  'PRIVATE'
);

insert into users (
  id, google_subject_id, email, name, short_name, auth_provider
) values (
  '10000000-0000-0000-0000-000000000001',
  'upgrade-fixture-google-subject',
  'upgrade-host@example.test',
  'Upgrade Host',
  'Upgrade Host',
  'GOOGLE'
);

insert into memberships (
  id, club_id, user_id, role, status, short_name, joined_at
) values (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'HOST',
  'ACTIVE',
  'Upgrade Host',
  '2026-07-24 09:00:00.000000'
);

insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state, visibility,
  created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  1,
  'Upgrade Fixture Session',
  'Upgrade Fixture Book',
  'Example Author',
  '2026-07-24',
  '19:00:00',
  '21:00:00',
  'Example Room',
  '2026-07-23 12:00:00.000000',
  'CLOSED',
  'MEMBER',
  '2026-07-24 09:00:00.000000',
  '2026-07-24 10:00:00.000000'
);

insert into session_record_revisions (
  id, session_id, club_id, version, source, restored_from_revision_id,
  snapshot_json, snapshot_sha256, applied_by_membership_id, applied_at
) values (
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  1,
  'BASELINE',
  null,
  '{"visibility":"MEMBER","publicationSummary":"Preserved baseline","highlights":[],"oneLineReviews":[],"feedbackDocument":{"fileName":"feedback.md","title":"Feedback","markdown":""}}',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '10000000-0000-0000-0000-000000000002',
  '2026-07-24 10:00:00.000000'
);

insert into session_record_drafts (
  session_id, club_id, base_live_revision, base_session_updated_at, draft_revision,
  source, restored_from_revision_id, snapshot_json, snapshot_sha256,
  updated_by_membership_id, created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  1,
  '2026-07-24 10:00:00.000000',
  2,
  'MANUAL',
  null,
  '{"visibility":"MEMBER","publicationSummary":"Preserved draft","highlights":[],"oneLineReviews":[],"feedbackDocument":{"fileName":"feedback.md","title":"Feedback","markdown":""}}',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '10000000-0000-0000-0000-000000000002',
  '2026-07-24 10:00:00.000000',
  '2026-07-24 10:00:00.000000'
);
