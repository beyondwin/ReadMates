import { describe, expect, it } from "vitest";
import { formatDateWithWeekday, formatKoreanTime } from "@/shared/ui/readmates-display";

describe("formatDateWithWeekday", () => {
  it("formats a calendar date as month, day, and weekday", () => {
    expect(formatDateWithWeekday("2026-09-01", "날짜 미정")).toBe("9월 1일 화요일");
    expect(formatDateWithWeekday("", "날짜 미정")).toBe("날짜 미정");
    expect(formatDateWithWeekday(null, "날짜 미정")).toBe("날짜 미정");
  });
});

describe("formatKoreanTime", () => {
  it("formats a 24-hour clock as Korean 오전/오후 time without an end time", () => {
    expect(formatKoreanTime("19:30", "시간 미정")).toBe("오후 7:30");
    expect(formatKoreanTime("09:05", "시간 미정")).toBe("오전 9:05");
    expect(formatKoreanTime("", "시간 미정")).toBe("시간 미정");
    expect(formatKoreanTime(null, "시간 미정")).toBe("시간 미정");
  });
});
