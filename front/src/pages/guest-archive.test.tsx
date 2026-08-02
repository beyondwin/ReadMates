import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GuestArchiveContent } from "./guest-archive";

const guestArchivePage = {
  items: [{
    sessionId: "session-1",
    sessionNumber: 1,
    title: "첫 기록",
    bookTitle: "파도",
    bookAuthor: "작가",
    bookImageUrl: null,
    date: "2026-08-02",
    attendance: 4,
    total: 5,
    state: "CLOSED",
  }],
  nextCursor: "next-page",
};

describe("GuestArchiveContent", () => {
  it.each([
    ["desktop", ".desktop-only"],
    ["mobile", ".mobile-only"],
  ])("recovers the %s archive after a rejected load-more request", async (_variant, selector) => {
    const onLoadMoreSessions = vi.fn()
      .mockRejectedValueOnce(new Error("temporary guest archive failure"))
      .mockResolvedValueOnce(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <MemoryRouter initialEntries={["/clubs/alpha/app/archive"]}>
        <QueryClientProvider client={client}>
          <GuestArchiveContent
            data={guestArchivePage}
            routePathname="/clubs/alpha/app/archive"
            routeSearch=""
            feedbackLockedAction={<a href="/login">멤버로 시작</a>}
            onLoadMoreSessions={onLoadMoreSessions}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const scope = within(container.querySelector(selector) as HTMLElement);

    fireEvent.click(scope.getByRole("button", { name: "더 보기" }));

    expect(await scope.findByText("기록을 더 불러오지 못했습니다. 다시 시도해 주세요.")).toBeVisible();
    fireEvent.click(scope.getByRole("button", { name: "다시 시도" }));
    expect(await scope.findByRole("button", { name: "더 보기" })).toBeVisible();
    expect(scope.queryByText("기록을 더 불러오지 못했습니다. 다시 시도해 주세요.")).not.toBeInTheDocument();
    expect(onLoadMoreSessions).toHaveBeenCalledTimes(2);
  });
});
