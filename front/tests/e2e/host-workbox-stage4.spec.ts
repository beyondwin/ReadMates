import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";
import {
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
} from "./support/visual-authority-contract";

test.describe.configure({ mode: "serial" });

const CLUB_ID = "97200000-0000-4000-8000-000000000001";
const CLUB_SLUG = "host-workbox-stage4-e2e";
const OTHER_CLUB_ID = "97200000-0000-4000-8000-000000000002";
const OTHER_CLUB_SLUG = "host-workbox-stage4-other";
const HOST_MEMBERSHIP_ID = "97200000-0000-4000-8000-000000000003";
const VIEWER_MEMBERSHIP_ID = "97200000-0000-4000-8000-000000000004";
const ACTIVE_MEMBERSHIP_ID = "97200000-0000-4000-8000-000000000005";
const OPEN_SESSION_ID = "97200000-0000-4000-8000-000000000006";
const DRAFT_SESSION_ID = "97200000-0000-4000-8000-000000000007";
const HOST_PARTICIPANT_ID = "97200000-0000-4000-8000-000000000008";
const ACTIVE_PARTICIPANT_ID = "97200000-0000-4000-8000-000000000009";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;

let authSessionId: string | null = null;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function invitationLinkValues(): string {
  return Array.from({ length: 42 }, (_, index) => {
    const suffix = String(100 + index).padStart(12, "0");
    const id = `97200000-0000-4000-8001-${suffix}`;
    const tokenHash = createHash("sha256").update(`stage4-link-${index}`).digest("hex");
    return `(${sqlString(id)}, ${sqlString(CLUB_ID)}, ${sqlString(HOST_MEMBERSHIP_ID)}, `
      + `${sqlString(`합성 초대 링크 ${String(index + 1).padStart(2, "0")}`)}, ${sqlString(tokenHash)}, `
      + `'ACTIVE', 5, 0, timestampadd(day, 3, utc_timestamp(6)), 0, `
      + `timestampadd(second, ${index}, utc_timestamp(6)), timestampadd(second, ${index}, utc_timestamp(6)))`;
  }).join(",\n");
}

function attendanceHistorySessionValues(): string {
  return Array.from({ length: 41 }, (_, index) => {
    const suffix = String(200 + index).padStart(12, "0");
    const id = `97200000-0000-4000-8002-${suffix}`;
    return `(${sqlString(id)}, ${sqlString(CLUB_ID)}, ${800 + index}, `
      + `${sqlString(`참석 이력 합성 모임 ${index + 1}`)}, '참석 이력 합성 책', '합성 저자', `
      + `date_add('2025-01-01', interval ${index} day), '19:30:00', '21:30:00', `
      + `'합성 모임방', date_add('2024-12-31 14:59:00', interval ${index} day), `
      + `'CLOSED', 'MEMBER', 'HOST_ONLY', 1, 1, utc_timestamp(6), utc_timestamp(6))`;
  }).join(",\n");
}

function attendanceHistoryParticipantValues(): string {
  return Array.from({ length: 41 }, (_, index) => {
    const sessionSuffix = String(200 + index).padStart(12, "0");
    const participantSuffix = String(300 + index).padStart(12, "0");
    return `(${sqlString(`97200000-0000-4000-8003-${participantSuffix}`)}, ${sqlString(CLUB_ID)}, `
      + `${sqlString(`97200000-0000-4000-8002-${sessionSuffix}`)}, ${sqlString(ACTIVE_MEMBERSHIP_ID)}, `
      + `'GOING', '${index % 2 === 0 ? "ATTENDED" : "ABSENT"}', 'ACTIVE', 1, utc_timestamp(6), `
      + `utc_timestamp(6), utc_timestamp(6))`;
  }).join(",\n");
}

function hostSettingsHistoryValues(): string {
  return Array.from({ length: 41 }, (_, index) => {
    const revision = index + 1;
    const suffix = String(400 + index).padStart(12, "0");
    const before = JSON.stringify({ name: `합성 설정 ${index}` });
    const after = JSON.stringify({ name: `합성 설정 ${revision}` });
    return `(${sqlString(`97200000-0000-4000-8004-${suffix}`)}, ${sqlString(CLUB_ID)}, ${revision}, `
      + `'SETTINGS_UPDATED', ${sqlString(HOST_MEMBERSHIP_ID)}, null, `
      + `cast(${sqlString(before)} as json), cast(${sqlString(after)} as json), `
      + `timestampadd(second, ${index}, utc_timestamp(6)))`;
  }).join(",\n");
}

function cleanupFixture(): void {
  if (authSessionId) {
    runMysql(`delete from auth_sessions where id = ${sqlString(authSessionId)};`);
  }
  runMysql(`
delete from host_workbox_snapshot_items where snapshot_id in (
  select id from host_workbox_snapshots where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)})
);
delete from host_workbox_snapshots where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from host_work_item_deferrals where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from notification_manual_dispatches where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from member_notifications where event_id in (
  select id from notification_event_outbox where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)})
);
delete from notification_deliveries where event_id in (
  select id from notification_event_outbox where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)})
);
delete from notification_manual_dispatch_previews where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from notification_event_outbox where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from auth_public_projection_mutation_receipts where club_id_snapshot in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from host_invitation_link_events where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from host_invitation_links where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from host_club_close_previews where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from host_club_command_receipts where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from host_club_settings_history where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from session_publication_versions where session_id in (${sqlString(OPEN_SESSION_ID)}, ${sqlString(DRAFT_SESSION_ID)});
delete from session_participants where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from sessions where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from membership_club_access where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from memberships where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from club_host_list_epochs where club_id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
delete from clubs where id in (${sqlString(CLUB_ID)}, ${sqlString(OTHER_CLUB_ID)});
`);
  authSessionId = null;
}

function setupFixture(): void {
  cleanupFixture();
  runMysql(`
insert into clubs (id, slug, name, tagline, about, status) values
  (${sqlString(CLUB_ID)}, ${sqlString(CLUB_SLUG)}, '작업함 합성 클럽', '작업함 E2E', '로컬 합성 데이터입니다.', 'ACTIVE'),
  (${sqlString(OTHER_CLUB_ID)}, ${sqlString(OTHER_CLUB_SLUG)}, '다른 합성 클럽', '격리 E2E', '로컬 합성 데이터입니다.', 'ACTIVE');

insert into club_host_list_epochs (club_id, meeting_epoch, record_epoch) values
  (${sqlString(CLUB_ID)}, 0, 0),
  (${sqlString(OTHER_CLUB_ID)}, 0, 0);

insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
select ${sqlString(HOST_MEMBERSHIP_ID)}, ${sqlString(CLUB_ID)}, users.id,
       'HOST', 'ACTIVE', utc_timestamp(6), '합성 호스트', 'mushroom-green-book'
from users where lower(users.email) = 'host@example.com';

insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
select ${sqlString(VIEWER_MEMBERSHIP_ID)}, ${sqlString(CLUB_ID)}, users.id,
       'MEMBER', 'VIEWER', null, '승인 대기 합성 멤버', 'apple-green-book'
from users where lower(users.email) = 'member5@example.com';

insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
select ${sqlString(ACTIVE_MEMBERSHIP_ID)}, ${sqlString(CLUB_ID)}, users.id,
       'MEMBER', 'ACTIVE', utc_timestamp(6), '일정 미열람 합성 멤버', 'cloud-green-book'
from users where lower(users.email) = 'member4@example.com';

update clubs set host_settings_revision = 41 where id = ${sqlString(CLUB_ID)};

insert into host_club_settings_history (
  id, club_id, revision, action, actor_membership_id, subject_membership_id,
  before_settings_json, after_settings_json, occurred_at
) values
${hostSettingsHistoryValues()};

insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state,
  visibility, access_scope, schedule_revision, participant_set_revision
) values
  (${sqlString(OPEN_SESSION_ID)}, ${sqlString(CLUB_ID)}, 972, '일정 알림 합성 모임',
   '일정 알림 합성 책', '합성 저자', '2099-12-30', '19:30:00', '21:30:00',
   '합성 모임방', '2099-12-29 14:59:00', 'OPEN', 'MEMBER', 'GUEST_READABLE', 2, 1),
  (${sqlString(DRAFT_SESSION_ID)}, ${sqlString(CLUB_ID)}, 973, '비공개 초안 합성 모임',
   '초안 합성 책', '합성 저자', '2099-12-31', '19:30:00', '21:30:00',
   '합성 모임방', '2099-12-30 14:59:00', 'DRAFT', 'MEMBER', 'HOST_ONLY', 1, 0);

insert into session_publication_versions (session_id, publication_revision) values
  (${sqlString(OPEN_SESSION_ID)}, 0),
  (${sqlString(DRAFT_SESSION_ID)}, 0);

insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status,
  participation_status, seen_schedule_revision, seen_schedule_at
) values
  (${sqlString(HOST_PARTICIPANT_ID)}, ${sqlString(CLUB_ID)}, ${sqlString(OPEN_SESSION_ID)},
   ${sqlString(HOST_MEMBERSHIP_ID)}, 'GOING', 'UNKNOWN', 'ACTIVE', 2, utc_timestamp(6)),
  (${sqlString(ACTIVE_PARTICIPANT_ID)}, ${sqlString(CLUB_ID)}, ${sqlString(OPEN_SESSION_ID)},
   ${sqlString(ACTIVE_MEMBERSHIP_ID)}, 'MAYBE', 'UNKNOWN', 'ACTIVE', 1, timestampadd(day, -1, utc_timestamp(6)));

insert into sessions (
  id, club_id, number, title, book_title, book_author, session_date,
  start_time, end_time, location_label, question_deadline_at, state,
  visibility, access_scope, schedule_revision, participant_set_revision,
  created_at, updated_at
) values
${attendanceHistorySessionValues()};

insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status,
  participation_status, seen_schedule_revision, seen_schedule_at, created_at, updated_at
) values
${attendanceHistoryParticipantValues()};

insert into host_invitation_links (
  id, club_id, created_by_membership_id, name, token_hash, status, max_uses,
  used_count, expires_at, revision, created_at, updated_at
) values
${invitationLinkValues()};
`);
}

async function workboxResponse(page: Page, state: "NOW" | "DEFERRED" | "COMPLETED") {
  const response = await page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return candidate.request().method() === "GET"
      && url.pathname.endsWith("/api/host/workbox")
      && url.searchParams.get("state") === state;
  });
  return response.json() as Promise<{
    items: Array<{ key: string; state: string; title: string; receiptSummary: null | { operation: string; outcome: string } }>;
    nextCursor: string | null;
  }>;
}

async function revealWorkboxItem(page: Page, accessibleName: string) {
  const workbox = page.getByRole("region", { name: "작업함" });
  const item = workbox.getByRole("listitem", { name: accessibleName });
  for (let pageNumber = 0; pageNumber < 5 && await item.count() === 0; pageNumber += 1) {
    const loadMore = workbox.getByRole("button", { name: "다음 묶음 불러오기" });
    await expect(loadMore).toBeVisible();
    await loadMore.click();
  }
  return item;
}

async function approveViewerThroughBff(page: Page): Promise<number> {
  return page.evaluate(async ({ membershipId, clubSlug }) => {
    const response = await fetch(
      `/api/bff/api/host/members/${encodeURIComponent(membershipId)}/approve?clubSlug=${encodeURIComponent(clubSlug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Readmates-Client-Contract": "v3",
        },
      },
    );
    return response.status;
  }, { membershipId: VIEWER_MEMBERSHIP_ID, clubSlug: CLUB_SLUG });
}

async function deferWorkboxItemThroughBff(page: Page, key: string): Promise<{ status: number; deferredUntil: string }> {
  return page.evaluate(async ({ workItemKey, clubSlug }) => {
    const deferredUntil = new Date(Date.now() + 86_400_000).toISOString();
    const response = await fetch(
      `/api/bff/api/host/workbox/items/${encodeURIComponent(workItemKey)}/deferral?clubSlug=${encodeURIComponent(clubSlug)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Readmates-Client-Contract": "v3",
        },
        body: JSON.stringify({ deferredUntil }),
      },
    );
    return { status: response.status, deferredUntil };
  }, { workItemKey: key, clubSlug: CLUB_SLUG });
}

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com", "member4@example.com", "member5@example.com"]);
  setupFixture();
});

test.afterEach(() => {
  cleanupFixture();
  resetSeedGoogleLogins(["host@example.com", "member4@example.com", "member5@example.com"]);
});

test("authoritative workbox key survives defer, expiry and source-owned completion receipt", async ({ page }) => {
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));

  const initialNow = workboxResponse(page, "NOW");
  await page.goto(HOST_PATH);
  const initialPage = await initialNow;
  const viewerItem = initialPage.items.find((item) => item.key.startsWith(`MEMBER_APPROVAL:${VIEWER_MEMBERSHIP_ID}:`));
  expect(viewerItem?.state).toBe("NOW");
  const authoritativeKey = viewerItem!.key;

  const row = page.getByRole("listitem", { name: "가입 승인 요청" });
  await expect(row).toBeVisible();
  await expect(row.locator("details")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "가입 승인 요청 보류" })).toHaveCount(0);
  await expect(row.getByRole("link", { name: "가입 승인 요청" })).toBeVisible();
  const deferred = await deferWorkboxItemThroughBff(page, authoritativeKey);
  expect(deferred.status).toBe(200);
  expect(deferred.deferredUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const deferredPagePromise = workboxResponse(page, "DEFERRED");
  await page.getByRole("tab", { name: /^보류/ }).click();
  const deferredPage = await deferredPagePromise;
  expect(deferredPage.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: authoritativeKey, state: "DEFERRED" }),
  ]));
  await expect(page.getByRole("listitem", { name: "가입 승인 요청" })).toBeVisible();

  runMysql(`
update host_work_item_deferrals
set deferred_until = timestampadd(second, -1, utc_timestamp(6))
where club_id = ${sqlString(CLUB_ID)}
  and host_membership_id = ${sqlString(HOST_MEMBERSHIP_ID)}
  and work_item_key = ${sqlString(authoritativeKey)};
`);

  await page.reload();
  await expect(await revealWorkboxItem(page, "가입 승인 요청")).toBeVisible();

  expect(await approveViewerThroughBff(page)).toBe(200);
  const completedPromise = workboxResponse(page, "COMPLETED");
  await page.reload();
  await page.getByRole("tab", { name: /^완료/ }).click();
  const completedPage = await completedPromise;
  expect(completedPage.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      key: authoritativeKey,
      state: "COMPLETED",
      receiptSummary: expect.objectContaining({ operation: "APPROVED" }),
    }),
  ]));
  const completedRow = page.getByRole("listitem", { name: "가입 승인 요청" });
  await expect(completedRow.locator("details")).toHaveCount(0);
  await expect(completedRow.getByRole("link", { name: "가입 승인 요청" })).toBeVisible();
  await expect(page.getByText("가입 승인 처리됨")).toBeVisible();

  await page.goto(`${HOST_PATH}/people/${VIEWER_MEMBERSHIP_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "승인 대기 합성 멤버" })).toBeVisible();
  await expect(page.getByText("페이지 열람 기록은 수집하지 않습니다.")).toBeVisible();
  await expect(page.getByText(/@example\.com/)).toHaveCount(0);

  const crossClubStatus = await page.evaluate(async ({ membershipId, clubSlug }) => {
    const response = await fetch(
      `/api/bff/api/host/people/${encodeURIComponent(membershipId)}?clubSlug=${encodeURIComponent(clubSlug)}`,
    );
    return response.status;
  }, { membershipId: VIEWER_MEMBERSHIP_ID, clubSlug: OTHER_CLUB_SLUG });
  expect(crossClubStatus).toBe(403);
});

test("prep live and closing stay on the seeded current meeting", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  runMysql(`
update sessions
set session_date = utc_date()
where id = ${sqlString(OPEN_SESSION_ID)};
`);
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));
  await page.goto(`${HOST_PATH}?phase=prep`);
  const currentMeeting = page.getByRole("group", { name: "현재 모임" });
  await expect(currentMeeting).toBeVisible();
  await expect(page.getByRole("heading", { name: "일정 알림 합성 모임" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "모임 운영 단계" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /준비실/ })).toHaveAttribute("aria-selected", "true");

  const liveTab = page.getByRole("tab", { name: /현장/ });
  await expect(liveTab).toBeVisible();
  await liveTab.click();
  await expect(page).toHaveURL(/phase=live/);
  await expect(currentMeeting).toBeVisible();
  await expect(page.getByRole("tab", { name: /현장/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: /현장 운영/ })).toBeVisible();

  const closingTab = page.getByRole("tab", { name: /마감실/ });
  await expect(closingTab).toBeVisible();
  await expect(closingTab).toHaveAttribute("aria-disabled", "true");

  await page.getByRole("tab", { name: /준비실/ }).click();
  await expect(page).toHaveURL(/phase=prep/);
  await expect(currentMeeting).toBeVisible();
  await expect(page.getByRole("tab", { name: /준비실/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: /준비실 운영/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("schedule review fails closed for drafts, requires preview, and keeps an unknown receipt without resend", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));

  await page.goto(`${HOST_PATH}/sessions/${DRAFT_SESSION_ID}/schedule-review`);
  await expect(page.getByRole("alert")).toContainText("일정 확인 상태를 사용할 수 없습니다");

  let previewRequests = 0;
  let confirmRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "POST") return;
    if (url.pathname.endsWith("/api/host/notifications/manual/preview")) previewRequests += 1;
    if (url.pathname.endsWith("/api/host/notifications/manual")) confirmRequests += 1;
  });

  await page.goto(`${HOST_PATH}/sessions/${OPEN_SESSION_ID}/schedule-review`);
  await expect(page.getByRole("heading", { level: 1, name: "일정 미열람 검토" })).toBeVisible();
  const recipientRows = page.locator(".rm-schedule-review__recipients li");
  const currentMember = recipientRows.filter({ hasText: "합성 호스트" });
  const staleMember = recipientRows.filter({ hasText: "일정 미열람 합성 멤버" });
  await expect(currentMember.getByRole("checkbox")).toBeDisabled();
  await expect(currentMember).toContainText("현재 일정 확인");
  await expect(staleMember.getByRole("checkbox")).toBeChecked();
  await expect(staleMember).toContainText("변경 전 확인");

  await staleMember.getByRole("checkbox").uncheck();
  await staleMember.getByRole("checkbox").check();
  await page.getByLabel("알림 제목").fill("수정한 합성 일정 알림");
  await page.getByLabel("알림 본문").fill("합성 일정 변경 내용을 확인해 주세요.");
  expect(previewRequests).toBe(0);
  expect(confirmRequests).toBe(0);

  const previewResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/host/notifications/manual/preview")
  ));
  await page.getByRole("button", { name: "알림 미리보기" }).click();
  expect((await previewResponse).status()).toBe(200);
  await expect(page.getByRole("button", { name: "1명에게 안내 보내기" })).toBeVisible();
  expect(previewRequests).toBe(1);
  expect(confirmRequests).toBe(0);

  runMysql(`
update sessions
set schedule_revision = 3, session_revision = session_revision + 1, updated_at = utc_timestamp(6)
where id = ${sqlString(OPEN_SESSION_ID)} and club_id = ${sqlString(CLUB_ID)};
`);
  const conflictResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/host/notifications/manual")
  ));
  await page.getByRole("button", { name: "1명에게 안내 보내기" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("일정 또는 수신 대상이 변경");
  expect(confirmRequests).toBe(1);

  await expect(page.getByText("일정 3판")).toBeVisible();
  await page.getByRole("button", { name: "알림 미리보기" }).click();
  await expect(page.getByRole("button", { name: "1명에게 안내 보내기" })).toBeVisible();

  await page.route("**/api/bff/api/host/notifications/manual?**", async (route) => {
    if (route.request().method() === "POST") {
      const committed = await route.fetch();
      expect(committed.status(), await committed.text()).toBe(200);
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "1명에게 안내 보내기" }).click();
  const unknownReceipt = page.getByRole("status", { name: "일정 알림 · 결과 확인 필요" });
  await expect(unknownReceipt).toBeVisible();
  await expect(unknownReceipt).toContainText("같은 알림을 다시 보내지 말고");
  const ledgerLink = unknownReceipt.getByRole("link", { name: "알림 장부에서 결과 확인" });
  await expect(ledgerLink).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
  expect(confirmRequests).toBe(2);
  expect(runMysql(`
select concat(
  (select count(*) from notification_manual_dispatches
   where club_id = ${sqlString(CLUB_ID)} and session_id = ${sqlString(OPEN_SESSION_ID)}),
  '|',
  (select count(*) from notification_event_outbox
   where club_id = ${sqlString(CLUB_ID)} and aggregate_id = ${sqlString(OPEN_SESSION_ID)})
);
`).trim().split("\n").at(-1)).toBe("1|1");
  await page.waitForTimeout(250);
  expect(confirmRequests).toBe(2);

  const committedIdentity = runMysql(`
select concat(id, '|', event_id, '|', event_type, '|', requested_channels, '|', audience, '|', target_count, '|', resend)
from notification_manual_dispatches
where club_id = ${sqlString(CLUB_ID)} and session_id = ${sqlString(OPEN_SESSION_ID)};
`).trim().split("\n").at(-1)?.split("|");
  expect(committedIdentity).toHaveLength(7);
  const [manualDispatchId, eventId] = committedIdentity!;

  const dispatchLedgerResponse = page.waitForResponse((response) => (
    response.request().method() === "GET"
      && new URL(response.url()).pathname.endsWith("/api/host/notifications/manual/dispatches")
  ));
  await ledgerLink.click();
  await expect(page).toHaveURL(`${HOST_PATH}/notifications`);
  const dispatchResponse = await dispatchLedgerResponse;
  expect(dispatchResponse.status()).toBe(200);
  const dispatchPage = await dispatchResponse.json() as {
    items: Array<{
      manualDispatchId: string;
      eventId: string;
      source: string;
      eventType: string;
      sessionId: string;
      sessionNumber: number;
      bookTitle: string;
      requestedChannels: string;
      audience: string;
      targetCount: number;
      resend: boolean;
      eventStatus: string;
      requestedBy: string;
    }>;
  };
  expect(dispatchPage.items).toContainEqual(expect.objectContaining({
    manualDispatchId,
    eventId,
    source: "MANUAL",
    eventType: "SESSION_REMINDER_DUE",
    sessionId: OPEN_SESSION_ID,
    sessionNumber: 972,
    bookTitle: "일정 알림 합성 책",
    requestedChannels: "BOTH",
    audience: "SELECTED_MEMBERS",
    targetCount: 1,
    resend: false,
    eventStatus: "PENDING",
    requestedBy: "h***@example.com",
  }));

  const ledger = page.getByRole("region", { name: "최근 수동 발송" });
  const committedRow = ledger.locator("article").filter({ hasText: "모임 리마인더" });
  await expect(ledger).toBeVisible();
  await expect(committedRow).toHaveCount(1);
  await expect(committedRow).toContainText("No.972 · 일정 알림 합성 책");
  await expect(committedRow).toContainText("수동");
  await expect(committedRow).toContainText("PENDING");
  await expect(committedRow).toContainText("앱 + 이메일");
  await expect(committedRow).toContainText("직접 선택");
  await expect(committedRow).toContainText("1명");
  await expect(committedRow).toContainText("요청 h***@example.com");
  expect(confirmRequests).toBe(2);
  await page.waitForTimeout(250);
  expect(confirmRequests).toBe(2);
});

test("partial workbox and notification failures retry only their failed source", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));
  let workboxRequests = 0;
  let notificationRequests = 0;
  let allowWorkboxRecovery = false;
  let allowNotificationRecovery = false;

  await page.route("**/api/bff/api/host/workbox?**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    workboxRequests += 1;
    if (!allowWorkboxRecovery) {
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "WORKBOX_UNAVAILABLE", status: 503 }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/bff/api/host/notifications/summary?**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    notificationRequests += 1;
    if (!allowNotificationRecovery) {
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "NOTIFICATION_SOURCE_UNAVAILABLE", status: 503 }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(HOST_PATH);
  await expect(page).toHaveURL(`${HOST_PATH}?phase=prep`);
  await expect(page.getByRole("group", { name: "현재 모임" })).toBeVisible();
  const workboxFailure = page.getByRole("alert").filter({ hasText: "작업함을 불러오지 못했습니다" });
  await expect(workboxFailure).toBeVisible();
  await expect(page.getByText("알림 상태를 불러오지 못했습니다.")).toBeVisible();
  const workboxBaseline = workboxRequests;
  const notificationBaseline = notificationRequests;
  expect(workboxBaseline).toBeGreaterThanOrEqual(1);
  expect(notificationBaseline).toBeGreaterThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);

  allowNotificationRecovery = true;
  await page.getByRole("button", { name: "알림 상태 다시 불러오기" }).click();
  await expect.poll(() => notificationRequests).toBe(notificationBaseline + 1);
  expect(workboxRequests).toBe(workboxBaseline);
  await expect(page.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(page.getByText("알림 상태를 불러오지 못했습니다.")).toHaveCount(0);
  await expect(workboxFailure).toBeVisible();

  allowWorkboxRecovery = true;
  await workboxFailure.getByRole("button", { name: "다시 불러오기" }).click();
  await expect.poll(() => workboxRequests).toBe(workboxBaseline + 1);
  expect(notificationRequests).toBe(notificationBaseline + 1);
  await expect(page.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(workboxFailure).toHaveCount(0);
});

test("workbox continuation submits the opaque cursor and preserves loaded rows through a controlled stale response", async ({ page }) => {
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));

  const firstPagePromise = workboxResponse(page, "NOW");
  await page.goto(HOST_PATH);
  const firstPage = await firstPagePromise;
  const firstKey = firstPage.items[0]?.key;
  const firstTitle = firstPage.items[0]?.title;
  expect(firstKey).toBeTruthy();
  expect(firstTitle).toBeTruthy();
  const firstCursor = firstPage.nextCursor;
  expect(firstCursor).toBeTruthy();

  const continuationRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === "GET"
      && url.pathname.endsWith("/api/host/workbox")
      && url.searchParams.get("cursor") === firstCursor;
  });
  await page.getByRole("button", { name: "다음 묶음 불러오기" }).click();
  await continuationRequest;
  const workbox = page.getByRole("region", { name: "작업함" });
  // The first viewport caps the desktop workbox at 4 rows; the rest stay behind disclosure.
  await expect(workbox.getByRole("listitem")).toHaveCount(4);
  await workbox.getByRole("button", { name: "작업함 모두 보기" }).click();
  await expect(workbox.getByRole("listitem")).toHaveCount(40);
  await expect(workbox.getByRole("listitem", { name: firstTitle! })).toBeVisible();

  const nextButton = page.getByRole("button", { name: "다음 묶음 불러오기" });
  await expect(nextButton).toBeVisible();
  let staleCursor: string | null = null;
  await page.route("**/api/bff/api/host/workbox?**", async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");
    if (route.request().method() === "GET" && cursor) {
      staleCursor = cursor;
      await route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "WORKBOX_CURSOR_STALE", status: 409 }),
      });
      return;
    }
    await route.continue();
  });
  await nextButton.click();
  await expect(page.getByRole("alert")).toContainText("작업함을 불러오지 못했습니다");
  expect(staleCursor).toBeTruthy();
  await expect(workbox.getByRole("listitem")).toHaveCount(40);
});

test("person attendance continuation preserves identity and loaded rows when its snapshot fingerprint changes", async ({ page }) => {
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));
  expect(runMysql(`
select concat(
  (select count(*) from active_sessions where club_id = ${sqlString(CLUB_ID)} and state = 'CLOSED'),
  '|',
  (select count(*) from session_participants where club_id = ${sqlString(CLUB_ID)} and membership_id = ${sqlString(ACTIVE_MEMBERSHIP_ID)})
);
`).trim().split("\n").at(-1)).toBe("41|42");

  const firstResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname.endsWith(`/api/host/people/${ACTIVE_MEMBERSHIP_ID}`)
      && !url.searchParams.has("attendanceCursor");
  });
  await page.goto(`${HOST_PATH}/people/${ACTIVE_MEMBERSHIP_ID}`);
  const firstResponse = await firstResponsePromise;
  expect(firstResponse.status()).toBe(200);
  const firstPage = await firstResponse.json() as {
    membershipId: string;
    attendanceHistory: { nextCursor: string; items: unknown[] };
  };
  expect(firstPage.membershipId).toBe(ACTIVE_MEMBERSHIP_ID);
  expect(firstPage.attendanceHistory.items).toHaveLength(20);
  const firstCursor = firstPage.attendanceHistory.nextCursor;
  expect(firstCursor).toBeTruthy();

  const history = page.getByRole("region", { name: "참석 기록" });
  await expect(history.getByRole("listitem")).toHaveCount(20);
  const continuationResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname.endsWith(`/api/host/people/${ACTIVE_MEMBERSHIP_ID}`)
      && url.searchParams.get("attendanceCursor") === firstCursor;
  });
  await history.getByRole("button", { name: "참석 기록 더 보기" }).click();
  const continuationResponse = await continuationResponsePromise;
  expect(continuationResponse.status()).toBe(200);
  const continuationPage = await continuationResponse.json() as {
    membershipId: string;
    attendanceHistory: { nextCursor: string };
  };
  expect(continuationPage.membershipId).toBe(ACTIVE_MEMBERSHIP_ID);
  expect(continuationPage.attendanceHistory.nextCursor).toBeTruthy();
  await expect(history.getByRole("listitem")).toHaveCount(40);

  runMysql(`
update session_participants
set attendance_status = case when attendance_status = 'ATTENDED' then 'ABSENT' else 'ATTENDED' end,
    attendance_revision = attendance_revision + 1,
    updated_at = utc_timestamp(6)
where id = ${sqlString("97200000-0000-4000-8003-000000000300")}
  and club_id = ${sqlString(CLUB_ID)};
`);
  const staleResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname.endsWith(`/api/host/people/${ACTIVE_MEMBERSHIP_ID}`)
      && url.searchParams.get("attendanceCursor") === continuationPage.attendanceHistory.nextCursor;
  });
  await history.getByRole("button", { name: "참석 기록 더 보기" }).click();
  expect((await staleResponsePromise).status()).toBe(400);
  await expect(history.getByRole("alert")).toContainText("보이는 기록은 그대로 유지");
  await expect(history.getByRole("listitem")).toHaveCount(40);
  await expect(page.getByRole("heading", { level: 1, name: "일정 미열람 합성 멤버" })).toBeVisible();
});

test("named links and revisioned settings expose one-time authority while cursor and close recovery stay fail-closed", async ({ page }) => {
  ({ sessionId: authSessionId } = await loginWithGoogleFixture(page, "host@example.com"));

  const initialHistoryResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname.endsWith("/api/host/club-settings/history")
      && !url.searchParams.has("cursor");
  });
  await page.goto(`${HOST_PATH}/settings`);
  const initialHistoryResponse = await initialHistoryResponsePromise;
  const initialHistory = await initialHistoryResponse.json() as { nextCursor: string };
  expect(initialHistory.nextCursor).toBeTruthy();
  await expect(page.getByText("revision 41", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "새 초대 링크" }).click();
  await page.getByLabel("링크 이름").fill("브라우저 합성 공유 링크");
  await page.getByLabel("최대 사용 횟수").fill("2");
  const createResponsePromise = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/host/invitation-links")
  ));
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json() as {
    link: { linkId: string };
    oneTimeSharePath: string;
  };
  expect(created.oneTimeSharePath).toMatch(new RegExp(`^/clubs/${CLUB_SLUG}/invite/lnk_[A-Za-z0-9_-]{43}$`));
  const rawToken = created.oneTimeSharePath.split("/").at(-1)!;
  const storedHash = runMysql(`
select token_hash from host_invitation_links
where id = ${sqlString(created.link.linkId)} and club_id = ${sqlString(CLUB_ID)};
`).trim().split("\n").at(-1);
  expect(storedHash).toBe(createHash("sha256").update(rawToken).digest("hex"));

  const listBody = await page.evaluate(async (clubSlug) => {
    const response = await fetch(`/api/bff/api/host/invitation-links?clubSlug=${encodeURIComponent(clubSlug)}`);
    return response.text();
  }, CLUB_SLUG);
  expect(listBody).not.toContain(rawToken);
  expect(listBody).not.toContain("tokenHash");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  await page.getByRole("button", { name: "한 번만 복사" }).click();
  await expect(page.getByRole("button", { name: "한 번만 복사" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("다시 표시하지 않습니다");

  await page.locator(".rm-host-editorial-ledger__row").filter({ hasText: "클럽 이름" }).getByRole("button", { name: "수정" }).click();
  await page.getByLabel("클럽 이름").fill("작업함 합성 클럽 개정");
  const settingsResponsePromise = page.waitForResponse((response) => (
    response.request().method() === "PUT"
      && new URL(response.url()).pathname.endsWith("/api/host/club-settings")
  ));
  const refreshedHistoryPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname.endsWith("/api/host/club-settings/history")
      && !url.searchParams.has("cursor");
  });
  await page.getByRole("button", { name: "설정 저장" }).click();
  const settingsResponse = await settingsResponsePromise;
  expect(settingsResponse.status()).toBe(200);
  expect(settingsResponse.request().postDataJSON()).toMatchObject({
    expectedRevision: 41,
    name: "작업함 합성 클럽 개정",
    idempotencyKey: expect.any(String),
  });
  const refreshedHistory = await refreshedHistoryPromise;
  const historyPage = await refreshedHistory.json() as { nextCursor: string };
  const historyCursor = historyPage.nextCursor;
  expect(historyCursor).toBeTruthy();

  const historyRegion = page.getByRole("region", { name: "설정 변경 이력" });
  const continuationRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return request.method() === "GET"
      && url.pathname.endsWith("/api/host/club-settings/history")
      && url.searchParams.get("cursor") === historyCursor;
  });
  await historyRegion.getByRole("button", { name: "설정 변경 이력 더 보기" }).click();
  await continuationRequest;
  await expect(historyRegion.getByRole("listitem")).toHaveCount(40);

  await page.route("**/api/bff/api/host/club-settings/history?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("cursor")) {
      await route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "HOST_SETTINGS_CURSOR_STALE", status: 409 }),
      });
      return;
    }
    await route.continue();
  });
  await historyRegion.getByRole("button", { name: "설정 변경 이력 더 보기" }).click();
  await expect(historyRegion.getByRole("alert")).toContainText("보이는 이력은 유지");
  await expect(historyRegion.getByRole("listitem")).toHaveCount(40);

  await page.getByRole("button", { name: "종료 검토" }).click();
  const previewResponsePromise = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/api/host/club-settings/end/preview")
  ));
  await page.getByRole("button", { name: "종료 영향 미리보기" }).click();
  expect((await previewResponsePromise).status()).toBe(200);
  await page.route("**/api/bff/api/host/club-settings/end/confirm?**", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({ code: "HOST_CLUB_CLOSE_PREVIEW_STALE", status: 409 }),
    });
  });
  await page.getByRole("button", { name: "클럽 운영 종료 확인" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("더 이상 유효하지 않습니다");
  expect(runMysql(`select status from clubs where id = ${sqlString(CLUB_ID)};`).trim().split("\n").at(-1)).toBe("ACTIVE");
});
