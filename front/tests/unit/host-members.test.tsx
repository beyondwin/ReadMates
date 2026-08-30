import { readFileSync } from "node:fs";
import path from "node:path";
import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import type {
  HostInvitationsActions,
  RegisteredHostInvitationsActions,
} from "@/features/host/model/host-invitation-actions";
import HostMembers from "@/features/host/ui/host-members";
import { createHostMembersActions, hostMembersLoaderFactory } from "@/features/host";
import HostMembersPage from "@/src/pages/host-members";
import type { HostInvitationListItem, HostMemberListItem } from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { __resetHostClientContractCapabilityForTest } from "@/shared/api/host-client-contract";

const hostContext = { clubSlug: "reading-sai" };

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

const members: HostMemberListItem[] = [
  {
    membershipId: "membership-active",
    userId: "user-active",
    email: "active@example.com",
    displayName: "멤버1",
    accountName: "안멤버1",
    profileImageUrl: null,
    avatarKey: "banana-green-book",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-04-18T12:00:00Z",
    createdAt: "2026-04-17T12:00:00Z",
    lastClubAccessAt: "2026-08-29T01:02:03Z",
    currentSessionParticipationStatus: "ACTIVE",
    canSuspend: true,
    canRestore: false,
    canDeactivate: true,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: true,
  },
  {
    membershipId: "membership-pending",
    userId: "user-pending",
    email: "viewer@example.com",
    displayName: "둘",
    accountName: "둘러보기 요청자",
    profileImageUrl: null,
    role: "MEMBER",
    status: "VIEWER",
    joinedAt: null,
    createdAt: "2026-04-20T12:00:00Z",
    lastClubAccessAt: null,
    currentSessionParticipationStatus: null,
    canSuspend: false,
    canRestore: false,
    canDeactivate: true,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: false,
  },
  {
    membershipId: "membership-suspended",
    userId: "user-suspended",
    email: "suspended@example.com",
    displayName: "정",
    accountName: "정지 멤버",
    profileImageUrl: null,
    avatarKey: "cloud-green-book",
    role: "MEMBER",
    status: "SUSPENDED",
    joinedAt: "2026-04-14T12:00:00Z",
    createdAt: "2026-04-13T12:00:00Z",
    lastClubAccessAt: null,
    currentSessionParticipationStatus: "REMOVED",
    canSuspend: false,
    canRestore: true,
    canDeactivate: true,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: false,
  },
  {
    membershipId: "membership-left",
    userId: "user-left",
    email: "left@example.com",
    displayName: "탈",
    accountName: "탈퇴 멤버",
    profileImageUrl: null,
    avatarKey: "cloud-green-book",
    role: "MEMBER",
    status: "LEFT",
    joinedAt: "2026-04-10T12:00:00Z",
    createdAt: "2026-04-09T12:00:00Z",
    lastClubAccessAt: null,
    currentSessionParticipationStatus: "REMOVED",
    canSuspend: false,
    canRestore: false,
    canDeactivate: false,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: false,
  },
  {
    membershipId: "membership-not-session",
    userId: "user-not-session",
    email: "new@example.com",
    displayName: "새",
    accountName: "새 멤버",
    profileImageUrl: null,
    avatarKey: "future-avatar",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-04-21T12:00:00Z",
    createdAt: "2026-04-21T12:00:00Z",
    lastClubAccessAt: null,
    currentSessionParticipationStatus: null,
    canSuspend: true,
    canRestore: false,
    canDeactivate: true,
    canAddToCurrentSession: true,
    canRemoveFromCurrentSession: false,
  },
];

const activeHostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-host",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.com",
  displayName: "호",
  accountName: "김호스트",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

const noopHostMembersActions = {
  loadMembers: vi.fn(async () => []),
  refreshMembers: vi.fn(async () => ({ items: [], nextCursor: null })),
  submitLifecycle: vi.fn(async () => ({ member: members[0], currentSessionPolicyResult: "APPLIED" as const })),
  submitViewerAction: vi.fn(async () => members[0]),
  submitProfile: vi.fn(async () => members[0]),
} satisfies HostMembersActions;

const noopHostInvitationsActions = {
  listInvitations: vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }))),
  refreshInvitations: vi.fn(async () => ({ items: [], nextCursor: null })),
  publishInvitations: vi.fn(),
  createInvitation: vi.fn(async () => new Response(JSON.stringify({}), { status: 201 })),
  revokeInvitation: vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
  parseInvitation: vi.fn(async (response) => response.json()),
  parseInvitationList: vi.fn(async (response) => response.json()),
} satisfies HostInvitationsActions;

type HostMembersProps = Parameters<typeof HostMembers>[0];

function registerTestInvitationActions(actions: HostInvitationsActions): RegisteredHostInvitationsActions {
  return {
    listInvitations: actions.listInvitations,
    parseInvitationList: actions.parseInvitationList,
    createInvitation: async (request) => {
      const response = await actions.createInvitation(request);
      if (!response.ok) {
        const failure = new Error(`create-invitation-${response.status}`) as Error & {
          status: number;
          publishUi: (publish: (error: Error) => void) => "published";
        };
        failure.status = response.status;
        failure.publishUi = (publish) => (publish(failure), "published");
        throw failure;
      }
      const created = await actions.parseInvitation(response);
      const refreshed = await actions.refreshInvitations({ limit: 50 });
      actions.publishInvitations(refreshed, { limit: 50 });
      const result = { created, refreshed };
      return { ...result, publishUi: (publish) => (publish(result), "published") };
    },
    revokeInvitation: async (invitationId) => {
      const response = await actions.revokeInvitation(invitationId);
      if (!response.ok) {
        const failure = new Error(`revoke-invitation-${response.status}`) as Error & {
          status: number;
          publishUi: (publish: (error: Error) => void) => "published";
        };
        failure.status = response.status;
        failure.publishUi = (publish) => (publish(failure), "published");
        throw failure;
      }
      const revoked = await actions.parseInvitation(response);
      const refreshed = await actions.refreshInvitations({ limit: 50 });
      actions.publishInvitations(refreshed, { limit: 50 });
      const result = { revoked, refreshed };
      return { ...result, publishUi: (publish) => (publish(result), "published") };
    },
  };
}

function HostMembersForTest({
  actions,
  invitationActions,
  initialMembers,
  initialInvitations = [],
  ...props
}: Omit<HostMembersProps, "actions" | "invitationActions" | "initialInvitations"> & {
  actions?: HostMembersActions;
  invitationActions?: HostInvitationsActions;
  initialInvitations?: HostMembersProps["initialInvitations"];
}) {
  return (
    <HostMembers
      {...props}
      initialMembers={initialMembers}
      initialInvitations={initialInvitations}
      actions={actions ?? noopHostMembersActions}
      invitationActions={registerTestInvitationActions(invitationActions ?? noopHostInvitationsActions)}
    />
  );
}

function lifecycleResponse(member: HostMemberListItem) {
  return new Response(JSON.stringify({ member, currentSessionPolicyResult: "APPLIED" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function memberListItemResponse(member: HostMemberListItem, status = 200) {
  return new Response(JSON.stringify(member), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function memberListResponse(items: HostMemberListItem[]) {
  return new Response(JSON.stringify({ items, nextCursor: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function invitationListResponse(items: HostInvitationListItem[] = []) {
  return new Response(JSON.stringify({ items, nextCursor: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function authResponse(auth: AuthMeResponse) {
  return new Response(JSON.stringify(auth), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

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

function renderHostMembersPage(extraResponses: Array<Response | Promise<Response>> = [], initialMembers = members) {
  installRouterRequestShim();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(authResponse(activeHostAuth))
    .mockResolvedValueOnce(memberListResponse(initialMembers))
    .mockResolvedValueOnce(invitationListResponse());

  for (const response of extraResponses) {
    fetchMock.mockResolvedValueOnce(response);
  }

  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString() === "/api/bff/__internal/client-contract-status") {
      return Promise.resolve(new Response(JSON.stringify({
        schemaVersion: 1,
        supportedHostClientContracts: ["v3"],
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }));
    }
    return fetchMock(input, init);
  }));
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: "/clubs/:clubSlug/app/host/members",
        element: <HostMembersPage />,
        loader: hostMembersLoaderFactory(queryClient),
        hydrateFallbackElement: <div>멤버 목록을 불러오는 중</div>,
      },
    ],
    { initialEntries: ["/clubs/reading-sai/app/host/members"] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  cleanup();
  __resetHostClientContractCapabilityForTest();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function membersTabPanel(name: string) {
  return within(screen.getByRole("tabpanel", { name }));
}

function memberLedgerRow(name: string) {
  return within(screen.getByText(name).closest("tr") as HTMLElement);
}

function pendingZone() {
  return within(screen.getByRole("region", { name: "가입 승인 대기" }));
}

async function findPendingZone() {
  return within(await screen.findByRole("region", { name: "가입 승인 대기" }));
}

async function openMemberOverflow(user: ReturnType<typeof userEvent.setup>, row: ReturnType<typeof within>) {
  await user.click(row.getByRole("button", { name: "멤버 관리 메뉴" }));
}

describe("HostMembersPage", () => {
  it("loads the host member hub and renders lifecycle tabs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    const fetchMock = renderHostMembersPage();

    expect(await screen.findByRole("tab", { name: "활성 멤버" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "쉬는 중" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "탈퇴/비활성" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "둘러보기 멤버" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "초대" })).not.toBeInTheDocument();
    expect(screen.getByText("멤버1")).toBeInTheDocument();
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("활동 2명 · 둘러보기 1명 · 쉬는 중 1명");
    expect(screen.getByLabelText("멤버 운영 요약")).not.toHaveTextContent("이번 모임");
    expect(memberLedgerRow("멤버1").getByText("이번 모임 참여")).toBeInTheDocument();
    expect(memberLedgerRow("새").getByText("이번 모임 미포함")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "가입 승인 대기" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "초대" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/members?limit=50&clubSlug=reading-sai", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/invitations?limit=50&clubSlug=reading-sai", expect.objectContaining({ cache: "no-store" }));
  });

  it("renders each member row with identity, status, and current-session state", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    const user = userEvent.setup();
    renderHostMembersPage();

    const activeRowElement = (await screen.findByText("멤버1")).closest("tr") as HTMLElement;
    const activeRow = within(activeRowElement);
    expect(activeRow.getByRole("heading", { name: "멤버1" })).toBeInTheDocument();
    expect(activeRowElement.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );
    expect(activeRowElement.querySelector(".rm-avatar-chip")).toHaveClass("rm-avatar-chip--artwork");
    expect(activeRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(activeRow.queryByText("@멤버1")).not.toBeInTheDocument();
    expect(activeRow.queryByText(/active@example.com/)).not.toBeInTheDocument();
    expect(activeRow.getByText("활동")).toBeInTheDocument();
    expect(activeRow.getByText("4개월")).toHaveClass("mono");
    expect(activeRow.getByText("최근 접속 2026.08.29 10:02")).toBeInTheDocument();
    expect(activeRow.getByText("이번 모임 참여")).toBeInTheDocument();
    expect(activeRowElement).toHaveClass("rm-host-member-ledger__row");
    const ledgerCss = readFileSync(path.resolve("features/host/ui/members/member-ledger.css"), "utf8");
    expect(ledgerCss).toMatch(/\.rm-host-member-ledger__row\s*\{[^}]*min-height:\s*44px/s);

    const outsideRowElement = screen.getByText("새").closest("tr") as HTMLElement;
    const outsideRow = within(outsideRowElement);
    expect(outsideRowElement.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(outsideRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(outsideRow.queryByText("@새")).not.toBeInTheDocument();
    expect(outsideRow.getByText("이번 모임 미포함")).toBeInTheDocument();
    expect(outsideRow.getByText("접속 기록 없음")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "쉬는 중" }));
    const suspendedRowElement = screen.getByText("정").closest("tr") as HTMLElement;
    const suspendedRow = within(suspendedRowElement);
    expect(suspendedRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(suspendedRow.queryByText("@정")).not.toBeInTheDocument();
    expect(suspendedRow.getByText("쉬는 중")).toBeInTheDocument();
    expect(suspendedRow.getByText("4개월")).toHaveClass("mono");
    expect(suspendedRow.getByText("이번 모임 제외")).toBeInTheDocument();

    const pendingArticle = pendingZone().getByText("둘").closest("article") as HTMLElement;
    expect(pendingArticle.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(pendingArticle.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(screen.getByText("승인·거절은 멤버에게 알림이 갑니다")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "탈퇴/비활성" }));
    const inactiveRowElement = screen.getByText("탈").closest("tr") as HTMLElement;
    const inactiveRow = within(inactiveRowElement);
    expect(inactiveRowElement.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(inactiveRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(inactiveRow.getByText("탈퇴")).toBeInTheDocument();
    expect(inactiveRow.getByText("4개월")).toHaveClass("mono");
    expect(inactiveRow.getByText("기록 보존")).toBeInTheDocument();
    expect(inactiveRow.getAllByText("기록 보존")).toHaveLength(1);
    expect(inactiveRow.queryByText("이번 모임 제외")).not.toBeInTheDocument();
    expect(inactiveRow.queryByText("이번 모임 미포함")).not.toBeInTheDocument();
    expect(inactiveRow.getByRole("button", { name: "이름 변경" })).toBeInTheDocument();
  });

  it("opens the profile edit dialog for a member display name", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    expect(row.queryByText("@멤버1")).not.toBeInTheDocument();
    expect(row.queryByText("안멤버1")).not.toBeInTheDocument();
    await user.click(row.getByRole("button", { name: "이름 변경" }));

    const dialog = screen.getByRole("dialog", { name: "멤버1 이름 수정" });
    expect(within(dialog).getByLabelText("이름")).toHaveValue("멤버1");
    expect(within(dialog).getByRole("button", { name: "이름 저장" })).toBeInTheDocument();
  });

  it("saves a trimmed member display name through the host profile API and replaces only that row", async () => {
    const user = userEvent.setup();
    const updated = { ...members[0], displayName: "새이름", accountName: "안멤버1" } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([memberListItemResponse(updated)]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    const input = dialog.getByLabelText("이름");
    await user.clear(input);
    await user.type(input, "  새이름  ");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/bff/api/host/members/membership-active/profile?clubSlug=reading-sai",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ displayName: "새이름" }),
        }),
      );
    });
    expect(await screen.findByText("새이름")).toBeInTheDocument();
    expect(screen.queryByText("멤버1")).not.toBeInTheDocument();
    expect(screen.getByText("새")).toBeInTheDocument();
  });

  it("locks lifecycle controls for the same row while profile save is pending", async () => {
    const user = userEvent.setup();
    const profileUpdate = deferred<Response>();
    renderHostMembersPage([profileUpdate.promise]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "새이름");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    expect(row.getByRole("button", { name: "멤버 관리 메뉴" })).toBeDisabled();
    expect(row.getByRole("button", { name: "모임 제외" })).toBeDisabled();
    expect(row.getByRole("button", { name: "이름 변경" })).toBeDisabled();
    expect(row.getByRole("button", { name: "멤버 관리 메뉴" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getByRole("button", { name: "모임 제외" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getByRole("button", { name: "이름 변경" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(3);

    await act(async () => {
      profileUpdate.resolve(memberListItemResponse({ ...members[0], displayName: "새이름" }));
      await profileUpdate.promise;
    });
  });

  it("blocks profile editing for a row while a lifecycle action is pending", async () => {
    const user = userEvent.setup();
    const removal = deferred<Response>();
    renderHostMembersPage([removal.promise]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "모임 제외" }));

    const editButton = row.getByRole("button", { name: "이름 변경" });
    expect(editButton).toBeDisabled();
    expect(editButton).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(3);

    await user.click(editButton);
    expect(screen.queryByRole("dialog", { name: "멤버1 이름 수정" })).not.toBeInTheDocument();

    await act(async () => {
      removal.resolve(lifecycleResponse({ ...members[0], currentSessionParticipationStatus: "REMOVED" }));
      await removal.promise;
    });
  });

  it.each([
    ["DISPLAY_NAME_DUPLICATE", "같은 클럽에서 이미 쓰고 있는 이름입니다."],
    ["DISPLAY_NAME_REQUIRED", "이름을 입력해 주세요."],
    ["DISPLAY_NAME_TOO_LONG", "이름은 20자 이하로 입력해 주세요."],
    ["DISPLAY_NAME_INVALID", "이름으로 쓸 수 없는 형식입니다."],
    ["DISPLAY_NAME_RESERVED", "시스템에서 쓰는 이름은 사용할 수 없습니다."],
  ])("shows the %s host profile validation error near the edit field", async (code, message) => {
    const user = userEvent.setup();
    renderHostMembersPage([
      new Response(JSON.stringify({ code, message: "raw server detail" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    ]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "새이름");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    expect(await dialog.findByText(message)).toBeInTheDocument();
    expect(dialog.queryByText("raw server detail")).not.toBeInTheDocument();
  });

  it.each([
    [403, { code: "HOST_ROLE_REQUIRED" }],
    [404, { code: "MEMBER_NOT_FOUND" }],
    [400, { code: "MEMBERSHIP_NOT_ALLOWED" }],
  ])("shows a not-editable message for host profile error %s %o", async (status, body) => {
    const user = userEvent.setup();
    renderHostMembersPage([
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "새이름");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    expect(await dialog.findByText("수정할 수 없는 멤버입니다.")).toBeInTheDocument();
  });

  it("ignores duplicate profile submits while the row has any pending action", async () => {
    const user = userEvent.setup();
    const profileUpdate = deferred<Response>();
    const fetchMock = renderHostMembersPage([profileUpdate.promise]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "새이름");
    await user.dblClick(dialog.getByRole("button", { name: "이름 저장" }));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(dialog.getByRole("button", { name: "이름 저장" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "이름 저장" })).toHaveTextContent("저장 중");

    await act(async () => {
      profileUpdate.resolve(memberListItemResponse({ ...members[0], displayName: "새이름" }));
      await profileUpdate.promise;
    });
  });

  it("keeps the member tab header and body on shared spacing classes", async () => {
    renderHostMembersPage();

    expect(await screen.findByRole("tab", { name: "활성 멤버" })).toBeInTheDocument();

    const page = document.querySelector("main.rm-host-members-page");
    const headerEyebrow = document.querySelector(".page-header-compact .eyebrow");
    const contentContainer = document.querySelector("main > section.container") as HTMLElement | null;
    expect(page).not.toBeNull();
    expect(page).toHaveClass("rm-host-editorial-ledger");
    expect(page).toHaveClass("rm-host-editorial-ledger--context");
    expect(headerEyebrow?.tagName).toBe("DIV");
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveClass("rm-host-members-page__body");
    expect(contentContainer?.style.paddingTop).toBe("");
    expect(contentContainer?.style.paddingBottom).toBe("");
    expect(contentContainer?.style.paddingLeft).toBe("");
    expect(contentContainer?.style.paddingRight).toBe("");
    expect(screen.getByRole("heading", { level: 1, name: "멤버 관리" })).toHaveClass(
      "rm-host-editorial-ledger__heading",
    );
    expect(page?.querySelector(".page-header-compact")?.querySelectorAll("[style]")).toHaveLength(0);
    const css = readFileSync(path.resolve("features/host/ui/host-editorial-ledger.css"), "utf8");
    expect(css).not.toContain(".rm-host-editorial-ledger :is(a.btn, button.btn)");
  });

  it("labels viewer members as browsing members instead of approval pending", async () => {
    renderHostMembersPage();

    const summary = await screen.findByLabelText("멤버 운영 요약");
    expect(summary).toHaveTextContent("활동 2명 · 둘러보기 1명 · 쉬는 중 1명");
    expect(summary).not.toHaveTextContent("승인 대기");

    const viewer = within((await findPendingZone()).getByText("둘").closest("article") as HTMLElement);
    expect(viewer.getByText("viewer@example.com · 둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
    expect(screen.queryByText("승인 대기")).not.toBeInTheDocument();
    expect(screen.getByText("승인·거절은 멤버에게 알림이 갑니다")).toBeInTheDocument();
  });

  it("supports keyboard selection in the member management tablist", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const activeTab = await screen.findByRole("tab", { name: "활성 멤버" });
    const suspendedTab = screen.getByRole("tab", { name: "쉬는 중" });
    const inactiveTab = screen.getByRole("tab", { name: "탈퇴/비활성" });

    activeTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(suspendedTab).toHaveFocus());
    expect(suspendedTab).toHaveAttribute("aria-selected", "true");
    expect(membersTabPanel("쉬는 중").getByText("정")).toBeInTheDocument();

    await user.keyboard("{End}");
    await waitFor(() => expect(inactiveTab).toHaveFocus());
    expect(inactiveTab).toHaveAttribute("aria-selected", "true");
    expect(membersTabPanel("탈퇴/비활성").getByText("탈")).toBeInTheDocument();

    await user.keyboard("{Home}");
    await waitFor(() => expect(activeTab).toHaveFocus());
    expect(activeTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(inactiveTab).toHaveFocus());
    expect(inactiveTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders viewer registration dates with app date formatting", async () => {
    renderHostMembersPage();

    const zone = await findPendingZone();
    expect(zone.getByText("둘")).toBeInTheDocument();
    expect(zone.getByText("viewer@example.com · 둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
  });

  it("syncs local member rows when loader data changes", () => {
    const replacement = {
      ...members[4],
      displayName: "갱신 멤버",
      email: "updated@example.com",
    } satisfies HostMemberListItem;
    const { rerender } = render(<HostMembersForTest initialMembers={[members[0]]} />);

    expect(screen.getByText("멤버1")).toBeInTheDocument();

    rerender(<HostMembersForTest initialMembers={[replacement]} />);

    expect(screen.queryByText("멤버1")).not.toBeInTheDocument();
    expect(screen.getByText("갱신 멤버")).toBeInTheDocument();
  });

  it("loads the next member page and appends it", async () => {
    const user = userEvent.setup();
    const nextMember = {
      ...members[0],
      membershipId: "membership-next",
      userId: "user-next",
      email: "next-member@example.com",
      displayName: "다음 멤버",
    } satisfies HostMemberListItem;
    const actions = {
      ...noopHostMembersActions,
      loadMembers: vi.fn(async () => ({ items: [nextMember], nextCursor: null })),
      refreshMembers: vi.fn(async () => ({ items: [], nextCursor: null })),
    } satisfies HostMembersActions;

    render(
      <HostMembersForTest
        initialMembers={{ items: [members[0]], nextCursor: "cursor-1" }}
        actions={actions}
      />,
    );

    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(actions.loadMembers).toHaveBeenCalledWith({ limit: 50, cursor: "cursor-1" });
    expect(await screen.findByText("다음 멤버")).toBeInTheDocument();
    expect(screen.getByText("멤버1")).toBeInTheDocument();
  });

  it("shows a refresh warning when viewer activation succeeds but action-owned refresh fails", async () => {
    const user = userEvent.setup();
    const activateViewer = {
      ...members[1],
      canDeactivate: true,
    } satisfies HostMemberListItem;
    const actions = {
      ...noopHostMembersActions,
      submitViewerAction: vi.fn(async () => activateViewer),
      refreshMembers: vi.fn(async () => {
        throw new Error("refresh failed");
      }),
    } satisfies HostMembersActions;
    render(<HostMembersForTest initialMembers={[activateViewer]} actions={actions} />);

    await user.click((await findPendingZone()).getByRole("button", { name: "승인" }));

    expect(actions.submitViewerAction).toHaveBeenCalledWith(activateViewer.membershipId, "activate");
    expect(actions.refreshMembers).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다.",
    );
  });

  it("keeps load-more pagination on the route action URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(memberListResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();

    await createHostMembersActions(client, hostContext).loadMembers({ limit: 50, cursor: "cursor-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members?limit=50&cursor=cursor-1&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps each viewer row locked while multiple viewer actions are in flight", async () => {
    const user = userEvent.setup();
    const secondPending = {
      ...members[1],
      membershipId: "membership-pending-2",
      userId: "user-pending-2",
      email: "second-request@example.com",
      displayName: "두번째 둘러보기",
      accountName: "두번째 둘러보기",
      createdAt: "2026-04-21T12:00:00Z",
    } satisfies HostMemberListItem;
    const firstApproval = deferred<Response>();
    const secondApproval = deferred<Response>();
    const approvedMember = {
      ...members[1],
      status: "ACTIVE",
      joinedAt: "2026-04-22T12:00:00Z",
      currentSessionParticipationStatus: "ACTIVE",
      canSuspend: true,
      canDeactivate: true,
      canRemoveFromCurrentSession: true,
    } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage(
      [
        firstApproval.promise,
        secondApproval.promise,
        memberListResponse([approvedMember]),
        memberListResponse([]),
      ],
      [members[1], secondPending],
    );

    const zone = await findPendingZone();
    const firstRow = within(zone.getByText("둘").closest("article") as HTMLElement);
    const secondRow = within(zone.getByText("두번째 둘러보기").closest("article") as HTMLElement);

    await user.click(firstRow.getByRole("button", { name: "승인" }));

    expect(firstRow.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "승인" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getByRole("button", { name: "거절" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "거절" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(2);
    expect(secondRow.getByRole("button", { name: "승인" })).toBeEnabled();
    expect(secondRow.getByRole("button", { name: "거절" })).toBeEnabled();

    await user.click(secondRow.getByRole("button", { name: "승인" }));

    expect(firstRow.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "거절" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "승인" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(secondRow.getByRole("button", { name: "거절" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "거절" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(secondRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await user.click(firstRow.getByRole("button", { name: "거절" }));
    expect(fetchMock).toHaveBeenCalledTimes(5);

    firstApproval.resolve(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    secondApproval.resolve(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByText("정식 멤버로 전환했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
  });

  it("explains disabled viewer and suspended actions from capability flags", async () => {
    const user = userEvent.setup();
    const lockedViewer = {
      ...members[1],
      canDeactivate: false,
    } satisfies HostMemberListItem;
    const lockedSuspended = {
      ...members[2],
      canRestore: false,
    } satisfies HostMemberListItem;
    renderHostMembersPage([], [lockedViewer, lockedSuspended]);

    const viewerRow = within((await findPendingZone()).getByText("둘").closest("article") as HTMLElement);
    const activateButton = viewerRow.getByRole("button", { name: "승인" });
    const deactivateButton = viewerRow.getByRole("button", { name: "거절" });

    expect(activateButton).toBeEnabled();
    expect(deactivateButton).toBeDisabled();
    expect(deactivateButton).toHaveAccessibleDescription("이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.");
    expect(viewerRow.getByText("이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "쉬는 중" }));
    const suspendedRow = within(screen.getByText("정").closest("tr") as HTMLElement);
    const restoreButton = suspendedRow.getByRole("button", { name: "복구" });

    expect(restoreButton).toBeDisabled();
    expect(restoreButton).toHaveAccessibleDescription("이 멤버는 현재 정책상 복구할 수 없습니다.");
    expect(suspendedRow.getByText("이 멤버는 현재 정책상 복구할 수 없습니다.")).toBeInTheDocument();
  });

  it("refreshes the hub after activating a viewer member", async () => {
    const user = userEvent.setup();
    const approvedMember = {
      ...members[1],
      status: "ACTIVE",
      joinedAt: "2026-04-22T12:00:00Z",
      currentSessionParticipationStatus: "ACTIVE",
      canSuspend: true,
      canDeactivate: true,
      canRemoveFromCurrentSession: true,
    } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([
      new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      memberListResponse(members.map((member) => (member.membershipId === approvedMember.membershipId ? approvedMember : member))),
    ]);

    await user.click((await findPendingZone()).getByRole("button", { name: "승인" }));

    expect(await screen.findByText("정식 멤버로 전환했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members/membership-pending/activate?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: "활성 멤버" }));
    expect(screen.getByText("둘")).toBeInTheDocument();
  });

  it("keeps local viewer removals independent from refresh response ordering", async () => {
    const user = userEvent.setup();
    const secondPending = {
      ...members[1],
      membershipId: "membership-pending-2",
      userId: "user-pending-2",
      email: "second-request@example.com",
      displayName: "두번째 둘러보기",
      accountName: "두번째 둘러보기",
      createdAt: "2026-04-21T12:00:00Z",
    } satisfies HostMemberListItem;
    const initialPendingMembers = [members[1], secondPending];
    const staleRefresh = deferred<Response>();
    const latestRefresh = deferred<Response>();
    const fetchMock = renderHostMembersPage(
      [
        new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
        staleRefresh.promise,
        new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
        latestRefresh.promise,
      ],
      initialPendingMembers,
    );

    await user.click(
      within((await findPendingZone()).getByText("둘").closest("article") as HTMLElement).getByRole("button", {
        name: "승인",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    await user.click(
      within((await findPendingZone()).getByText("두번째 둘러보기").closest("article") as HTMLElement).getByRole(
        "button",
        {
          name: "승인",
        },
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));

    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();

    await act(async () => {
      latestRefresh.resolve(memberListResponse([]));
      await latestRefresh.promise;
      await Promise.resolve();
    });

    await act(async () => {
      staleRefresh.resolve(memberListResponse(initialPendingMembers));
      await staleRefresh.promise;
      await Promise.resolve();
    });

    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(screen.queryByText("둘")).not.toBeInTheDocument();
    expect(screen.queryByText("두번째 둘러보기")).not.toBeInTheDocument();
  });

  it("refreshes the hub after deactivating a viewer member", async () => {
    const user = userEvent.setup();
    const rejectedMember = {
      ...members[1],
      status: "INACTIVE",
    } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([
      new Response(JSON.stringify({ status: "INACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      memberListResponse(members.map((member) => (member.membershipId === rejectedMember.membershipId ? rejectedMember : member))),
    ]);

    await user.click((await findPendingZone()).getByRole("button", { name: "거절" }));

    expect(await screen.findByText("둘러보기 멤버를 해제했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members/membership-pending/deactivate-viewer?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: "탈퇴/비활성" }));
    expect(screen.getByText("둘")).toBeInTheDocument();
    const inactiveViewerRow = within(screen.getByText("둘").closest("tr") as HTMLElement);
    expect(inactiveViewerRow.getByText("기록 보존")).toBeInTheDocument();
    expect(inactiveViewerRow.queryByText("이번 모임 미포함")).not.toBeInTheDocument();
  });

  it("removes the viewer row locally when activation succeeds but list refresh fails", async () => {
    const user = userEvent.setup();
    const fetchMock = renderHostMembersPage([
      new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify({ message: "refresh failed" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    ]);

    await user.click((await findPendingZone()).getByRole("button", { name: "승인" }));

    expect(await screen.findByText("처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다. 새로고침해서 최신 상태를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(screen.queryByText("정식 멤버 전환에 실패했습니다.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows active member lifecycle actions and opens the suspend policy dialog", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = (await screen.findByText("멤버1")).closest("tr");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    expect(activeRow.getByRole("button", { name: "모임 제외" })).toBeEnabled();
    expect(activeRow.queryByRole("button", { name: "정지" })).not.toBeInTheDocument();
    expect(activeRow.queryByRole("button", { name: "탈퇴 처리" })).not.toBeInTheDocument();

    await openMemberOverflow(user, activeRow);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "정지" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "탈퇴 처리" })).toBeEnabled();
    await user.click(within(menu).getByRole("menuitem", { name: "정지" }));

    const dialog = screen.getByRole("dialog", { name: "멤버1님을 정지할까요?" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/멤버1 님을 쉬는 멤버로 전환합니다/)).toBeInTheDocument();
    expect(within(dialog).getByText(/참석 기록은 보존되고, 내보낸 뒤 개인 정보는 익명화됩니다/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "이번 모임부터 바로 정지" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "다음 모임부터 정지" })).toBeInTheDocument();
  });

  it("keeps host lifecycle actions disabled without host-only helper copy", async () => {
    const user = userEvent.setup();
    const hostMember = {
      ...members[0],
      membershipId: "membership-host",
      userId: "user-host",
      email: "host@example.com",
      displayName: "호스트 멤버",
      accountName: "김호스트",
      role: "HOST",
      canSuspend: false,
      canDeactivate: false,
      canRemoveFromCurrentSession: false,
    } satisfies HostMemberListItem;
    renderHostMembersPage([], [hostMember]);

    const row = (await screen.findByText("호스트 멤버")).closest("tr");
    expect(row).not.toBeNull();
    const hostRow = within(row as HTMLElement);
    await openMemberOverflow(user, hostRow);
    const menu = within(screen.getByRole("menu"));
    const suspendButton = menu.getByRole("menuitem", { name: "정지" });
    const deactivateButton = menu.getByRole("menuitem", { name: "탈퇴 처리" });

    expect(suspendButton).toBeDisabled();
    expect(suspendButton).not.toHaveAccessibleDescription();
    expect(deactivateButton).toBeDisabled();
    expect(deactivateButton).not.toHaveAccessibleDescription();
    expect(hostRow.queryByText(/호스트는 .* 수 없습니다/)).not.toBeInTheDocument();
  });

  it("manages lifecycle dialog focus and returns focus after Escape", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = (await screen.findByText("멤버1")).closest("tr");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    const overflowButton = activeRow.getByRole("button", { name: "멤버 관리 메뉴" });
    await user.click(overflowButton);
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "정지" }));

    const dialog = screen.getByRole("dialog", { name: "멤버1님을 정지할까요?" });
    const dialogView = within(dialog);
    const cancelButton = dialogView.getByRole("button", { name: "취소" });
    const confirmButton = dialogView.getByRole("button", { name: "정지" });
    const applyNowRadio = dialogView.getByRole("radio", { name: "이번 모임부터 바로 정지" });

    expect(cancelButton).toHaveFocus();

    await user.tab();
    expect(confirmButton).toHaveFocus();

    await user.tab();
    expect(applyNowRadio).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "멤버1님을 정지할까요?" })).not.toBeInTheDocument();
    expect(overflowButton).toHaveFocus();
  });

  it("confirms suspend with the selected current-session policy", async () => {
    const user = userEvent.setup();
    const suspended = { ...members[0], status: "SUSPENDED", canSuspend: false, canRestore: true } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([lifecycleResponse(suspended)]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await openMemberOverflow(user, row);
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "정지" }));
    await user.click(within(screen.getByRole("dialog", { name: "멤버1님을 정지할까요?" })).getByRole("button", { name: "정지" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/members/membership-active/suspend?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentSessionPolicy: "APPLY_NOW" }),
      }),
    );
  });

  it("restores suspended members", async () => {
    const user = userEvent.setup();
    const restored = { ...members[2], status: "ACTIVE", canRestore: false, canSuspend: true } satisfies HostMemberListItem;
    const restore = deferred<Response>();
    const fetchMock = renderHostMembersPage([restore.promise]);

    await user.click(await screen.findByRole("tab", { name: "쉬는 중" }));
    const suspendedRow = within(screen.getByText("정").closest("tr") as HTMLElement);
    await user.click(suspendedRow.getByRole("button", { name: "복구" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/members/membership-suspended/restore?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(suspendedRow.getByRole("button", { name: "복구" })).toBeDisabled();
    expect(suspendedRow.getByRole("button", { name: "복구" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(suspendedRow.getByRole("button", { name: "멤버 관리 메뉴" })).toBeDisabled();
    expect(suspendedRow.getByRole("button", { name: "멤버 관리 메뉴" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");

    await act(async () => {
      restore.resolve(lifecycleResponse(restored));
      await restore.promise;
    });
  });

  it("adds and removes members from the current session", async () => {
    const user = userEvent.setup();
    const removed = { ...members[0], currentSessionParticipationStatus: "REMOVED", canAddToCurrentSession: true, canRemoveFromCurrentSession: false } satisfies HostMemberListItem;
    const added = { ...members[4], currentSessionParticipationStatus: "ACTIVE", canAddToCurrentSession: false, canRemoveFromCurrentSession: true } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([lifecycleResponse(removed), lifecycleResponse(added)]);

    let row = (await screen.findByText("멤버1")).closest("tr");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "모임 제외" }));

    row = screen.getByText("새").closest("tr");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "이번 모임 추가" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members/membership-active/current-session/remove?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/bff/api/host/members/membership-not-session/current-session/add?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("locks all lifecycle controls in a row while a current-session action is in flight", async () => {
    const user = userEvent.setup();
    const removal = deferred<Response>();
    const removed = {
      ...members[0],
      currentSessionParticipationStatus: "REMOVED",
      canAddToCurrentSession: true,
      canRemoveFromCurrentSession: false,
    } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([removal.promise]);

    const row = (await screen.findByText("멤버1")).closest("tr");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);

    await user.click(activeRow.getByRole("button", { name: "모임 제외" }));

    expect(activeRow.getByRole("button", { name: "멤버 관리 메뉴" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "모임 제외" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "이름 변경" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "멤버 관리 메뉴" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getByRole("button", { name: "모임 제외" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getByRole("button", { name: "이름 변경" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(3);

    await user.click(activeRow.getByRole("button", { name: "멤버 관리 메뉴" }));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await act(async () => {
      removal.resolve(lifecycleResponse(removed));
      await removal.promise;
    });
  });

  it("keeps the current-session label aligned with participation status when removal is disabled", async () => {
    const lockedParticipant = {
      ...members[0],
      membershipId: "membership-locked-participant",
      userId: "user-locked-participant",
      email: "locked@example.com",
      displayName: "제외 불가 멤버",
      currentSessionParticipationStatus: "ACTIVE",
      canAddToCurrentSession: false,
      canRemoveFromCurrentSession: false,
    } satisfies HostMemberListItem;
    renderHostMembersPage([], [lockedParticipant]);

    const row = (await screen.findByText("제외 불가 멤버")).closest("tr");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    expect(activeRow.getByText("이번 모임 참여")).toBeInTheDocument();
    expect(activeRow.getByRole("button", { name: "모임 제외" })).toBeDisabled();
    expect(activeRow.queryByRole("button", { name: "이번 모임 추가" })).not.toBeInTheDocument();
  });

  it("seeds the host members list through the route loader", async () => {
    const fetchMock = renderHostMembersPage();

    expect(await screen.findByText("멤버1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("refreshes the Query-backed list after a member profile update", async () => {
    const user = userEvent.setup();
    const updated = { ...members[0], displayName: "갱신된 이름" } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([
      memberListItemResponse(updated),
      memberListResponse(members.map((m) => (m.membershipId === updated.membershipId ? updated : m))),
    ]);

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "갱신된 이름");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    expect(await screen.findByText("갱신된 이름")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members/membership-active/profile?clubSlug=reading-sai",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows the refreshed invitation row after create instead of keeping an empty ledger", async () => {
    const user = userEvent.setup();
    const created: HostInvitationListItem = {
      invitationId: "invite-new",
      email: "new@example.com",
      name: "새멤버",
      role: "MEMBER",
      status: "PENDING",
      effectiveStatus: "PENDING",
      expiresAt: "2026-05-20T12:00:00Z",
      acceptedAt: null,
      createdAt: "2026-04-20T12:00:00Z",
      canRevoke: true,
      canReissue: true,
      applyToCurrentSession: true,
    };
    const invitationActions = {
      ...noopHostInvitationsActions,
      createInvitation: vi.fn(async () => new Response(JSON.stringify(created), { status: 201 })),
      refreshInvitations: vi.fn(async () => ({ items: [created], nextCursor: null })),
    };

    render(
      <HostMembersForTest
        initialMembers={[members[0]]}
        initialInvitations={[]}
        invitationActions={invitationActions}
      />,
    );

    await user.type(screen.getByLabelText("이름"), "새멤버");
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "초대 보내기" }));

    const invitations = screen.getByRole("region", { name: "초대" });
    expect(await within(invitations).findByText("새멤버")).toBeInTheDocument();
    expect(invitationActions.refreshInvitations).toHaveBeenCalledWith({ limit: 50 });
  });

  it("publishes no invitation row or success copy when the registered host-members owner becomes obsolete", async () => {
    const user = userEvent.setup();
    const created: HostInvitationListItem = {
      invitationId: "invite-obsolete",
      email: "obsolete@example.com",
      name: "사라진 소유자",
      role: "MEMBER",
      status: "PENDING",
      effectiveStatus: "PENDING",
      expiresAt: "2026-09-20T12:00:00Z",
      acceptedAt: null,
      createdAt: "2026-08-31T00:00:00Z",
      canRevoke: true,
      canReissue: true,
      applyToCurrentSession: true,
    };
    const publishUi = vi.fn(() => "rejected" as const);
    const createInvitation = vi.fn(async () => ({
      created,
      refreshed: { items: [created], nextCursor: null },
      publishUi,
    }));
    const registeredActions: RegisteredHostInvitationsActions = {
      listInvitations: noopHostInvitationsActions.listInvitations,
      parseInvitationList: noopHostInvitationsActions.parseInvitationList,
      createInvitation,
      revokeInvitation: vi.fn(),
    };

    render(
      <HostMembers
        initialMembers={[members[0]]}
        initialInvitations={[]}
        actions={noopHostMembersActions}
        invitationActions={registeredActions}
      />,
    );

    await user.type(screen.getByLabelText("이름"), "사라진 소유자");
    await user.type(screen.getByLabelText("초대 이메일"), "obsolete@example.com");
    await user.click(screen.getByRole("button", { name: "초대 보내기" }));

    const invitationRegion = screen.getByRole("region", { name: "초대" });
    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(publishUi).toHaveBeenCalledTimes(1);
    expect(within(invitationRegion).queryByText("사라진 소유자")).not.toBeInTheDocument();
    expect(within(invitationRegion).queryByText("초대를 보냈습니다.")).not.toBeInTheDocument();
  });
});
