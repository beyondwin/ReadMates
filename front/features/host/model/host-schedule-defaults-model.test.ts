import { describe, expect, it } from "vitest";
import {
  applyScheduleDefaults,
  BUILTIN_SCHEDULE_DEFAULTS,
  resolvedScheduleDefaults,
  scheduleTimeHint,
} from "./host-schedule-defaults-model";

const clubDefaults = {
  startTime: "19:30",
  endTime: "21:30",
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  accessScope: "GUEST_READABLE",
  suggestedDate: "2026-06-11",
  questionDeadlineOffsetDays: 1,
  hints: ["이전 모임과 같은 시간으로 넣었습니다."],
};

describe("applyScheduleDefaults", () => {
  it("fills empty time and keeps typed book title", () => {
    const next = applyScheduleDefaults(
      { bookTitle: "새 책", bookAuthor: "", date: "", startTime: "", endTime: "", locationLabel: "" },
      {
        startTime: "19:30",
        endTime: "21:30",
        locationLabel: "온라인",
        meetingUrl: null,
        meetingPasscode: null,
        accessScope: "GUEST_READABLE",
        suggestedDate: "2026-06-11",
        questionDeadlineOffsetDays: 1,
        hints: ["이전 모임과 같은 시간으로 넣었습니다."],
      },
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
        meetingUrl: "https://meet.example.com/typed",
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
      meetingUrl: "https://meet.example.com/typed",
      meetingPasscode: "typed-code",
      accessScope: "HOST_ONLY",
    });
  });

  it("fills empty meeting url and passcode from the same defaults row", () => {
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
        meetingUrl: "https://meet.example.com/club",
        meetingPasscode: "room-code",
      },
    );

    expect(next.meetingUrl).toBe("https://meet.example.com/club");
    expect(next.meetingPasscode).toBe("room-code");
    expect(next.endTime).toBe("21:30");
    expect(next.locationLabel).toBe("온라인");
  });

  it("leaves date empty when suggestedDate is missing", () => {
    const next = applyScheduleDefaults(
      { date: "", startTime: "", endTime: "", locationLabel: "" },
      { ...clubDefaults, suggestedDate: null },
    );

    expect(next.date).toBe("");
    expect(next.startTime).toBe("19:30");
  });
});

describe("builtin schedule defaults", () => {
  it("uses 20:00, 22:00, and 온라인 when the club defaults request fails", () => {
    expect(BUILTIN_SCHEDULE_DEFAULTS).toMatchObject({
      startTime: "20:00",
      endTime: "22:00",
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      accessScope: "HOST_ONLY",
      suggestedDate: null,
      hints: [],
    });
    expect(scheduleTimeHint(clubDefaults)).toBe("이전 모임과 같은 시간으로 넣었습니다.");
    expect(scheduleTimeHint(BUILTIN_SCHEDULE_DEFAULTS)).toBeNull();
    expect(resolvedScheduleDefaults(null)).toEqual(BUILTIN_SCHEDULE_DEFAULTS);
    expect(resolvedScheduleDefaults(undefined)).toEqual(BUILTIN_SCHEDULE_DEFAULTS);
    expect(resolvedScheduleDefaults(clubDefaults)).toEqual(clubDefaults);
  });
});
