export const HOST_MEETING_PERFORMANCE_METRICS = {
  decodedJsonBytes: "host-meeting-decoded-json-bytes",
  routeDataToUsable: "host-meeting-route-data-to-usable",
  inputToRafCommit: "host-meeting-input-to-raf-commit",
  authoritativeSaveToRowCommit: "host-meeting-authoritative-save-to-row-commit",
  forcedGcHeapDelta: "host-meeting-forced-gc-heap-delta",
} as const;

export const HOST_MEETING_PERFORMANCE_MARKS = {
  routeDataReady: "host-meeting-route-data-ready",
  firstUsable: "host-meeting-first-usable-control",
  input: "host-meeting-input-event",
  filterRafCommit: "host-meeting-filter-raf-commit",
  authoritativeSaveAccepted: "host-meeting-authoritative-save-accepted",
  rowCommit: "host-meeting-row-commit",
} as const;

type AttendanceTarget = {
  membershipId: string;
  attendanceStatus: "ATTENDED" | "ABSENT" | "UNKNOWN";
  attendanceRevision: number;
};

let pendingAttendanceTarget: AttendanceTarget | null = null;

function supported(): boolean {
  return typeof globalThis.performance !== "undefined"
    && typeof globalThis.performance.mark === "function"
    && typeof globalThis.performance.measure === "function";
}

function begin(mark: string, measure: string, startTime?: number): void {
  if (!supported()) return;
  performance.clearMarks(mark);
  performance.clearMeasures(measure);
  performance.mark(mark, startTime === undefined ? undefined : { startTime });
}

function commit(start: string, end: string, measure: string): void {
  if (!supported() || performance.getEntriesByName(start, "mark").length === 0) return;
  performance.clearMarks(end);
  performance.mark(end);
  performance.measure(measure, start, end);
  performance.clearMarks(start);
}

export function beginHostMeetingRouteCommit(dataReadyAtEpochMs?: number): void {
  if (!supported()) return;
  const startTime = dataReadyAtEpochMs === undefined
    ? undefined
    : Math.max(0, dataReadyAtEpochMs - performance.timeOrigin);
  begin(
    HOST_MEETING_PERFORMANCE_MARKS.routeDataReady,
    HOST_MEETING_PERFORMANCE_METRICS.routeDataToUsable,
    startTime,
  );
}

export function commitHostMeetingFirstUsable(): void {
  commit(
    HOST_MEETING_PERFORMANCE_MARKS.routeDataReady,
    HOST_MEETING_PERFORMANCE_MARKS.firstUsable,
    HOST_MEETING_PERFORMANCE_METRICS.routeDataToUsable,
  );
}

export function beginHostMeetingFilterCommit(): void {
  begin(HOST_MEETING_PERFORMANCE_MARKS.input, HOST_MEETING_PERFORMANCE_METRICS.inputToRafCommit);
}

export function commitHostMeetingFilterRaf(): void {
  commit(
    HOST_MEETING_PERFORMANCE_MARKS.input,
    HOST_MEETING_PERFORMANCE_MARKS.filterRafCommit,
    HOST_MEETING_PERFORMANCE_METRICS.inputToRafCommit,
  );
}

export function beginHostMeetingAttendanceCommit(target: AttendanceTarget): void {
  pendingAttendanceTarget = target;
  begin(
    HOST_MEETING_PERFORMANCE_MARKS.authoritativeSaveAccepted,
    HOST_MEETING_PERFORMANCE_METRICS.authoritativeSaveToRowCommit,
  );
}

export function commitHostMeetingAttendanceRow(
  rows: ReadonlyArray<{ membershipId: string; attendance: AttendanceTarget["attendanceStatus"]; attendanceRevision: number }>,
): boolean {
  const target = pendingAttendanceTarget;
  if (!target || !rows.some((row) => row.membershipId === target.membershipId
    && row.attendance === target.attendanceStatus
    && row.attendanceRevision === target.attendanceRevision)) {
    return false;
  }
  pendingAttendanceTarget = null;
  commit(
    HOST_MEETING_PERFORMANCE_MARKS.authoritativeSaveAccepted,
    HOST_MEETING_PERFORMANCE_MARKS.rowCommit,
    HOST_MEETING_PERFORMANCE_METRICS.authoritativeSaveToRowCommit,
  );
  return true;
}

export function resetHostMeetingPerformanceStateForTests(): void {
  pendingAttendanceTarget = null;
  if (!supported()) return;
  Object.values(HOST_MEETING_PERFORMANCE_MARKS).forEach((name) => performance.clearMarks(name));
  Object.values(HOST_MEETING_PERFORMANCE_METRICS).forEach((name) => performance.clearMeasures(name));
}
