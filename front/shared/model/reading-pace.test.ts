import { describe, expect, it } from "vitest";
import { deriveReadingPace } from "./reading-pace";

const today = new Date(2026, 5, 4); // 2026-06-04 local

describe("deriveReadingPace", () => {
  it("returns COMPLETED when progress is 100 regardless of date", () => {
    const pace = deriveReadingPace({ readingProgress: 100, sessionDate: "2026-06-05", today });
    expect(pace.tier).toBe("COMPLETED");
    expect(pace.daysRemaining).toBe(1);
  });

  it("returns ON_TRACK (neutral) with no/invalid date", () => {
    expect(deriveReadingPace({ readingProgress: 40, sessionDate: null, today }).tier).toBe("ON_TRACK");
    expect(deriveReadingPace({ readingProgress: 40, sessionDate: "nope", today }).daysRemaining).toBeNull();
  });

  it("returns AMPLE when deadline is far (> 5 days)", () => {
    expect(deriveReadingPace({ readingProgress: 5, sessionDate: "2026-06-12", today }).tier).toBe("AMPLE");
  });

  it("returns ON_TRACK for a moderate window (4-5 days)", () => {
    expect(deriveReadingPace({ readingProgress: 10, sessionDate: "2026-06-08", today }).tier).toBe("ON_TRACK");
  });

  it("near deadline (<= 3 days) splits by progress", () => {
    expect(deriveReadingPace({ readingProgress: 30, sessionDate: "2026-06-06", today }).tier).toBe("URGENT");
    expect(deriveReadingPace({ readingProgress: 60, sessionDate: "2026-06-06", today }).tier).toBe("TIGHT");
    expect(deriveReadingPace({ readingProgress: 90, sessionDate: "2026-06-06", today }).tier).toBe("ON_TRACK");
  });

  it("treats a passed deadline as near-deadline bucket", () => {
    expect(deriveReadingPace({ readingProgress: 30, sessionDate: "2026-06-01", today }).tier).toBe("URGENT");
  });

  it("provides a label and message for every tier", () => {
    for (const date of ["2026-06-12", "2026-06-08", "2026-06-06", null]) {
      const pace = deriveReadingPace({ readingProgress: 30, sessionDate: date, today });
      expect(pace.label.length).toBeGreaterThan(0);
      expect(pace.message.length).toBeGreaterThan(0);
    }
  });
});
