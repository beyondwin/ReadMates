import { describe, expect, it } from "vitest";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import {
  hostScheduleSeenRows,
  hostScheduleSeenStateLabel,
  hostScheduleSeenSummary,
} from "./host-schedule-seen-model";

function detail(
  overrides: Partial<HostSessionDetailResponse> = {},
): HostSessionDetailResponse {
  return {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "함께 읽기",
    bookTitle: "모비 딕",
    bookAuthor: "허먼 멜빌",
    bookLink: null,
    bookImageUrl: null,
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    date: "2026-08-30",
    startTime: "19:00",
    endTime: "21:00",
    questionDeadlineAt: "2026-08-29T10:00:00Z",
    visibility: "MEMBER",
    publication: null,
    state: "OPEN",
    scheduleRevision: 7,
    scheduleSeenAvailability: "AVAILABLE",
    scheduleSeenSummary: {
      currentCount: 1,
      staleCount: 1,
      unseenCount: 1,
      eligibleCount: 3,
    },
    versions: {
      sessionRevision: 4,
      scheduleRevision: 7,
      exposureRevision: 1,
      participantSetRevision: 3,
      recordDraftRevision: null,
      liveRecordRevision: null,
      publicationRevision: 0,
    },
    attendanceSnapshotId: "attendance-snapshot-3",
    attendees: [
      {
        membershipId: "current",
        avatarKey: "banana-green-book",
        displayName: "현재 확인",
        accountName: "current",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "ACTIVE",
        attendanceRevision: 4,
        seenScheduleRevision: 7,
        scheduleSeenAt: "2026-08-29T10:00:00Z",
        scheduleSeenState: "CURRENT",
      },
      {
        membershipId: "stale",
        avatarKey: "banana-yellow-book",
        displayName: "변경 전 확인",
        accountName: "stale",
        rsvpStatus: "DECLINED",
        attendanceStatus: "ABSENT",
        participationStatus: "ACTIVE",
        attendanceRevision: 3,
        seenScheduleRevision: 6,
        scheduleSeenAt: "2026-08-28T10:00:00Z",
        scheduleSeenState: "STALE",
      },
      {
        membershipId: "unseen",
        avatarKey: "banana-red-book",
        displayName: "미열람",
        accountName: "unseen",
        rsvpStatus: "NO_RESPONSE",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
        attendanceRevision: 0,
        seenScheduleRevision: null,
        scheduleSeenAt: null,
        scheduleSeenState: "UNSEEN",
      },
      {
        membershipId: "removed",
        avatarKey: "banana-blue-book",
        displayName: "제외된 참여자",
        accountName: "removed",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "REMOVED",
        attendanceRevision: 9,
        seenScheduleRevision: null,
        scheduleSeenAt: null,
        scheduleSeenState: "UNSEEN",
      },
    ],
    feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
    ...overrides,
  };
}

describe("host schedule seen state", () => {
  it("uses the approved Korean labels for server-owned states", () => {
    expect(hostScheduleSeenStateLabel("CURRENT")).toBe("현재 일정 확인");
    expect(hostScheduleSeenStateLabel("STALE")).toBe("변경 전 확인");
    expect(hostScheduleSeenStateLabel("UNSEEN")).toBe("미열람");
  });

  it("orders active rows as unseen, stale, then current", () => {
    expect(hostScheduleSeenRows(detail()).map((row) => row.membershipId)).toEqual([
      "unseen",
      "stale",
      "current",
    ]);
  });

  it("uses the server state without inferring schedule review from RSVP or attendance", () => {
    const rows = hostScheduleSeenRows(detail());

    expect(rows).toEqual([
      {
        membershipId: "unseen",
        displayName: "미열람",
        avatarKey: "banana-red-book",
        state: "UNSEEN",
        seenScheduleRevision: null,
        scheduleSeenAt: null,
      },
      {
        membershipId: "stale",
        displayName: "변경 전 확인",
        avatarKey: "banana-yellow-book",
        state: "STALE",
        seenScheduleRevision: 6,
        scheduleSeenAt: "2026-08-28T10:00:00Z",
      },
      {
        membershipId: "current",
        displayName: "현재 확인",
        avatarKey: "banana-green-book",
        state: "CURRENT",
        seenScheduleRevision: 7,
        scheduleSeenAt: "2026-08-29T10:00:00Z",
      },
    ]);
  });

  it("uses the server denominator and excludes removed participants from review rows", () => {
    expect(hostScheduleSeenSummary(detail())).toEqual({
      availability: "AVAILABLE",
      scheduleRevision: 7,
      eligibleCount: 3,
      states: [
        { state: "UNSEEN", label: "미열람", count: 1 },
        { state: "STALE", label: "변경 전 확인", count: 1 },
        { state: "CURRENT", label: "현재 일정 확인", count: 1 },
      ],
    });
    expect(hostScheduleSeenRows(detail()).some((row) => row.membershipId === "removed")).toBe(false);
  });

  it("keeps unavailable server counts unavailable instead of estimating a denominator", () => {
    expect(hostScheduleSeenSummary(detail({
      state: "DRAFT",
      scheduleSeenAvailability: "UNAVAILABLE",
      scheduleSeenSummary: {
        currentCount: null,
        staleCount: null,
        unseenCount: null,
        eligibleCount: null,
      },
    }))).toEqual({
      availability: "UNAVAILABLE",
      scheduleRevision: 7,
      eligibleCount: null,
      states: [
        { state: "UNSEEN", label: "미열람", count: null },
        { state: "STALE", label: "변경 전 확인", count: null },
        { state: "CURRENT", label: "현재 일정 확인", count: null },
      ],
    });
  });
});
