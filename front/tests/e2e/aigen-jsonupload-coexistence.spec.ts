/**
 * E2E: JSON-upload and AI-generate coexistence in the shared record workspace.
 *
 * The editor opens on overview, uses canonical section/source query params,
 * upgrades legacy AI/JSON deep links, and keeps one shared draft while only the
 * selected source tool is visible.
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
  let draftRevision = 0;
  let draftSnapshot = {
    schema: "readmates-session-record:v1" as const,
    visibility: "HOST_ONLY" as const,
    publicationSummary: "",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { fileName: "", title: "", markdown: "" },
  };

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

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/record-editor**`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      liveRevision: 0,
      liveSessionUpdatedAt: "2026-06-01T00:00:00Z",
      liveSnapshot: {
        schema: "readmates-session-record:v1",
        visibility: "HOST_ONLY",
        publicationSummary: "",
        highlights: [],
        oneLineReviews: [],
        feedbackDocument: { fileName: "", title: "", markdown: "" },
      },
      draft: draftRevision === 0
        ? null
        : {
            sessionId: SESSION_ID,
            baseLiveRevision: 0,
            draftRevision,
            source: "MANUAL",
            restoredFromRevisionId: null,
            snapshot: draftSnapshot,
            updatedAt: "2026-06-01T00:00:00Z",
          },
      draftLiveBaseStale: false,
      validationSummary: { valid: true, issues: [] },
    });
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/record-draft**`, async (route) => {
    const request = route.request().postDataJSON() as {
      expectedDraftRevision: number | null;
      snapshot: typeof draftSnapshot;
    };
    expect(request.expectedDraftRevision).toBe(draftRevision === 0 ? null : draftRevision);
    draftRevision += 1;
    draftSnapshot = request.snapshot;
    await json(route, 200, {
      sessionId: SESSION_ID,
      baseLiveRevision: 0,
      draftRevision,
      source: "MANUAL",
      restoredFromRevisionId: null,
      snapshot: draftSnapshot,
      updatedAt: "2026-06-01T00:00:00Z",
    });
  });

  // 1) A bare editor URL opens the overview instead of choosing an import tool.
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}`);
  await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel(/대본 파일/)).toHaveCount(0);
  await expect(page.getByLabel("정리한 파일을 여기에 놓으세요")).toHaveCount(0);

  // 2) The record workspace defaults to manual editing and owns one shared draft.
  await page.getByRole("tab", { name: "기록", exact: true }).click();
  await expect(page).toHaveURL(/\?section=records$/);
  await expect(page.getByRole("tab", { name: "직접 작성" }))
    .toHaveAttribute("aria-selected", "true");
  const commonEditor = page.getByRole("region", { name: "공통 초안 편집기" });
  await expect(commonEditor).toBeVisible();

  const draftSave = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH"
      && response.url().includes(`/host/sessions/${SESSION_ID}/record-draft`),
  );
  await page.getByLabel("공개 요약").fill("도구를 바꿔도 유지되는 공유 초안");
  expect((await draftSave).status()).toBe(200);
  await expect(commonEditor.getByRole("status")).toHaveText("저장됨");

  // 3) Canonical source navigation swaps tools without replacing the common draft.
  await page.getByRole("tab", { name: "AI로 생성" }).click();
  await expect(page).toHaveURL(/\?section=records&source=ai$/);
  await expect(page.getByLabel(/대본 파일/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel("정리한 파일을 여기에 놓으세요")).toHaveCount(0);
  await expect(page.getByLabel("공개 요약")).toHaveValue("도구를 바꿔도 유지되는 공유 초안");

  await page.getByRole("tab", { name: "정리본 올리기" }).click();
  await expect(page).toHaveURL(/\?section=records&source=json$/);
  await expect(page.getByLabel("정리한 파일을 여기에 놓으세요")).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel(/대본 파일/)).toBeHidden();
  await page.getByRole("tab", { name: "직접 작성" }).click();
  await expect(page.getByLabel("공개 요약")).toHaveValue("도구를 바꿔도 유지되는 공유 초안");

  // 4) Legacy deep links canonicalize once and converge on that same draft.
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}?aigen=1`);
  await expect(page).toHaveURL(/\?section=records&source=ai$/);
  await expect(page.getByRole("tab", { name: "AI로 생성" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("공개 요약")).toHaveValue("도구를 바꿔도 유지되는 공유 초안");

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}?records=json`);
  await expect(page).toHaveURL(/\?section=records&source=json$/);
  await expect(page.getByRole("tab", { name: "정리본 올리기" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("정리한 파일을 여기에 놓으세요")).toBeVisible();
  await page.getByRole("tab", { name: "직접 작성" }).click();
  await expect(page.getByLabel("공개 요약")).toHaveValue("도구를 바꿔도 유지되는 공유 초안");
});
