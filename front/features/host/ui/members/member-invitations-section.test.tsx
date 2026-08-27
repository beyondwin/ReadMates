import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostInvitationListItem } from "@/features/host/model/host-view-types";
import { MemberInvitationsSection } from "./member-invitations-section";

function invitation(overrides: Partial<HostInvitationListItem> = {}): HostInvitationListItem {
  return {
    invitationId: "invite-1",
    email: "pending@example.com",
    name: "대기 멤버",
    role: "MEMBER",
    status: "PENDING",
    effectiveStatus: "PENDING",
    expiresAt: "2026-05-20T12:00:00Z",
    acceptedAt: null,
    createdAt: "2026-04-20T12:00:00Z",
    canRevoke: true,
    canReissue: true,
    applyToCurrentSession: true,
    ...overrides,
  };
}

const fourStateInvitations: HostInvitationListItem[] = [
  invitation(),
  invitation({
    invitationId: "invite-2",
    email: "accepted@example.com",
    name: "수락 멤버",
    status: "ACCEPTED",
    effectiveStatus: "ACCEPTED",
    acceptedAt: "2026-04-21T12:00:00Z",
    canRevoke: false,
    canReissue: false,
  }),
  invitation({
    invitationId: "invite-3",
    email: "expired@example.com",
    name: "만료 멤버",
    status: "EXPIRED",
    effectiveStatus: "EXPIRED",
    canRevoke: false,
    canReissue: true,
  }),
  invitation({
    invitationId: "invite-4",
    email: "revoked@example.com",
    name: "중지 멤버",
    status: "REVOKED",
    effectiveStatus: "REVOKED",
    canRevoke: false,
    canReissue: true,
  }),
];

describe("MemberInvitationsSection", () => {
  it("renders the four invitation status labels including 중지", () => {
    render(
      <MemberInvitationsSection
        invitations={fourStateInvitations}
        pendingCount={1}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={vi.fn(async () => undefined)}
        onReissue={vi.fn(async () => undefined)}
        busyId={null}
      />,
    );

    const section = screen.getByRole("region", { name: "초대" });
    const statusBadges = within(section)
      .getAllByText(/^(대기|수락됨|만료됨|중지)$/)
      .map((node) => node.textContent);
    expect(statusBadges).toEqual(expect.arrayContaining(["대기", "수락됨", "만료됨", "중지"]));
    expect(within(section).queryByText("취소됨")).not.toBeInTheDocument();
    expect(within(section).getByText(/이력.*보존/)).toBeInTheDocument();
  });

  it("masks emails by default and reveals the full address on explicit action", async () => {
    const user = userEvent.setup();

    render(
      <MemberInvitationsSection
        invitations={[invitation()]}
        pendingCount={1}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={vi.fn(async () => undefined)}
        onReissue={vi.fn(async () => undefined)}
        busyId={null}
      />,
    );

    const row = screen.getByText("대기 멤버").closest("tr, article, li, .rm-ledger-row") as HTMLElement;
    expect(within(row).getByText("p***@example.com")).toBeInTheDocument();
    expect(within(row).queryByText("pending@example.com")).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: /전체 보기/ }));

    expect(within(row).getByText("pending@example.com")).toBeInTheDocument();
    expect(within(row).queryByText("p***@example.com")).not.toBeInTheDocument();
  });

  it("reissues by calling onReissue so the host can recreate via createInvitation", async () => {
    const user = userEvent.setup();
    const onReissue = vi.fn(async () => undefined);
    const target = invitation({
      invitationId: "invite-expired",
      email: "expired@example.com",
      name: "만료 멤버",
      status: "EXPIRED",
      effectiveStatus: "EXPIRED",
      canRevoke: false,
      canReissue: true,
    });

    render(
      <MemberInvitationsSection
        invitations={[target]}
        pendingCount={0}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={vi.fn(async () => undefined)}
        onReissue={onReissue}
        busyId={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /재발송/ }));

    expect(onReissue).toHaveBeenCalledTimes(1);
    expect(onReissue).toHaveBeenCalledWith(target);
  });

  it("labels the revoke row action as 중지 and invokes onRevoke", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn(async () => undefined);
    const pending = invitation();

    render(
      <MemberInvitationsSection
        invitations={[pending]}
        pendingCount={1}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={onRevoke}
        onReissue={vi.fn(async () => undefined)}
        busyId={null}
      />,
    );

    const stopButton = screen.getByRole("button", { name: /중지/ });
    expect(stopButton).toHaveTextContent(/^중지$/);
    await user.click(stopButton);

    expect(onRevoke).toHaveBeenCalledWith("invite-1");
  });
});
