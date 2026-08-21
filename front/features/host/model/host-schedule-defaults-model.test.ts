import { describe, expect, it } from "vitest";
import {
  applyScheduleDefaults,
  BUILTIN_SCHEDULE_DEFAULTS,
  mergeUntouchedScheduleDefaults,
  resolvedScheduleDefaults,
  scheduleTimeHint,
  type HostScheduleFormValues,
} from "./host-schedule-defaults-model";
import {
  normalizeHostSessionScheduleDefaults,
  type HostSessionScheduleDefaults,
} from "./host-schedule-defaults-state";

const clubDefaults: HostSessionScheduleDefaults = {
  automatic: {
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인",
    accessScope: "GUEST_READABLE",
    suggestedDate: "2026-06-11",
    questionDeadlineOffsetDays: 1,
  },
  previousOnlineMeeting: null,
  hints: ["이전 모임과 같은 시간으로 넣었습니다."],
};

describe("applyScheduleDefaults", () => {
  it("fills empty time and keeps typed book title", () => {
    const next = applyScheduleDefaults(
      { bookTitle: "새 책", bookAuthor: "", date: "", startTime: "", endTime: "", locationLabel: "" },
      clubDefaults,
    );
    expect(next.startTime).toBe("19:30");
    expect(next.date).toBe("2026-06-11");
    expect(next.bookTitle).toBe("새 책");
  });

  it("does not overwrite typed schedule fields", () => {
    const next = applyScheduleDefaults(
      {
        bookTitle: "새 책",
        bookAuthor: "새 저자",
        date: "2026-08-13",
        startTime: "18:00",
        endTime: "19:00",
        locationLabel: "카페",
        meetingUrl: "https://meeting.invalid/typed",
        meetingPasscode: "typed-code",
        accessScope: "HOST_ONLY" as const,
      },
      clubDefaults,
    );

    expect(next).toEqual({
      bookTitle: "새 책",
      bookAuthor: "새 저자",
      date: "2026-08-13",
      startTime: "18:00",
      endTime: "19:00",
      locationLabel: "카페",
      meetingUrl: "https://meeting.invalid/typed",
      meetingPasscode: "typed-code",
      accessScope: "HOST_ONLY",
    });
  });

  it("does not fill meeting url or passcode from previous online meeting", () => {
    const next = applyScheduleDefaults(
      {
        bookTitle: "",
        date: "",
        startTime: "",
        endTime: "",
        locationLabel: "",
        meetingUrl: "",
        meetingPasscode: "",
      },
      {
        ...clubDefaults,
        previousOnlineMeeting: {
          meetingUrl: "https://meeting.invalid/club",
          meetingPasscode: "room-code-2048",
        },
      },
    );

    expect(next.meetingUrl).toBe("");
    expect(next.meetingPasscode).toBe("");
    expect(next.endTime).toBe("21:30");
    expect(next.locationLabel).toBe("온라인");
  });

  it("leaves date empty when suggestedDate is missing", () => {
    const next = applyScheduleDefaults(
      { date: "", startTime: "", endTime: "", locationLabel: "" },
      {
        ...clubDefaults,
        automatic: { ...clubDefaults.automatic, suggestedDate: null },
      },
    );

    expect(next.date).toBe("");
    expect(next.startTime).toBe("19:30");
  });
});

describe("builtin schedule defaults", () => {
  it("uses 20:00, 22:00, and 온라인 when the club defaults request fails", () => {
    expect(BUILTIN_SCHEDULE_DEFAULTS).toMatchObject({
      automatic: {
        startTime: "20:00",
        endTime: "22:00",
        locationLabel: "온라인",
        accessScope: "HOST_ONLY",
        suggestedDate: null,
      },
      previousOnlineMeeting: null,
      hints: [],
    });
    expect(scheduleTimeHint(clubDefaults)).toBe("이전 모임과 같은 시간으로 넣었습니다.");
    expect(scheduleTimeHint(BUILTIN_SCHEDULE_DEFAULTS)).toBeNull();
    expect(resolvedScheduleDefaults(null)).toEqual(BUILTIN_SCHEDULE_DEFAULTS);
    expect(resolvedScheduleDefaults(undefined)).toEqual(BUILTIN_SCHEDULE_DEFAULTS);
    expect(resolvedScheduleDefaults(clubDefaults)).toEqual(clubDefaults);
  });
});

describe("mergeUntouchedScheduleDefaults", () => {
  const blankForm: HostScheduleFormValues = {
    bookTitle: "새 책",
    bookAuthor: "새 저자",
    date: "",
    startTime: "",
    endTime: "",
    locationLabel: "",
    meetingUrl: "",
    meetingPasscode: "",
    accessScope: "HOST_ONLY",
  };

  it("fills untouched automatic fields including an empty suggested date", () => {
    expect(mergeUntouchedScheduleDefaults(blankForm, clubDefaults, new Set())).toEqual({
      ...blankForm,
      date: "2026-06-11",
      startTime: "19:30",
      endTime: "21:30",
      locationLabel: "온라인",
      accessScope: "GUEST_READABLE",
    });
  });

  it("never overwrites a user-edited or explicitly cleared field", () => {
    const next = mergeUntouchedScheduleDefaults(
      {
        ...blankForm,
        date: "",
        startTime: "18:00",
        locationLabel: "",
      },
      clubDefaults,
      new Set(["date", "locationLabel"]),
    );

    expect(next.date).toBe("");
    expect(next.startTime).toBe("19:30");
    expect(next.locationLabel).toBe("");
    expect(next.endTime).toBe("21:30");
  });

  it("does not copy previous online meeting url or passcode into automatic fields", () => {
    const next = mergeUntouchedScheduleDefaults(
      blankForm,
      {
        ...clubDefaults,
        previousOnlineMeeting: {
          meetingUrl: "https://meeting.invalid/club",
          meetingPasscode: "room-code-2048",
        },
      },
      new Set(),
    );

    expect(next.meetingUrl).toBe("");
    expect(next.meetingPasscode).toBe("");
  });
});

describe("normalizeHostSessionScheduleDefaults", () => {
  it("keeps nested automatic fields and previous online meeting from a new server", () => {
    expect(
      normalizeHostSessionScheduleDefaults({
        automatic: clubDefaults.automatic,
        previousOnlineMeeting: {
          meetingUrl: "https://meeting.invalid/room",
          meetingPasscode: "room-code-2048",
        },
        hints: clubDefaults.hints,
        startTime: "18:00",
        meetingUrl: "https://meeting.invalid/legacy",
        meetingPasscode: "legacy-code",
      }),
    ).toEqual({
      automatic: clubDefaults.automatic,
      previousOnlineMeeting: {
        meetingUrl: "https://meeting.invalid/room",
        meetingPasscode: "room-code-2048",
      },
      hints: clubDefaults.hints,
    });
  });

  it("maps a flat legacy server into nested automatic fields and previous online meeting", () => {
    expect(
      normalizeHostSessionScheduleDefaults({
        startTime: "19:30",
        endTime: "21:30",
        locationLabel: "온라인",
        meetingUrl: "https://meeting.invalid/room",
        meetingPasscode: "room-code-2048",
        accessScope: "GUEST_READABLE",
        suggestedDate: "2026-06-11",
        questionDeadlineOffsetDays: 1,
        hints: ["이전 모임과 같은 시간으로 넣었습니다."],
      }),
    ).toEqual({
      automatic: clubDefaults.automatic,
      previousOnlineMeeting: {
        meetingUrl: "https://meeting.invalid/room",
        meetingPasscode: "room-code-2048",
      },
      hints: ["이전 모임과 같은 시간으로 넣었습니다."],
    });
  });
});
