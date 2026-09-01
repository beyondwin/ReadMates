import { readFileSync } from "node:fs";
import path from "node:path";
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
    const onReissue = vi.fn(async (_invitation: HostInvitationListItem, publication: { accepted: () => void }) => publication.accepted());
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
    expect(onReissue).toHaveBeenCalledWith(target, expect.objectContaining({ accepted: expect.any(Function), failed: expect.any(Function) }));
  });

  it("labels the revoke row action as 중지 and invokes onRevoke", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn(async (_invitationId: string, publication: { accepted: () => void }) => publication.accepted());
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

    expect(onRevoke).toHaveBeenCalledWith("invite-1", expect.objectContaining({ accepted: expect.any(Function), failed: expect.any(Function) }));
  });

  it("surfaces revoke and reissue feedback inside the invitations region", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn(async (_invitationId: string, publication: { accepted: () => void; failed: () => void }) => publication.accepted());
    const onReissue = vi.fn(async (_invitation: HostInvitationListItem, publication: { accepted: () => void; failed: () => void }) => publication.accepted());
    const pending = invitation();
    const expired = invitation({
      invitationId: "invite-expired",
      email: "expired@example.com",
      name: "만료 멤버",
      status: "EXPIRED",
      effectiveStatus: "EXPIRED",
      canRevoke: false,
      canReissue: true,
    });

    const { rerender } = render(
      <MemberInvitationsSection
        invitations={[pending]}
        pendingCount={1}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={onRevoke}
        onReissue={onReissue}
        busyId={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /중지/ }));

    const section = screen.getByRole("region", { name: "초대" });
    expect(within(section).getByRole("status")).toHaveTextContent("초대를 중지했습니다.");
    expect(screen.getAllByRole("status")).toHaveLength(1);

    onRevoke.mockImplementationOnce(async (_invitationId, publication) => publication.failed());
    await user.click(screen.getByRole("button", { name: /중지/ }));
    expect(within(section).getByRole("alert")).toHaveTextContent("초대 중지에 실패했습니다.");

    rerender(
      <MemberInvitationsSection
        invitations={[expired]}
        pendingCount={0}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={onRevoke}
        onReissue={onReissue}
        busyId={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /재발송/ }));
    expect(within(screen.getByRole("region", { name: "초대" })).getByRole("status")).toHaveTextContent(
      "초대를 재발송했습니다.",
    );

    onReissue.mockImplementationOnce(async (_invitation, publication) => publication.failed());
    await user.click(screen.getByRole("button", { name: /재발송/ }));
    expect(within(screen.getByRole("region", { name: "초대" })).getByRole("alert")).toHaveTextContent(
      "재발송에 실패했습니다.",
    );
  });

  it("disables every invitation row action while any row is busy", () => {
    render(
      <MemberInvitationsSection
        invitations={fourStateInvitations}
        pendingCount={1}
        onCreate={vi.fn(async () => undefined)}
        onRevoke={vi.fn(async () => undefined)}
        onReissue={vi.fn(async () => undefined)}
        busyId="invite-1"
      />,
    );

    expect(screen.getByRole("button", { name: "pending@example.com 중지" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "expired@example.com 재발송" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "revoked@example.com 재발송" })).toBeDisabled();
  });

  it("reconstructs invitation rows as a 640px list in CSS without a horizontal-scroll table", () => {
    const css = readFileSync(path.resolve("features/host/ui/members/member-ledger.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.rm-host-member-ledger__row[\s\S]*grid-template-areas:/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*overflow-x:\s*hidden/);
    expect(css).not.toMatch(/overflow-x:\s*auto/);
  });
});
