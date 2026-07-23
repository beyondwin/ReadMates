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
  StartGenerationResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import {
  groundedSnapshot,
  groundedSucceededJob,
  groundedTranscript,
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

function startBody(): StartGenerationResponse {
  return { jobId: JOB_ID, status: "PENDING", expiresAt: "2099-01-01T00:00:00Z" };
}

function succeededJob(summary: string): AiGenerationJobResponse {
  const response = groundedSucceededJob(JOB_ID, 1);
  return { ...response, result: groundedSnapshot(summary) };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("regenerate summary: modal payload uses UPPER_SNAKE item and updates PREVIEW", async ({ page }) => {
  await routeHostEditorShell(page, CLUB_SLUG);

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) {
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
            revision: 2,
            result: groundedSnapshot("재생성된 요약 내용"),
            evidence: groundedSucceededJob(JOB_ID, 2).evidence,
            sectionReviewStatuses: {
              SUMMARY: "PENDING_REVIEW",
              HIGHLIGHTS: "PENDING_REVIEW",
              ONE_LINE_REVIEWS: "PENDING_REVIEW",
              FEEDBACK_DOCUMENT: "PENDING_REVIEW",
            },
          };
          await json(route, 200, responseBody);
          return;
        }
      }
      if (url.includes("/commit") && method === "POST") {
        await json(route, 409, {
          type: "about:blank",
          title: "Stale generation revision",
          status: 409,
          code: "STALE_GENERATION_REVISION",
          detail: "최신 revision을 확인해 주세요.",
          currentRevision: 3,
        });
        return;
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
    buffer: Buffer.from(groundedTranscript([{ speaker: "공개 회원 A", at: "00:00", text: "합성 테스트 발언입니다." }])),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();

  // PREVIEW loaded with initial summary
  const summaryField = page.locator("textarea#aigen-summary-field");
  await expect(summaryField).toHaveValue("초기 요약", { timeout: 15000 });

  for (const button of await page.getByRole("button", { name: "AI 근거 검토 완료" }).all()) await button.click();
  await expect(page.getByText("4/4 검토 완료")).toBeVisible();

  // Click ✨ regenerate on the summary
  await page.getByRole("button", { name: /요약 재생성/ }).click();

  await page.getByLabel(/지시문/).fill("더 간결하게");
  await page.getByRole("button", { name: /^확인$/ }).click();

  // Assert the new summary replaced the old one.
  await expect(summaryField).toHaveValue("재생성된 요약 내용", { timeout: 10000 });
  await expect(page.getByText("0/4 검토 완료")).toBeVisible();
  await expect(page.getByRole("button", { name: "초안으로 저장" })).toBeDisabled();

  await summaryField.fill("revision 2 호스트 공개 합성 초안");
  await page.getByRole("button", { name: "직접 수정 내용 확인" }).click();
  for (const button of await page.getByRole("button", { name: "AI 근거 검토 완료" }).all()) await button.click();
  await page.getByRole("button", { name: "초안으로 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("현재 편집은 자동으로 덮어쓰지 않았습니다");
  await expect(summaryField).toHaveValue("revision 2 호스트 공개 합성 초안");
  await expect(page.getByRole("button", { name: "초안으로 저장" })).toBeDisabled();

  // The regenerate request must have used UPPER_SNAKE_CASE per the
  // documented server defect workaround.
  expect(observedRegenerateItem).toBe("SUMMARY");
});
