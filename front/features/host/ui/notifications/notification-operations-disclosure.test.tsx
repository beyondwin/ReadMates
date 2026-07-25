import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  HostNotificationDeliveryItem,
  HostNotificationSummary,
} from "./notification-formatters";
import {
  type NotificationOperationsDisclosureProps,
  NotificationOperationsDisclosure,
  notificationIssueSignature,
} from "./notification-operations-disclosure";

const failedDelivery: HostNotificationDeliveryItem = {
  id: "delivery-1",
  eventId: "event-1",
  channel: "EMAIL",
  status: "FAILED",
  recipientEmail: "m***@example.com",
  attemptCount: 2,
  updatedAt: "2026-07-25T10:00:00Z",
};

const disclosureDefaults: NotificationOperationsDisclosureProps = {
  summary: { pending: 0, failed: 0, dead: 0, sentLast24h: 4 },
  events: [],
  deliveries: [],
  manualDispatches: [],
  audit: [],
  retryPendingId: null,
  restorePendingId: null,
  disabled: false,
  hasMoreEvents: false,
  hasMoreDeliveries: false,
  hasMoreManualDispatches: false,
  hasMoreAudit: false,
  isLoadingMoreEvents: false,
  isLoadingMoreDeliveries: false,
  isLoadingMoreManualDispatches: false,
  isLoadingMoreAudit: false,
  testMailValue: "",
  testMailPending: false,
  onTestMailValueChange: vi.fn(),
  onSubmitTestMail: vi.fn(),
  onRetry: vi.fn(),
  onRestore: vi.fn(),
};

function renderDisclosure(overrides: Partial<NotificationOperationsDisclosureProps> = {}) {
  let currentProps = { ...disclosureDefaults, ...overrides };
  const result = render(<NotificationOperationsDisclosure {...currentProps} />);

  return {
    ...result,
    rerenderDisclosure(next: Partial<NotificationOperationsDisclosureProps>) {
      currentProps = { ...currentProps, ...next };
      result.rerender(<NotificationOperationsDisclosure {...currentProps} />);
    },
  };
}

describe("NotificationOperationsDisclosure", () => {
  it("starts closed when operations are healthy", () => {
    renderDisclosure();

    expect(screen.getByRole("button", { name: /운영 상세/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tab", { name: "이벤트" })).not.toBeInTheDocument();
  });

  it("opens on issues, respects a user collapse, and reopens for a new issue", async () => {
    const user = userEvent.setup();
    const { rerenderDisclosure } = renderDisclosure({
      summary: { pending: 0, failed: 1, dead: 0, sentLast24h: 4 },
      deliveries: [{ ...failedDelivery, id: "delivery-1" }],
    });

    const toggle = screen.getByRole("button", { name: /운영 상세/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tab", { name: "배송" })).toHaveAttribute("aria-selected", "true");

    await user.click(toggle);
    rerenderDisclosure({
      summary: { pending: 0, failed: 1, dead: 0, sentLast24h: 4 },
      deliveries: [{ ...failedDelivery, id: "delivery-1" }],
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    rerenderDisclosure({
      summary: { pending: 0, failed: 2, dead: 0, sentLast24h: 4 },
      deliveries: [
        { ...failedDelivery, id: "delivery-1" },
        { ...failedDelivery, id: "delivery-2" },
      ],
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("derives a stable issue signature from summary and actionable rows", () => {
    const summary: HostNotificationSummary = { pending: -1, failed: 2, dead: 0, sentLast24h: 4 };

    expect(notificationIssueSignature(summary, [], [failedDelivery])).toBe(
      "summary:0:2:0|delivery:delivery-1:FAILED",
    );
  });
});
