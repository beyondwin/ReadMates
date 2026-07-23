import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  HostSessionAttentionSummary,
  HostSessionLedger,
} from "./host-session-ledger";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";

const items: HostSessionLedgerItem[] = [
  {
    sessionId: "session-28",
    sessionNumber: 28,
    title: "긴 한국어제목과LongEnglishTitleWithoutSpaces",
    bookTitle: "모비 딕",
    bookAuthor: "허먼 멜빌",
    bookImageUrl: null,
    date: "2026-07-23",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: true,
    liveRevision: 2,
    draftRevision: 3,
    lastModifiedAt: "2026-07-23T10:00:00+09:00",
  },
];

const filters = {
  search: "",
  state: null,
  recordStatus: null,
  needsAttention: null,
} as const;

describe("HostSessionLedger", () => {
  it("submits normalized search and exposes filter state changes", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <HostSessionLedger
        items={items}
        filters={filters}
        nextCursor={null}
        loadingMore={false}
        onFiltersChange={onFiltersChange}
        onLoadMore={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: "세션 기록 검색" }), "  모비 딕  ");
    await user.click(screen.getByRole("button", { name: "검색" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, search: "모비 딕" });

    fireEvent.change(screen.getByRole("combobox", { name: "세션 상태" }), { target: { value: "CLOSED" } });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, state: "CLOSED" });
    fireEvent.change(screen.getByRole("combobox", { name: "기록 상태" }), { target: { value: "INCOMPLETE" } });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, recordStatus: "INCOMPLETE" });
  });

  it("renders semantic desktop rows and equivalent mobile cards", () => {
    const { container } = render(
      <HostSessionLedger
        items={items}
        filters={filters}
        nextCursor={null}
        loadingMore={false}
        onFiltersChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const table = screen.getByRole("table", { name: "세션 기록 장부" });
    expect(within(table).getByRole("row", { name: /모비 딕/ })).toBeInTheDocument();
    const mobileCard = container.querySelector("article[data-session-id='session-28']");
    expect(mobileCard).toHaveTextContent("모비 딕");
    expect(mobileCard).toHaveTextContent("확인 필요");
    expect(mobileCard).toHaveTextContent("마지막 수정 2026.07.23 10:00");
    expect(mobileCard).toHaveStyle({ minWidth: "0", overflowWrap: "anywhere" });
    expect(screen.getAllByRole("link", { name: "28회차 초안 열기" })).toHaveLength(2);
    expect(screen.getAllByText("마지막 수정 2026.07.23 10:00")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "새 세션 만들기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/new",
    );
  });

  it("uses incomplete and complete record actions when no draft exists", () => {
    render(
      <HostSessionLedger
        items={[
          { ...items[0], sessionId: "incomplete", hasDraft: false, draftRevision: null },
          {
            ...items[0],
            sessionId: "complete",
            sessionNumber: 29,
            hasDraft: false,
            draftRevision: null,
            recordStatus: "COMPLETE",
            needsAttention: false,
          },
        ]}
        filters={filters}
        nextCursor={null}
        loadingMore={false}
        onFiltersChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("link", { name: "28회차 이어서 수정" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "29회차 보기·수정" })).toHaveLength(2);
  });

  it("loads the next cursor page without replacing the current rows", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <HostSessionLedger
        items={items}
        filters={filters}
        nextCursor="next-page"
        loadingMore={false}
        onFiltersChange={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getAllByText("모비 딕")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("caps dashboard attention rows at three and isolates unavailable state", () => {
    const attentionItems = [1, 2, 3, 4].map((number) => ({
      ...items[0],
      sessionId: `session-${number}`,
      sessionNumber: number,
      bookTitle: `책 ${number}`,
    }));
    const { container, rerender } = render(<HostSessionAttentionSummary page={{
      items: attentionItems,
      nextCursor: "more",
      summary: {
        needsAttentionCount: 7,
        incompletePublishedCount: 4,
        draftCount: 2,
      },
    }} />);

    expect(screen.getAllByRole("link", { name: /기록 열기/ })).toHaveLength(3);
    expect(screen.queryByText("책 4")).not.toBeInTheDocument();
    expect(screen.getByText("수정 필요 회차").parentElement).toHaveTextContent("7");
    expect(screen.getByText("공개 기록 미완성").parentElement).toHaveTextContent("4");
    expect(screen.getByText("저장된 초안").parentElement).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "세션 기록 전체 보기" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
    expect(container.querySelector("dl")).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))",
      minWidth: "0",
    });

    rerender(<HostSessionAttentionSummary page={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("기록 확인 항목을 불러오지 못했습니다");
    expect(screen.getByRole("link", { name: "세션 기록 전체 보기" })).toBeInTheDocument();
  });
});
