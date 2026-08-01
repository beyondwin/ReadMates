import { expect, test } from "@playwright/test";

const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;
const memberReturnTo = "/clubs/reading-sai/app/sessions/current";

test("failed Google login offers explicit account selection", async ({ page }) => {
  await page.goto(
    `/login?error=membership-left&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  await expect(page.getByRole("alert")).toContainText("이전 멤버십이 종료된 계정입니다");
  await expect(page.getByRole("link", { name: "다른 Google 계정으로 로그인" })).toHaveAttribute(
    "href",
    `/oauth2/authorization/google?returnTo=${encodeURIComponent(memberReturnTo)}&chooseAccount=true`,
  );
});

test("KakaoTalk browser receives copy-first recovery without horizontal overflow", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
    viewport: { width: 320, height: 720 },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appOrigin });
  const page = await context.newPage();
  await page.goto(
    `${appOrigin}/login?error=google&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  await expect(page.getByRole("heading", { name: "외부 브라우저에서 로그인해 주세요" })).toBeVisible();
  const copyButton = page.getByRole("button", { name: "로그인 주소 복사" });
  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  await copyButton.click();
  await expect(page.getByRole("status")).toContainText("로그인 주소를 복사했습니다");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${appOrigin}/login?error=google&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await context.close();
});
