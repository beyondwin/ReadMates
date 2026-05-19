/**
 * E2E: happy-path AI generation flow (task_3_6 step 2 scenario 1).
 *
 * Stubs every aigen/auth/session endpoint at the network layer via
 * `page.route()` so the spec is independent of the live Spring backend.
 * Execution is currently waived per the orchestrator directive
 * (`playwright-env-unavailable-mock-only`); this file is authored to be
 * type-correct so it can run as soon as a stubbed-server profile exists.
 */

import { expect, test, type Route } from "@playwright/test";
import type {
  AiGenerationJobResponse,
  ClubAiDefaultResponse,
  SessionImportV1,
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import { hostSessionDetailResponse, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

function clubDefaultBody(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

function startResponseBody(): StartGenerationResponse {
  return {
    jobId: JOB_ID,
    status: "PENDING",
    expiresAt: "2099-01-01T00:00:00Z",
  };
}

function snapshot(): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber: 7,
    bookTitle: "E2E 책",
    meetingDate: "2026-05-16",
    summary: "AI가 생성한 요약입니다.",
    highlights: [{ authorName: "독자A", text: "하이라이트" }],
    oneLineReviews: [{ authorName: "독자B", text: "좋아요" }],
    feedbackDocumentFileName: "session-7-feedback.md",
    feedbackDocumentMarkdown: "# 피드백 문서",
  };
}

function progressJob(stage: AiGenerationJobResponse["stage"], progressPct: number): AiGenerationJobResponse {
  return {
    jobId: JOB_ID,
    status: "RUNNING",
    stage,
    progressPct,
    model: "claude-sonnet-4-6",
    result: null,
    error: null,
    tokens: null,
    costEstimateUsd: "0.05",
    warnings: [],
  };
}

function succeededJob(): AiGenerationJobResponse {
  return {
    jobId: JOB_ID,
    status: "SUCCEEDED",
    stage: "READY",
    progressPct: 100,
    model: "claude-sonnet-4-6",
    result: snapshot(),
    error: null,
    tokens: { input: 1000, cachedInput: 0, output: 500 },
    costEstimateUsd: "0.12",
    warnings: [],
  };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("AI generation full flow: upload → poll → preview → commit", async ({ page }) => {
  // ── Stub auth / session shell so the editor page renders without a live API ──
  await routeHostEditorShell(page, CLUB_SLUG);

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (route.request().url().includes("/ai-generate")) {
      await route.fallback();
      return;
    }
    await fulfillJson(route, 200, hostSessionDetailResponse(SESSION_ID));
  });

  // ── Stub club ai-defaults ──
  await page.route(`**/api/bff/api/host/clubs/${CLUB_SLUG}/ai-defaults**`, async (route) => {
    await fulfillJson(route, 200, clubDefaultBody());
  });

  // ── Stub the start endpoint ──
  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs**`,
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && !request.url().includes("/regenerate") && !request.url().includes("/commit")) {
        await fulfillJson(route, 202, startResponseBody());
        return;
      }
      await route.fallback();
    },
  );

  // ── Polling sequence: first poll RUNNING, second SUCCEEDED ──
  let pollCount = 0;
  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`,
    async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.endsWith("/commit") || url.includes("/commit?")) {
        if (method === "POST") {
          await fulfillJson(route, 200, {
            sessionId: SESSION_ID,
            publicationId: "p-1",
            feedbackDocumentFileName: snapshot().feedbackDocumentFileName,
          });
          return;
        }
      }
      if (method === "GET") {
        pollCount += 1;
        const body = pollCount === 1 ? progressJob("GENERATING_SUMMARY", 35) : succeededJob();
        await fulfillJson(route, 200, body);
        return;
      }
      await route.fallback();
    },
  );

  // ── Navigate ──
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);

  // Upload a small file
  const fileChooser = page.getByLabel(/대본 파일/);
  await fileChooser.setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("e2e transcript content"),
  });

  await page.getByRole("button", { name: /생성 시작/ }).click();

  // PREVIEW appears once polling lands SUCCEEDED.
  await expect(page.getByText(/AI가 생성한 기록 미리보기/)).toBeVisible({ timeout: 15000 });
  // The summary textarea is populated with the server result.
  await expect(page.locator("textarea#aigen-summary-field")).toHaveValue(
    "AI가 생성한 요약입니다.",
  );

  let trackingCommitNavigation = false;
  let mainFrameNavigationsAfterCommit = 0;
  page.on("framenavigated", (frame) => {
    if (trackingCommitNavigation && frame === page.mainFrame()) {
      mainFrameNavigationsAfterCommit += 1;
    }
  });

  // Commit
  trackingCommitNavigation = true;
  await page.getByRole("button", { name: /AI 기록 저장/ }).click();

  // Commit should refresh the editor through Query invalidation, not a full page reload.
  await expect(page.getByText(/AI 기록 저장을 완료했습니다|AI로 세션 기록 생성/)).toBeVisible({ timeout: 15000 });
  await expect.poll(() => mainFrameNavigationsAfterCommit).toBe(0);
});
