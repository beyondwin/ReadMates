/**
 * E2E: regenerate-one-section flow (task_3_6 step 2 scenario 2).
 *
 * From PREVIEW, the host clicks ✨ on the summary section, fills the modal,
 * confirms, and the regenerated value replaces the summary. The regenerate
 * endpoint receives UPPER_SNAKE `item` (server-side workaround).
 */

import { expect, test, type Route } from "@playwright/test";
import type {
  AiGenerationJobResponse,
  ClubAiDefaultResponse,
  RegenerateRequest,
  RegenerateResponse,
  SessionImportV1,
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import { hostSessionDetailResponse, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

function startBody(): StartGenerationResponse {
  return { jobId: JOB_ID, status: "PENDING", expiresAt: "2099-01-01T00:00:00Z" };
}

function snapshot(summary: string): SessionImportV1 {
  return {
    format: "readmates.session.v1",
    sessionNumber: 1,
    bookTitle: "E2E 책",
    meetingDate: "2026-05-16",
    summary,
    highlights: [{ authorName: "독자A", text: "h" }],
    oneLineReviews: [{ authorName: "독자B", text: "r" }],
    feedbackDocumentFileName: "session-1-feedback.md",
    feedbackDocumentMarkdown: "# 피드백",
  };
}

function succeededJob(summary: string): AiGenerationJobResponse {
  return {
    jobId: JOB_ID,
    status: "SUCCEEDED",
    stage: "READY",
    progressPct: 100,
    model: "claude-sonnet-4-6",
    result: snapshot(summary),
    error: null,
    tokens: null,
    costEstimateUsd: "0.10",
    warnings: [],
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("regenerate summary: modal payload uses UPPER_SNAKE item and updates PREVIEW", async ({ page }) => {
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
        !request.url().includes("/commit") &&
        !request.url().match(/\/jobs\/[^/?]+/)
      ) {
        await json(route, 202, startBody());
        return;
      }
      await route.fallback();
    },
  );

  let observedRegenerateItem: string | null = null;
  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`,
    async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();

      if (url.includes("/regenerate")) {
        if (method === "POST") {
          const requestBody = JSON.parse(request.postData() ?? "{}") as RegenerateRequest;
          // Capture the actual item string so the test can assert UPPER_SNAKE.
          observedRegenerateItem = (requestBody as unknown as { item: string }).item;
          const responseBody: RegenerateResponse = {
            item: "summary",
            value: { summary: "재생성된 요약 내용" },
            tokens: { input: 100, cachedInput: 0, output: 50 },
            costEstimateUsd: "0.02",
            warnings: [],
          };
          await json(route, 200, responseBody);
          return;
        }
      }
      if (method === "GET") {
        await json(route, 200, succeededJob("초기 요약"));
        return;
      }
      await route.fallback();
    },
  );

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);

  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hi"),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();

  // PREVIEW loaded with initial summary
  const summaryField = page.locator("textarea#aigen-summary-field");
  await expect(summaryField).toHaveValue("초기 요약", { timeout: 15000 });

  // Click ✨ regenerate on the summary
  await page.getByRole("button", { name: /요약 재생성/ }).click();

  await page.getByLabel(/지시문/).fill("더 간결하게");
  await page.getByRole("button", { name: /^확인$/ }).click();

  // Assert the new summary replaced the old one.
  await expect(summaryField).toHaveValue("재생성된 요약 내용", { timeout: 10000 });

  // The regenerate request must have used UPPER_SNAKE_CASE per the
  // documented server defect workaround.
  expect(observedRegenerateItem).toBe("SUMMARY");
});
