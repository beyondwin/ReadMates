import { expect, test } from "@playwright/test";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test("host can open manual notification workbench", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/clubs/reading-sai/app/host/notifications");

  await expect(page.getByRole("heading", { name: "새 알림 발송" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 전날 리마인더" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "운영 장부" })).toBeVisible();
});
