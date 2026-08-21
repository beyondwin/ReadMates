import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page, type Request } from "@playwright/test";
import { FRONTEND_OBSERVABILITY_BROWSER_PATH } from "../../shared/observability/frontend-observability-paths";
import {
  cleanupGeneratedSessions,
  cleanupViewerGoogleUserFixtures,
  loginWithGoogleFixture,
  readMembershipId,
  resetSeedGoogleLogins,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_ID = "00000000-0000-0000-0000-000000000001";
const CLUB_SLUG = "reading-sai";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;
const HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201";
const MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000202";
const FIXTURE_MEETING_URL = "https://meeting.invalid/e2e-host-hardening";
const FIXTURE_PASSCODE = "e2e-room-2048";
const LEGACY_SUMMARY = "레거시 공개 요약입니다.";


const BLOCKER_LABELS: Record<string, string> = {
  RECORD_REVISION_EXISTS: "적용된 기록 버전",
  NOTIFICATION_DECISION_EXISTS: "알림 확인 결정",
  MANUAL_DISPATCH_EXISTS: "수동 알림 발송",
  NOTIFICATION_EVENT_EXISTS: "알림 이벤트",
  NOTIFICATION_DELIVERY_EXISTS: "알림 전달 기록",
  MEMBER_NOTIFICATION_EXISTS: "멤버 알림",
};

const viewerEmails: string[] = [];
let nextSessionNumber = 80;

async function closeWorkspaceSheets(page: Page) {
  for (const name of ["모임 정보", "변경 내역"] as const) {
    const trigger = page.getByRole("button", { name }).first();
    const sheet = page.getByRole("dialog", { name });
    if ((await trigger.getAttribute("aria-expanded")) !== "true" && !(await sheet.isVisible())) {
      continue;
    }
    const collapse = sheet.getByRole("button", { name: "접기" });
    if (await collapse.isVisible().catch(() => false)) {
      await collapse.click();
    } else if (await sheet.isVisible()) {
      await sheet.focus();
      await page.keyboard.press("Escape");
    }
    await expect(sheet).toBeHidden();
  }
}

async function expectFocusWorkspace(page: Page) {
  await expect(page.locator(".rm-host-session-workspace")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "호스트 편집 섹션" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "지금 할 일" })).toBeVisible();
}

async function openWorkspacePanel(
  page: Page,
  name: "기본 정보" | "출석" | "기록" | "변경 기록",
) {
  if (name === "기본 정보") {
    const trigger = page.getByRole("button", { name: "모임 정보" });
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await closeWorkspaceSheets(page);
      await trigger.click();
    }
    await expect(page.getByLabel("세션 제목")).toBeVisible();
    return;
  }
  if (name === "변경 기록") {
    const trigger = page.getByRole("button", { name: "변경 내역" }).first();
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await closeWorkspaceSheets(page);
      await trigger.click();
    }
    await expect(page.getByRole("dialog", { name: "변경 내역" })).toBeVisible();
    return;
  }
  await closeWorkspaceSheets(page);
  const progressName = name === "출석" ? /출석/ : /^기록 /;
  await page.getByRole("listitem", { name: progressName }).getByRole("button").click();
  const panelId = name === "출석" ? "workspace-panel-attendance" : "workspace-panel-records";
  const panel = page.locator(`#${panelId}`);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "접기" })).toBeVisible();
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function uniqueViewerEmail(label: string) {
  return `e2e.viewer.hardening.${label}.${Date.now()}@example.com`;
}

function resetHardeningState() {
  cleanupGeneratedSessions();
  runMysql(`
delete from host_session_lifecycle_audit
where club_id = ${sqlString(CLUB_ID)}
  and session_id not in (select id from sessions where club_id = ${sqlString(CLUB_ID)});
`);
  resetSeedGoogleLogins(["host@example.com", "member1@example.com"]);
  if (viewerEmails.length > 0) {
    cleanupViewerGoogleUserFixtures(viewerEmails);
    viewerEmails.length = 0;
  }
}

function nextNumber() {
  nextSessionNumber += 1;
  return nextSessionNumber;
}

function insertSession(options: {
  number?: number;
  bookTitle: string;
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  accessScope?: "HOST_ONLY" | "GUEST_READABLE";
  visibility?: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  meetingUrl?: string | null;
  meetingPasscode?: string | null;
  date?: string;
}): string {
  const sessionId = randomUUID();
  const number = options.number ?? nextNumber();
  const accessScope = options.accessScope ?? "HOST_ONLY";
  const visibility = options.visibility
    ?? (accessScope === "GUEST_READABLE" ? "MEMBER" : "HOST_ONLY");
  const meetingUrl = options.meetingUrl === undefined ? null : options.meetingUrl;
  const meetingPasscode = options.meetingPasscode === undefined ? null : options.meetingPasscode;
  runMysql(`
insert into sessions (
  id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
  session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
  question_deadline_at, state, visibility, access_scope
) values (
  ${sqlString(sessionId)},
  ${sqlString(CLUB_ID)},
  ${number},
  ${sqlString(`${number}회차 모임 · ${options.bookTitle}`)},
  ${sqlString(options.bookTitle)},
  '테스트 저자',
  null, null, null,
  ${sqlString(options.date ?? "2026-06-20")},
  '20:00:00',
  '22:00:00',
  '온라인',
  ${meetingUrl === null ? "null" : sqlString(meetingUrl)},
  ${meetingPasscode === null ? "null" : sqlString(meetingPasscode)},
  timestampadd(day, 14, utc_timestamp(6)),
  ${sqlString(options.state)},
  ${sqlString(visibility)},
  ${sqlString(accessScope)}
);
`);
  return sessionId;
}

function insertRecordDraft(sessionId: string) {
  const snapshot = JSON.stringify({
    schema: "readmates-session-record:v1",
    visibility: "HOST_ONLY",
    publicationSummary: "작성 중인 초안 요약",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { fileName: "", title: "", markdown: "" },
  });
  runMysql(`
insert into session_record_drafts (
  session_id, club_id, base_live_revision, draft_revision, source, snapshot_json, snapshot_sha256,
  updated_by_membership_id
) values (
  ${sqlString(sessionId)},
  ${sqlString(CLUB_ID)},
  0,
  1,
  'MANUAL',
  ${sqlString(snapshot)},
  ${sqlString(sha256Hex(snapshot))},
  ${sqlString(HOST_MEMBERSHIP_ID)}
);
`);
}

function seedRecordRevision(sessionId: string) {
  runMysql(`
insert into session_record_revisions (
  id, session_id, club_id, version, source, snapshot_json, snapshot_sha256, applied_by_membership_id
) values (
  ${sqlString(randomUUID())},
  ${sqlString(sessionId)},
  ${sqlString(CLUB_ID)},
  1,
  'MANUAL',
  '{}',
  ${sqlString("a".repeat(64))},
  ${sqlString(HOST_MEMBERSHIP_ID)}
);
`);
}

function seedSkipNotificationDecision(sessionId: string) {
  const previewId = randomUUID();
  const decisionId = randomUUID();
  runMysql(`
insert into host_action_notification_previews (
  id, club_id, session_id, host_membership_id, action_type, event_type, request_hash,
  expected_live_revision, target_count, expected_in_app_count, expected_email_count,
  excluded_count, expires_at
) values (
  ${sqlString(previewId)},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  ${sqlString(HOST_MEMBERSHIP_ID)},
  'RECORD_APPLY',
  'SESSION_RECORD_UPDATED',
  ${sqlString("d".repeat(64))},
  0, 0, 0, 0, 0,
  timestampadd(hour, 1, utc_timestamp(6))
);

insert into host_action_notification_decisions (
  id, preview_id, club_id, session_id, host_membership_id, action_type, event_type,
  live_revision, decision, target_count, expected_in_app_count, expected_email_count,
  excluded_count
) values (
  ${sqlString(decisionId)},
  ${sqlString(previewId)},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  ${sqlString(HOST_MEMBERSHIP_ID)},
  'RECORD_APPLY',
  'SESSION_RECORD_UPDATED',
  0, 'SKIP', 0, 0, 0, 0
);

update host_action_notification_previews
set consumed_at = utc_timestamp(6), consumed_decision_id = ${sqlString(decisionId)}
where id = ${sqlString(previewId)};
`);
}

function seedSessionOutboxEvent(sessionId: string, suffix: string) {
  const eventId = randomUUID();
  runMysql(`
insert into notification_event_outbox (
  id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_key, dedupe_key
) values (
  ${sqlString(eventId)},
  ${sqlString(CLUB_ID)},
  'SESSION_REMINDER_DUE',
  'SESSION',
  ${sqlString(sessionId)},
  json_object('source', 'e2e-deletion-blocker'),
  ${sqlString(`e2e-deletion-blocker-${suffix}`)},
  ${sqlString(`e2e-deletion-blocker-${suffix}`)}
);
`);
  return eventId;
}

function seedManualDispatch(sessionId: string, eventId: string) {
  runMysql(`
insert into notification_manual_dispatches (
  id, club_id, event_id, session_id, event_type, requested_by_membership_id,
  requested_channels, audience, target_count, expected_in_app_count, expected_email_count,
  resend, send_mode
) values (
  ${sqlString(randomUUID())},
  ${sqlString(CLUB_ID)},
  ${sqlString(eventId)},
  ${sqlString(sessionId)},
  'SESSION_REMINDER_DUE',
  ${sqlString(HOST_MEMBERSHIP_ID)},
  'IN_APP',
  'ALL_ACTIVE_MEMBERS',
  0, 0, 0, false, 'NOW'
);
`);
}

function seedNotificationDelivery(eventId: string, suffix: string) {
  const deliveryId = randomUUID();
  runMysql(`
insert into notification_deliveries (
  id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key
) values (
  ${sqlString(deliveryId)},
  ${sqlString(eventId)},
  ${sqlString(CLUB_ID)},
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  'IN_APP',
  'SENT',
  ${sqlString(`e2e-deletion-blocker-delivery-${suffix}`)}
);
`);
  return deliveryId;
}

function seedMemberNotification(eventId: string, deliveryId: string) {
  runMysql(`
insert into member_notifications (
  id, event_id, delivery_id, club_id, recipient_membership_id, event_type,
  title, body, deep_link_path
) values (
  ${sqlString(randomUUID())},
  ${sqlString(eventId)},
  ${sqlString(deliveryId)},
  ${sqlString(CLUB_ID)},
  ${sqlString(MEMBER_MEMBERSHIP_ID)},
  'SESSION_REMINDER_DUE',
  'Synthetic deletion fixture',
  'Synthetic deletion fixture body',
  '/app/sessions/current'
);
`);
}

function addHostParticipant(sessionId: string) {
  runMysql(`
insert into session_participants (
  id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
) values (
  ${sqlString(randomUUID())},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  ${sqlString(HOST_MEMBERSHIP_ID)},
  'GOING',
  'ATTENDED',
  'ACTIVE'
);
`);
}

function seedLegacyRevisionZero(sessionId: string) {
  const sessionNumber = Number(
    runMysql(`select number from sessions where id = ${sqlString(sessionId)};`)
      .trim()
      .split("\n")
      .at(-1),
  );
  addHostParticipant(sessionId);
  const feedback = `<!-- readmates-feedback:v1 -->

# 독서모임 ${sessionNumber}차 피드백

레거시 적용본 · 2026.06.20

## 메타

- 일시: 2026.06.20 (토) · 20:00
- 책: 레거시 적용본
- 참여자: 김호스트

## 관찰자 노트

공개 안전한 E2E 레거시 기록입니다.

## 참여자별 피드백

### 01. 김호스트

역할: 독서모임 참여자

#### 참여 스타일

공개 안전한 합성 문장입니다.

#### 실질 기여

- 핵심 논점을 공개 안전한 문장으로 정리했습니다.

#### 문제점과 자기모순

##### 1. 적용 범위를 더 구체화할 수 있습니다

- 핵심: 판단 기준을 제시했습니다.
- 근거: 공개 안전한 합성 근거입니다.
- 해석: 다음 대화에서 적용 조건을 덧붙일 수 있습니다.

#### 실천 과제

1. 다음 모임에서 적용 조건을 함께 말합니다.

#### 드러난 한 문장

> 공개 안전한 합성 문장입니다.

맥락: 논의를 정리하던 장면

주석: 실제 회원이나 대화 정보가 아닌 E2E fixture입니다.
`;
  runMysql(`
insert into public_session_publications (
  id, club_id, session_id, public_summary, is_public, visibility, site_visibility
) values (
  ${sqlString(randomUUID())},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  ${sqlString(LEGACY_SUMMARY)},
  false,
  'MEMBER',
  'HIDDEN'
);

insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
values (
  ${sqlString(randomUUID())},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  ${sqlString(HOST_MEMBERSHIP_ID)},
  '레거시 하이라이트',
  0
);

insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
values (
  ${sqlString(randomUUID())},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  ${sqlString(HOST_MEMBERSHIP_ID)},
  '레거시 한줄평',
  'SESSION'
);

insert into session_feedback_documents (
  id, club_id, session_id, version, source_text, document_title, file_name, content_type, file_size
) values (
  ${sqlString(randomUUID())},
  ${sqlString(CLUB_ID)},
  ${sqlString(sessionId)},
  1,
  ${sqlString(feedback)},
  '레거시 피드백',
  'feedback.md',
  'text/markdown',
  ${Buffer.byteLength(feedback, "utf8")}
);
`);
}

function jsonHasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => jsonHasKey(entry, key));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(([entryKey, entryValue]) => (
    entryKey === key || jsonHasKey(entryValue, key)
  ));
}

function expectOmitsConnectionSecretKeys(payload: { body: unknown; text: string }) {
  expect(jsonHasKey(payload.body, "meetingUrl")).toBe(false);
  expect(jsonHasKey(payload.body, "meetingPasscode")).toBe(false);
  expect(payload.text).not.toContain(FIXTURE_PASSCODE);
  expect(payload.text).not.toContain(FIXTURE_MEETING_URL);
}

function telemetryRequestBody(request: Request) {
  return request.postData() ?? request.postDataBuffer()?.toString("utf8") ?? "";
}

function hostOperationTelemetryTypes(payloads: string[]) {
  return payloads.flatMap((payload) => {
    if (!payload.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(payload) as { events?: Array<{ type?: string }> };
      return Array.isArray(parsed.events)
        ? parsed.events.map((event) => event?.type).filter((type): type is string => Boolean(type))
        : [];
    } catch {
      return [];
    }
  });
}

function expectNonVacuousTelemetryWithoutSecrets(payloads: string[]) {
  const bodies = payloads.filter((payload) => payload.trim().length > 0);
  expect(bodies.length).toBeGreaterThan(0);
  const types = hostOperationTelemetryTypes(bodies);
  expect(types.length).toBeGreaterThan(0);
  expect(
    types.some((type) => type === "HOST_SCHEDULE_DEFAULTS" || type === "HOST_OPERATIONS_CARD_LOAD"),
  ).toBe(true);
  const joined = bodies.join("\n");
  expect(joined).not.toContain(FIXTURE_PASSCODE);
  expect(joined).not.toContain("Synthetic deletion fixture body");
  expect(joined).not.toContain("member1@example.com");
}

async function fetchJson(page: Page, url: string, headers?: Record<string, string>) {
  return page.evaluate(async ({ target, extraHeaders }) => {
    const response = await fetch(target, { cache: "no-store", headers: extraHeaders });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Keep the raw text when the payload is not JSON.
    }
    return { status: response.status, body, text };
  }, { target: url, extraHeaders: headers ?? {} });
}

async function openHostSession(page: Page, sessionId: string) {
  await page.goto(`${HOST_PATH}/sessions/${sessionId}`);
  await expectFocusWorkspace(page);
}

async function expectHistoryReason(
  page: Page,
  sessionId: string,
  actionType: string,
  reasonCode: string,
  reasonLabel: string,
) {
  const audit = runMysql(`
select action_type, reason_code
from host_session_lifecycle_audit
where session_id = ${sqlString(sessionId)}
  and action_type = ${sqlString(actionType)};
`);
  expect(audit).toContain(actionType);
  expect(audit).toContain(reasonCode);
  await page.reload();
  await expectFocusWorkspace(page);
  await openWorkspacePanel(page, "변경 기록");
  await expect(page.getByRole("dialog", { name: "변경 내역" })).toContainText(reasonLabel);
}

async function confirmReverse(page: Page, name: string, reasonCode: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("변경 사유").selectOption(reasonCode);
  const response = page.waitForResponse((entry) => {
    const method = entry.request().method();
    return method === "POST"
      && entry.url().includes(`/host/sessions/`)
      && (entry.url().includes("/reopen")
        || entry.url().includes("/unpublish")
        || entry.url().includes("/return-to-draft"));
  });
  await dialog.getByRole("button", { name }).click();
  return response;
}

function collectCreateBodies(page: Page) {
  const bodies: unknown[] = [];
  const listener = (request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/bff/api/host/sessions") {
      bodies.push(JSON.parse(request.postData() ?? "{}"));
    }
  };
  page.on("request", listener);
  return {
    bodies,
    dispose() {
      page.off("request", listener);
    },
  };
}

function collectTelemetryPayloads(page: Page) {
  const payloads: string[] = [];
  const listener = (request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === FRONTEND_OBSERVABILITY_BROWSER_PATH) {
      payloads.push(telemetryRequestBody(request));
    }
  };
  page.on("request", listener);
  return {
    payloads,
    dispose() {
      page.off("request", listener);
    },
  };
}

test.beforeEach(() => {
  resetHardeningState();
});

test.afterEach(() => {
  resetHardeningState();
});

test("each deletion blocker and a preview/delete race fail closed", async ({ page }) => {
  const cases: Array<{ code: string; seed: (sessionId: string) => void }> = [
    { code: "RECORD_REVISION_EXISTS", seed: seedRecordRevision },
    { code: "NOTIFICATION_DECISION_EXISTS", seed: seedSkipNotificationDecision },
    {
      code: "MANUAL_DISPATCH_EXISTS",
      seed: (sessionId) => {
        const eventId = seedSessionOutboxEvent(sessionId, `manual-${sessionId.slice(0, 8)}`);
        seedManualDispatch(sessionId, eventId);
      },
    },
    {
      code: "NOTIFICATION_EVENT_EXISTS",
      seed: (sessionId) => {
        seedSessionOutboxEvent(sessionId, `event-${sessionId.slice(0, 8)}`);
      },
    },
    {
      code: "NOTIFICATION_DELIVERY_EXISTS",
      seed: (sessionId) => {
        const eventId = seedSessionOutboxEvent(sessionId, `delivery-${sessionId.slice(0, 8)}`);
        seedNotificationDelivery(eventId, `delivery-${sessionId.slice(0, 8)}`);
      },
    },
    {
      code: "MEMBER_NOTIFICATION_EXISTS",
      seed: (sessionId) => {
        const suffix = `member-${sessionId.slice(0, 8)}`;
        const eventId = seedSessionOutboxEvent(sessionId, suffix);
        const deliveryId = seedNotificationDelivery(eventId, suffix);
        seedMemberNotification(eventId, deliveryId);
      },
    },
  ];

  await loginWithGoogleFixture(page, "host@example.com");

  for (const blocker of cases) {
    const sessionId = insertSession({
      bookTitle: `삭제 blocker ${blocker.code}`,
      state: "DRAFT",
    });
    blocker.seed(sessionId);
    await openHostSession(page, sessionId);
    await openWorkspacePanel(page, "기본 정보");
    await page.getByRole("button", { name: "세션 삭제" }).click();
    const dialog = page.getByRole("dialog", { name: "이 모임을 목록에서 지울까요?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`${BLOCKER_LABELS[blocker.code]} 1개`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "목록에서 지우기" })).toBeDisabled();
    await expect(dialog.getByText(FIXTURE_PASSCODE)).toHaveCount(0);
    await expect(dialog.getByText("member1@example.com")).toHaveCount(0);
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(dialog).toBeHidden();
  }

  const raceSessionId = insertSession({ bookTitle: "삭제 race", state: "DRAFT" });
  await openHostSession(page, raceSessionId);
  await openWorkspacePanel(page, "기본 정보");
  await page.getByRole("button", { name: "세션 삭제" }).click();
  const raceDialog = page.getByRole("dialog", { name: "이 모임을 목록에서 지울까요?" });
  await expect(raceDialog.getByRole("button", { name: "목록에서 지우기" })).toBeEnabled();
  seedRecordRevision(raceSessionId);
  const blockedDelete = page.waitForResponse((response) => (
    response.request().method() === "DELETE"
    && response.url().includes(`/host/sessions/${raceSessionId}`)
  ));
  await raceDialog.getByRole("button", { name: "목록에서 지우기" }).click();
  const blocked = await blockedDelete;
  expect(blocked.status()).toBe(409);
  const blockedBody = await blocked.json() as { code?: string; blockers?: Array<{ code: string }> };
  expect(blockedBody.code).toBe("SESSION_DELETE_BLOCKED");
  expect(blockedBody.blockers?.some((entry) => entry.code === "RECORD_REVISION_EXISTS")).toBe(true);
  await expect(raceDialog.getByText("적용된 기록 버전 1개")).toBeVisible();
  await expect(raceDialog.getByRole("button", { name: "목록에서 지우기" })).toBeDisabled();
});

test("three reverse transitions record reason and history", async ({ page }) => {
  const openId = insertSession({ bookTitle: "되돌리기 열린 모임", state: "OPEN" });
  const closedId = insertSession({ bookTitle: "되돌리기 마감 모임", state: "CLOSED" });
  const publishedId = insertSession({
    bookTitle: "되돌리기 공개 모임",
    state: "PUBLISHED",
    accessScope: "GUEST_READABLE",
    visibility: "MEMBER",
  });

  await loginWithGoogleFixture(page, "host@example.com");

  await openHostSession(page, openId);
  await page.getByRole("button", { name: "모임 전으로 되돌리기" }).click();
  const returnDialog = page.getByRole("dialog", { name: "모임 전으로 되돌리기" });
  await returnDialog.getByRole("button", { name: "모임 전으로 되돌리기" }).click();
  await expect(returnDialog.getByRole("alert")).toHaveText("사유를 선택해 주세요");
  await expect(returnDialog.getByLabel("변경 사유")).toBeFocused();
  await confirmReverse(page, "모임 전으로 되돌리기", "ACCIDENTAL_TRANSITION");
  await expect(page.locator(".m-toast").filter({ hasText: "모임 전으로 되돌렸습니다." })).toBeVisible();
  await expectHistoryReason(page, openId, "RETURNED_TO_DRAFT", "ACCIDENTAL_TRANSITION", "실수로 상태를 바꿈");

  await openHostSession(page, closedId);
  await page.getByRole("button", { name: "다시 진행 중으로" }).click();
  await confirmReverse(page, "다시 진행 중으로", "MEETING_RESCHEDULED");
  await expectHistoryReason(page, closedId, "REOPENED", "MEETING_RESCHEDULED", "모임 일정이 바뀜");

  await openHostSession(page, publishedId);
  await page.getByRole("button", { name: "공개 취소" }).click();
  await confirmReverse(page, "공개 취소", "CONTENT_CORRECTION");
  await expectHistoryReason(page, publishedId, "UNPUBLISHED", "CONTENT_CORRECTION", "내용을 바로잡기 위함");
});

test("previous online meeting secrets stay out of create until explicit adoption", async ({ page }) => {
  insertSession({
    bookTitle: "이전 온라인 모임",
    state: "CLOSED",
    meetingUrl: FIXTURE_MEETING_URL,
    meetingPasscode: FIXTURE_PASSCODE,
    date: "2026-06-11",
  });

  await loginWithGoogleFixture(page, "host@example.com");
  const creates = collectCreateBodies(page);
  const telemetry = collectTelemetryPayloads(page);
  await page.route(`**${FRONTEND_OBSERVABILITY_BROWSER_PATH}`, async (route) => {
    if (route.request().method() === "POST") {
      telemetry.payloads.push(telemetryRequestBody(route.request()));
    }
    await route.continue();
  });
  try {
    await page.goto(`${HOST_PATH}/sessions/new`);
    await expect(page.getByLabel("세션 제목")).toBeVisible();
    await expect(page.getByRole("button", { name: "이전 온라인 모임 정보 사용" })).toBeVisible();
    await expect(page.getByLabel("미팅 URL")).toHaveValue("");
    await expect(page.getByLabel("Passcode · 선택")).toHaveValue("");
    await expect(page.getByText(FIXTURE_PASSCODE)).toHaveCount(0);
    await expect.poll(() => (
      hostOperationTelemetryTypes(telemetry.payloads).includes("HOST_SCHEDULE_DEFAULTS")
    )).toBe(true);

    await page.getByLabel("세션 제목").fill("명시적 채택 모임");
    await page.getByLabel("책 제목").fill("명시적 채택 책");
    await page.getByLabel("저자").fill("테스트 저자");
    await page.getByLabel("모임 날짜").fill("2026-07-01");
    await page.locator("form#host-session-editor").getByRole("button", { name: "세션 문서 저장" }).click();
    await expect.poll(() => creates.bodies.length).toBe(1);
    expect(creates.bodies).not.toContainEqual(expect.objectContaining({ meetingPasscode: FIXTURE_PASSCODE }));
    expect(JSON.stringify(creates.bodies)).not.toContain(FIXTURE_PASSCODE);
    await expect(page).toHaveURL(/\/app\/host\/sessions\/[0-9a-f-]{36}/i);

    await page.goto(`${HOST_PATH}/sessions/new`);
    await expect(page).toHaveURL(/\/sessions\/new/);
    await expect(page.getByLabel("세션 제목")).toBeVisible();
    await page.getByRole("button", { name: "이전 온라인 모임 정보 사용" }).click();
    await page.getByRole("button", { name: "현재 모임에 적용" }).click();
    await expect(page.getByLabel("Passcode · 선택")).toHaveValue(FIXTURE_PASSCODE);
    await expect(page.getByLabel("미팅 URL")).toHaveValue(FIXTURE_MEETING_URL);

    expectNonVacuousTelemetryWithoutSecrets(telemetry.payloads);
  } finally {
    creates.dispose();
    telemetry.dispose();
    await page.unroute(`**${FRONTEND_OBSERVABILITY_BROWSER_PATH}`);
  }
});

test("home shows top-one attention and operations lists the full set including PUBLISHED", async ({ page }) => {
  const publishedDraft = insertSession({
    bookTitle: "주의 공개 초안",
    state: "PUBLISHED",
    accessScope: "GUEST_READABLE",
    date: "2026-07-04",
  });
  insertRecordDraft(publishedDraft);
  insertSession({
    bookTitle: "주의 공개 미완",
    state: "PUBLISHED",
    accessScope: "GUEST_READABLE",
    date: "2026-07-03",
  });
  const closedDraft = insertSession({
    bookTitle: "주의 마감 초안",
    state: "CLOSED",
    date: "2026-07-02",
  });
  insertRecordDraft(closedDraft);
  insertSession({
    bookTitle: "주의 마감 미완",
    state: "CLOSED",
    date: "2026-07-01",
  });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(HOST_PATH);
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host\/?$/);
  await expect(page.getByText(/확인 필요 \d+건/)).toBeVisible();
  const homeCountText = await page.getByText(/확인 필요 \d+건/).innerText();
  const homeCount = Number((homeCountText.match(/(\d+)/) ?? [])[1]);
  expect(homeCount).toBeGreaterThanOrEqual(4);
  const homeRows = page.getByRole("list", { name: "확인 필요한 세션 기록" }).getByRole("listitem");
  await expect(homeRows).toHaveCount(1);
  await expect(homeRows.first()).toContainText("주의 공개 초안");
  await expect(page.getByRole("link", { name: "모두 보기" })).toBeVisible();

  await page.getByRole("link", { name: "모두 보기" }).click();
  await expect(page).toHaveURL(/\/app\/host\/operations\/?$/);
  await expect(page.getByRole("heading", { name: "운영 허브" })).toBeVisible();
  await expect(page.getByText(`확인 필요 ${homeCount}건`)).toBeVisible();
  const operationsList = page.getByRole("list", { name: "확인 필요한 세션 기록" });
  await expect(operationsList.getByText("주의 공개 초안")).toBeVisible();
  await expect(operationsList.getByText("주의 공개 미완")).toBeVisible();
  await expect(operationsList.getByText("주의 마감 초안")).toBeVisible();
  await expect(operationsList.getByText("주의 마감 미완")).toBeVisible();
});

test.skip("access-scope mutation failure stays on the row and retries locally", async ({ page }) => {
  insertSession({ bookTitle: "접근 범위 현재 모임", state: "OPEN" });
  insertSession({
    bookTitle: "접근 범위 A",
    state: "DRAFT",
    date: "2026-07-11",
    accessScope: "GUEST_READABLE",
    visibility: "MEMBER",
  });
  const draftB = insertSession({
    bookTitle: "접근 범위 B",
    state: "DRAFT",
    date: "2026-07-18",
  });

  await loginWithGoogleFixture(page, "host@example.com");
  let failOnce = true;
  await page.route(`**/api/bff/api/host/sessions/${draftB}/access-scope**`, async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "INTERNAL_ERROR", message: "synthetic access-scope failure" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(HOST_PATH);
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host\/sessions\//);
  await page.getByRole("button", { name: "모임 마치기" }).locator("visible=true").click();
  const closeDialog = page.getByRole("dialog", { name: "모임 마치기" });
  if (await closeDialog.isVisible()) {
    await closeDialog.getByRole("button", { name: "모임 마치기" }).click();
    await expect(page.getByText("기록 정리 중")).toBeVisible();
  }
  await page.goto(HOST_PATH);
  const switchB = page.getByRole("switch", { name: "접근 범위 B 게스트와 멤버에게 보이기" });
  await expect(switchB).toBeVisible();
  await expect(switchB).not.toBeChecked();
  await switchB.click();
  const row = switchB.locator("xpath=ancestor::li");
  await expect(row.getByRole("alert")).toContainText("접근 범위를 저장하지 못했습니다. 기존 값은 유지됩니다.");
  await expect(switchB).not.toBeChecked();
  const retry = row.getByRole("button", { name: "다시 시도" });
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(row.getByRole("alert")).toHaveCount(0);
  await expect(switchB).toBeChecked();
});

test("guest and public DTOs omit connection secrets and GUEST_READABLE is not PUBLIC_RECORD", async ({ page }) => {
  const guestOpenId = insertSession({
    bookTitle: "게스트 공개 현재 모임",
    state: "OPEN",
    accessScope: "GUEST_READABLE",
    visibility: "MEMBER",
    meetingUrl: FIXTURE_MEETING_URL,
    meetingPasscode: FIXTURE_PASSCODE,
  });

  await page.goto("/");
  const guestCurrent = await fetchJson(
    page,
    `/api/bff/api/public/clubs/${CLUB_SLUG}/browse/sessions/current`,
  );
  expect(guestCurrent.status).toBe(200);
  expectOmitsConnectionSecretKeys(guestCurrent);

  const publicClub = await fetchJson(page, `/api/bff/api/public/clubs/${CLUB_SLUG}`);
  expect(publicClub.status).toBe(200);
  expectOmitsConnectionSecretKeys(publicClub);
  expect(JSON.stringify(publicClub.body)).not.toContain(guestOpenId);

  const publicSession = await fetchJson(
    page,
    `/api/bff/api/public/clubs/${CLUB_SLUG}/sessions/${guestOpenId}`,
  );
  expect(publicSession.status).toBe(404);
  expectOmitsConnectionSecretKeys(publicSession);

  const viewerEmail = uniqueViewerEmail("guest-boundary");
  viewerEmails.push(viewerEmail);
  await loginWithGoogleFixture(page, viewerEmail);
  const viewerCurrent = await fetchJson(page, `/api/bff/api/sessions/current?clubSlug=${CLUB_SLUG}`);
  expect(viewerCurrent.status).toBe(200);
  const viewerSession = (viewerCurrent.body as { currentSession?: Record<string, unknown> | null }).currentSession;
  expect(viewerSession).toBeTruthy();
  expect(viewerSession?.meetingUrl).toBe(FIXTURE_MEETING_URL);
  expect(viewerSession?.meetingPasscode).toBe(FIXTURE_PASSCODE);

  await page.context().clearCookies();
  await loginWithGoogleFixture(page, "member1@example.com");
  const memberCurrent = await fetchJson(page, `/api/bff/api/sessions/current?clubSlug=${CLUB_SLUG}`);
  expect(memberCurrent.status).toBe(200);
  const memberSession = (memberCurrent.body as { currentSession?: Record<string, unknown> | null }).currentSession;
  expect(memberSession?.meetingUrl).toBe(FIXTURE_MEETING_URL);
  expect(memberSession?.meetingPasscode).toBe(FIXTURE_PASSCODE);

  await page.context().clearCookies();
  await loginWithGoogleFixture(page, "host@example.com");
  const hostDetail = await fetchJson(
    page,
    `/api/bff/api/host/sessions/${guestOpenId}?clubSlug=${CLUB_SLUG}`,
  );
  expect(hostDetail.status).toBe(200);
  expect((hostDetail.body as { meetingUrl?: string }).meetingUrl).toBe(FIXTURE_MEETING_URL);
  expect((hostDetail.body as { meetingPasscode?: string }).meetingPasscode).toBe(FIXTURE_PASSCODE);
});

test("legacy revision-zero applied summary publishes first revision as 1", async ({ page }) => {
  const sessionId = insertSession({
    bookTitle: "레거시 적용본",
    state: "CLOSED",
    accessScope: "GUEST_READABLE",
    visibility: "MEMBER",
  });
  seedLegacyRevisionZero(sessionId);

  await loginWithGoogleFixture(page, "host@example.com");
  await openHostSession(page, sessionId);
  await openWorkspacePanel(page, "기록");
  await expect(page.getByLabel("멤버에게 보이는 기록").getByText(LEGACY_SUMMARY)).toBeVisible();
  await expect(page.getByRole("button", { name: "기록 공개" }).locator("visible=true")).toBeEnabled();

  await openWorkspacePanel(page, "기록");
  const sourceTabs = page.getByRole("tablist", { name: "초안 만들기" });
  if (await sourceTabs.getByRole("tab", { name: "직접 작성" }).isVisible()) {
    await sourceTabs.getByRole("tab", { name: "직접 작성" }).click();
  }
  const summary = page.getByLabel("공개 요약");
  await expect(summary).toBeVisible({ timeout: 15_000 });
  await summary.fill(`${LEGACY_SUMMARY} · 첫 버전`);
  await expect(page.getByRole("region", { name: "공통 초안 편집기" }).getByRole("status")).toHaveText("저장됨", {
    timeout: 15_000,
  });

  const previewResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes(`/host/sessions/${sessionId}/record-apply-preview`)
    && response.ok()
  ));
  await page.getByRole("button", { name: "반영 전 확인" }).click();
  expect((await previewResponse).ok()).toBe(true);
  const applyDialog = page.getByRole("dialog", { name: "반영 전 확인" });
  await expect(applyDialog).toBeVisible();
  const applyResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes(`/host/sessions/${sessionId}/record-apply`)
    && !new URL(response.url()).pathname.endsWith("/record-apply-preview")
  ));
  await applyDialog.getByRole("button", { name: "멤버에게 반영" }).click();
  const applied = await applyResponse;
  expect(applied.status(), await applied.text()).toBe(200);

  const notifyDialog = page.getByRole("dialog", { name: "알림 보내기" });
  await expect(notifyDialog).toBeVisible();
  await notifyDialog.getByRole("button", { name: "이번에는 보내지 않기" }).click();
  await expect(notifyDialog).toBeHidden();

  const revisionOutput = runMysql(`
select version, source
from session_record_revisions
where session_id = ${sqlString(sessionId)}
order by version;
`);
  const rows = revisionOutput.trim().split("\n").slice(1).filter(Boolean);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatch(/^1\s+MANUAL$/);
  expect(revisionOutput).not.toContain("BASELINE");

  await openWorkspacePanel(page, "변경 기록");
  await expect(page.getByRole("dialog", { name: "변경 내역" }).getByText("버전 1")).toBeVisible();
});

test("reverse request IDs correlate to lifecycle audit without secrets", async ({ page }) => {
  const sessionId = insertSession({ bookTitle: "요청 ID 감사", state: "CLOSED" });
  const requestId = "e2e-hardening-request-1";
  await loginWithGoogleFixture(page, "host@example.com");
  await openHostSession(page, sessionId);
  await page.getByRole("button", { name: "다시 진행 중으로" }).click();
  const dialog = page.getByRole("dialog", { name: "다시 진행 중으로" });
  await dialog.getByLabel("변경 사유").selectOption("OPERATIONAL_RECOVERY");

  const reverse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes(`/host/sessions/${sessionId}/reopen`)
  ));
  await page.route(`**/api/bff/api/host/sessions/${sessionId}/reopen**`, async (route) => {
    const headers = { ...route.request().headers(), "x-readmates-request-id": requestId };
    await route.continue({ headers });
  });
  await dialog.getByRole("button", { name: "다시 진행 중으로" }).click();
  const reverseResponse = await reverse;
  expect(reverseResponse.status()).toBe(200);
  expect((reverseResponse.headers()["x-readmates-request-id"] ?? "")).toBe(requestId);

  const audit = runMysql(`
select request_id, reason_code, reason_note
from host_session_lifecycle_audit
where session_id = ${sqlString(sessionId)}
  and action_type = 'REOPENED';
`);
  expect(audit).toContain(requestId);
  expect(audit).toContain("OPERATIONAL_RECOVERY");
  expect(audit).not.toContain(FIXTURE_PASSCODE);
  expect(audit).not.toContain("member1@example.com");
  expect(readMembershipId("host@example.com")).toBe(HOST_MEMBERSHIP_ID);
});
