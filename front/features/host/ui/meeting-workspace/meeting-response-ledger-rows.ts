import type {
  MeetingAttendance,
  MeetingResponseLedgerAttendeeInput,
  MeetingResponseLedgerRow,
} from "./meeting-response-ledger";

function mapRsvpToLedgerResponse(
  status: MeetingResponseLedgerAttendeeInput["rsvpStatus"],
): MeetingResponseLedgerRow["response"] {
  if (status === "GOING") return "GOING";
  if (status === "MAYBE") return "UNSURE";
  if (status === "DECLINED") return "NOT_GOING";
  return "NO_RESPONSE";
}

export function meetingResponseLedgerRowsFromAttendees(
  attendees: ReadonlyArray<MeetingResponseLedgerAttendeeInput>,
): MeetingResponseLedgerRow[] {
  return attendees
    .filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE")
    .map((attendee) => ({
      membershipId: attendee.membershipId,
      displayName: attendee.displayName,
      secondaryLabel: attendee.accountName?.trim() || attendee.displayName,
      response: mapRsvpToLedgerResponse(attendee.rsvpStatus),
      attendance: attendee.attendanceStatus,
      attendanceRevision: attendee.attendanceRevision,
      questionCount: null,
      recentResponseLabel: null,
    }));
}

export type { MeetingAttendance, MeetingResponseLedgerAttendeeInput, MeetingResponseLedgerRow };
