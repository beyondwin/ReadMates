import { memo } from "react";
import type { HostSessionEditorSection } from "@/features/host/model/host-session-editor-navigation";
import type { AttendanceStatus, HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import { HostSessionAttendanceEditor } from "../host-session-attendance-editor";
import { Panel } from "./session-editor-panel";

export const AttendancePanel = memo(function AttendancePanel({
  activeSection,
  session,
  attendanceStatuses,
  emptyMessage,
  onUpdateAttendance,
}: {
  activeSection: HostSessionEditorSection;
  session?: HostSessionDetailResponse | null;
  attendanceStatuses: Record<string, AttendanceStatus>;
  emptyMessage: string;
  onUpdateAttendance: (membershipId: string, status: AttendanceStatus) => void;
}) {
  return (
    <Panel
      eyebrow="참석 명단"
      title="출석 확정 명단"
      section="attendance"
      panelId="host-editor-panel-attendance"
      activeSection={activeSection}
    >
      <HostSessionAttendanceEditor
        hasSession={Boolean(session)}
        attendees={session?.attendees}
        attendanceStatuses={attendanceStatuses}
        emptyMessage={emptyMessage}
        onUpdateAttendance={onUpdateAttendance}
      />
    </Panel>
  );
});
