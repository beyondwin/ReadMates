import { expect, test } from "@playwright/test";
import { installPrintSpy, readPrintCallCount } from "./print-spy";
import {
  cleanupGeneratedSessions,
  cleanupViewerGoogleUserFixtures,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const seededFeedbackSessionId = "00000000-0000-0000-0000-000000000301";
const viewerEmails: string[] = [];

test.beforeEach(() => {
  viewerEmails.length = 0;
  cleanupGeneratedSessions();
  createOpenSessionFixture();
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  if (viewerEmails.length > 0) {
    cleanupViewerGoogleUserFixtures(viewerEmails);
  }
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});

test("public to Google fixture login to host smoke flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("세상을 읽는 시간.", { exact: true })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Google로 계속하기" })).toBeVisible();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);

  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/host");
  await expect(
    page.locator("main.rm-host-dashboard-desktop").getByRole("heading", { name: "운영 대시보드" }),
  ).toBeVisible();

  await installPrintSpy(page);
  await page.goto(`/app/feedback/${seededFeedbackSessionId}/print`);
  await expect(page.getByRole("heading", { name: /독서모임 1차 피드백/ })).toBeVisible();
  await expect.poll(() => readPrintCallCount(page)).toBe(1);
});

test("host activates viewer into full member", async ({ page }) => {
  const viewerEmail = `viewer.activate.${Date.now()}@example.com`;
  viewerEmails.push(viewerEmail);

  await loginWithGoogleFixture(page, viewerEmail);
  await page.goto("/");
  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }
  });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/host/members");
  await page.getByRole("tab", { name: "둘러보기 멤버" }).click();

  const viewerRow = page.getByRole("article").filter({ hasText: viewerEmail });
  await expect(viewerRow).toContainText("둘러보기 멤버");

  const activateResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/host/members/") && response.url().includes("/activate") && response.status() === 200,
  );
  await viewerRow.getByRole("button", { name: "정식 멤버로 전환" }).click();
  await activateResponse;

  await expect(page.getByRole("status")).toContainText("정식 멤버로 전환했습니다.");
  await page.getByRole("tab", { name: "활성 멤버" }).click();
  await expect(page.getByRole("article").filter({ hasText: viewerEmail })).toContainText("정식 멤버");

  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }
  });

  await loginWithGoogleFixture(page, viewerEmail);
  await page.goto("/app/session/current");
  await expect(page.getByRole("heading", { name: "E2E 현재 세션 책" })).toBeVisible();
  await expect(page.getByRole("button", { name: "참석" })).toBeEnabled();
  await expect(page.getByText("둘러보기 멤버")).toHaveCount(0);

  const memberState = await page.evaluate(async () => {
    const [authResponse, currentSessionResponse] = await Promise.all([
      fetch("/api/bff/api/auth/me", { cache: "no-store" }),
      fetch("/api/bff/api/sessions/current", { cache: "no-store" }),
    ]);

    return {
      authStatus: authResponse.status,
      auth: await authResponse.json(),
      currentSessionStatus: currentSessionResponse.status,
      currentSession: await currentSessionResponse.json(),
    };
  });
  expect(memberState.authStatus).toBe(200);
  expect(memberState.auth.membershipStatus).toBe("ACTIVE");
  expect(memberState.auth.approvalState).toBe("ACTIVE");
  expect(memberState.currentSessionStatus).toBe(200);
  expect(memberState.currentSession.currentSession?.bookTitle).toBe("E2E 현재 세션 책");
  expect(
    memberState.currentSession.currentSession?.attendees.some(
      (attendee: { membershipId: string }) => attendee.membershipId === memberState.auth.membershipId,
    ),
  ).toBe(true);

  const rsvpResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/sessions/current/rsvp") && response.status() === 200,
  );
  await page.getByRole("button", { name: "참석" }).click();
  await rsvpResponse;
});
