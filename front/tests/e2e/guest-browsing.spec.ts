import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const clubSlug = "reading-sai";
const clubBase = `/clubs/${clubSlug}`;
const appBase = `${clubBase}/app`;
const emptyClubAppBase = "/clubs/sample-book-club/app";
const seededArchiveSessionId = "00000000-0000-0000-0000-000000000301";
const seededArchivePath = `${appBase}/sessions/${seededArchiveSessionId}`;

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  cleanupGeneratedSessions();
  createOpenSessionFixture({ accessScope: "GUEST_READABLE" });
  resetSeedGoogleLogins(["member1@example.com"]);
});

test.afterEach(() => {
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["member1@example.com"]);
});

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

async function expectNoPersistentGuestConversion(page: Page) {
  await expect(page.getByRole("link", { name: "공개 홈으로 나가기" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "멤버로 시작", exact: true })).toHaveCount(0);
}

async function expectReadOnlyCurrentSessionControls(page: Page) {
  for (const label of ["참석", "아직 미정", "불참", "진행률 저장", "질문 저장", "서평 저장"]) {
    await expect(page.getByRole("button", { name: label }).first()).toBeDisabled();
  }
  await expect(page.getByRole("slider", { name: "읽기 진행률" }).first()).toBeDisabled();
}

async function expectTapTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectWithinViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth + 1;
    }))
    .toBe(true);
  await expectNoHorizontalOverflow(page);
}

async function expectMobileNavigationClearance(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const tabbar = page.locator(".m-tabbar");
  await expect(tabbar).toBeVisible();
  const targetBox = await target.boundingBox();
  const tabbarBox = await tabbar.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(tabbarBox).not.toBeNull();
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(tabbarBox!.y);
  expect(tabbarBox!.y + tabbarBox!.height).toBeLessThanOrEqual((await page.viewportSize())!.height + 1);
  for (const tab of await tabbar.locator(".m-tab").all()) await expectTapTarget(tab);
}

test("guest app headers omit persistent conversion and public-home actions", async ({ page }) => {
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    await page.goto(`${appBase}/archive?view=report#sessions`);

    const header = page.locator(width < 720 ? ".mobile-only .m-hdr" : ".desktop-only .topnav");
    await expect(header).toBeVisible();
    await expect(header.getByLabel("게스트 계정")).toHaveCount(0);
    await expect(header.getByRole("link", { name: "공개 홈으로 나가기" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "멤버로 시작", exact: true })).toHaveCount(0);
  }
});

test("anonymous visitors enter from public surfaces and browse guest-readable club records", async ({ page }) => {
  const nonPublicRequests: string[] = [];
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.stack ?? error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/bff/api/")) {
      const allowed = path.startsWith("/api/bff/api/public/")
        || path === "/api/bff/api/auth/me";
      if (!allowed) nonPublicRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(clubBase);
  await expect(page.getByRole("link", { name: "둘러보기", exact: true }).first()).toHaveAttribute("href", appBase);
  await expect(page.getByRole("link", { name: "멤버로 시작", exact: true }).first()).toHaveAttribute(
    "href",
    `/login?returnTo=${encodeURIComponent(appBase)}`,
  );

  await page.getByRole("link", { name: "둘러보기", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`${appBase}/?$`));
  await expect.poll(() => runtimeErrors).toEqual([]);
  await expect(failedResponses).toEqual([]);
  await expect(page.locator(".rm-member-home-desktop").getByRole("heading", { name: /게스트님,.*E2E 현재 세션 책.*함께 읽어요/ })).toBeVisible();
  await expect(page.locator(".rm-member-home-desktop").getByText("다음 달 선정", { exact: true })).toBeVisible();
  const desktopHeader = page.locator(".desktop-only .topnav");
  await expect(desktopHeader.getByLabel("게스트 계정")).toHaveCount(0);
  await expectNoPersistentGuestConversion(page);

  const nav = page.getByRole("navigation", { name: "앱 내비게이션" });
  await expect(nav.getByRole("link", { name: "노트" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "기록" })).toBeVisible();

  await page.goto(`${appBase}/session/current`);
  await expect(page.getByRole("heading", { name: "E2E 현재 세션 책" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "세션 준비" })).toBeVisible();
  await expectReadOnlyCurrentSessionControls(page);
  await expectNoPersistentGuestConversion(page);

  await page.goto(`${appBase}/notes`);
  await expect(page.getByText("세션을 먼저 고르고, 하이라이트·한줄평·질문을 작성자와 함께 훑는 클럽 기록장입니다.")).toBeVisible();
  await expectNoPersistentGuestConversion(page);

  await page.goto(`${appBase}/archive`);
  await expect(page.getByRole("heading", { name: "기록 저장소" })).toBeVisible();
  await expect(page.getByRole("link", { name: /No\.1 .* 열기/ }).first()).toBeVisible();
  await expectNoPersistentGuestConversion(page);

  await page.goto(seededArchivePath);
  await expect(page.getByRole("heading", { name: "요약" })).toBeVisible();
  await expect(page.getByRole("button", { name: "피드백 보기", exact: true })).toBeVisible();
  await expectNoPersistentGuestConversion(page);

  await page.goto(`${appBase}/feedback/${seededArchiveSessionId}`);
  await expect(page.getByRole("heading", { name: "정식 멤버에게 열립니다" })).toBeVisible();
  await expect(page.getByRole("link", { name: "멤버로 시작", exact: true })).toHaveCount(1);

  await page.goto(`${appBase}/me`);
  await expect(page.getByRole("heading", { name: "내 공간" })).toBeVisible();
  await expect(page.getByRole("link", { name: "멤버로 시작", exact: true })).toHaveCount(1);

  await page.goto(`${appBase}/host`);
  await expect(page).toHaveURL(new RegExp(`${appBase}/?$`));
  await expect(page.locator(".rm-member-home-desktop").getByRole("heading", { name: /게스트님,.*E2E 현재 세션 책.*함께 읽어요/ })).toBeVisible();
  await expectNoPersistentGuestConversion(page);

  await page.goto(`/clubs/sample-book-club/app/sessions/${seededArchiveSessionId}`);
  await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다." })).toBeVisible();
  expect(nonPublicRequests).toEqual([]);

  const navBox = await page.locator(".nav-links").boundingBox();
  expect(navBox).not.toBeNull();
  await expect(page.locator(".topnav-account-actions")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("guest note session links keep public route continuity without opening a conversion lock", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${appBase}/notes?filter=highlights`);

  const nextSession = page.getByRole("link", { name: "No.05 지대넓얕 무한 세션 보기" });
  await expect(nextSession).toBeVisible();
  await nextSession.click();

  await expect(page).toHaveURL(
    `${appBase}/notes?sessionId=00000000-0000-0000-0000-000000000305&filter=highlights`,
  );
  await expect(page.getByRole("heading", { level: 1, name: "지대넓얕 무한" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "정식 멤버에게 열립니다" })).toHaveCount(0);
  await expectNoPersistentGuestConversion(page);
});

test("public club without an open guest session renders the normal empty state", async ({ page }) => {
  await page.goto(`${emptyClubAppBase}/session/current`);

  await expect(page.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeVisible();
  await expect(page.getByText("페이지를 불러오지 못했습니다")).toHaveCount(0);
});

test("멤버로 시작 OAuth 오류가 안전한 ReadMates 복구 화면으로 이어진다", async ({ page }) => {
  await page.route("**/api/bff/api/auth/oauth/join-intent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intent: "browser-issued-intent-000000000000000",
        expiresAt: "2026-08-02T02:00:00Z",
      }),
    });
  });
  await page.route("**/oauth2/authorization/google**", async (route) => {
    await route.fulfill({
      status: 302,
      headers: {
        Location:
          "/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Fsample-book-club%2Fapp",
      },
    });
  });

  for (const width of [320, 1366]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    await page.goto("/clubs/sample-book-club");
    await page.getByRole("link", { name: "멤버로 시작", exact: true }).first().click();

    await expect(page).toHaveURL(
      "/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Fsample-book-club%2Fapp",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "로그인을 시작할 수 없습니다." }),
    ).toBeVisible();
    await expect(page.getByText("입력하거나 변경한 내용은 없습니다.")).toBeVisible();
    const primaryAction = page.getByRole("link", { name: "클럽으로 돌아가기" });
    await expect(primaryAction).toHaveAttribute("href", "/clubs/sample-book-club/app");
    await expect(page.getByRole("link", { name: "공개 홈" })).toHaveAttribute("href", "/");
    await expectTapTarget(primaryAction);
    await expectNoHorizontalOverflow(page);

    await primaryAction.focus();
    const focusStyle = await primaryAction.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(focusStyle.outlineStyle).toBe("solid");
    expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
    await expect(page.locator("body")).not.toContainText(
      /\{\s*"|Whitelabel|ECONNREFUSED|joinIntent|browser-issued-intent/,
    );
  }
});

test("authenticated users keep public browse and explicit target join actions", async ({ page }) => {
  await loginWithGoogleFixture(page, "member1@example.com");
  let issuedIntentRequests = 0;
  let oauthStartUrl = "";
  await page.route("**/api/bff/api/auth/oauth/join-intent", async (route) => {
    issuedIntentRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ intent: "browser-issued-intent-000000000000000", expiresAt: "2026-08-02T02:00:00Z" }),
    });
  });
  await page.route("**/oauth2/authorization/google**", async (route) => {
    oauthStartUrl = route.request().url();
    await route.fulfill({ status: 204 });
  });

  for (const path of ["/clubs/sample-book-club", `${clubBase}/about`, `${clubBase}/records`, `${clubBase}/sessions/${seededArchiveSessionId}`]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "둘러보기", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "멤버로 시작", exact: true }).first()).toBeVisible();
  }

  await page.goto("/clubs/sample-book-club");
  await page.getByRole("link", { name: "멤버로 시작", exact: true }).first().click();
  await expect.poll(() => issuedIntentRequests).toBe(1);
  await expect.poll(() => oauthStartUrl).toContain("joinClub=sample-book-club");
  expect(oauthStartUrl).toContain("joinIntent=browser-issued-intent-000000000000000");
});

test("guest lock dialog stays compact and accessible across mobile and desktop", async ({ page }) => {
  for (const width of [320, 390, 1366]) {
    const height = width < 720 ? 844 : 900;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(seededArchivePath);

    const feedbackAction = page.getByRole("button", { name: "피드백 보기", exact: true });
    await feedbackAction.scrollIntoViewIfNeeded();
    await expect(feedbackAction).toBeVisible();
    await expectTapTarget(feedbackAction);
    await expectNoHorizontalOverflow(page);
    expect(await feedbackAction.evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");

    if (width < 720) {
      const tabbar = page.locator(".m-tabbar");
      const actionBox = await feedbackAction.boundingBox();
      const tabbarBox = await tabbar.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(tabbarBox).not.toBeNull();
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(tabbarBox!.y);
      expect(await feedbackAction.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const parentRect = element.parentElement!.getBoundingClientRect();
        return Math.abs(rect.width - parentRect.width);
      })).toBeLessThanOrEqual(1);
    }

    await feedbackAction.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "정식 멤버에게 열립니다" });
    const close = dialog.getByRole("button", { name: "닫기" });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expectTapTarget(close);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    if (width < 720) {
      expect(Math.abs(dialogBox!.width - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(dialogBox!.y + dialogBox!.height - height)).toBeLessThanOrEqual(1);
      expect(dialogBox!.height).toBeLessThan(360);
    } else {
      expect(dialogBox!.width).toBeLessThanOrEqual(420);
      expect(dialogBox!.height).toBeLessThan(320);
      expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    }
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect(await close.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe("0px");
    const animationDurationSeconds = await dialog.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).animationDuration),
    );
    expect(animationDurationSeconds).toBeLessThanOrEqual(0.001);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(feedbackAction).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

    await feedbackAction.click();
    await expect(dialog).toBeVisible();
    await page.locator(".rm-guest-lock-dialog-backdrop").click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
    await expect(feedbackAction).toBeFocused();

    await feedbackAction.click();
    await expect(dialog).toBeVisible();
    const conversion = dialog.getByRole("link", { name: "멤버로 시작", exact: true });
    await expect(conversion).toHaveCount(1);
    await conversion.scrollIntoViewIfNeeded();
    await expect(conversion).toHaveAttribute(
      "href",
      `/login?returnTo=${encodeURIComponent(`${appBase}/feedback/${seededArchiveSessionId}`)}`,
    );
    await expectTapTarget(conversion);
  }
});

test("public entry and every guest reading surface remain responsive at mobile and desktop widths", async ({ page }) => {
  const surfaces = [
    { path: clubBase, target: () => page.getByRole("link", { name: "둘러보기", exact: true }).first(), clearanceTarget: () => page.getByRole("link", { name: "둘러보기", exact: true }).first(), app: false },
    { path: appBase, target: () => page.locator(".rm-member-home-desktop:visible h1, .rm-member-home-mobile:visible h1").first(), clearanceTarget: () => page.locator(".rm-member-home-desktop:visible h1, .rm-member-home-mobile:visible h1").first(), app: true },
    { path: `${appBase}/session/current`, target: () => page.getByRole("heading", { name: "E2E 현재 세션 책" }), clearanceTarget: () => page.getByRole("heading", { name: "E2E 현재 세션 책" }), app: true },
    { path: `${appBase}/notes`, target: () => page.getByText("세션을 먼저 고르고, 하이라이트·한줄평·질문을 작성자와 함께 훑는 클럽 기록장입니다."), clearanceTarget: () => page.getByRole("button", { name: /^전체/ }).first(), app: true },
    { path: `${appBase}/archive`, target: () => page.locator(".rm-archive-page h1:visible"), clearanceTarget: () => page.getByRole("link", { name: /No\.1 .* 열기/ }), app: true },
    { path: seededArchivePath, target: () => page.getByRole("button", { name: "피드백 보기", exact: true }), clearanceTarget: () => page.getByRole("button", { name: "피드백 보기", exact: true }), app: true },
  ];

  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    for (const surface of surfaces) {
      await page.goto(surface.path);
      const target = surface.target();
      await expectWithinViewport(target, page);
      const tagName = await target.evaluate((element) => element.tagName);
      if (tagName === "A" || tagName === "BUTTON") {
        await target.focus();
        expect(await target.evaluate((element) => getComputedStyle(element).outlineWidth)).not.toBe("0px");
      }
      if (surface.app && width < 720) {
        await expectMobileNavigationClearance(page, surface.clearanceTarget());
      }
    }
  }
});

test("a mounted production read expiry preserves content and offers exact-route guest continuation", async ({ page }) => {
  await loginWithGoogleFixture(page, "member1@example.com");
  const returnPath = `${appBase}/sessions/${seededArchiveSessionId}?view=summary#questions`;
  await page.goto(returnPath);
  await expect(page.getByRole("heading", { name: "요약" })).toBeVisible();

  let expiredMountedReads = 0;
  await page.route(
    new RegExp(`/api/bff/api/archive/sessions/${seededArchiveSessionId}(?:\\?|$)`),
    (route) => {
      expiredMountedReads += 1;
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"session expired"}' });
    },
  );
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 31_000;
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });

  const recovery = page.getByRole("status").filter({ hasText: "로그인 시간이 만료되었습니다" });
  await expect(recovery).toBeVisible();
  expect(expiredMountedReads).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "요약" })).toBeVisible();
  await expect(recovery.getByRole("link", { name: "재로그인" })).toHaveAttribute(
    "href",
    `/login?returnTo=${encodeURIComponent(returnPath)}`,
  );
  const continueAsGuest = recovery.getByRole("button", { name: "게스트로 계속 보기" });
  await expect(continueAsGuest).toBeVisible();
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    await expectWithinViewport(recovery, page);
    await expectTapTarget(recovery.getByRole("link", { name: "재로그인" }));
    await expectTapTarget(continueAsGuest);
    if (width < 720) await expectMobileNavigationClearance(page, recovery);
  }
  await continueAsGuest.click();

  await expect(page).toHaveURL(new RegExp(`${seededArchiveSessionId}\\?view=summary#questions$`));
  await expect(page.getByRole("heading", { name: "요약" })).toBeVisible();
  const guestHeader = page.locator(".desktop-only .topnav");
  await expect(guestHeader.getByLabel("게스트 계정")).toHaveCount(0);
  await expect(guestHeader.getByRole("link", { name: "공개 홈으로 나가기" })).toHaveCount(0);
  await expect(guestHeader.getByRole("link", { name: "멤버로 시작", exact: true })).toHaveCount(0);
  await expect(recovery).toBeHidden();
});

test("a default protected loader 401 forces login recovery with the exact return target", async ({ page }) => {
  await loginWithGoogleFixture(page, "member1@example.com");
  let expiredLoaderReads = 0;
  await page.route(/\/api\/bff\/api\/archive\/sessions(?:\?|$)/, async (route) => {
    expiredLoaderReads += 1;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"error":"session expired"}',
    });
  });

  const target = `${appBase}/archive?view=reviews#latest`;
  await page.goto(target);

  await expect(page).toHaveURL(`/login?returnTo=${encodeURIComponent(target)}`);
  expect(expiredLoaderReads).toBeGreaterThan(0);
});

test("failed guest conversion places its desktop error on a clean full-width row", async ({ page }) => {
  await loginWithGoogleFixture(page, "member1@example.com");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(seededArchivePath);
  await expect(page.getByRole("heading", { name: "요약" })).toBeVisible();

  await page.route(
    new RegExp(`/api/bff/api/archive/sessions/${seededArchiveSessionId}(?:\\?|$)`),
    (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"session expired"}' }),
  );
  await page.route(/\/api\/bff\/api\/auth\/logout$/, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"logout failed"}' }),
  );
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 31_000;
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });

  const recovery = page.getByRole("status", { name: "로그인 세션 만료" });
  await recovery.getByRole("button", { name: "게스트로 계속 보기" }).click();
  const error = recovery.getByRole("alert");
  await expect(error).toBeVisible();

  const [bannerBox, copyBox, actionsBox, errorBox] = await Promise.all([
    recovery.boundingBox(),
    recovery.locator(".rm-session-expiry__copy").boundingBox(),
    recovery.locator(".rm-session-expiry__actions").boundingBox(),
    error.boundingBox(),
  ]);
  expect(bannerBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(errorBox).not.toBeNull();
  expect(errorBox!.y).toBeGreaterThanOrEqual(
    Math.max(copyBox!.y + copyBox!.height, actionsBox!.y + actionsBox!.height) - 1,
  );
  expect(errorBox!.width).toBeGreaterThanOrEqual(bannerBox!.width - 40);
});

test("write 401 preserves the current-session draft and only offers reauthentication", async ({ page }) => {
  await loginWithGoogleFixture(page, "member1@example.com");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${appBase}/session/current`);
  await expect(page.getByRole("heading", { name: "E2E 현재 세션 책" })).toBeVisible();

  await page.route(/\/api\/bff\/api\/sessions\/current\/questions(?:\?|$)/, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"session expired"}' });
      return;
    }
    await route.continue();
  });

  const question = page.locator(".desktop-only").getByRole("textbox", { name: "질문 1 내용" });
  await question.fill("만료 뒤에도 남아야 하는 질문");
  await page.locator(".desktop-only").getByRole("button", { name: "질문 저장" }).click();

  const recovery = page.getByRole("status").filter({ hasText: "로그인 시간이 만료되었습니다" });
  await expect(recovery).toBeVisible();
  await expect(question).toHaveValue("만료 뒤에도 남아야 하는 질문");
  await expect(recovery.getByRole("link", { name: "재로그인" })).toBeVisible();
  await expect(recovery.getByRole("button", { name: "게스트로 계속 보기" })).toHaveCount(0);
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    await expectWithinViewport(recovery, page);
    await expectTapTarget(recovery.getByRole("link", { name: "재로그인" }));
    if (width < 720) await expectMobileNavigationClearance(page, recovery);
  }
});
