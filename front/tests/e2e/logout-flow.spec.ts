import { expect, test } from "@playwright/test";
import { loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test("my page logout prevents re-entry through the public top navigation", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/me");

  await page.locator(".desktop-only").getByRole("button", { name: "로그아웃" }).click();

  await expect(page).toHaveURL(/\/login$/);
  const authMe = await page.evaluate(async () => {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
    return {
      status: response.status,
      body: (await response.json()) as { authenticated: boolean; approvalState: string },
    };
  });
  expect(authMe.status).toBe(200);
  expect(authMe.body.authenticated).toBe(false);
  expect(authMe.body.approvalState).toBe("ANONYMOUS");
  await expect(page.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "멤버 화면" })).toHaveCount(0);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
