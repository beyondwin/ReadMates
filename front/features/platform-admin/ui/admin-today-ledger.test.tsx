import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminOperationCaseView,
  AdminOperationSourceFreshnessView,
  AdminOperationsView,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import {
  ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS,
  beginAdminEditorialLedgerRouteCommit,
  resetAdminEditorialLedgerPerformanceStateForTests,
} from "@/shared/observability/admin-editorial-ledger-performance";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import {
  ADMIN_TODAY_DESCRIPTION,
  AdminTodayLedger as ProductionAdminTodayLedger,
} from "./admin-today-ledger";

type AdminTodayLedgerProps = Omit<
  ComponentProps<typeof ProductionAdminTodayLedger>,
  "auditHref"
> & { auditHref?: string };

function AdminTodayLedger({
  auditHref = "/admin/audit",
  ...props
}: AdminTodayLedgerProps) {
  return <ProductionAdminTodayLedger auditHref={auditHref} {...props} />;
}

const LEDGER_CSS = readFileSync(path.resolve("features/platform-admin/ui/admin-today.css"), "utf8");
const SCOPED_ADMIN_CSS =
  readFileSync(path.resolve("features/platform-admin/ui/admin-page-patterns.css"), "utf8") +
  LEDGER_CSS;

const emptyView: AdminOperationsView = {
  generatedAt: "2026-08-04T10:00:00Z",
  generatedAtLabel: "19:00",
  items: [],
  selectedCase: null,
  selectedCaseId: null,
  selectionFellBack: false,
  sources: [],
  mobileSummary: {
    open: "활성 0건",
    critical: "긴급 0건",
    assignedToMe: "내 담당 0건",
    snoozed: "보류 0건",
    label: "활성 0건 · 긴급 0건 · 내 담당 0건 · 보류 0건",
  },
  allSourcesAvailable: true,
  sourceStatusLabel: "전체 신호 정상",
  workViews: [
    { id: "briefing", label: "오늘의 브리핑", count: 0 },
    { id: "mine", label: "내 담당", count: 0 },
    { id: "snoozed", label: "보류", count: 0 },
    { id: "resolved-today", label: "오늘 해결", count: null },
  ],
  nextCursor: null,
};

function operationCase(overrides: Partial<AdminOperationCaseView> = {}): AdminOperationCaseView {
  return {
    id: "case-notification",
    sourceType: "NOTIFICATION",
    clubId: null,
    state: "OPEN",
    severity: "WARNING",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-04T08:00:00Z",
    lastObservedAt: "2026-08-04T09:55:00Z",
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications?focus=delivery",
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source: {
      sourceType: "NOTIFICATION",
      status: "AVAILABLE",
      generatedAt: "2026-08-04T10:00:00Z",
      lastSuccessfulAt: "2026-08-04T10:00:00Z",
      authoritative: true,
    },
    summary: {
      title: "알림 전달 실패가 반복되고 있습니다",
      description: "같은 원인의 실패를 확인하세요.",
    },
    severityLabel: "경고",
    stateLabel: "미확인",
    sourceLabel: "알림",
    impactLabel: "영향 2건",
    ageLabel: "2시간 전",
    ...overrides,
  };
}

function populatedView(
  selectedCase: AdminOperationCaseView = operationCase(),
  overrides: Partial<AdminOperationsView> = {},
): AdminOperationsView {
  return {
    ...emptyView,
    items: [selectedCase],
    selectedCase,
    selectedCaseId: selectedCase.id,
    ...overrides,
  };
}

function sourceView(
  overrides: Partial<AdminOperationSourceFreshnessView> &
    Pick<AdminOperationSourceFreshnessView, "sourceType" | "status" | "sourceLabel" | "statusLabel" | "message">,
): AdminOperationSourceFreshnessView {
  return {
    generatedAt: "2026-08-04T10:00:00Z",
    lastSuccessfulAt: overrides.status === "AVAILABLE" ? "2026-08-04T10:00:00Z" : "2026-08-04T09:20:00Z",
    authoritative: overrides.status === "AVAILABLE",
    canRetry: overrides.status === "UNAVAILABLE",
    ...overrides,
  };
}

const disabledClosingRisk = sourceView({
  sourceType: "CLOSING_RISK",
  status: "DISABLED",
  lastSuccessfulAt: null,
  authoritative: false,
  sourceLabel: "회차 마감",
  statusLabel: "비활성",
  message: "비활성",
  canRetry: false,
});

const unavailableAiJob = sourceView({
  sourceType: "AI_JOB",
  status: "UNAVAILABLE",
  sourceLabel: "AI 작업",
  statusLabel: "확인 불가",
  message: "확인 불가 · 마지막 정상 18:20",
  canRetry: true,
});

const partialNotification = sourceView({
  sourceType: "NOTIFICATION",
  status: "PARTIAL",
  sourceLabel: "알림",
  statusLabel: "일부 확인 불가",
  message: "일부 확인 불가 · 마지막 정상 18:40",
  canRetry: false,
});

function emptyQueueView(
  sources: readonly AdminOperationSourceFreshnessView[],
): AdminOperationsView {
  const allSourcesAvailable = sources.every((source) => source.status === "AVAILABLE");
  return {
    ...emptyView,
    sources: [...sources],
    allSourcesAvailable,
    sourceStatusLabel: allSourcesAvailable ? "전체 신호 정상" : "일부 신호 확인 불가",
  };
}

function stubContentResizeObserver() {
  let callback: ResizeObserverCallback | null = null;
  const observe = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(next: ResizeObserverCallback) {
      callback = next;
    }
    observe = observe;
    disconnect = vi.fn();
  });
  return {
    observe,
    resize(width: number) {
      const target = observe.mock.calls[0]?.[0] as Element | undefined;
      if (!target || !callback) throw new Error("Today content observer was not attached");
      callback([{ target, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    },
  };
}

describe("AdminTodayLedger", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe = (target: Element) => {
        this.callback(
          [{ target, contentRect: { width: 1200 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      };
      disconnect = vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAdminEditorialLedgerPerformanceStateForTests();
  });

  it("commits first usable after the search control is laid out", () => {
    beginAdminEditorialLedgerRouteCommit();
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(performance.getEntriesByName(ADMIN_EDITORIAL_LEDGER_PERFORMANCE_METRICS.routeDataToUsable)).toHaveLength(1);
  });

  it("shows three rows and an explicit all-items action by default", async () => {
    const user = userEvent.setup();
    const onShowAll = vi.fn();
    const items = Array.from({ length: 10 }, (_, index) => operationCase({
      id: `case-${index + 1}`,
      locatorLabel: String(10 - index).padStart(2, "0"),
    }));
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView(items[0], { items, selectedCase: items[0], selectedCaseId: items[0]!.id })}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          visibleLimit={3}
          queueExpanded={false}
          onShowAll={onShowAll}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("button", { name: /현재 상태/ })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "전체 10건 보기" }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it("marks expanded disclosure and paints more than three unclipped rows", () => {
    const items = Array.from({ length: 10 }, (_, index) => operationCase({
      id: `case-${index + 1}`,
      locatorLabel: String(10 - index).padStart(2, "0"),
    }));
    const { container } = render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView(items[0], { items, selectedCase: items[0], selectedCaseId: items[0]!.id })}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          visibleLimit={3}
          queueExpanded
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(container.querySelector(".admin-today-ledger")).toHaveAttribute(
      "data-queue-disclosure",
      "all",
    );
    expect(screen.getAllByRole("button", { name: /현재 상태/ })).toHaveLength(10);
  });

  it("renders a compact command heading, filters, and an honest empty state", () => {
    const { container } = render(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyView}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "오늘 할 일" })).toHaveClass("admin-page-frame");
    expect(screen.getByRole("heading", { level: 1, name: "오늘 할 일" })).toBeVisible();
    expect(screen.getByLabelText("운영 케이스 요약")).toHaveTextContent("활성 0건 · 긴급 0건 · 내 담당 0건");
    const emptySecondary = screen.getByText("필터와 신호 상태").closest("details")!;
    expect(emptySecondary).not.toHaveAttribute("open");
    expect(within(emptySecondary).getByRole("combobox", { name: "상태 필터", hidden: true })).toBeInTheDocument();
    expect(screen.getByText("지금은 처리할 운영 케이스가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("새로운 신호가 생기면 여기에 나타납니다.")).toBeInTheDocument();
    expect(screen.queryByText("현재 조건에 맞는 운영 케이스가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 지우기" })).not.toBeInTheDocument();
    expect(container.querySelector(".admin-today-ledger__columns")).toBeNull();
    expect(screen.queryByRole("region", { name: "운영 케이스 큐" })).not.toBeInTheDocument();
  });

  it("puts the first task before collapsed secondary controls", () => {
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "오늘 할 일" })).toBeVisible();
    const queue = screen.getByRole("region", { name: "운영 케이스 큐" });
    const firstTask = within(queue).getAllByRole("button")[0];
    const secondary = within(queue).getByText("필터와 신호 상태").closest("details")!;
    expect(firstTask.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(secondary).not.toHaveAttribute("open");
    expect(within(secondary).getByRole("combobox", { name: "상태 필터", hidden: true })).not.toBeVisible();
  });

  it("keeps filter and source retry callbacks after opening secondary controls", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const onRetrySource = vi.fn();
    const selectedCase = operationCase();
    const view: AdminOperationsView = {
      ...populatedView(selectedCase),
      allSourcesAvailable: false,
      sourceStatusLabel: "일부 신호 확인 불가",
      sources: [
        {
          ...selectedCase.source,
          sourceLabel: "알림",
          statusLabel: "정상",
          message: "정상 · 19:00 기준",
          canRetry: false,
        },
        unavailableAiJob,
      ],
    };

    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={view}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={onFilterChange}
          onSelectCase={vi.fn()}
          onRetrySource={onRetrySource}
        />
      </MemoryRouter>,
    );

    const queue = screen.getByRole("region", { name: "운영 케이스 큐" });
    const secondary = within(queue).getByText("필터와 신호 상태").closest("details")!;
    await user.click(within(secondary).getByText("필터와 신호 상태"));
    await user.selectOptions(within(secondary).getByRole("combobox", { name: "상태 필터" }), "open");
    expect(onFilterChange).toHaveBeenCalledWith("state", "open");

    await user.click(within(secondary).getByRole("button", { name: "AI 작업 다시 확인" }));
    expect(onRetrySource).toHaveBeenCalledTimes(1);
    expect(onRetrySource).toHaveBeenCalledWith("AI_JOB");
  });

  it("distinguishes a filtered empty queue from a true empty queue", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    const renderEmptyFiltered = (refreshing = false) => (
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyView}
          filters={{ state: "open", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          refreshing={refreshing}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
          onClearFilters={onClearFilters}
        />
      </MemoryRouter>
    );
    const { rerender } = render(renderEmptyFiltered());

    expect(screen.getByText("조건에 맞는 운영 케이스가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("필터를 바꾸면 다른 케이스를 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("지금은 처리할 운영 케이스가 없습니다")).not.toBeInTheDocument();
    const secondary = screen.getByText("필터와 신호 상태").closest("details")!;
    expect(secondary).toHaveAttribute("open");

    await user.click(screen.getByText("필터와 신호 상태"));
    expect(secondary).not.toHaveAttribute("open");
    rerender(renderEmptyFiltered(true));
    expect(screen.getByText("필터와 신호 상태").closest("details")).not.toHaveAttribute("open");

    rerender(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyView}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
          onClearFilters={onClearFilters}
        />
      </MemoryRouter>,
    );
    rerender(renderEmptyFiltered());
    expect(screen.getByText("필터와 신호 상태").closest("details")).not.toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: "필터 지우기" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("keeps true empty when the only inactive source is DISABLED", () => {
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyQueueView([disabledClosingRisk])}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("지금은 처리할 운영 케이스가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("새로운 신호가 생기면 여기에 나타납니다.")).toBeInTheDocument();
    expect(screen.getByText("비활성")).toBeInTheDocument();
    expect(screen.queryByText("일부만 확인됨")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 지우기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps filtered empty and filter-clear when DISABLED is present", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyQueueView([disabledClosingRisk])}
          filters={{ state: "open", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
          onClearFilters={onClearFilters}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("조건에 맞는 운영 케이스가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("필터를 바꾸면 다른 케이스를 볼 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("비활성")).toBeInTheDocument();
    expect(screen.queryByText("지금은 처리할 운영 케이스가 없습니다")).not.toBeInTheDocument();
    expect(screen.queryByText("일부만 확인됨")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "필터 지우기" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("stays fail-closed partial when an empty queue has an UNAVAILABLE source", () => {
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyQueueView([unavailableAiJob, disabledClosingRisk])}
          filters={{ state: "open", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
          onClearFilters={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("일부만 확인됨")).toBeInTheDocument();
    expect(screen.getByText("확인 불가 · 마지막 정상 18:20")).toBeInTheDocument();
    expect(screen.queryByText("지금은 처리할 운영 케이스가 없습니다")).not.toBeInTheDocument();
    expect(screen.queryByText("조건에 맞는 운영 케이스가 없습니다")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 지우기" })).not.toBeInTheDocument();
  });

  it("stays fail-closed partial when an empty queue has a PARTIAL source", () => {
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyQueueView([partialNotification])}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("일부만 확인됨")).toBeInTheDocument();
    expect(screen.queryByText("지금은 처리할 운영 케이스가 없습니다")).not.toBeInTheDocument();
  });

  it("uses content width below 960px for URL-addressable flow even in a wide viewport", () => {
    const observer = stubContentResizeObserver();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    const { container } = render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    act(() => observer.resize(900));
    expect(container.querySelector(".admin-today-ledger__columns")).toBeNull();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();
  });

  it("uses a persistent split at 960px observed content width even in a 900px viewport", () => {
    const observer = stubContentResizeObserver();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    const { container } = render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    act(() => observer.resize(960));
    expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
  });

  it("pins the 38:62 pane minimums and overflow containment without viewport layout queries", () => {
    expect(SCOPED_ADMIN_CSS).toContain(".admin-today-ledger");
    expect(SCOPED_ADMIN_CSS).toMatch(/\.admin-today-ledger[\s\S]*overflow-x:\s*(clip|hidden)/);
    expect(SCOPED_ADMIN_CSS).toMatch(/grid-template-columns:\s*minmax\(340px,\s*38fr\)\s+minmax\(560px,\s*62fr\)/);
    const todayStackAt1120 = SCOPED_ADMIN_CSS.match(
      /@media \(max-width: 1120px\)\s*\{[\s\S]*?\.admin-today-ledger__columns[\s\S]*?\}/,
    );
    expect(todayStackAt1120).toBeNull();
    expect(SCOPED_ADMIN_CSS).not.toMatch(
      /@media \(max-width: 600px\)[\s\S]{0,400}\.admin-today-ledger__/,
    );
    expect(SCOPED_ADMIN_CSS).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.admin-action-dock[\s\S]*env\(safe-area-inset-bottom/,
    );
    expect(SCOPED_ADMIN_CSS).toMatch(
      /\.admin-today-ledger__filter select[\s\S]*min-height:\s*44px/,
    );
    expect(LEDGER_CSS).toMatch(/\.admin-today-ledger[\s\S]*min-height:\s*44px/);
    expect(SCOPED_ADMIN_CSS).toContain('[data-content-layout="flow"]');
    expect(LEDGER_CSS).toContain("overflow-wrap: anywhere");
    expect(LEDGER_CSS).toMatch(/admin-operations-queue__title[\s\S]*min-width:\s*12rem/);
    expect(LEDGER_CSS).toMatch(/grid-template-columns:\s*56px\s+minmax\(0,\s*1fr\)\s+44px/);
  });

  it("composes a persistent desktop ledger and docket without a receipt timeline", () => {
    const observer = stubContentResizeObserver();
    const { container } = render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          query=""
          workView="briefing"
          pendingCount={0}
          urgentCount={0}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
          onViewChange={vi.fn()}
          onQueryChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    act(() => observer.resize(1200));

    expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toHaveClass("admin-case-docket");
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(screen.getByRole("button", { name: "오늘의 브리핑 0", hidden: true })).toHaveAttribute("aria-pressed", "true");
    const queue = screen.getByRole("region", { name: "운영 케이스 큐" });
    const queueHeading = within(queue).getByRole("heading", { name: "오늘 할 일" });
    const secondary = within(queue).getByText("필터와 신호 상태").closest("details")!;
    expect(queueHeading.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("follows the mobile mode prop instead of stacking columns or inventing local detail", async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();
    const onBackToList = vi.fn();
    const observer = stubContentResizeObserver();
    const { container, rerender } = render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          mode="list"
          onFilterChange={vi.fn()}
          onSelectCase={onSelectCase}
          onBackToList={onBackToList}
        />
      </MemoryRouter>,
    );

    act(() => observer.resize(390));

    expect(container.querySelector(".admin-today-ledger__columns")).toBeNull();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /알림 전달 실패/ }));
    expect(onSelectCase).toHaveBeenCalledWith("case-notification", { mode: "detail" });
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView()}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          mode="detail"
          onFilterChange={vi.fn()}
          onSelectCase={onSelectCase}
          onBackToList={onBackToList}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목록으로" })).toHaveFocus();
    expect(screen.getByRole("heading", { level: 1, name: "알림 전달 실패가 반복되고 있습니다" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: "오늘 할 일" })).not.toBeInTheDocument();
    expect(screen.queryByText(ADMIN_TODAY_DESCRIPTION)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("운영 케이스 요약")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "목록으로" }));
    expect(onBackToList).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
  });

  it("keeps partial-source cases interactive and retries only an unavailable source once", async () => {
    const user = userEvent.setup();
    const onRetrySource = vi.fn();
    const selectedCase = {
      id: "case-notification",
      sourceType: "NOTIFICATION" as const,
      clubId: null,
      state: "OPEN" as const,
      severity: "WARNING" as const,
      summaryCode: "NOTIFICATION_DELIVERY_FAILURE" as const,
      firstObservedAt: "2026-08-04T08:00:00Z",
      lastObservedAt: "2026-08-04T09:55:00Z",
      snoozedUntil: null,
      resolvedAt: null,
      assignedToMe: true,
      reopenCount: 0,
      version: 3,
      impactCount: 2,
      detailHref: "/admin/notifications?focus=delivery",
      allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"] as const,
      source: {
        sourceType: "NOTIFICATION" as const,
        status: "PARTIAL" as const,
        generatedAt: "2026-08-04T10:00:00Z",
        lastSuccessfulAt: "2026-08-04T09:40:00Z",
        authoritative: true,
      },
      summary: {
        title: "알림 전달 실패가 반복되고 있습니다",
        description: "같은 원인의 실패를 확인하세요.",
      },
      severityLabel: "경고",
      stateLabel: "미확인",
      sourceLabel: "알림",
      impactLabel: "영향 2건",
      ageLabel: "2시간 전",
    };
    const view: AdminOperationsView = {
      ...emptyView,
      items: [selectedCase],
      selectedCase,
      selectedCaseId: selectedCase.id,
      allSourcesAvailable: false,
      sourceStatusLabel: "일부 신호 확인 불가",
      sources: [
        {
          ...selectedCase.source,
          sourceLabel: "알림",
          statusLabel: "일부 확인 불가",
          message: "일부 확인 불가 · 마지막 정상 18:40",
          canRetry: false,
        },
        {
          sourceType: "AI_JOB",
          status: "UNAVAILABLE",
          generatedAt: "2026-08-04T10:00:00Z",
          lastSuccessfulAt: "2026-08-04T09:20:00Z",
          authoritative: false,
          sourceLabel: "AI 작업",
          statusLabel: "확인 불가",
          message: "확인 불가 · 마지막 정상 18:20",
          canRetry: true,
        },
        {
          sourceType: "CLUB_READINESS",
          status: "AVAILABLE",
          generatedAt: "2026-08-04T10:00:00Z",
          lastSuccessfulAt: "2026-08-04T10:00:00Z",
          authoritative: true,
          sourceLabel: "클럽 준비",
          statusLabel: "정상",
          message: "정상 · 19:00 기준",
          canRetry: false,
        },
        {
          sourceType: "CLOSING_RISK",
          status: "DISABLED",
          generatedAt: "2026-08-04T10:00:00Z",
          lastSuccessfulAt: null,
          authoritative: false,
          sourceLabel: "모임 마감",
          statusLabel: "비활성",
          message: "비활성",
          canRetry: false,
        },
      ],
    };

    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={view}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
          onRetrySource={onRetrySource}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("일부만 확인됨")).toBeInTheDocument();
    expect(screen.getByText(/확인된 내용은 그대로 사용할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getAllByText("일부 신호 확인 불가").length).toBeGreaterThan(0);
    expect(screen.getByText("일부 확인 불가 · 마지막 정상 18:40")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 전달 실패/ })).toBeEnabled();

    await user.click(screen.getByText("필터와 신호 상태"));
    expect(screen.queryByRole("button", { name: "알림 다시 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "클럽 준비 다시 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 마감 다시 확인" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI 작업 다시 확인" }));

    expect(onRetrySource).toHaveBeenCalledTimes(1);
    expect(onRetrySource).toHaveBeenCalledWith("AI_JOB");
  });

  it("preserves the mobile detail, filter, and selection through a background refresh", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    const selectedCase = {
      id: "case-notification",
      sourceType: "NOTIFICATION" as const,
      clubId: null,
      state: "OPEN" as const,
      severity: "WARNING" as const,
      summaryCode: "NOTIFICATION_DELIVERY_FAILURE" as const,
      firstObservedAt: "2026-08-04T08:00:00Z",
      lastObservedAt: "2026-08-04T09:55:00Z",
      snoozedUntil: null,
      resolvedAt: null,
      assignedToMe: true,
      reopenCount: 0,
      version: 3,
      impactCount: 2,
      detailHref: "/admin/notifications?focus=delivery",
      allowedActions: ["ACKNOWLEDGE"] as const,
      source: {
        sourceType: "NOTIFICATION" as const,
        status: "AVAILABLE" as const,
        generatedAt: "2026-08-04T10:00:00Z",
        lastSuccessfulAt: "2026-08-04T10:00:00Z",
        authoritative: true,
      },
      summary: { title: "알림 전달 실패", description: "상세를 확인하세요." },
      severityLabel: "경고",
      stateLabel: "미확인",
      sourceLabel: "알림",
      impactLabel: "영향 2건",
      ageLabel: "2시간 전",
    };
    const initialView: AdminOperationsView = {
      ...emptyView,
      items: [selectedCase],
      selectedCase,
      selectedCaseId: selectedCase.id,
    };

    function Harness() {
      const [refreshing, setRefreshing] = useState(false);
      const [severity, setSeverity] = useState("warning");
      const refreshedCase = { ...selectedCase, impactCount: 3, impactLabel: "영향 3건" };
      return (
        <>
          <button type="button" onClick={() => setRefreshing(true)}>배경 갱신</button>
          <AdminTodayLedger
            view={refreshing ? {
              ...initialView,
              items: [refreshedCase],
              selectedCase: refreshedCase,
            } : initialView}
            filters={{ state: "", severity, source: "", assignee: "" }}
            history={[]}
            lifecycleControls={null}
            refreshing={refreshing}
            onFilterChange={(key, value) => {
              if (key === "severity") setSeverity(value);
            }}
            onSelectCase={vi.fn()}
          />
        </>
      );
    }

    render(<MemoryRouter><Harness /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /알림 전달 실패/ }));
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "배경 갱신" }));

    await user.click(screen.getByText("필터와 신호 상태"));
    expect(screen.getByRole("status")).toHaveTextContent("새 신호 확인 중");
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toHaveTextContent("영향 3건");
    expect(screen.getByRole("combobox", { name: "심각도 필터" })).toHaveValue("warning");
  });

  it("moves the selected case when the docket next control is clicked", async () => {
    const user = userEvent.setup();
    const cases = [
      operationCase({ id: "case-a", summary: { title: "첫 번째 운영 케이스", description: "하나." } }),
      operationCase({ id: "case-b", summary: { title: "두 번째 운영 케이스", description: "둘." } }),
      operationCase({ id: "case-c", summary: { title: "세 번째 운영 케이스", description: "셋." } }),
      operationCase({ id: "case-d", summary: { title: "네 번째 운영 케이스", description: "넷." } }),
    ];

    function Harness() {
      const [selectedId, setSelectedId] = useState("case-b");
      const selected = cases.find((item) => item.id === selectedId) ?? cases[1]!;
      return (
        <AdminTodayLedger
          view={populatedView(selected, { items: cases, selectedCaseId: selected.id })}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          onFilterChange={vi.fn()}
          onSelectCase={setSelectedId}
        />
      );
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    expect(screen.getByText("케이스 2 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /두 번째 운영 케이스/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "다음 ›" }));

    expect(screen.getByText("케이스 3 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /세 번째 운영 케이스/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toHaveTextContent("세 번째 운영 케이스");
  });

  it("shows the same docket traversal in the mobile fullscreen detail", () => {
    const observer = stubContentResizeObserver();
    const cases = [
      operationCase({ id: "case-a", summary: { title: "첫 번째 운영 케이스", description: "하나." } }),
      operationCase({ id: "case-b", summary: { title: "두 번째 운영 케이스", description: "둘." } }),
      operationCase({ id: "case-c", summary: { title: "세 번째 운영 케이스", description: "셋." } }),
      operationCase({ id: "case-d", summary: { title: "네 번째 운영 케이스", description: "넷." } }),
    ];
    const selected = cases[1]!;

    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={populatedView(selected, { items: cases, selectedCaseId: selected.id })}
          filters={{ state: "", severity: "", source: "", assignee: "" }}
          history={[]}
          lifecycleControls={null}
          mode="detail"
          onFilterChange={vi.fn()}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    act(() => observer.resize(390));

    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.getByText("케이스 2 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "‹ 이전" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "다음 ›" })).toBeEnabled();
    expect(screen.getByRole("navigation", { name: "케이스 순회" })).toBeInTheDocument();
  });
});
