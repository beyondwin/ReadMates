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

async function expectProfileEditorDialog(page: Page, viewportWidth: number) {
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  const input = dialog.getByRole("textbox", { name: "표시 이름" });
  const avatar = dialog.getByRole("button", { name: /^아바타 선택, 현재 / });
  const save = dialog.getByRole("button", { name: "변경사항 저장" });
  const cancel = dialog.getByRole("button", { name: "취소" });

  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await expectPracticalTapTarget(input);
  await expectPracticalTapTarget(avatar);
  await expectPracticalTapTarget(save);
  await expectPracticalTapTarget(cancel);

  const [dialogBox, inputBox, saveBox, cancelBox] = await Promise.all([
    dialog.boundingBox(),
    input.boundingBox(),
    save.boundingBox(),
    cancel.boundingBox(),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(dialogBox!.width).toBeLessThanOrEqual(viewportWidth + 0.5);
  expect(Math.abs(saveBox!.y - cancelBox!.y)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  const focusStyle = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  const hasVisibleOutline = focusStyle.outlineStyle === "solid" && focusStyle.outlineWidth >= 2;
  expect(hasVisibleOutline || focusStyle.boxShadow !== "none").toBe(true);
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
  const overview = shelf.locator(".rm-member-space__overview");
  const utilities = shelf.getByRole("region", { name: "내 공간 관리" });
  const recentReadings = shelf.getByRole("region", { name: "최근 독서 기록" });
  await expectDomOrder(
    overview,
    shelf.getByRole("heading", { level: 1, name: "멤버1" }),
    shelf.getByText("읽는사이 · 멤버", { exact: true }),
    shelf.getByText("2025.11부터 함께", { exact: true }),
    shelf.getByRole("button", { name: "프로필 편집" }),
    shelf.getByRole("heading", { level: 2, name: "읽고, 묻고, 기록해 온 시간" }),
    shelf.getByText("참여한 모임", { exact: true }),
    shelf.getByText("완독한 책", { exact: true }),
    shelf.getByRole("heading", { level: 3, name: "기록의 흔적" }),
    shelf.getByText("대화를 연 질문", { exact: true }),
    shelf.getByText("남긴 서평", { exact: true }),
    utilities,
    recentReadings,
    shelf.getByRole("heading", { level: 2, name: "최근 독서 기록" }),
    shelf.getByRole("link", {
      name: /responsive reading shelf 회차 기록/,
    }),
  );
  await expect(shelf.getByRole("link", { name: "기록 보기" })).toHaveCount(0);
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
    await page.goto(`${scopedAppPath}/me`);

    const shelf = page.locator(".rm-member-space");
    const overview = shelf.locator(".rm-member-space__overview");
    await expect(overview).toHaveCount(1);
    await expect(shelf.locator(".rm-reading-achievement__journey")).toHaveCount(1);
    await expect(shelf.getByRole("list", {
      name: "최근 독서 기록",
    }).getByRole("listitem")).toHaveCount(3);
    await expect(shelf.getByRole("link", {
      name: "전체 보기",
    })).toHaveAttribute(
      "href",
      `${scopedAppPath}/archive?view=sessions`,
    );
    const utilities = shelf.getByRole("region", { name: "내 공간 관리" });
    const notificationsLink = utilities.getByRole("link", {
      name: "알림 받은 알림과 수신 설정",
      exact: true,
    });
    const settingsLink = utilities.getByRole("link", {
      name: "계정 설정 프로필과 멤버십 정보",
      exact: true,
    });
    await expect(notificationsLink).toHaveAttribute(
      "href",
      `${scopedAppPath}/notifications`,
    );
    await expect(settingsLink).toHaveAttribute(
      "href",
      `${scopedAppPath}/me/settings`,
    );
    await expect(utilities.locator(".rm-member-space-utilities__label")).toHaveText([
      "알림",
      "계정 설정",
    ]);
    await expect(utilities.locator(".rm-member-space-utilities__description")).toHaveText([
      "받은 알림과 수신 설정",
      "프로필과 멤버십 정보",
    ]);
    await expectPracticalTapTarget(notificationsLink);
    await expectPracticalTapTarget(settingsLink);
    await expect(shelf.getByRole("button", { name: "로그아웃" })).toHaveCount(0);

    const layout = await overview.evaluate((element) => {
      const profile = element.querySelector(".rm-member-profile")!;
      const achievement = element.querySelector(".rm-reading-achievement")!;
      const overviewBox = element.getBoundingClientRect();
      const profileBox = profile.getBoundingClientRect();
      const achievementBox = achievement.getBoundingClientRect();

      return {
        display: getComputedStyle(element).display,
        width: overviewBox.width,
        profileTop: profileBox.top,
        profileBottom: profileBox.bottom,
        achievementTop: achievementBox.top,
        profileLeft: profileBox.left,
        achievementLeft: achievementBox.left,
      };
    });

    expect(layout.display).toBe("block");
    expect(layout.width).toBeLessThanOrEqual(1080);
    expect(layout.profileTop).toBeLessThan(layout.achievementTop);
    expect(layout.profileBottom).toBeLessThanOrEqual(layout.achievementTop + 1);
    expect(Math.abs(layout.profileLeft - layout.achievementLeft)).toBeLessThanOrEqual(1);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expectMemberSpaceSemanticOrder(page);

    const editProfile = shelf.getByRole("button", { name: "프로필 편집" });
    await expectPracticalTapTarget(editProfile);
    const editPresentation = await editProfile.evaluate((button) => {
      const identity = button.closest(".rm-member-profile__identity");
      const meta = identity?.querySelector(".rm-member-profile__meta");
      const heading = identity?.querySelector("h1");
      const buttonStyle = getComputedStyle(button);
      return {
        color: buttonStyle.color,
        metaColor: meta ? getComputedStyle(meta).color : null,
        textColor: heading ? getComputedStyle(heading).color : null,
        borderTopWidth: buttonStyle.borderTopWidth,
        textDecorationLine: buttonStyle.textDecorationLine,
      };
    });
    expect([editPresentation.metaColor, editPresentation.textColor]).toContain(editPresentation.color);
    expect(editPresentation.borderTopWidth).toBe("0px");
    expect(editPresentation.textDecorationLine).toBe("none");

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await pressTabUntilFocused(page, editProfile, "edit profile");

    await editProfile.click();
    await expectProfileEditorDialog(page, viewport.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `member-space-name-editor-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(editProfile).toBeFocused();

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

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${scopedAppPath}/me`);
  await expectMemberSpaceSemanticOrder(page);
  const shelf = page.locator(".rm-member-space");
  const editProfile = shelf.getByRole("button", { name: "프로필 편집" });
  await editProfile.click();
  await expectProfileEditorDialog(page, 320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("member-space-name-editor-200-percent-zoom.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(editProfile).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("member-space-200-percent-zoom.png"),
    fullPage: true,
  });
});

test("long identity wraps without inventing a missing joined month", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "long-identity");
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await loginWithGoogleFixture(page, memberEmail);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/app/me");

  const shelf = page.locator(".rm-member-space");
  await expect(shelf.getByRole("heading", {
    level: 1,
    name: "아주 긴 한국어 표시 이름과 Long English Display Name",
  })).toBeVisible();
  await expect(shelf.getByText(
    "아주 긴 한국어 독서 모임과 Long English Reading Club · 멤버",
  )).toBeVisible();
  await expect(shelf.getByText(/부터 함께/)).toHaveCount(0);
  await expectPracticalTapTarget(
    shelf.getByRole("button", { name: "프로필 편집" }),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mid-join member history starts with the first eligible participation", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "mid-join");
  await mockMyReadingShelfJourney(page, "three-achievements");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  const ledger = page.locator(".rm-reading-achievement");
  await expect(ledger.getByRole("heading", { level: 2, name: "읽고, 묻고, 기록해 온 시간" })).toBeVisible();
  await expect(ledger.locator(".rm-reading-achievement__journey dd")).toHaveText(["3회", "3권"]);
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
  await expect(shelf.getByText("참여한 모임")).toBeVisible();
  await expect(shelf.getByText("완독한 책")).toBeVisible();
});

test("zero-question and review summaries keep useful empty record traces", async ({
  page,
}) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "zero-questions-reviews");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  const ledger = page.locator(".rm-reading-achievement");
  await expect(ledger.getByText("참여한 모임")).toBeVisible();
  await expect(ledger.getByText("완독한 책")).toBeVisible();
  await expect(ledger.getByText("대화를 연 질문")).toBeVisible();
  await expect(ledger.getByText("남긴 서평", { exact: true })).toBeVisible();
  await expect(ledger.locator(".rm-reading-achievement__trace-value")).toHaveText(["0개", "0편"]);
});

test("club-scoped account and notification routes preserve navigation current state and history", async ({
  page,
}) => {
  await mockMyReadingShelfJourney(page, "three-recent-readings");
  await mockRecentReadingSessionDetail(page);
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto(`${scopedAppPath}/me`);

  const fullRecords = page.getByRole("link", {
    name: "전체 보기",
  });
  await expect(fullRecords).toHaveAttribute(
    "href",
    `${scopedAppPath}/archive?view=sessions`,
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
  await page.getByRole("link", {
    name: "전체 보기",
  }).click();
  await expect(page).toHaveURL(
    new RegExp(`${scopedAppPath}/archive\\?view=sessions$`),
  );
  await expect(page.getByRole("button", { name: "세션" }))
    .toHaveAttribute("aria-pressed", "true");

  await page.goto(`${scopedAppPath}/me`);
  const utilityNavigation = page.getByRole("region", { name: "내 공간 관리" });
  const settingsLink = utilityNavigation.getByRole("link", {
    name: "계정 설정 프로필과 멤버십 정보",
    exact: true,
  });
  await expect(settingsLink).toHaveAttribute("href", `${scopedAppPath}/me/settings`);
  await settingsLink.click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/me/settings$`));
  await expect(page.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();
  const appNavigation = page.getByRole("navigation", {
    name: "앱 내비게이션",
  });
  await expect(appNavigation.getByRole("link", {
    name: "내 공간",
  })).toHaveAttribute("aria-current", "page");

  await expect(page.locator(".rm-account-settings-page").getByRole("link", {
    name: "내 공간",
  })).toHaveCount(0);
  await appNavigation.getByRole("link", { name: "내 공간" }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/me$`));

  const notificationLink = page.getByRole("region", {
    name: "내 공간 관리",
  }).getByRole("link", {
    name: "알림 받은 알림과 수신 설정",
    exact: true,
  });
  await expect(notificationLink).toHaveAttribute("href", `${scopedAppPath}/notifications`);
  await notificationLink.click();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/notifications$`));
  await expect(appNavigation.getByRole("link", {
    name: "내 공간",
  })).toHaveAttribute("aria-current", "page");

  await expect(page.getByRole("navigation", { name: "현재 위치" })).toHaveCount(0);

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
    name: "내 공간",
  })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "현재 위치" })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${scopedAppPath}/notifications$`));
  await expect(page.getByRole("navigation", {
    name: "알림 보기",
  }).getByRole("link", {
    name: "받은 알림",
  })).toHaveAttribute("aria-current", "page");
});
