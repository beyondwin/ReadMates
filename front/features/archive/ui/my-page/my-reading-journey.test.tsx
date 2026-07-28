import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingJourney } from "./my-reading-journey";

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

function renderJourney(overrides: Partial<Parameters<typeof MyReadingJourney>[0]> = {}) {
  const props: Parameters<typeof MyReadingJourney>[0] = {
    items: [item()],
    hasMore: false,
    loadMorePending: false,
    loadMoreError: false,
    onLoadMore: vi.fn().mockResolvedValue(undefined),
    onRetryLoadMore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return { ...render(<MyReadingJourney {...props} />), props };
}

describe("MyReadingJourney", () => {
  it("renders each journey item in the grouped full-record row", () => {
    renderJourney({ items: [item(), item({ sessionId: "session-8", sessionNumber: 8, bookTitle: "두 번째 책" })] });

    expect(screen.getByRole("heading", { level: 2, name: "내 책별 기록" })).toBeVisible();
    expect(screen.getByRole("region", { name: "2026년 기록" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByText(/마지막 기록은/)).toBeNull();
    expect(screen.queryByText("질문 2")).toBeNull();
    expect(screen.queryByText("서평 1")).toBeNull();
  });

  it("keeps session and feedback actions as sibling links and skips zero-result chips", () => {
    renderJourney({ items: [item({ questionCount: 0, reviewCount: 0 })] });

    const row = screen.getByRole("article", { name: "9차 보이지 않는 도시들" });
    const sessionLink = within(row).getByRole("link", { name: "회차 기록" });
    const feedbackLink = within(row).getByRole("link", { name: "피드백 문서" });

    expect(sessionLink).toHaveAttribute("href", "/app/sessions/session-9");
    expect(feedbackLink).toHaveAttribute("href", "/app/feedback/session-9");
    expect(sessionLink.contains(feedbackLink)).toBe(false);
    expect(feedbackLink.contains(sessionLink)).toBe(false);
    expect(within(row).getByRole("heading", { level: 3, name: "보이지 않는 도시들" }).querySelector("a")).toBeNull();
    expect(screen.queryByText("질문 0")).not.toBeInTheDocument();
    expect(screen.queryByText("서평 0")).not.toBeInTheDocument();
  });

  it("uses a title-derived typographic cover when a book cover is missing", () => {
    renderJourney();

    expect(screen.getAllByLabelText("보이지 않는 도시들 표지 없음")).toHaveLength(1);
    expect(screen.getAllByText("보").length).toBeGreaterThan(0);
  });

  it("groups malformed and impossible dates under an unknown-year section", () => {
    renderJourney({
      items: [
        item({ date: "2026-02-30" }),
        item({ sessionId: "session-8", date: "unknown" }),
      ],
    });

    expect(screen.getByRole("region", { name: "연도 미상 기록" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("keeps feedback permission limits compact in the shared record row", () => {
    const { rerender } = renderJourney({
      items: [item({ feedbackDocument: { available: true, readable: false, lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED" } })],
    });

    expect(screen.getByText("열람 제한")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "피드백 문서" })).not.toBeInTheDocument();

    rerender(
      <MyReadingJourney
        items={[item({ feedbackDocument: { available: false, readable: false, lockedReason: "NOT_AVAILABLE" } })]}
        hasMore={false}
        loadMorePending={false}
        loadMoreError={false}
        onLoadMore={async () => undefined}
        onRetryLoadMore={async () => undefined}
      />,
    );

    expect(screen.queryByText("열람 제한")).not.toBeInTheDocument();
  });

  it("announces loading, preserves a keyboard-reachable retry, and exposes errors", async () => {
    const user = userEvent.setup();
    const onRetryLoadMore = vi.fn().mockResolvedValue(undefined);
    renderJourney({ hasMore: true, loadMorePending: true, loadMoreError: true, onRetryLoadMore });

    expect(screen.getByRole("status")).toHaveTextContent("기록을 불러오는 중");
    expect(screen.getByRole("alert")).toHaveTextContent("기록을 더 불러오지 못했습니다.");
    expect(screen.getByTestId("my-reading-journey-load-more")).toHaveAttribute("aria-busy", "true");

    const retry = screen.getByRole("button", { name: "다시 시도" });
    retry.focus();
    expect(retry).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRetryLoadMore).toHaveBeenCalledTimes(1);
  });
});
