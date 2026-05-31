import { describe, expect, it } from "vitest";
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  readingLoopDescription,
} from "./reading-loop";

describe("reading-loop model", () => {
  it("prioritizes no-session before role work", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: false,
        hostBlockerCount: 3,
        memberCanWrite: true,
        memberRsvpStatus: "NO_RESPONSE",
        memberHasCheckin: false,
        memberQuestionCount: 0,
      }),
    ).toBe("NO_SESSION");
  });

  it("keeps host setup blockers ahead of member prep", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        hostBlockerCount: 1,
        memberCanWrite: true,
        memberRsvpStatus: "NO_RESPONSE",
        memberHasCheckin: false,
        memberQuestionCount: 0,
      }),
    ).toBe("HOST_SETUP_REQUIRED");
  });

  it("detects member prep when RSVP, check-in, or questions are missing", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "NO_RESPONSE",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
      }),
    ).toBe("MEMBER_PREP_REQUIRED");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: false,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
      }),
    ).toBe("MEMBER_PREP_REQUIRED");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 1,
        minimumQuestionCount: 2,
      }),
    ).toBe("MEMBER_PREP_REQUIRED");
  });

  it("moves from ready to reflection and archive states", () => {
    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
        sessionDate: "2026-05-20",
        today: new Date(2026, 4, 19),
        memberHasReflection: false,
      }),
    ).toBe("SESSION_READY");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
        sessionDate: "2026-05-20",
        today: new Date(2026, 4, 21),
        memberHasReflection: false,
      }),
    ).toBe("REFLECTION_DUE");

    expect(
      deriveReadingLoopState({
        hasCurrentSession: true,
        memberCanWrite: true,
        memberRsvpStatus: "GOING",
        memberHasCheckin: true,
        memberQuestionCount: 2,
        minimumQuestionCount: 2,
        archiveItemCount: 1,
      }),
    ).toBe("ARCHIVE_AVAILABLE");
  });

  it("exposes stable Korean labels and descriptions", () => {
    expect(READING_LOOP_LABELS.MEMBER_PREP_REQUIRED).toBe("멤버 준비 필요");
    expect(readingLoopDescription("HOST_SETUP_REQUIRED")).toContain("호스트");
    expect(readingLoopDescription("ARCHIVE_AVAILABLE")).toContain("아카이브");
  });
});
