import { describe, expect, it } from "vitest";
import { parseHostSessionDetailResponse, parseHostSessionListPage } from "@/features/host/api/host-contracts";
import { parseHostPersonDetail } from "@/features/host/api/host-person-contracts";
import { approvedRecordItems, approvedScheduleReviewMembers, approvedScheduleReviewPreview } from "@/features/host/ui/approved-host-ledgers.data";
import { PREVIEW_NOTIFICATION_PATH } from "./approved-route-request-audit";
import {
  HOST_APPROVED_CLUB,
  HOST_APPROVED_PERSON_ID,
  HOST_APPROVED_SESSION_ID,
  buildHostApprovedAuth,
  buildHostApprovedMeetingList,
  buildHostApprovedMembersPage,
  buildHostApprovedPersonDetail,
  buildHostApprovedRecordLedger,
  buildHostApprovedClosingStatus,
  buildHostApprovedSessionDetail,
  hostApprovedCurrentSelection,
  hostApprovedSessionDetailOptionsFor,
  isApprovedHostPreviewPost,
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

  it("keeps session-28 CLOSED with a closing checklist when the closing lifecycle is requested", () => {
    const closed = buildHostApprovedSessionDetail(HOST_APPROVED_SESSION_ID, { lifecycle: "CLOSED" });
    const open = buildHostApprovedSessionDetail(HOST_APPROVED_SESSION_ID, { attendanceMix: true });
    expect(closed).toMatchObject({ sessionId: HOST_APPROVED_SESSION_ID, state: "CLOSED" });
    expect(open?.state).toBe("OPEN");
    expect(open?.attendees.filter((attendee) => attendee.attendanceStatus === "ATTENDED").length).toBeGreaterThan(0);
    const status = buildHostApprovedClosingStatus(HOST_APPROVED_SESSION_ID, { lifecycle: "CLOSED" });
    expect(status?.overall.primaryAction).toBe("IMPORT_RECORDS");
    expect(status?.checklist.map((item) => item.id)).toEqual([
      "SESSION_CLOSED",
      "MEMBER_NOTIFICATION_SENT",
      "RECORD_PACKAGE_SAVED",
      "FEEDBACK_DOCUMENT_READY",
      "PUBLIC_RECORD_VISIBLE",
    ]);
    expect(parseHostSessionDetailResponse(closed!)).toMatchObject({ state: "CLOSED" });
  });

  it("keeps the records fixture on CLOSING_REQUIRED with CLOSED session-28", () => {
    expect(hostApprovedCurrentSelection("host-records", "https://visual-authority.example/app/host/records"))
      .toBe("CLOSING_REQUIRED");
    expect(hostApprovedCurrentSelection("host-operating-room", "https://visual-authority.example/app/host"))
      .toBe("OPEN");
    expect(hostApprovedCurrentSelection(
      "host-operating-room",
      "https://visual-authority.example/app/host?phase=closing",
    )).toBe("CLOSING_REQUIRED");
    expect(hostApprovedSessionDetailOptionsFor(
      "host-records",
      "https://visual-authority.example/app/host/records",
      HOST_APPROVED_SESSION_ID,
    )).toEqual({ lifecycle: "CLOSED" });
    expect(hostApprovedSessionDetailOptionsFor(
      "host-operating-room",
      "https://visual-authority.example/app/host",
      HOST_APPROVED_SESSION_ID,
    )).toEqual({ attendanceMix: true });
    expect(hostApprovedSessionDetailOptionsFor(
      "host-records",
      "https://visual-authority.example/app/host/records",
      "session-27",
    )).toBeUndefined();
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

  it("uses production clubs-only host auth without a platform space", () => {
    expect(buildHostApprovedAuth().availableSpaces?.kinds).toEqual(["CLUBS"]);
    expect(buildHostApprovedAuth().platformAdmin).toBeNull();
  });

  it("converts schedule-review recipients from the approved ledger", () => {
    expect(approvedScheduleReviewMembers.map((member) => member.membershipId)).toEqual([
      "membership-park",
      "membership-lee",
      "membership-kang",
      "membership-moon",
    ]);
  });

  it("accepts only the authenticated visual-authority preview POST with selected recipients and revision", () => {
    const selectedMembershipIds = [...approvedScheduleReviewMembers.map((member) => member.membershipId)].sort();
    const postData = JSON.stringify({
      sessionId: HOST_APPROVED_SESSION_ID,
      eventType: "SESSION_REMINDER_DUE",
      contentRevision: "e".repeat(64),
      audience: "SELECTED_MEMBERS",
      requestedChannels: "BOTH",
      selectedMembershipIds,
      excludedMembershipIds: [],
      includedMembershipIds: [],
      sendMode: "NOW",
      scheduleRevision: approvedScheduleReviewPreview.scheduleRevision,
      subject: approvedScheduleReviewPreview.template.subject,
      body: approvedScheduleReviewPreview.template.bodyPreview,
    });
    const url = `https://readmates.example${PREVIEW_NOTIFICATION_PATH}?clubSlug=${HOST_APPROVED_CLUB.clubSlug}`;

    expect(isApprovedHostPreviewPost({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      postData,
      url,
    })).toBe(true);
    expect(isApprovedHostPreviewPost({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      postData,
      url: `https://readmates.example${PREVIEW_NOTIFICATION_PATH}?clubSlug=other-club`,
    })).toBe(false);
    expect(isApprovedHostPreviewPost({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      postData: postData.replace('"contentRevision":"' + "e".repeat(64) + '"', '"contentRevision":"' + "a".repeat(64) + '"'),
      url,
    })).toBe(false);
    expect(isApprovedHostPreviewPost({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      postData: postData.replace('"scheduleRevision":4', '"scheduleRevision":5'),
      url,
    })).toBe(false);
    expect(isApprovedHostPreviewPost({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      postData: JSON.stringify({ confirm: true }),
      url,
    })).toBe(false);
  });
});
