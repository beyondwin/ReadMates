import { expect, test, type Route } from "@playwright/test";
import type { CommitGenerationRequest } from "@/features/host/aigen/api/aigen-contracts";
import {
  groundedSucceededJob,
  groundedTranscript,
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
  trackNotificationMutationRequests,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const JOB_ID = "22222222-2222-2222-2222-222222222222";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("host reviews grounded blocks, confirms one edit, and commits the exact revision", async ({ page }) => {
  const notificationMutations = trackNotificationMutationRequests(page);
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) return route.fallback();
    await json(route, 200, hostSessionDetailResponse(SESSION_ID));
  });
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs**`, async (route) => {
    if (route.request().method() === "POST" && !route.request().url().match(/\/jobs\/[^/?]+/)) {
      await json(route, 202, { jobId: JOB_ID, status: "PENDING", expiresAt: "2099-01-01T00:00:00Z" });
      return;
    }
    await route.fallback();
  });

  let committed: CommitGenerationRequest | null = null;
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/ai-generate/jobs/${JOB_ID}**`, async (route) => {
    const request = route.request();
    if (request.url().includes("/evidence/turn-1")) {
      await json(route, 200, { turnId: "turn-1", speakerName: "공개 회원 A", startSeconds: 0, text: "공개 합성 전체 발언입니다." });
      return;
    }
    if (request.url().includes("/commit") && request.method() === "POST") {
      committed = JSON.parse(request.postData() ?? "{}") as CommitGenerationRequest;
      await json(route, 200, {
        sessionId: SESSION_ID,
        status: "COMMITTED",
        recovered: false,
        participantUpdatesCount: 2,
        draftRevision: 1,
        baseLiveRevision: 0,
        liveApplied: false,
      });
      return;
    }
    if (request.method() === "GET") {
      await json(route, 200, groundedSucceededJob(JOB_ID, 1));
      return;
    }
    await route.fallback();
  });

  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?aigen=1`);
  await page.getByLabel(/대본 파일/).setInputFiles({
    name: "transcript.txt", mimeType: "text/plain",
    buffer: Buffer.from(groundedTranscript([
      { speaker: "공개 회원 A", at: "00:00", text: "공개 합성 첫 발언입니다." },
      { speaker: "공개 회원 B", at: "00:45", text: "공개 합성 둘째 발언입니다." },
    ])),
  });
  await page.getByRole("button", { name: /생성 시작/ }).click();
  await expect(page.getByText("0/4 검토 완료")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "요약 문단 1 근거 보기" }).click();
  await expect(page.getByText("공개 합성 근거 발언입니다.")).toBeVisible();
  await page.getByRole("button", { name: "전체 발언 보기" }).click();
  await expect(page.getByText("공개 합성 전체 발언입니다.")).toBeVisible();

  const summary = page.getByRole("textbox", { name: "요약", exact: true });
  await summary.fill("호스트가 확인한 공개 합성 요약입니다.");
  await expect(page.getByRole("button", { name: /요약 문단 1: 직접 수정됨/ })).toBeDisabled();
  await page.getByRole("button", { name: "직접 수정 내용 확인" }).click();
  for (const button of await page.getByRole("button", { name: "AI 근거 검토 완료" }).all()) await button.click();
  await expect(page.getByText("4/4 검토 완료")).toBeVisible();

  await page.getByRole("button", { name: "초안으로 저장" }).click();
  await expect(page.getByText(/참여 상태 2건/)).toBeVisible();
  expect(committed).toMatchObject({
    expectedRevision: 1,
    sectionReviews: {
      SUMMARY: "USER_EDITED_CONFIRMED",
      HIGHLIGHTS: "AI_GROUNDED_REVIEWED",
      ONE_LINE_REVIEWS: "AI_GROUNDED_REVIEWED",
      FEEDBACK_DOCUMENT: "AI_GROUNDED_REVIEWED",
    },
  });
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toHaveCount(0);
  expect(notificationMutations()).toEqual([]);
});
