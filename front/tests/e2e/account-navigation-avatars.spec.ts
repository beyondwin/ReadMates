import { expect, test, type Page, type Route } from "@playwright/test";

const CLUB_SLUG = "reading-sai";
const APP_BASE = `/clubs/${CLUB_SLUG}/app`;
const MEMBER_NAME = "김독서";
const PUBLIC_AVATAR_SESSION_ID = "public-avatar-record";
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
  avatarKey?: "banana-green-book" | "star-notebook" | "moon-green-book";
};

const sameSurnameMembers: AvatarMember[] = [
  {
    membershipId: "member-squirrel-acorn",
    displayName: "김독서",
    accountName: "김독서",
    role: "HOST",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "banana-green-book",
  },
  {
    membershipId: "member-fennec-heart-mug",
    displayName: "김책가방",
    accountName: "김책가방",
    role: "MEMBER",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "star-notebook",
  },
  {
    membershipId: "member-turtle-winter-book",
    displayName: "김달력책",
    accountName: "김달력책",
    role: "MEMBER",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "moon-green-book",
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

function authResponse(role: FixtureRole = "HOST", avatarKey = "banana-green-book") {
  const currentMembership = avatarKeyFor({
    membershipId: "member-squirrel-acorn",
    clubId: "club-reading-sai",
    clubSlug: CLUB_SLUG,
    displayName: MEMBER_NAME,
    role,
    membershipStatus: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
    avatarKey,
  });

  return {
    authenticated: true,
    userId: "synthetic-reader",
    membershipId: "member-squirrel-acorn",
    clubId: "club-reading-sai",
    email: "reader@example.test",
    displayName: MEMBER_NAME,
    accountName: MEMBER_NAME,
    role,
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    avatarKey,
    currentMembership,
    joinedClubs: [
      {
        clubId: "club-reading-sai",
        clubSlug: CLUB_SLUG,
        clubName: "읽는사이",
        membershipId: "member-squirrel-acorn",
        role,
        status: "ACTIVE",
        primaryHost: null,
      },
    ],
    platformAdmin: null,
    recommendedAppEntryUrl: APP_BASE,
  };
}

function memberProfile(role: FixtureRole = "HOST", avatarKey = "banana-green-book") {
  return avatarKeyFor({
    avatarKey,
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
  let savedAvatarKey = "banana-green-book";

  await page.route("**/api/bff/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/api/me/avatar") && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { avatarKey: string };
      savedAvatarKey = body.avatarKey;
      return json(route, {
        membershipId: "member-squirrel-acorn",
        displayName: MEMBER_NAME,
        accountName: MEMBER_NAME,
        profileImageUrl: null,
        avatarKey: savedAvatarKey,
      });
    }
    if (path.endsWith("/api/auth/me")) return json(route, authResponse(role, savedAvatarKey));
    if (path.endsWith("/api/me/notifications")) {
      return json(route, { items: [], unreadCount: 0, nextCursor: null });
    }
    if (path.endsWith("/api/app/me")) return json(route, memberProfile(role, savedAvatarKey));
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

async function routeSyntheticPublicRecord(page: Page) {
  await page.route("**/api/bff/api/auth/me", (route) => json(route, { authenticated: false }));
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}/sessions/${PUBLIC_AVATAR_SESSION_ID}`, (route) =>
    json(route, {
      sessionId: PUBLIC_AVATAR_SESSION_ID,
      sessionNumber: 8,
      bookTitle: "공개 아바타 기록",
      bookAuthor: "합성 저자",
      bookImageUrl: null,
      date: "2026-08-01",
      summary: "공개 가능한 합성 기록입니다.",
      highlights: [
        {
          text: "함께 읽은 문장",
          sortOrder: 1,
          authorName: "공개 독자",
          authorShortName: "독자",
          avatarKey: "cloud-green-book",
        },
        {
          text: "알 수 없는 키도 안전합니다",
          sortOrder: 2,
          authorName: "안전 독자",
          authorShortName: "안전",
          avatarKey: "not-allowlisted",
        },
      ],
      oneLiners: [
        {
          authorName: "공개 한줄평",
          authorShortName: "한줄",
          avatarKey: "cloud-green-book",
          text: "짧은 공개 감상",
        },
      ],
    }),
  );
}

type ImageNetworkEvidence = {
  requests: string[];
  responses: Array<{ url: string; contentType: string }>;
};

function observeImageNetwork(page: Page): ImageNetworkEvidence {
  const evidence: ImageNetworkEvidence = { requests: [], responses: [] };
  page.on("request", (request) => {
    if (request.resourceType() === "image") evidence.requests.push(request.url());
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "image") {
      evidence.responses.push({ url: response.url(), contentType: response.headers()["content-type"] ?? "" });
    }
  });
  return evidence;
}

function resetImageNetwork(evidence: ImageNetworkEvidence) {
  evidence.requests.length = 0;
  evidence.responses.length = 0;
}

async function assertVisibleAvatarNetwork(evidence: ImageNetworkEvidence, localHost: string, expectedPaths: string[]) {
  await expect.poll(() => new Set(evidence.responses.map(({ url }) => new URL(url).pathname)).size).toBe(expectedPaths.length);
  const requested = evidence.requests.map((url) => new URL(url));
  const responded = evidence.responses.map(({ url }) => new URL(url));
  expect(requested.length).toBeGreaterThan(0);
  expect(new Set(requested.map((url) => url.host))).toEqual(new Set([localHost]));
  expect(requested.every((url) => url.pathname.startsWith("/assets/avatars/book-club/") && url.pathname.endsWith(".webp"))).toBe(true);
  expect(new Set(requested.map((url) => url.pathname))).toEqual(new Set(expectedPaths));
  expect(new Set(requested.map((url) => url.pathname)).size).toBeLessThan(20);
  expect(new Set(responded.map((url) => url.pathname))).toEqual(new Set(expectedPaths));
  expect(evidence.responses.every(({ contentType }) => contentType.startsWith("image/webp"))).toBe(true);
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

test("My Space avatar save refreshes the account identity and persists at mobile and desktop widths", async ({ browser }, testInfo) => {
  const savedAvatarSrc = "/assets/avatars/book-club/cloud-green-book.webp";

  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    await routeSyntheticApp(page);
    await page.goto(`${APP_BASE}/me`);

    const opener = page.getByRole("button", { name: "아바타 바꾸기" });
    const account = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
    await expect(opener.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );
    await expect(account.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );

    await opener.click();
    const dialog = page.getByRole("dialog", { name: "나의 아바타 선택" });
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${width}-my-space-avatar-picker.png`),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "초록 찻잔을 든 고슴도치 선택" }).click();

    await expect(opener.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );
    await expect(account.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );

    await dialog.getByRole("button", { name: "이 아바타로 변경" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(opener.locator("img")).toHaveAttribute("src", savedAvatarSrc);
    await expect(account.locator("img")).toHaveAttribute("src", savedAvatarSrc);
    await page.screenshot({
      path: testInfo.outputPath(`${width}-my-space-avatar-saved.png`),
      fullPage: true,
    });

    await page.reload();

    await expect(page.getByRole("button", { name: "아바타 바꾸기" }).locator("img")).toHaveAttribute(
      "src",
      savedAvatarSrc,
    );
    await expect(page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).locator("img")).toHaveAttribute(
      "src",
      savedAvatarSrc,
    );

    await context.close();
  }
});

test("scoped account navigation preserves local avatar identity across mobile and desktop", async ({ page }, testInfo) => {
  const imageEvidence = observeImageNetwork(page);
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
  await expect(dialog.getByRole("link", { name: "알림" })).toHaveAttribute(
    "href",
    `${APP_BASE}/notifications`,
  );
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
  await expect(desktopNotificationAccount.locator("img")).toHaveAttribute("src", "/assets/avatars/book-club/banana-green-book.webp");
  await page.screenshot({ path: testInfo.outputPath("1280-notifications-account.png"), fullPage: true });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  resetImageNetwork(imageEvidence);
  await page.goto(`${APP_BASE}/session/current`);
  const desktopAccount = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
  await expect(desktopAccount).toContainText(MEMBER_NAME);
  await expect(desktopAccount.locator("img")).toHaveAttribute("src", "/assets/avatars/book-club/banana-green-book.webp");
  const roster = page.getByRole("main").filter({ hasText: "참석자 · 3/3" });
  await expect(roster).toHaveCount(1);
  await expect(roster.getByText(/^김독서/)).toBeVisible();
  await expect(roster.getByText("김책가방", { exact: true })).toBeVisible();
  await expect(roster.getByText("김달력책", { exact: true })).toBeVisible();
  const rosterImages = roster.locator("img");
  await expect(rosterImages).toHaveCount(3);
  expect(await rosterImages.evaluateAll((images) => images.map((image) => image.getAttribute("src")))).toEqual([
    "/assets/avatars/book-club/banana-green-book.webp",
    "/assets/avatars/book-club/star-notebook.webp",
    "/assets/avatars/book-club/moon-green-book.webp",
  ]);
  await page.screenshot({ path: testInfo.outputPath("1280-desktop-account-roster.png"), fullPage: true });
  await assertVisibleAvatarNetwork(imageEvidence, new URL(page.url()).host, [
    "/assets/avatars/book-club/banana-green-book.webp",
    "/assets/avatars/book-club/star-notebook.webp",
    "/assets/avatars/book-club/moon-green-book.webp",
  ]);

  resetImageNetwork(imageEvidence);
  await page.route("**/assets/avatars/book-club/banana-green-book.webp", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` })).toBeVisible();
  await expect(page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).locator("img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/cloud-green-book.webp",
  );
  await page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).click();
  await expect(page.getByRole("dialog", { name: MEMBER_NAME }).getByRole("button", { name: "로그아웃" })).toBeVisible();
});

test("public record requests exactly its visible local WebP avatars", async ({ page }, testInfo) => {
  const imageEvidence = observeImageNetwork(page);
  await routeSyntheticPublicRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/clubs/${CLUB_SLUG}/sessions/${PUBLIC_AVATAR_SESSION_ID}`);

  await expect(page.getByRole("heading", { name: "공개 아바타 기록" })).toBeVisible();
  await expect(page.getByText("공개 독자", { exact: true })).toBeVisible();
  await expect(page.getByText("안전 독자", { exact: true })).toBeVisible();
  await expect(page.getByText("공개 한줄평", { exact: true })).toBeVisible();
  expect(await page.locator("main img").evaluateAll((images) => images.map((image) => image.getAttribute("src")))).toEqual([
    "/assets/avatars/book-club/cloud-green-book.webp",
    "/assets/avatars/book-club/cloud-green-book.webp",
    "/assets/avatars/book-club/cloud-green-book.webp",
  ]);
  await assertVisibleAvatarNetwork(imageEvidence, new URL(page.url()).host, [
    "/assets/avatars/book-club/cloud-green-book.webp",
    "/assets/avatars/book-club/cloud-green-book.webp",
    "/assets/avatars/book-club/cloud-green-book.webp",
  ]);
  await page.screenshot({ path: testInfo.outputPath("1280-public-record-avatars.png"), fullPage: true });
});
