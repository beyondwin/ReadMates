import { expect, test } from "@playwright/test";
import { cleanupGeneratedSessions, loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const invitedEmail = "e2e.invited@example.com";
const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;

function resetSessionFlowState() {
  cleanupGeneratedSessions([invitedEmail]);
  resetSeedGoogleLogins(["host@example.com", "member5@example.com"]);
}

function expectedGoogleInviteHref(inviteUrl: string) {
  const token = new URL(inviteUrl, appOrigin).pathname.split("/").pop() ?? "";
  return `/oauth2/authorization/google?inviteToken=${encodeURIComponent(token)}`;
}

test.beforeEach(() => {
  resetSessionFlowState();
});

test.afterEach(() => {
  resetSessionFlowState();
});

test("host creates session seven and member sees current session", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/host/sessions/new");
  await page.getByLabel("세션 제목").fill("7회차 모임 · 테스트 책");
  await page.getByLabel("책 제목").fill("테스트 책");
  await page.getByLabel("저자").fill("테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "변경 사항 저장" }).click();

  await expect(page).toHaveURL(/\/app\/session\/current/);
  await expect(page.getByRole("heading", { level: 1, name: "테스트 책" })).toBeVisible();
  await expect(page.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", "/app/host");

  await page.getByRole("link", { name: "호스트 화면" }).click();
  await expect(page).toHaveURL(/\/app\/host$/);
  await page.getByRole("link", { name: "멤버 화면으로" }).first().click();
  await expect(page).toHaveURL(/\/app$/);

  await loginWithGoogleFixture(page, "member5@example.com");
  await page.goto("/app/session/current");
  await expect(page.getByRole("heading", { level: 1, name: "테스트 책" })).toBeVisible();
  const rsvpResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/sessions/current/rsvp") && response.status() === 200,
  );
  await page.getByRole("button", { name: "참석" }).click();
  await rsvpResponse;
});

test("host invites a new member and invite page uses Google acceptance", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/host/sessions/new");
  await page.getByLabel("세션 제목").fill("7회차 모임 · 초대 테스트 책");
  await page.getByLabel("책 제목").fill("초대 테스트 책");
  await page.getByLabel("저자").fill("초대 테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "변경 사항 저장" }).click();
  await expect(page).toHaveURL(/\/app\/session\/current/);

  await page.goto("/app/host/invitations");
  await page.getByLabel("이름").fill("초대테스트");
  await page.getByLabel("초대 이메일").fill(invitedEmail);
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const inviteUrl = await page.getByLabel("생성된 초대 링크").inputValue();

  await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }
  });

  await page.goto(inviteUrl);
  await expect(page.getByText("초대테스트")).toBeVisible();
  await expect(page.getByText(invitedEmail, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
    "href",
    expectedGoogleInviteHref(inviteUrl),
  );
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("비밀번호 확인", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초대 수락" })).toHaveCount(0);

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/host/invitations");
  await expect(page.getByText("초대테스트")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeVisible();
  await expect(page.getByText("대기 · 만료").first()).toBeVisible();
});
