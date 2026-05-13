import { expect, test } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  cleanupManualNotificationArtifacts,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  materializeManualReminderInAppNotifications,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.beforeEach(() => {
  cleanupManualNotificationArtifacts();
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com", "member1@example.com"]);
});

test.afterEach(() => {
  cleanupManualNotificationArtifacts();
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com", "member1@example.com"]);
});

test("host can open manual notification workbench", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/clubs/reading-sai/app/host/notifications");

  await expect(page.getByRole("heading", { name: "새 알림 발송" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 전날 리마인더" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "운영 장부" })).toBeVisible();
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
