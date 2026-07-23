import { expect, test, type Route } from "@playwright/test";
import {
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
  trackNotificationMutationRequests,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("receipt-backed COMMIT_RETRY converges to COMMITTED without exposing content", async ({ page }) => {
  const notificationMutations = trackNotificationMutationRequests(page);
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) return route.fallback();
    await json(route, 200, hostSessionDetailResponse(SESSION_ID));
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/recent**`, async (route) => {
    await json(route, 200, {
      jobId: JOB_ID, status: "COMMIT_RETRY", stage: "READY", progressPct: 100,
      model: "claude-sonnet-4-6", error: null, costEstimateUsd: "0.12",
      createdAt: "2026-07-14T00:00:00Z", lastUpdatedAt: "2026-07-14T00:01:00Z",
      expiresAt: "2099-01-01T00:00:00Z", availableActions: ["COMMIT_RETRY"],
    });
  });
  let polls = 0;
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    polls += 1;
    const status = polls === 1 ? "COMMIT_RETRY" : "COMMITTED";
    await json(route, 200, {
      jobId: JOB_ID, status, stage: "READY", progressPct: 100,
      model: "claude-sonnet-4-6", result: null, evidence: null, error: null,
      tokens: null, costEstimateUsd: "0.12", warnings: [], revision: 2,
    });
  });

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);
  await expect(page.getByText("COMMIT_RETRY")).toBeVisible();
  await page.getByRole("button", { name: "Commit 재시도" }).click();
  await expect(page.getByText("커밋 확인 중")).toBeVisible();
  await expect(page.getByText(/AI 기록을 공유 초안으로 저장했습니다/)).toBeVisible({ timeout: 10_000 });
  expect(polls).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/공개 합성|대본|근거 발언/)).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toHaveCount(0);
  expect(notificationMutations()).toEqual([]);
});
