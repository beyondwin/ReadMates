import { memo } from "react";
import type { AttendanceStatus, HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import { HostSessionAttendanceEditor } from "../host-session-attendance-editor";

export const AttendancePanel = memo(function AttendancePanel({
  session,
  attendanceStatuses,
  emptyMessage,
  onUpdateAttendance,
}: {
  session?: HostSessionDetailResponse | null;
  attendanceStatuses: Record<string, AttendanceStatus>;
  emptyMessage: string;
  onUpdateAttendance: (membershipId: string, status: AttendanceStatus) => void;
}) {
  return (
    <div id="host-editor-panel-attendance">
      <div className="eyebrow">참석 명단</div>
      <h2 className="h3 editorial" style={{ margin: "6px 0 14px" }}>출석 확정 명단</h2>
      <HostSessionAttendanceEditor
        hasSession={Boolean(session)}
        attendees={session?.attendees}
        attendanceStatuses={attendanceStatuses}
        emptyMessage={emptyMessage}
        onUpdateAttendance={onUpdateAttendance}
      />
    </div>
  );
});
