import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostWorkboxView } from "@/features/host/model/host-workbox-model";
import { HostWorkbox } from "./host-workbox";

const page: HostWorkboxView = {
  state: "NOW",
  evaluatedAt: "2026-08-30T09:00:00Z",
  items: [
    {
      key: "SCHEDULE_UNSEEN:opaque/server:key:r7",
      type: "SCHEDULE_UNSEEN",
      state: "NOW",
      title: "일정 확인이 필요한 멤버",
      description: "변경 전 확인 1명 · 미열람 2명",
      count: 0,
      dueAt: "2026-08-29T09:00:00Z",
      deferredUntil: null,
      resolvedAt: null,
      destinationHref: "/app/host/sessions/session-1/schedule-review",
      receiptSummary: null,
      operationalLabel: "일정 미열람 확인",
      destinationCategory: "schedule-review",
      countLabel: "0",
    },
  ],
  partialWarnings: [{
    type: "NOTIFICATION_FAILURE",
    operationalLabel: "알림 실패 확인",
    failureCode: "NOTIFICATION_SOURCE_UNAVAILABLE",
    message: "알림 실패 확인 정보를 불러오지 못했어요.",
  }],
  nextCursor: "opaque-next-page",
};

function renderWorkbox(overrides: Partial<React.ComponentProps<typeof HostWorkbox>> = {}) {
  const props: React.ComponentProps<typeof HostWorkbox> = {
    state: "NOW",
    view: page,
    loading: false,
    error: null,
    pendingKey: null,
    onStateChange: vi.fn(),
    onRetry: vi.fn(),
    onLoadMore: vi.fn(),
    onDefer: vi.fn(),
    onUndoDeferral: vi.fn(),
    ...overrides,
  };
  render(<HostWorkbox {...props} />);
  return props;
}

describe("HostWorkbox", () => {
  it("renders keyboard tabs with page-visible counts, literal zero and continuation disclosure", async () => {
    const props = renderWorkbox();
    const tablist = screen.getByRole("tablist", { name: "작업함 상태" });

    expect(within(tablist).getByRole("tab", { name: "지금 1+" })).toHaveAttribute("aria-selected", "true");
    expect(within(tablist).getByRole("tab", { name: "보류" })).toBeVisible();
    expect(within(tablist).getByRole("tab", { name: "완료" })).toBeVisible();
    expect(within(tablist).queryByRole("tab", { name: "보류 0" })).not.toBeInTheDocument();
    expect(screen.getByText("수량").closest("div")).toHaveTextContent("수량0");
    expect(screen.getByText("현재 묶음 기준 · 다음 묶음 있음")).toBeVisible();

    await userEvent.click(within(tablist).getByRole("tab", { name: "보류" }));
    expect(props.onStateChange).toHaveBeenCalledWith("DEFERRED");
  });

  it("uses Home and End to move across the complete workbox tab set", async () => {
    const props = renderWorkbox();
    const user = userEvent.setup();
    const deferred = screen.getByRole("tab", { name: "보류" });
    const completed = screen.getByRole("tab", { name: "완료" });

    deferred.focus();
    await user.keyboard("{End}");
    expect(completed).toHaveFocus();
    expect(props.onStateChange).toHaveBeenLastCalledWith("COMPLETED");

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: /지금/ })).toHaveFocus();
    expect(props.onStateChange).toHaveBeenLastCalledWith("NOW");
  });

  it("keeps a partial source warning retryable without hiding successful rows", async () => {
    const props = renderWorkbox();

    expect(screen.getByRole("link", { name: "일정 확인이 필요한 멤버" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("알림 실패 확인 정보를 불러오지 못했어요");
    await userEvent.click(screen.getByRole("button", { name: "현재 묶음 다시 불러오기" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("distinguishes loading, load error and empty success", () => {
    const { rerender } = render(<HostWorkbox
      state="NOW"
      view={null}
      loading
      error={null}
      pendingKey={null}
      onStateChange={vi.fn()}
      onRetry={vi.fn()}
      onLoadMore={vi.fn()}
      onDefer={vi.fn()}
      onUndoDeferral={vi.fn()}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("작업함을 불러오는 중");
    expect(screen.getByRole("tab", { name: "지금" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "지금 0" })).not.toBeInTheDocument();

    rerender(<HostWorkbox
      state="NOW"
      view={null}
      loading={false}
      error="작업함을 불러오지 못했습니다."
      pendingKey={null}
      onStateChange={vi.fn()}
      onRetry={vi.fn()}
      onLoadMore={vi.fn()}
      onDefer={vi.fn()}
      onUndoDeferral={vi.fn()}
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("작업함을 불러오지 못했습니다");
    expect(screen.getByRole("tab", { name: "지금" })).toBeVisible();

    rerender(<HostWorkbox
      state="NOW"
      view={{ ...page, items: [], partialWarnings: [], nextCursor: null }}
      loading={false}
      error={null}
      pendingKey={null}
      onStateChange={vi.fn()}
      onRetry={vi.fn()}
      onLoadMore={vi.fn()}
      onDefer={vi.fn()}
      onUndoDeferral={vi.fn()}
    />);
    expect(screen.getByText("지금 처리할 작업이 없습니다.")).toBeVisible();
    expect(screen.getByRole("tab", { name: "지금 0" })).toBeVisible();
  });

  it("hides a stale page count during a cursor transition", () => {
    renderWorkbox({ loading: true });

    expect(screen.getByRole("tab", { name: "지금" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "지금 1+" })).not.toBeInTheDocument();
  });

  it("marks overdue work and follows only the server destination", () => {
    renderWorkbox();
    expect(screen.getByText("기한 지남")).toBeVisible();
    expect(screen.getByRole("link", { name: "일정 확인이 필요한 멤버" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-1/schedule-review",
    );
  });

  it("hides secondary workbox actions until disclosure, then defers with the authoritative key", async () => {
    const props = renderWorkbox();
    const row = screen.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ });

    expect(screen.getByRole("link", { name: "일정 확인이 필요한 멤버" })).toBeVisible();
    expect(screen.getByText("수량").closest("div")).toHaveTextContent("수량0");
    expect(within(row).getByRole("combobox", { name: /보류 기간/, hidden: true })).not.toBeVisible();
    expect(within(row).getByRole("button", { name: /보류$/, hidden: true })).not.toBeVisible();

    await userEvent.click(within(row).getByText("세부 조작"));
    await userEvent.selectOptions(within(row).getByRole("combobox", { name: /보류 기간/ }), "THREE_DAYS");
    await userEvent.click(within(row).getByRole("button", { name: /보류$/ }));
    expect(props.onDefer).toHaveBeenCalledWith("SCHEDULE_UNSEEN:opaque/server:key:r7", "THREE_DAYS");
  });

  it("passes the exact authoritative key to defer and loads the next opaque cursor", async () => {
    const props = renderWorkbox();
    const row = screen.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ });

    await userEvent.click(within(row).getByText("세부 조작"));
    await userEvent.selectOptions(within(row).getByRole("combobox", { name: "일정 확인이 필요한 멤버 보류 기간" }), "THREE_DAYS");
    await userEvent.click(within(row).getByRole("button", { name: "일정 확인이 필요한 멤버 보류" }));
    expect(props.onDefer).toHaveBeenCalledWith("SCHEDULE_UNSEEN:opaque/server:key:r7", "THREE_DAYS");

    await userEvent.click(screen.getByRole("button", { name: "다음 묶음 불러오기" }));
    expect(props.onLoadMore).toHaveBeenCalledWith("opaque-next-page");
  });

  it("undoes a deferral with the same authoritative key and keeps the row during pending/error", async () => {
    const onUndoDeferral = vi.fn();
    renderWorkbox({
      state: "DEFERRED",
      view: {
        ...page,
        state: "DEFERRED",
        nextCursor: null,
        items: [{
          ...page.items[0],
          state: "DEFERRED",
          deferredUntil: "2026-09-02T09:00:00Z",
        }],
      },
      pendingKey: "SCHEDULE_UNSEEN:opaque/server:key:r7",
      rowError: {
        key: "SCHEDULE_UNSEEN:opaque/server:key:r7",
        message: "보류를 해제하지 못했습니다.",
      },
      onUndoDeferral,
    });

    const pendingRow = screen.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ });
    expect(pendingRow).toBeVisible();
    expect(screen.getByText("보류를 해제하지 못했습니다.")).toBeVisible();
    await userEvent.click(within(pendingRow).getByText("세부 조작"));
    const button = within(pendingRow).getByRole("button", { name: "일정 확인이 필요한 멤버 보류 해제" });
    expect(button).toBeDisabled();

    renderWorkbox({
      state: "DEFERRED",
      view: {
        ...page,
        state: "DEFERRED",
        nextCursor: null,
        items: [{ ...page.items[0], state: "DEFERRED", deferredUntil: "2026-09-02T09:00:00Z" }],
      },
      onUndoDeferral,
    });
    const enabledRow = screen.getAllByRole("listitem", { name: /일정 확인이 필요한 멤버/ }).at(-1)!;
    await userEvent.click(within(enabledRow).getByText("세부 조작"));
    const enabled = within(enabledRow).getByRole("button", { name: "일정 확인이 필요한 멤버 보류 해제" });
    await userEvent.click(enabled);
    expect(onUndoDeferral).toHaveBeenCalledWith("SCHEDULE_UNSEEN:opaque/server:key:r7");
  });

  it("renders completed receipt summaries as read-only server evidence", async () => {
    renderWorkbox({
      state: "COMPLETED",
      view: {
        ...page,
        state: "COMPLETED",
        nextCursor: null,
        items: [{
          ...page.items[0],
          state: "COMPLETED",
          dueAt: null,
          resolvedAt: "2026-08-30T09:05:00Z",
          receiptSummary: { operation: "SCHEDULE_REMINDER", outcome: "PUBLISHED", affectedCount: 0 },
        }],
      },
    });

    const row = screen.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ });
    await userEvent.click(within(row).getByText("세부 조작"));
    expect(within(row).getByRole("status", { name: /일정 알림 · 완료/ })).toBeVisible();
    expect(within(row).getByText(/처리 0명/)).toBeVisible();
    expect(within(row).queryByRole("button", { name: /완료|보류/ })).not.toBeInTheDocument();
  });
});
