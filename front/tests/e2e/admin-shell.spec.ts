import { test, expect, type Page } from "@playwright/test";

async function loginWithDevShortcut(page: Page, accountName: string | RegExp) {
  await page.goto("/login");
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/bff/api/dev/login") && response.status() === 200,
    ),
    page.getByRole("button", { name: accountName }).click(),
  ]);
  await page.waitForURL(/\/(admin|app|clubs)\b/);
}

test.describe("/admin shell", () => {
  test("admin-owner can navigate the full happy path", async ({ page }) => {
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await page.waitForURL(/\/admin/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);
    await expect(page.getByRole("heading", { name: /오늘 할 일/ })).toBeVisible();

    await page.getByRole("link", { name: "클럽", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/clubs$/);

    await page.getByRole("banner").getByRole("link", { name: "새 클럽" }).click();
    await expect(page).toHaveURL(/onboarding=1/);
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).not.toHaveURL(/onboarding=1/);
  });

  test("host account is returned to the member app from /admin", async ({ page }) => {
    await loginWithDevShortcut(page, /호스트/);
    await page.waitForURL(/\/app/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/clubs\/reading-sai\/app$/);
    await expect(page.getByRole("heading", { name: /호스트님/ })).toBeVisible();
  });

  test("coming-soon route renders the slice descriptor", async ({ page }) => {
    await loginWithDevShortcut(page, "플랫폼 관리자 · OWNER");
    await page.goto("/admin/notifications");
    await expect(page.getByLabel("알림/Outbox 운영").getByText(/준비 중 · S5/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "알림/Outbox 운영" })).toBeVisible();
  });
});
