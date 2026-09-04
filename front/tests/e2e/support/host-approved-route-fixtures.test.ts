import { describe, expect, it } from "vitest";
import { parseHostSessionDetailResponse, parseHostSessionListPage } from "@/features/host/api/host-contracts";
import { parseHostPersonDetail } from "@/features/host/api/host-person-contracts";
import { approvedRecordItems, approvedScheduleReviewMembers } from "@/features/host/ui/approved-host-ledgers.data";
import {
  HOST_APPROVED_PERSON_ID,
  HOST_APPROVED_SESSION_ID,
  buildHostApprovedMeetingList,
  buildHostApprovedMembersPage,
  buildHostApprovedPersonDetail,
  buildHostApprovedRecordLedger,
  buildHostApprovedSessionDetail,
  resolveHostApprovedCursorPage,
} from "./host-approved-route-fixtures";

describe("host approved route fixtures", () => {
  it("keeps session detail identity instead of returning OPEN No.28 for every id", () => {
    const current = buildHostApprovedSessionDetail(HOST_APPROVED_SESSION_ID);
    const closing = buildHostApprovedSessionDetail("session-27");
    expect(current).toMatchObject({
      sessionId: HOST_APPROVED_SESSION_ID,
      sessionNumber: 28,
      bookTitle: "지구 끝의 온실",
      state: "OPEN",
    });
    expect(closing).toMatchObject({
      sessionId: "session-27",
      sessionNumber: 27,
      bookTitle: "맡겨진 소녀",
      state: "CLOSED",
    });
    expect(buildHostApprovedSessionDetail("session-99")).toBeNull();
    expect(parseHostSessionDetailResponse(current!)).toMatchObject({ sessionId: HOST_APPROVED_SESSION_ID, state: "OPEN" });
    expect(parseHostSessionDetailResponse(closing!)).toMatchObject({ sessionId: "session-27", state: "CLOSED" });
  });

  it("keeps CLOSED session-28 on the record ledger and OPEN session-28 on the meeting list", () => {
    expect(buildHostApprovedRecordLedger().items[0]).toMatchObject({
      sessionId: HOST_APPROVED_SESSION_ID,
      state: "CLOSED",
      bookTitle: approvedRecordItems[0]?.bookTitle,
    });
    expect(buildHostApprovedMeetingList().items[0]).toMatchObject({
      sessionId: HOST_APPROVED_SESSION_ID,
      state: "OPEN",
      bookTitle: "지구 끝의 온실",
    });
    expect(parseHostSessionListPage(buildHostApprovedRecordLedger(), "record").items[0].state).toBe("CLOSED");
    expect(parseHostSessionListPage(buildHostApprovedMeetingList(), "meeting").items[0].state).toBe("OPEN");
  });

  it("returns membership-sky and fail-closes unknown people ids", () => {
    expect(buildHostApprovedPersonDetail(HOST_APPROVED_PERSON_ID)).toMatchObject({
      membershipId: HOST_APPROVED_PERSON_ID,
      displayName: "김하늘",
    });
    expect(buildHostApprovedPersonDetail("membership-kang")).toMatchObject({
      membershipId: "membership-kang",
      displayName: "강유진",
    });
    expect(buildHostApprovedPersonDetail("membership-unknown")).toBeNull();
    expect(buildHostApprovedPersonDetail("membership-unknown")?.displayName).not.toBe("김하늘");
    expect(parseHostPersonDetail(buildHostApprovedPersonDetail(HOST_APPROVED_PERSON_ID)!)).toMatchObject({
      membershipId: HOST_APPROVED_PERSON_ID,
      displayName: "김하늘",
    });
  });

  it("does not replay page 1 for an unknown or second-page list cursor", () => {
    const first = buildHostApprovedRecordLedger();
    expect(first.items.length).toBeGreaterThan(0);
    expect(resolveHostApprovedCursorPage(first, first.nextCursor)).toEqual({
      ...first,
      items: [],
      nextCursor: null,
    });
    expect(resolveHostApprovedCursorPage(first, "cursor-unknown")).toBeNull();
    expect(resolveHostApprovedCursorPage(first, null)).toEqual(first);

    const members = buildHostApprovedMembersPage();
    expect(resolveHostApprovedCursorPage(members, members.nextCursor)).toEqual({
      ...members,
      items: [],
      nextCursor: null,
    });
    expect(resolveHostApprovedCursorPage(members, "cursor-unknown")).toBeNull();
  });

  it("converts schedule-review recipients from the approved ledger", () => {
    expect(approvedScheduleReviewMembers.map((member) => member.membershipId)).toEqual([
      "membership-park",
      "membership-lee",
      "membership-kang",
      "membership-moon",
    ]);
  });
});
