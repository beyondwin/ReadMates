import { expect, test, type Route } from "@playwright/test";
import {
  groundedTranscript,
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("unknown speaker is corrected before a job exists and explicit resubmit starts polling", async ({ page }) => {
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) return route.fallback();
    await json(route, 200, hostSessionDetailResponse(SESSION_ID));
  });

  let startCount = 0;
  let pollCount = 0;
  let recentCount = 0;
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/recent**`, async (route) => {
    recentCount += 1;
    await route.fulfill({ status: 204 });
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs**`, async (route) => {
    if (route.request().method() !== "POST" || route.request().url().match(/\/jobs\/[^/?]+/)) return route.fallback();
    startCount += 1;
    if (startCount === 1) {
      await json(route, 422, {
        type: "about:blank",
        title: "Invalid transcript speaker",
        status: 422,
        code: "TRANSCRIPT_SPEAKER_NOT_MEMBER",
        detail: "대본의 화자 이름을 확인해 주세요.",
        invalidSpeakerLabels: ["확인 필요"],
      });
      return;
    }
    await json(route, 202, { jobId: JOB_ID, status: "PENDING", expiresAt: "2099-01-01T00:00:00Z" });
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`, async (route) => {
    if (route.request().method() === "GET") {
      pollCount += 1;
      await json(route, 200, {
        jobId: JOB_ID, status: "RUNNING", stage: "GENERATING_RECORD", progressPct: 45,
        model: "claude-sonnet-4-6", result: null, error: null, tokens: null,
        costEstimateUsd: "0.01", warnings: [],
      });
      return;
    }
    await route.fallback();
  });

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);
  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(groundedTranscript([{ speaker: "확인 필요", at: "00:00", text: "공개 합성 발언입니다." }])),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();
  await expect(page.getByRole("alert")).toContainText("확인 필요");
  expect(startCount).toBe(1);
  expect(pollCount).toBe(0);
  expect(recentCount).toBe(1);

  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(groundedTranscript([{ speaker: "공개 회원 A", at: "00:00", text: "공개 합성 발언입니다." }])),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();
  await expect(page.getByRole("progressbar")).toBeVisible({ timeout: 15_000 });
  expect(startCount).toBe(2);
  expect(pollCount).toBeGreaterThan(0);
});
