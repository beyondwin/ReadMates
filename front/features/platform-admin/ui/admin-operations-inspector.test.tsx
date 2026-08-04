import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";
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
  stateLabel: "미확인",
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
    expect(screen.getByRole("link", { name: "알림 운영에서 확인" })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=delivery",
    );
    expect(screen.getByText("신호가 처음 감지됨")).toBeInTheDocument();
    expect(screen.getByText("상태 변경 기록")).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE_HISTORY_CODE")).not.toBeInTheDocument();
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
});
