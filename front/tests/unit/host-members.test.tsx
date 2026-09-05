import { readFileSync } from "node:fs";
import path from "node:path";
import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import HostMembers from "@/features/host/ui/host-members";
import { createHostMembersActions, hostMembersLoaderFactory } from "@/features/host";
import HostMembersPage from "@/src/pages/host-members";
import type { HostMemberListItem } from "@/features/host/api/host-contracts";
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

type HostMembersProps = Parameters<typeof HostMembers>[0];

function HostMembersForTest({
  actions,
  initialMembers,
  ...props
}: Omit<HostMembersProps, "actions"> & {
  actions?: HostMembersActions;
}) {
  return (
    <HostMembers
      {...props}
      initialMembers={initialMembers}
      actions={actions ?? noopHostMembersActions}
    />
  );
}

function lifecycleResponse(member: HostMemberListItem) {
  return new Response(JSON.stringify({ member, currentSessionPolicyResult: "APPLIED" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function memberListResponse(items: HostMemberListItem[]) {
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
    .mockResolvedValueOnce(memberListResponse(initialMembers));

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

async function revealPendingRowActions(
  user: ReturnType<typeof userEvent.setup>,
  row: ReturnType<typeof within>,
) {
  if (row.queryByRole("button", { name: "거절" })) {
    return;
  }
  await user.click(row.getByRole("button", { name: "검토" }));
}

describe("HostMembersPage", () => {
  it("loads the host member hub and renders lifecycle tabs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    const fetchMock = renderHostMembersPage();

    expect(await screen.findByRole("searchbox", { name: /이름/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /전체/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "가입 승인 검토" })).toBeVisible();
    expect(screen.getByRole("button", { name: "검토" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "거절" })).not.toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /활동/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /쉬는 중/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "탈퇴/비활성" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "둘러보기 멤버" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "초대" })).not.toBeInTheDocument();
    expect(screen.getByText("멤버1")).toBeInTheDocument();
    expect(memberLedgerRow("멤버1").queryByText("이번 모임 참여")).not.toBeInTheDocument();
    expect(memberLedgerRow("멤버1").getByRole("link", { name: "열기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 제외" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "가입 승인 대기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "초대와 설정 열기 ›" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/settings",
    );
    expect(screen.queryByRole("region", { name: "초대" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/members?limit=50&clubSlug=reading-sai", expect.objectContaining({ cache: "no-store" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/host/invitations?limit=50&clubSlug=reading-sai", expect.anything());
  });

  it("sends people invitation work to club-scoped 초대와 설정", async () => {
    const fetchMock = renderHostMembersPage();

    expect(await screen.findByRole("link", { name: "초대와 설정 열기 ›" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/settings",
    );
    expect(screen.queryByRole("region", { name: "초대" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/bff/api/host/invitations?limit=50&clubSlug=reading-sai",
      expect.anything(),
    );
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
    expect(activeRow.queryByText("이번 모임 참여")).not.toBeInTheDocument();
    expect(activeRow.getAllByText("—").length).toBeGreaterThan(0);
    expect(activeRow.getByRole("link", { name: "열기" })).toBeInTheDocument();
    expect(activeRowElement).toHaveClass("rm-host-member-ledger__row");
    const ledgerCss = readFileSync(path.resolve("features/host/ui/members/member-ledger.css"), "utf8");
    expect(ledgerCss).toMatch(/\.rm-host-member-ledger__row\s*\{[^}]*min-height:\s*62px/s);

    const outsideRowElement = screen.getByText("새").closest("tr") as HTMLElement;
    const outsideRow = within(outsideRowElement);
    expect(outsideRowElement.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(outsideRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(outsideRow.queryByText("@새")).not.toBeInTheDocument();
    expect(outsideRow.queryByText("이번 모임 미포함")).not.toBeInTheDocument();
    expect(outsideRow.getByText("접속 기록 없음")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /쉬는 중/ }));
    const suspendedRowElement = screen.getByText("정").closest("tr") as HTMLElement;
    const suspendedRow = within(suspendedRowElement);
    expect(suspendedRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(suspendedRow.queryByText("@정")).not.toBeInTheDocument();
    expect(suspendedRow.getByText("쉬는 중")).toBeInTheDocument();
    expect(suspendedRow.getByText("4개월")).toHaveClass("mono");
    expect(suspendedRow.queryByText("이번 모임 제외")).not.toBeInTheDocument();
    expect(suspendedRow.getByRole("button", { name: "복구" })).toBeInTheDocument();

    const pendingArticle = pendingZone().getByText("둘").closest("li") as HTMLElement;
    expect(pendingArticle.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(pendingArticle).toHaveClass("rm-member-ledger__pending-row");
    expect(screen.getByText("승인과 거절은 결과 안내를 포함해요.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /전체/ }));
    const inactiveRowElement = screen.getByText("탈").closest("tr") as HTMLElement;
    const inactiveRow = within(inactiveRowElement);
    expect(inactiveRowElement.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect(inactiveRowElement.querySelector(".rm-avatar-chip")).toHaveAttribute("data-avatar-size-role", "member");
    expect(inactiveRow.getByText("탈퇴")).toBeInTheDocument();
    expect(inactiveRow.getByText("4개월")).toHaveClass("mono");
    expect(inactiveRow.queryByText("기록 보존")).not.toBeInTheDocument();
    expect(inactiveRow.queryByText("이번 모임 제외")).not.toBeInTheDocument();
    expect(inactiveRow.queryByText("이번 모임 미포함")).not.toBeInTheDocument();
    expect(inactiveRow.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
  });

  it("does not expose rename, session, or overflow actions on the people ledger", async () => {
    renderHostMembersPage();

    expect(await screen.findByText("멤버1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 제외" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "멤버 관리 메뉴" })).not.toBeInTheDocument();
    expect(screen.queryByText("이번 모임 참여")).not.toBeInTheDocument();
  });

  it("keeps display identity free of account names on the people ledger", async () => {
    renderHostMembersPage();

    const row = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    expect(row.queryByText("@멤버1")).not.toBeInTheDocument();
    expect(row.queryByText("안멤버1")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "멤버1 이름 수정" })).not.toBeInTheDocument();
  });

  it("keeps the member tab header and body on shared spacing classes", async () => {
    renderHostMembersPage();

    expect(await screen.findByRole("tab", { name: /전체/ })).toBeInTheDocument();

    const page = document.querySelector("main.rm-host-members-page");
    const contentContainer = document.querySelector("main > section.container") as HTMLElement | null;
    expect(page).not.toBeNull();
    expect(page).toHaveClass("rm-host-editorial-ledger");
    expect(page).toHaveClass("rm-host-editorial-ledger--context");
    expect(document.querySelector(".page-header-compact .eyebrow")).toBeNull();
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveClass("rm-host-members-page__body");
    expect(contentContainer?.style.paddingTop).toBe("");
    expect(contentContainer?.style.paddingBottom).toBe("");
    expect(contentContainer?.style.paddingLeft).toBe("");
    expect(contentContainer?.style.paddingRight).toBe("");
    expect(screen.getByRole("heading", { level: 1, name: "사람" })).toHaveClass(
      "rm-host-editorial-ledger__heading",
    );
    expect(page?.querySelector(".page-header-compact")?.querySelectorAll("[style]")).toHaveLength(0);
    const css = readFileSync(path.resolve("features/host/ui/host-editorial-ledger.css"), "utf8");
    expect(css).not.toContain(".rm-host-editorial-ledger :is(a.btn, button.btn)");
  });

  it("labels viewer members as browsing members instead of approval pending", async () => {
    renderHostMembersPage();

    expect(await screen.findByRole("tab", { name: /전체/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /활동/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /둘러보기/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /쉬는 중/ })).toBeVisible();

    const viewer = within((await findPendingZone()).getByText("둘").closest("li") as HTMLElement);
    expect(viewer.getByText("둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
    expect(viewer.queryByText("viewer@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("승인 대기")).not.toBeInTheDocument();
    expect(screen.getByText("승인과 거절은 결과 안내를 포함해요.")).toBeInTheDocument();
  });

  it("filters the people ledger from the status chips", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const allTab = await screen.findByRole("tab", { name: /전체/ });
    const statusTabs = screen.getByRole("tablist", { name: "멤버 상태" });
    const activeTab = within(statusTabs).getByRole("tab", { name: /활동/ });
    const suspendedTab = within(statusTabs).getByRole("tab", { name: /쉬는 중/ });

    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(membersTabPanel("전체").getByText("멤버1")).toBeInTheDocument();
    expect(membersTabPanel("전체").getByText("탈")).toBeInTheDocument();

    await user.click(suspendedTab);
    expect(suspendedTab).toHaveAttribute("aria-selected", "true");
    expect(membersTabPanel("쉬는 중").getByText("정")).toBeInTheDocument();
    expect(screen.queryByText("멤버1")).not.toBeInTheDocument();

    await user.click(activeTab);
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(membersTabPanel("활동").getByText("멤버1")).toBeInTheDocument();
    expect(screen.queryByText("정")).not.toBeInTheDocument();
    expect(screen.queryByText("탈")).not.toBeInTheDocument();
  });

  it("renders viewer registration dates with app date formatting", async () => {
    renderHostMembersPage();

    const zone = await findPendingZone();
    expect(zone.getByText("둘")).toBeInTheDocument();
    expect(zone.getByText("둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
    expect(zone.queryByText("viewer@example.com")).not.toBeInTheDocument();
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

    const refreshZone = await findPendingZone();
    await revealPendingRowActions(user, within(refreshZone.getByText("둘").closest("li") as HTMLElement));
    await user.click(refreshZone.getByRole("button", { name: "승인" }));

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
    const firstRow = within(zone.getByText("둘").closest("li") as HTMLElement);
    const secondRow = within(zone.getByText("두번째 둘러보기").closest("li") as HTMLElement);

    await revealPendingRowActions(user, firstRow);
    await user.click(firstRow.getByRole("button", { name: "승인" }));

    expect(firstRow.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "승인" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getByRole("button", { name: "거절" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "거절" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(2);
    expect(secondRow.getByRole("button", { name: "검토" })).toBeEnabled();
    await revealPendingRowActions(user, secondRow);
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
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await user.click(firstRow.getByRole("button", { name: "거절" }));
    expect(fetchMock).toHaveBeenCalledTimes(4);

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

    const viewerRow = within((await findPendingZone()).getByText("둘").closest("li") as HTMLElement);
    await revealPendingRowActions(user, viewerRow);
    const activateButton = viewerRow.getByRole("button", { name: "승인" });
    const deactivateButton = viewerRow.getByRole("button", { name: "거절" });

    expect(activateButton).toBeEnabled();
    expect(deactivateButton).toBeDisabled();
    expect(deactivateButton).toHaveAccessibleDescription("이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.");
    expect(viewerRow.getByText("이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /쉬는 중/ }));
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

    const activateZone = await findPendingZone();
    await revealPendingRowActions(user, within(activateZone.getByText("둘").closest("li") as HTMLElement));
    await user.click(activateZone.getByRole("button", { name: "승인" }));

    expect(await screen.findByText("정식 멤버로 전환했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members/membership-pending/activate?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: /활동/ }));
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

    const firstPending = within((await findPendingZone()).getByText("둘").closest("li") as HTMLElement);
    await revealPendingRowActions(user, firstPending);
    await user.click(firstPending.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    const secondPendingRow = within((await findPendingZone()).getByText("두번째 둘러보기").closest("li") as HTMLElement);
    await revealPendingRowActions(user, secondPendingRow);
    await user.click(secondPendingRow.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

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

    const rejectZone = await findPendingZone();
    await revealPendingRowActions(user, within(rejectZone.getByText("둘").closest("li") as HTMLElement));
    await user.click(rejectZone.getByRole("button", { name: "거절" }));

    expect(await screen.findByText("둘러보기 멤버를 해제했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members/membership-pending/deactivate-viewer?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: /전체/ }));
    expect(screen.getByText("둘")).toBeInTheDocument();
    const inactiveViewerRow = within(screen.getByText("둘").closest("tr") as HTMLElement);
    expect(inactiveViewerRow.queryByText("기록 보존")).not.toBeInTheDocument();
    expect(inactiveViewerRow.queryByText("이번 모임 미포함")).not.toBeInTheDocument();
  });

  it("removes the viewer row locally when activation succeeds but list refresh fails", async () => {
    const user = userEvent.setup();
    const fetchMock = renderHostMembersPage([
      new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify({ message: "refresh failed" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    ]);

    const localActivateZone = await findPendingZone();
    await revealPendingRowActions(user, within(localActivateZone.getByText("둘").closest("li") as HTMLElement));
    await user.click(localActivateZone.getByRole("button", { name: "승인" }));

    expect(await screen.findByText("처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다. 새로고침해서 최신 상태를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "가입 승인 대기" })).not.toBeInTheDocument();
    expect(screen.queryByText("정식 멤버 전환에 실패했습니다.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps restore on suspended rows and leaves other lifecycle actions to person detail", async () => {
    renderHostMembersPage();

    const row = (await screen.findByText("멤버1")).closest("tr");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    expect(activeRow.queryByRole("button", { name: "모임 제외" })).not.toBeInTheDocument();
    expect(activeRow.queryByRole("button", { name: "멤버 관리 메뉴" })).not.toBeInTheDocument();
    expect(activeRow.getByRole("link", { name: "열기" })).toBeInTheDocument();
  });

  it("restores suspended members", async () => {
    const user = userEvent.setup();
    const restored = { ...members[2], status: "ACTIVE", canRestore: false, canSuspend: true } satisfies HostMemberListItem;
    const restore = deferred<Response>();
    const fetchMock = renderHostMembersPage([restore.promise]);

    await user.click(await screen.findByRole("tab", { name: /쉬는 중/ }));
    const suspendedRow = within(screen.getByText("정").closest("tr") as HTMLElement);
    await user.click(suspendedRow.getByRole("button", { name: "복구" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/members/membership-suspended/restore?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
    expect(suspendedRow.getByRole("button", { name: "복구" })).toBeDisabled();
    expect(suspendedRow.getByRole("button", { name: "복구" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(suspendedRow.queryByRole("button", { name: "멤버 관리 메뉴" })).not.toBeInTheDocument();

    await act(async () => {
      restore.resolve(lifecycleResponse(restored));
      await restore.promise;
    });
  });

  it("does not expose current-session add/remove on the people ledger", async () => {
    renderHostMembersPage();

    const activeRow = within((await screen.findByText("멤버1")).closest("tr") as HTMLElement);
    expect(activeRow.queryByRole("button", { name: "모임 제외" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이번 모임 추가" })).not.toBeInTheDocument();
    expect(activeRow.getByRole("link", { name: "열기" })).toBeInTheDocument();
  });

  it("seeds the host members list through the route loader", async () => {
    const fetchMock = renderHostMembersPage();

    expect(await screen.findByText("멤버1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/members?limit=50&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not refresh member names from an inline profile editor on this screen", async () => {
    renderHostMembersPage();

    expect(await screen.findByText("멤버1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "멤버1 이름 수정" })).not.toBeInTheDocument();
  });

  it("sends invitation work to 초대와 설정 instead of hosting a people extras ledger", () => {
    render(
      <HostMembersForTest initialMembers={[members[0]]} />,
    );

    expect(screen.getByRole("link", { name: "초대와 설정 열기 ›" })).toHaveAttribute("href", "/app/host/settings");
    expect(screen.queryByRole("region", { name: "초대" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 보내기" })).not.toBeInTheDocument();
  });
});
