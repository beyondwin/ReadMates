import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminOperationsQueue } from "./admin-operations-queue";

function queueItem(overrides: Partial<AdminOperationCaseView> = {}): AdminOperationCaseView {
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
    assignedToMe: false,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications",
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

describe("AdminOperationsQueue", () => {
  it("shows the decision fields and exposes the selected row state", async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();
    render(
      <AdminOperationsQueue
        items={[queueItem()]}
        selectedCaseId="case-notification"
        onSelectCase={onSelectCase}
      />,
    );

    const row = screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).not.toHaveAttribute("aria-selected");
    expect(row).not.toHaveAttribute("aria-current");
    expect(row).toHaveTextContent("알림");
    expect(row).toHaveTextContent("영향 2건");
    expect(row).toHaveTextContent("2시간 전");
    expect(row).toHaveTextContent("경고");

    await user.click(row);
    expect(onSelectCase).toHaveBeenCalledWith("case-notification");
    expect(row).toHaveAttribute("aria-pressed", "true");
  });

  it("places compact secondary controls after the queue title and count", () => {
    const { container } = render(
      <AdminOperationsQueue
        items={[queueItem()]}
        selectedCaseId="case-notification"
        controls={<div data-testid="queue-controls">필터</div>}
        onSelectCase={vi.fn()}
      />,
    );

    const header = container.querySelector(".admin-operations-queue__header");
    const controls = screen.getByTestId("queue-controls");
    const list = container.querySelector(".admin-operations-queue__list");
    expect(header?.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps locators stable and wraps a long safe identifier", () => {
    render(
      <AdminOperationsQueue
        items={[
          queueItem({
            id: "case-notification-opaque-identifier-that-wraps-safely",
            locatorLabel: "02",
            scopeLabel: "읽는사이",
          }),
        ]}
        selectedCaseId="case-notification-opaque-identifier-that-wraps-safely"
        onSelectCase={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ });
    expect(row).toHaveTextContent("02");
    expect(row).toHaveTextContent("읽는사이");
    expect(row).toHaveClass("admin-operation-control--touch");
    expect(row.querySelector(".admin-operation-wrap")).not.toBeNull();
  });

  it("keeps filtered-empty copy local to the queue when no rows match", () => {
    render(
      <AdminOperationsQueue items={[]} selectedCaseId={null} onSelectCase={vi.fn()} />,
    );

    expect(screen.getByText("현재 조건에 맞는 운영 케이스가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("never renders an unknown raw summary code", () => {
    render(
      <AdminOperationsQueue
        items={[
          queueItem({
            summaryCode: "PRIVATE_PROVIDER_CODE" as never,
            summary: {
              title: "운영 상태 확인 필요",
              description: "안전한 운영 상세에서 상태를 확인하세요.",
            },
          }),
        ]}
        selectedCaseId={null}
        onSelectCase={vi.fn()}
      />,
    );

    expect(screen.getByText("운영 상태 확인 필요")).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE_PROVIDER_CODE")).not.toBeInTheDocument();
  });
});
