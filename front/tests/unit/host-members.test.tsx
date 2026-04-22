import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostMembers from "@/features/host/components/host-members";
import HostMembersPage from "@/src/pages/host-members";
import type { HostMemberListItem } from "@/shared/api/readmates";

const members: HostMemberListItem[] = [
  {
    membershipId: "membership-active",
    userId: "user-active",
    email: "active@example.com",
    displayName: "안멤버1",
    shortName: "멤버1",
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
    displayName: "둘러보기 요청자",
    shortName: "둘",
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
    displayName: "정지 멤버",
    shortName: "정",
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
    displayName: "탈퇴 멤버",
    shortName: "탈",
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
    displayName: "새 멤버",
    shortName: "새",
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

function lifecycleResponse(member: HostMemberListItem) {
  return new Response(JSON.stringify({ member, currentSessionPolicyResult: "APPLIED" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function memberListResponse(items: HostMemberListItem[]) {
  return new Response(JSON.stringify(items), {
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

function renderHostMembersPage(extraResponses: Array<Response | Promise<Response>> = [], initialMembers = members) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(memberListResponse(initialMembers));

  for (const response of extraResponses) {
    fetchMock.mockResolvedValueOnce(response);
  }

  vi.stubGlobal("fetch", fetchMock);
  render(<HostMembersPage />);
  return fetchMock;
}

afterEach(() => {
  cleanup();
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
    expect(screen.getByText("안멤버1")).toBeInTheDocument();
    expect(screen.getByText("active@example.com · 정식 멤버 · 이번 세션 참여 중")).toBeInTheDocument();
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("둘러보기");
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("활성");
    expect(screen.getByLabelText("멤버 운영 요약")).toHaveTextContent("이번 세션");
    expect(within(screen.getByText("안멤버1").closest("article") as HTMLElement).getByText("이번 세션 참여")).toBeInTheDocument();
    expect(within(screen.getByText("새 멤버").closest("article") as HTMLElement).getByText("이번 세션 미포함")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/members", expect.objectContaining({ cache: "no-store" }));
  });

  it("labels viewer members as browsing members instead of approval pending", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const summary = await screen.findByLabelText("멤버 운영 요약");
    expect(summary).toHaveTextContent("둘러보기");
    expect(summary).toHaveTextContent("둘러보기 멤버");
    expect(summary).not.toHaveTextContent("승인 대기");

    await user.click(screen.getByRole("tab", { name: "둘러보기 멤버" }));
    const viewerRow = within(screen.getByText("둘러보기 요청자").closest("article") as HTMLElement);

    expect(viewerRow.getByText("둘러보기")).toBeInTheDocument();
    expect(viewerRow.getByText("viewer@example.com · 둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
    expect(screen.queryByText("승인 대기")).not.toBeInTheDocument();
  });

  it("renders viewer registration dates with app date formatting", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    await user.click(await screen.findByRole("tab", { name: "둘러보기 멤버" }));

    expect(screen.getByText("둘러보기 요청자")).toBeInTheDocument();
    expect(screen.getByText("viewer@example.com · 둘러보기 멤버 · 요청일 2026.04.20")).toBeInTheDocument();
  });

  it("syncs local member rows when loader data changes", () => {
    const replacement = {
      ...members[4],
      displayName: "갱신 멤버",
      email: "updated@example.com",
    } satisfies HostMemberListItem;
    const { rerender } = render(<HostMembers initialMembers={[members[0]]} />);

    expect(screen.getByText("안멤버1")).toBeInTheDocument();

    rerender(<HostMembers initialMembers={[replacement]} />);

    expect(screen.queryByText("안멤버1")).not.toBeInTheDocument();
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
      shortName: "둘",
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
    const firstRow = within(screen.getByText("둘러보기 요청자").closest("article") as HTMLElement);
    const secondRow = within(screen.getByText("두번째 둘러보기").closest("article") as HTMLElement);

    await user.click(firstRow.getByRole("button", { name: "정식 멤버로 전환" }));

    expect(firstRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "둘러보기 해제" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeEnabled();
    expect(secondRow.getByRole("button", { name: "둘러보기 해제" })).toBeEnabled();

    await user.click(secondRow.getByRole("button", { name: "정식 멤버로 전환" }));

    expect(firstRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeDisabled();
    expect(firstRow.getByRole("button", { name: "둘러보기 해제" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "정식 멤버로 전환" })).toBeDisabled();
    expect(secondRow.getByRole("button", { name: "둘러보기 해제" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await user.click(firstRow.getByRole("button", { name: "둘러보기 해제" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    firstApproval.resolve(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    secondApproval.resolve(new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
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
      2,
      "/api/bff/api/host/members/membership-pending/activate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: "활성 멤버" }));
    expect(screen.getByText("둘러보기 요청자")).toBeInTheDocument();
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
      shortName: "둘",
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
      within(screen.getByText("둘러보기 요청자").closest("article") as HTMLElement).getByRole("button", {
        name: "정식 멤버로 전환",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await user.click(
      within(screen.getByText("두번째 둘러보기").closest("article") as HTMLElement).getByRole("button", {
        name: "정식 멤버로 전환",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    latestRefresh.resolve(memberListResponse([]));
    expect(await screen.findByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();

    await act(async () => {
      staleRefresh.resolve(memberListResponse(initialPendingMembers));
      await staleRefresh.promise;
      await Promise.resolve();
    });

    expect(screen.getByText("둘러보기 멤버가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("둘러보기 요청자")).not.toBeInTheDocument();
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
      2,
      "/api/bff/api/host/members/membership-pending/deactivate-viewer",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.click(screen.getByRole("tab", { name: "탈퇴/비활성" }));
    expect(screen.getByText("둘러보기 요청자")).toBeInTheDocument();
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
    expect(screen.getByText("처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다.")).toBeInTheDocument();
    expect(screen.queryByText("정식 멤버 전환에 실패했습니다.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/members",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows active member lifecycle actions and opens the suspend policy dialog", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = (await screen.findByText("안멤버1")).closest("article");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);
    expect(activeRow.getByRole("button", { name: "정지" })).toBeEnabled();
    expect(activeRow.getByRole("button", { name: "탈퇴 처리" })).toBeEnabled();
    expect(activeRow.getByRole("button", { name: "이번 세션 제외" })).toBeEnabled();

    await user.click(activeRow.getByRole("button", { name: "정지" }));

    const dialog = screen.getByRole("dialog", { name: "안멤버1님을 정지할까요?" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "이번 세션부터 바로 정지" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "다음 세션부터 정지" })).toBeInTheDocument();
  });

  it("manages lifecycle dialog focus and returns focus after Escape", async () => {
    const user = userEvent.setup();
    renderHostMembersPage();

    const row = (await screen.findByText("안멤버1")).closest("article");
    expect(row).not.toBeNull();
    const suspendButton = within(row as HTMLElement).getByRole("button", { name: "정지" });
    await user.click(suspendButton);

    const dialog = screen.getByRole("dialog", { name: "안멤버1님을 정지할까요?" });
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
    expect(screen.queryByRole("dialog", { name: "안멤버1님을 정지할까요?" })).not.toBeInTheDocument();
    expect(suspendButton).toHaveFocus();
  });

  it("confirms suspend with the selected current-session policy", async () => {
    const user = userEvent.setup();
    const suspended = { ...members[0], status: "SUSPENDED", canSuspend: false, canRestore: true } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([lifecycleResponse(suspended)]);

    const row = (await screen.findByText("안멤버1")).closest("article");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "정지" }));
    await user.click(within(screen.getByRole("dialog", { name: "안멤버1님을 정지할까요?" })).getByRole("button", { name: "정지" }));

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
    const fetchMock = renderHostMembersPage([lifecycleResponse(restored)]);

    await user.click(await screen.findByRole("tab", { name: "정지됨" }));
    await user.click(screen.getByRole("button", { name: "복구" }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/members/membership-suspended/restore",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("adds and removes members from the current session", async () => {
    const user = userEvent.setup();
    const removed = { ...members[0], currentSessionParticipationStatus: "REMOVED", canAddToCurrentSession: true, canRemoveFromCurrentSession: false } satisfies HostMemberListItem;
    const added = { ...members[4], currentSessionParticipationStatus: "ACTIVE", canAddToCurrentSession: false, canRemoveFromCurrentSession: true } satisfies HostMemberListItem;
    const fetchMock = renderHostMembersPage([lifecycleResponse(removed), lifecycleResponse(added)]);

    let row = (await screen.findByText("안멤버1")).closest("article");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "이번 세션 제외" }));

    row = screen.getByText("새 멤버").closest("article");
    await user.click(within(row as HTMLElement).getByRole("button", { name: "이번 세션 추가" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/bff/api/host/members/membership-active/current-session/remove",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
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

    const row = (await screen.findByText("안멤버1")).closest("article");
    expect(row).not.toBeNull();
    const activeRow = within(row as HTMLElement);

    await user.click(activeRow.getByRole("button", { name: "이번 세션 제외" }));

    expect(activeRow.getByRole("button", { name: "정지" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "탈퇴 처리" })).toBeDisabled();
    expect(activeRow.getByRole("button", { name: "이번 세션 제외" })).toBeDisabled();

    await user.click(activeRow.getByRole("button", { name: "정지" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

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
