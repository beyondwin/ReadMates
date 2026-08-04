import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
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
});
