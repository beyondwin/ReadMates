import { expect, test } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  cleanupViewerGoogleUserFixtures,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const seededFeedbackSessionId = "00000000-0000-0000-0000-000000000301";
const viewerEmails: string[] = [];

test.describe.configure({ mode: "serial" });

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

test("bare login member action issues a reading-sai join intent before OAuth", async ({ page }) => {
  let issuedIntentRequests = 0;
  let issuedIntentBody: unknown;
  let oauthStartUrl = "";
  await page.route("**/api/bff/api/auth/oauth/join-intent", async (route) => {
    issuedIntentRequests += 1;
    issuedIntentBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intent: "bare-login-intent-00000000000000000000",
        expiresAt: "2026-08-03T12:00:00Z",
      }),
    });
  });
  await page.route("**/oauth2/authorization/google**", async (route) => {
    oauthStartUrl = route.request().url();
    await route.fulfill({ status: 204 });
  });

  await page.goto("/login");
  await page.getByRole("link", { name: "멤버로 시작" }).click();

  await expect.poll(() => issuedIntentRequests).toBe(1);
  expect(issuedIntentBody).toEqual({
    clubSlug: "reading-sai",
    returnTo: "/clubs/reading-sai/app",
  });
  await expect.poll(() => oauthStartUrl).toContain("/oauth2/authorization/google");
  const oauthStart = new URL(oauthStartUrl);
  expect(oauthStart.searchParams.get("returnTo")).toBe("/clubs/reading-sai/app");
  expect(oauthStart.searchParams.get("joinClub")).toBe("reading-sai");
  expect(oauthStart.searchParams.get("joinIntent")).toBe("bare-login-intent-00000000000000000000");
});

test("public to Google fixture login to host smoke flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "읽는사이", level: 1 })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("link", { name: "둘러보기" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app",
  );
  await expect(page.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
  );
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);

  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/host");
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/clubs\/reading-sai\/app\/host(\/sessions\/[^/]+)?$/);
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
  await expect(page.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(page.locator("[data-app-route-security-controller]")).toHaveCount(1);
  await expect(page.locator('[data-global-space-switcher]')).toHaveCount(0);
  await expect(page.getByText("현재 공간 내 클럽, 읽는사이 호스트로 운영", { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole("navigation", { name: "호스트 유틸리티" }).getByRole("link", { name: "멤버 시야" }),
  ).toHaveAttribute("href", "/clubs/reading-sai/app");
  await expect(page.getByRole("complementary", { name: "클럽 작업함" })).toBeVisible();

  await page.goto(`/app/feedback/${seededFeedbackSessionId}/print`);
  await expect(page.getByRole("heading", { name: /독서모임 1차 피드백/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "인쇄" })).toHaveCount(0);
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

  const pendingZone = page.getByRole("region", { name: "가입 승인 대기" });
  const displayName = viewerEmail.split("@")[0] ?? viewerEmail;
  const viewerRow = pendingZone.getByRole("article").filter({ hasText: displayName });
  await expect(viewerRow).toContainText("둘러보기 멤버");

  const activateResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/host/members/") && response.url().includes("/activate") && response.status() === 200,
  );
  await viewerRow.getByRole("button", { name: "승인" }).click();
  await activateResponse;

  await expect(page.getByRole("status")).toContainText("정식 멤버로 전환했습니다.");
  await expect(page.getByRole("region", { name: "가입 승인 대기" })).toHaveCount(0);
  await page.getByRole("tab", { name: "활성 멤버" }).click();
  await expect(page.getByRole("row").filter({ hasText: displayName })).toContainText("활동");

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
  ).toBe(false);
});
