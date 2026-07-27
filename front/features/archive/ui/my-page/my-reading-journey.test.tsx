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
  it("keeps the canonical collection under 책별 기록 with h3 book titles", () => {
    renderJourney();

    expect(screen.getByRole("heading", { level: 2, name: "책별 기록" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3, name: "보이지 않는 도시들" })).toHaveLength(2);
    expect(screen.getByLabelText("최근 책별 기록")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "책별 기록" })).toBeInTheDocument();
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
    expect(screen.queryByText("질문 0")).not.toBeInTheDocument();
    expect(screen.queryByText("서평 0")).not.toBeInTheDocument();
  });

  it("uses a title-derived typographic cover when a book cover is missing", () => {
    renderJourney();

    expect(screen.getAllByLabelText("보이지 않는 도시들 표지 없음")).toHaveLength(2);
    expect(screen.getAllByText("보").length).toBeGreaterThan(0);
  });

  it("only explains an actionable feedback lock", () => {
    const { rerender } = renderJourney({
      items: [item({ feedbackDocument: { available: true, readable: false, lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED" } })],
    });

    expect(screen.getByText("정식 멤버가 되면 피드백 문서를 읽을 수 있습니다.")).toBeInTheDocument();
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

    expect(screen.queryByText("정식 멤버가 되면 피드백 문서를 읽을 수 있습니다.")).not.toBeInTheDocument();
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
