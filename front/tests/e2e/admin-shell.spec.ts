import { test, expect } from "@playwright/test";

test.describe("/admin shell", () => {
  test("admin-owner can navigate the full happy path", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("admin-owner@example.com");
    await page.getByRole("button", { name: /dev-login/i }).click();
    await page.waitForURL(/\/app|\/admin/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);
    await expect(page.getByRole("heading", { name: /오늘 할 일/ })).toBeVisible();

    await page.getByRole("link", { name: /클럽/, exact: false }).first().click();
    await expect(page).toHaveURL(/\/admin\/clubs$/);

    await page.getByRole("link", { name: "새 클럽" }).click();
    await expect(page).toHaveURL(/onboarding=1/);
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).not.toHaveURL(/onboarding=1/);
  });

  test("host account is blocked from /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("host@example.com");
    await page.getByRole("button", { name: /dev-login/i }).click();
    await page.waitForURL(/\/app/);

    await page.goto("/admin");
    await expect(page.getByText(/플랫폼 관리 권한이 없습니다/)).toBeVisible();
  });

  test("coming-soon route renders the slice descriptor", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("admin-owner@example.com");
    await page.getByRole("button", { name: /dev-login/i }).click();
    await page.goto("/admin/health");
    await expect(page.getByText(/준비 중 · S2/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Platform Ops Health" })).toBeVisible();
  });
});
