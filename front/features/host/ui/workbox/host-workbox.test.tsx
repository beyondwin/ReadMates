import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostWorkboxDisclosure, HostWorkboxItemView, HostWorkboxView } from "@/features/host/model/host-workbox-model";
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
    expect(screen.getByText("0")).toBeVisible();
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

  it("keeps workbox rows as destination links without detail-ops or defer controls", () => {
    renderWorkbox();
    const row = screen.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ });

    expect(screen.getByRole("link", { name: "일정 확인이 필요한 멤버" })).toBeVisible();
    expect(row.querySelector('.rm-icon-badge[data-tone="warn"] [data-icon="alert-circle"]')).toBeTruthy();
    expect(row.querySelector('[data-icon="chevron-right"]')).toBeTruthy();
    expect(row.textContent).not.toContain("세부 조작");
    expect(within(row).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /보류/ })).not.toBeInTheDocument();
  });

  it("loads the next opaque cursor", async () => {
    const props = renderWorkbox();
    await userEvent.click(screen.getByRole("button", { name: "다음 묶음 불러오기" }));
    expect(props.onLoadMore).toHaveBeenCalledWith("opaque-next-page");
  });

  it("keeps a row visible while showing a row-level error", () => {
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
    });

    expect(screen.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ })).toBeVisible();
    expect(screen.getByText("보류를 해제하지 못했습니다.")).toBeVisible();
    expect(screen.queryByText("세부 조작")).not.toBeInTheDocument();
  });

  it("renders a footer note with history chevron", () => {
    renderWorkbox({
      footerNote: { text: "어제 19:30 자동 리마인드 전달됨", historyHref: "/app/host/sessions/session-1?section=history" },
    });

    const footer = document.querySelector(".rm-host-workbox__footer");
    expect(footer?.querySelector('[data-icon="clock"]')).toBeTruthy();
    expect(screen.getByText("어제 19:30 자동 리마인드 전달됨")).toBeVisible();
    const history = screen.getByRole("link", { name: "변경 이력" });
    expect(history).toHaveAttribute("href", "/app/host/sessions/session-1?section=history");
    expect(history.querySelector('[data-icon="chevron-right"]')).toBeTruthy();
  });

  it("renders only disclosure.visibleItems and exposes 작업함 모두 보기 until expanded", async () => {
    const items = Array.from({ length: 12 }, (_, index): HostWorkboxItemView => ({
      ...page.items[0],
      key: `SCHEDULE_UNSEEN:resource-${index}:g1`,
      title: `작업 ${index + 1}`,
      count: index + 1,
      countLabel: String(index + 1),
      destinationHref: `/app/host/destination/${index}`,
    }));
    const view: HostWorkboxView = { ...page, items, partialWarnings: [], nextCursor: "opaque-next-page" };
    const disclosure: HostWorkboxDisclosure = {
      visibleItems: items.slice(0, 4),
      hiddenCount: 8,
      hasMore: true,
      expanded: false,
    };
    const onShowAll = vi.fn();
    renderWorkbox({ view, disclosure, onShowAll, showPartialWarnings: false });

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "작업 1" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "작업 5" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "작업함 모두 보기" }));
    expect(onShowAll).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "다음 묶음 불러오기" })).toBeVisible();
  });

  it("keeps 작업함 모두 보기 off when every loaded item is visible and only nextCursor remains", () => {
    const items = Array.from({ length: 4 }, (_, index): HostWorkboxItemView => ({
      ...page.items[0],
      key: `SCHEDULE_UNSEEN:resource-${index}:g1`,
      title: `작업 ${index + 1}`,
      count: index + 1,
      countLabel: String(index + 1),
    }));
    renderWorkbox({
      view: { ...page, items, partialWarnings: [], nextCursor: "opaque-next-page" },
      disclosure: {
        visibleItems: items,
        hiddenCount: 0,
        hasMore: true,
        expanded: false,
      },
      onShowAll: vi.fn(),
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "작업함 모두 보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 묶음 불러오기" })).toBeVisible();
  });

  it("exposes every loaded item in source order when disclosure is expanded", async () => {
    const items = Array.from({ length: 12 }, (_, index): HostWorkboxItemView => ({
      ...page.items[0],
      key: `SCHEDULE_UNSEEN:resource-${index}:g1`,
      title: `작업 ${index + 1}`,
      count: index + 1,
      countLabel: String(index + 1),
      destinationHref: `/app/host/destination/${index}`,
    }));
    const view: HostWorkboxView = { ...page, items, partialWarnings: [], nextCursor: "opaque-next-page" };
    const props = renderWorkbox({
      view,
      disclosure: {
        visibleItems: items,
        hiddenCount: 0,
        hasMore: true,
        expanded: true,
      },
    });

    expect(screen.getAllByRole("listitem").map((item) => item.getAttribute("aria-label")))
      .toEqual(items.map((item) => item.title));
    expect(screen.queryByRole("button", { name: "작업함 모두 보기" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다음 묶음 불러오기" }));
    expect(props.onLoadMore).toHaveBeenCalledWith("opaque-next-page");
  });

  it("keeps completed rows destination-only without in-row receipt disclosure", () => {
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
    expect(row.textContent).not.toContain("세부 조작");
    expect(within(row).queryByRole("status", { name: /일정 알림 · 완료/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /완료|보류/ })).not.toBeInTheDocument();
  });
});
