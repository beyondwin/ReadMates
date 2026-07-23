import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import type { HostSessionDetailResponse, SessionImportPreviewResponse } from "@/features/host/model/host-view-types";
import {
  fulfillHostAuth,
  hostSessionDetailResponse,
  isHostSessionDetailRequest,
  routeHostEditorShell,
} from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function sessionResponse(): HostSessionDetailResponse {
  return {
    ...hostSessionDetailResponse(SESSION_ID),
    visibility: "MEMBER",
    publication: {
      publicSummary: "기존 공개 요약입니다.",
      visibility: "MEMBER",
    },
    attendees: [
      {
        membershipId: "member-a",
        displayName: "독자A",
        accountName: "독자A",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "ACTIVE",
      },
      {
        membershipId: "member-b",
        displayName: "독자B",
        accountName: "독자B",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "ACTIVE",
      },
    ],
    feedbackDocument: {
      uploaded: true,
      fileName: "session-7-feedback.md",
      uploadedAt: "2026-05-16T12:00:00Z",
    },
  };
}

function hostFeedbackDocumentPreviewResponse() {
  return {
    sessionId: SESSION_ID,
    sessionNumber: 7,
    title: "독서모임 7차 피드백",
    subtitle: "E2E 책 · 2026.05.16",
    bookTitle: "E2E 책",
    date: "2026-05-16",
    fileName: "session-7-feedback.md",
    uploadedAt: "2026-05-16T12:00:00Z",
    metadata: [{ label: "열람 범위", value: "호스트 미리보기" }],
    observerNotes: ["공개 안전한 호스트 미리보기입니다."],
    participants: [],
  };
}

function importJson() {
  return {
    format: "readmates-session-import:v1",
    session: { number: 7, bookTitle: "E2E 책", meetingDate: "2026-05-16" },
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights: [{ authorName: "독자A", text: "하이라이트입니다." }],
    oneLineReviews: [{ authorName: "독자B", text: "한줄평입니다." }],
    feedbackDocument: {
      fileName: "session-7-feedback.md",
      markdown: "<!-- readmates-feedback:v1 -->\n\n# 독서모임 7차 피드백\n\n## 참여자별 피드백",
    },
    ignoredRawJsonSentinel: "{\"member1@example.com\":\"private.example.com\"}",
  };
}

function previewResponse(): SessionImportPreviewResponse {
  return {
    valid: true,
    session: { sessionNumber: 7, bookTitle: "E2E 책", meetingDate: "2026-05-16" },
    publication: { summary: "공개 가능한 세션 요약입니다." },
    highlights: [
      {
        authorName: "독자A",
        text: "하이라이트입니다.",
        authorMatched: true,
        membershipId: "member-a",
      },
    ],
    oneLineReviews: [
      {
        authorName: "독자B",
        text: "한줄평입니다.",
        authorMatched: true,
        membershipId: "member-b",
      },
    ],
    feedbackDocument: {
      fileName: "session-7-feedback.md",
      title: "독서모임 7차 피드백",
      valid: true,
    },
    issues: [],
  };
}

async function routeHostSessionEditor(page: Page): Promise<void> {
  let draftSaved = false;
  await routeHostEditorShell(page, CLUB_SLUG);

  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await fulfillHostAuth(route, CLUB_SLUG);
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}**`, async (route) => {
    if (!isHostSessionDetailRequest(route, SESSION_ID)) {
      await route.fallback();
      return;
    }
    await json(route, 200, sessionResponse());
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/session-import/preview**`, async (route) => {
    await json(route, 200, previewResponse());
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/session-import/commit**`, async (route) => {
    const request = route.request().postDataJSON();
    expect(request.expectedDraftRevision).toBeNull();
    draftSaved = true;
    await json(route, 200, {
      sessionId: SESSION_ID,
      draftRevision: 1,
      baseLiveRevision: 0,
      liveApplied: false,
    });
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/feedback-document/preview**`, async (route) => {
    expect(route.request().method()).toBe("GET");
    await json(route, 200, hostFeedbackDocumentPreviewResponse());
  });

  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/record-editor**`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      liveRevision: 0,
      liveSnapshot: {
        schema: "readmates-session-record:v1",
        visibility: "MEMBER",
        publicationSummary: "기존 공개 요약입니다.",
        highlights: [],
        oneLineReviews: [
          { membershipId: "member-b", authorDisplayName: "독자B", text: "기존 live 한줄평입니다." },
        ],
        feedbackDocument: { fileName: "", title: "", markdown: "" },
      },
      draft: draftSaved
        ? {
            sessionId: SESSION_ID,
            baseLiveRevision: 0,
            draftRevision: 1,
            source: "JSON_IMPORT",
            restoredFromRevisionId: null,
            snapshot: {
              schema: "readmates-session-record:v1",
              visibility: "MEMBER",
              publicationSummary: "공개 가능한 세션 요약입니다.",
              highlights: [
                { membershipId: "member-a", authorDisplayName: "독자A", text: "하이라이트입니다." },
              ],
              oneLineReviews: [
                { membershipId: "member-b", authorDisplayName: "독자B", text: "한줄평입니다." },
              ],
              feedbackDocument: {
                fileName: "session-7-feedback.md",
                title: "독서모임 7차 피드백",
                markdown: importJson().feedbackDocument.markdown,
              },
            },
            updatedAt: "2026-05-16T12:00:00Z",
          }
        : null,
      draftLiveBaseStale: false,
      validationSummary: { valid: true, issues: [] },
    });
  });
}

async function routeMemberHome(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, {
      authenticated: true,
      userId: "user-member-e2e",
      membershipId: "member-a",
      clubId: "club-a-id",
      email: "member@example.com",
      displayName: "E2E 멤버",
      accountName: "E2E 멤버",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      currentMembership: {
        membershipId: "member-a",
        clubId: "club-a-id",
        clubSlug: CLUB_SLUG,
        displayName: "E2E 멤버",
        role: "MEMBER",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      },
      joinedClubs: [],
      recommendedAppEntryUrl: `/clubs/${CLUB_SLUG}/app`,
    });
  });

  await page.route("**/api/bff/api/sessions/current**", async (route) => {
    await json(route, 200, { currentSession: null });
  });

  await page.route("**/api/bff/api/notes/feed**", async (route) => {
    await json(route, 200, {
      items: [
        {
          sessionId: SESSION_ID,
          sessionNumber: 7,
          bookTitle: "E2E 책",
          date: "2026-05-16",
          authorName: "독자B",
          authorShortName: "B",
          kind: "ONE_LINE_REVIEW",
          text: "기존 live 한줄평입니다.",
        },
      ],
      nextCursor: null,
    });
  });

  await page.route("**/api/bff/api/sessions/upcoming**", async (route) => {
    await json(route, 200, []);
  });
}

async function uploadSessionImportJson(page: Page): Promise<void> {
  await page.locator("#session-import-json-file").setInputFiles({
    name: "session-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importJson())),
  });
}

async function expectSessionRecordPreviewPublicSafe(page: Page): Promise<void> {
  const review = page.getByRole("region", { name: "세션 기록 미리보기" });
  await expect(review).toBeVisible();
  await expect(review.getByText("저장 가능")).toBeVisible();
  await expect(review.getByText("7회차 · E2E 책 · 2026-05-16")).toBeVisible();
  await expect(review.getByText("공개 요약 교체")).toBeVisible();
  await expect(review.getByText("하이라이트 1개")).toBeVisible();
  await expect(review.getByText("한줄평 1개")).toBeVisible();
  await expect(review.getByText("작성자 매칭 완료")).toBeVisible();
  await expect(review.getByText("피드백 문서 구조 확인 완료")).toBeVisible();
  await expect(page.getByRole("button", { name: "초안으로 가져오기" })).toBeEnabled();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

async function expectSessionImportCommitResultPublicSafe(page: Page): Promise<void> {
  const commitResult = page.getByRole("region", { name: "세션 기록 초안 저장 결과" });
  await expect(commitResult).toBeVisible();
  await expect(commitResult.getByText("초안 저장 완료")).toBeVisible();
  await expect(commitResult.getByText("피드백 문서 초안 저장: 독서모임 7차 피드백")).toBeVisible();
  await expect(commitResult.getByText("검토 후 변경사항을 반영하기 전까지 멤버와 공개 화면은 바뀌지 않습니다.")).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("host captures public-safe session record preview evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routeHostSessionEditor(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/edit?records=json`);
  await expect(page.getByLabel("AI 결과 JSON 가져오기")).toBeVisible({ timeout: 15000 });
  const previewPost = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/bff/api/host/sessions/${SESSION_ID}/session-import/preview`),
  );
  await uploadSessionImportJson(page);
  expect((await previewPost).ok()).toBe(true);
  await expectSessionRecordPreviewPublicSafe(page);
  const commitPost = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/bff/api/host/sessions/${SESSION_ID}/session-import/commit`),
  );
  await page.getByRole("button", { name: "초안으로 가져오기" }).click();
  expect((await commitPost).ok()).toBe(true);
  await expectSessionImportCommitResultPublicSafe(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-session-record-preview-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "공개 기록" }).click();
  await expectSessionImportCommitResultPublicSafe(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-session-record-preview-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);

  const previewMutations: string[] = [];
  const trackPreviewMutation = (request: Request) => {
    const url = request.url();
    if (
      request.method() !== "GET"
      && (
        url.includes(`/host/sessions/${SESSION_ID}/feedback-document`)
        || url.includes("/host/notifications/manual")
      )
    ) {
      previewMutations.push(`${request.method()} ${url}`);
    }
  };
  page.on("request", trackPreviewMutation);
  await page.getByRole("link", { name: "피드백 문서 미리보기" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/feedback-document$`),
  );
  await expect(page.getByRole("heading", { name: "독서모임 7차 피드백" })).toBeVisible();
  await expect(page.getByText("공개 안전한 호스트 미리보기입니다.")).toBeVisible();
  expect(previewMutations).toEqual([]);
  page.off("request", trackPreviewMutation);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await routeMemberHome(page);
  await page.goto(`/clubs/${CLUB_SLUG}/app`);
  const recentRecord = page.getByRole("region", { name: "지난 모임 회고" });
  await expect(recentRecord).toBeVisible();
  await expect(recentRecord.getByText("No.07 · E2E 책")).toBeVisible();
  await expect(recentRecord.getByText("E2E 책의 기록과 피드백을 이어 읽을 수 있어요.")).toBeVisible();
  await expect(recentRecord.getByText("한줄평")).toBeVisible();
  await expect(page.getByText("기존 live 한줄평입니다.", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("공개 가능한 세션 요약입니다.")).toHaveCount(0);
  await expect(page.getByText("한줄평입니다.", { exact: true })).toHaveCount(0);
  await expect(recentRecord.getByText("피드백 문서는 열람 화면에서 확인합니다.")).toBeVisible();
  await expect(recentRecord.getByRole("link", { name: "기록 보기" })).toHaveAttribute(
    "href",
    `/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}`,
  );
  await expect(recentRecord.getByRole("link", { name: "피드백 보기" })).toHaveAttribute(
    "href",
    `/clubs/${CLUB_SLUG}/app/feedback/${SESSION_ID}`,
  );
  await expect(page.getByText("PRIVATE_MEMBER_EMAIL")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
