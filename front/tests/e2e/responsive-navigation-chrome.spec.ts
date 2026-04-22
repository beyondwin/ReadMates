import { expect, test } from "@playwright/test";
import { loginWithGoogleFixture, resetSeedGoogleLogins } from "./readmates-e2e-db";

test.beforeEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  resetSeedGoogleLogins(["host@example.com"]);
});

test("desktop public and host pages show the expected top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/");
  const publicNav = page.getByRole("navigation", { name: "공개 내비게이션" });
  await expect(publicNav.getByRole("link", { name: "소개" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "클럽" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "공개 기록" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);

  await page.goto("/records");
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(page.getByText(/공개 기록 · No\./)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);

  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app");
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
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = page.getByRole("banner");

  await page.goto("/");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("읽는사이");
  await expect(page.getByRole("navigation", { name: "앱 탭" })).toHaveCount(0);

  await page.goto("/login");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("로그인");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/");
  await loginWithGoogleFixture(page, "host@example.com");

  await page.goto("/app");
  await expect(mobileHeader.getByRole("link", { name: "운영" })).toHaveAttribute("href", "/app/host");
  const memberTabs = page.getByRole("navigation", { name: "앱 탭" });
  await expect(memberTabs.getByRole("link")).toHaveText(["홈", "이번 세션", "클럽 노트", "아카이브", "내 공간"]);
  await memberTabs.getByRole("link", { name: "홈" }).click();
  await mobileHeader.getByRole("link", { name: "운영" }).click();
  await expect(page).toHaveURL(/\/app\/host$/);
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면" })).toHaveAttribute("href", "/app");
  await mobileHeader.getByRole("link", { name: "멤버 화면" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/host/sessions/new");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("세션");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면" })).toHaveAttribute("href", "/app");

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

  await tabs.getByRole("link", { name: "기록" }).click();
  await expect(page).toHaveURL(/\/app\/archive$/);
  await expect(mobileHeader).toContainText("기록");
  await expect(mobileHeader.getByRole("link", { name: "멤버 화면" })).toHaveAttribute("href", "/app");
  await expect(tabs.getByRole("link")).toHaveText(["오늘", "세션", "멤버", "기록"]);
  await expect(tabs.getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "아카이브" })).toHaveCount(0);

  const editHref = await tabs.getByRole("link", { name: "세션" }).getAttribute("href");
  expect(editHref).toBeTruthy();

  await page.goto(editHref!);
  await expect(mobileHeader).toContainText("세션");
  await expect(tabs.getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
});
