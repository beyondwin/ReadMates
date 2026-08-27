import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SHELL_LAYOUT_MEDIA_QUERY } from "@/features/platform-admin/model/admin-route-catalog";
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
import { AdminTodayLedger } from "./admin-today-ledger";

const GLOBALS_CSS = readFileSync("src/styles/globals.css", "utf8");
const LEDGER_CSS = readFileSync(path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"), "utf8");

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

function stubMatchMedia(matches: boolean | ((query: string) => boolean)) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: typeof matches === "function" ? matches(query) : matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

describe("AdminTodayLedger", () => {
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

    expect(screen.getByRole("region", { name: "오늘의 운영 케이스" })).toHaveClass("admin-page-frame");
    expect(screen.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeInTheDocument();
    expect(screen.getByLabelText("운영 케이스 요약")).toHaveTextContent("활성 0건 · 긴급 0건 · 내 담당 0건");
    expect(screen.getByRole("combobox", { name: "상태 필터" })).toBeInTheDocument();
    expect(screen.getByText("지금은 처리할 운영 케이스가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("새로운 신호가 생기면 여기에 나타납니다.")).toBeInTheDocument();
    expect(screen.queryByText("현재 조건에 맞는 운영 케이스가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 지우기" })).not.toBeInTheDocument();
    expect(container.querySelector(".admin-today-ledger__columns")).toBeNull();
    expect(screen.queryByRole("region", { name: "운영 케이스 큐" })).not.toBeInTheDocument();
  });

  it("distinguishes a filtered empty queue from a true empty queue", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(
      <MemoryRouter>
        <AdminTodayLedger
          view={emptyView}
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
    expect(screen.queryByText("지금은 처리할 운영 케이스가 없습니다")).not.toBeInTheDocument();
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

  it("uses the shared 768px contract for mobile drill-in instead of stacked columns", () => {
    const matchMedia = stubMatchMedia((query) => query.includes("768px"));
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

    expect(ADMIN_SHELL_LAYOUT_MEDIA_QUERY).toBe("(max-width: 768px)");
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
    expect(matchMedia).not.toHaveBeenCalledWith("(max-width: 600px)");
    expect(container.querySelector(".admin-today-ledger__columns")).toBeNull();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();
  });

  it("keeps desktop two-pane composition above 768px", () => {
    stubMatchMedia(false);
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

    expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
  });

  it("pins Today CSS to the 768px contract without stacking columns at tablet width", () => {
    expect(GLOBALS_CSS).toContain(".admin-today-ledger");
    expect(GLOBALS_CSS).toMatch(/\.admin-today-ledger[\s\S]*overflow-x:\s*(clip|hidden)/);
    expect(GLOBALS_CSS).toMatch(
      /\.admin-today-ledger__columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*[^)]+\)\s+minmax\(0,\s*[^)]+\)/,
    );
    const todayStackAt1120 = GLOBALS_CSS.match(
      /@media \(max-width: 1120px\)\s*\{[\s\S]*?\.admin-today-ledger__columns[\s\S]*?\}/,
    );
    expect(todayStackAt1120).toBeNull();
    expect(GLOBALS_CSS).not.toMatch(
      /@media \(max-width: 600px\)[\s\S]{0,400}\.admin-today-ledger__/,
    );
    expect(GLOBALS_CSS).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.admin-action-dock[\s\S]*env\(safe-area-inset-bottom/,
    );
    expect(GLOBALS_CSS).toMatch(
      /\.admin-today-ledger__filter select[\s\S]*min-height:\s*44px/,
    );
    expect(LEDGER_CSS).toMatch(/\.admin-today-ledger[\s\S]*min-height:\s*44px/);
    expect(LEDGER_CSS).not.toMatch(
      /@media \(max-width: 768px\)[\s\S]{0,400}\.admin-today-ledger__columns[\s\S]{0,200}grid-template-columns:\s*1fr/,
    );
    expect(LEDGER_CSS).toContain("overflow-wrap: anywhere");
  });

  it("composes a persistent desktop ledger and docket without a receipt timeline", () => {
    stubMatchMedia(false);
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

    expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toHaveClass("admin-case-docket");
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(screen.getByRole("button", { name: "오늘의 브리핑 0" })).toHaveAttribute("aria-pressed", "true");
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("follows the mobile mode prop instead of stacking columns or inventing local detail", async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();
    const onBackToList = vi.fn();
    stubMatchMedia(true);
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

    expect(screen.getByRole("status")).toHaveTextContent("새 신호 확인 중");
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toHaveTextContent("영향 3건");
    expect(screen.getByRole("combobox", { name: "심각도 필터" })).toHaveValue("warning");
  });

  it("moves the selected case when the docket next control is clicked", async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
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
    stubMatchMedia(true);
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

    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.getByText("케이스 2 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "‹ 이전" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "다음 ›" })).toBeEnabled();
    expect(screen.getByRole("navigation", { name: "케이스 순회" })).toBeInTheDocument();
  });
});
