import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const PRIMARY_CLUB_ID = "00000000-0000-0000-0000-000000000001";
const LIFECYCLE_CLUB_ID = "00000000-0000-0000-0000-000000000002";
const LIFECYCLE_CLUB_SLUG = "sample-book-club";
const HOST_MEMBERSHIP_ID = "90000000-0000-4000-8000-000000000902";
const MEMBER_MEMBERSHIP_ID = "90000000-0000-4000-8000-000000000906";
const LIFECYCLE_SESSION_ID = "90000000-0000-4000-8000-000000000901";
const LIFECYCLE_PARTICIPANT_ID = "90000000-0000-4000-8000-000000000911";
const CONTROL_SESSION_ID = "90000000-0000-4000-8000-000000000902";
const CONTROL_PARTICIPANT_ID = "90000000-0000-4000-8000-000000000912";
const LIFECYCLE_BOOK_TITLE = "일정 확인 생애주기 책";
const ORIGINAL_DATE = "2026-09-20";
const UPDATED_DATE = "2026-09-21";

type ScheduleSeenState = "CURRENT" | "STALE" | "UNSEEN";

type HostSessionDetail = {
  scheduleRevision: number;
  scheduleSeenAvailability: "AVAILABLE" | "UNAVAILABLE";
  scheduleSeenSummary: {
    currentCount: number | null;
    staleCount: number | null;
    unseenCount: number | null;
    eligibleCount: number | null;
  };
  attendees: Array<{
    membershipId: string;
    rsvpStatus: string;
    attendanceStatus: string;
    seenScheduleRevision: number | null;
    scheduleSeenState: ScheduleSeenState;
  }>;
};

type BffResult = {
  status: number;
  body: unknown;
};

type ParticipantFact = {
  rsvpStatus: string;
  attendanceStatus: string;
  seenScheduleRevision: number | null;
  seenScheduleAt: string | null;
};

let lifecycleEpochsBefore = "";
const trackedAuthSessionIds: string[] = [];

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function lastDataRow(output: string) {
  return output.trim().split("\n").at(-1) ?? "";
}

function participantFact(sessionId: string, membershipId: string): ParticipantFact {
  const output = runMysql(`
select concat_ws('|',
  rsvp_status,
  attendance_status,
  coalesce(cast(seen_schedule_revision as char), 'NULL'),
  coalesce(date_format(seen_schedule_at, '%Y-%m-%dT%H:%i:%s.%f'), 'NULL')
) as participant_fact
from session_participants
where session_id = ${sqlString(sessionId)}
  and membership_id = ${sqlString(membershipId)};
`);
  const [rsvpStatus, attendanceStatus, rawRevision, rawSeenAt] = lastDataRow(output).split("|");
  return {
    rsvpStatus,
    attendanceStatus,
    seenScheduleRevision: rawRevision === "NULL" ? null : Number(rawRevision),
    seenScheduleAt: rawSeenAt === "NULL" ? null : rawSeenAt,
  };
}

function lastClubAccessAt() {
  const output = runMysql(`
select coalesce(date_format(last_access_at, '%Y-%m-%dT%H:%i:%s.%f'), 'NULL') as last_access_at
from membership_club_access
where membership_id = ${sqlString(MEMBER_MEMBERSHIP_ID)}
  and club_id = ${sqlString(LIFECYCLE_CLUB_ID)};
`);
  const value = lastDataRow(output);
  return value === "NULL" || value === "last_access_at" ? null : value;
}

function sqlStringList(values: string[]) {
  return values.map(sqlString).join(", ");
}

function cleanupTrackedAuthSessions(sessionIds: string[]) {
  if (sessionIds.length === 0) return;
  runMysql(`
delete from auth_sessions
where id in (${sqlStringList(sessionIds)});
`);
}

function lifecycleFixtureCounts(sessionIds: string[]) {
  const authFilter = sessionIds.length === 0
    ? "0"
    : `(select count(*) from auth_sessions where id in (${sqlStringList(sessionIds)}))`;
  const output = runMysql(`
select concat_ws('|',
  (select count(*) from sessions where id in (${sqlString(LIFECYCLE_SESSION_ID)}, ${sqlString(CONTROL_SESSION_ID)})),
  (select count(*) from session_participants where id in (${sqlString(LIFECYCLE_PARTICIPANT_ID)}, ${sqlString(CONTROL_PARTICIPANT_ID)})),
  (select count(*) from memberships where id in (${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(MEMBER_MEMBERSHIP_ID)})),
  (select count(*) from membership_club_access where membership_id in (${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(MEMBER_MEMBERSHIP_ID)})),
  (select count(*) from host_session_change_audit where session_id = ${sqlString(LIFECYCLE_SESSION_ID)}),
  (select count(*) from host_session_lifecycle_audit where session_id = ${sqlString(LIFECYCLE_SESSION_ID)}),
  (select count(*) from session_participant_change_audit where session_id = ${sqlString(LIFECYCLE_SESSION_ID)}),
  (select count(*) from host_session_mutation_receipts where resource_id = ${sqlString(LIFECYCLE_SESSION_ID)}),
  (select count(*) from mutation_idempotency_keys where club_id = ${sqlString(LIFECYCLE_CLUB_ID)} and actor_membership_id in (${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(MEMBER_MEMBERSHIP_ID)})),
  ${authFilter}
) as fixture_counts;
`);
  return lastDataRow(output).split("|").map(Number);
}

function cleanupLifecycleFixture() {
  runMysql(`
delete from mutation_idempotency_keys
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)}
  and actor_membership_id in (${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(MEMBER_MEMBERSHIP_ID)});

delete from host_session_mutation_receipts
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)}
  and resource_id = ${sqlString(LIFECYCLE_SESSION_ID)};

delete from host_session_change_audit
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)}
  and session_id = ${sqlString(LIFECYCLE_SESSION_ID)};

delete from host_session_lifecycle_audit
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)}
  and session_id = ${sqlString(LIFECYCLE_SESSION_ID)};

delete from session_participant_change_audit
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)}
  and session_id = ${sqlString(LIFECYCLE_SESSION_ID)};

delete from session_participants
where session_id in (${sqlString(LIFECYCLE_SESSION_ID)}, ${sqlString(CONTROL_SESSION_ID)});

delete from sessions
where id in (${sqlString(LIFECYCLE_SESSION_ID)}, ${sqlString(CONTROL_SESSION_ID)});

delete from membership_club_access
where membership_id in (${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(MEMBER_MEMBERSHIP_ID)})
  and club_id = ${sqlString(LIFECYCLE_CLUB_ID)};

delete from memberships
where id in (${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(MEMBER_MEMBERSHIP_ID)});
`);

  if (lifecycleEpochsBefore) {
    const [meetingEpoch, recordEpoch] = lifecycleEpochsBefore.split("|");
    runMysql(`
update club_host_list_epochs
set meeting_epoch = ${Number(meetingEpoch)},
    record_epoch = ${Number(recordEpoch)}
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)};
`);
  }
}

function setupLifecycleFixture() {
  cleanupLifecycleFixture();
  resetSeedGoogleLogins(["host@example.com", "member5@example.com"]);
  lifecycleEpochsBefore = lastDataRow(runMysql(`
select concat(meeting_epoch, '|', record_epoch) as epochs
from club_host_list_epochs
where club_id = ${sqlString(LIFECYCLE_CLUB_ID)};
`));

  runMysql(`
insert into memberships (
  id, club_id, user_id, role, status, joined_at, short_name, avatar_key
)
select
  ${sqlString(HOST_MEMBERSHIP_ID)},
  ${sqlString(LIFECYCLE_CLUB_ID)},
  users.id,
  'HOST',
  'ACTIVE',
  utc_timestamp(6),
  users.short_name,
  'mushroom-green-book'
from users
where lower(users.email) = 'host@example.com';

insert into memberships (
  id, club_id, user_id, role, status, joined_at, short_name, avatar_key
)
select
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  ${sqlString(LIFECYCLE_CLUB_ID)},
  users.id,
  'MEMBER',
  'ACTIVE',
  utc_timestamp(6),
  users.short_name,
  'apple-green-book'
from users
where lower(users.email) = 'member5@example.com';

insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state,
  visibility, access_scope, schedule_revision
)
values (
  ${sqlString(LIFECYCLE_SESSION_ID)},
  ${sqlString(LIFECYCLE_CLUB_ID)},
  901,
  '901회차 모임 · 일정 확인 생애주기',
  ${sqlString(LIFECYCLE_BOOK_TITLE)},
  '합성 테스트 저자',
  ${sqlString(ORIGINAL_DATE)},
  '19:30:00',
  '21:30:00',
  '온라인',
  '2026-09-19 14:59:00',
  'DRAFT',
  'HOST_ONLY',
  'HOST_ONLY',
  1
);

insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status,
  participation_status
)
values (
  ${sqlString(LIFECYCLE_PARTICIPANT_ID)},
  ${sqlString(LIFECYCLE_CLUB_ID)},
  ${sqlString(LIFECYCLE_SESSION_ID)},
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  'MAYBE',
  'ABSENT',
  'ACTIVE'
);

insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state,
  visibility, access_scope, schedule_revision
)
values (
  ${sqlString(CONTROL_SESSION_ID)},
  ${sqlString(PRIMARY_CLUB_ID)},
  902,
  '902회차 모임 · 클럽 격리 대조군',
  '클럽 격리 대조군 책',
  '합성 테스트 저자',
  '2026-09-22',
  '19:30:00',
  '21:30:00',
  '온라인',
  '2026-09-21 14:59:00',
  'OPEN',
  'MEMBER',
  'GUEST_READABLE',
  7
);

insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status,
  participation_status, seen_schedule_revision, seen_schedule_at
)
values (
  ${sqlString(CONTROL_PARTICIPANT_ID)},
  ${sqlString(PRIMARY_CLUB_ID)},
  ${sqlString(CONTROL_SESSION_ID)},
  '00000000-0000-0000-0000-000000000206',
  'DECLINED',
  'ABSENT',
  'ACTIVE',
  3,
  '2026-08-29 01:02:03.123456'
);
`);
}

async function bff(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown; hostWrite?: boolean } = {},
): Promise<BffResult> {
  return page.evaluate(async ({ target, method, requestBody, hostWrite }) => {
    const headers = new Headers();
    if (requestBody !== undefined) headers.set("Content-Type", "application/json");
    if (hostWrite) headers.set("X-Readmates-Client-Contract", "v3");
    const response = await fetch(target, {
      method,
      headers,
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      cache: "no-store",
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }, {
    target: path,
    method: options.method ?? "GET",
    requestBody: options.body,
    hostWrite: options.hostWrite ?? false,
  });
}

async function hostDetail(page: Page): Promise<HostSessionDetail> {
  const result = await bff(
    page,
    `/api/bff/api/host/sessions/${LIFECYCLE_SESSION_ID}?clubSlug=${LIFECYCLE_CLUB_SLUG}`,
  );
  expect(result.status).toBe(200);
  return result.body as HostSessionDetail;
}

function lifecycleMember(detail: HostSessionDetail) {
  const member = detail.attendees.find((attendee) => attendee.membershipId === MEMBER_MEMBERSHIP_ID);
  expect(member).toBeTruthy();
  return member!;
}

async function openLifecycleSession(hostPage: Page) {
  await hostPage.goto(`/clubs/${LIFECYCLE_CLUB_SLUG}/app/host/sessions/${LIFECYCLE_SESSION_ID}`);
  const open = hostPage.getByRole("button", { name: "멤버와 준비 시작" });
  await expect(open).toBeVisible();
  await open.click();
  const dialog = hostPage.getByRole("dialog", { name: "멤버에게 열기" });
  const response = hostPage.waitForResponse((entry) => (
    entry.request().method() === "POST"
      && entry.url().includes(`/api/bff/api/host/sessions/${LIFECYCLE_SESSION_ID}/open`)
  ));
  await dialog.getByRole("button", { name: "멤버에게 열기" }).click();
  expect((await response).status()).toBe(200);
}

async function editMemberVisibleSchedule(hostPage: Page) {
  const trigger = hostPage.getByRole("button", { name: "모임 정보" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const sheet = hostPage.getByRole("dialog", { name: "모임 정보" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("모임 날짜").fill(UPDATED_DATE);
  const response = hostPage.waitForResponse((entry) => (
    entry.request().method() === "PATCH"
      && entry.url().includes(`/api/bff/api/host/sessions/${LIFECYCLE_SESSION_ID}`)
  ));
  await sheet.getByRole("button", { name: "기본 정보 저장" }).click();
  expect((await response).status()).toBe(200);
}

async function newAuthenticatedPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { sessionId } = await loginWithGoogleFixture(page, email);
  trackedAuthSessionIds.push(sessionId);
  return { context, page };
}

test.beforeEach(() => {
  trackedAuthSessionIds.length = 0;
  setupLifecycleFixture();
});

test.afterEach(() => {
  const createdAuthSessionIds = [...trackedAuthSessionIds];
  cleanupLifecycleFixture();
  cleanupTrackedAuthSessions(createdAuthSessionIds);
  resetSeedGoogleLogins(["host@example.com", "member5@example.com"]);
  expect(lifecycleFixtureCounts(createdAuthSessionIds)).toEqual([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  trackedAuthSessionIds.length = 0;
});

test("schedule seen follows rendered revisions without crossing club, response, attendance, or access facts", async ({ browser }) => {
  const host = await newAuthenticatedPage(browser, "host@example.com");
  const member = await newAuthenticatedPage(browser, "member5@example.com");
  const controlBefore = participantFact(
    CONTROL_SESSION_ID,
    "00000000-0000-0000-0000-000000000206",
  );
  const lifecycleBefore = participantFact(LIFECYCLE_SESSION_ID, MEMBER_MEMBERSHIP_ID);

  try {
    await member.page.goto(`/clubs/${LIFECYCLE_CLUB_SLUG}`);
    await host.page.goto(`/clubs/${LIFECYCLE_CLUB_SLUG}`);

    const draftDetail = await hostDetail(host.page);
    expect(draftDetail.scheduleSeenAvailability).toBe("UNAVAILABLE");
    expect(draftDetail.scheduleSeenSummary).toEqual({
      currentCount: null,
      staleCount: null,
      unseenCount: null,
      eligibleCount: null,
    });

    const draftWrite = await bff(
      member.page,
      `/api/bff/api/sessions/current/schedule-seen?clubSlug=${LIFECYCLE_CLUB_SLUG}`,
      { method: "PUT", body: { scheduleRevision: draftDetail.scheduleRevision } },
    );
    expect(draftWrite.status).toBe(409);
    expect(draftWrite.body).toMatchObject({ code: "CONFLICT" });
    expect(participantFact(LIFECYCLE_SESSION_ID, MEMBER_MEMBERSHIP_ID)).toEqual(lifecycleBefore);

    await openLifecycleSession(host.page);
    const openDetail = await hostDetail(host.page);
    expect(openDetail.scheduleSeenAvailability).toBe("AVAILABLE");
    expect(lifecycleMember(openDetail)).toMatchObject({
      rsvpStatus: lifecycleBefore.rsvpStatus,
      attendanceStatus: lifecycleBefore.attendanceStatus,
      seenScheduleRevision: null,
      scheduleSeenState: "UNSEEN",
    });
    expect(openDetail.scheduleSeenSummary.unseenCount).toBeGreaterThanOrEqual(1);

    runMysql(`
insert into membership_club_access (membership_id, club_id, last_access_at)
values (
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  ${sqlString(LIFECYCLE_CLUB_ID)},
  '2026-08-29 00:00:00.000000'
)
on duplicate key update last_access_at = values(last_access_at);
`);
    const accessBefore = lastClubAccessAt();
    const accessTouch = member.page.waitForResponse((entry) => (
      entry.request().method() === "PUT"
        && entry.url().includes("/api/bff/api/me/club-access")
        && entry.url().includes(`clubSlug=${LIFECYCLE_CLUB_SLUG}`)
    ));
    await member.page.goto(`/clubs/${LIFECYCLE_CLUB_SLUG}/app/notes`);
    expect((await accessTouch).status()).toBe(200);
    const accessAfter = lastClubAccessAt();
    expect(accessBefore).not.toBeNull();
    expect(accessAfter).not.toBeNull();
    expect(accessAfter! > accessBefore!).toBe(true);
    expect(participantFact(LIFECYCLE_SESSION_ID, MEMBER_MEMBERSHIP_ID)).toEqual(lifecycleBefore);
    expect(participantFact(
      CONTROL_SESSION_ID,
      "00000000-0000-0000-0000-000000000206",
    )).toEqual(controlBefore);

    const firstSeen = member.page.waitForResponse((entry) => (
      entry.request().method() === "PUT"
        && entry.url().includes("/api/bff/api/sessions/current/schedule-seen")
        && entry.url().includes(`clubSlug=${LIFECYCLE_CLUB_SLUG}`)
    ));
    await member.page.goto(`/clubs/${LIFECYCLE_CLUB_SLUG}/app/session/current`);
    await expect(member.page.getByRole("heading", { level: 1, name: LIFECYCLE_BOOK_TITLE })).toBeVisible();
    const firstSeenResponse = await firstSeen;
    expect(firstSeenResponse.status()).toBe(200);
    expect(firstSeenResponse.request().postDataJSON()).toEqual({
      scheduleRevision: openDetail.scheduleRevision,
    });

    const currentDetail = await hostDetail(host.page);
    expect(lifecycleMember(currentDetail)).toMatchObject({
      rsvpStatus: lifecycleBefore.rsvpStatus,
      attendanceStatus: lifecycleBefore.attendanceStatus,
      seenScheduleRevision: openDetail.scheduleRevision,
      scheduleSeenState: "CURRENT",
    });

    await editMemberVisibleSchedule(host.page);
    const staleDetail = await hostDetail(host.page);
    expect(staleDetail.scheduleRevision).toBe(openDetail.scheduleRevision + 1);
    expect(lifecycleMember(staleDetail)).toMatchObject({
      rsvpStatus: lifecycleBefore.rsvpStatus,
      attendanceStatus: lifecycleBefore.attendanceStatus,
      seenScheduleRevision: openDetail.scheduleRevision,
      scheduleSeenState: "STALE",
    });

    const secondSeen = member.page.waitForResponse((entry) => (
      entry.request().method() === "PUT"
        && entry.url().includes("/api/bff/api/sessions/current/schedule-seen")
        && entry.url().includes(`clubSlug=${LIFECYCLE_CLUB_SLUG}`)
    ));
    await member.page.reload();
    await expect(member.page.getByRole("heading", { level: 1, name: LIFECYCLE_BOOK_TITLE })).toBeVisible();
    const secondSeenResponse = await secondSeen;
    expect(secondSeenResponse.status()).toBe(200);
    expect(secondSeenResponse.request().postDataJSON()).toEqual({
      scheduleRevision: staleDetail.scheduleRevision,
    });

    const finalDetail = await hostDetail(host.page);
    expect(lifecycleMember(finalDetail)).toMatchObject({
      rsvpStatus: lifecycleBefore.rsvpStatus,
      attendanceStatus: lifecycleBefore.attendanceStatus,
      seenScheduleRevision: staleDetail.scheduleRevision,
      scheduleSeenState: "CURRENT",
    });
    expect(finalDetail.scheduleSeenSummary.staleCount).toBe(0);
    expect(participantFact(
      CONTROL_SESSION_ID,
      "00000000-0000-0000-0000-000000000206",
    )).toEqual(controlBefore);
  } finally {
    await host.context.close();
    await member.context.close();
  }
});
