import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { MemberPendingZone } from "./member-pending-zone";

function viewer(overrides: Partial<HostMemberListItem> = {}): HostMemberListItem {
  return {
    membershipId: "membership-viewer",
    userId: "user-viewer",
    email: "viewer@example.com",
    displayName: "둘",
    accountName: "둘러보기 요청자",
    profileImageUrl: null,
    avatarKey: "banana-green-book",
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
    ...overrides,
  };
}

describe("MemberPendingZone", () => {
  it("renders nothing when there are no pending viewers", () => {
    const { container } = render(
      <MemberPendingZone viewers={[]} isRowPending={() => false} onActivate={vi.fn()} onRelease={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("승인과 거절은 결과 안내를 포함해요.")).not.toBeInTheDocument();
  });

  it("renders a pending-approval header and per-row approve/reject actions when viewers exist", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onRelease = vi.fn();
    const viewers = [
      viewer(),
      viewer({
        membershipId: "membership-viewer-2",
        userId: "user-viewer-2",
        email: "viewer2@example.com",
        displayName: "두번째 둘러보기",
        avatarKey: undefined,
      }),
    ];

    render(
      <MemberPendingZone
        viewers={viewers}
        isRowPending={() => false}
        onActivate={onActivate}
        onRelease={onRelease}
      />,
    );

    const zone = screen.getByRole("region", { name: "가입 승인 대기" });
    expect(within(zone).getByText("승인과 거절은 결과 안내를 포함해요.")).toBeInTheDocument();
    expect(within(zone).getByRole("button", { name: "가입 승인 검토" })).toBeEnabled();
    expect(within(zone).queryByText(/초대 링크/)).not.toBeInTheDocument();

    const firstRow = within(zone).getByText("둘").closest("article") as HTMLElement;
    const secondRow = within(zone).getByText("두번째 둘러보기").closest("article") as HTMLElement;

    expect(within(firstRow).getByRole("button", { name: "승인" })).toBeEnabled();
    expect(within(firstRow).getByRole("button", { name: "거절" })).toBeEnabled();
    expect(within(secondRow).getByRole("button", { name: "승인" })).toBeEnabled();
    expect(within(secondRow).getByRole("button", { name: "거절" })).toBeEnabled();

    await user.click(within(firstRow).getByRole("button", { name: "승인" }));
    expect(onActivate).toHaveBeenCalledWith("membership-viewer");

    await user.click(within(secondRow).getByRole("button", { name: "거절" }));
    expect(onRelease).toHaveBeenCalledWith("membership-viewer-2");
  });

  it("disables the submitting row while a viewer action is in flight", () => {
    render(
      <MemberPendingZone
        viewers={[viewer()]}
        isRowPending={(membershipId) => membershipId === "membership-viewer"}
        onActivate={vi.fn()}
        onRelease={vi.fn()}
      />,
    );

    const row = screen.getByText("둘").closest("article") as HTMLElement;
    expect(within(row).getByRole("button", { name: "승인" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "거절" })).toBeDisabled();
  });

  it("links the safe display identity without exposing pending account data", () => {
    render(
      <MemberPendingZone
        viewers={[viewer()]}
        isRowPending={() => false}
        personHref={(membershipId) => `/app/host/people/${membershipId}`}
        LinkComponent={({ to, children }) => <a href={to}>{children}</a>}
        onActivate={vi.fn()}
        onRelease={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "둘" })).toHaveAttribute(
      "href",
      "/app/host/people/membership-viewer",
    );
    expect(document.body).not.toHaveTextContent("viewer@example.com");
    expect(document.body).not.toHaveTextContent("user-viewer");
  });
});
