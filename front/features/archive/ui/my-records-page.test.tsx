import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { MyRecordsPage } from "./my-records-page";

function item(overrides: Partial<MyJourneyItem> = {}): MyJourneyItem {
  return {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "보이지 않는 도시들",
    bookAuthor: "이탈로 칼비노",
    bookImageUrl: null,
    date: "2026-07-22",
    readingProgress: 100,
    questionCount: 2,
    reviewCount: 1,
    feedbackDocument: { available: true, readable: true, lockedReason: null },
    ...overrides,
  };
}

describe("MyRecordsPage", () => {
  it("frames the full grouped history as a personal reading page", () => {
    render(
      <MemoryRouter>
        <MyRecordsPage
          items={[item()]}
          hasMore={false}
          loadMorePending={false}
          loadMoreError={false}
          onLoadMore={vi.fn().mockResolvedValue(undefined)}
          onRetryLoadMore={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "내 책별 기록" })).toBeVisible();
    expect(screen.getByText("함께 읽은 책을 최근 기록부터 다시 살펴보세요.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "내 책별 기록" })).toBeVisible();
    expect(screen.getByRole("region", { name: "2026년 기록" })).toBeVisible();
  });
});
