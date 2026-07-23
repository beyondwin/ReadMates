/**
 * E2E: JSON-upload and AI-generate coexistence (task_3_6 step 2 scenario 6).
 *
 * Updated contract (task_3 / session record completion):
 * - Default import mode is AI generation; entering the editor without params
 *   shows the AI transcript form, NOT the JSON-upload form.
 * - Switching to JSON mode writes `?records=json` to the URL.
 * - Switching back to AI mode removes `records` from the URL and sets
 *   `aigen=1` (the AI mode leaves an explicit URL trace).
 * - Only one panel is mounted at a time (mutually exclusive).
 */

import { expect, test, type Route } from "@playwright/test";
import type { ClubAiDefaultResponse } from "@/features/host/aigen/api/aigen-contracts";
import {
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("JSON-upload and AI-generate modes coexist and toggle via URL query params", async ({ page }) => {
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

  // 1) Land on the editor WITHOUT any param → AI generation mode (new default).
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit`);

  // The mode toggle should be visible.
  const jsonToggle = page.getByRole("tab", { name: /외부 JSON 가져오기/ });
  await expect(jsonToggle).toBeVisible({ timeout: 15000 });

  // AI transcript form is mounted; the JSON-upload form is NOT.
  await expect(page.getByLabel(/대본 파일/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel("AI 결과 JSON 가져오기")).toHaveCount(0);

  // 2) Switch to JSON mode.
  await jsonToggle.click();
  await expect(page.getByLabel("AI 결과 JSON 가져오기")).toBeVisible({ timeout: 5000 });
  // AI transcript form is gone (mutual exclusion).
  await expect(page.getByLabel(/대본 파일/)).toHaveCount(0);

  // URL has `records=json`.
  await expect.poll(() => new URL(page.url()).searchParams.get("records")).toBe("json");

  // 3) Switch back to AI mode.
  const aigenToggle = page.getByRole("tab", { name: /AI로 생성/ });
  await aigenToggle.click();
  await expect(page.getByLabel(/대본 파일/)).toBeVisible({ timeout: 5000 });

  // The JSON-upload form is gone again.
  await expect(page.getByLabel("AI 결과 JSON 가져오기")).toHaveCount(0);

  // URL no longer has `records=`; `aigen=1` is now set.
  await expect.poll(() => new URL(page.url()).searchParams.get("records")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("aigen")).toBe("1");
});
