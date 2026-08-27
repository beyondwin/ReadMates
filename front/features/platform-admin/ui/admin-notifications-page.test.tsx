import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminNotificationsPage } from "@/features/platform-admin/ui/admin-notifications-page";

const LEDGER_CSS = readFileSync(
  path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"),
  "utf8",
);
import type {
  AdminNotificationDelivery,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayPreview,
  AdminNotificationReplayConfirmResult,
} from "@/features/platform-admin/model/platform-admin-notifications-model";

const snapshot: AdminNotificationOperationsSnapshot = {
  generatedAt: "2026-05-27T00:00:00Z",
  outboxSummary: { pending: 3, active: 1, failed: 2, dead: 1, sentOrPublishedLast24h: 9 },
  deliverySummary: { pending: 4, active: 0, failed: 1, dead: 1, sentOrPublishedLast24h: 12 },
  relaySummary: { publishing: 0, sending: 0, stalePublishing: 1, staleSending: 1 },
  failureClusters: [{ safeErrorCode: "mailbox_unavailable", status: "DEAD", count: 2, latestAt: "2026-05-27T00:00:00Z" }],
  clubHealth: [],
  recentManualDispatches: [],
};

const event: AdminNotificationOutboxEvent = {
  eventId: "event-1",
  club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
  eventType: "SESSION_REMINDER_DUE",
  source: "AUTOMATIC",
  status: "FAILED",
  attemptCount: 2,
  nextAttemptAt: null,
  createdAt: "2026-05-27T00:00:00Z",
  updatedAt: "2026-05-27T00:01:00Z",
  safeErrorCode: "mailbox_unavailable",
  manualDispatch: null,
};

const delivery: AdminNotificationDelivery = {
  deliveryId: "delivery-1",
  eventId: "event-1",
  club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
  channel: "EMAIL",
  status: "DEAD",
  maskedRecipient: "m***@example.com",
  attemptCount: 2,
  createdAt: "2026-05-27T00:00:00Z",
  updatedAt: "2026-05-27T00:01:00Z",
  safeErrorCode: "mailbox_unavailable",
};

const replayPreview: AdminNotificationReplayPreview = {
  previewId: "preview-1",
  selectionHash: "hash",
  matchedCount: 2,
  excludedCount: 0,
  estimatedByStatus: { DEAD: 2 },
  warnings: ["MAIL_AMBIGUOUS"],
  expiresAt: "2026-05-27T00:10:00Z",
};

const replayResult: AdminNotificationReplayConfirmResult = {
  receiptId: "00000000-0000-4000-8000-000000005901",
  replayedCount: 1,
  skippedCount: 1,
  skippedReasonCounts: { TARGET_STATE_CHANGED: 1 },
  originStatus: "SUCCEEDED",
  effectStatus: "PENDING",
  effectAvailability: "DISABLED",
  convergenceId: "00000000-0000-4000-8000-000000005902",
};

function renderPage(overrides: Partial<ComponentProps<typeof AdminNotificationsPage>> = {}) {
  return render(
    <AdminNotificationsPage
      snapshot={snapshot}
      events={[event]}
      deliveries={[delivery]}
      focus={null}
      replayPreview={null}
      replayReason=""
      canReplay
      busy={false}
      error={null}
      success={null}
      replayResult={null}
      onPreviewReplay={vi.fn()}
      onConfirmReplay={vi.fn()}
      onReplayReasonChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("AdminNotificationsPage", () => {
  it("renders summary and failure clusters", () => {
    renderPage();

    expect(screen.getByText("운영 · 배달")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "배달 원장" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "실패 클러스터" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "재발송" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "발송 대기 장부" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "배달 장부" })).toBeInTheDocument();
    expect(screen.getByText("발송 대기")).toBeInTheDocument();
    expect(screen.getByText("발송 실패")).toBeInTheDocument();
    expect(screen.getByText("배달 대기")).toBeInTheDocument();
    expect(screen.getByText("배달 실패")).toBeInTheDocument();
    expect(screen.getByText("중계 지연")).toBeInTheDocument();
    expect(screen.queryByText("Outbox pending")).toBeNull();
    expect(screen.getAllByText("mailbox_unavailable").length).toBeGreaterThan(0);
  });

  it("shows the fixed replay warning under failure clusters", () => {
    renderPage();

    const warning = screen.getByText("수동 재발송은 자동 재시도를 취소하지 않습니다.");
    const failures = screen.getByRole("heading", { name: "실패 클러스터" });
    const replay = screen.getByRole("heading", { name: "재발송" });
    const replayPanel = screen.getByRole("region", { name: "재발송" });

    expect(warning).toBeInTheDocument();
    expect(replayPanel).toContainElement(warning);
    expect(failures.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(failures.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders an attempt badge from the fixture attempt count", () => {
    renderPage();

    expect(screen.getAllByText("2차 시도").length).toBeGreaterThan(0);
    expect(screen.queryByText(/attempts 2/)).toBeNull();
  });

  it("renders the three Korean delivery status labels", () => {
    renderPage({
      events: [
        { ...event, eventId: "event-sent", status: "PUBLISHED", attemptCount: 1, nextAttemptAt: null, safeErrorCode: null },
        { ...event, eventId: "event-pending", status: "PENDING", attemptCount: 1, nextAttemptAt: "2026-05-27T00:30:00Z", safeErrorCode: null },
        { ...event, eventId: "event-failed", status: "FAILED", attemptCount: 2 },
      ],
      deliveries: [
        { ...delivery, deliveryId: "delivery-sent", status: "SENT", attemptCount: 1, safeErrorCode: null },
        { ...delivery, deliveryId: "delivery-pending", status: "PENDING", attemptCount: 1, safeErrorCode: null },
        { ...delivery, deliveryId: "delivery-failed", status: "FAILED", attemptCount: 3, safeErrorCode: "mailbox_unavailable" },
      ],
    });

    const outbox = screen.getByRole("region", { name: "발송 대기 장부" });
    const ledger = screen.getByRole("region", { name: "배달 장부" });

    expect(within(outbox).getByText("발송됨", { exact: true })).toBeInTheDocument();
    expect(within(outbox).getByText("대기", { exact: true })).toBeInTheDocument();
    expect(within(outbox).getByText("실패", { exact: true })).toBeInTheDocument();
    expect(within(ledger).getByText("발송됨", { exact: true })).toBeInTheDocument();
    expect(within(ledger).getByText("대기", { exact: true })).toBeInTheDocument();
    expect(within(ledger).getByText("실패", { exact: true })).toBeInTheDocument();
    expect(within(outbox).queryByText("PUBLISHED")).toBeNull();
    expect(within(ledger).queryByText("SENT")).toBeNull();
    expect(within(outbox).getByText(/다음 재시도/)).toBeInTheDocument();
    expect(within(ledger).queryByText(/다음 재시도/)).toBeNull();
  });

  it("labels a failure cluster as club · notification type · error class", () => {
    renderPage();

    expect(screen.getByText("읽는사이 · SESSION_REMINDER_DUE · mailbox_unavailable")).toBeInTheDocument();
  });

  it("uses supporting copy for replay expiry and runtime summaries", () => {
    renderPage({ replayPreview });

    expect(screen.getByText(/^만료 /)).toHaveClass("small");
    expect(screen.getByText("MAIL_AMBIGUOUS")).toBeInTheDocument();
    expect(screen.getByText(/DEAD 2/)).toBeInTheDocument();
  });

  it("shows immutable receipt counts and disabled pending convergence separately", () => {
    renderPage({ replayResult });

    expect(screen.getByRole("region", { name: "명령 기록" })).toBeInTheDocument();
    expect(screen.getByText(/영수증 00000000-0000-4000-8000-000000005901/)).toBeInTheDocument();
    expect(screen.getByText(/재처리 1건 · 건너뜀 1건/)).toBeInTheDocument();
    expect(screen.getByText(/TARGET_STATE_CHANGED 1/)).toBeInTheDocument();
    expect(screen.getByText(/효과 대기 · 현재 비활성/)).toBeInTheDocument();
    expect(screen.queryByText("공개 반영 추적")).not.toBeInTheDocument();
  });

  it("renders an L2 receipt timeline only after an actual replay receipt", () => {
    const { rerender } = renderPage({ replayPreview });

    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(document.querySelector(".admin-safe-action-dock")).toHaveAttribute("data-level", "L2");

    rerender(
      <AdminNotificationsPage
        snapshot={snapshot}
        events={[event]}
        deliveries={[delivery]}
        focus={null}
        replayPreview={replayPreview}
        replayReason="retry delivery"
        canReplay
        busy={false}
        error={null}
        success={null}
        replayResult={replayResult}
        onPreviewReplay={vi.fn()}
        onConfirmReplay={vi.fn()}
        onReplayReasonChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "명령 기록" })).toBeInTheDocument();
  });

  it("renders masked recipients without raw email fixture", () => {
    const { container } = renderPage();
    const deliveryLedger = screen.getByRole("region", { name: "배달 장부" });

    expect(within(deliveryLedger).getByText(/m\*\*\*@example.com/)).toBeInTheDocument();
    expect(container.textContent).not.toContain("member1@example.com");
  });

  it("shows focus banner from health drill-down", () => {
    renderPage({ focus: "outbox_backlog" });

    expect(screen.getByText(/Health outbox backlog/)).toBeInTheDocument();
  });

  it("keeps confirm disabled until preview and reason exist", async () => {
    const onReasonChange = vi.fn();
    const user = userEvent.setup();
    renderPage({ replayPreview, onReplayReasonChange: onReasonChange });

    expect(screen.getByRole("button", { name: "재처리 확정" })).toBeDisabled();
    await user.type(screen.getByLabelText("처리 사유"), "provider recovered");

    expect(onReasonChange).toHaveBeenCalled();
  });

  it("marks the L2 dock unknown-outcome without treating the command as ready", () => {
    renderPage({
      replayPreview,
      replayReason: "retry delivery",
      unknownOutcome: true,
      error: "재처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.",
    });

    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "unknown-outcome",
    );
    expect(screen.getByRole("button", { name: "대상 확인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "재처리 확정" })).toBeEnabled();
  });

  it("shows a capability denial instead of a role-derived replay control", () => {
    renderPage({ canReplay: false });

    expect(screen.getByText("현재 권한으로는 재처리를 실행할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대상 확인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "재처리 확정" })).toBeDisabled();
  });

  it("locks 44px targets and reduced motion in the scoped notifications stylesheet", () => {
    expect(LEDGER_CSS).toMatch(/\.admin-notifications[\s\S]*min-height:\s*44px/);
    expect(LEDGER_CSS).toContain(".admin-notifications");
    expect(LEDGER_CSS).toContain("prefers-reduced-motion");
    expect(LEDGER_CSS).toContain(":focus-visible");
    expect(LEDGER_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-notifications[\s\S]*animation-duration:\s*0\.01ms/,
    );
    expect(LEDGER_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });

  it("does not import route, query, or API modules", () => {
    const source = readFileSync(
      path.resolve("features/platform-admin/ui/admin-notifications-page.tsx"),
      "utf8",
    );
    expect(source).not.toContain("platform-admin-queries");
    expect(source).not.toContain("platform-admin-notifications-api");
    expect(source).not.toContain("admin-notifications-route");
    expect(/fetch\s*\(/.test(source)).toBe(false);
  });
});
