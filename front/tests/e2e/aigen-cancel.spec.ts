/**
 * E2E: cancel-in-progress flow (task_3_6 step 2 scenario 3).
 *
 * User in GENERATING phase clicks "취소" → DELETE returns 204 → next poll
 * lands CANCELLED → UI returns to IDLE with the upload form, and the
 * localStorage draft for the cancelled jobId is gone.
 */

import { expect, test, type Route } from "@playwright/test";
import type {
  AiGenerationJobResponse,
  ClubAiDefaultResponse,
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import { groundedTranscript, hostSessionDetailResponse, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

function startBody(): StartGenerationResponse {
  return { jobId: JOB_ID, status: "PENDING", expiresAt: "2099-01-01T00:00:00Z" };
}

function runningJob(): AiGenerationJobResponse {
  return {
    jobId: JOB_ID,
    status: "RUNNING",
    stage: "GENERATING_HIGHLIGHTS",
    progressPct: 40,
    model: "claude-sonnet-4-6",
    result: null,
    error: null,
    tokens: null,
    costEstimateUsd: "0.04",
    warnings: [],
  };
}

function cancelledJob(): AiGenerationJobResponse {
  return {
    jobId: JOB_ID,
    status: "CANCELLED",
    stage: null,
    progressPct: 40,
    model: "claude-sonnet-4-6",
    result: null,
    error: null,
    tokens: null,
    costEstimateUsd: "0.04",
    warnings: [],
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("cancel during GENERATING returns the editor to IDLE and clears the draft", async ({ page }) => {
  await routeHostEditorShell(page, CLUB_SLUG);

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (route.request().url().includes("/ai-generate")) {
      await route.fallback();
      return;
    }
    await json(route, 200, hostSessionDetailResponse(SESSION_ID));
  });

  await page.route(
    `**/api/bff/api/host/clubs/${CLUB_SLUG}/ai-defaults**`,
    async (route) => {
      await json(route, 200, clubDefault());
    },
  );

  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs**`,
    async (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        !request.url().includes("/regenerate") &&
        !request.url().match(/\/jobs\/[^/?]+/)
      ) {
        await json(route, 202, startBody());
        return;
      }
      await route.fallback();
    },
  );

  let cancelInvocations = 0;
  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`,
    async (route) => {
      const request = route.request();
      if (request.method() === "DELETE") {
        cancelInvocations += 1;
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      if (request.method() === "GET") {
        const body = cancelInvocations === 0 ? runningJob() : cancelledJob();
        await json(route, 200, body);
        return;
      }
      await route.fallback();
    },
  );

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);

  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(groundedTranscript([{ speaker: "공개 회원 A", at: "00:00", text: "합성 테스트 발언입니다." }])),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();

  // GENERATING shows the cancel button.
  const cancelBtn = page.getByRole("button", { name: /^취소$/ });
  await expect(cancelBtn).toBeVisible({ timeout: 15000 });

  await cancelBtn.click();

  // After cancel, the upload form is shown again (back to IDLE).
  await expect(page.getByLabel(/대본 파일/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /생성 시작/ })).toBeVisible();

  // The cancel endpoint was actually called.
  expect(cancelInvocations).toBeGreaterThanOrEqual(1);

  // Draft for the cancelled jobId is gone.
  const draft = await page.evaluate(
    (jobId) => window.localStorage.getItem(`aigen-draft:${jobId}`),
    JOB_ID,
  );
  expect(draft).toBeNull();
});
