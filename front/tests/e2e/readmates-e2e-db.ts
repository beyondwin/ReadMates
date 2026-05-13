import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { resolveE2eDatabaseName } from "./readmates-e2e-config";

const clubId = "00000000-0000-0000-0000-000000000001";
const secondClubId = "00000000-0000-0000-0000-000000000002";
const secondClubHostMembershipId = "00000000-0000-0000-0000-000000009902";
const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;

const devGoogleSubjects: Record<string, string> = {
  "host@example.com": "readmates-dev-google-host",
  "member1@example.com": "readmates-dev-google-member-1",
  "member2@example.com": "readmates-dev-google-member-2",
  "member3@example.com": "readmates-dev-google-member-3",
  "member4@example.com": "readmates-dev-google-member-4",
  "member5@example.com": "readmates-dev-google-member-5",
};

type GoogleFixtureOptions = {
  inviteToken?: string;
  displayName?: string;
  profileImageUrl?: string | null;
};

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function runMysql(sql: string) {
  const dbPassword = process.env.READMATES_E2E_DB_PASSWORD ?? process.env.MYSQL_PWD ?? "readmates";

  return execFileSync(
    "mysql",
    [
      "--protocol=TCP",
      "-h",
      process.env.READMATES_E2E_DB_HOST ?? "127.0.0.1",
      "-P",
      process.env.READMATES_E2E_DB_PORT ?? "3306",
      "-u",
      process.env.READMATES_E2E_DB_USER ?? "readmates",
      resolveE2eDatabaseName(),
      "--batch",
      "--raw",
      "--execute",
      sql,
    ],
    {
      env: {
        ...process.env,
        MYSQL_PWD: dbPassword,
      },
      stdio: "pipe",
    },
  ).toString("utf8");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function displayNameForEmail(email: string) {
  return email.split("@")[0] || "E2E Google User";
}

function googleSubjectForEmail(email: string) {
  return devGoogleSubjects[email] ?? `readmates-e2e-google-${sha256Hex(email).slice(0, 24)}`;
}

function sqlEmailList(emails: string[]) {
  return emails.map(normalizeEmail).map(sqlString).join(", ");
}

export function setMembershipStatus(email: string, status: "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE") {
  runMysql(`
update memberships
join users on users.id = memberships.user_id
set memberships.status = ${sqlString(status)},
    memberships.updated_at = utc_timestamp(6)
where lower(users.email) = ${sqlString(normalizeEmail(email))}
  and memberships.club_id = ${sqlString(clubId)};
`);
}

export function setCurrentSessionParticipation(email: string, status: "ACTIVE" | "REMOVED") {
  runMysql(`
update session_participants
join memberships on memberships.id = session_participants.membership_id
join users on users.id = memberships.user_id
join sessions on sessions.id = session_participants.session_id
  and sessions.club_id = session_participants.club_id
set session_participants.participation_status = ${sqlString(status)},
    session_participants.updated_at = utc_timestamp(6)
where lower(users.email) = ${sqlString(normalizeEmail(email))}
  and sessions.club_id = ${sqlString(clubId)}
  and sessions.state = 'OPEN';
`);
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function seedGoogleSubjectCase(emails: string[]) {
  const cases = emails
    .map(normalizeEmail)
    .map((email) => {
      const subject = devGoogleSubjects[email];
      if (!subject) {
        return null;
      }
      return `when ${sqlString(email)} then ${sqlString(subject)}`;
    })
    .filter(Boolean)
    .join("\n      ");

  return cases
    ? `case lower(email)
      ${cases}
      else coalesce(google_subject_id, concat('readmates-e2e-google-', replace(uuid(), '-', '')))
    end`
    : "coalesce(google_subject_id, concat('readmates-e2e-google-', replace(uuid(), '-', '')))";
}

export function resetSeedGoogleLogins(emails: string[]) {
  const emailList = sqlEmailList(emails);

  runMysql(`
update users
set google_subject_id = ${seedGoogleSubjectCase(emails)},
    auth_provider = 'GOOGLE',
    updated_at = utc_timestamp(6)
where lower(email) in (${emailList});
`);
}

export function ensureSecondClubFixture() {
  runMysql(`
update memberships
join users on users.id = memberships.user_id
set memberships.role = 'HOST',
    memberships.status = 'ACTIVE',
    memberships.joined_at = coalesce(memberships.joined_at, utc_timestamp(6)),
    memberships.updated_at = utc_timestamp(6)
where memberships.club_id = ${sqlString(clubId)}
  and lower(users.email) = 'host@example.com';

insert into clubs (id, slug, name, tagline, about, status)
select
  ${sqlString(secondClubId)},
  'sample-book-club',
  '샘플 북클럽',
  '테스트 클럽',
  '테스트 클럽입니다.',
  'ACTIVE'
where not exists (
  select 1 from clubs where slug = 'sample-book-club'
);

insert into memberships (
  id,
  club_id,
  user_id,
  role,
  status,
  joined_at,
  short_name
)
select
  ${sqlString(secondClubHostMembershipId)},
  ${sqlString(secondClubId)},
  users.id,
  'MEMBER',
  'ACTIVE',
  utc_timestamp(6),
  users.short_name
from users
where lower(users.email) = 'host@example.com'
on duplicate key update
  role = 'MEMBER',
  status = 'ACTIVE',
  joined_at = coalesce(joined_at, utc_timestamp(6)),
  short_name = values(short_name),
  updated_at = utc_timestamp(6);
`);
}

export function cleanupSecondClubFixture() {
  runMysql(`
delete memberships
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = ${sqlString(secondClubId)}
  and lower(users.email) = 'host@example.com';
`);
}

export function createSecondClubInviteFixture(email: string, invitedName = "샘플 초대 멤버") {
  const normalizedEmail = normalizeEmail(email);
  const token = `sample-${randomBytes(18).toString("base64url")}`;
  const tokenHash = sha256Hex(token);
  const invitationId = randomUUID();

  runMysql(`
insert into invitations (
  id,
  club_id,
  invited_by_membership_id,
  invited_email,
  invited_name,
  role,
  token_hash,
  status,
  expires_at
)
values (
  ${sqlString(invitationId)},
  ${sqlString(secondClubId)},
  ${sqlString(secondClubHostMembershipId)},
  ${sqlString(normalizedEmail)},
  ${sqlString(invitedName)},
  'MEMBER',
  ${sqlString(tokenHash)},
  'PENDING',
  timestampadd(day, 7, utc_timestamp(6))
);
`);

  return token;
}

export function cleanupSecondClubInvitedMembers(emails: string[]) {
  const emailList = sqlEmailList(emails);

  runMysql(`
delete auth_sessions
from auth_sessions
join users on users.id = auth_sessions.user_id
where lower(users.email) in (${emailList});

delete from invitations
where club_id = ${sqlString(secondClubId)}
  and lower(invited_email) in (${emailList});

delete memberships
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = ${sqlString(secondClubId)}
  and lower(users.email) in (${emailList});

delete from users
where lower(email) in (${emailList})
  and not exists (
    select 1
    from memberships
    where memberships.user_id = users.id
  );
`);
}

function ensureViewerGoogleUserFixture(email: string, options: GoogleFixtureOptions = {}) {
  const normalizedEmail = normalizeEmail(email);
  const userId = randomUUID();
  const membershipId = randomUUID();
  const googleSubjectId = googleSubjectForEmail(normalizedEmail);
  const displayName = options.displayName?.trim() || displayNameForEmail(normalizedEmail);
  const shortName = displayName.slice(0, 50);
  const profileImageUrl = options.profileImageUrl ?? null;

  runMysql(`
insert into users (
  id,
  google_subject_id,
  email,
  name,
  short_name,
  profile_image_url,
  auth_provider
)
select
  ${sqlString(userId)},
  ${sqlString(googleSubjectId)},
  ${sqlString(normalizedEmail)},
  ${sqlString(displayName)},
  ${sqlString(shortName)},
  ${profileImageUrl === null ? "null" : sqlString(profileImageUrl)},
  'GOOGLE'
where not exists (
  select 1 from users where lower(email) = ${sqlString(normalizedEmail)}
);

update users
set google_subject_id = coalesce(google_subject_id, ${sqlString(googleSubjectId)}),
    auth_provider = 'GOOGLE',
    updated_at = utc_timestamp(6)
where lower(email) = ${sqlString(normalizedEmail)};

insert into memberships (
  id,
  club_id,
  user_id,
  role,
  status,
  joined_at,
  short_name
)
select
  ${sqlString(membershipId)},
  ${sqlString(clubId)},
  users.id,
  'MEMBER',
  'VIEWER',
  null,
  ${sqlString(shortName)}
from users
where lower(users.email) = ${sqlString(normalizedEmail)}
  and not exists (
    select 1
    from memberships
    where memberships.club_id = ${sqlString(clubId)}
      and memberships.user_id = users.id
  );
`);
}

function acceptGoogleInviteFixture(email: string, inviteToken: string, options: GoogleFixtureOptions = {}) {
  const normalizedEmail = normalizeEmail(email);
  const tokenHash = sha256Hex(inviteToken);
  const userId = randomUUID();
  const membershipId = randomUUID();
  const participantId = randomUUID();
  const googleSubjectId = googleSubjectForEmail(normalizedEmail);
  const displayName = options.displayName?.trim() || displayNameForEmail(normalizedEmail);
  const shortName = displayName.slice(0, 50);
  const profileImageUrl = options.profileImageUrl ?? null;

  const result = runMysql(`
insert into users (
  id,
  google_subject_id,
  email,
  name,
  short_name,
  profile_image_url,
  auth_provider
)
select
  ${sqlString(userId)},
  ${sqlString(googleSubjectId)},
  ${sqlString(normalizedEmail)},
  coalesce(
    (
      select invitations.invited_name
      from invitations
      where invitations.token_hash = ${sqlString(tokenHash)}
        and lower(invitations.invited_email) = ${sqlString(normalizedEmail)}
      limit 1
    ),
    ${sqlString(displayName)}
  ),
  left(coalesce(
    (
      select invitations.invited_name
      from invitations
      where invitations.token_hash = ${sqlString(tokenHash)}
        and lower(invitations.invited_email) = ${sqlString(normalizedEmail)}
      limit 1
    ),
    ${sqlString(shortName)}
  ), 50),
  ${profileImageUrl === null ? "null" : sqlString(profileImageUrl)},
  'GOOGLE'
where not exists (
  select 1 from users where lower(email) = ${sqlString(normalizedEmail)}
);

update users
set google_subject_id = coalesce(google_subject_id, ${sqlString(googleSubjectId)}),
    auth_provider = 'GOOGLE',
    updated_at = utc_timestamp(6)
where lower(email) = ${sqlString(normalizedEmail)};

insert into memberships (
  id,
  club_id,
  user_id,
  role,
  status,
  joined_at,
  short_name
)
select
  ${sqlString(membershipId)},
  invitations.club_id,
  users.id,
  invitations.role,
  'ACTIVE',
  utc_timestamp(6),
  users.short_name
from invitations
join users on lower(users.email) = lower(invitations.invited_email)
where invitations.token_hash = ${sqlString(tokenHash)}
  and lower(invitations.invited_email) = ${sqlString(normalizedEmail)}
on duplicate key update
  role = values(role),
  status = 'ACTIVE',
  joined_at = coalesce(joined_at, utc_timestamp(6)),
  updated_at = utc_timestamp(6);

update invitations
join users on lower(users.email) = lower(invitations.invited_email)
set invitations.status = 'ACCEPTED',
    invitations.accepted_at = utc_timestamp(6),
    invitations.accepted_user_id = users.id,
    invitations.updated_at = utc_timestamp(6)
where invitations.token_hash = ${sqlString(tokenHash)}
  and lower(invitations.invited_email) = ${sqlString(normalizedEmail)}
  and invitations.status = 'PENDING'
  and invitations.expires_at >= utc_timestamp(6);

insert into session_participants (
  id,
  club_id,
  session_id,
  membership_id,
  rsvp_status,
  attendance_status,
  participation_status
)
select
  ${sqlString(participantId)},
  sessions.club_id,
  sessions.id,
  memberships.id,
  'NO_RESPONSE',
  'UNKNOWN',
  'ACTIVE'
from invitations
join users on lower(users.email) = lower(invitations.invited_email)
join memberships on memberships.user_id = users.id
  and memberships.club_id = invitations.club_id
join sessions on sessions.club_id = invitations.club_id
  and sessions.state = 'OPEN'
where invitations.token_hash = ${sqlString(tokenHash)}
  and lower(invitations.invited_email) = ${sqlString(normalizedEmail)}
  and invitations.apply_to_current_session = true
on duplicate key update
  participation_status = 'ACTIVE',
  updated_at = utc_timestamp(6);

select count(*)
from invitations
where token_hash = ${sqlString(tokenHash)}
  and lower(invited_email) = ${sqlString(normalizedEmail)}
  and status = 'ACCEPTED';
`);

  expect(result.trim().split(/\s+/).at(-1)).toBe("1");
}

export async function loginWithGoogleFixture(page: Page, email: string, options: GoogleFixtureOptions = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (options.inviteToken) {
    acceptGoogleInviteFixture(normalizedEmail, options.inviteToken, options);
  } else {
    ensureViewerGoogleUserFixture(normalizedEmail, options);
  }

  const rawToken = `e2e.${randomBytes(32).toString("base64url")}`;
  const tokenHash = sha256Hex(rawToken);
  const sessionId = randomUUID();

  const result = runMysql(`
insert into auth_sessions (
  id,
  user_id,
  session_token_hash,
  created_at,
  last_seen_at,
  expires_at,
  user_agent,
  ip_hash
)
select
  ${sqlString(sessionId)},
  users.id,
  ${sqlString(tokenHash)},
  utc_timestamp(6),
  utc_timestamp(6),
  timestampadd(day, 14, utc_timestamp(6)),
  'readmates-e2e',
  null
from users
where lower(users.email) = ${sqlString(normalizedEmail)};

select row_count();
`);

  expect(result.trim().split(/\s+/).at(-1)).toBe("1");
  await page.context().addCookies([
    {
      name: "readmates_session",
      value: rawToken,
      url: appOrigin,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
    },
  ]);
}

export function cleanupInvitedMembers(emails: string[]) {
  const emailList = sqlEmailList(emails);

  runMysql(`
delete auth_sessions
from auth_sessions
join users on users.id = auth_sessions.user_id
where lower(users.email) in (${emailList});

delete from invitations
where club_id = ${sqlString(clubId)}
  and lower(invited_email) in (${emailList});

delete session_participants
from session_participants
join memberships on memberships.id = session_participants.membership_id
join users on users.id = memberships.user_id
where session_participants.club_id = ${sqlString(clubId)}
  and lower(users.email) in (${emailList});

delete memberships
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = ${sqlString(clubId)}
  and lower(users.email) in (${emailList});

delete from users
where lower(email) in (${emailList})
  and not exists (
    select 1
    from memberships
    where memberships.user_id = users.id
  );
`);
}

export function cleanupGeneratedSessions(invitedEmails: string[] = []) {
  runMysql(`
delete from feedback_reports
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from session_feedback_documents
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from public_session_publications
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from highlights
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from one_line_reviews
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from long_reviews
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from questions
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from reading_checkins
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from session_participants
where session_id in (
  select id from sessions
  where club_id = ${sqlString(clubId)}
    and number >= 7
);

delete from sessions
where club_id = ${sqlString(clubId)}
  and number >= 7;
`);

  if (invitedEmails.length > 0) {
    cleanupInvitedMembers(invitedEmails);
  }
}

export function cleanupManualNotificationArtifacts() {
  runMysql(`
delete from notification_manual_dispatches
where club_id = ${sqlString(clubId)}
  and session_id in (
    select id from sessions
    where club_id = ${sqlString(clubId)}
      and number >= 7
  );

delete from member_notifications
where club_id = ${sqlString(clubId)}
  and event_id in (
    select id from notification_event_outbox
    where club_id = ${sqlString(clubId)}
      and dedupe_key like 'manual:%'
  );

delete from notification_deliveries
where club_id = ${sqlString(clubId)}
  and event_id in (
    select id from notification_event_outbox
    where club_id = ${sqlString(clubId)}
      and dedupe_key like 'manual:%'
  );

delete from notification_manual_dispatch_previews
where club_id = ${sqlString(clubId)};

delete from notification_event_outbox
where club_id = ${sqlString(clubId)}
  and dedupe_key like 'manual:%';
`);
}

export function countManualNotificationEventsForSession(sessionId: string, eventType: string) {
  const output = runMysql(`
select count(*) as count
from notification_manual_dispatches
where session_id = ${sqlString(sessionId)}
  and event_type = ${sqlString(eventType)};
`);
  const [, count] = output.trim().split(/\s+/);
  return Number(count ?? 0);
}

export function materializeManualReminderInAppNotifications() {
  runMysql(`
insert ignore into notification_deliveries (
  id,
  event_id,
  club_id,
  recipient_membership_id,
  channel,
  status,
  dedupe_key,
  attempt_count,
  next_attempt_at,
  sent_at
)
select
  uuid(),
  notification_event_outbox.id,
  notification_event_outbox.club_id,
  memberships.id,
  'IN_APP',
  'SENT',
  concat(notification_event_outbox.dedupe_key, ':in-app:', memberships.id),
  0,
  utc_timestamp(6),
  utc_timestamp(6)
from notification_event_outbox
join notification_manual_dispatches on notification_manual_dispatches.event_id = notification_event_outbox.id
  and notification_manual_dispatches.club_id = notification_event_outbox.club_id
join sessions on sessions.id = notification_manual_dispatches.session_id
  and sessions.club_id = notification_manual_dispatches.club_id
join memberships on memberships.club_id = notification_event_outbox.club_id
  and memberships.status = 'ACTIVE'
where notification_event_outbox.club_id = ${sqlString(clubId)}
  and notification_event_outbox.event_type = 'SESSION_REMINDER_DUE'
  and notification_event_outbox.dedupe_key like 'manual:%'
  and notification_manual_dispatches.requested_channels in ('IN_APP', 'BOTH')
  and notification_manual_dispatches.audience = 'ALL_ACTIVE_MEMBERS'
  and sessions.number >= 7;

insert ignore into member_notifications (
  id,
  event_id,
  delivery_id,
  club_id,
  recipient_membership_id,
  event_type,
  title,
  body,
  deep_link_path
)
select
  uuid(),
  notification_event_outbox.id,
  notification_deliveries.id,
  notification_event_outbox.club_id,
  notification_deliveries.recipient_membership_id,
  notification_event_outbox.event_type,
  concat('내일 ', sessions.number, '회차 모임이 있습니다'),
  concat('내일 ', sessions.number, '회차 ', sessions.book_title, ' 모임이 있습니다.'),
  '/clubs/reading-sai/app/session/current'
from notification_deliveries
join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
  and notification_event_outbox.club_id = notification_deliveries.club_id
join notification_manual_dispatches on notification_manual_dispatches.event_id = notification_event_outbox.id
  and notification_manual_dispatches.club_id = notification_event_outbox.club_id
join sessions on sessions.id = notification_manual_dispatches.session_id
  and sessions.club_id = notification_manual_dispatches.club_id
where notification_event_outbox.club_id = ${sqlString(clubId)}
  and notification_event_outbox.event_type = 'SESSION_REMINDER_DUE'
  and notification_event_outbox.dedupe_key like 'manual:%'
  and notification_deliveries.channel = 'IN_APP'
  and sessions.number >= 7;
`);
}

export function createOpenSessionFixture({
  number = 7,
  bookTitle = "E2E 현재 세션 책",
}: { number?: number; bookTitle?: string } = {}) {
  const sessionId = randomUUID();

  runMysql(`
insert into sessions (
  id,
  club_id,
  number,
  title,
  book_title,
  book_author,
  book_translator,
  book_link,
  book_image_url,
  session_date,
  start_time,
  end_time,
  location_label,
  meeting_url,
  meeting_passcode,
  question_deadline_at,
  state
)
values (
  ${sqlString(sessionId)},
  ${sqlString(clubId)},
  ${number},
  ${sqlString(`${number}회차 모임 · ${bookTitle}`)},
  ${sqlString(bookTitle)},
  '테스트 저자',
  null,
  null,
  null,
  '2026-05-20',
  '20:00:00',
  '22:00:00',
  '온라인',
  null,
  null,
  timestampadd(day, 14, utc_timestamp(6)),
  'OPEN'
);
`);

  return sessionId;
}

export function createFeedbackDocumentFixture(sessionId: string) {
  runMysql(`
insert into session_feedback_documents (
  id,
  club_id,
  session_id,
  version,
  source_text,
  file_name,
  content_type,
  file_size
)
values (
  ${sqlString(randomUUID())},
  ${sqlString(clubId)},
  ${sqlString(sessionId)},
  1,
  'E2E feedback document',
  'e2e-feedback.md',
  'text/markdown',
  21
);
`);
}

export function createViewerGoogleUserFixture(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const userId = randomUUID();
  const membershipId = randomUUID();
  const googleSubjectId = `readmates-e2e-viewer-${randomUUID()}`;

  runMysql(`
insert into users (
  id,
  google_subject_id,
  email,
  name,
  short_name,
  profile_image_url,
  auth_provider
)
values (
  ${sqlString(userId)},
  ${sqlString(googleSubjectId)},
  ${sqlString(normalizedEmail)},
  'E2E Viewer Google',
  'Viewer',
  null,
  'GOOGLE'
);

insert into memberships (
  id,
  club_id,
  user_id,
  role,
  status,
  joined_at
)
values (
  ${sqlString(membershipId)},
  ${sqlString(clubId)},
  ${sqlString(userId)},
  'MEMBER',
  'VIEWER',
  null
);
`);
}

export function cleanupViewerGoogleUserFixtures(emails: string[]) {
  const emailList = sqlEmailList(emails);

  runMysql(`
delete auth_sessions
from auth_sessions
join users on users.id = auth_sessions.user_id
where lower(users.email) in (${emailList});

delete session_participants
from session_participants
join memberships on memberships.id = session_participants.membership_id
join users on users.id = memberships.user_id
where session_participants.club_id = ${sqlString(clubId)}
  and lower(users.email) in (${emailList});

delete memberships
from memberships
join users on users.id = memberships.user_id
where memberships.club_id = ${sqlString(clubId)}
  and lower(users.email) in (${emailList});

delete from users
where lower(email) in (${emailList})
  and not exists (
    select 1
    from memberships
    where memberships.user_id = users.id
  );
`);
}
