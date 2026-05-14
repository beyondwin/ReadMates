import { expect, test } from "@playwright/test";
import {
  countManualNotificationEventsForSession,
  createFeedbackDocumentFixture,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  materializeManualReminderInAppNotifications,
  resetE2eState,
} from "./readmates-e2e-db";

function resetManualNotificationState() {
  resetE2eState({
    cleanupManualNotifications: true,
    cleanupGeneratedSessions: true,
    googleLoginEmails: ["host@example.com", "member1@example.com"],
  });
}

test.beforeEach(resetManualNotificationState);

test.afterEach(resetManualNotificationState);

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
  await expect(page.locator("strong").filter({ hasText: "E2E 현재 세션 책" })).toBeVisible();

  await page.getByRole("button", { name: "모임 전날 리마인더" }).click();
  await page.getByRole("button", { name: "미리보기" }).click();

  await expect(page.getByRole("heading", { name: "발송 전 확인" })).toBeVisible();
  await expect(page.getByText(/최종 대상/)).toBeVisible();
});

test("host can change the selected session before previewing a manual reminder", async ({ page }) => {
  createOpenSessionFixture({ number: 7, bookTitle: "E2E 첫 세션 책" });
  const secondSessionId = createOpenSessionFixture({ number: 8, bookTitle: "E2E 두 번째 세션 책" });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app/host/notifications");

  await page.getByLabel("세션 선택").selectOption(secondSessionId);
  await expect(page.locator("strong").filter({ hasText: "E2E 두 번째 세션 책" })).toBeVisible();

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

test("manual confirm retry does not create a duplicate dispatch", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/reading-sai/app/host/notifications?sessionId=${sessionId}&eventType=SESSION_REMINDER_DUE`);

  const selection = {
    sessionId,
    eventType: "SESSION_REMINDER_DUE",
    audience: "ALL_ACTIVE_MEMBERS",
    requestedChannels: "BOTH",
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
  expect(countManualNotificationEventsForSession(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
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
