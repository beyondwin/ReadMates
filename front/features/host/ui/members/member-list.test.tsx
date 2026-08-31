import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { MemberList } from "./member-list";

const member: HostMemberListItem = {
  membershipId: "membership-safe",
  userId: "user-private",
  email: "hidden@example.test",
  displayName: "안전한 이름",
  accountName: "로그인 계정 이름",
  profileImageUrl: null,
  avatarKey: "banana-green-book",
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-08-01T00:00:00Z",
  createdAt: "2026-08-01T00:00:00Z",
  lastClubAccessAt: null,
  currentSessionParticipationStatus: "ACTIVE",
  canSuspend: true,
  canRestore: false,
  canDeactivate: true,
  canAddToCurrentSession: false,
  canRemoveFromCurrentSession: true,
};

describe("MemberList person identity", () => {
  it("links the allowlisted display identity to the dedicated person route without account data", () => {
    render(
      <MemberList
        members={[member]}
        emptyText="비어 있음"
        sectionDescription="멤버"
        personHref={(membershipId) => `/app/host/people/${membershipId}`}
        LinkComponent={({ to, children, ...props }) => <a {...props} href={to}>{children}</a>}
        renderProfileAction={() => null}
        renderActions={() => null}
      />,
    );

    expect(screen.getByRole("link", { name: "안전한 이름" })).toHaveAttribute(
      "href",
      "/app/host/people/membership-safe",
    );
    expect(document.body).not.toHaveTextContent("hidden@example.test");
    expect(document.body).not.toHaveTextContent("user-private");
    expect(vi.fn()).not.toHaveBeenCalled();
  });
});
