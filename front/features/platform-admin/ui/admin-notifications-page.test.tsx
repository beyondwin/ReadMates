import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminNotificationsPage } from "@/features/platform-admin/ui/admin-notifications-page";
import type {
  AdminNotificationDelivery,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayPreview,
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
  warnings: [],
  expiresAt: "2026-05-27T00:10:00Z",
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

    expect(screen.getByRole("heading", { name: "알림 / Outbox 운영" })).toBeInTheDocument();
    expect(screen.getByText("Outbox pending")).toBeInTheDocument();
    expect(screen.getAllByText("mailbox_unavailable").length).toBeGreaterThan(0);
  });

  it("renders masked recipients without raw email fixture", () => {
    const { container } = renderPage();
    const deliveryLedger = screen.getByRole("region", { name: "Delivery ledger" });

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

  it("shows support role permission message", () => {
    renderPage({ canReplay: false });

    expect(screen.getByText("현재 역할은 재처리를 실행할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대상 확인" })).toBeDisabled();
  });
});
