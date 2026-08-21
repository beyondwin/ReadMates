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
  view: "active",
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
    expect(screen.getByRole("link", { name: "휴지통" })).toHaveAttribute("href", "?view=trash");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("hides active filters in trash view and restores a row inline", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(
      <HostSessionLedger
        items={[]}
        trashItems={[
          {
            sessionId: "trashed-7",
            sessionNumber: 7,
            title: "휴지통 책",
            state: "DRAFT",
            deletedAtLabel: "삭제 2026.08.21 19:00",
            remainingCopy: "남은 복원 기간 6일",
          },
        ]}
        filters={{ ...filters, view: "trash" }}
        nextCursor="trash-next"
        loadingMore={false}
        onFiltersChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRestore={onRestore}
        trashHref="?view=trash"
        activeHref="/app/host/sessions"
      />,
    );

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "세션 상태" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "새 세션 만들기" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세션 기록 장부" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("휴지통 책")).toBeVisible();
    expect(screen.getByText("삭제 2026.08.21 19:00")).toBeVisible();
    expect(screen.getByText("남은 복원 기간 6일")).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "7회차 복원" })[0]!);
    expect(onRestore).toHaveBeenCalledWith("trashed-7");
    expect(screen.getByRole("button", { name: "더 보기" })).toBeVisible();
  });

  it("disables expired trash restore and keeps 다시 시도 on other errors", async () => {
    const user = userEvent.setup();
    const onRetryRestore = vi.fn();
    const { rerender } = render(
      <HostSessionLedger
        items={[]}
        trashItems={[
          {
            sessionId: "expired-7",
            sessionNumber: 7,
            title: "만료된 책",
            state: "OPEN",
            deletedAtLabel: "삭제 2026.08.14 19:00",
            remainingCopy: "오늘까지 복원할 수 있습니다.",
            restoreDisabled: true,
            restoreDisabledReason: "복원 기간이 지났습니다.",
          },
        ]}
        filters={{ ...filters, view: "trash" }}
        nextCursor={null}
        loadingMore={false}
        onFiltersChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "7회차 복원" })[0]).toBeDisabled();
    expect(screen.getByText("복원 기간이 지났습니다.")).toBeVisible();

    rerender(
      <HostSessionLedger
        items={[]}
        trashItems={[
          {
            sessionId: "expired-7",
            sessionNumber: 7,
            title: "만료된 책",
            state: "OPEN",
            deletedAtLabel: "삭제 2026.08.14 19:00",
            remainingCopy: "남은 복원 기간 2일",
            restoreError: "모임을 복원하지 못했습니다.",
            restoreConflict: {
              openSessionHref: "/app/host/sessions/open-session",
              message: "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
            },
          },
        ]}
        filters={{ ...filters, view: "trash" }}
        nextCursor={null}
        loadingMore={false}
        onFiltersChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRestore={vi.fn()}
        onRetryRestore={onRetryRestore}
      />,
    );

    expect(screen.getByText("만료된 책")).toBeVisible();
    expect(screen.getByRole("link", { name: "진행 중인 모임 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/open-session",
    );
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetryRestore).toHaveBeenCalledWith("expired-7");
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

  it("renders dashboard attention records as one compact ledger without duplicate metrics or actions", () => {
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

    const ledger = screen.getByRole("list", { name: "확인 필요한 세션 기록" });
    const rows = within(ledger).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole("link", { name: "1회차 기록 열기" })).toHaveClass(
      "rm-host-attention__row",
    );
    expect(within(rows[0]).getByText("No.1")).toHaveClass("ledger-number");
    expect(within(rows[0]).getByText("확인 필요")).not.toHaveClass("ledger-number");
    for (const value of container.querySelectorAll(".ledger-number")) {
      expect(value.textContent).toMatch(/(?:No\.\d+|\d)/);
    }
    expect(rows[0]).toHaveTextContent("책 1");
    expect(rows[0]).toHaveTextContent("확인 필요");
    expect(rows[0]).toHaveTextContent("기록 열기");
    expect(screen.queryByText("책 4")).not.toBeInTheDocument();
    expect(container.querySelector("dl")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "세션 기록 전체 보기" })).not.toBeInTheDocument();

    rerender(
      <HostSessionAttentionSummary
        page={{
          items: [],
          summary: {
            needsAttentionCount: 0,
            incompletePublishedCount: 0,
            draftCount: 0,
          },
        }}
      />,
    );
    expect(screen.getByText("확인 필요한 세션 기록이 없습니다.")).toHaveClass(
      "rm-host-attention__empty",
    );
  });
});
