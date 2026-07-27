import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";
import { mockMyReadingShelfJourney, mockNotificationPreferencesError } from "./my-reading-shelf-fixtures";

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

async function pressTabUntilFocused(page: Page, target: Locator, label: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      return;
    }
  }

  throw new Error(`Tab did not reach ${label}`);
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

const memberMobileTabs = ["홈", "이번 세션", "클럽 노트", "아카이브", "알림", "내 공간"];
const hostMobileTabs = ["홈", "세션", "알림", "멤버", "기록"];
const baselineClubAppPath = "/clubs/reading-sai/app";
const baselineClubHostPath = `${baselineClubAppPath}/host`;

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
  await expect(publicNav.getByRole("link", { name: "소개" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "클럽" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "공개 기록" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);

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
  await expect(appNav.getByRole("link", { name: "홈" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "이번 세션" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "클럽 노트" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "아카이브" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "내 공간" })).toBeVisible();
  const hostEntry = page.getByRole("banner").getByRole("link", { name: "호스트 화면" });
  await expect(hostEntry).toHaveAttribute("href", baselineClubHostPath);

  await hostEntry.click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubHostPath}$`));
  await expect(appNav.getByRole("link", { name: "운영" })).toHaveAttribute("aria-current", "page");
  await expect(appNav.getByRole("link", { name: "세션 기록" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "멤버 초대" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "멤버 승인" })).toBeVisible();

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
  const mobileHeader = page.getByRole("banner");

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
  await expect(mobileHeader.locator(".m-hdr-side")).toHaveCount(2);
  const memberTabs = page.getByRole("navigation", { name: "앱 탭" });
  await expect(memberTabs.getByRole("link")).toHaveText(memberMobileTabs);
  await expectPracticalTapTarget(memberTabs.getByRole("link", { name: "이번 세션" }));
  await memberTabs.getByRole("link", { name: "알림" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/notifications$`));
  await expect(page.getByRole("heading", { name: "알림" })).toBeVisible();
  await expect(page.getByText("아직 받은 알림이 없습니다.")).toBeVisible();
  await memberTabs.getByRole("link", { name: "홈" }).click();
  await mobileHeader.getByRole("link", { name: "호스트 화면" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubHostPath}$`));
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", baselineClubAppPath);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveClass(/m-hdr-link--icon/);
  await expectPracticalTapTarget(mobileHeader.getByRole("link", { name: "멤버 화면으로" }));
  await mobileHeader.getByRole("link", { name: "멤버 화면으로" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}$`));
  await memberTabs.getByRole("link", { name: "아카이브" }).click();
  await expect(page).toHaveURL(new RegExp(`${baselineClubAppPath}/archive$`));
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", baselineClubHostPath);
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveText("");
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveClass(/m-hdr-link--icon/);
  await expect(memberTabs.getByRole("link")).toHaveText(memberMobileTabs);
  await expect(memberTabs.getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
  await expect(memberTabs.getByRole("link", { name: "기록" })).toHaveCount(0);

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
  await expect(tabs.getByRole("link", { name: "홈" })).toHaveAttribute("href", baselineClubHostPath);
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("href", /\/app\/host\/sessions\/(.+\/edit|new)$/);
  await expect(tabs.getByRole("link", { name: "알림" })).toHaveAttribute("href", `${baselineClubHostPath}/notifications`);
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
  await expect(page).toHaveURL(/\/app\/host\/sessions\/.+\/edit/);
  await expect(page.getByRole("tab", { name: "공개 기록" })).toBeVisible();
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
  await expect(page).toHaveURL(/\/app\/host$/);
  await expect(page.getByRole("heading", { name: "모임 운영" })).toBeVisible();
  await page.getByRole("link", { name: /세션 문서 편집|세션 문서 만들기/ }).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/app\/host\/sessions\/(.+\/edit|new)$/);
  await expect(page.getByRole("banner").getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");

  await page.getByRole("banner").getByRole("link", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/app\/host$/);
  await expect(page.getByRole("heading", { name: "모임 운영" })).toBeVisible();
});

test("reading shelf preserves semantic hierarchy and record order on desktop and mobile", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await loginWithGoogleFixture(page, "host@example.com");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/me");

    const shelf = page.locator(".rm-my-shelf");
    await expect(shelf.getByRole("heading", { level: 1, name: "나의 서재" })).toHaveCount(1);
    await expect(shelf.getByRole("heading", { level: 2 })).toContainText(["최근 책별 기록", "책별 기록"]);
    await expect(shelf.getByRole("heading", { level: 3 })).toContainText([
      "아주 긴 한국어 제목과 An exceptionally long English subtitle for a responsive reading shelf",
      "잠긴 피드백 문서가 있는 공개 안전 테스트 책",
    ]);

    const rows = shelf.getByRole("article");
    await expect(rows).toHaveCount(2);
    await expect(rows).toContainText([
      "아주 긴 한국어 제목과 An exceptionally long English subtitle for a responsive reading shelf",
      "잠긴 피드백 문서가 있는 공개 안전 테스트 책",
    ]);
    await expect(shelf.getByText("2026", { exact: true })).toBeVisible();
    await expect(shelf.getByText("2025", { exact: true })).toBeVisible();
    await expect(shelf.getByText("정식 멤버가 되면 피드백 문서를 읽을 수 있습니다.")).toBeVisible();
    await expect(shelf.getByLabel("아주 긴 한국어 제목과 An exceptionally long English subtitle for a responsive reading shelf 표지 없음")).toBeVisible();

    const sessionLink = rows.first().getByRole("link", { name: "회차 기록" });
    const feedbackLink = rows.first().getByRole("link", { name: "피드백 문서" });
    await expect(sessionLink).toBeVisible();
    await expect(feedbackLink).toBeVisible();
    expect(await sessionLink.evaluate((element) => element.parentElement?.querySelectorAll("a").length === 2)).toBe(true);
    await expectDomOrder(
      shelf.getByRole("heading", { level: 1, name: "나의 서재" }),
      shelf.getByRole("region", { name: "개인 요약" }),
      shelf.getByRole("region", { name: "최근 책별 기록" }),
      shelf.getByText("2026", { exact: true }),
      rows.first(),
      shelf.getByText("2025", { exact: true }),
      rows.nth(1),
    );

    if (viewport.width === 1440) {
      await expect(shelf.getByRole("region", { name: "계정과 알림" })).not.toBeVisible();
      expect(await shelf.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(820);
    } else {
      await expectPracticalTapTarget(shelf.getByRole("button", { name: "계정·알림 설정" }));
      await expectPracticalTapTarget(sessionLink);
      await expectPracticalTapTarget(feedbackLink);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("reading shelf keeps settings and retry failures reachable above mobile navigation", async ({ page }) => {
  await mockMyReadingShelfJourney(page, "load-more-error");
  await mockNotificationPreferencesError(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/me");

  await page.getByRole("button", { name: "기록 더 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "기록을 더 불러오지 못했습니다." })).toBeVisible();
  await expectPracticalTapTarget(page.getByRole("button", { name: "다시 시도" }).first());

  await page.getByRole("button", { name: "계정·알림 설정" }).click();
  const settings = page.getByRole("region", { name: "계정과 알림" });
  await expect(settings.getByRole("alert")).toContainText("알림 설정을 불러오지 못했습니다.");
  await expect(settings.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "탈퇴" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("reading shelf advances actual keyboard focus through record and account controls", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/me");

  const settingsTrigger = page.getByRole("button", { name: "계정·알림 설정" });
  const sessionRecord = page.getByRole("link", { name: "회차 기록" }).first();
  const feedbackDocument = page.getByRole("link", { name: "피드백 문서" }).first();
  const loadMore = page.getByRole("button", { name: "기록 더 보기" });
  await settingsTrigger.click();

  const settings = page.getByRole("region", { name: "계정과 알림" });
  const profile = settings.getByRole("heading", { name: "프로필" });
  await expect(profile).toBeVisible();
  await expect(settings.getByRole("button", { name: "이름 변경" })).toHaveCount(0);
  const notification = settings.getByRole("switch", { name: "이메일 알림" });
  const logout = settings.getByRole("button", { name: "로그아웃" });
  const leave = settings.getByRole("button", { name: "탈퇴" });

  await expectDomOrder(settingsTrigger, sessionRecord, feedbackDocument, loadMore, profile, notification, logout, leave);
  for (const locator of [settingsTrigger, sessionRecord, feedbackDocument, loadMore, notification, logout, leave]) {
    await expectPracticalTapTarget(locator);
  }

  await settingsTrigger.focus();
  await expect(settingsTrigger).toBeFocused();
  await pressTabUntilFocused(page, sessionRecord, "session record");
  await page.screenshot({ path: "test-results/task6-fix-round-1-keyboard-focus.png" });
  await pressTabUntilFocused(page, feedbackDocument, "feedback document");
  await pressTabUntilFocused(page, loadMore, "load more");
  // This route intentionally denies self-profile editing, so the visible profile
  // state replaces the absent edit button and focus advances to notification.
  await expect(settings.getByLabel("이름 변경 준비 중")).toBeVisible();
  await pressTabUntilFocused(page, notification, "notification preference");
  await pressTabUntilFocused(page, logout, "logout");
  await pressTabUntilFocused(page, leave, "membership action");
});

test("reading shelf disables switch motion when reduced motion is requested", async ({ page }) => {
  await mockMyReadingShelfJourney(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/app/me");
  await page.getByRole("button", { name: "계정·알림 설정" }).click();

  const transition = await page.locator(".rm-my-shelf-notification-switch__thumb").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { duration: style.transitionDuration, property: style.transitionProperty };
  });

  expect(transition.property).toBe("none");
  expect(Number.parseFloat(transition.duration)).toBeLessThanOrEqual(0.001);
  await page.evaluate(() => {
    document.body.style.zoom = "200%";
  });
  await page.screenshot({ path: "test-results/task6-fix-round-1-reduced-motion-zoom.png" });
});
