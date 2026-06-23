import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillHostAuth, routeHostEditorShell } from "./aigen-test-fixtures";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const CLUB_SLUG = "club-a";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeHostClosing(page: Page): Promise<void> {
  await routeHostEditorShell(page, CLUB_SLUG);
  await page.route("**/api/bff/api/auth/me**", async (route) => fulfillHostAuth(route, CLUB_SLUG));
  await page.route(`**/api/bff/api/host/sessions/${SESSION_ID}/closing-status**`, async (route) => {
    await json(route, 200, {
      schema: "host.session_closing_status.v1",
      session: {
        sessionId: SESSION_ID,
        sessionNumber: 7,
        bookTitle: "E2E 책",
        meetingDate: "2026-06-18",
        state: "PUBLISHED",
        recordVisibility: "PUBLIC",
      },
      overall: { state: "PUBLISHED", label: "발행 완료", primaryAction: "REVIEW_PUBLIC_PAGE" },
      checklist: [
        { id: "SESSION_CLOSED", state: "DONE", label: "세션 종료", detail: "닫힘", href: `/app/host/sessions/${SESSION_ID}/edit` },
        { id: "RECORD_PACKAGE_SAVED", state: "DONE", label: "기록 패키지 저장", detail: "저장됨", href: `/app/host/sessions/${SESSION_ID}/edit?records=json` },
        { id: "FEEDBACK_DOCUMENT_READY", state: "DONE", label: "피드백 문서 준비", detail: "준비됨", href: `/app/host/sessions/${SESSION_ID}/edit?records=json` },
        { id: "MEMBER_NOTIFICATION_SENT", state: "DONE", label: "멤버 알림 발송", detail: "발송됨", href: "/app/host/notifications" },
        { id: "PUBLIC_RECORD_VISIBLE", state: "DONE", label: "공개 기록 노출", detail: "노출됨", href: `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}` },
        { id: "PUBLIC_SHOWCASE_READY", state: "DONE", label: "공개 쇼케이스 확인", detail: "확인 가능", href: `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}` },
      ],
      evidence: {
        summaryPublished: true,
        highlightCount: 2,
        oneLinerCount: 1,
        feedbackDocumentState: "AVAILABLE",
        latestNotificationEvent: {
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          status: "PUBLISHED",
          createdAt: "2026-06-18T10:00:00Z",
        },
        publicRecordHref: `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}`,
        memberReflectionHref: `/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}`,
      },
    });
  });
}

async function routeMemberNotifications(page: Page): Promise<void> {
  await page.unroute("**/api/bff/api/auth/me**");
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, {
      authenticated: true,
      userId: "member-user",
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
  await page.route("**/api/bff/api/me/notifications**", async (route) => {
    await json(route, 200, {
      unreadCount: 1,
      nextCursor: null,
      items: [
        {
          id: "notification-1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "No.07 모임 기록이 준비되었습니다",
          body: "지난 모임의 기록과 피드백을 이어 볼 수 있습니다.",
          deepLinkPath: `/sessions/${SESSION_ID}`,
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
        },
      ],
    });
  });
  await page.route("**/api/bff/api/me/notifications/notification-1/read**", async (route) => {
    await json(route, 200, {});
  });
}

async function routeMemberReflectionSurfaces(page: Page): Promise<void> {
  await page.route(`**/api/bff/api/archive/sessions/${SESSION_ID}**`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      sessionNumber: 7,
      title: "7회차 모임 · E2E 책",
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      state: "CLOSED",
      locationLabel: "온라인",
      attendance: 2,
      total: 2,
      myAttendanceStatus: "ATTENDED",
      isHost: false,
      publicSummary: "멤버가 다시 읽을 수 있는 기록입니다.",
      publicHighlights: [],
      clubQuestions: [],
      clubOneLiners: [],
      publicOneLiners: [],
      myQuestions: [],
      myCheckin: { readingProgress: 100 },
      myOneLineReview: null,
      myLongReview: null,
      feedbackDocument: {
        available: true,
        readable: true,
        lockedReason: null,
        title: "독서모임 7차 피드백",
        uploadedAt: "2026-06-18T10:00:00Z",
      },
    });
  });

  await page.route(`**/api/bff/api/sessions/${SESSION_ID}/feedback-document**`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      sessionNumber: 7,
      title: "독서모임 7차 피드백",
      subtitle: "E2E 책",
      bookTitle: "E2E 책",
      date: "2026-06-18",
      fileName: "session-7-feedback.md",
      uploadedAt: "2026-06-18T10:00:00Z",
      metadata: [],
      observerNotes: ["공개-safe 피드백입니다."],
      participants: [],
    });
  });
}

async function routePublicRecords(page: Page): Promise<void> {
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}`, async (route) => {
    await json(route, 200, {
      clubName: "읽는사이",
      tagline: "같이 읽는 모임",
      about: "공개 소개",
      stats: { sessions: 1, books: 1, members: 6 },
      recentSessions: [
        {
          sessionId: SESSION_ID,
          sessionNumber: 7,
          bookTitle: "E2E 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-06-18",
          summary: "공개 가능한 요약입니다.",
          highlightCount: 2,
          oneLinerCount: 1,
        },
      ],
    });
  });
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}`, async (route) => {
    await json(route, 200, {
      sessionId: SESSION_ID,
      sessionNumber: 7,
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "공개 가능한 요약입니다.",
      highlights: [{ text: "남은 문장", sortOrder: 1, authorName: "독자A", authorShortName: "A" }],
      oneLiners: [{ authorName: "독자B", authorShortName: "B", text: "한줄평" }],
    });
  });
}

test("session closing flywheel links host member and public surfaces", async ({ page }, testInfo) => {
  await routeHostClosing(page);
  await page.goto(`/clubs/${CLUB_SLUG}/app/host/sessions/${SESSION_ID}/closing`);
  await expect(page.getByRole("heading", { name: "No.07 · E2E 책" })).toBeVisible();
  await expect(page.getByText("발행 완료")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Host" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Member" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public" })).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  const screenshot = await page.screenshot({ path: testInfo.outputPath("session-closing-board.png"), fullPage: true });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);

  await routeMemberNotifications(page);
  await routeMemberReflectionSurfaces(page);
  await page.goto(`/clubs/${CLUB_SLUG}/app/notifications`);
  await expect(page.getByText("Past session reflection")).toBeVisible();
  await expect(page.getByText("View record")).toBeVisible();
  await page.getByRole("link", { name: "No.07 모임 기록이 준비되었습니다 열기" }).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}$`));
  await expect(page.getByRole("link", { name: "지난 모임 회고 돌아가기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "피드백 보기" })).toBeVisible();
  await page.getByRole("link", { name: "피드백 보기" }).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB_SLUG}/app/feedback/${SESSION_ID}$`));
  await expect(page.getByRole("link", { name: "세션으로 돌아가기" })).toBeVisible();
  await page.getByRole("link", { name: "세션으로 돌아가기" }).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}$`));
  await expect(page.getByRole("link", { name: "지난 모임 회고 돌아가기" })).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);

  await routePublicRecords(page);
  await page.goto(`/clubs/${CLUB_SLUG}/records`);
  await expect(page.getByText("기록 준비됨")).toBeVisible();
  await expect(page.getByText("하이라이트 2 · 한줄평 1")).toBeVisible();
  await expect(page.getByText("피드백 문서")).toHaveCount(0);
});
