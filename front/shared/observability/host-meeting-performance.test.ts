import { afterEach, describe, expect, it } from "vitest";
import {
  HOST_MEETING_PERFORMANCE_MARKS,
  HOST_MEETING_PERFORMANCE_METRICS,
  beginHostMeetingAttendanceCommit,
  beginHostMeetingFilterCommit,
  beginHostMeetingRouteCommit,
  commitHostMeetingAttendanceRow,
  commitHostMeetingFilterRaf,
  commitHostMeetingFirstUsable,
  resetHostMeetingPerformanceStateForTests,
} from "./host-meeting-performance";

afterEach(() => resetHostMeetingPerformanceStateForTests());

describe("host meeting performance observability", () => {
  it("publishes exactly the five approved metrics", () => {
    expect(Object.values(HOST_MEETING_PERFORMANCE_METRICS)).toEqual([
      "host-meeting-decoded-json-bytes",
      "host-meeting-route-data-to-usable",
      "host-meeting-input-to-raf-commit",
      "host-meeting-authoritative-save-to-row-commit",
      "host-meeting-forced-gc-heap-delta",
    ]);
  });

  it("pairs route and filter marks into named measures", () => {
    beginHostMeetingRouteCommit();
    commitHostMeetingFirstUsable();
    beginHostMeetingFilterCommit();
    commitHostMeetingFilterRaf();

    expect(performance.getEntriesByName(HOST_MEETING_PERFORMANCE_MARKS.routeDataReady)).toHaveLength(0);
    expect(performance.getEntriesByName(HOST_MEETING_PERFORMANCE_MARKS.firstUsable)).toHaveLength(1);
    expect(performance.getEntriesByName(HOST_MEETING_PERFORMANCE_METRICS.routeDataToUsable)).toHaveLength(1);
    expect(performance.getEntriesByName(HOST_MEETING_PERFORMANCE_METRICS.inputToRafCommit)).toHaveLength(1);
  });

  it("commits a save measurement only when the accepted row reaches the target value", () => {
    beginHostMeetingAttendanceCommit({ membershipId: "member-1", attendanceStatus: "ATTENDED", attendanceRevision: 3 });
    expect(commitHostMeetingAttendanceRow([{ membershipId: "member-1", attendance: "ATTENDED", attendanceRevision: 2 }])).toBe(false);
    expect(commitHostMeetingAttendanceRow([{ membershipId: "member-1", attendance: "ATTENDED", attendanceRevision: 3 }])).toBe(true);
    expect(performance.getEntriesByName(HOST_MEETING_PERFORMANCE_METRICS.authoritativeSaveToRowCommit)).toHaveLength(1);
    expect(commitHostMeetingAttendanceRow([{ membershipId: "member-1", attendance: "ATTENDED", attendanceRevision: 3 }])).toBe(false);
  });
});
