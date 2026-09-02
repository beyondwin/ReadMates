import { expect, test } from "@playwright/test";
import {
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetE2eState,
  runMysql,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const invitedEmail = "e2e.google.invited@example.com";
const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;

function cleanupGoogleInviteFlowState() {
  runMysql(`
delete from host_invitation_link_events where link_id in (select id from host_invitation_links where name = 'E2E named link');
delete from host_invitation_links where name = 'E2E named link';
`);
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

test("named link stays redacted and is consumed through the isolated Google fixture", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appOrigin });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app/host/settings");
  await expect(page.getByRole("heading", { name: "초대와 설정" })).toBeVisible();
  await page.getByRole("button", { name: "새 초대 링크" }).click();
  await page.getByLabel("링크 이름").fill("E2E named link");
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const copy = page.getByRole("button", { name: "한 번만 복사" });
  await expect(copy).toBeVisible();
  await copy.click();
  const inviteUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toMatch(/^\/clubs\/reading-sai\/invite\/lnk_[A-Za-z0-9_-]+$/);
  await expect(page.getByText(/이 화면에서는 링크를 다시 표시하지 않습니다/)).toBeVisible();

  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error(`Logout failed: ${response.status}`);
  });
  await page.goto(inviteUrl);
  await expect(page.getByText("링크를 받은 Google 계정", { exact: true })).toBeVisible();
  await expect(page.getByText(/MEMBER 권한으로만/)).toBeVisible();
  await expect(page.getByText("초대 대상")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(inviteTokenFromUrl(inviteUrl));
  await expect(page.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute("href", expectedGoogleInviteHref(inviteUrl));

  await loginWithGoogleFixture(page, invitedEmail, { inviteToken: inviteTokenFromUrl(inviteUrl) });
  const authMe = await page.evaluate(async () => (await fetch("/api/bff/api/auth/me", { cache: "no-store" })).json() as Promise<{ role: string; membershipStatus: string }>);
  expect(authMe.role).toBe("MEMBER");
  expect(authMe.membershipStatus).toBe("ACTIVE");
  expect(runMysql("select used_count from host_invitation_links where name = 'E2E named link';")).toContain("1");
});

test.afterEach(() => {
  cleanupGoogleInviteFlowState();
});

test("legacy invitation entry replaces to canonical named-link settings", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/host/invitations");
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host\/settings#invitations$/);
  await expect(page.getByRole("heading", { name: "초대와 설정" })).toBeVisible();
  await expect(page.getByRole("region", { name: "초대 링크" })).toBeVisible();
  await page.getByRole("button", { name: "새 초대 링크" }).click();
  await expect(page.getByLabel("링크 이름")).toBeVisible();
});
