import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberNotificationListResponse } from "@/features/notifications/api/notifications-contracts";
import { memberNotificationsActions, memberNotificationsLoader } from "@/features/notifications/route/member-notifications-data";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
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

const scopedUnreadNotification = {
  ...unreadNotification,
  deepLinkPath: "/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000002",
};

const notificationData: MemberNotificationListResponse = {
  unreadCount: 1,
  items: [unreadNotification],
};

const activeMemberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-user",
  membershipId: "member-membership",
  clubId: "club-id",
  email: "member@example.com",
  displayName: "이멤버5",
  accountName: "멤버",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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
  window.history.pushState({}, "", "/");
});

describe("MemberNotificationsPage", () => {
  it("passes club slug context before loading scoped member notifications", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(activeMemberAuth));
      }

      if (url === "/api/bff/api/me/notifications?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(notificationData));
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      memberNotificationsLoader({
        params: { clubSlug: "reading-sai" },
        request: new Request("https://readmates.test/clubs/reading-sai/app/notifications"),
      } as Parameters<typeof memberNotificationsLoader>[0]),
    ).resolves.toEqual(notificationData);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/me/notifications?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

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

  it("keeps notification deep links inside the scoped app route", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
        <MemberNotificationsPage
          unreadCount={1}
          items={[unreadNotification]}
          onMarkRead={() => undefined}
          onMarkAllRead={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "다음 책이 공개되었습니다" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000002",
    );
  });

  it("preserves already scoped notification deep links", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
        <MemberNotificationsPage
          unreadCount={1}
          items={[scopedUnreadNotification]}
          onMarkRead={() => undefined}
          onMarkAllRead={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "다음 책이 공개되었습니다" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000002",
    );
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
