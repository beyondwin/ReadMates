import { describe, expect, it } from "vitest";
import {
  attendanceLabel,
  displayText,
  formatDateOnlyLabel,
  formatDateLabel,
  formatDeadlineLabel,
  hostAlertStateLabel,
  nonNegativeCount,
  rsvpLabel,
} from "@/shared/ui/readmates-display";

describe("readmates display helpers", () => {
  it("normalizes empty display text", () => {
    expect(displayText("테스트", "정보 없음")).toBe("테스트");
    expect(displayText("  테스트  ", "정보 없음")).toBe("테스트");
    expect(displayText("", "정보 없음")).toBe("정보 없음");
    expect(displayText("   ", "정보 없음")).toBe("정보 없음");
    expect(displayText(null, "정보 없음")).toBe("정보 없음");
    expect(displayText(undefined, "정보 없음")).toBe("정보 없음");
  });

  it("formats dates defensively", () => {
    expect(formatDateLabel("2026-05-20")).toBe("2026.05.20");
    expect(formatDateLabel("bad-date")).toBe("bad-date");
    expect(formatDateLabel("", "미정")).toBe("미정");
    expect(formatDateLabel(null, "미정")).toBe("미정");
    expect(formatDateLabel(undefined, "미정")).toBe("미정");
  });

  it("formats date-only labels from ISO dates and timestamps", () => {
    expect(formatDateOnlyLabel("2026-05-20")).toBe("2026.05.20");
    expect(formatDateOnlyLabel("2026-05-20T14:59:00Z")).toBe("2026.05.20");
    expect(formatDateOnlyLabel("2026-05-20T14:59:00+09:00")).toBe("2026.05.20");
    expect(formatDateOnlyLabel("bad-date")).toBe("미정");
    expect(formatDateOnlyLabel("2026-02-30")).toBe("미정");
    expect(formatDateOnlyLabel("2026-05-20Tbad")).toBe("미정");
    expect(formatDateOnlyLabel("")).toBe("미정");
    expect(formatDateOnlyLabel("   ")).toBe("미정");
    expect(formatDateOnlyLabel("bad-date", "날짜 없음")).toBe("날짜 없음");
    expect(formatDateOnlyLabel("", "날짜 없음")).toBe("날짜 없음");
    expect(formatDateOnlyLabel(null, "날짜 없음")).toBe("날짜 없음");
    expect(formatDateOnlyLabel(undefined, "날짜 없음")).toBe("날짜 없음");
  });

  it("formats deadline timestamps and preserves invalid values", () => {
    expect(formatDeadlineLabel("2026-05-19T14:59:00")).toBe("05.19 14:59");
    expect(formatDeadlineLabel("2026-05-19T14:59:00Z")).toMatch(/\d{2}\.\d{2} \d{2}:\d{2}/);
    expect(formatDeadlineLabel("마감 미정")).toBe("마감 미정");
    expect(formatDeadlineLabel("", "마감 미정")).toBe("마감 미정");
    expect(formatDeadlineLabel(null, "마감 미정")).toBe("마감 미정");
    expect(formatDeadlineLabel(undefined, "마감 미정")).toBe("마감 미정");
  });

  it("labels RSVP statuses", () => {
    expect(rsvpLabel("GOING")).toBe("참석");
    expect(rsvpLabel("MAYBE")).toBe("미정");
    expect(rsvpLabel("DECLINED")).toBe("불참");
    expect(rsvpLabel("NO_RESPONSE")).toBe("미응답");
    expect(rsvpLabel("WAITLISTED")).toBe("미응답");
    expect(rsvpLabel(null)).toBe("미응답");
    expect(rsvpLabel(undefined)).toBe("미응답");
  });

  it("labels attendance statuses", () => {
    expect(attendanceLabel("ATTENDED")).toBe("출석");
    expect(attendanceLabel("ABSENT")).toBe("불참");
    expect(attendanceLabel("UNKNOWN")).toBe("출석 확인 전");
    expect(attendanceLabel("PENDING")).toBe("출석 확인 전");
    expect(attendanceLabel(null)).toBe("출석 확인 전");
    expect(attendanceLabel(undefined)).toBe("출석 확인 전");
  });

  it("normalizes counts and host alert labels", () => {
    expect(nonNegativeCount(3)).toBe(3);
    expect(nonNegativeCount(-1)).toBe(0);
    expect(nonNegativeCount(Number.NaN)).toBe(0);
    expect(nonNegativeCount("3" as unknown as number)).toBe(0);
    expect(nonNegativeCount(null)).toBe(0);
    expect(nonNegativeCount(undefined)).toBe(0);
    expect(hostAlertStateLabel(0, false)).toBe("대기 없음");
    expect(hostAlertStateLabel(0, true)).toBe("완료");
    expect(hostAlertStateLabel(2, true)).toBe("할 일");
  });
});
