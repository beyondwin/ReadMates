import { describe, expect, it } from "vitest";
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import {
  hostSessionDetailResponse,
  withServerScheduleSeenSummary,
} from "../e2e/aigen-test-fixtures";

function attendee(
  index: number,
  state: "CURRENT" | "STALE" | "UNSEEN",
): HostSessionDetailResponse["attendees"][number] {
  return {
    membershipId: `fixture-member-${index}`,
    avatarKey: "banana-green-book",
    displayName: `Fixture member ${index}`,
    accountName: `Fixture account ${index}`,
    rsvpStatus: "GOING",
    attendanceStatus: "ATTENDED",
    participationStatus: "ACTIVE",
    attendanceRevision: 1,
    seenScheduleRevision: state === "UNSEEN" ? null : 1,
    scheduleSeenAt: state === "UNSEEN" ? null : "2026-08-29T01:02:03Z",
    scheduleSeenState: state,
  };
}

describe("AIGen HostSessionDetail fixture schedule-seen invariant", () => {
  it("uses the server UNAVAILABLE shape when an open session has no eligible attendees", () => {
    const detail = hostSessionDetailResponse("session-empty");

    expect(detail.scheduleSeenAvailability).toBe("UNAVAILABLE");
    expect(detail.scheduleSeenSummary).toEqual({
      currentCount: null,
      staleCount: null,
      unseenCount: null,
      eligibleCount: null,
    });
  });

  it("derives the exact server counts for 500 mixed eligible attendees", () => {
    const detail = withServerScheduleSeenSummary({
      ...hostSessionDetailResponse("session-500"),
      attendees: Array.from({ length: 500 }, (_, index) => (
        attendee(index + 1, index % 2 === 0 ? "CURRENT" : "UNSEEN")
      )),
    });

    expect(detail.scheduleSeenAvailability).toBe("AVAILABLE");
    expect(detail.scheduleSeenSummary).toEqual({
      currentCount: 250,
      staleCount: 0,
      unseenCount: 250,
      eligibleCount: 500,
    });
  });

  it("derives two current attendees without inventing stale or unseen members", () => {
    const detail = withServerScheduleSeenSummary({
      ...hostSessionDetailResponse("session-two-current"),
      attendees: [attendee(1, "CURRENT"), attendee(2, "CURRENT")],
    });

    expect(detail.scheduleSeenAvailability).toBe("AVAILABLE");
    expect(detail.scheduleSeenSummary).toEqual({
      currentCount: 2,
      staleCount: 0,
      unseenCount: 0,
      eligibleCount: 2,
    });
  });
});
