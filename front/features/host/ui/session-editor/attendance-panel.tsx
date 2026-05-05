import type { AttendanceStatus, HostSessionDetailResponse } from "@/features/host/ui/host-ui-types";
import { HostSessionAttendanceEditor } from "../host-session-attendance-editor";
import { Panel } from "./session-editor-panel";
import type { MobileEditorSection } from "./mobile-editor-tabs";

export function AttendancePanel({
  activeMobileSection,
  session,
  attendanceStatuses,
  emptyMessage,
  onUpdateAttendance,
}: {
  activeMobileSection: MobileEditorSection;
  session?: HostSessionDetailResponse | null;
  attendanceStatuses: Record<string, AttendanceStatus>;
  emptyMessage: string;
  onUpdateAttendance: (membershipId: string, status: AttendanceStatus) => void;
}) {
  return (
    <Panel
      eyebrow="참석 명단"
      title="출석 확정 명단"
      mobileSection="attendance"
      panelId="host-editor-panel-attendance"
      activeMobileSection={activeMobileSection}
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
}
