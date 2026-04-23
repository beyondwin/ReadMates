import { expect, test, type Locator } from "@playwright/test";
import { loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";

async function expectPracticalTapTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

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
  await expect(page.locator(".app-content > .rm-route-reveal")).toBeVisible();
  const appNav = page.getByRole("navigation", { name: "앱 내비게이션" });
  await expect(appNav.getByRole("link", { name: "홈" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "이번 세션" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "클럽 노트" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "아카이브" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "내 공간" })).toBeVisible();
  const hostEntry = page.getByRole("banner").getByRole("link", { name: "호스트 화면" });
  await expect(hostEntry).toHaveAttribute("href", "/app/host");

  await hostEntry.click();
  await expect(page).toHaveURL(/\/app\/host$/);
  await expect(appNav.getByRole("link", { name: "운영" })).toHaveAttribute("aria-current", "page");
  await expect(appNav.getByRole("link", { name: "세션 편집" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "멤버 초대" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "멤버 승인" })).toBeVisible();

  await page.getByRole("link", { name: "멤버 화면으로" }).first().click();
  await expect(page).toHaveURL(/\/app$/);
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
  await expect(page.locator(".app-content > .rm-route-reveal")).toBeVisible();
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", "/app/host");
  await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveText("운영");
  await expectPracticalTapTarget(mobileHeader.getByRole("link", { name: "호스트 화면" }));
  await expect(mobileHeader.locator(".m-hdr-side")).toHaveCount(2);
  const memberTabs = page.getByRole("navigation", { name: "앱 탭" });
  await expect(memberTabs.getByRole("link")).toHaveText(["홈", "이번 세션", "클럽 노트", "아카이브", "내 공간"]);
  await expectPracticalTapTarget(memberTabs.getByRole("link", { name: "이번 세션" }));
  await memberTabs.getByRole("link", { name: "홈" }).click();
  await mobileHeader.getByRole("link", { name: "호스트 화면" }).click();
  await expect(page).toHaveURL(/\/app\/host$/);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("멤버");
  await expectPracticalTapTarget(mobileHeader.getByRole("link", { name: "멤버 화면으로" }));
  await mobileHeader.getByRole("link", { name: "멤버 화면으로" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/host/sessions/new");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("세션");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toContainText("오늘");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("멤버");

  const tabs = page.getByRole("navigation", { name: "앱 탭" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link")).toHaveText(["오늘", "세션", "멤버", "기록"]);
  await expect(tabs.getByRole("link", { name: "오늘" })).toHaveAttribute("href", "/app/host");
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("href", /\/app\/host\/sessions\/(.+\/edit|new)$/);
  await expect(tabs.getByRole("link", { name: "멤버" })).toHaveAttribute("href", "/app/host/members");
  await expect(tabs.getByRole("link", { name: "기록" })).toHaveAttribute("href", "/app/archive");
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "호스트" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "이번 세션" })).toHaveCount(0);
  await expectPracticalTapTarget(tabs.getByRole("link", { name: "세션" }));

  await tabs.getByRole("link", { name: "기록" }).click();
  await expect(page).toHaveURL(/\/app\/archive$/);
  await expect(mobileHeader).toContainText("기록");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("멤버");
  await expect(tabs.getByRole("link")).toHaveText(["오늘", "세션", "멤버", "기록"]);
  await expect(tabs.getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "아카이브" })).toHaveCount(0);

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
  await expect(page.getByRole("heading", { name: "운영 원장" })).toBeVisible();
  await page.getByRole("link", { name: /세션 문서 편집|새 세션 만들기/ }).first().click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/(.+\/edit|new)$/);
  await expect(page.getByRole("banner").getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");

  await page.getByRole("banner").getByRole("link", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/app\/host$/);
  await expect(page.getByRole("heading", { name: "운영 원장" })).toBeVisible();
});
