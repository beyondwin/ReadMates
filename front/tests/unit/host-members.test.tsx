import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostMembers, { type HostMembersActions } from "@/features/host/components/host-members";
import { hostMembersLoader } from "@/features/host";
import HostMembersPage from "@/src/pages/host-members";
import type { HostMemberListItem } from "@/features/host/api/host-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const members: HostMemberListItem[] = [
  {
    membershipId: "membership-active",
    userId: "user-active",
    email: "active@example.com",
    displayName: "멤버1",
    accountName: "안멤버1",
    profileImageUrl: null,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-04-18T12:00:00Z",
    createdAt: "2026-04-17T12:00:00Z",
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
    role: "MEMBER",
    status: "SUSPENDED",
    joinedAt: "2026-04-14T12:00:00Z",
    createdAt: "2026-04-13T12:00:00Z",
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
    role: "MEMBER",
    status: "LEFT",
    joinedAt: "2026-04-10T12:00:00Z",
    createdAt: "2026-04-09T12:00:00Z",
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
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-04-21T12:00:00Z",
    createdAt: "2026-04-21T12:00:00Z",
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
  submitLifecycle: vi.fn(async () => lifecycleResponse(members[0])),
  submitViewerAction: vi.fn(async () => members[0]),
  submitProfile: vi.fn(async () => memberListItemResponse(members[0])),
} satisfies HostMembersActions;

type HostMembersProps = Parameters<typeof HostMembers>[0];

function HostMembersForTest({
  actions,
  ...props
}: Omit<HostMembersProps, "actions"> & { actions?: HostMembersActions }) {
  return <HostMembers {...props} actions={actions ?? noopHostMembersActions} />;
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
  return new Response(JSON.stringify(items), {
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

  vi.stubGlobal("fetch", fetchMock);
  const router = createMemoryRouter(
    [
      {
        path: "/app/host/members",
        element: <HostMembersPage />,
        loader: hostMembersLoader,
        hydrateFallbackElement: <div>멤버 목록을 불러오는 중</div>,
      },
    ],
    { initialEntries: ["/app/host/members"] },
  );

  render(<RouterProvider router={router} />);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("HostMembersPage", () => {
  it("loads the host member hub and renders lifecycle tabs", async () => {
    const fetchMock = renderHostMembersPage();

    expect(await screen.findByRole("tab", { name: "활성 멤버" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "둘러보기 멤버" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "정지됨" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "탈퇴/비활성" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "초대" })).toBeInTheDocument();
    expect(screen.getByText("멤버1")).toBeInTheDocument();
    expect(screen.getByText("active@example.com · 정식 멤버 · 이번 세션 참여 중")).toBeInTheDocument();
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("둘러보기");
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("활성");
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("이번 세션");
    expect(within(screen.getByText("멤버1").closest("article") as HTMLElement).getByText("이번 세션 참여")).toBeInTheDocument();
    expect(within(screen.getByText("새").closest("article") as HTMLElement).getByText("이번 세션 미포함")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/members", expect.objectContaining({ cache: "no-store" }));
  });

  it("renders each member row with identity, status, and current-session state", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const activeRow = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
    expect(activeRow.getByRole("heading", { name: "멤버1" })).toBeInTheDocument();
    expect(activeRow.queryByText("@멤버1")).not.toBeInTheDocument();
    expect(activeRow.getByText("active@example.com · 정식 멤버 · 이번 세션 참여 중")).toBeInTheDocument();
    expect(activeRow.getByText("활성")).toBeInTheDocument();
    expect(activeRow.getByText("이번 세션 참여")).toBeInTheDocument();

    const outsideRow = within(screen.getByText("새").closest("article") as HTMLElement);
    expect(outsideRow.queryByText("@새")).not.toBeInTheDocument();
    expect(outsideRow.getByText("new@example.com · 정식 멤버 · 이번 세션 없음")).toBeInTheDocument();
    expect(outsideRow.getByText("이번 세션 미포함")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "정지됨" }));
    const suspendedRow = within(screen.getByText("정").closest("article") as HTMLElement);
    expect(suspendedRow.queryByText("@정")).not.toBeInTheDocument();
    expect(suspendedRow.getByText("suspended@example.com · 정지됨 · 참여 2026.04.14")).toBeInTheDocument();
    expect(suspendedRow.getByText("정지")).toBeInTheDocument();
    expect(suspendedRow.getByText("이번 세션 제외")).toBeInTheDocument();
  });

  it("opens the profile edit dialog for a member display name", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
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

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    const input = dialog.getByLabelText("이름");
    await user.clear(input);
    await user.type(input, "  새이름  ");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/bff/api/host/members/membership-active/profile",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ displayName: "새이름" }),
        }),
      );
    });
    expect(await screen.findByText("새이름")).toBeInTheDocument();
    expect(screen.queryByText("멤버1")).not.toBeInTheDocument();
    expect(screen.getByText("새")).toBeInTheDocument();
    expect(screen.getByText("new@example.com · 정식 멤버 · 이번 세션 없음")).toBeInTheDocument();
  });

  it("locks lifecycle controls for the same row while profile save is pending", async () => {
    const user = userEvent.setup();
    const profileUpdate = deferred<Response>();
    renderHostMembersPage([profileUpdate.promise]);

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "새이름");
    await user.click(dialog.getByRole("button", { name: "이름 저장" }));

    expect(row.getByRole("button", { name: "정지" })).toBeDisabled();
    expect(row.getByRole("button", { name: "탈퇴 처리" })).toBeDisabled();
    expect(row.getByRole("button", { name: "이번 세션 제외" })).toBeDisabled();
    expect(row.getByRole("button", { name: "이름 변경" })).toBeDisabled();
    expect(row.getByRole("button", { name: "정지" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getByRole("button", { name: "탈퇴 처리" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getByRole("button", { name: "이번 세션 제외" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getByRole("button", { name: "이름 변경" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(4);

    await act(async () => {
      profileUpdate.resolve(memberListItemResponse({ ...members[0], displayName: "새이름" }));
      await profileUpdate.promise;
    });
  });

  it("blocks profile editing for a row while a lifecycle action is pending", async () => {
    const user = userEvent.setup();
    const removal = deferred<Response>();
    renderHostMembersPage([removal.promise]);

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이번 세션 제외" }));

    const editButton = row.getByRole("button", { name: "이름 변경" });
    expect(editButton).toBeDisabled();
    expect(editButton).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(row.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(4);

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

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
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

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
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

    const row = within((await screen.findByText("멤버1")).closest("article") as HTMLElement);
    await user.click(row.getByRole("button", { name: "이름 변경" }));
    const dialog = within(screen.getByRole("dialog", { name: "멤버1 이름 수정" }));
    await user.clear(dialog.getByLabelText("이름"));
    await user.type(dialog.getByLabelText("이름"), "새이름");
    await user.dblClick(dialog.getByRole("button", { name: "이름 저장" }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(dialog.getByRole("button", { name: "이름 저장" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "이름 저장" })).toHaveTextContent("저장 중");

    await act(async () => {
      profileUpdate.resolve(memberListItemResponse({ ...members[0], displayName: "새이름" }));
      await profileUpdate.promise;
    });
  });

  it("keeps the member tab header and body on the shared mobile start line", async () => {
    renderHostMembersPage();

    expect(await screen.findByRole("tab", { name: "활성 멤버" })).toBeInTheDocument();

    const page = document.querySelector("main.rm-host-members-page");
    const headerEyebrow = document.querySelector(".page-header-compact .eyebrow");
    const contentContainer = document.querySelector("main > section.container") as HTMLElement | null;
    expect(page).not.toBeNull();
    expect(headerEyebrow?.tagName).toBe("DIV");
    expect(contentContainer).not.toBeNull();
    expect(contentContainer).toHaveClass("rm-host-members-page__body");
    expect(contentContainer?.style.paddingTop).toBe("24px");
    expect(contentContainer?.style.paddingBottom).toBe("72px");
    expect(contentContainer?.style.paddingLeft).toBe("");
    expect(contentContainer?.style.paddingRight).toBe("");
  });

  it("labels viewer members as browsing members instead of approval pending", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const summary = await screen.findByLabelText("멤버 운영 요약");
    expect(summary).toHaveTextContent("둘러보기");
    expect(summary).toHaveTextContent("둘러보기 멤버");
    expect(summary).not.toHaveTextContent("승인 대기");

    await user.click(screen.getByRole("tab", { name: "둘러보기 멤버" }));
    const viewerRow = within(screen.getByText("둘").closest("article") as HTMLElement);

    expect(viewerRow.getByText("둘러보기")).toBeInTheDocument();
    expect(viewerRow.getByText("viewer@example.com · 둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
    expect(screen.queryByText("승인 대기")).not.toBeInTheDocument();
  });

  it("supports keyboard selection in the member management tablist", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const activeTab = await screen.findByRole("tab", { name: "활성 멤버" });
    const viewerTab = screen.getByRole("tab", { name: "둘러보기 멤버" });
    const invitationsTab = screen.getByRole("tab", { name: "초대" });

    activeTab.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(viewerTab).toHaveFocus());
    expect(viewerTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("둘")).toBeInTheDocument();

    await user.keyboard("{End}");
    await waitFor(() => expect(invitationsTab).toHaveFocus());
    expect(invitationsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("초대 링크 관리")).toBeInTheDocument();

    await user.keyboard("{Home}");
    await waitFor(() => expect(activeTab).toHaveFocus());
    expect(activeTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(invitationsTab).toHaveFocus());
    expect(invitationsTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders viewer registration dates with app date formatting", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));

    expect(screen.getByText("둘")).toBeInTheDocument();
    expect(screen.getByText("viewer@example.com · 둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
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
    expect(screen.getByText("updated@example.com · 정식 멤버 · 이번 세션 없음")).toBeInTheDocument();
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

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));
    const firstRow = within(screen.getByText("둘").closest("article") as HTMLElement);
    const secondRow = within(screen.getByText("두번째 둘러보기").closest("article") as HTMLElement);

    await user.click(firstRow.getByRole("button", { name: "정식 멤버로 전환" }));

    expect(firstRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "정식 멤버로 전환" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getByRole("button", { name: "둘러보기 해제" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "둘러보기 해제" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getByRole("button", { name: "이름 변경" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "이름 변경" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(firstRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(3);
    expect(secondRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeEnabled();
    expect(secondRow.getByRole("button", { name: "둘러보기 해제" })).toBeEnabled();

    await user.click(secondRow.getByRole("button", { name: "정식 멤버로 전환" }));

    expect(firstRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "둘러보기 해제" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "정식 멤버로 전환" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(secondRow.getByRole("button", { name: "둘러보기 해제" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "둘러보기 해제" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(secondRow.getByRole("button", { name: "이름 변경" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "이름 변경" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(secondRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await user.click(firstRow.getByRole("button", { name: "둘러보기 해제" }));
    expect(fetchMock).toHaveBeenCalledTimes(4);

    firstApproval.resolve(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    secondApproval.resolve(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
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

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));
    const viewerRow = within(screen.getByText("둘").closest("article") as HTMLElement);
    const activateButton = viewerRow.getByRole("button", { name: "정식 멤버로 전환" });
    const deactivateButton = viewerRow.getByRole("button", { name: "둘러보기 해제" });

    expect(activateButton).toBeEnabled();
    expect(deactivateButton).toBeDisabled();
    expect(deactivateButton).toHaveAccessibleDescription("이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.");
    expect(viewerRow.getByText("이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "정지됨" }));
    const suspendedRow = within(screen.getByText("정").closest("article") as HTMLElement);
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

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));
    await user.click(screen.getByRole("button", { name: "정식 멤버로 전환" }));

    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members/membership-pending/activate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: "활성 멤버" }));
    expect(screen.getByText("둘")).toBeInTheDocument();
    expect(screen.getByText("viewer@example.com · 정식 멤버 · 이번 세션 참여 중")).toBeInTheDocument();
  });

  it("ignores stale out-of-order approval refresh responses", async () => {
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

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));
    await user.click(
      within(screen.getByText("둘").closest("article") as HTMLElement).getByRole("button", {
        name: "정식 멤버로 전환",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    await user.click(
      within(screen.getByText("두번째 둘러보기").closest("article") as HTMLElement).getByRole("button", {
        name: "정식 멤버로 전환",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));

    latestRefresh.resolve(memberListResponse([]));
    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();

    await act(async () => {
      staleRefresh.resolve(memberListResponse(initialPendingMembers));
      await staleRefresh.promise;
      await Promise.resolve();
    });

    expect(screen.getByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
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

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));
    await user.click(screen.getByRole("button", { name: "둘러보기 해제" }));

    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members/membership-pending/deactivate-viewer",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: "탈퇴/비활성" }));
    expect(screen.getByText("둘")).toBeInTheDocument();
    expect(screen.getByText("viewer@example.com · 비활성 · 요청 2026.04.20")).toBeInTheDocument();
  });

  it("removes the viewer row locally when activation succeeds but list refresh fails", async () => {
    const user = userEvent.setup();
    const fetchMock = renderHostMembersPage([
      new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response(JSON.stringify({ message: "refresh failed" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    ]);

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));
    await user.click(screen.getByRole("button", { name: "정식 멤버로 전환" }));

    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다. 새로고침해서 최신 상태를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("정식 멤버 전환에 실패했습니다.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows active member lifecycle actions and opens the suspend policy dialog", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = (await screen.findByText("멤버1")).closest("article");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    expect(activeRow.getByRole("button", { name: "정지" })).toBeEnabled();
    expect(activeRow.getByRole("button", { name: "탈퇴 처리" })).toBeEnabled();
    expect(activeRow.getByRole("button", { name: "이번 세션 제외" })).toBeEnabled();

    await user.click(activeRow.getByRole("button", { name: "정지" }));

    const dialog = screen.getByRole("dialog", { name: "멤버1님을 정지할까요?" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "이번 세션부터 바로 정지" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "다음 세션부터 정지" })).toBeInTheDocument();
  });

  it("explains disabled suspend and deactivate actions from capability flags", async () => {
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

    const row = (await screen.findByText("호스트 멤버")).closest("article");
    expect(row).not.toBeNull();
    const hostRow = within(row as HTMLElement);
    const suspendButton = hostRow.getByRole("button", { name: "정지" });
    const deactivateButton = hostRow.getByRole("button", { name: "탈퇴 처리" });

    expect(suspendButton).toBeDisabled();
    expect(suspendButton).toHaveAccessibleDescription("호스트는 정지할 수 없습니다.");
    expect(hostRow.getByText("호스트는 정지할 수 없습니다.")).toBeInTheDocument();
    expect(deactivateButton).toBeDisabled();
    expect(deactivateButton).toHaveAccessibleDescription("호스트는 탈퇴 처리할 수 없습니다.");
    expect(hostRow.getByText("호스트는 탈퇴 처리할 수 없습니다.")).toBeInTheDocument();
  });

  it("manages lifecycle dialog focus and returns focus after Escape", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = (await screen.findByText("멤버1")).closest("article");
    expect(row).not.toBeNull();
    const suspendButton = within(row as HTMLElement).getByRole("button", { name: "정지" });
    await user.click(suspendButton);

    const dialog = screen.getByRole("dialog", { name: "멤버1님을 정지할까요?" });
    const dialogView = within(dialog);
    const cancelButton = dialogView.getByRole("button", { name: "취소" });
    const confirmButton = dialogView.getByRole("button", { name: "정지" });
    const applyNowRadio = dialogView.getByRole("radio", { name: "이번 세션부터 바로 정지" });

    expect(cancelButton).toHaveFocus();

    await user.tab();
    expect(confirmButton).toHaveFocus();

    await user.tab();
    expect(applyNowRadio).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "멤버1님을 정지할까요?" })).not.toBeInTheDocument();
    expect(suspendButton).toHaveFocus();
  });

  it("confirms suspend with the selected current-session policy", async () => {
    const user = userEvent.setup();
    const suspended = { ...members[0], status: "SUSPENDED", canSuspend: false, canRestore: true } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([lifecycleResponse(suspended)]);

    const row = (await screen.findByText("멤버1")).closest("article");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "정지" }));
    await user.click(within(screen.getByRole("dialog", { name: "멤버1님을 정지할까요?" })).getByRole("button", { name: "정지" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/members/membership-active/suspend",
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

    await user.click(await screen.findByRole("tab", { name: "정지됨" }));
    const suspendedRow = within(screen.getByText("정").closest("article") as HTMLElement);
    await user.click(suspendedRow.getByRole("button", { name: "복구" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/members/membership-suspended/restore",
      expect.objectContaining({ method: "POST" }),
    );
    expect(suspendedRow.getByRole("button", { name: "복구" })).toBeDisabled();
    expect(suspendedRow.getByRole("button", { name: "복구" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(suspendedRow.getByRole("button", { name: "탈퇴 처리" })).toBeDisabled();
    expect(suspendedRow.getByRole("button", { name: "탈퇴 처리" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");

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

    let row = (await screen.findByText("멤버1")).closest("article");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "이번 세션 제외" }));

    row = screen.getByText("새").closest("article");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "이번 세션 추가" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members/membership-active/current-session/remove",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/bff/api/host/members/membership-not-session/current-session/add",
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

    const row = (await screen.findByText("멤버1")).closest("article");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);

    await user.click(activeRow.getByRole("button", { name: "이번 세션 제외" }));

    expect(activeRow.getByRole("button", { name: "정지" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "탈퇴 처리" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "이번 세션 제외" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "이름 변경" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "정지" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getByRole("button", { name: "탈퇴 처리" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getByRole("button", { name: "이번 세션 제외" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getByRole("button", { name: "이름 변경" })).toHaveAccessibleDescription("멤버 상태 업데이트를 처리하는 중입니다.");
    expect(activeRow.getAllByText("멤버 상태 업데이트를 처리하는 중입니다.")).toHaveLength(4);

    await user.click(activeRow.getByRole("button", { name: "정지" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);

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

    const row = (await screen.findByText("제외 불가 멤버")).closest("article");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    expect(activeRow.getByText("locked@example.com · 정식 멤버 · 이번 세션 참여 중")).toBeInTheDocument();
    expect(activeRow.getByRole("button", { name: "이번 세션 제외" })).toBeDisabled();
    expect(activeRow.queryByRole("button", { name: "이번 세션 추가" })).not.toBeInTheDocument();
  });
});
