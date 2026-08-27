import { expect, test } from "@playwright/test";
import {
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetE2eState,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const invitedEmail = "e2e.google.invited@example.com";
const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;

function cleanupGoogleInviteFlowState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    invitedEmails: [invitedEmail],
    googleLoginEmails: ["host@example.com"],
  });
}

function inviteTokenFromUrl(inviteUrl: string) {
  return new URL(inviteUrl, appOrigin).pathname.split("/").pop() ?? "";
}

function expectedGoogleInviteHref(inviteUrl: string) {
  const url = new URL(inviteUrl, appOrigin);
  const token = inviteTokenFromUrl(inviteUrl);
  return `/oauth2/authorization/google?inviteToken=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(url.pathname)}`;
}

test.beforeEach(() => {
  cleanupGoogleInviteFlowState();
  createOpenSessionFixture();
});

test.afterEach(() => {
  cleanupGoogleInviteFlowState();
});

test("host creates invite and member is directed to Google acceptance", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: appOrigin,
  });
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/host/invitations");
  await expect(page).toHaveURL(/\/app\/host\/members\/?$/);
  await expect(page.getByRole("region", { name: "초대" })).toBeVisible();
  await expect(page.getByLabel("수락하면 이번 모임에도 추가")).toBeChecked();
  await page.getByLabel("이름").fill("테스트멤버");
  await page.getByLabel("초대 이메일").fill(invitedEmail);
  const createResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && /\/api\/bff\/api\/host\/invitations\/?$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "초대 보내기" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBe(true);
  const created = await createResponse.json() as { acceptUrl?: string | null };
  expect(created.acceptUrl).toBeTruthy();
  const inviteUrl = created.acceptUrl!;
  await expect(page.getByRole("status")).toContainText("초대를 보냈습니다.");

  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }
  });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/login?returnTo=https%3A%2F%2Fexternal.example%2Fescape");
  await expect(page.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google",
  );

  await page.goto(inviteUrl);
  await expect(page.getByText("테스트멤버").first()).toBeVisible();
  await expect(page.getByText(invitedEmail, { exact: true })).toBeVisible();
  await expect(page.getByText("초대 대상 Gmail 계정과 이름을 확인한 뒤 같은 Google 계정으로 수락해 주세요.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
    "href",
    expectedGoogleInviteHref(inviteUrl),
  );
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("비밀번호 확인", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초대 수락" })).toHaveCount(0);

  await loginWithGoogleFixture(page, invitedEmail, { inviteToken: inviteTokenFromUrl(inviteUrl) });
  await page.goto("/app/session/current");
  await expect(page.getByRole("button", { name: "참석" })).toBeEnabled();
  await expect(page.getByText("둘러보기 멤버")).toHaveCount(0);

  const authMe = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
    return response.json() as Promise<{ membershipStatus: string; approvalState: string }>;
  });
  expect(authMe.membershipStatus).toBe("ACTIVE");
  expect(authMe.approvalState).toBe("ACTIVE");
});
