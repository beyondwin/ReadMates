import { describe, expect, it } from "vitest";
import { getCurrentSessionReadingLoopSummary } from "@/features/current-session/model/current-session-view-model";

describe("getCurrentSessionReadingLoopSummary", () => {
  it("summarizes active member prep when RSVP, reading progress, and questions are missing", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        rsvp: "NO_RESPONSE",
        readingProgress: 0,
        writtenQuestionCount: 0,
        oneLineReview: "",
        longReview: "",
        canWrite: true,
        sessionDate: "2026-06-04",
        today: new Date(2026, 4, 31),
      }),
    ).toEqual({
      state: "MEMBER_PREP_REQUIRED",
      label: "멤버 준비 필요",
      body: "RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.",
    });
  });

  it("names the first missing current-session action for active members", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        rsvp: "NO_RESPONSE",
        readingProgress: 0,
        writtenQuestionCount: 0,
        oneLineReview: "",
        longReview: "",
        canWrite: true,
        sessionDate: "2026-06-04",
        today: new Date(2026, 4, 31),
      }).body,
    ).toBe("RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.");
  });

  it("summarizes post-session reflection due when an active member has not written reviews", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        rsvp: "GOING",
        readingProgress: 100,
        writtenQuestionCount: 2,
        oneLineReview: "",
        longReview: "",
        canWrite: true,
        sessionDate: "2026-05-20",
        today: new Date(2026, 4, 31),
      }),
    ).toEqual({
      state: "REFLECTION_DUE",
      label: "회고 필요",
      body: "모임 후 한줄평이나 서평을 남겨 다음 기록으로 이어갑니다.",
    });
  });

  it("summarizes viewer and read-only members without asking for write actions", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        rsvp: "NO_RESPONSE",
        readingProgress: 0,
        writtenQuestionCount: 0,
        oneLineReview: "",
        longReview: "",
        canWrite: false,
        sessionDate: "2026-06-04",
        today: new Date(2026, 4, 31),
      }),
    ).toEqual({
      state: "SESSION_READY",
      label: "세션 준비됨",
      body: "세션 내용을 읽고 공동 보드를 확인할 수 있습니다.",
    });
  });
});
