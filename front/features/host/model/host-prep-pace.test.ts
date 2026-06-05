import { describe, expect, it } from "vitest";
import { deriveHostPrepPace } from "./host-prep-pace";

const today = new Date(2026, 5, 4); // 2026-06-04 local

const ready = {
  hasSession: true,
  hasCoreSessionInfo: true,
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
  today,
};

describe("deriveHostPrepPace", () => {
  it("returns STEADY with null daysRemaining when there is no session", () => {
    const pace = deriveHostPrepPace({ ...ready, hasSession: false, sessionDate: null });
    expect(pace.tier).toBe("STEADY");
    expect(pace.daysRemaining).toBeNull();
    expect(pace.mostUrgentItem).toBeNull();
  });

  it("returns STEADY pre-session when nothing is pending", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-10" });
    expect(pace.tier).toBe("STEADY");
    expect(pace.daysRemaining).toBe(6);
  });

  it("returns ON_TRACK when a pending item has comfortable slack", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-20", rsvpPending: 2 });
    expect(pace.tier).toBe("ON_TRACK");
    expect(pace.mostUrgentItem?.id).toBe("rsvp");
  });

  it("returns ON_TRACK at the slack boundary (slack 2)", () => {
    expect(deriveHostPrepPace({ ...ready, sessionDate: "2026-06-09", rsvpPending: 1 }).tier).toBe("ON_TRACK");
  });

  it("returns TIGHT when a pending item is at its deadline window (slack 0)", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-07", rsvpPending: 1 });
    expect(pace.tier).toBe("TIGHT");
    expect(pace.mostUrgentItem?.id).toBe("rsvp");
  });

  it("returns URGENT when a pending item is past its deadline window (slack < 0)", () => {
    expect(deriveHostPrepPace({ ...ready, sessionDate: "2026-06-05", rsvpPending: 1 }).tier).toBe("URGENT");
  });

  it("treats missing core info against the D-7 window", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-06", hasCoreSessionInfo: false });
    expect(pace.tier).toBe("URGENT");
    expect(pace.mostUrgentItem?.id).toBe("session-basics");
  });

  it("picks the most urgent (lowest slack) item when several are pending", () => {
    const pace = deriveHostPrepPace({
      ...ready,
      sessionDate: "2026-06-14",
      hasCoreSessionInfo: false,
      rsvpPending: 1,
    });
    expect(pace.mostUrgentItem?.id).toBe("session-basics");
    expect(pace.tier).toBe("ON_TRACK");
  });

  it("returns OVERDUE after the meeting day when closeout work remains", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-01", publishPending: 1 });
    expect(pace.tier).toBe("OVERDUE");
    expect(pace.daysRemaining).toBe(-3);
  });

  it("returns STEADY after the meeting day when no closeout work remains", () => {
    expect(deriveHostPrepPace({ ...ready, sessionDate: "2026-06-01" }).tier).toBe("STEADY");
  });

  it("returns ON_TRACK with null daysRemaining when date is unparseable but work is pending", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "nope", rsvpPending: 1 });
    expect(pace.tier).toBe("ON_TRACK");
    expect(pace.daysRemaining).toBeNull();
  });

  it("returns STEADY with null daysRemaining when date is unparseable and nothing is pending", () => {
    expect(deriveHostPrepPace({ ...ready, sessionDate: null }).tier).toBe("STEADY");
  });

  it("always exposes a label and message", () => {
    const pace = deriveHostPrepPace({ ...ready, sessionDate: "2026-06-05", rsvpPending: 2 });
    expect(pace.label).toBe("임박");
    expect(pace.message).toContain("RSVP 미응답 2명");
  });
});
