import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { BookRecordRow } from "./book-record-row";

function item(overrides: Partial<MyJourneyItem> = {}): MyJourneyItem {
  return {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "보이지 않는 도시들",
    bookAuthor: "이탈로 칼비노",
    bookImageUrl: null,
    date: "2026-07-22",
    readingProgress: 100,
    questionCount: 0,
    reviewCount: 0,
    feedbackDocument: { available: true, readable: true, lockedReason: null },
    ...overrides,
  };
}

describe("BookRecordRow", () => {
  it("renders one three-column row without per-book contribution copy", () => {
    render(<BookRecordRow item={item({ questionCount: 2, reviewCount: 1 })} />);

    const row = screen.getByRole("article", {
      name: "9차 보이지 않는 도시들",
    });
    expect(row).toHaveClass("rm-book-record-row");
    expect(within(row).getByText("9차 · 2026.07.22")).toBeVisible();
    expect(within(row).getByRole("heading", {
      level: 3,
      name: "보이지 않는 도시들",
    })).toBeVisible();
    expect(within(row).getByRole("link", {
      name: "회차 기록",
    })).toHaveAttribute("href", "/app/sessions/session-9");
    expect(within(row).getByRole("link", {
      name: "피드백 문서",
    })).toHaveAttribute("href", "/app/feedback/session-9");
    expect(row).not.toHaveTextContent("나의 기록");
    expect(row).not.toHaveTextContent("질문 2");
    expect(row).not.toHaveTextContent("서평 1");
  });

  it("shows a compact lock state only when feedback exists but is restricted", () => {
    const { rerender } = render(
      <BookRecordRow item={item({
        feedbackDocument: {
          available: true,
          readable: false,
          lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED",
        },
      })} />,
    );
    expect(screen.getByText("열람 제한")).toBeVisible();
    expect(screen.queryByRole("link", { name: "피드백 문서" })).toBeNull();

    rerender(<BookRecordRow item={item({
      feedbackDocument: {
        available: false,
        readable: false,
        lockedReason: "NOT_AVAILABLE",
      },
    })} />);
    expect(screen.queryByText("열람 제한")).toBeNull();
  });
});
