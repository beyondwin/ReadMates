import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";
import {
  mockMemberParticipationProfile,
  mockMyReadingShelfJourney,
} from "./my-reading-shelf-fixtures";

async function expectPracticalTapTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectDomOrder(...locators: Locator[]) {
  const indexes = await Promise.all(
    locators.map((locator) =>
      locator.evaluate((element) => Array.from(document.querySelectorAll("*")).indexOf(element)),
    ),
  );
  expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
}

async function expectReducedAccountDialog(
  dialog: Locator,
  notificationsHref: string,
  settingsHref: string,
) {
  await expect(dialog.locator(".rm-account-menu__member-name")).toBeVisible();
  await expect(dialog.locator(".rm-account-menu__member-name")).not.toHaveText("");
  await expect(dialog.locator(".rm-account-menu__membership")).toBeVisible();
  await expect(dialog.locator(".rm-account-menu__membership")).not.toHaveText("");
  await expect(dialog.getByRole("link")).toHaveCount(2);
  await expect(dialog.getByRole("link", { name: "알림" })).toHaveAttribute("href", notificationsHref);
  await expect(dialog.getByRole("link", { name: "계정 설정" })).toHaveAttribute("href", settingsHref);
  await expect(dialog.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "내 공간" })).toHaveCount(0);
}

async function expectPublicRecordMetadataLayout(page: Page, width: number, stacked: boolean) {
  await page.setViewportSize({ width, height: 900 });

  const row = page.locator(".public-record-index-row").first();
  await expect(row).toBeVisible();

  const layout = await row.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(".public-record-index-row__body")!;
    const meta = element.querySelector<HTMLElement>(".public-record-index-row__meta")!;
    const counts = element.querySelector<HTMLElement>(".public-record-index-row__counts")!;
    const rect = (target: HTMLElement) => {
      const box = target.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };

    return {
      body: { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth },
      row: { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth },
      meta: rect(meta),
      counts: rect(counts),
    };
  });

  const overlaps =
    layout.meta.left < layout.counts.right &&
    layout.meta.right > layout.counts.left &&
    layout.meta.top < layout.counts.bottom &&
    layout.meta.bottom > layout.counts.top;

  expect(overlaps, `${width}px metadata must not overlap`).toBe(false);
  expect(layout.body.scrollWidth, `${width}px body must not overflow`).toBeLessThanOrEqual(layout.body.clientWidth);
  expect(layout.row.scrollWidth, `${width}px row must not overflow`).toBeLessThanOrEqual(layout.row.clientWidth);

  if (stacked) {
    expect(layout.counts.top).toBeGreaterThanOrEqual(layout.meta.bottom);
  } else {
    const sharedRowHeight = Math.min(layout.meta.bottom, layout.counts.bottom) - Math.max(layout.meta.top, layout.counts.top);
    expect(sharedRowHeight).toBeGreaterThan(0);
  }
}

const memberMobileTabs = ["오늘", "노트", "기록", "내 공간"];
const hostMobileTabs = ["오늘", "세션", "멤버", "기록"];
const baselineClubAppPath = "/clubs/reading-sai/app";
const baselineClubHostPath = `${baselineClubAppPath}/host`;
const hostLandingUrl = new RegExp(`${baselineClubHostPath}(?:/sessions/[^/]+)?$`);

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test("desktop public and host pages show the expected top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });

  await page.goto("/");
  const publicNav = page.getByRole("navigation", { name: "공개 내비게이션" });
  await expect(publicNav.getByRole("link", { name: "홈" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "클럽 소개" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "공개 기록" })).toBeVisible();
  await expect(page.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/records");
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);

  await page.goto("/about");
  await expect(page.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/records");

  await page.goto("/records");
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole("heading", { name: "공개 기록" })).toBeVisible();
  const firstPublicRecord = page.locator(".public-record-index-row").first();
  await expect(firstPublicRecord).toBeVisible();
  const firstPublicRecordTitle = await firstPublicRecord.locator(".public-record-index-row__title").innerText();
  await firstPublicRecord.click();
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(page.getByRole("heading", { name: firstPublicRecordTitle })).toBeVisible();
  await expect(page.getByText(/공개 기록 · No\./)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);

  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app");
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}$`));
  await expect(page.locator(".app-content > .rm-route-reveal")).toBeVisible();
  const appNav = page.getByRole("navigation", { name: "앱 내비게이션" });
  await expect(appNav.getByRole("link", { name: "오늘" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "노트" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "기록" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "내 공간" })).toBeVisible();
  const accountMenu = page.getByRole("button", { name: /계정 메뉴$/ });
  await expect(accountMenu).toHaveCount(1);
  await expectPracticalTapTarget(accountMenu);
  await accountMenu.click();
  const accountDialog = page.getByRole("dialog");
  await expect(accountDialog).toBeVisible();
  await expectReducedAccountDialog(
    accountDialog,
    `${baselineClubAppPath}/notifications`,
    `${baselineClubAppPath}/me/settings`,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".mobile-only .rm-account-menu__trigger")).toBeHidden();
  const hostEntry = page.getByRole("banner").getByRole("link", { name: "호스트 화면" });
  await expect(hostEntry).toHaveAttribute("href", baselineClubHostPath);

  await hostEntry.click();
  await expect(page).toHaveURL(hostLandingUrl);
  await expect(appNav.getByRole("link", { name: "오늘" })).toHaveAttribute("aria-current", "page");
  await expect(appNav.getByRole("link", { name: "세션" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "멤버" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "기록" })).toBeVisible();

  await page.getByRole("link", { name: "멤버 화면으로" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}$`));
});

test("public record metadata adapts without overlap from mobile to desktop", async ({ page }) => {
  await page.goto("/records");

  for (const width of [320, 390, 520]) {
    await expectPublicRecordMetadataLayout(page, width, true);
  }

  for (const width of [540, 768, 1024, 1366]) {
    await expectPublicRecordMetadataLayout(page, width, false);
  }
});

test("mobile public pages hide app tabs and host app pages show mobile chrome", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  const mobileHeader = page.locator("header.m-hdr").first();

  await page.goto("/");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("읽는사이");
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);
  const heroPeekBox = await page.getByLabel("다음 섹션 미리보기").boundingBox();
  expect(heroPeekBox).not.toBeNull();
  expect(heroPeekBox!.y + heroPeekBox!.height).toBeLessThanOrEqual(812);
  const heroLatestBox = await page.locator(".public-home-hero__latest").boundingBox();
  expect(heroLatestBox).not.toBeNull();
  expect(heroLatestBox!.y).toBeLessThan(812);

  await page.goto("/login");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("로그인");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/");
  await expectPracticalTapTarget(mobileHeader.getByRole("link", { name: "뒤로" }));
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app");
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}$`));
  await expect(page.locator(".app-content > .rm-route-reveal")).toBeVisible();
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", baselineClubHostPath);
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveClass(/m-hdr-link--icon/);
  await expectPracticalTapTarget(mobileHeader.getByRole("link", { name: "호스트 화면" }));
  const accountMenu = page.getByRole("button", { name: /계정 메뉴$/ });
  await expect(accountMenu).toHaveCount(1);
  await expectPracticalTapTarget(accountMenu);
  await accountMenu.click();
  const accountDialog = page.getByRole("dialog");
  await expect(accountDialog).toBeVisible();
  await expectReducedAccountDialog(
    accountDialog,
    `${baselineClubAppPath}/notifications`,
    `${baselineClubAppPath}/me/settings`,
  );
  await page.keyboard.press("Escape");
  await expect(accountDialog).toHaveCount(0);

  const memberTabs = page.getByRole("navigation", { name: "앱 탭" });
  await memberTabs.getByRole("link", { name: "내 공간" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/me$`));
  await page
    .getByRole("region", { name: "내 공간 관리" })
    .getByRole("link", { name: /알림.*받은 알림과 수신 설정/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/notifications$`));
  await expect(page.getByRole("heading", { name: "알림" })).toBeVisible();
  await expect(page.getByText("아직 받은 알림이 없습니다.")).toBeVisible();
  await expect(memberTabs.getByRole("link", { name: "내 공간" })).toHaveAttribute("aria-current", "page");
  await page.goto(baselineClubAppPath);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".desktop-only .rm-account-menu__trigger")).toBeHidden();
  await expect(mobileHeader.locator(".m-hdr-side")).toHaveCount(2);
  await expect(memberTabs.getByRole("link")).toHaveText(memberMobileTabs);
  await expectPracticalTapTarget(memberTabs.getByRole("link", { name: "오늘" }));
  await mobileHeader.getByRole("link", { name: "호스트 화면" }).click();
  await expect(page).toHaveURL(hostLandingUrl);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", baselineClubAppPath);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveClass(/m-hdr-link--icon/);
  await expectPracticalTapTarget(mobileHeader.getByRole("link", { name: "멤버 화면으로" }));
  await mobileHeader.getByRole("link", { name: "멤버 화면으로" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}$`));
  await memberTabs.getByRole("link", { name: "기록" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/archive$`));
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", baselineClubHostPath);
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveClass(/m-hdr-link--icon/);
  await expect(memberTabs.getByRole("link")).toHaveText(memberMobileTabs);
  await expect(memberTabs.getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");

  await page.goto(`${baselineClubHostPath}/sessions/new`);
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("세션");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", baselineClubHostPath);
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", baselineClubAppPath);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveClass(/m-hdr-link--icon/);

  const tabs = page.getByRole("navigation", { name: "앱 탭" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link")).toHaveText(hostMobileTabs);
  await expect(tabs.getByRole("link", { name: "오늘" })).toHaveAttribute("href", baselineClubHostPath);
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("href", /\/app\/host\/sessions\/([^/]+\/edit|[^/]+|new)$/);
  await expect(tabs.getByRole("link", { name: "멤버" })).toHaveAttribute("href", `${baselineClubHostPath}/members`);
  await expect(tabs.getByRole("link", { name: "기록" })).toHaveAttribute("href", `${baselineClubHostPath}/sessions`);
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "호스트" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "이번 세션" })).toHaveCount(0);
  await expectPracticalTapTarget(tabs.getByRole("link", { name: "세션" }));

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${baselineClubHostPath}/sessions`);
  await expect(page.getByRole("heading", { name: "세션 기록 장부" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "세션 기록 검색" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const firstLedgerAction = page.locator("article[data-session-id]").first().getByRole("link");
  await expect(firstLedgerAction).toBeVisible();
  await expectPracticalTapTarget(firstLedgerAction);
  await firstLedgerAction.click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/[^/]+\/?$/);
  expect(new URL(page.url()).pathname).not.toMatch(/\/edit\/?$/);
  const editorSections = page.getByRole("tablist", { name: "호스트 편집 섹션" });
  await expect(editorSections.getByRole("tab")).toHaveCount(5);
  await expect(editorSections.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "개요" })).toBeVisible();
  await editorSections.getByRole("tab", { name: "기록", exact: true }).click();
  await expect(editorSections.getByRole("tab", { name: "기록", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: /정리본/ })).toBeVisible();
  await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
  await expect(page.locator(".rm-host-session-editor__aside:visible")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await tabs.getByRole("link", { name: "기록" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubHostPath}/sessions$`));
  await expect(mobileHeader).toContainText("기록");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", baselineClubAppPath);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveClass(/m-hdr-link--icon/);
  await expect(tabs.getByRole("link")).toHaveText(hostMobileTabs);
  await expect(tabs.getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");

  const editHref = await tabs.getByRole("link", { name: "세션" }).getAttribute("href");
  expect(editHref).toBeTruthy();

  await page.goto(editHref!);
  await expect(mobileHeader).toContainText("세션");
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
});

test("mobile public record detail returns to the public records index without duplicate header returns", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto("/records");
  await expect(page).toHaveURL(/\/records$/);
  const firstPublicRecord = page.locator(".public-record-index-row").first();
  await expect(firstPublicRecord).toBeVisible();
  const firstPublicRecordTitle = await firstPublicRecord.locator(".public-record-index-row__title").innerText();

  await firstPublicRecord.click();
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(page.getByRole("heading", { name: firstPublicRecordTitle })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/records");
  await expect(
    page.locator(".public-session-record__header").getByRole("link", { name: /공개 기록/ }),
  ).toHaveCount(0);

  await page.getByRole("banner").getByRole("link", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole("link", { name: new RegExp(firstPublicRecordTitle) })).toBeVisible();
});

test("mobile app route continuity returns to archive tabs and host dashboard sources", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app/archive?view=sessions");
  await expect(page).toHaveURL(/\/app\/archive\?view=sessions$/);
  const sessionLink = page.getByRole("link", { name: "No.1 팩트풀니스 열기" });
  await sessionLink.scrollIntoViewIfNeeded();
  await sessionLink.click();
  await expect(page).toHaveURL(/\/app\/sessions\//);
  await expect(page.getByRole("heading", { name: "팩트풀니스", exact: true })).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/app\/archive\?view=sessions$/);
  await expect(page.getByRole("button", { name: "세션" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "No.1 팩트풀니스 열기" })).toBeVisible();

  await page.goto("/app/archive?view=report");
  await expect(page).toHaveURL(/\/app\/archive\?view=report$/);
  const feedbackLink = page.getByRole("link", { name: "No.01 팩트풀니스 피드백 문서 읽기" });
  await expect(feedbackLink).toBeVisible();
  await feedbackLink.click();
  await expect(page).toHaveURL(/\/app\/feedback\//);
  await expect(page.getByRole("heading", { name: /독서모임 1차 피드백/ })).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/app\/archive\?view=report$/);
  await expect(page.getByRole("button", { name: "피드백 문서" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".rm-archive-mobile").getByText("팩트풀니스")).toBeVisible();
  await expect(page.locator(".rm-archive-mobile").getByText("No.01 · 2025.11.26")).toBeVisible();

  await page.goto("/app/host");
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host(\/sessions\/[^/]+)?$/);
  await expect(page.getByRole("heading", { name: /지금 다루는 모임|아직 열린 모임이 없습니다/ })).toBeVisible();
  const hostBack = page.getByRole("banner").getByRole("link", { name: "뒤로" });
  if (await hostBack.count()) {
    await expect(hostBack).toHaveAttribute("href", "/app/host");
    await hostBack.click();
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host(\/sessions\/[^/]+)?$/);
    await expect(page.getByRole("heading", { name: /지금 다루는 모임|아직 열린 모임이 없습니다/ })).toBeVisible();
  }
});

test("member space preserves a profile-first layout from desktop to narrow mobile", async ({ page }) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "three-achievements");
  await loginWithGoogleFixture(page, "host@example.com");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/me");

    const shelf = page.locator(".rm-member-space");
    const editProfile = shelf.getByRole("button", { name: "프로필 편집" });
    await expect(shelf.getByRole("heading", { level: 1, name: "호스트" })).toHaveCount(1);
    await expect(shelf.getByRole("heading", { level: 2, name: "읽고, 묻고, 기록해 온 시간" })).toHaveCount(1);
    await expectDomOrder(
      shelf.getByRole("heading", { level: 1, name: "호스트" }),
      editProfile,
      shelf.getByRole("heading", { level: 2, name: "읽고, 묻고, 기록해 온 시간" }),
      shelf.locator(".rm-reading-achievement__journey"),
    );

    await expectPracticalTapTarget(editProfile);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("dedicated records and account settings stay reachable above mobile navigation", async ({ page }) => {
  await mockMyReadingShelfJourney(page, "load-more-error");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${baselineClubAppPath}/me/records`);

  const recordsBack = page.getByRole("banner").getByRole("link", { name: "뒤로" });
  await expect(recordsBack).toHaveAttribute("href", `${baselineClubAppPath}/me`);
  await expect(recordsBack).toHaveText("뒤로");
  await expect(page.getByRole("banner").locator(".m-hdr-title")).toHaveText("내 공간");
  await expect(page.locator(".rm-my-records-page .rm-my-shelf-kicker")).toBeHidden();

  await page.getByRole("button", { name: "기록 더 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "기록을 더 불러오지 못했습니다." })).toBeVisible();
  await expectPracticalTapTarget(page.getByRole("button", { name: "다시 시도" }).first());

  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("link", { name: "계정 설정" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/me/settings$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/me/records$`));
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();
  await page.getByRole("link", { name: "계정 설정" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${baselineClubAppPath}/me/settings$`),
  );

  const settings = page.locator(".rm-account-settings-page");
  const backToMySpace = settings.locator(".rm-account-settings-page__back");
  await expect(backToMySpace).toHaveCount(0);
  const settingsBack = page.getByRole("banner").getByRole("link", { name: "뒤로" });
  await expect(settingsBack).toHaveAttribute("href", `${baselineClubAppPath}/me`);
  await expect(settingsBack).toHaveText("뒤로");
  await expect(page.getByRole("banner").locator(".m-hdr-title")).toHaveText("내 공간");
  await expect(settings.locator(".rm-my-shelf-kicker")).toBeHidden();
  await expect(settings.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await settingsBack.click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/me$`));
});

test("account menu advances keyboard focus naturally and returns it after Escape", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/me");

  const accountTrigger = page.getByRole("button", { name: /계정 메뉴$/ });
  await accountTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(accountTrigger).toHaveAttribute("aria-haspopup", "dialog");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "false");
  await expectReducedAccountDialog(dialog, "/app/notifications", "/app/me/settings");
  const notifications = dialog.getByRole("link", { name: "알림" });
  const settings = dialog.getByRole("link", { name: "계정 설정" });
  const logout = dialog.getByRole("button", { name: "로그아웃" });

  await expectDomOrder(accountTrigger, notifications, settings, logout);
  for (const locator of [accountTrigger, notifications, settings, logout]) {
    await expectPracticalTapTarget(locator);
  }

  await page.keyboard.press("Tab");
  await expect(notifications).toBeFocused();
  const focusStyle = await notifications.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).toBe("solid");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);
  expect(focusStyle.outlineColor).not.toBe(focusStyle.backgroundColor);
  await page.keyboard.press("Tab");
  await expect(settings).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(logout).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(accountTrigger).toBeFocused();
});

test("account menu disables popover motion when reduced motion is requested", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/me");
  await page.getByRole("button", { name: /계정 메뉴$/ }).click();

  const motion = await page.getByRole("dialog").evaluate((element) => {
    const style = getComputedStyle(element);
    return { duration: style.animationDuration, name: style.animationName };
  });

  expect(motion.name).toBe("none");
  expect(Number.parseFloat(motion.duration)).toBeLessThanOrEqual(0.001);
  await page.evaluate(() => {
    document.body.style.zoom = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
