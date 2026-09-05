import { describe, expect, it } from "vitest";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import {
  aggregateHostPeopleScheduleSeen,
  clubAccessMeta,
  formatMembershipTenure,
  formatPendingRequestTime,
  formatRecentClubAccess,
  rsvpIconName,
  scheduleSeenIconName,
} from "./member-list-helpers";

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

describe("people ledger presentation labels", () => {
  const now = new Date("2026-09-02T14:20:00+09:00");

  it("names recent club access in Seoul calendar days", () => {
    expect(formatRecentClubAccess("2026-09-02T09:00:00+09:00", now)).toBe("오늘");
    expect(formatRecentClubAccess("2026-09-01T10:00:00+09:00", now)).toBe("어제");
    expect(formatRecentClubAccess("2026-08-30T10:00:00+09:00", now)).toBe("3일 전");
    expect(formatRecentClubAccess(null, now)).toBe("접속 기록 없음");
  });

  it("formats pending request time from createdAt", () => {
    expect(formatPendingRequestTime("2026-09-02T09:12:00+09:00", now)).toBe("오늘 09:12");
    expect(formatPendingRequestTime("2026-09-01T21:40:00+09:00", now)).toBe("어제 21:40");
  });

  it("formats tenure as years and leftover months", () => {
    expect(formatMembershipTenure("2025-01-02T00:00:00+09:00", now)).toBe("1년 8개월");
    expect(formatMembershipTenure("2025-10-02T00:00:00+09:00", now)).toBe("11개월");
    expect(formatMembershipTenure("2026-08-27T00:00:00+09:00", now)).toBe("6일");
  });
});

describe("people ledger glyphs", () => {
  it("maps schedule labels to calendar, mail, or minus-circle", () => {
    expect(scheduleSeenIconName("현재 일정 확인")).toBe("calendar");
    expect(scheduleSeenIconName("변경 전 확인")).toBe("calendar");
    expect(scheduleSeenIconName("미열람")).toBe("mail");
    expect(scheduleSeenIconName("일정 대상 아님")).toBe("minus-circle");
  });

  it("maps rsvp labels to check, question, or x icons and omits unknown values", () => {
    expect(rsvpIconName("참석")).toBe("check-circle");
    expect(rsvpIconName("미응답")).toBe("question-circle");
    expect(rsvpIconName("불참")).toBe("x-circle");
    expect(rsvpIconName("—")).toBeNull();
  });
});

describe("aggregateHostPeopleScheduleSeen", () => {
  it("does not invent rail counts when members have no scheduleSeen field", () => {
    expect(aggregateHostPeopleScheduleSeen([member("2026-08-29T01:02:03Z")])).toBeNull();
  });
});
