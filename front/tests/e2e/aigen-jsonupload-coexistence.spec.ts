/**
 * E2E: JSON-upload and AI-generate coexistence (task_3_6 step 2 scenario 6).
 *
 * - Visiting `/edit` without `?aigen=1` shows the JSON-upload panel.
 * - The mode toggle (only visible once the session exists + a clubSlug is
 *   known) lets the host switch to the AI generation panel.
 * - Switching to AI mode rewrites the URL to `?aigen=1`; switching back
 *   clears the query.
 * - Only one panel is mounted at a time (mutually exclusive).
 */

import { expect, test, type Route } from "@playwright/test";
import type { ClubAiDefaultResponse } from "@/features/host/aigen/api/aigen-contracts";
import { hostSessionDetailResponse, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

function clubDefault(): ClubAiDefaultResponse {
  return { defaultModel: "claude-sonnet-4-6" };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("JSON-upload and AI-generate modes coexist and toggle via ?aigen URL query", async ({ page }) => {
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

  // 1) Land on the editor WITHOUT ?aigen=1 → JSON-upload mode.
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit`);

  // The mode toggle should be visible.
  const aigenToggle = page.getByRole("tab", { name: /AI 결과 가져오기/ });
  await expect(aigenToggle).toBeVisible({ timeout: 15000 });

  // The AI upload form must NOT be mounted yet (mutually exclusive panels).
  await expect(page.getByLabel(/대본 파일/)).toHaveCount(0);

  // 2) Switch to AI mode.
  await aigenToggle.click();
  await expect(page.getByLabel(/대본 파일/)).toBeVisible({ timeout: 5000 });

  // URL has `aigen=1` now.
  await expect.poll(() => new URL(page.url()).searchParams.get("aigen")).toBe("1");

  // 3) Switch back to JSON mode.
  const jsonToggle = page.getByRole("tab", { name: /JSON|업로드/ }).first();
  await jsonToggle.click();

  // The AI upload form is gone again.
  await expect(page.getByLabel(/대본 파일/)).toHaveCount(0);

  // URL no longer has `aigen=1`.
  await expect.poll(() => new URL(page.url()).searchParams.get("aigen")).toBeNull();
});
