import { describe, expect, it } from "vitest";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { clubAccessMeta } from "./member-list-helpers";

function member(lastClubAccessAt: string | null): HostMemberListItem {
  return {
    membershipId: "membership-1",
    userId: "user-1",
    email: "member@example.com",
    displayName: "멤버",
    accountName: "Member",
    profileImageUrl: null,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    currentSessionParticipationStatus: null,
    canSuspend: true,
    canRestore: false,
    canDeactivate: true,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: false,
    lastClubAccessAt,
  };
}

describe("clubAccessMeta", () => {
  it("presents the incumbent compact recent-access text", () => {
    expect(clubAccessMeta(member("2026-08-29T01:02:03Z"))).toBe("최근 접속 2026.08.29 10:02");
  });

  it("uses the explicit absence text without inferring another activity", () => {
    expect(clubAccessMeta(member(null))).toBe("접속 기록 없음");
  });
});
