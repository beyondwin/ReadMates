import { expect, test } from "@playwright/experimental-ct-react";
import type { NoteFeedItem, NoteSessionItem } from "@/features/archive/model/notes-feed-model";
import { FeedSections } from "@/shared/ui/notes-feed-list";

const selectedSession: NoteSessionItem = {
  sessionId: "session-notes-typography",
  sessionNumber: 1,
  bookTitle: "읽기 테스트",
  date: "2026-08-01",
  questionCount: 0,
  oneLinerCount: 0,
  longReviewCount: 0,
  highlightCount: 1,
  totalCount: 1,
};

const items: NoteFeedItem[] = [
  {
    sessionId: selectedSession.sessionId,
    sessionNumber: selectedSession.sessionNumber,
    bookTitle: selectedSession.bookTitle,
    date: selectedSession.date,
    authorName: "읽는사이",
    authorShortName: "읽",
    avatarKey: "cloud-green-book",
    kind: "HIGHLIGHT",
    text: "오래 읽어도 편안한 문장이어야 합니다.",
  },
];

test("FeedSections keeps the mobile section heading in the semantic eyebrow role", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const component = await mount(
    <FeedSections items={items} filter="all" selectedSession={selectedSession} hasNoteSessions />,
  );
  const heading = component.getByRole("heading", { name: "하이라이트 · 1" });

  await expect(heading).toHaveClass(/eyebrow/);
  const typography = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });

  expect(typography.fontSize).toBe(12);
  expect(typography.lineHeight / typography.fontSize).toBeGreaterThanOrEqual(1.4);
});
