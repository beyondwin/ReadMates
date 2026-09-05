import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostMembersActions } from "@/features/host/model/host-member-actions";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import HostMembers from "./host-members";
import source from "./host-members.tsx?raw";

const actions = {
  loadMembers: vi.fn(async () => ({ items: [], nextCursor: null })),
  refreshMembers: vi.fn(async () => ({ items: [], nextCursor: null })),
  submitLifecycle: vi.fn(async (membershipId) => ({
    member: members.find((item) => item.membershipId === membershipId) ?? members[0],
    currentSessionPolicyResult: "APPLIED" as const,
  })),
  submitViewerAction: vi.fn(async () => members[1]),
  submitProfile: vi.fn(async () => members[0]),
} satisfies HostMembersActions;

const members: HostMemberListItem[] = [
  {
    membershipId: "membership-active",
    userId: "user-active",
    email: "active@example.test",
    displayName: "멤버1",
    accountName: "hidden-account",
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
    email: "viewer@example.test",
    displayName: "둘",
    accountName: "둘러보기 요청자",
    profileImageUrl: null,
    avatarKey: "peach-green-book",
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
];

describe("HostMembers presentation boundary", () => {
  it("has no direct API, query, router, or fetch dependency", () => {
    expect(source).not.toMatch(/features\/host\/(api|queries|route)|react-router|\bfetch\s*\(/);
  });
});

describe("HostMembers people ledger composition", () => {
  it("renders flat pending rows, icon schedule/rsvp cells, a single open link per row, and a 4-row rail", () => {
    const ledgerMembers = members.filter((item) => item.status !== "VIEWER");
    render(
      <HostMembers
        initialMembers={members}
        actions={actions}
        factsByMembershipId={{
          "membership-active": { scheduleSeenLabel: "현재 일정 확인", rsvpLabel: "참석" },
        }}
      />,
    );

    expect(document.querySelectorAll(".rm-member-ledger__pending-row").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".rm-member-ledger__schedule [data-icon]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".rm-member-ledger__rsvp [data-icon]").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "열기" }).length).toBe(ledgerMembers.length);
    expect(document.querySelectorAll(".rm-member-ledger__rail-row")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /이름 변경/ })).toBeNull();
    expect(screen.queryByText("이번 모임 참여")).toBeNull();
    expect(screen.queryByText("오늘 14:20")).toBeNull();
  });

  it("keeps the people ledger populated when the 둘러보기 chip is selected", async () => {
    const user = userEvent.setup();
    render(<HostMembers initialMembers={members} actions={actions} />);

    await user.click(screen.getByRole("tab", { name: /둘러보기/ }));

    const ledger = document.querySelector(".rm-member-ledger");
    expect(ledger).toBeTruthy();
    expect(ledger?.textContent).toContain("둘");
    expect(screen.queryByText("활성 멤버가 없습니다.")).not.toBeInTheDocument();
  });
});
