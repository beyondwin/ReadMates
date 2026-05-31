import { expect, test } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  cleanupGeneratedSessions();
  createOpenSessionFixture();
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});

test("host dashboard renders read-only operating-signal card without leaking admin-only signals", async ({ page }) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.route("**/api/bff/api/host/club-operations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "host.club_operations_snapshot.v1",
        generatedAt: "2026-05-31T00:00:00Z",
        club: { clubId: "club-1", slug: "club-one", name: "Club One" },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        sessionProgress: { upcomingCount: 1, currentOpenCount: 1, closedCount: 4, publishedRecordCount: 3, incompleteRecordCount: 1 },
        aiUsage: { activeJobs: 1, failedRecentJobs: 3, staleCandidates: 0, costEstimateUsd: "0.5000", state: "DEGRADED", priorFailedJobs7d: 1 },
      }),
    });
  });

  await page.goto("/app/host");
  await expect(
    page.locator("main.rm-host-dashboard-desktop").getByRole("heading", { name: "모임 운영" }),
  ).toBeVisible();

  const card = page.getByRole("region", { name: "운영 신호" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/READY/)).toBeVisible();
  await expect(card.getByText(/AI 실패/)).toBeVisible();

  await expect(card.getByText("@example.com")).toHaveCount(0);
  await expect(card.getByText("ADMIN_ROUTE")).toHaveCount(0);
});
