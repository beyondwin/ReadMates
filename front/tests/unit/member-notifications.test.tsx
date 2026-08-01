import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, MemoryRouter, RouterProvider, useLocation } from "react-router-dom";
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

const readReflectionNotification = {
  ...unreadNotification,
  id: "00000000-0000-0000-0000-000000000004",
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED" as const,
  title: "지난 모임 회고가 준비되었습니다",
  body: "모임 기록과 피드백을 다시 확인해 주세요.",
  readAt: "2026-04-29T01:00:00Z",
};

const notificationData: MemberNotificationListResponse = {
  unreadCount: 1,
  items: [unreadNotification],
  nextCursor: null,
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
  const state = location.state as {
    readmatesReturnTo?: string;
    readmatesReturnLabel?: string;
  } | null;

  return (
    <div>
      <div>destination {location.pathname}</div>
      <div data-testid="return-to">{state?.readmatesReturnTo ?? ""}</div>
      <div data-testid="return-label">{state?.readmatesReturnLabel ?? ""}</div>
      {state?.readmatesReturnTo ? (
        <Link to={state.readmatesReturnTo}>
          {state.readmatesReturnLabel ?? "알림으로"} 돌아가기
        </Link>
      ) : null}
    </div>
  );
}

function renderMemberNotificationsRoute(
  data: MemberNotificationListResponse = notificationData,
  initialEntry = "/app/notifications",
) {
  installRouterRequestShim();
  const loader = vi.fn(() => data);
  const isScoped = initialEntry.startsWith("/clubs/");
  const router = createMemoryRouter(
    [
      {
        path: isScoped ? "/clubs/:clubSlug/app/notifications" : "/app/notifications",
        element: <MemberNotificationsRoute />,
        loader,
        hydrateFallbackElement: <div>알림을 불러오는 중</div>,
      },
      {
        path: isScoped ? "/clubs/:clubSlug/app/sessions/:sessionId" : "/app/sessions/:sessionId",
        element: <DestinationProbe />,
      },
    ],
    { initialEntries: [initialEntry] },
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
        onMarkAllRead={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "알림" })).toBeInTheDocument();
    expect(screen.getByText("다음 책이 공개되었습니다")).toBeInTheDocument();
    expect(screen.getByText("새 알림 1개")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "받은 알림" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "수신 설정" })).toHaveAttribute(
      "href",
      "/app/notifications/settings",
    );
  });

  it("uses the full unread row as the only individual action", async () => {
    const user = userEvent.setup();
    const onOpenNotification = vi.fn();

    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[unreadNotification]}
        onOpenNotification={onOpenNotification}
        onMarkAllRead={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("link", {
      name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
    }));
    expect(onOpenNotification).toHaveBeenCalledWith(
      unreadNotification.id,
      "/app/sessions/00000000-0000-0000-0000-000000000002",
    );
    expect(screen.queryByRole("button", { name: "읽음" })).toBeNull();
  });

  it("keeps notification deep links inside the scoped app route", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
        <MemberNotificationsPage
          unreadCount={1}
          items={[unreadNotification]}
          onMarkAllRead={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /다음 책이 공개되었습니다/ })).toHaveAttribute(
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
          onMarkAllRead={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /다음 책이 공개되었습니다/ })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000002",
    );
  });

  it("keeps a read notification as a native scoped link", () => {
    const onOpenNotification = vi.fn();

    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
        <MemberNotificationsPage
          unreadCount={0}
          items={[{
            ...scopedUnreadNotification,
            readAt: "2026-04-29T01:00:00Z",
          }]}
          onOpenNotification={onOpenNotification}
          onMarkAllRead={vi.fn()}
        />
      </MemoryRouter>,
    );

    const row = screen.getByRole("link", {
      name: "다음 책이 공개되었습니다 열기",
    });
    expect(row).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000002",
    );
    expect(row).toHaveAttribute("data-unread", "false");
    expect(row).not.toHaveAttribute("aria-busy");
    expect(onOpenNotification).not.toHaveBeenCalled();
  });

  it("exposes pending and failure states without a standalone read button", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[unreadNotification]}
        pendingReadIds={new Set([unreadNotification.id])}
        markAllReadPending
        actionError="알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요."
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", {
      name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
    })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "읽음 처리 중…" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.",
    );
  });

  it("marks an unread notification read before following its primary link", async () => {
    const user = userEvent.setup();
    const markRead = vi.spyOn(memberNotificationsActions, "markRead").mockResolvedValue(undefined);

    renderMemberNotificationsRoute();

    await user.click(await screen.findByRole("link", { name: /다음 책이 공개되었습니다/ }));

    expect(markRead).toHaveBeenCalledWith(unreadNotification.id);
    expect(await screen.findByText("destination /app/sessions/00000000-0000-0000-0000-000000000002")).toBeInTheDocument();
  });

  it("opens an already-read reflection with scoped return state without marking it read again", async () => {
    const user = userEvent.setup();
    const markRead = vi.spyOn(memberNotificationsActions, "markRead").mockResolvedValue(undefined);
    const { router } = renderMemberNotificationsRoute(
      {
        unreadCount: 0,
        items: [readReflectionNotification],
        nextCursor: null,
      },
      "/clubs/reading-sai/app/notifications",
    );

    await user.click(await screen.findByRole("link", {
      name: "지난 모임 회고가 준비되었습니다 열기",
    }));

    expect(markRead).not.toHaveBeenCalled();
    expect(await screen.findByTestId("return-to")).toHaveTextContent(
      "/clubs/reading-sai/app/notifications",
    );
    expect(screen.getByTestId("return-label")).toHaveTextContent("지난 모임 회고");

    await user.click(screen.getByRole("link", { name: "지난 모임 회고 돌아가기" }));

    expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/notifications");
  });

  it("keeps the user in the inbox when opening an unread row fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(memberNotificationsActions, "markRead")
      .mockRejectedValue(new Error("network failed"));

    const { router } = renderMemberNotificationsRoute();
    await user.click(await screen.findByRole("link", {
      name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.",
    );
    expect(router.state.location.pathname).toBe("/app/notifications");
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

    const row = await screen.findByRole("link", {
      name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
    });
    await user.click(row);

    await waitFor(() => expect(row).toHaveAttribute("aria-busy", "true"));
    await user.click(row);

    expect(markRead).toHaveBeenCalledTimes(1);

    resolveMarkRead();
    expect(await screen.findByText(
      "destination /app/sessions/00000000-0000-0000-0000-000000000002",
    )).toBeInTheDocument();
  });

  it("shows an accessible error when marking all notifications read fails", async () => {
    const user = userEvent.setup();
    const markAllRead = vi.spyOn(memberNotificationsActions, "markAllRead").mockRejectedValue(new Error("network failed"));

    renderMemberNotificationsRoute();

    await user.click(await screen.findByRole("button", { name: "모두 읽음" }));

    expect(markAllRead).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
  });

  it("renders the quiet empty state", () => {
    render(
      <MemberNotificationsPage
        unreadCount={0}
        items={[]}
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByText("새 알림이 없습니다")).toBeVisible();
    expect(screen.getByText("아직 받은 알림이 없습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled();
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

  it("loads the next notification page and appends it", async () => {
    const user = userEvent.setup();
    const nextNotification = {
      ...unreadNotification,
      id: "00000000-0000-0000-0000-000000000003",
      title: "새 알림",
      body: "추가 알림입니다.",
    };
    const loadMore = vi.spyOn(memberNotificationsActions, "loadMore").mockResolvedValue({
      unreadCount: 2,
      items: [nextNotification],
      nextCursor: null,
    });

    renderMemberNotificationsRoute({ ...notificationData, nextCursor: "cursor-1" });

    await user.click(await screen.findByRole("button", { name: "더 보기" }));

    expect(loadMore).toHaveBeenCalledWith(undefined, { limit: 50, cursor: "cursor-1" });
    expect(await screen.findByText("새 알림")).toBeInTheDocument();
    expect(screen.getByText("다음 책이 공개되었습니다")).toBeInTheDocument();
    expect(screen.getByText("새 알림 2개")).toBeInTheDocument();
  });
});
