import { expect, test, type Page, type Route } from "@playwright/test";

const CLUB_SLUG = "reading-sai";
const LATEST_SESSION_ID = "public-session-6";
const previewRobotsSelector = 'meta[data-readmates-living-archive-preview="true"]';

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function routePublicPreviewContracts(page: Page) {
  const recentSessions = Array.from({ length: 6 }, (_, index) => {
    const sessionNumber = 6 - index;

    return {
      sessionId: `public-session-${sessionNumber}`,
      sessionNumber,
      bookTitle: `공개 기록 책 ${sessionNumber}`,
      bookAuthor: `공개 저자 ${sessionNumber}`,
      bookImageUrl: null,
      date: `2026-0${8 - index}-03`,
      summary: "공개 가능한 대화의 요약입니다.",
      highlightCount: 1,
      oneLinerCount: 1,
    };
  });

  await page.route("**/api/bff/api/auth/me", async (route) => {
    await json(route, { authenticated: false });
  });
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}`, async (route) => {
    await json(route, {
      clubName: "읽는사이",
      tagline: "함께 읽고 깊게 나눕니다.",
      about: "공개 가능한 기록을 차분히 남기는 독서모임입니다.",
      stats: { sessions: 6, books: 6, members: 12 },
      recentSessions,
    });
  });
  await page.route(`**/api/bff/api/public/clubs/${CLUB_SLUG}/sessions/${LATEST_SESSION_ID}`, async (route) => {
    await json(route, {
      ...recentSessions[0],
      highlights: [
        {
          text: "공개 가능한 하이라이트입니다.",
          sortOrder: 1,
          authorName: "공개 독자 A",
          authorShortName: "A",
          avatarKey: "public-reader-a",
        },
      ],
      oneLiners: [
        {
          authorName: "공개 독자 B",
          authorShortName: "B",
          avatarKey: "public-reader-b",
          text: "공개 가능한 한줄평입니다.",
        },
      ],
    });
  });
}

test("living archive preview stays direct-only and leaves the public home unchanged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1487, height: 1058 });
  await routePublicPreviewContracts(page);

  await page.goto("/living-archive-preview");

  const preview = page.locator(".living-archive-preview");
  await expect(preview.getByRole("heading", { level: 1, name: "책 사이에 사람이 남습니다" })).toBeVisible();
  await expect(page.locator(previewRobotsSelector)).toHaveAttribute("name", "robots");
  await expect(page.locator(previewRobotsSelector)).toHaveAttribute("content", "noindex,nofollow");

  const geometry = await preview.evaluate((root) => {
    const bounds = (selector: string) => {
      const rect = root.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    };

    return {
      header: bounds(".living-archive-preview__header"),
      statement: bounds(".living-archive-preview__statement"),
      shelf: bounds(".lap-shelf"),
      strip: bounds(".lap-editorial-strip"),
    };
  });
  expect(Math.abs(geometry.header.bottom / 1058 - 0.09)).toBeLessThanOrEqual(8 / 1058);
  expect(Math.abs(geometry.statement.left / 1487 - 0.04)).toBeLessThanOrEqual(16 / 1487);
  expect(Math.abs(geometry.statement.top / 1058 - 0.11)).toBeLessThanOrEqual(16 / 1058);
  expect(Math.abs(geometry.shelf.top / 1058 - 0.368)).toBeLessThanOrEqual(16 / 1058);
  expect(Math.abs(geometry.strip.top / 1058 - 0.778)).toBeLessThanOrEqual(16 / 1058);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await preview.getByRole("link", { name: "공개 기록 보기" }).first().click();
  await expect(page).toHaveURL("/records");
  await page.getByRole("navigation", { name: "공개 내비게이션" }).getByRole("link", { name: "홈", exact: true }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "읽는사이" })).toBeVisible();
  await expect(page.locator(previewRobotsSelector)).toHaveCount(0);

  const topNavigation = page.getByRole("navigation", { name: "공개 내비게이션" });
  const footerNavigation = page.getByRole("navigation", { name: "공개 하단 탐색" });
  await expect(topNavigation.locator('a[href="/living-archive-preview"]')).toHaveCount(0);
  await expect(footerNavigation.locator('a[href="/living-archive-preview"]')).toHaveCount(0);
  await expect(page.locator('a[href="/living-archive-preview"]')).toHaveCount(0);
});
