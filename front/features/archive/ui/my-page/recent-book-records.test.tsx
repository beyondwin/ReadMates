import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { RecentBookRecords } from "./recent-book-records";

function item(sessionNumber: number, bookTitle: string): MyJourneyItem {
  return {
    sessionId: `session-${sessionNumber}`,
    sessionNumber,
    bookTitle,
    bookAuthor: "저자",
    bookImageUrl: null,
    date: "2026-07-22",
    readingProgress: 100,
    questionCount: 0,
    reviewCount: 0,
    feedbackDocument: { available: true, readable: true, lockedReason: null },
  };
}

const [first, second, third, fourth] = [
  item(4, "네 번째 책"),
  item(3, "세 번째 책"),
  item(2, "두 번째 책"),
  item(1, "첫 번째 책"),
];

describe("RecentBookRecords", () => {
  it("renders at most three rows and a scoped full-history link", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/me"]}>
        <RecentBookRecords items={[first, second, third, fourth]} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByText(fourth.bookTitle)).toBeNull();
    expect(screen.getByRole("link", {
      name: "내 기록 전체 보기",
    })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/me/records",
    );
  });
});
