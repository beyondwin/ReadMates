import { expect, test, type Page } from "@playwright/test";
import {
  cleanupGeneratedSessions,
  createHostSessionFixture,
  loginWithGoogleFixture,
  resetSeedGoogleLogins,
} from "./readmates-e2e-db";

const CLUB_SLUG = "reading-sai";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;
const BOOK_TITLE = "경계가 긴 한글 모임 제목과 A deliberately long English meeting title";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});

test.afterEach(() => {
  cleanupGeneratedSessions();
  resetSeedGoogleLogins(["host@example.com"]);
});

async function openMeeting(page: Page, sessionId: string, search = "") {
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/sessions/${sessionId}${search}`);
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(BOOK_TITLE) })).toBeVisible();
}

test("host sees one Focus Deck with related-work links and independent publication language", async ({ page }) => {
  const sessionId = createHostSessionFixture({
    number: 27,
    bookTitle: BOOK_TITLE,
    state: "OPEN",
    date: "2026-08-25",
  });
  await openMeeting(page, sessionId);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "관련 작업" })).toBeVisible();
  await expect(page.getByRole("link", { name: /참석 응답/ })).toHaveAttribute("href", /section=responses/);
  await expect(page.getByRole("region", { name: "진행 목록" })).toContainText("게스트·멤버");
  await expect(page.getByRole("region", { name: "진행 목록" })).toContainText("공개 기록에 게시 안 됨");
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText(/\d+\/\d+ 완료/)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "현재 모임 작업" })).toHaveCount(0);

  const attendance = page.getByRole("link", { name: /실제 출석/ });
  await attendance.click();
  await expect(page).toHaveURL(/section=attendance/);
  await expect(page.getByRole("heading", { name: "출석", exact: true })).toBeVisible();
});

test("mobile info sheet is modal, keyboard-dismissible, and restores its trigger", async ({ page }) => {
  const sessionId = createHostSessionFixture({
    number: 28,
    bookTitle: BOOK_TITLE,
    state: "OPEN",
    date: "2026-08-25",
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await openMeeting(page, sessionId);
  const trigger = page.getByRole("button", { name: "모임 정보" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "모임 정보" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("record panel failure does not remove basic meeting work and exposes retry", async ({ page }) => {
  const sessionId = createHostSessionFixture({
    number: 29,
    bookTitle: BOOK_TITLE,
    state: "CLOSED",
    date: "2026-07-20",
  });
  await page.route(`**/api/bff/api/host/sessions/${sessionId}/record-editor**`, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ code: "UNAVAILABLE" }),
  }));
  await openMeeting(page, sessionId, "?section=records");
  await expect(page.getByText("모임 기록을 불러오지 못했습니다.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(BOOK_TITLE);
  await expect(page.getByRole("navigation", { name: "관련 작업" })).toBeVisible();
  await expect(page.getByRole("link", { name: "참석 응답" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 기록 다시 시도" }).first()).toBeVisible();
});
