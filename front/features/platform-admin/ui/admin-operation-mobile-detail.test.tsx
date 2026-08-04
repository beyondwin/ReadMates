import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type {
  AdminOperationCaseView,
  AdminOperationsView,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminOperationMobileDetail } from "./admin-operation-mobile-detail";

function operationCase(overrides: Partial<AdminOperationCaseView> = {}): AdminOperationCaseView {
  return {
    id: "case-notification-opaque-identifier-that-wraps-safely",
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
      title: "긴 한글 운영 케이스 제목이 작은 화면에서도 안전하게 줄바꿈됩니다",
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

function operationsView(
  selectedCase: AdminOperationCaseView | null = operationCase(),
): AdminOperationsView {
  const items = selectedCase ? [selectedCase] : [];
  return {
    generatedAt: "2026-08-04T10:00:00Z",
    generatedAtLabel: "19:00",
    items,
    selectedCase,
    selectedCaseId: selectedCase?.id ?? null,
    selectionFellBack: false,
    sources: [],
    mobileSummary: {
      open: `활성 ${items.length}건`,
      critical: "긴급 0건",
      assignedToMe: `내 담당 ${items.length}건`,
      snoozed: "보류 0건",
      label: `활성 ${items.length}건 · 긴급 0건 · 내 담당 ${items.length}건 · 보류 0건`,
    },
    allSourcesAvailable: true,
    sourceStatusLabel: "전체 신호 정상",
    nextCursor: null,
  };
}

describe("AdminOperationMobileDetail", () => {
  it("uses an actual list to detail to back DOM flow and restores the selected row marker", async () => {
    const user = userEvent.setup();
    const selected = operationCase();
    Object.defineProperty(window, "scrollX", { configurable: true, value: 12 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 320 });

    function Harness() {
      const [view, setView] = useState(operationsView(selected));
      return (
        <AdminOperationMobileDetail
          view={view}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          onSelectCase={(caseId) => {
            const next = view.items.find((item) => item.id === caseId) ?? null;
            setView({ ...view, selectedCase: next, selectedCaseId: next?.id ?? null });
          }}
        />
      );
    }

    render(<MemoryRouter><Harness /></MemoryRouter>);

    const row = screen.getByRole("button", { name: /긴 한글 운영 케이스 제목/ });
    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();

    await user.click(row);

    expect(screen.queryByRole("region", { name: "운영 케이스 큐" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 케이스 상세" })).toBeInTheDocument();
    expect(screen.getByText(selected.id)).toHaveClass("admin-operation-wrap");
    expect(screen.getByRole("button", { name: "목록으로" })).toHaveFocus();

    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });

    await user.click(screen.getByRole("button", { name: "목록으로" }));

    expect(screen.getByRole("region", { name: "운영 케이스 큐" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "운영 케이스 상세" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /긴 한글 운영 케이스 제목/ })).toHaveAttribute(
      "data-scroll-marker",
      "selected",
    );
    expect(screen.getByRole("button", { name: /긴 한글 운영 케이스 제목/ })).toHaveFocus();
    expect(window.scrollTo).toHaveBeenCalledWith({ behavior: "auto", left: 12, top: 320 });
  });

  it("announces resolved and reopened lifecycle states in text without relying on color", async () => {
    const user = userEvent.setup();
    const selected = operationCase({
      state: "RESOLVED",
      stateLabel: "해결됨",
      reopenCount: 2,
      resolvedAt: "2026-08-04T09:58:00Z",
      allowedActions: [],
    });

    const { container } = render(
      <MemoryRouter>
        <AdminOperationMobileDetail
          view={operationsView(selected)}
          history={[]}
          lifecycleControls={null}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /긴 한글 운영 케이스 제목/ }));

    expect(screen.getByText("현재 상태 · 해결됨")).toBeInTheDocument();
    expect(screen.getByText("해결 후 재개방 2회")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목록으로" })).toHaveClass(
      "admin-operation-control--touch",
    );
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("renders an honest empty queue without a disabled fake action", () => {
    render(
      <MemoryRouter>
        <AdminOperationMobileDetail
          view={operationsView(null)}
          history={[]}
          lifecycleControls={null}
          onSelectCase={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("현재 조건에 맞는 운영 케이스가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
