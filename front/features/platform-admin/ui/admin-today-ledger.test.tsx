import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminOperationsView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminTodayLedger } from "./admin-today-ledger";

const emptyView: AdminOperationsView = {
  generatedAt: "2026-08-04T10:00:00Z",
  generatedAtLabel: "19:00",
  items: [],
  selectedCase: null,
  selectedCaseId: null,
  selectionFellBack: false,
  sources: [],
  mobileSummary: {
    open: "열림 0건",
    critical: "긴급 0건",
    assignedToMe: "내 담당 0건",
    snoozed: "보류 0건",
    label: "열림 0건 · 긴급 0건 · 내 담당 0건 · 보류 0건",
  },
  allSourcesAvailable: true,
  sourceStatusLabel: "전체 신호 정상",
  nextCursor: null,
};

describe("AdminTodayLedger", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

    expect(screen.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeInTheDocument();
    expect(screen.getByLabelText("운영 케이스 요약")).toHaveTextContent("열림 0건 · 긴급 0건 · 내 담당 0건");
    expect(screen.getByRole("combobox", { name: "상태 필터" })).toBeInTheDocument();
    expect(screen.getByText("현재 조건에 맞는 운영 케이스가 없습니다.")).toBeInTheDocument();
    expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
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
          sourceLabel: "회차 마감",
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

    expect(screen.getByRole("status")).toHaveTextContent("일부 신호 확인 불가");
    expect(screen.getByText("일부 확인 불가 · 마지막 정상 18:40")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 전달 실패/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "알림 다시 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "클럽 준비 다시 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "회차 마감 다시 확인" })).not.toBeInTheDocument();

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
});
