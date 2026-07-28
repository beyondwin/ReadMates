import type { Page } from "@playwright/test";

type JourneyFixtureMode = "normal" | "empty" | "load-more-error" | "fifteen-records";

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

const fifteenRecordSummary = {
  attendedSessionCount: 15,
  completedReadingCount: 7,
  questionCount: 12,
  reviewCount: 1,
  readableFeedbackDocumentCount: 15,
};

const fifteenRecordDates = [
  "2026-07-15",
  "2026-06-14",
  "2026-05-13",
  "2026-04-12",
  "2026-03-11",
  "2026-02-10",
  "2026-01-09",
  "2025-12-08",
  "2025-11-07",
  "2025-10-06",
  "2025-09-05",
  "2025-08-04",
  "2025-07-03",
  "2025-06-02",
  "2025-05-01",
] as const;

const fifteenRecords = fifteenRecordDates.map((date, index) => {
  const sessionNumber = fifteenRecordDates.length - index;

  return {
    sessionId: `journey-fifteen-${sessionNumber}`,
    sessionNumber,
    bookTitle:
      index === 0
        ? "아주 긴 한국어 제목과 An exceptionally long English subtitle for the integrated member shelf"
        : `공개 안전 독서 기록 ${sessionNumber}`,
    bookAuthor: `공개 안전 테스트 저자 ${sessionNumber}`,
    bookImageUrl: null,
    date,
    readingProgress: index < 7 ? 100 : 70,
    questionCount: index < 12 ? 1 : 0,
    reviewCount: index === 0 ? 1 : 0,
    feedbackDocument: {
      available: true,
      readable: true,
      lockedReason: null,
    },
  };
});

export async function mockMyReadingShelfJourney(page: Page, mode: JourneyFixtureMode = "normal") {
  await page.route("**/api/bff/api/archive/me/journey**", async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");

    if (mode === "fifteen-records") {
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "12", 10);
      const offset = cursor?.match(/^journey-cursor-(\d+)$/)?.[1];
      const start = offset ? Number.parseInt(offset, 10) : 0;
      const items = fifteenRecords.slice(start, start + limit);
      const nextOffset = start + items.length;

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items,
          nextCursor:
            nextOffset < fifteenRecords.length
              ? `journey-cursor-${nextOffset}`
              : null,
          summary: fifteenRecordSummary,
        }),
      });
      return;
    }

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
