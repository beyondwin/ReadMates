import { describe, expect, it } from "vitest";
import { hasFeedbackGroupSections, splitTrailingTimestamp } from "@/features/feedback/model/feedback-document-model";

describe("splitTrailingTimestamp", () => {
  it("separates a trailing recording timestamp", () => {
    expect(splitTrailingTimestamp("기준을 설명했다. [1:02:30]")).toEqual({ text: "기준을 설명했다.", time: "1:02:30" });
  });

  it("keeps text without a trailing timestamp", () => {
    expect(splitTrailingTimestamp("[10:00] 앞에 붙은 시간은 그대로 둔다")).toEqual({
      text: "[10:00] 앞에 붙은 시간은 그대로 둔다",
      time: null,
    });
  });
});

describe("hasFeedbackGroupSections", () => {
  it("is false for v1 documents without optional sections", () => {
    expect(hasFeedbackGroupSections({})).toBe(false);
    expect(hasFeedbackGroupSections({ highlights: [], groupFeedback: null, trend: null })).toBe(false);
  });

  it("is true when any group section is present", () => {
    expect(hasFeedbackGroupSections({ followUpQuestions: ["다음 질문"] })).toBe(true);
  });
});
