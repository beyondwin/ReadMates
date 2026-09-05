import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminOperationCaseView } from "@/features/platform-admin/model/platform-admin-operations-model";
import { AdminOperationsQueue } from "./admin-operations-queue";

const QUEUE_CSS = readFileSync(path.resolve("features/platform-admin/ui/admin-today.css"), "utf8");

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

function tenQueueItems(): AdminOperationCaseView[] {
  return Array.from({ length: 10 }, (_, index) => queueItem({
    id: `case-${index + 1}`,
    locatorLabel: String(10 - index).padStart(2, "0"),
  }));
}

describe("AdminOperationsQueue", () => {
  it("shows three rows and an explicit all-items action by default", async () => {
    const user = userEvent.setup();
    const onShowAll = vi.fn();
    render(
      <AdminOperationsQueue
        items={tenQueueItems()}
        selectedCaseId="case-1"
        visibleLimit={3}
        expanded={false}
        onShowAll={onShowAll}
        onSelectCase={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /현재 상태/ })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "전체 10건 보기" }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it("exposes every row once the queue is expanded", () => {
    render(
      <AdminOperationsQueue
        items={tenQueueItems()}
        selectedCaseId="case-1"
        visibleLimit={3}
        expanded
        onSelectCase={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /현재 상태/ })).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /전체 .*보기/ })).not.toBeInTheDocument();
  });

  it("lets expanded Today rows escape the 100vh/664px overflow clip", () => {
    expect(QUEUE_CSS).toMatch(
      /\.admin-shell\[data-content-layout="split"\]:has\(\[data-queue-disclosure="all"\]\)\s*\{[^}]*overflow:\s*visible/,
    );
    expect(QUEUE_CSS).toMatch(
      /\[data-queue-disclosure="all"\]\[data-content-layout="split"\][\s\S]{0,120}overflow:\s*visible/,
    );
    expect(QUEUE_CSS).toMatch(
      /\[data-content-layout="flow"\]\[data-queue-disclosure="all"\][\s\S]{0,220}overflow:\s*visible/,
    );
    expect(QUEUE_CSS).not.toMatch(
      /\.admin-shell\[data-content-layout="split"\]:has\(\[data-queue-disclosure="all"\]\)\s*\{[^}]*overflow:\s*hidden/,
    );
    expect(QUEUE_CSS).not.toMatch(
      /\.admin-operations-queue__list[\s\S]{0,80}overflow-y:\s*auto/,
    );
  });

  it("places a dedicated title between locator and severity", () => {
    render(
      <AdminOperationsQueue
        items={[queueItem({ locatorLabel: "03" })]}
        selectedCaseId="case-notification"
        onSelectCase={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ });
    const locator = row.querySelector(".admin-operations-queue__locator");
    const title = row.querySelector(".admin-operations-queue__title");
    const severity = row.querySelector(".admin-operations-queue__severity");
    expect(title).not.toBeNull();
    expect(locator?.compareDocumentPosition(title!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title?.compareDocumentPosition(severity!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses approved orange selection chrome instead of accent blue", () => {
    const selectedBlock = QUEUE_CSS.match(
      /\.admin-operations-queue__row\[aria-pressed="true"\]\s*\{[^}]+\}/,
    )?.[0];
    expect(selectedBlock).toMatch(/var\(--warning/);
    expect(selectedBlock).toMatch(/inset|border-left|box-shadow/);
    expect(selectedBlock).not.toMatch(/var\(--accent\)/);
    expect(QUEUE_CSS).not.toMatch(
      /\.admin-operations-queue__row\[aria-pressed="true"\][\s\S]{0,180}text-decoration:\s*underline/,
    );
    const todaySelected = QUEUE_CSS.match(
      /\.admin-today-ledger \.admin-operations-queue__row\[aria-pressed="true"\]\s*\{[^}]+\}/,
    )?.[0];
    expect(todaySelected).toMatch(/#f68103|#f59d36|#f27f00/);
  });

  it("keeps mobile detail actions and 처리 방법 in document flow", () => {
    expect(QUEUE_CSS).not.toMatch(
      /\[data-content-layout="flow"\][\s\S]{0,360}btn-primary[\s\S]{0,200}position:\s*fixed/,
    );
    expect(QUEUE_CSS).not.toMatch(
      /\[data-content-layout="flow"\][\s\S]{0,240}admin-operation-actions__other[\s\S]{0,80}position:\s*fixed/,
    );
    expect(QUEUE_CSS).not.toMatch(/bottom:\s*114px|bottom:\s*168px/);
    expect(QUEUE_CSS).not.toMatch(
      /\.admin-today-ledger\[data-content-layout="flow"\] \.admin-operations-inspector__lifecycle > \.h3[\s\S]{0,160}clip:\s*rect/,
    );
    const flowDocket = QUEUE_CSS.match(
      /\.admin-today-ledger\[data-content-layout="flow"\] \.admin-case-docket\s*\{[^}]+\}/,
    )?.[0];
    expect(flowDocket).not.toMatch(/height:\s*761px/);
    expect(flowDocket).not.toMatch(/padding-bottom:\s*168px|padding:\s*56px 0 168px/);
  });

  it("paints the Today queue badge as a filled orange mark", () => {
    const badgeBlock = QUEUE_CSS.match(
      /\.admin-today-ledger \.admin-operations-queue__badge\s*\{[^}]+\}/,
    )?.[0];
    expect(badgeBlock).toMatch(/#f59d36|#f5a024|var\(--warn/);
    expect(badgeBlock).toMatch(/background:\s*(#f59d36|#f5a024|var\(--warn)/);
    expect(badgeBlock).not.toMatch(/background:\s*transparent/);
  });

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
        secondaryControls={<div data-testid="queue-controls">필터</div>}
        onSelectCase={vi.fn()}
      />,
    );

    const header = container.querySelector(".admin-operations-queue__header");
    const controls = screen.getByTestId("queue-controls");
    const list = container.querySelector(".admin-operations-queue__list");
    expect(header?.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list?.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
