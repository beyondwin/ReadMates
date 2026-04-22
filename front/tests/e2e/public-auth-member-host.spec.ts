import { expect, test } from "@playwright/test";
import { installPrintSpy, readPrintCallCount } from "./print-spy";
import { loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";

const seededFeedbackSessionId = "00000000-0000-0000-0000-000000000301";

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
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
