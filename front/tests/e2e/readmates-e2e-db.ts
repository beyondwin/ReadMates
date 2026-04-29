import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

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
      process.env.READMATES_E2E_DB_NAME ?? "readmates_e2e",
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
delete auth_sessions
from auth_sessions
join users on users.id = auth_sessions.user_id
where lower(users.email) in (${emailList})
  and auth_sessions.user_agent = 'readmates-e2e';

update users
set google_subject_id = ${seedGoogleSubjectCase(emails)},
    password_hash = null,
    password_set_at = null,
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
  password_hash,
  password_set_at,
  auth_provider
)
select
  ${sqlString(userId)},
  ${sqlString(googleSubjectId)},
  ${sqlString(normalizedEmail)},
  ${sqlString(displayName)},
  ${sqlString(shortName)},
  ${profileImageUrl === null ? "null" : sqlString(profileImageUrl)},
  null,
  null,
  'GOOGLE'
where not exists (
  select 1 from users where lower(email) = ${sqlString(normalizedEmail)}
);

update users
set google_subject_id = coalesce(google_subject_id, ${sqlString(googleSubjectId)}),
    password_hash = null,
    password_set_at = null,
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
  password_hash,
  password_set_at,
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
  null,
  null,
  'GOOGLE'
where not exists (
  select 1 from users where lower(email) = ${sqlString(normalizedEmail)}
);

update users
set google_subject_id = coalesce(google_subject_id, ${sqlString(googleSubjectId)}),
    password_hash = null,
    password_set_at = null,
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

export function createOpenSessionFixture() {
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
  7,
  '7회차 모임 · E2E 현재 세션',
  'E2E 현재 세션 책',
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
  password_hash,
  password_set_at,
  auth_provider
)
values (
  ${sqlString(userId)},
  ${sqlString(googleSubjectId)},
  ${sqlString(normalizedEmail)},
  'E2E Viewer Google',
  'Viewer',
  null,
  null,
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
