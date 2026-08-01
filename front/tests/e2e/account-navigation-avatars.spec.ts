import { expect, test, type Page, type Route } from "@playwright/test";

const CLUB_SLUG = "reading-sai";
const APP_BASE = `/clubs/${CLUB_SLUG}/app`;
const MEMBER_NAME = "김독서";
type FixtureRole = "HOST" | "MEMBER";

// The initial RED run used false here, proving that a fixture missing these
// contract fields cannot complete the member-space journey.
const WIRE_AVATAR_KEYS = true;

type AvatarMember = {
  membershipId: string;
  displayName: string;
  accountName: string;
  role: "HOST" | "MEMBER";
  rsvpStatus: "GOING";
  attendanceStatus: "ATTENDED";
  avatarKey?: "reading-lamp" | "book-tote" | "calendar-book";
};

const sameSurnameMembers: AvatarMember[] = [
  {
    membershipId: "member-reading-lamp",
    displayName: "김독서",
    accountName: "김독서",
    role: "HOST",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "reading-lamp",
  },
  {
    membershipId: "member-book-tote",
    displayName: "김책가방",
    accountName: "김책가방",
    role: "MEMBER",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "book-tote",
  },
  {
    membershipId: "member-calendar-book",
    displayName: "김달력책",
    accountName: "김달력책",
    role: "MEMBER",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "calendar-book",
  },
];

function avatarKeyFor<T extends { avatarKey?: string }>(value: T) {
  if (!WIRE_AVATAR_KEYS) {
    const withoutAvatarKey = { ...value };
    delete withoutAvatarKey.avatarKey;
    return withoutAvatarKey;
  }

  return value;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function currentSessionResponse() {
  return {
    currentSession: {
      sessionId: "session-avatar-roster",
      sessionNumber: 8,
      title: "아바타 확인 모임",
      bookTitle: "같이 읽는 책",
      bookAuthor: "합성 저자",
      bookLink: null,
      bookImageUrl: null,
      date: "2026-08-01",
      startTime: "19:30",
      endTime: "21:30",
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      questionDeadlineAt: "2026-08-01T10:00:00Z",
      myRsvpStatus: "GOING",
      myCheckin: { readingProgress: 60 },
      myQuestions: [],
      myOneLineReview: null,
      myLongReview: null,
      board: { questions: [], longReviews: [] },
      attendees: sameSurnameMembers.map(avatarKeyFor),
    },
  };
}

function authResponse(role: FixtureRole = "HOST") {
  const currentMembership = avatarKeyFor({
    membershipId: "member-reading-lamp",
    clubId: "club-reading-sai",
    clubSlug: CLUB_SLUG,
    displayName: MEMBER_NAME,
    role,
    membershipStatus: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
    avatarKey: "reading-lamp",
  });

  return {
    authenticated: true,
    userId: "synthetic-reader",
    membershipId: "member-reading-lamp",
    clubId: "club-reading-sai",
    email: "reader@example.test",
    displayName: MEMBER_NAME,
    accountName: MEMBER_NAME,
    role,
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    avatarKey: "reading-lamp",
    currentMembership,
    joinedClubs: [
      {
        clubId: "club-reading-sai",
        clubSlug: CLUB_SLUG,
        clubName: "읽는사이",
        membershipId: "member-reading-lamp",
        role,
        status: "ACTIVE",
        primaryHost: null,
      },
    ],
    platformAdmin: null,
    recommendedAppEntryUrl: APP_BASE,
  };
}

function memberProfile(role: FixtureRole = "HOST") {
  return avatarKeyFor({
    avatarKey: "reading-lamp",
    displayName: MEMBER_NAME,
    accountName: MEMBER_NAME,
    email: "reader@example.test",
    role,
    membershipStatus: "ACTIVE",
    clubName: "읽는사이",
    joinedAt: "2026-01",
    sessionCount: 1,
    totalSessionCount: 1,
    completedReadingCount: 1,
    currentSessionId: "session-avatar-roster",
    recentAttendances: [],
  });
}

function journeyResponse() {
  return {
    items: [],
    nextCursor: null,
    summary: {
      attendedSessionCount: 1,
      completedReadingCount: 1,
      questionCount: 0,
      reviewCount: 0,
      readableFeedbackDocumentCount: 0,
    },
  };
}

async function routeSyntheticApp(page: Page, role: FixtureRole = "HOST") {
  await page.route("**/api/bff/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/api/auth/me")) return json(route, authResponse(role));
    if (path.endsWith("/api/me/notifications")) {
      return json(route, { items: [], unreadCount: 0, nextCursor: null });
    }
    if (path.endsWith("/api/app/me")) return json(route, memberProfile(role));
    if (path.endsWith("/api/archive/me/journey")) return json(route, journeyResponse());
    if (path.endsWith("/api/sessions/current")) return json(route, currentSessionResponse());

    if (path.endsWith("/api/host/dashboard")) {
      return json(route, {
        rsvpPending: 0,
        checkinMissing: 0,
        publishPending: 0,
        feedbackPending: 0,
        currentSessionMissingMemberCount: 0,
        currentSessionMissingMembers: [],
      });
    }
    if (path.endsWith("/api/host/sessions")) return json(route, { items: [], nextCursor: null });
    if (path.endsWith("/api/host/notifications/summary")) {
      return json(route, { pending: 0, failed: 0, dead: 0, sentLast24h: 0, latestFailures: [] });
    }

    // These are optional dashboard sections. Their route loaders deliberately
    // degrade on a typed non-success response, keeping this fixture local.
    if (path.endsWith("/api/host/club-operations") || path.includes("/record-ledger")) {
      return json(route, { code: "NOT_AVAILABLE" }, 404);
    }
    if (path.includes("/ai-generation/capabilities")) return json(route, { enabled: false });

    throw new Error(`Unhandled synthetic BFF request: ${path}`);
  });
}

function assertNoImageRequestEscaped(imageRequestUrls: string[], localHost: string) {
  const parsed = imageRequestUrls.map((url) => new URL(url));
  expect(parsed.length).toBeGreaterThan(0);
  expect(new Set(parsed.map((url) => url.host))).toEqual(new Set([localHost]));
  expect(parsed.every((url) => url.pathname.startsWith("/assets/avatars/book-club/") && url.pathname.endsWith(".webp"))).toBe(true);
}

async function expectVisibleUnclippedMobileAccount(page: Page, width: number) {
  const account = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
  await expect(account).toBeVisible();
  await expect(account).toContainText("계정");
  const box = await account.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test("non-host member keeps the explicit account action without a workspace switch on mobile", async ({ page }, testInfo) => {
  await routeSyntheticApp(page, "MEMBER");

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`${APP_BASE}/me`);
    await expect(page.getByRole("link", { name: "호스트 화면" })).toHaveCount(0);
    await expectVisibleUnclippedMobileAccount(page, width);
    await page.screenshot({ path: testInfo.outputPath(`${width}-non-host-account.png`), fullPage: true });
  }
});

test("scoped account navigation preserves local avatar identity across mobile and desktop", async ({ page }, testInfo) => {
  const imageRequestUrls: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image") imageRequestUrls.push(request.url());
  });
  await routeSyntheticApp(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_BASE}/notifications`);
  const mobileTabs = page.getByRole("navigation", { name: "앱 탭" });
  await expect(mobileTabs.getByRole("link", { name: "내 공간" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "내 공간" }).first()).toHaveAttribute("href", `${APP_BASE}/me`);
  await page.screenshot({ path: testInfo.outputPath("390-notifications-parent.png"), fullPage: true });

  await page.getByRole("link", { name: "내 공간" }).first().click();
  await expect(page).toHaveURL(`${APP_BASE}/me`);
  const utilityNotifications = page.getByRole("link", { name: /^알림/ });
  await expect(utilityNotifications).toHaveAttribute("href", `${APP_BASE}/notifications`);
  await page.screenshot({ path: testInfo.outputPath("390-my-space-utilities.png"), fullPage: true });
  await utilityNotifications.click();
  await expect(page).toHaveURL(`${APP_BASE}/notifications`);
  await expect(mobileTabs.getByRole("link", { name: "내 공간" })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("390-utility-notifications.png"), fullPage: true });
  await page.getByRole("link", { name: "내 공간" }).first().click();
  await expect(page).toHaveURL(`${APP_BASE}/me`);

  const account = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
  await expect(account).toContainText("계정");
  await account.click();
  const dialog = page.getByRole("dialog", { name: MEMBER_NAME });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "내 공간" })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "알림" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("390-account-popover.png"), fullPage: true });
  await dialog.getByRole("link", { name: "계정 설정" }).click();
  await expect(page).toHaveURL(`${APP_BASE}/me/settings`);
  await expect(page.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", `${APP_BASE}/me`);
  await page.getByRole("link", { name: "뒤로" }).click();
  await expect(page).toHaveURL(`${APP_BASE}/me`);

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole("link", { name: "호스트 화면" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("320-member-header.png"), fullPage: true });
  await page.getByRole("link", { name: "호스트 화면" }).click();
  await expect(page).toHaveURL(`${APP_BASE}/host`);
  const hostHeader = page.getByRole("banner");
  await expect(hostHeader.getByRole("link", { name: "멤버 화면으로" })).toBeVisible();
  await expect(hostHeader.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` })).toBeVisible();
  await hostHeader.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).click();
  await expect(page.getByRole("dialog", { name: MEMBER_NAME }).getByRole("button", { name: "로그아웃" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("320-host-account-popover.png"), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${APP_BASE}/notifications`);
  const desktopNavigation = page.getByRole("navigation", { name: "앱 내비게이션" });
  await expect(desktopNavigation.getByRole("link", { name: "내 공간" })).toHaveAttribute("aria-current", "page");
  const desktopNotificationAccount = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
  await expect(desktopNotificationAccount).toContainText(MEMBER_NAME);
  await expect(desktopNotificationAccount.locator("img")).toHaveAttribute("src", "/assets/avatars/book-club/reading-lamp.webp");
  await page.screenshot({ path: testInfo.outputPath("1280-notifications-account.png"), fullPage: true });

  await page.goto(`${APP_BASE}/session/current`);
  const desktopAccount = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
  await expect(desktopAccount).toContainText(MEMBER_NAME);
  await expect(desktopAccount.locator("img")).toHaveAttribute("src", "/assets/avatars/book-club/reading-lamp.webp");
  const roster = page.getByRole("main").filter({ hasText: "참석자 · 3/3" });
  await expect(roster).toHaveCount(1);
  await expect(roster.getByText(/^김독서/)).toBeVisible();
  await expect(roster.getByText("김책가방", { exact: true })).toBeVisible();
  await expect(roster.getByText("김달력책", { exact: true })).toBeVisible();
  const rosterImages = roster.locator("img");
  await expect(rosterImages).toHaveCount(3);
  expect(await rosterImages.evaluateAll((images) => images.map((image) => image.getAttribute("src")))).toEqual([
    "/assets/avatars/book-club/reading-lamp.webp",
    "/assets/avatars/book-club/book-tote.webp",
    "/assets/avatars/book-club/calendar-book.webp",
  ]);
  await page.screenshot({ path: testInfo.outputPath("1280-desktop-account-roster.png"), fullPage: true });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.route("**/assets/avatars/book-club/reading-lamp.webp", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` })).toBeVisible();
  await expect(page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).locator("img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/archive-box.webp",
  );
  await page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).click();
  await expect(page.getByRole("dialog", { name: MEMBER_NAME }).getByRole("button", { name: "로그아웃" })).toBeVisible();

  assertNoImageRequestEscaped(imageRequestUrls, new URL(page.url()).host);
});
