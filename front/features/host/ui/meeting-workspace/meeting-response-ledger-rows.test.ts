import { describe, expect, it } from "vitest";
import {
  meetingDayAttendanceWriteStateFromError,
  meetingResponseLedgerRowsFromAttendees,
  patchMeetingDayAttendanceWriteStates,
} from "./meeting-response-ledger-rows";

const attendee = {
  membershipId: "m-1",
  displayName: "지후",
  accountName: "reader-a",
  rsvpStatus: "GOING" as const,
  attendanceStatus: "UNKNOWN" as const,
  attendanceRevision: 1,
  participationStatus: "ACTIVE" as const,
};

describe("meetingResponseLedgerRowsFromAttendees", () => {
  it("carries per-id writeState into ledger rows", () => {
    const rows = meetingResponseLedgerRowsFromAttendees(
      [attendee],
      new Map([["m-1", "conflict"]]),
    );
    expect(rows[0]?.writeState).toBe("conflict");
  });
});

describe("meetingDayAttendanceWriteStateFromError", () => {
  it("maps 409 and conflict codes to conflict, anything else to error", () => {
    expect(meetingDayAttendanceWriteStateFromError({ status: 409, code: "CONFLICT" })).toBe("conflict");
    expect(meetingDayAttendanceWriteStateFromError({ status: 409, code: "REVISION_CONFLICT" })).toBe("conflict");
    expect(meetingDayAttendanceWriteStateFromError({ status: 500, code: "INTERNAL_ERROR" })).toBe("error");
    expect(meetingDayAttendanceWriteStateFromError(new Error("network"))).toBe("error");
  });
});

describe("patchMeetingDayAttendanceWriteStates", () => {
  it("sets and clears per-id states without mutating the previous map", () => {
    const empty = new Map<string, "saving">();
    const saving = patchMeetingDayAttendanceWriteStates(empty, ["m-1", "m-2"], "saving");
    expect(empty.size).toBe(0);
    expect([...saving.entries()]).toEqual([["m-1", "saving"], ["m-2", "saving"]]);
    const cleared = patchMeetingDayAttendanceWriteStates(saving, ["m-1"], null);
    expect(cleared.has("m-1")).toBe(false);
    expect(cleared.get("m-2")).toBe("saving");
  });
});
