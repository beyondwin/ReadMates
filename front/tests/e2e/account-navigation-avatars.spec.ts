import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const CLUB_SLUG = "reading-sai";
const APP_BASE = `/clubs/${CLUB_SLUG}/app`;
const MEMBER_NAME = "김독서";
const PUBLIC_AVATAR_SESSION_ID = "public-avatar-record";
type FixtureRole = "HOST" | "MEMBER";

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
    membershipId: "member-host",
    displayName: "김독서",
    accountName: "김독서",
    role: "HOST",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "banana-green-book",
  },
  {
    membershipId: "member-reader-2",
    displayName: "김책가방",
    accountName: "김책가방",
    role: "MEMBER",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "star-notebook",
  },
  {
    membershipId: "member-reader-3",
    displayName: "김달력책",
    accountName: "김달력책",
    role: "MEMBER",
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    avatarKey: "moon-green-book",
  },
];

function avatarKeyFor<T extends { avatarKey?: string }>(value: T) {
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
    membershipId: "member-host",
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
    membershipId: "member-host",
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
        membershipId: "member-host",
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

function hostMembersResponse() {
  return {
    items: sameSurnameMembers.map((member, index) => ({
      membershipId: member.membershipId,
      userId: `synthetic-user-${index + 1}`,
      email: `avatar-member-${index + 1}@example.test`,
      displayName: member.displayName,
      accountName: member.accountName,
      profileImageUrl: null,
      avatarKey: member.avatarKey,
      role: member.role,
      status: "ACTIVE",
      joinedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      currentSessionParticipationStatus: "ACTIVE",
      canSuspend: member.role !== "HOST",
      canRestore: false,
      canDeactivate: member.role !== "HOST",
      canAddToCurrentSession: false,
      canRemoveFromCurrentSession: member.role !== "HOST",
    })),
    nextCursor: null,
  };
}

function hostSessionDetailResponse() {
  return {
    sessionId: "session-avatar-roster",
    sessionNumber: 8,
    title: "아바타 확인 모임",
    bookTitle: "같이 읽는 책",
    bookAuthor: "합성 저자",
    bookLink: null,
    bookImageUrl: null,
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    date: "2026-08-01",
    startTime: "19:30",
    endTime: "21:30",
    questionDeadlineAt: "2026-08-01T10:00:00Z",
    visibility: "HOST_ONLY",
    publication: null,
    state: "OPEN",
    attendees: sameSurnameMembers.map((member) => ({ ...member, participationStatus: "ACTIVE" })),
    feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
  };
}

function hostRecordEditorResponse() {
  const liveSnapshot = {
    schema: "readmates-session-record:v1",
    visibility: "HOST_ONLY",
    publicationSummary: "",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: { fileName: "", title: "", markdown: "" },
  };
  return {
    sessionId: "session-avatar-roster",
    liveRevision: 0,
    liveSessionUpdatedAt: "2026-08-01T00:00:00Z",
    liveSnapshot,
    draft: null,
    draftLiveBaseStale: false,
    validationSummary: { valid: true, issues: [] },
  };
}

async function routeSyntheticApp(
  page: Page,
  role: FixtureRole = "HOST",
  initialAvatarKey = "banana-green-book",
) {
  let savedAvatarKey = initialAvatarKey;

  await page.route("**/api/bff/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/api/me/profile") && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { displayName: string; avatarKey: string };
      expect(body.displayName).toBe(MEMBER_NAME);
      savedAvatarKey = body.avatarKey;
      return json(route, {
        membershipId: "member-host",
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
    if (path.endsWith("/api/notes/feed")) return json(route, { items: [], nextCursor: null });
    if (path.endsWith("/api/sessions/upcoming")) return json(route, []);
    if (path.endsWith("/api/host/members")) return json(route, hostMembersResponse());
    if (path.endsWith("/api/host/sessions/session-avatar-roster")) return json(route, hostSessionDetailResponse());
    if (path.endsWith("/api/host/sessions/session-avatar-roster/record-editor")) return json(route, hostRecordEditorResponse());
    if (path.endsWith("/api/host/sessions/session-avatar-roster/history")) return json(route, { items: [], nextCursor: null });
    if (path.endsWith("/api/host/notifications/manual/dispatches")) return json(route, { items: [], nextCursor: null });

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
  const uniqueExpectedPaths = new Set(expectedPaths);
  await expect.poll(() => new Set(evidence.responses.map(({ url }) => new URL(url).pathname)).size).toBe(uniqueExpectedPaths.size);
  const requested = evidence.requests.map((url) => new URL(url));
  const responded = evidence.responses.map(({ url }) => new URL(url));
  expect(requested.length).toBeGreaterThan(0);
  expect(new Set(requested.map((url) => url.host))).toEqual(new Set([localHost]));
  expect(requested.every((url) => url.pathname.startsWith("/assets/avatars/book-club/") && url.pathname.endsWith(".webp"))).toBe(true);
  expect(new Set(requested.map((url) => url.pathname))).toEqual(uniqueExpectedPaths);
  expect(new Set(responded.map((url) => url.pathname))).toEqual(uniqueExpectedPaths);
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

async function expectFrameFreeArtwork(locator: Locator) {
  await expect(locator).toHaveClass(/rm-avatar-chip--artwork/);
  await expect(locator).not.toHaveAttribute("data-rsvp-status");
  await expect.poll(() => locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderWidth, style.borderRadius, style.backgroundColor, style.overflow];
  })).toEqual(["0px", "0px", "rgba(0, 0, 0, 0)", "visible"]);
}

async function expectAvatarRoleSize(
  avatar: Locator,
  role: string,
  expectedSize: number,
) {
  await expect(avatar).toHaveAttribute("data-avatar-size-role", role);
  await expect.poll(
    () => avatar.evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(expectedSize);
}

async function expectVisibleLocalArtwork(page: Page, evidence: ImageNetworkEvidence) {
  const artwork = page.locator(".rm-avatar-chip--artwork:visible");
  await expect(artwork.first()).toBeVisible();
  await expectFrameFreeArtwork(artwork.first());
  const expectedPaths = await artwork.locator("img").evaluateAll((images) =>
    images.map((image) => new URL((image as HTMLImageElement).src).pathname),
  );
  await assertVisibleAvatarNetwork(evidence, new URL(page.url()).host, expectedPaths);
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

test("My Space keeps a long poetic avatar caption wrapped below its artwork", async ({ page }) => {
  await routeSyntheticApp(page, "MEMBER", "moon-green-book");

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${APP_BASE}/me`);

    const figure = page.locator(".rm-member-profile__avatar-figure");
    const artwork = figure.locator(".rm-member-profile__avatar");
    const caption = figure.locator("figcaption");
    await expect(caption).toHaveText("밤의 페이지를 지키는 초승달");
    const geometry = await figure.evaluate((element) => {
      const artworkElement = element.querySelector(".rm-member-profile__avatar");
      const captionElement = element.querySelector("figcaption");
      if (!artworkElement || !captionElement) throw new Error("avatar figure is incomplete");
      const figureBox = element.getBoundingClientRect();
      const artworkBox = artworkElement.getBoundingClientRect();
      const captionBox = captionElement.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(captionElement);
      return {
        lineCount: range.getClientRects().length,
        overflowWrap: getComputedStyle(captionElement).overflowWrap,
        horizontalContentFits: captionElement.scrollWidth <= captionElement.clientWidth + 1,
        verticalContentFits: captionElement.scrollHeight <= captionElement.clientHeight + 1,
        captionBelowArtwork: captionBox.top >= artworkBox.bottom - 1,
        captionInsideFigure:
          captionBox.left >= figureBox.left - 1
          && captionBox.right <= figureBox.right + 1
          && captionBox.bottom <= figureBox.bottom + 1,
      };
    });

    await expect(artwork).toBeVisible();
    expect(geometry.lineCount).toBeGreaterThanOrEqual(2);
    expect(geometry.overflowWrap).toBe("anywhere");
    expect(geometry.horizontalContentFits).toBe(true);
    expect(geometry.verticalContentFits).toBe(true);
    expect(geometry.captionBelowArtwork).toBe(true);
    expect(geometry.captionInsideFigure).toBe(true);
  }
});

test("desktop member-home shortcut divider stays inset and clear of link content", async ({ page }) => {
  await routeSyntheticApp(page, "MEMBER");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(APP_BASE);

  const shortcuts = page.locator(".rm-member-home-desktop .rm-member-home-shortcuts");
  const links = shortcuts.locator(".rm-member-home-shortcuts__link");
  await expect(shortcuts).toBeVisible();
  await expect(links).toHaveCount(2);
  const dividerGeometry = await shortcuts.evaluate((element) => {
    const linkElements = Array.from(element.querySelectorAll<HTMLElement>(".rm-member-home-shortcuts__link"));
    const second = linkElements[1];
    const label = second?.querySelector<HTMLElement>(".body");
    const chevron = second?.querySelector<HTMLElement>(".rm-recent-record__destination-chevron");
    if (!second || !label || !chevron) throw new Error("shortcut divider fixture is incomplete");
    const surfaceBox = element.getBoundingClientRect();
    const secondBox = second.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    const chevronBox = chevron.getBoundingClientRect();
    const divider = getComputedStyle(second, "::before");
    const dividerLeft = secondBox.left + Number.parseFloat(divider.left);
    const dividerRight = secondBox.right - Number.parseFloat(divider.right);
    const dividerY = secondBox.top + Number.parseFloat(divider.top);
    return {
      content: divider.content,
      borderTopWidth: divider.borderTopWidth,
      dividerInsideSurface: dividerLeft >= surfaceBox.left && dividerRight <= surfaceBox.right,
      dividerClearsLabel: dividerY < labelBox.top,
      dividerClearsChevron: dividerY < chevronBox.top,
      surfaceContainsLinks: linkElements.every((link) => {
        const box = link.getBoundingClientRect();
        return box.left >= surfaceBox.left && box.right <= surfaceBox.right;
      }),
    };
  });

  expect(dividerGeometry.content).not.toBe("none");
  expect(dividerGeometry.borderTopWidth).toBe("1px");
  expect(dividerGeometry.dividerInsideSurface).toBe(true);
  expect(dividerGeometry.dividerClearsLabel).toBe(true);
  expect(dividerGeometry.dividerClearsChevron).toBe(true);
  expect(dividerGeometry.surfaceContainsLinks).toBe(true);
});

test("My Space avatar save refreshes the account identity and persists at mobile and desktop widths", async ({ browser }, testInfo) => {
  const savedAvatarSrc = "/assets/avatars/book-club/teacup-green-book.webp";

  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const imageEvidence = observeImageNetwork(page);
    await routeSyntheticApp(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    resetImageNetwork(imageEvidence);
    await page.goto(`${APP_BASE}/me`);

    const profileAvatar = page.locator(".rm-member-profile__avatar img");
    const opener = page.getByRole("button", { name: "프로필 편집" });
    const account = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
    await expectAvatarRoleSize(
      page.locator(".rm-member-profile__avatar"),
      "profile",
      width === 390 ? 64 : 88,
    );
    await expectAvatarRoleSize(account.locator(".rm-avatar-chip"), "navigation", 36);
    await expect(page.locator(".rm-member-profile__avatar-figure figcaption")).toHaveText("한 장 더 읽는 바나나");
    await expect(profileAvatar).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );
    await expect(account.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );

    await opener.click();
    const dialog = page.getByRole("dialog", { name: "프로필 편집" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "아바타 선택, 현재 한 장 더 읽는 바나나" }).click();
    const picker = page.getByRole("dialog", { name: "아바타 선택" });
    await expect(picker.locator(".rm-avatar-picker__label")).toHaveCount(30);
    const selectedTile = picker.getByRole("button", {
      name: "한 장 더 읽는 바나나, 초록 책을 읽는 바나나 선택",
    });
    const selectedArtwork = selectedTile.locator(".rm-avatar-chip");
    await expectAvatarRoleSize(selectedArtwork, "picker", width === 390 ? 58 : 64);
    const selectedTileBox = await selectedTile.boundingBox();
    expect(selectedTileBox).not.toBeNull();
    await expect(selectedTile.locator(".rm-avatar-picker__check")).toHaveCount(0);
    expect(selectedTileBox!.height).toBeLessThanOrEqual(width === 390 ? 126 : 136);
    await page.screenshot({
      path: testInfo.outputPath(`${width}-my-space-avatar-picker.png`),
      fullPage: true,
    });
    await expectVisibleLocalArtwork(page, imageEvidence);
    await picker.getByRole("button", { name: "책 곁에 머문 찻잔, 초록 책을 읽는 찻잔 선택" }).click();

    await expect(account.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );

    await picker.getByRole("button", { name: "선택 완료" }).click();
    await expectFrameFreeArtwork(dialog.locator(".rm-profile-editor__avatar-action .rm-avatar-chip"));
    resetImageNetwork(imageEvidence);
    await dialog.getByRole("button", { name: "변경사항 저장" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(profileAvatar).toHaveAttribute("src", savedAvatarSrc);
    await expect(account.locator("img")).toHaveAttribute("src", savedAvatarSrc);
    await expect(page.locator(".rm-member-profile__avatar-figure figcaption")).toHaveText("책 곁에 머문 찻잔");
    await expectFrameFreeArtwork(account.locator(".rm-avatar-chip"));
    await expectVisibleLocalArtwork(page, imageEvidence);
    await page.screenshot({
      path: testInfo.outputPath(`${width}-my-space-avatar-saved.png`),
      fullPage: true,
    });

    await page.reload();

    await expect(page.locator(".rm-member-profile__avatar img")).toHaveAttribute("src", savedAvatarSrc);
    await expect(page.locator(".rm-member-profile__avatar-figure figcaption")).toHaveText("책 곁에 머문 찻잔");
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
  const narrowAccount = page.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` });
  await expect(narrowAccount).toBeVisible();
  await expectAvatarRoleSize(narrowAccount.locator(".rm-avatar-chip"), "navigation", 36);
  await page.screenshot({ path: testInfo.outputPath("320-member-header.png"), fullPage: true });
  await page.getByRole("link", { name: "호스트 화면" }).click();
  await expect(page).toHaveURL(`${APP_BASE}/host`);
  const hostHeader = page.getByRole("banner");
  await expect(hostHeader.getByRole("link", { name: "멤버 화면으로" })).toBeVisible();
  await expect(hostHeader.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` })).toBeVisible();
  await hostHeader.getByRole("button", { name: `${MEMBER_NAME} 계정 메뉴` }).click();
  await expect(page.getByRole("dialog", { name: MEMBER_NAME }).getByRole("button", { name: "로그아웃" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("320-host-account-popover.png"),
    animations: "disabled",
  });

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
  await expectFrameFreeArtwork(roster.locator(".rm-avatar-chip").first());
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

test("member roster and host attendance/member artwork stay frame-free at mobile and desktop widths", async ({ browser }, testInfo) => {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const imageEvidence = observeImageNetwork(page);
    await routeSyntheticApp(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    resetImageNetwork(imageEvidence);
    await page.goto(`${APP_BASE}/session/current`);
    const roster = page.getByRole("main").filter({ hasText: "참석자 · 3/3" });
    await expect(roster.getByText("김책가방", { exact: true })).toBeVisible();
    await expect(roster.getByText("김달력책", { exact: true })).toBeVisible();
    await expectAvatarRoleSize(
      roster.locator(".rm-avatar-chip").first(),
      "member",
      width === 390 ? 34 : 38,
    );
    await expectVisibleLocalArtwork(page, imageEvidence);
    await page.screenshot({ path: testInfo.outputPath(`${width}-current-session-roster.png`), fullPage: true });

    resetImageNetwork(imageEvidence);
    await page.goto(`${APP_BASE}/host/sessions/session-avatar-roster/edit?section=attendance`);
    await expect(page.getByRole("heading", { name: "출석 확정 명단" })).toBeVisible();
    await expect(page.getByRole("button", { name: "김책가방 참석" })).toBeVisible();
    await expectAvatarRoleSize(
      page.locator("#host-editor-panel-attendance .rm-avatar-chip").first(),
      "member",
      width === 390 ? 34 : 38,
    );
    await expectVisibleLocalArtwork(page, imageEvidence);
    await page.screenshot({ path: testInfo.outputPath(`${width}-host-attendance.png`), fullPage: true });

    resetImageNetwork(imageEvidence);
    await page.goto(`${APP_BASE}/host/members`);
    await expect(page.getByRole("tablist", { name: "멤버 관리" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "김책가방" })).toBeVisible();
    const memberCard = page.locator(".rm-host-members-page__body article", {
      has: page.getByRole("heading", { name: "김책가방" }),
    });
    await expectAvatarRoleSize(
      memberCard.locator(".rm-avatar-chip"),
      "member",
      width === 390 ? 34 : 38,
    );
    await expectVisibleLocalArtwork(page, imageEvidence);
    await page.screenshot({ path: testInfo.outputPath(`${width}-host-members.png`), fullPage: true });

    await context.close();
  }
});

test("public record requests exactly its visible local WebP avatars at mobile and desktop widths", async ({ browser }, testInfo) => {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const imageEvidence = observeImageNetwork(page);
    await routeSyntheticPublicRecord(page);
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
    await expectAvatarRoleSize(
      page.locator(".public-note-author-row .rm-avatar-chip").first(),
      "dense",
      30,
    );
    await expectVisibleLocalArtwork(page, imageEvidence);
    await page.screenshot({ path: testInfo.outputPath(`${width}-public-record-avatars.png`), fullPage: true });
    await context.close();
  }
});
