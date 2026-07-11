import { expect, test } from "@playwright/test";

import { FRONTEND_OBSERVABILITY_BROWSER_PATH } from "../../shared/observability/frontend-observability-paths";

test("local Vite proxy forwards route telemetry to Spring", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "읽는사이", level: 1 }),
  ).toBeVisible();

  const telemetryResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === FRONTEND_OBSERVABILITY_BROWSER_PATH &&
      response.request().method() === "POST"
    );
  });

  await page
    .getByRole("navigation", { name: "공개 내비게이션" })
    .getByRole("link", { name: "공개 기록" })
    .click();

  await expect(page).toHaveURL(/\/records$/);
  await expect(
    page.getByRole("heading", { name: "공개 기록", level: 1 }),
  ).toBeVisible();

  const response = await telemetryResponse;
  expect(response.status()).toBe(202);

  const body = (await response.json()) as {
    accepted: number;
    dropped: number;
  };
  expect(body.accepted).toBeGreaterThanOrEqual(1);
  expect(body.dropped).toBe(0);
});
