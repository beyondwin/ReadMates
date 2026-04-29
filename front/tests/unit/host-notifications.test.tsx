import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import type {
  HostNotificationDeliveryItem,
  HostNotificationEventItem,
  HostNotificationSummary,
  NotificationTestMailAuditItem,
} from "@/features/host/api/host-contracts";

const summary: HostNotificationSummary = {
  pending: 2,
  failed: 1,
  dead: 1,
  sentLast24h: 3,
  latestFailures: [],
};

const audit: NotificationTestMailAuditItem[] = [
  {
    id: "audit-1",
    recipientEmail: "t***@example.com",
    status: "SENT",
    lastError: null,
    createdAt: "2026-04-29T00:00:00Z",
  },
];

const pendingEvent: HostNotificationEventItem = {
  id: "event-1",
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
  status: "PENDING",
  attemptCount: 1,
  createdAt: "2026-04-29T00:00:00Z",
  updatedAt: "2026-04-29T00:00:00Z",
};

const deadDelivery: HostNotificationDeliveryItem = {
  id: "notification-1",
  eventId: "event-1",
  channel: "EMAIL",
  status: "DEAD",
  recipientEmail: "m***@example.com",
  attemptCount: 5,
  updatedAt: "2026-04-29T00:00:00Z",
};

type ActionMock = ReturnType<typeof vi.fn>;

function renderPage({
  events = [pendingEvent],
  deliveries = [deadDelivery],
  auditItems = [],
  onProcess = vi.fn().mockResolvedValue(undefined),
  onRetry = vi.fn().mockResolvedValue(undefined),
  onRestore = vi.fn().mockResolvedValue(undefined),
  onSendTestMail = vi.fn().mockResolvedValue(undefined),
}: {
  events?: HostNotificationEventItem[];
  deliveries?: HostNotificationDeliveryItem[];
  auditItems?: NotificationTestMailAuditItem[];
  onProcess?: ActionMock;
  onRetry?: ActionMock;
  onRestore?: ActionMock;
  onSendTestMail?: ActionMock;
} = {}) {
  render(
    <HostNotificationsPage
      summary={summary}
      events={events}
      deliveries={deliveries}
      audit={auditItems}
      onProcess={onProcess}
      onRetry={onRetry}
      onRestore={onRestore}
      onSendTestMail={onSendTestMail}
    />,
  );

  return { onProcess, onRetry, onRestore, onSendTestMail };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HostNotificationsPage", () => {
  it("renders event and delivery operation ledgers", async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByRole("tab", { name: "이벤트" })).toBeInTheDocument();
    expect(screen.getByText("Kafka 발행 대기")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "배송" }));

    expect(screen.getByText("EMAIL")).toBeInTheDocument();
  });

  it("renders notification ledger and restores a dead item after confirmation", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);

    renderPage({ onRestore });

    expect(screen.getByText("알림 발송 장부")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "배송" }));
    expect(screen.getByText("m***@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "복구" }));
    await user.click(screen.getByRole("button", { name: "복구 확인" }));

    expect(onRestore).toHaveBeenCalledWith("notification-1");
  });

  it("retries pending and failed notifications only", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const pendingItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-2", status: "PENDING" };
    const sentItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-3", status: "SENT" };

    renderPage({ deliveries: [pendingItem, sentItem], onRetry });
    await user.click(screen.getByRole("tab", { name: "배송" }));

    await user.click(screen.getByRole("button", { name: "재시도" }));

    expect(onRetry).toHaveBeenCalledWith("notification-2");
    const sentRow = screen.getByText("SENT").closest("article");
    expect(sentRow).not.toBeNull();
    expect(within(sentRow as HTMLElement).queryByRole("button", { name: "재시도" })).not.toBeInTheDocument();
  });

  it("processes pending and failed notifications", async () => {
    const user = userEvent.setup();
    const onProcess = vi.fn().mockResolvedValue(undefined);

    renderPage({ onProcess });

    await user.click(screen.getByRole("button", { name: "대기/실패 처리" }));

    expect(onProcess).toHaveBeenCalledTimes(1);
  });

  it("keeps notification operations disabled while route data is refreshing", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const pendingItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-2", status: "FAILED" };

    render(
      <HostNotificationsPage
        summary={summary}
        events={[pendingEvent]}
        deliveries={[pendingItem]}
        audit={[]}
        isRefreshing
        onProcess={vi.fn()}
        onRetry={onRetry}
        onRestore={vi.fn()}
        onSendTestMail={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "새로고침 중" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "배송" }));
    const retryButton = screen.getByRole("button", { name: "재시도" });
    expect(retryButton).toBeDisabled();

    await user.click(retryButton);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows restore failures inside the active confirmation dialog", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockRejectedValue(new Error("restore failed"));

    renderPage({ onRestore });

    await user.click(screen.getByRole("tab", { name: "배송" }));
    await user.click(screen.getByRole("button", { name: "복구" }));
    await user.click(screen.getByRole("button", { name: "복구 확인" }));

    const dialog = screen.getByRole("dialog", { name: "중단된 알림을 복구할까요?" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "복구하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.",
    );
  });

  it("sends a test mail request and renders masked audit rows", async () => {
    const user = userEvent.setup();
    const onSendTestMail = vi.fn().mockResolvedValue(undefined);

    renderPage({ auditItems: audit, onSendTestMail });

    await user.type(screen.getByLabelText("테스트 메일 주소"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "테스트 발송" }));

    expect(onSendTestMail).toHaveBeenCalledWith({ recipientEmail: "test@example.com" });
    expect(screen.getByText("t***@example.com")).toBeInTheDocument();
  });
});
