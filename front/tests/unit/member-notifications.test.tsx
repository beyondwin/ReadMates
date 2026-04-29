import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberNotificationListResponse } from "@/features/notifications/api/notifications-contracts";
import { memberNotificationsActions } from "@/features/notifications/route/member-notifications-data";
import { MemberNotificationsRoute } from "@/features/notifications/route/member-notifications-route";
import { MemberNotificationsPage } from "@/features/notifications/ui/member-notifications-page";

function installRouterRequestShim() {
  const NativeRequest = globalThis.Request;

  vi.stubGlobal(
    "Request",
    class RouterTestRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init === undefined ? init : { ...init, signal: undefined });
      }
    },
  );
}

const unreadNotification = {
  id: "00000000-0000-0000-0000-000000000001",
  eventType: "NEXT_BOOK_PUBLISHED" as const,
  title: "다음 책이 공개되었습니다",
  body: "12회차 책을 확인해 주세요.",
  deepLinkPath: "/sessions/00000000-0000-0000-0000-000000000002",
  readAt: null,
  createdAt: "2026-04-29T00:00:00Z",
};

const notificationData: MemberNotificationListResponse = {
  unreadCount: 1,
  items: [unreadNotification],
};

function DestinationProbe() {
  const location = useLocation();
  return <div>destination {location.pathname}</div>;
}

function renderMemberNotificationsRoute(data: MemberNotificationListResponse = notificationData) {
  installRouterRequestShim();
  const loader = vi.fn(() => data);
  const router = createMemoryRouter(
    [
      {
        path: "/app/notifications",
        element: <MemberNotificationsRoute />,
        loader,
        hydrateFallbackElement: <div>알림을 불러오는 중</div>,
      },
      {
        path: "/app/sessions/:sessionId",
        element: <DestinationProbe />,
      },
    ],
    { initialEntries: ["/app/notifications"] },
  );

  render(<RouterProvider router={router} />);

  return { loader, router };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MemberNotificationsPage", () => {
  it("renders unread notification rows", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[unreadNotification]}
        onMarkRead={() => undefined}
        onMarkAllRead={() => undefined}
      />,
    );

    expect(screen.getByText("알림")).toBeInTheDocument();
    expect(screen.getByText("다음 책이 공개되었습니다")).toBeInTheDocument();
    expect(screen.getByText("읽지 않은 알림 1개")).toBeInTheDocument();
  });

  it("renders pending read actions and route action failures from props", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[unreadNotification]}
        pendingReadIds={new Set([unreadNotification.id])}
        markAllReadPending
        actionError="알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요."
        onMarkRead={() => undefined}
        onMarkAllRead={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "읽음 처리 중" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "모두 읽음 처리 중" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
  });

  it("marks an unread notification read before following its primary link", async () => {
    const user = userEvent.setup();
    const markRead = vi.spyOn(memberNotificationsActions, "markRead").mockResolvedValue(undefined);

    renderMemberNotificationsRoute();

    await user.click(await screen.findByRole("link", { name: "다음 책이 공개되었습니다" }));

    expect(markRead).toHaveBeenCalledWith(unreadNotification.id);
    expect(await screen.findByText("destination /app/sessions/00000000-0000-0000-0000-000000000002")).toBeInTheDocument();
  });

  it("disables duplicate item read mutations while one is pending", async () => {
    const user = userEvent.setup();
    let resolveMarkRead!: () => void;
    const markRead = vi.spyOn(memberNotificationsActions, "markRead").mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMarkRead = resolve;
      }),
    );

    renderMemberNotificationsRoute();

    const readButton = await screen.findByRole("button", { name: "읽음" });
    await user.click(readButton);

    await waitFor(() => expect(readButton).toBeDisabled());
    await user.click(readButton);

    expect(markRead).toHaveBeenCalledTimes(1);

    resolveMarkRead();
    await waitFor(() => expect(readButton).not.toBeDisabled());
  });

  it("shows an accessible error when marking all notifications read fails", async () => {
    const user = userEvent.setup();
    const markAllRead = vi.spyOn(memberNotificationsActions, "markAllRead").mockRejectedValue(new Error("network failed"));

    renderMemberNotificationsRoute();

    await user.click(await screen.findByRole("button", { name: "모두 읽음" }));

    expect(markAllRead).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
  });

  it("disables duplicate read-all mutations while one is pending", async () => {
    const user = userEvent.setup();
    let resolveMarkAllRead!: () => void;
    const markAllRead = vi.spyOn(memberNotificationsActions, "markAllRead").mockReturnValue(
      new Promise<{ updatedCount: number }>((resolve) => {
        resolveMarkAllRead = () => resolve({ updatedCount: 1 });
      }),
    );

    renderMemberNotificationsRoute();

    const readAllButton = await screen.findByRole("button", { name: "모두 읽음" });
    await user.click(readAllButton);

    await waitFor(() => expect(readAllButton).toBeDisabled());
    await user.click(readAllButton);

    expect(markAllRead).toHaveBeenCalledTimes(1);

    resolveMarkAllRead();
    await waitFor(() => expect(readAllButton).not.toBeDisabled());
  });
});
