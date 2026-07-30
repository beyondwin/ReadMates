import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  mockMemberParticipationProfile,
  mockMyReadingShelfJourney,
  mockRecentReadingSessionDetail,
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

async function expectMemberSpaceSemanticOrder(page: Page) {
  const shelf = page.locator(".rm-member-space");
  await expectDomOrder(
    shelf.getByRole("heading", { level: 1, name: "멤버1" }),
    shelf.getByRole("link", { name: "계정 관리" }),
    shelf.getByRole("heading", { level: 2, name: "세 번의 모임에서 세 권을 끝까지 읽었어요." }),
    shelf.getByText("함께한 모임", { exact: true }),
    shelf.getByText("완독", { exact: true }),
    shelf.getByText("질문", { exact: true }),
    shelf.getByRole("heading", { level: 2, name: "최근 함께 읽은 기록" }),
    shelf.getByRole("link", {
      name: /responsive reading shelf 회차 기록/,
    }),
  );
}

test.beforeEach(() => {
  resetSeedGoogleLogins([memberEmail]);
});

test.afterEach(() => {
  resetSeedGoogleLogins([memberEmail]);
});

test("member records pagination remains available on its direct route", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me/records");

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

test("member space keeps the profile-first semantic order and usable actions across viewports", async ({
  page,
}, testInfo) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, memberEmail);

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/me");

    const shelf = page.locator(".rm-member-space");
    const overview = shelf.locator(".rm-member-space__overview");
    await expect(overview).toHaveCount(1);
    await expect(shelf.locator(".rm-reading-achievement__metrics")).toHaveCount(1);
    await expect(shelf.getByRole("list", {
      name: "최근 함께 읽은 기록",
    }).getByRole("listitem")).toHaveCount(3);
    await expect(shelf.getByRole("link", {
      name: "전체 기록 보기",
    })).toBeVisible();
    await expect(shelf.getByRole("button", { name: "로그아웃" })).toHaveCount(0);

    const overviewStyle = await overview.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        display: style.display,
        columns: style.gridTemplateColumns.split(" ").length,
        width: element.getBoundingClientRect().width,
      };
    });
    if (viewport.width === 1280) {
      expect(overviewStyle.display).toBe("grid");
      expect(overviewStyle.columns).toBe(2);
      expect(overviewStyle.width).toBeLessThanOrEqual(1080);
    } else {
      expect(overviewStyle.columns).toBe(1);
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expectMemberSpaceSemanticOrder(page);

    const editProfile = shelf.getByRole("button", { name: "프로필 수정" });
    const accountSettings = shelf.getByRole("link", { name: "계정 관리" });
    await expect(accountSettings).toHaveCSS("text-decoration-line", "none");
    for (const action of [editProfile, accountSettings]) {
      await expectPracticalTapTarget(action);
    }

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await pressTabUntilFocused(page, editProfile, "edit profile");
    await pressTabUntilFocused(page, accountSettings, "account settings");

    await page.screenshot({
      path: testInfo.outputPath(
        `member-space-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const firstRecent = page.getByRole("link", {
    name: /responsive reading shelf 회차 기록/,
  });
  await firstRecent.hover();
  await expect(firstRecent.locator(".rm-recent-reading-row__arrow"))
    .toHaveCSS("transform", "none");

  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/app/me");
  await page.evaluate(() => {
    document.body.style.zoom = "200%";
  });
  await expectMemberSpaceSemanticOrder(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("member-space-200-percent-zoom.png"),
    fullPage: true,
  });
});

test("mid-join member history starts with the first eligible participation", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "mid-join");
  await mockMyReadingShelfJourney(page, "three-achievements");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  await expect(page.getByRole("heading", { level: 2, name: "세 번의 모임에서 세 권을 끝까지 읽었어요." })).toBeVisible();
  await expect(page.getByText("최근", { exact: true })).toHaveCount(0);
});

test("unknown latest attendance stays visible without a current streak claim", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "unknown");
  await mockMyReadingShelfJourney(page, "three-achievements");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  const shelf = page.locator(".rm-member-space");
  await expect(shelf).not.toContainText("?");
  await expect(shelf).not.toContainText("미확인");
  await expect(shelf.locator(".rm-reading-achievement")).not.toContainText("최근");
  await expect(shelf).not.toContainText("연속");
  await expect(shelf.getByText("함께한 모임")).toBeVisible();
  await expect(shelf.getByText("완독")).toBeVisible();
});

test("zero-question and review summaries omit empty metrics", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "zero-questions-reviews");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  const metrics = page.locator(".rm-reading-achievement__metrics");
  await expect(metrics.getByText("함께한 모임")).toBeVisible();
  await expect(metrics.getByText("완독")).toBeVisible();
  await expect(metrics.getByText("질문")).toHaveCount(0);
  await expect(metrics.getByText("서평")).toHaveCount(0);
});

test("club-scoped account and notification routes preserve navigation current state and history", async ({
  page,
}) => {
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await mockRecentReadingSessionDetail(page);
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto(`${scopedAppPath}/me`);

  const fullRecords = page.getByRole("link", {
    name: "전체 기록 보기",
  });
  await expect(fullRecords).toHaveAttribute(
    "href",
    `${scopedAppPath}/me/records`,
  );

  const recentSession = page.getByRole("link", {
    name: "아주 긴 한국어 제목과 An exceptionally long English subtitle for a responsive reading shelf 회차 기록",
  });
  await expect(recentSession).toHaveAttribute(
    "href",
    `${scopedAppPath}/sessions/journey-2026-03`,
  );
  await recentSession.click();
  await expect(page).toHaveURL(
    new RegExp(`${scopedAppPath}/sessions/journey-2026-03$`),
  );
  await expect(page.getByText("최근 함께 읽은 책").first()).toBeVisible();

  await page.goto(`${scopedAppPath}/me`);
  await page.getByRole("link", { name: "전체 기록 보기" }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/me/records$`));

  await page.goto(`${scopedAppPath}/me`);
  const memberSpaceSettings = page
    .locator(".rm-member-space")
    .getByRole("link", { name: "계정 관리" });
  await expect(memberSpaceSettings).toHaveAttribute(
    "href",
    `${scopedAppPath}/me/settings`,
  );
  await memberSpaceSettings.click();
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
