import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  mockMemberParticipationProfile,
  mockMyReadingShelfJourney,
} from "./my-reading-shelf-fixtures";
import {
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const memberEmail = "member1@example.com";
const scopedAppPath = "/clubs/reading-sai/app";

async function expectPracticalTapTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectDomOrder(...locators: Locator[]) {
  const indexes = await Promise.all(
    locators.map((locator) =>
      locator.evaluate((element) =>
        Array.from(document.querySelectorAll("*")).indexOf(element),
      ),
    ),
  );
  expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
}

async function pressTabUntilFocused(
  page: Page,
  target: Locator,
  label: string,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      await expect(target).toBeFocused();
      const focusStyle = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
        };
      });
      expect(focusStyle.outlineStyle).toBe("solid");
      expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
      return;
    }
  }

  throw new Error(`Tab did not reach ${label}`);
}

async function expectParticipationSemanticOrder(page: Page) {
  const shelf = page.locator(".rm-my-shelf");
  await expectDomOrder(
    shelf.getByRole("heading", { level: 1, name: "나의 서재" }),
    shelf.getByRole("heading", { level: 2, name: /함께한 모임/ }),
    shelf.getByRole("list", { name: "최근 참여 대상 회차" }),
    shelf.getByRole("link", { name: "이번 세션 보기" }),
    shelf.getByRole("heading", { level: 2, name: "나의 읽기 기록" }),
    shelf.getByRole("link", { name: "내 책별 기록 전체 보기" }),
    shelf.getByRole("heading", { level: 2, name: "계정" }),
    shelf.getByRole("button", { name: "로그아웃" }),
  );
}

test.beforeEach(() => {
  resetSeedGoogleLogins([memberEmail]);
});

test.afterEach(() => {
  resetSeedGoogleLogins([memberEmail]);
});

test("member shelf shows participation journey and opens the full personal history", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  await expect(page.getByRole("heading", { level: 1, name: "나의 서재" })).toBeVisible();
  await expect(page.getByText("최근 6회 중 5회 함께했어요")).toBeVisible();
  await expect(page.getByText("현재 3회 연속 참여")).toBeVisible();
  await expect(page.getByRole("heading", { name: "최근 책별 기록" })).toHaveCount(0);

  await page.getByRole("link", { name: "내 책별 기록 전체 보기" }).click();
  await expect(page).toHaveURL(/\/app\/me\/records$/);
  const fullRows = page.locator(".rm-my-records-journey").getByRole("article");
  await expect(fullRows).toHaveCount(12);
  await page.getByRole("button", {
    name: "기록 더 보기",
  }).click();
  await expect(fullRows).toHaveCount(15);
  await expect(page.getByRole("button", {
    name: "기록 더 보기",
  })).toHaveCount(0);
});

test("participation journey keeps one responsive semantic order with practical keyboard actions", async ({
  page,
}, testInfo) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, memberEmail);

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/me");

    const timeline = page.getByRole("list", {
      name: "최근 참여 대상 회차",
    });
    await expect(timeline).toHaveCount(1);
    await expect(timeline.getByRole("listitem")).toHaveCount(6);
    await expect(timeline.locator(".rm-participation-timeline__session")).toHaveText([
      "4차",
      "5차",
      "6차",
      "7차",
      "8차",
      "9차",
    ]);
    const statusLabels = timeline.locator(".rm-participation-timeline__status");
    await expect(statusLabels).toHaveText([
      "참여",
      "참여",
      "불참",
      "참여",
      "참여",
      "참여",
    ]);
    const markers = timeline.locator(".rm-participation-timeline__marker");
    await expect(markers).toHaveText(["✓", "✓", "–", "✓", "✓", "✓"]);
    for (let index = 0; index < await statusLabels.count(); index += 1) {
      await expect(statusLabels.nth(index)).toBeVisible();
      await expect(markers.nth(index)).toBeVisible();
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expectParticipationSemanticOrder(page);

    const currentSession = page.getByRole("link", {
      name: "이번 세션 보기",
    });
    const allRecords = page.getByRole("link", {
      name: "내 책별 기록 전체 보기",
    });
    const logout = page.locator(".rm-member-space-account-actions").getByRole(
      "button",
      { name: "로그아웃" },
    );
    for (const action of [currentSession, allRecords, logout]) {
      await expectPracticalTapTarget(action);
    }

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await pressTabUntilFocused(page, currentSession, "current session");
    await pressTabUntilFocused(page, allRecords, "all personal records");
    await pressTabUntilFocused(page, logout, "member-space logout");

    await page.screenshot({
      path: testInfo.outputPath(
        `member-participation-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/app/me");
  await page.evaluate(() => {
    document.body.style.zoom = "200%";
  });
  await expectParticipationSemanticOrder(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("member-participation-200-percent-zoom.png"),
    fullPage: true,
  });
});

test("mid-join member history starts with the first eligible participation", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "mid-join");
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  await expect(page.getByText("최근 2회 중 2회 함께했어요")).toBeVisible();
  await expect(page.getByText("8차", { exact: true })).toBeVisible();
  await expect(page.getByText("9차", { exact: true })).toBeVisible();
  await expect(page.getByText("7차", { exact: true })).toHaveCount(0);
});

test("unknown latest attendance stays visible without a current streak claim", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "unknown");
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  await expect(page.getByText("최근 확인된 5회 중 4회 함께했어요")).toBeVisible();
  await expect(page.getByText("미확인")).toBeVisible();
  const unknownMarker = page.getByRole("list", {
    name: "최근 참여 대상 회차",
  }).locator(
    'li[data-attendance-status="UNKNOWN"] .rm-participation-timeline__marker',
  );
  await expect(unknownMarker).toHaveCount(1);
  await expect(unknownMarker).toHaveText("?");
  await expect(unknownMarker).toBeVisible();
  await expect(page.getByText(/현재 \d+회 연속 참여/)).toHaveCount(0);
});

test("member-space bottom logout returns to the unauthenticated public home", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  const logoutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/bff/api/auth/logout"),
  );
  await page.locator(".rm-member-space-account-actions").getByRole(
    "button",
    { name: "로그아웃" },
  ).click();
  expect((await logoutResponse).status()).toBe(204);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("main").getByRole("heading", {
    level: 1,
    name: "읽는사이",
  })).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
});

test("member-space logout failure stays stacked and full width on narrow screens", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, memberEmail);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/app/me");
  await page.route("**/api/bff/api/auth/logout", async (route) => {
    await route.fulfill({ status: 500, body: "" });
  });

  const accountActions = page.locator(".rm-member-space-account-actions");
  const control = accountActions.locator(".rm-member-space-account-actions__control");
  const logout = accountActions.getByRole("button", { name: "로그아웃" });
  await logout.click();

  const alert = accountActions.getByRole("alert");
  await expect(alert).toHaveText("로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  await expect(page).toHaveURL(/\/app\/me$/);

  const [controlBox, logoutBox, alertBox] = await Promise.all([
    control.boundingBox(),
    logout.boundingBox(),
    alert.boundingBox(),
  ]);
  expect(controlBox).not.toBeNull();
  expect(logoutBox).not.toBeNull();
  expect(alertBox).not.toBeNull();
  expect(logoutBox!.width).toBeGreaterThanOrEqual(controlBox!.width - 1);
  expect(alertBox!.width).toBeGreaterThanOrEqual(controlBox!.width - 1);
  expect(alertBox!.y).toBeGreaterThanOrEqual(logoutBox!.y + logoutBox!.height);
});

test("club-scoped account and notification routes preserve navigation current state and history", async ({
  page,
}) => {
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto(`${scopedAppPath}/me`);

  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("link", { name: "계정 관리" }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/me/settings$`));

  const appNavigation = page.getByRole("navigation", {
    name: "앱 내비게이션",
  });
  await expect(appNavigation.getByRole("link", {
    name: "내 공간",
  })).toHaveAttribute("aria-current", "page");

  await appNavigation.getByRole("link", { name: "알림" }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/notifications$`));
  await expect(appNavigation.getByRole("link", {
    name: "알림",
  })).toHaveAttribute("aria-current", "page");

  const notificationTabs = page.getByRole("navigation", {
    name: "알림 보기",
  });
  await expect(notificationTabs.getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute("aria-current", "page");
  await notificationTabs.getByRole("link", { name: "수신 설정" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${scopedAppPath}/notifications/settings$`),
  );
  await expect(notificationTabs.getByRole("link", {
    name: "수신 설정",
  })).toHaveAttribute("aria-current", "page");
  await expect(appNavigation.getByRole("link", {
    name: "알림",
  })).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/notifications$`));
  await expect(page.getByRole("navigation", {
    name: "알림 보기",
  }).getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute("aria-current", "page");
});
