/**
 * E2E: cost-cap exceeded on start (task_3_6 step 2 scenario 4).
 *
 * `POST /jobs` returns 429 with an RFC 7807 problem-detail body carrying
 * `code: "COST_CAP_EXCEEDED"`. The frontend surfaces an explanatory error
 * message and stays on the upload form so the host can adjust the model
 * and try again.
 */

import { expect, test, type Route } from "@playwright/test";
import type {
  AiProblemDetail,
  ClubAiDefaultResponse,
} from "@/features/host/aigen/api/aigen-contracts";
import { hostSessionDetailResponse, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

function costCapProblem(): AiProblemDetail {
  return {
    type: "https://readmates.dev/problems/aigen/cost-cap-exceeded",
    title: "Cost cap exceeded",
    status: 429,
    detail: "이번 달 AI 생성 비용 한도를 초과했습니다.",
    code: "COST_CAP_EXCEEDED",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("cost cap exceeded on start surfaces an explanatory message and stays on IDLE", async ({ page }) => {
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

  // The start endpoint always rejects with COST_CAP_EXCEEDED.
  await page.route(
    `**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs**`,
    async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        await json(route, 429, costCapProblem());
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

  // The error alert from AiGenerateTab surfaces under the upload form.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 15000 });
  // The message includes the user-facing detail from the problem document
  // (the BFF/error wrapper concatenates code + detail; this assertion is
  // forgiving so both "비용 한도" and the code surface satisfy it).
  await expect(alert).toContainText(/비용|COST_CAP_EXCEEDED|한도/);

  // Still on the upload form — IDLE state.
  await expect(page.getByLabel(/대본 파일/)).toBeVisible();
  await expect(page.getByRole("button", { name: /생성 시작/ })).toBeVisible();
});
