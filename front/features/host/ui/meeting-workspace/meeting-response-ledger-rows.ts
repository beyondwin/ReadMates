import type {
  MeetingAttendance,
  MeetingResponseLedgerAttendeeInput,
  MeetingResponseLedgerRow,
} from "./meeting-response-ledger";

export type MeetingDayAttendanceWriteState = NonNullable<MeetingResponseLedgerRow["writeState"]>;

function mapRsvpToLedgerResponse(
  status: MeetingResponseLedgerAttendeeInput["rsvpStatus"],
): MeetingResponseLedgerRow["response"] {
  if (status === "GOING") return "GOING";
  if (status === "MAYBE") return "UNSURE";
  if (status === "DECLINED") return "NOT_GOING";
  return "NO_RESPONSE";
}

export function meetingDayAttendanceWriteStateFromError(error: unknown): "conflict" | "error" {
  if (!error || typeof error !== "object") {
    return "error";
  }
  const status = "status" in error ? Number((error as { status?: unknown }).status) : Number.NaN;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (status === 409 || code === "CONFLICT" || code === "REVISION_CONFLICT") {
    return "conflict";
  }
  return "error";
}

export function patchMeetingDayAttendanceWriteStates(
  current: ReadonlyMap<string, MeetingDayAttendanceWriteState>,
  membershipIds: ReadonlyArray<string>,
  state: MeetingDayAttendanceWriteState | null,
): Map<string, MeetingDayAttendanceWriteState> {
  const next = new Map(current);
  for (const membershipId of membershipIds) {
    if (state == null) {
      next.delete(membershipId);
    } else {
      next.set(membershipId, state);
    }
  }
  return next;
}

export function meetingResponseLedgerRowsFromAttendees(
  attendees: ReadonlyArray<MeetingResponseLedgerAttendeeInput>,
  writeStates?: ReadonlyMap<string, MeetingDayAttendanceWriteState>,
): MeetingResponseLedgerRow[] {
  return attendees
    .filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE")
    .map((attendee) => ({
      membershipId: attendee.membershipId,
      displayName: attendee.displayName,
      secondaryLabel: attendee.accountName?.trim() || attendee.displayName,
      avatarKey: attendee.avatarKey,
      response: mapRsvpToLedgerResponse(attendee.rsvpStatus),
      attendance: attendee.attendanceStatus,
      attendanceRevision: attendee.attendanceRevision,
      questionCount: null,
      recentResponseLabel: null,
      writeState: writeStates?.get(attendee.membershipId),
    }));
}

export type { MeetingAttendance, MeetingResponseLedgerAttendeeInput, MeetingResponseLedgerRow };
