import { expect, test, type Page } from "@playwright/test";
import {
  countManualNotificationEventsForSession,
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
}

async function createDraftAndPublishNextBook(
  page: Page,
  suffix: string,
) {
  const bookTitle = `Next Book Composer ${suffix}`;
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`${HOST_PATH}/sessions/new`);
  await page.getByLabel("세션 제목").fill(`Next Book Composer Session ${suffix}`);
  await page.getByLabel("책 제목").fill(bookTitle);
  await page.getByLabel("저자").fill("Public Fixture Author");
  await page.getByLabel("모임 날짜").fill("2026-08-20");
  await page.getByRole("button", { name: "세션 문서 저장" }).click();
  await expect(page).toHaveURL(/\/app\/host\/sessions\/[^/]+\/edit/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-2) ?? "";
  expect(sessionId).not.toBe("");

  await page.goto(HOST_PATH);
  const visibilityResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH"
      && response.url().includes(`/host/sessions/${sessionId}/visibility`),
  );
  await page.getByRole("button", {
    name: new RegExp(`${bookTitle} 공개 범위를 멤버 공개로 변경`),
  }).click();
  const saved = await visibilityResponse;
  expect(saved.status(), await saved.text()).toBe(200);
  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeVisible();

  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  return sessionId;
}

test.beforeEach(resetNextBookComposerState);
test.afterEach(resetNextBookComposerState);

test("closing the first-publication composer with Escape never confirms", async ({ page }) => {
  const sessionId = await createDraftAndPublishNextBook(page, "Escape");

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeHidden();
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
});

test("skipping the first-publication composer never confirms", async ({ page }) => {
  const sessionId = await createDraftAndPublishNextBook(page, "Skip");

  await page.getByRole("button", { name: "이번에는 보내지 않기" }).click();

  await expect(page.getByRole("dialog", { name: "알림 보내기" })).toBeHidden();
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(0);
});

test("confirm creates exactly one dispatch and retry remains one", async ({ page }) => {
  const sessionId = await createDraftAndPublishNextBook(page, "Confirm");

  await page.getByRole("button", { name: "알림 미리보기" }).click();
  await expect(page.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
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
  await page.getByRole("button", { name: "발송 확인" }).click();
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return retryResponse.status;
  }, { body: confirmBody, clubSlug: CLUB_SLUG });

  expect(retryStatus).toBe(200);
  expect(countManualNotificationEventsForSession(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(1);
  expect(await readNotificationEventCount(sessionId, "NEXT_BOOK_PUBLISHED")).toBe(1);
});
