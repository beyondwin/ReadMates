"use client";

import { useState, type CSSProperties } from "react";
import type { AttendanceStatus, RsvpStatus, SessionParticipationStatus } from "@/shared/api/readmates";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { rsvpLabel } from "@/shared/ui/readmates-display";

type HostSessionAttendanceAttendee = {
  membershipId: string;
  displayName: string;
  shortName: string;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  participationStatus?: SessionParticipationStatus;
};

type HostSessionAttendanceEditorProps = {
  hasSession: boolean;
  attendees?: HostSessionAttendanceAttendee[];
  attendanceStatuses: Record<string, AttendanceStatus>;
  emptyMessage: string;
  onUpdateAttendance: (membershipId: string, attendanceStatus: AttendanceStatus) => void;
};

function attendanceSelected(label: string, status: AttendanceStatus) {
  return (label === "참석" && status === "ATTENDED") || (label === "불참" && status === "ABSENT");
}

export function HostSessionAttendanceEditor({
  hasSession,
  attendees,
  attendanceStatuses,
  emptyMessage,
  onUpdateAttendance,
}: HostSessionAttendanceEditorProps) {
  const [showRemovedAttendees, setShowRemovedAttendees] = useState(false);

  if (!hasSession) {
    return (
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {emptyMessage}
      </p>
    );
  }

  const sessionAttendees = attendees ?? [];
  const activeAttendees = sessionAttendees.filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE");
  const removedAttendees = sessionAttendees.filter((attendee) => attendee.participationStatus === "REMOVED");

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {activeAttendees.length === 0 ? (
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          아직 참석 대상자가 없습니다.
        </p>
      ) : null}
      {activeAttendees.map((attendee, index) => {
        const rsvp = rsvpLabel(attendee.rsvpStatus);

        return (
          <div
            key={attendee.membershipId}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr auto auto",
              gap: "14px",
              padding: "12px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <AvatarChip name={attendee.displayName} fallbackInitial={attendee.shortName} label={attendee.displayName} size={24} />
            <span className="body" style={{ fontSize: "14px" }}>
              {attendee.displayName}
            </span>
            <span className="tiny mono" style={{ color: rsvp === "미응답" ? "var(--warn)" : "var(--text-3)" }}>
              RSVP {rsvp}
            </span>
            <div
              className="row"
              style={{
                gap: "4px",
                background: "var(--bg-sub)",
                padding: "2px",
                borderRadius: "999px",
                border: "1px solid var(--line)",
              }}
            >
              {["참석", "불참"].map((label) => {
                const selected = attendanceSelected(
                  label,
                  attendanceStatuses[attendee.membershipId] ?? attendee.attendanceStatus,
                );
                const attendanceStatus = label === "참석" ? "ATTENDED" : "ABSENT";

                return (
                  <button
                    key={label}
                    type="button"
                    aria-label={`${attendee.displayName} ${label}`}
                    aria-pressed={selected}
                    onClick={() => onUpdateAttendance(attendee.membershipId, attendanceStatus)}
                    style={{
                      height: "24px",
                      padding: "0 10px",
                      fontSize: "12px",
                      borderRadius: "999px",
                      background: selected ? "var(--bg)" : "transparent",
                      color: selected ? "var(--text)" : "var(--text-3)",
                      border: selected ? "1px solid var(--line)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {removedAttendees.length > 0 ? (
        <details
          open={showRemovedAttendees}
          onToggle={(event) => setShowRemovedAttendees(event.currentTarget.open)}
          style={{ borderTop: activeAttendees.length > 0 ? "1px solid var(--line-soft)" : undefined, paddingTop: "12px" }}
        >
          <summary className="small">제외된 참가자 {removedAttendees.length}명</summary>
          {showRemovedAttendees ? (
            <div className="stack" style={{ "--stack": "6px", marginTop: "8px" } as CSSProperties}>
              {removedAttendees.map((attendee) => (
                <div key={attendee.membershipId} className="small">
                  {attendee.displayName}
                </div>
              ))}
            </div>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
