import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const memberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-user",
  membershipId: "member-membership",
  clubId: "club-one",
  email: "member@example.com",
  displayName: "멤버",
  accountName: "이멤버5",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
  currentMembership: {
    membershipId: "member-membership",
    clubId: "club-one",
    clubSlug: "club-one",
    displayName: "멤버",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
  },
  joinedClubs: [],
  platformAdmin: null,
  recommendedAppEntryUrl: "/app",
};

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeMemberShell(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, memberAuth);
  });
}

async function routeCurrentSession(page: Page): Promise<void> {
  await page.route("**/api/bff/api/sessions/current**", async (route) => {
    await json(route, 200, {
      currentSession: {
        sessionId: "session-7",
        sessionNumber: 7,
        title: "7회차 모임 · 테스트 책",
        bookTitle: "테스트 책",
        bookAuthor: "테스트 저자",
        bookLink: null,
        bookImageUrl: null,
        date: "2026-05-20",
        startTime: "20:00",
        endTime: "22:00",
        locationLabel: "온라인",
        meetingUrl: null,
        meetingPasscode: null,
        questionDeadlineAt: "2026-05-19T14:59:00Z",
        myRsvpStatus: "NO_RESPONSE",
        myCheckin: null,
        myQuestions: [],
        myOneLineReview: null,
        myLongReview: null,
        board: { questions: [], longReviews: [] },
        attendees: [],
      },
    });
  });
}

async function routeMemberHomeFeeds(page: Page): Promise<void> {
  await page.route("**/api/bff/api/notes/feed**", async (route) => {
    await json(route, 200, {
      items: [
        {
          sessionId: "session-6",
          sessionNumber: 6,
          bookTitle: "지난 책",
          date: "2026-04-15",
          authorName: "이멤버5",
          authorShortName: "멤버5",
          kind: "ONE_LINE_REVIEW",
          text: "지난 세션 기록입니다.",
        },
      ],
      nextCursor: null,
    });
  });
  await page.route("**/api/bff/api/sessions/upcoming**", async (route) => {
    await json(route, 200, []);
  });
}

async function expectNoMemberPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("member current-session captures reading prep visual evidence", async ({ page }, testInfo) => {
  await routeMemberShell(page);
  await routeCurrentSession(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/session/current");
  const desktopSession = page.locator("main.rm-current-session-desktop");
  await expect(desktopSession.getByText("멤버 준비 필요")).toBeVisible();
  await expect(desktopSession.getByText("RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.")).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-current-session-reading-prep-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/session/current");
  const mobileSession = page.getByTestId("current-session-mobile");
  await expect(mobileSession.getByText("멤버 준비 필요")).toBeVisible();
  await expect(mobileSession.getByRole("button", { name: /참석/ })).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-current-session-reading-prep-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});

test("member home captures notes continuity visual evidence", async ({ page }, testInfo) => {
  await routeMemberShell(page);
  await routeCurrentSession(page);
  await routeMemberHomeFeeds(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/clubs/club-one/app");
  const desktopHome = page.locator(".rm-member-home-desktop");
  await expect(desktopHome.getByText("다음 할 일")).toBeVisible();
  await expect(desktopHome.getByText("RSVP를 먼저 선택해 주세요.")).toBeVisible();
  await expect(desktopHome.getByRole("link", { name: /세션 열기/ })).toHaveAttribute(
    "href",
    "/clubs/club-one/app/session/current",
  );
  await expect(desktopHome.getByText("지난 세션 기록입니다.")).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-home-reading-momentum-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clubs/club-one/app");
  const mobileHome = page.locator(".rm-member-home-mobile");
  await expect(mobileHome.getByText("오늘 할 일")).toBeVisible();
  await expect(mobileHome.getByRole("link", { name: /RSVP/ })).toBeVisible();
  await expect(mobileHome.getByText("지난 세션 기록입니다.")).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-home-reading-momentum-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
