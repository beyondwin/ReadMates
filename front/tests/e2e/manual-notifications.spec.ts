import { expect, test } from "@playwright/test";
import {
  clubReminderPolicy,
  cleanupSecondClubFixture,
  createFeedbackDocumentFixture,
  createOpenSessionFixture,
  ensureSecondClubFixture,
  expireManualNotificationPreview,
  hostActionDecisionCount,
  loginWithGoogleFixture,
  manualDispatchCount,
  materializeManualReminderInAppNotifications,
  notificationEventCount,
  readMembershipId,
  resetE2eState,
  sessionRecordApplyReceiptCount,
  setMembershipStatus,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_ID = "00000000-0000-0000-0000-000000000001";
const CLUB_SLUG = "reading-sai";

function resetManualNotificationState() {
  cleanupSecondClubFixture();
  setMembershipStatus("member1@example.com", "ACTIVE");
  resetE2eState({
    cleanupManualNotifications: true,
    cleanupGeneratedSessions: true,
    cleanupNotificationPolicy: true,
    googleLoginEmails: ["host@example.com", "member1@example.com"],
  });
}

test.beforeEach(resetManualNotificationState);

test.afterEach(resetManualNotificationState);

type ManualOptions = {
  templates: Array<{
    eventType: string;
    contentRevision: string;
    defaultAudience: string;
    defaultChannels: string;
  }>;
  members: {
    items: Array<{ membershipId: string; displayName: string }>;
  };
};

type ManualSelection = {
  sessionId: string;
  eventType: string;
  contentRevision: string;
  audience: string;
  requestedChannels: string;
  selectedMembershipIds: string[];
  excludedMembershipIds: string[];
  includedMembershipIds: string[];
  sendMode: string;
};

async function readManualOptions(
  page: import("@playwright/test").Page,
  sessionId: string,
): Promise<ManualOptions> {
  return page.evaluate(async ({ id, clubSlug }) => {
    const response = await fetch(
      `/api/bff/api/host/notifications/manual/options?clubSlug=${encodeURIComponent(clubSlug)}&sessionId=${encodeURIComponent(id)}`,
    );
    if (!response.ok) {
      throw new Error(`manual options failed: ${response.status}`);
    }
    return response.json();
  }, { id: sessionId, clubSlug: CLUB_SLUG });
}

async function postJson(
  page: import("@playwright/test").Page,
  path: string,
  body: unknown,
) {
  return page.evaluate(async ({ requestPath, requestBody }) => {
    const response = await fetch(requestPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }, { requestPath: path, requestBody: body });
}

function manualEndpoint(suffix = "") {
  return `/api/bff/api/host/notifications/manual${suffix}?clubSlug=${CLUB_SLUG}`;
}

test("host can open manual notification workbench", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/clubs/reading-sai/app/host/notifications");

  await expect(page.getByRole("heading", { name: "새 알림 발송" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 전날 리마인더" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "운영 장부" })).toBeVisible();
});

test("host can preview a manual reminder from the notifications tab without typing a session id", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app/host/notifications");

  await expect(page.getByLabel("세션 선택")).toBeVisible();
  await expect(page.getByLabel("세션 선택")).toHaveValue(sessionId);
  await expect(page.getByText("E2E 현재 세션 책 · OPEN · HOST_ONLY", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "모임 전날 리마인더" }).click();
  await page.getByRole("button", { name: "미리보기" }).click();

  await expect(page.getByRole("heading", { name: "발송 전 확인" })).toBeVisible();
  await expect(page.getByText(/최종 대상/)).toBeVisible();
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(hostActionDecisionCount(sessionId)).toBe(0);
});

test("host can change the selected session before previewing a manual reminder", async ({ page }) => {
  createOpenSessionFixture({ number: 7, bookTitle: "E2E 첫 세션 책" });
  const secondSessionId = createOpenSessionFixture({ number: 8, bookTitle: "E2E 두 번째 세션 책" });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app/host/notifications");

  await page.getByLabel("세션 선택").selectOption(secondSessionId);
  await expect(page.getByText("E2E 두 번째 세션 책 · OPEN · HOST_ONLY", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "모임 전날 리마인더" }).click();
  await page.getByRole("button", { name: "미리보기" }).click();

  await expect(page.getByRole("heading", { name: "발송 전 확인" })).toBeVisible();
});

test("host previews and confirms a manual reminder, then duplicate requires resend confirmation", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/notifications?sessionId=${sessionId}&eventType=SESSION_REMINDER_DUE`);
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByRole("heading", { name: "발송 전 확인" })).toBeVisible();
  await expect(page.getByText(/최종 대상/)).toBeVisible();

  await page.getByRole("button", { name: "발송 확인" }).click();
  await expect(page.getByText("수동 알림 발송을 요청했습니다.")).toBeVisible();
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
  expect(hostActionDecisionCount(sessionId)).toBe(0);
  await expect(page.getByRole("heading", { name: "최근 수동 발송" })).toBeVisible();
  await expect(page.getByText("모임 전날 리마인더").first()).toBeVisible();
  await page.getByRole("button", { name: "대기/실패 처리" }).click();
  await expect(page.getByText("대기/실패 알림 처리를 요청했습니다.")).toBeVisible();
  materializeManualReminderInAppNotifications();

  await loginWithGoogleFixture(page, "member1@example.com");
  await page.goto("/clubs/reading-sai/app/notifications");
  await expect(page.getByText("모임 전날")).toBeVisible();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/notifications?sessionId=${sessionId}&eventType=SESSION_REMINDER_DUE`);
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByText("이미 발송된 알림입니다.")).toBeVisible();
});

test("default audience and channel are explicit and reminder policy requires opt in", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/notifications?sessionId=${sessionId}`);

  const options = await readManualOptions(page, sessionId);
  const reminder = options.templates.find((template) => template.eventType === "SESSION_REMINDER_DUE");
  expect(reminder).toMatchObject({
    defaultAudience: "ALL_ACTIVE_MEMBERS",
    defaultChannels: "BOTH",
  });
  expect(clubReminderPolicy(CLUB_ID)).toBeNull();

  const policyToggle = page.getByRole("checkbox", { name: "모임 전날 자동 리마인더" });
  await expect(policyToggle).toBeEnabled();
  await expect(policyToggle).not.toBeChecked();
  const policyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT"
      && response.url().includes("/host/notifications/policy"),
  );
  await policyToggle.click();
  const updatedPolicy = await policyResponse;
  expect(updatedPolicy.status(), await updatedPolicy.text()).toBe(200);
  await expect(policyToggle).toBeChecked();
  await expect.poll(() => clubReminderPolicy(CLUB_ID)).toBe(true);
});

test("selected members must be unique, active, same-club, and non-empty", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/notifications?sessionId=${sessionId}`);

  const options = await readManualOptions(page, sessionId);
  const reminder = options.templates.find((template) => template.eventType === "SESSION_REMINDER_DUE");
  const selectedMembershipId = options.members.items.find(
    (member) => member.displayName.includes("멤버1"),
  )?.membershipId;
  expect(reminder?.contentRevision).toMatch(/^[0-9a-f]{64}$/);
  expect(selectedMembershipId).toBeTruthy();

  const selection: ManualSelection = {
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
    contentRevision: reminder!.contentRevision,
    audience: "SELECTED_MEMBERS",
    requestedChannels: "IN_APP",
    selectedMembershipIds: [selectedMembershipId!],
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  };
  const empty = await postJson(page, manualEndpoint("/preview"), {
    ...selection,
    selectedMembershipIds: [],
  });
  const duplicate = await postJson(page, manualEndpoint("/preview"), {
    ...selection,
    selectedMembershipIds: [selectedMembershipId!, selectedMembershipId!],
  });

  setMembershipStatus("member1@example.com", "INACTIVE");
  const inactive = await postJson(page, manualEndpoint("/preview"), selection);
  setMembershipStatus("member1@example.com", "ACTIVE");

  ensureSecondClubFixture();
  const foreignMembershipId = readMembershipId("host@example.com", "sample-book-club");
  const foreign = await postJson(page, manualEndpoint("/preview"), {
    ...selection,
    selectedMembershipIds: [foreignMembershipId],
  });

  expect(empty.status).toBe(403);
  expect(duplicate.status).toBe(403);
  expect(inactive.status).toBe(403);
  expect(foreign.status).toBe(403);
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
});

test("stale and expired previews never create dispatch, outbox, or legacy decision rows", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/notifications?sessionId=${sessionId}`);
  const options = await readManualOptions(page, sessionId);
  const contentRevision = options.templates.find(
    (template) => template.eventType === "SESSION_REMINDER_DUE",
  )!.contentRevision;
  const selection: ManualSelection = {
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
    contentRevision,
    audience: "ALL_ACTIVE_MEMBERS",
    requestedChannels: "BOTH",
    selectedMembershipIds: [],
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  };

  const stale = await postJson(page, manualEndpoint("/preview"), {
    ...selection,
    contentRevision: "f".repeat(64),
  });
  expect(stale.status).toBe(409);

  const preview = await postJson(page, manualEndpoint("/preview"), selection);
  expect(preview.status).toBe(200);
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expireManualNotificationPreview(preview.body.previewId);
  const expired = await postJson(page, manualEndpoint(), {
    ...selection,
    previewId: preview.body.previewId,
    resendConfirmed: false,
  });

  expect(expired.status).toBe(409);
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(hostActionDecisionCount(sessionId)).toBe(0);
  expect(sessionRecordApplyReceiptCount(sessionId)).toBe(0);
});

test("selected-member confirm retry returns the same event without duplicate dispatch", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/notifications?sessionId=${sessionId}&eventType=SESSION_REMINDER_DUE`);
  const options = await readManualOptions(page, sessionId);
  const reminder = options.templates.find((template) => template.eventType === "SESSION_REMINDER_DUE")!;
  const selectedMembershipId = options.members.items.find(
    (member) => member.displayName.includes("멤버1"),
  )!.membershipId;

  const selection = {
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
    contentRevision: reminder.contentRevision,
    audience: "SELECTED_MEMBERS",
    requestedChannels: "IN_APP",
    selectedMembershipIds: [selectedMembershipId],
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  };
  const preview = await page.evaluate(async (request) => {
    const response = await fetch("/api/bff/api/host/notifications/manual/preview?clubSlug=reading-sai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return {
      status: response.status,
      body: await response.json() as { previewId: string },
    };
  }, selection);
  expect(preview.status).toBe(200);

  const firstStatus = await page.evaluate(async (request) => {
    const response = await fetch("/api/bff/api/host/notifications/manual?clubSlug=reading-sai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.status;
  }, { ...selection, previewId: preview.body.previewId, resendConfirmed: false });
  const retryStatus = await page.evaluate(async (request) => {
    const response = await fetch("/api/bff/api/host/notifications/manual?clubSlug=reading-sai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.status;
  }, { ...selection, previewId: preview.body.previewId, resendConfirmed: false });

  expect(firstStatus).toBe(200);
  expect(retryStatus).toBe(200);
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE", reminder.contentRevision)).toBe(1);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
  expect(hostActionDecisionCount(sessionId)).toBe(0);
});

test("resend requires an explicit confirmation and creates one separate event", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/notifications?sessionId=${sessionId}`);
  const options = await readManualOptions(page, sessionId);
  const contentRevision = options.templates.find(
    (template) => template.eventType === "SESSION_REMINDER_DUE",
  )!.contentRevision;
  const selection: ManualSelection = {
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
    contentRevision,
    audience: "ALL_ACTIVE_MEMBERS",
    requestedChannels: "BOTH",
    selectedMembershipIds: [],
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  };

  const firstPreview = await postJson(page, manualEndpoint("/preview"), selection);
  const firstConfirm = await postJson(page, manualEndpoint(), {
    ...selection,
    previewId: firstPreview.body.previewId,
    resendConfirmed: false,
  });
  expect(firstConfirm.status).toBe(200);

  const resendPreview = await postJson(page, manualEndpoint("/preview"), selection);
  expect(resendPreview.body.duplicates.requiresResendConfirmation).toBe(true);
  const rejected = await postJson(page, manualEndpoint(), {
    ...selection,
    previewId: resendPreview.body.previewId,
    resendConfirmed: false,
  });
  expect(rejected.status).toBe(409);
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE", contentRevision)).toBe(1);

  const resendRequest = {
    ...selection,
    previewId: resendPreview.body.previewId,
    resendConfirmed: true,
  };
  const resent = await postJson(page, manualEndpoint(), resendRequest);
  const retry = await postJson(page, manualEndpoint(), resendRequest);
  expect(resent.status).toBe(200);
  expect(retry.status).toBe(200);
  expect(retry.body.eventId).toBe(resent.body.eventId);
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE", contentRevision)).toBe(2);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(2);
});

test("session editor disables manual templates that do not match automatic predicates", async ({ page }) => {
  const openSessionId = createOpenSessionFixture({ number: 9, bookTitle: "E2E 열림 세션 책" });
  const feedbackSessionId = createOpenSessionFixture({ number: 10, bookTitle: "E2E 문서 세션 책" });
  createFeedbackDocumentFixture(feedbackSessionId);

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/sessions/${openSessionId}/edit`);
  await expect(page.getByRole("button", { name: /다음 책 공개/ })).toBeDisabled();

  await page.goto(`/clubs/reading-sai/app/host/sessions/${feedbackSessionId}/edit`);
  await expect(page.getByRole("button", { name: /피드백 문서 등록/ })).toBeDisabled();
});
