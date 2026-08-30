import { expect, test, type Page } from "@playwright/test";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_ID = "97000000-0000-4000-8000-000000000001";
const CLUB_SLUG = "lifecycle-operating-room-e2e";
const HOST_MEMBERSHIP_ID = "97000000-0000-4000-8000-000000000002";
const MEMBER_MEMBERSHIP_ID = "97000000-0000-4000-8000-000000000003";
const SESSION_ID = "97000000-0000-4000-8000-000000000004";
const HOST_PARTICIPANT_ID = "97000000-0000-4000-8000-000000000005";
const MEMBER_PARTICIPANT_ID = "97000000-0000-4000-8000-000000000006";
const SESSION_TITLE = "970회차 모임 · 운영실 생애주기";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;

let authSessionId: string | null = null;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function lastDataRow(output: string): string {
  return output.trim().split("\n").at(-1) ?? "";
}

function memberResponseAndAttendance(): string {
  return lastDataRow(runMysql(`
select concat_ws('|', rsvp_status, attendance_status)
from session_participants
where id = ${sqlString(MEMBER_PARTICIPANT_ID)};
`));
}

function cleanupFixture(): void {
  if (authSessionId) {
    runMysql(`delete from auth_sessions where id = ${sqlString(authSessionId)};`);
  }
  runMysql(`
delete from mutation_idempotency_keys where club_id = ${sqlString(CLUB_ID)};
delete from host_session_mutation_receipts where club_id = ${sqlString(CLUB_ID)};
delete from host_session_lifecycle_audit where club_id = ${sqlString(CLUB_ID)};
delete from host_session_change_audit where club_id = ${sqlString(CLUB_ID)};
delete from session_participant_change_audit where club_id = ${sqlString(CLUB_ID)};
delete from admin_closing_risk_ledger where club_id = ${sqlString(CLUB_ID)};
delete from session_participants where club_id = ${sqlString(CLUB_ID)};
delete from sessions where club_id = ${sqlString(CLUB_ID)};
delete from membership_club_access where club_id = ${sqlString(CLUB_ID)};
delete from memberships where club_id = ${sqlString(CLUB_ID)};
delete from club_host_list_epochs where club_id = ${sqlString(CLUB_ID)};
delete from clubs where id = ${sqlString(CLUB_ID)};
`);
  authSessionId = null;
}

function setupFixture(): void {
  cleanupFixture();
  runMysql(`
insert into clubs (id, slug, name, tagline, about, status)
values (
  ${sqlString(CLUB_ID)},
  ${sqlString(CLUB_SLUG)},
  '운영실 합성 클럽',
  '운영실 E2E',
  '실제 회원 정보가 아닌 로컬 합성 fixture입니다.',
  'ACTIVE'
);

insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch)
values (${sqlString(CLUB_ID)}, 0, 0);

insert into memberships (
  id, club_id, user_id, role, status, joined_at, short_name, avatar_key
)
select
  ${sqlString(HOST_MEMBERSHIP_ID)},
  ${sqlString(CLUB_ID)},
  users.id,
  'HOST',
  'ACTIVE',
  utc_timestamp(6),
  '합성 호스트',
  'mushroom-green-book'
from users
where lower(users.email) = 'host@example.com';

insert into memberships (
  id, club_id, user_id, role, status, joined_at, short_name, avatar_key
)
select
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  ${sqlString(CLUB_ID)},
  users.id,
  'MEMBER',
  'ACTIVE',
  utc_timestamp(6),
  '합성 멤버',
  'apple-green-book'
from users
where lower(users.email) = 'member5@example.com';

insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state,
  visibility, access_scope, schedule_revision
)
values (
  ${sqlString(SESSION_ID)},
  ${sqlString(CLUB_ID)},
  970,
  ${sqlString(SESSION_TITLE)},
  '운영실 생애주기 책',
  '합성 저자',
  '2000-01-01',
  '19:30:00',
  '21:30:00',
  '합성 모임방',
  '1999-12-31 14:59:00',
  'OPEN',
  'MEMBER',
  'GUEST_READABLE',
  1
);

insert into session_publication_versions (session_id, publication_revision)
values (${sqlString(SESSION_ID)}, 0);

insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status,
  participation_status, seen_schedule_revision, seen_schedule_at
)
values
(
  ${sqlString(HOST_PARTICIPANT_ID)},
  ${sqlString(CLUB_ID)},
  ${sqlString(SESSION_ID)},
  ${sqlString(HOST_MEMBERSHIP_ID)},
  'GOING',
  'UNKNOWN',
  'ACTIVE',
  1,
  '2000-01-01 00:00:00'
),
(
  ${sqlString(MEMBER_PARTICIPANT_ID)},
  ${sqlString(CLUB_ID)},
  ${sqlString(SESSION_ID)},
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  'DECLINED',
  'UNKNOWN',
  'ACTIVE',
  null,
  null
);
`);
}

async function expectOperatingRoomContext(page: Page, phase: "prep" | "live" | "closing") {
  await expect(page).toHaveURL(new RegExp(
    `^http://localhost:[0-9]+/clubs/${CLUB_SLUG}/app/host\\?phase=${phase}$`,
  ));
  await expect(page.getByRole("heading", { level: 1, name: SESSION_TITLE })).toBeVisible();
  expect(new URL(page.url()).pathname.startsWith(`/clubs/${CLUB_SLUG}/app/host`)).toBe(true);
}

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com", "member5@example.com"]);
  setupFixture();
});

test.afterEach(() => {
  cleanupFixture();
  resetSeedGoogleLogins(["host@example.com", "member5@example.com"]);
});

test("prep, live attendance receipt and undo, and closing stay on one scoped current meeting", async ({ page }) => {
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));

  await page.goto(`${HOST_PATH}?phase=prep`);
  await expectOperatingRoomContext(page, "prep");
  await expect(page.getByRole("link", { name: "일정 확인 자세히 보기" })).toHaveAttribute(
    "href",
    `${HOST_PATH}/sessions/${SESSION_ID}?section=responses&scheduleSeen=unseen`,
  );

  await page.getByRole("tab", { name: /현장/ }).click();
  await expectOperatingRoomContext(page, "live");
  const attendance = page.getByRole("region", { name: "출석 확인" });
  await attendance.getByRole("button", { name: /^전체/ }).click();

  const absentResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${SESSION_ID}/attendance`)
  ));
  await attendance.getByLabel("합성 멤버 실제 출석").selectOption("ABSENT");
  expect((await absentResponse).status()).toBe(200);
  await expect.poll(memberResponseAndAttendance).toBe("DECLINED|ABSENT");
  await expectOperatingRoomContext(page, "live");

  const undoResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${SESSION_ID}/changes/`)
      && response.url().includes("/restore")
  ));
  await page.getByRole("button", { name: "되돌리기" }).click();
  expect((await undoResponse).status()).toBe(200);
  await expect.poll(memberResponseAndAttendance).toBe("DECLINED|UNKNOWN");
  await expectOperatingRoomContext(page, "live");

  const bulkResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${SESSION_ID}/attendance`)
  ));
  await attendance.getByRole("button", { name: /나머지 2명 모두 참석/ }).click();
  expect((await bulkResponse).status()).toBe(200);
  await expect.poll(memberResponseAndAttendance).toBe("DECLINED|ATTENDED");

  await page.reload();
  await expectOperatingRoomContext(page, "live");
  await page.getByRole("link", { name: "모임 정보" }).click();
  await expect(page).toHaveURL(new RegExp(
    `/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}\\?section=basic$`,
  ));
  const basicSheet = page.getByRole("dialog", { name: "모임 정보" });
  await basicSheet.getByRole("button", { name: "접기" }).click();
  await expect(basicSheet).toBeHidden();

  await page.getByRole("button", { name: "모임 마치기", exact: true }).first().click();
  const closeResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && response.url().includes(`/host/sessions/${SESSION_ID}/close`)
  ));
  await page.getByRole("dialog", { name: "모임 마치기" })
    .getByRole("button", { name: "모임 마치기" })
    .click();
  expect((await closeResponse).status()).toBe(200);

  await page.goto(`${HOST_PATH}?phase=closing`);
  await expectOperatingRoomContext(page, "closing");
  await expect(page.getByRole("region", { name: "장부 마감 체크리스트" })).toBeVisible();
  const recordReview = page.getByRole("link", { name: "기록 패키지 검토" }).first();
  await expect(recordReview).toHaveAttribute(
    "href",
    `${HOST_PATH}/sessions/${SESSION_ID}/edit?records=json`,
  );
  await recordReview.click();
  await expect(page).toHaveURL(new RegExp(
    `^http://localhost:[0-9]+/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}`,
  ));
  expect(new URL(page.url()).pathname.startsWith(`/clubs/${CLUB_SLUG}/app/host`)).toBe(true);
});
