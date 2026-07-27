import type { Page } from "@playwright/test";

type JourneyFixtureMode = "normal" | "empty" | "load-more-error";

const firstPage = {
  items: [
    {
      sessionId: "journey-2026-03",
      sessionNumber: 12,
      bookTitle: "아주 긴 한국어 제목과 An exceptionally long English subtitle for a responsive reading shelf",
      bookAuthor: "공개 안전 테스트 저자",
      bookImageUrl: null,
      date: "2026-07-20",
      readingProgress: 100,
      questionCount: 2,
      reviewCount: 1,
      feedbackDocument: { available: true, readable: true, lockedReason: null },
    },
    {
      sessionId: "journey-2025-11",
      sessionNumber: 9,
      bookTitle: "잠긴 피드백 문서가 있는 공개 안전 테스트 책",
      bookAuthor: "테스트 저자",
      bookImageUrl: "https://example.com/public-safe-cover.jpg",
      date: "2025-11-26",
      readingProgress: 70,
      questionCount: 0,
      reviewCount: 1,
      feedbackDocument: { available: true, readable: false, lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED" },
    },
  ],
  nextCursor: "journey-cursor-2",
  summary: {
    attendedSessionCount: 8,
    completedReadingCount: 5,
    questionCount: 13,
    reviewCount: 7,
    readableFeedbackDocumentCount: 1,
  },
};

const secondPage = {
  items: [
    {
      sessionId: "journey-2024-04",
      sessionNumber: 4,
      bookTitle: "다음 페이지의 중복 없는 기록",
      bookAuthor: "테스트 저자",
      bookImageUrl: null,
      date: "2024-04-19",
      readingProgress: null,
      questionCount: 1,
      reviewCount: 0,
      feedbackDocument: { available: false, readable: false, lockedReason: "NOT_AVAILABLE" },
    },
  ],
  nextCursor: null,
  summary: firstPage.summary,
};

const emptyPage = {
  items: [],
  nextCursor: null,
  summary: {
    attendedSessionCount: 0,
    completedReadingCount: 0,
    questionCount: 0,
    reviewCount: 0,
    readableFeedbackDocumentCount: 0,
  },
};

export async function mockMyReadingShelfJourney(page: Page, mode: JourneyFixtureMode = "normal") {
  await page.route("**/api/bff/api/archive/me/journey**", async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");

    if (mode === "empty") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(emptyPage) });
      return;
    }

    if (cursor === "journey-cursor-2") {
      if (mode === "load-more-error") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "TEMPORARY_UNAVAILABLE" }) });
        return;
      }

      await route.fulfill({ contentType: "application/json", body: JSON.stringify(secondPage) });
      return;
    }

    await route.fulfill({ contentType: "application/json", body: JSON.stringify(firstPage) });
  });
}

export async function mockNotificationPreferencesError(page: Page) {
  await page.route("**/api/bff/api/me/notifications/preferences**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "TEMPORARY_UNAVAILABLE" }) });
  });
}
