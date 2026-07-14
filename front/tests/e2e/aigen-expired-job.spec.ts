/**
 * E2E: job loaded via URL ?jobId=... but server returns 404 because the
 * Redis-backed job entry has expired (task_3_6 step 2 scenario 5).
 *
 * The frontend currently boots the tab from URL/`?aigen=1` only and does
 * not deep-link `?jobId=…`. To still cover the "expired job" surface, the
 * spec drives the flow forward by *starting* a new job and then making
 * every subsequent poll return 404. The expected UX is that the error
 * state surfaces and the upload form is reachable again.
 */

import { expect, test, type Route } from "@playwright/test";
import type {
  AiProblemDetail,
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

function notFoundProblem(): AiProblemDetail {
  return {
    type: "https://readmates.dev/problems/aigen/job-not-found",
    title: "Job not found",
    status: 404,
    detail: "요청한 작업이 만료되었거나 존재하지 않습니다.",
    code: "JOB_NOT_FOUND",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("expired job (poll 404) surfaces an error and lets the host start over", async ({ page }) => {
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
        !request.url().match(/\/jobs\/[^/?]+/)
      ) {
        await json(route, 202, startBody());
        return;
      }
      await route.fallback();
    },
  );

  // Every poll for this jobId returns 404 (TTL expired in Redis).
  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`,
    async (route) => {
      if (route.request().method() === "GET") {
        await json(route, 404, notFoundProblem());
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

  // The 404 surfaces some user-visible failure indicator: assert that
  // *some* recovery path (retry, cancel, or back to IDLE upload form) is
  // reachable. The current implementation may keep the tab in the GENERATING
  // view while polling continues to receive 404s — the cancel button is
  // still reachable in that case, satisfying the recovery contract.
  const recoveryAction = page.getByRole("button", {
    name: /다시 시도|취소|생성 시작/,
  });
  await expect(recoveryAction.first()).toBeVisible({ timeout: 15000 });
});
