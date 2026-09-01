import { expect, test, type Page } from "@playwright/test";
import {
  countManualNotificationEventsForSession,
  createOpenSessionFixture,
  loginWithGoogleFixture,
  readNotificationEventCount,
  resetE2eState,
} from "./readmates-e2e-db";

test.describe.configure({ mode: "serial" });

const CLUB_SLUG = "reading-sai";
const HOST_PATH = `/clubs/${CLUB_SLUG}/app/host`;

function resetNextBookComposerState() {
  resetE2eState({
    cleanupGeneratedSessions: true,
    cleanupManualNotifications: true,
    googleLoginEmails: ["host@example.com", "member1@example.com"],
  });
  createOpenSessionFixture();
}

async function createDraftAndPublishNextBook(
  page: Page,
  suffix: string,
) {
  const bookTitle = `Next Book Composer ${suffix}`;
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(HOST_PATH);
  const currentMeeting = page.getByRole("group", { name: "현재 모임" });
  await expect(currentMeeting).toBeVisible();
  const meetingHref = await currentMeeting.getByRole("link", { name: "모임 정보" }).getAttribute("href");
  expect(meetingHref).toBeTruthy();
  await page.goto(new URL(meetingHref!, page.url()).pathname);
  await page.getByRole("region", { name: "지금 할 일" }).getByRole("button", { name: "모임 마치기" }).click();
  await page.getByRole("dialog", { name: "모임 마치기" }).getByRole("button", { name: "모임 마치기" }).click();
  await expect(page.getByText("기록 정리 중")).toBeVisible();
  await page.goto(`${HOST_PATH}/sessions/new`);
  await expect(page.getByRole("heading", { level: 1, name: "새 모임 만들기" })).toBeVisible();
  await page.getByLabel("모임 제목").fill(`새 모임 · ${bookTitle}`);
  await page.getByLabel("책 제목").fill(bookTitle);
  await page.getByLabel("저자").fill("Public Fixture Author");
  await page.getByLabel("모임 날짜").fill("2026-08-20");
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && /\/api\/bff\/api\/host\/sessions\/?(?:\?|$)/.test(response.url()),
  );
  await page.getByRole("button", { name: "모임 초안 저장" }).click();
  const createdResponse = await created;
  expect(createdResponse.ok()).toBe(true);
  const sessionId = ((await createdResponse.json()) as { sessionId: string }).sessionId;
  await expect(page.getByRole("heading", { name: "모임 초안을 저장했습니다" })).toBeVisible();

  const visibilityStatus = await page.evaluate(async (id) => {
    const response = await fetch(`/api/bff/api/host/sessions/${id}/access-scope`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "X-Readmates-Client-Contract": "v3",
      },
      body: JSON.stringify({ accessScope: "GUEST_READABLE" }),
    });
    return response.status;
  }, sessionId);
  expect(visibilityStatus).toBe(200);
  await page.goto(`${HOST_PATH}/notifications?sessionId=${encodeURIComponent(sessionId)}&eventType=NEXT_BOOK_PUBLISHED`);
  await expect(page.getByRole("heading", { level: 1, name: "알림 발송 작업대" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "다음 책 확정" })).toBeChecked();

  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  return sessionId;
}

test.beforeEach(resetNextBookComposerState);
test.afterEach(resetNextBookComposerState);

test.describe("next-book composer follows the canonical meeting list", () => {
test("closing the canonical next-book preview with Escape never confirms", async ({ page }) => {
  const sessionId = await createDraftAndPublishNextBook(page, "Escape");

  await page.getByRole("button", { name: "미리보기 열기" }).click();
  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeHidden();
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
});

test("dismissing the canonical next-book preview never confirms", async ({ page }) => {
  const sessionId = await createDraftAndPublishNextBook(page, "Skip");

  await page.getByRole("button", { name: "미리보기 열기" }).click();
  const preview = page.getByRole("dialog", { name: "발송 전 확인" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "닫기" }).click();

  await expect(preview).toBeHidden();
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
});

test("confirm creates exactly one dispatch and retry remains one", async ({ page }) => {
  const sessionId = await createDraftAndPublishNextBook(page, "Confirm");

  await page.getByRole("button", { name: "미리보기 열기" }).click();
  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeVisible();
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);

  const confirmRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST"
      && request.url().includes("/host/notifications/manual")
      && !request.url().includes("/preview"),
  );
  const confirmResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && response.url().includes("/host/notifications/manual")
      && !response.url().includes("/preview"),
  );
  await page.getByRole("button", { name: /명에게 알림 발송$/ }).click();
  const request = await confirmRequest;
  const response = await confirmResponse;
  expect(response.status(), await response.text()).toBe(200);
  const confirmBody = request.postDataJSON();

  await expect.poll(
    () => countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED"),
  ).toBe(1);
  await expect.poll(
    () => readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED"),
  ).toBe(1);

  const retryStatus = await page.evaluate(async ({ body, clubSlug }) => {
    const retryResponse = await fetch(
      `/api/bff/api/host/notifications/manual?clubSlug=${encodeURIComponent(clubSlug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Readmates-Client-Contract": "v3",
        },
        body: JSON.stringify(body),
      },
    );
    return retryResponse.status;
  }, { body: confirmBody, clubSlug: CLUB_SLUG });

  expect(retryStatus).toBe(200);
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(1);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(1);
});
});
