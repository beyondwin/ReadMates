import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManualNotificationDispatchListItem } from "@/features/host/model/host-view-types";
import { ManualNotificationDispatchLedger } from "./manual-notification-dispatch-ledger";

const dispatches: ManualNotificationDispatchListItem[] = Array.from(
  { length: 4 },
  (_, index) => ({
    manualDispatchId: `dispatch-${index + 1}`,
    eventId: `event-${index + 1}`,
    source: "MANUAL",
    eventType: "SESSION_REMINDER_DUE",
    sessionId: `session-${index + 1}`,
    sessionNumber: 10 - index,
    bookTitle: `Example Book ${index + 1}`,
    requestedChannels: "BOTH",
    audience: "ALL_ACTIVE_MEMBERS",
    resend: false,
    requestedBy: "h***@example.com",
    targetCount: 4,
    expectedInAppCount: 4,
    expectedEmailCount: 3,
    eventStatus: "PUBLISHED",
    createdAt: `2026-07-${String(25 - index).padStart(2, "0")}T10:00:00Z`,
  }),
);

describe("ManualNotificationDispatchLedger", () => {
  it("gives recent and full ledgers unique accessible names and heading ids", () => {
    render(
      <>
        <ManualNotificationDispatchLedger variant="recent" dispatches={[]} />
        <ManualNotificationDispatchLedger variant="full" dispatches={[]} />
      </>,
    );

    const recent = screen.getByRole("region", { name: "최근 수동 발송" });
    const full = screen.getByRole("region", { name: "전체 수동 발송" });
    const recentTitleId = recent.getAttribute("aria-labelledby");
    const fullTitleId = full.getAttribute("aria-labelledby");

    expect(recentTitleId).toBe("manual-dispatch-ledger-recent-title");
    expect(fullTitleId).toBe("manual-dispatch-ledger-full-title");
    expect(recentTitleId).not.toBe(fullTitleId);
  });

  it("shows only the newest three rows in recent mode", () => {
    render(
      <ManualNotificationDispatchLedger
        variant="recent"
        limit={3}
        dispatches={dispatches}
      />,
    );

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "수동 발송 더 보기" })).not.toBeInTheDocument();
  });

  it("keeps pagination in full mode", () => {
    render(
      <ManualNotificationDispatchLedger
        variant="full"
        dispatches={dispatches.slice(0, 1)}
        hasMore
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "수동 발송 더 보기" })).toBeInTheDocument();
  });
});
