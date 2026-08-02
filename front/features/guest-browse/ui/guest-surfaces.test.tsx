import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuestArchive } from "./guest-surfaces";

describe("guest browse surfaces", () => {
  it("renders public archive one-liners with full author and avatar semantics", async () => {
    const { GuestArchiveDetail } = await import("./guest-surfaces");
    render(
      <GuestArchiveDetail
        data={{
          sessionId: "closed-1", sessionNumber: 1, title: "지난 모임", bookTitle: "기록 책", bookAuthor: "작가", bookImageUrl: null,
          date: "2026-07-01", attendance: 4, total: 5, state: "CLOSED", summary: null, highlights: [], questions: [],
          oneLiners: [{ text: "한 줄 감상", authorName: "전체 이름", authorShortName: "전체", avatarKey: "book" }], longReviews: [],
          capabilities: { canWrite: false },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "한줄평" })).toBeVisible();
    expect(screen.getByText("한 줄 감상")).toBeVisible();
    expect(screen.getByText("전체 이름")).toBeVisible();
    expect(screen.getByTitle("전체 이름")).toBeVisible();
    expect(screen.getByRole("link", { name: "피드백 보기, 정식 멤버 전용" })).toHaveAttribute(
      "href",
      "/app/feedback/closed-1",
    );
  });

  it("disables archive pagination during rapid clicks", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn(() => new Promise<void>(() => {}));
    render(<GuestArchive data={{ items: [{ sessionId: "s1", sessionNumber: 1, title: "기록", bookTitle: "책", bookAuthor: "작가", bookImageUrl: null, date: "2026-08-02", attendance: 1, total: 2, state: "CLOSED" }], nextCursor: "next" }} onLoadMore={onLoadMore} />);
    await user.dblClick(screen.getByRole("button", { name: "더 보기" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

});
