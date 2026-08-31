import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";
import { AdminOperationStateActions } from "./admin-operation-state-actions";
import { AdminOperationsInspector } from "./admin-operations-inspector";

const selectedCase: AdminOperationCaseView = {
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
  assignedToMe: false,
  reopenCount: 0,
  version: 3,
  impactCount: 2,
  detailHref: "/admin/notifications?focus=delivery",
  allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
  source: {
    sourceType: "NOTIFICATION",
    status: "PARTIAL",
    generatedAt: "2026-08-04T10:00:00Z",
    lastSuccessfulAt: "2026-08-04T09:40:00Z",
    authoritative: true,
  },
  summary: {
    title: "알림 전달 실패가 반복되고 있습니다",
    description: "같은 원인의 실패를 확인하세요.",
  },
  severityLabel: "경고",
  stateLabel: "확인 전",
  sourceLabel: "알림",
  impactLabel: "영향 2건",
  ageLabel: "2시간 전",
};

describe("AdminOperationsInspector", () => {
  it("shows safe impact, freshness, canonical detail route, and mapped history", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[
            {
              fromState: null,
              toState: "OPEN",
              action: null,
              reasonCode: "SIGNAL_OPENED",
              occurredAt: "2026-08-04T08:00:00Z",
              caseVersion: 1,
            },
            {
              fromState: "OPEN",
              toState: "ACKNOWLEDGED",
              action: "ACKNOWLEDGE",
              reasonCode: "PRIVATE_HISTORY_CODE" as never,
              occurredAt: "2026-08-04T08:30:00Z",
              caseVersion: 2,
            },
          ]}
          lifecycleControls={<button type="button">확인 처리</button>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("영향 2건")).toBeInTheDocument();
    expect(screen.getByText(/일부 확인 불가/)).toBeInTheDocument();
    expect(screen.getByText("관측 출처")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "배달 원장에서 확인" })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=delivery",
    );
    expect(screen.getByRole("heading", { name: "이 대상의 최근 처리 기록" })).toBeInTheDocument();
    expect(screen.getByText("신호가 처음 감지됨 · 확인 전")).toBeInTheDocument();
    expect(screen.getByText("상태 변경 기록 · 확인함")).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE_HISTORY_CODE")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 처리 기록 보기" })).toHaveAttribute(
      "href",
      "/admin/audit?target=case-notification",
    );
    expect(screen.getByRole("group", { name: "작업" })).toHaveClass("admin-action-dock");
    expect(screen.getByRole("button", { name: "확인 처리" })).toBeInTheDocument();

    const commands = screen.getByRole("group", { name: "작업" });
    const ledgerHeading = screen.getByRole("heading", { name: "이 대상의 최근 처리 기록" });
    expect(commands.closest(".admin-case-docket__actions")?.contains(ledgerHeading)).toBe(false);
    expect(
      Boolean(commands.compareDocumentPosition(ledgerHeading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it("renders the case docket with a wrapping safe id, L1 dock, and no receipt timeline", () => {
    const { container } = render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={{
            ...selectedCase,
            id: "case-notification-opaque-identifier-that-wraps-safely",
          }}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          actionState="ready"
        />
      </MemoryRouter>,
    );

    const docket = screen.getByRole("region", { name: "운영 케이스 상세" });
    expect(docket).toHaveClass("admin-case-docket");
    expect(screen.getAllByText("case-notification-opaque-identifier-that-wraps-safely").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("case-notification-opaque-identifier-that-wraps-safely").every(
        (node) => node.classList.contains("admin-operation-wrap"),
      ),
    ).toBe(true);
    expect(screen.getByRole("group", { name: "작업" }).closest("[data-level]")).toHaveAttribute(
      "data-level",
      "L1",
    );
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("locks the L1 dock for stale and unknown-outcome without nested live regions", () => {
    const { rerender, container } = render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          actionState="stale"
          actionReason="최신 상태가 아닙니다."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "stale",
    );
    expect(screen.getByRole("button", { name: "확인 처리" })).toBeDisabled();

    rerender(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={<button type="button">확인 처리</button>}
          actionState="unknown-outcome"
          actionReason="명령 응답을 확인하지 못했습니다."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "unknown-outcome",
    );
    expect(screen.queryByText("상태를 반영하고 있습니다.")).not.toBeInTheDocument();
    expect(findNestedLiveRegions(container)).toEqual([]);
  });

  it("shows the permission boundary without lifecycle controls for support", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector selectedCase={selectedCase} history={[]} lifecycleControls={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확인 처리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "해결 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "작업" })).not.toBeInTheDocument();
  });

  it("does not present a failed source attempt as successful freshness evidence", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={{
            ...selectedCase,
            source: {
              ...selectedCase.source,
              status: "UNAVAILABLE",
              lastSuccessfulAt: null,
            },
          }}
          history={[]}
          lifecycleControls={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("확인 불가 · 정상 확인 기록 없음")).toBeInTheDocument();
    expect(screen.queryByText(/2026.*기준/)).not.toBeInTheDocument();
  });

  it("shows a mono docket counter as 케이스 2 / 4 with quiet previous and next controls", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={null}
          traversal={{ index: 1, total: 4, onPrev: vi.fn(), onNext: vi.fn() }}
        />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "케이스 순회" });
    expect(nav).toHaveClass("docket-nav");
    expect(nav).toHaveTextContent("케이스 2 / 4");
    expect(nav.querySelector(".count")).toHaveTextContent("케이스 2 / 4");
    expect(screen.getByRole("button", { name: "‹ 이전" })).toHaveClass("btn-quiet");
    expect(screen.getByRole("button", { name: "다음 ›" })).toHaveClass("btn-quiet");
    expect(screen.getByRole("button", { name: "‹ 이전" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "다음 ›" })).toBeEnabled();
  });

  it("disables the end-of-list direction when that callback is null", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={null}
          traversal={{ index: 3, total: 4, onPrev: vi.fn(), onNext: null }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("케이스 4 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "‹ 이전" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "다음 ›" })).toBeDisabled();
  });

  it("calls onNext only from the docket next control, not from a complete resolved state", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={<button type="button">해결 확인</button>}
          actionState="pending"
          traversal={{ index: 1, total: 4, onPrev: vi.fn(), onNext }}
        />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={{ ...selectedCase, state: "RESOLVED", stateLabel: "해결됨" }}
          history={[]}
          lifecycleControls={<button type="button">해결 확인</button>}
          actionState="complete"
          traversal={{ index: 1, total: 4, onPrev: vi.fn(), onNext }}
        />
      </MemoryRouter>,
    );

    expect(onNext).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "다음 ›" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("cannot confirm 무시 without a one-line reason", async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn();
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={
            <AdminOperationStateActions
              allowedActions={["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]}
              pending={false}
              message={null}
              now={() => new Date("2026-08-04T10:00:00.000Z")}
              onAcknowledge={vi.fn()}
              onSnooze={onSnooze}
              onResolve={vi.fn()}
            />
          }
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "무시" }));
    const confirm = screen.getByRole("button", { name: "무시 확정" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onSnooze).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("무시 사유"), "   ");
    expect(confirm).toBeDisabled();
  });

  it("exposes a duration select instead of stacked individual snooze buttons", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={
            <AdminOperationStateActions
              allowedActions={["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]}
              pending={false}
              message={null}
              now={() => new Date("2026-08-04T10:00:00.000Z")}
              onAcknowledge={vi.fn()}
              onSnooze={vi.fn()}
              onResolve={vi.fn()}
            />
          }
        />
      </MemoryRouter>,
    );

    const duration = screen.getByRole("combobox", { name: "보류 기간" });
    expect(duration).toBeInTheDocument();
    expect(Array.from(duration.querySelectorAll("option")).map((option) => option.textContent)).toEqual([
      "1시간",
      "4시간",
      "24시간",
      "7일",
    ]);
    expect(screen.getByRole("button", { name: "보류" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1시간 보류" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "4시간 보류" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "24시간 보류" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "7일 보류" })).not.toBeInTheDocument();
  });

  it("includes the ignore reason in the snooze command args", async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn();
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={
            <AdminOperationStateActions
              allowedActions={["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]}
              pending={false}
              message={null}
              now={() => new Date("2026-08-04T10:00:00.000Z")}
              onAcknowledge={vi.fn()}
              onSnooze={onSnooze}
              onResolve={vi.fn()}
            />
          }
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "무시" }));
    await user.type(screen.getByLabelText("무시 사유"), "중복 신호로 판단");
    await user.click(screen.getByRole("button", { name: "무시 확정" }));

    expect(onSnooze).toHaveBeenCalledOnce();
    expect(onSnooze).toHaveBeenCalledWith("2026-08-11T10:00:00.000Z", "중복 신호로 판단");
  });

  it("renders at most three recent case-history sentences and the audit prefilter href", () => {
    const { container } = render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={{ ...selectedCase, clubId: "club-reading-sai" }}
          history={[
            {
              fromState: null,
              toState: "OPEN",
              action: null,
              reasonCode: "SIGNAL_OPENED",
              occurredAt: "2026-08-04T08:00:00Z",
              caseVersion: 1,
            },
            {
              fromState: "OPEN",
              toState: "ACKNOWLEDGED",
              action: "ACKNOWLEDGE",
              reasonCode: "OPERATOR_ACKNOWLEDGED",
              occurredAt: "2026-08-04T08:10:00Z",
              caseVersion: 2,
            },
            {
              fromState: "ACKNOWLEDGED",
              toState: "SNOOZED",
              action: "SNOOZE",
              reasonCode: "OPERATOR_SNOOZED",
              occurredAt: "2026-08-04T08:20:00Z",
              caseVersion: 3,
            },
            {
              fromState: "SNOOZED",
              toState: "OPEN",
              action: null,
              reasonCode: "SIGNAL_REOPENED",
              occurredAt: "2026-08-04T08:30:00Z",
              caseVersion: 4,
            },
          ]}
          lifecycleControls={null}
        />
      </MemoryRouter>,
    );

    const rows = [...container.querySelectorAll(".ledger-inline .li")];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector("time")?.textContent)).toEqual([
      "8.4 17:30",
      "8.4 17:20",
      "8.4 17:10",
    ]);
    expect(rows.map((row) => row.querySelector("span")?.textContent)).toEqual([
      "신호 재감지로 다시 열림 · 확인 전",
      "운영자가 보류함 · 잠시 미룸",
      "운영자가 확인함 · 확인함",
    ]);
    expect(screen.queryByText("신호가 처음 감지됨 · 미확인")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 처리 기록 보기" })).toHaveAttribute(
      "href",
      "/admin/audit?target=club-reading-sai",
    );
  });

  it("omits invented ledger rows when case detail history is empty", () => {
    render(
      <MemoryRouter>
        <AdminOperationsInspector
          selectedCase={selectedCase}
          history={[]}
          lifecycleControls={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "이 대상의 최근 처리 기록" })).toBeInTheDocument();
    expect(screen.getByText("표시할 처리 기록이 없습니다.")).toBeInTheDocument();
    expect(document.querySelectorAll(".ledger-inline .li")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "전체 처리 기록 보기" })).toHaveAttribute(
      "href",
      "/admin/audit?target=case-notification",
    );
  });
});
