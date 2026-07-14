import { expect, test, type Route } from "@playwright/test";
import {
  groundedSucceededJob,
  groundedTranscript,
  hostSessionDetailResponse,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("mobile review keeps the ledger and editor usable and shows evidence in a focus-safe drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (route.request().url().includes("/ai-generate")) return route.fallback();
    await json(route, 200, hostSessionDetailResponse(SESSION_ID));
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs**`, async (route) => {
    if (route.request().method() === "POST" && !route.request().url().match(/\/jobs\/[^/?]+/)) {
      await json(route, 202, { jobId: JOB_ID, status: "PENDING", expiresAt: "2099-01-01T00:00:00Z" });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`, async (route) => {
    if (route.request().method() === "GET") {
      await json(route, 200, groundedSucceededJob(JOB_ID, 1));
      return;
    }
    await route.fallback();
  });

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);
  await page.getByRole("tab", { name: "문서" }).click();
  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt", mimeType: "text/plain",
    buffer: Buffer.from(groundedTranscript([{ speaker: "공개 회원 A", at: "00:00", text: "공개 합성 발언입니다." }])),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();
  await expect(page.getByText("검토 원장")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("0/4 검토 완료")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const evidenceButton = page.getByRole("button", { name: "요약 문단 1 근거 보기" });
  await evidenceButton.click();
  const drawer = page.getByRole("dialog", { name: "요약 1 근거" });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("button", { name: "근거 닫기" })).toBeFocused();
  await page.getByRole("button", { name: "근거 닫기" }).click();
  await expect(drawer).toBeHidden();
  await expect(evidenceButton).toBeFocused();

  await page.getByRole("textbox", { name: "요약", exact: true }).fill("모바일에서 직접 확인한 공개 요약");
  await expect(page.getByRole("button", { name: "AI 기록 저장" })).toBeDisabled();
  await page.getByRole("button", { name: "직접 수정 내용 확인" }).click();
  for (const button of await page.getByRole("button", { name: "AI 근거 검토 완료" }).all()) await button.click();
  await expect(page.getByRole("button", { name: "AI 기록 저장" })).toBeEnabled();
});
