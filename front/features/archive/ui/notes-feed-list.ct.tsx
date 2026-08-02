import { expect, test } from "@playwright/experimental-ct-react";
import type { NoteFeedItem, NoteSessionItem } from "@/features/archive/model/notes-feed-model";
import { FeedSections } from "@/shared/ui/notes-feed-list";

const selectedSession: NoteSessionItem = {
  sessionId: "session-notes-typography",
  sessionNumber: 1,
  bookTitle: "읽기 테스트",
  date: "2026-08-01",
  questionCount: 1,
  oneLinerCount: 1,
  longReviewCount: 0,
  highlightCount: 1,
  totalCount: 3,
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
  {
    sessionId: selectedSession.sessionId,
    sessionNumber: selectedSession.sessionNumber,
    bookTitle: selectedSession.bookTitle,
    date: selectedSession.date,
    authorName: "질문한 멤버",
    authorShortName: "질문",
    avatarKey: "banana-green-book",
    kind: "QUESTION",
    text: "함께 읽은 뒤 무엇이 달라졌나요?",
  },
  {
    sessionId: selectedSession.sessionId,
    sessionNumber: selectedSession.sessionNumber,
    bookTitle: selectedSession.bookTitle,
    date: selectedSession.date,
    authorName: "한줄평 멤버",
    authorShortName: "한줄",
    avatarKey: "cloud-green-book",
    kind: "ONE_LINE_REVIEW",
    text: "조용히 오래 남는 책이었습니다.",
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
  const avatars = component.locator(".rm-avatar-chip");
  await expect(avatars).toHaveCount(3);
  await expect(avatars.first()).toHaveAttribute("data-avatar-size-role", "author");
  const avatarSizes = await avatars.evaluateAll((avatarNodes) =>
    avatarNodes.map((avatar) => avatar.getBoundingClientRect().width),
  );
  expect(avatarSizes.every((size) => size === 36)).toBe(true);
  expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
