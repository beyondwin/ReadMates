import { describe, expect, it } from "vitest";
import { getPublicRecordShowcaseDisplay, getPublicSessionShowcaseDisplay } from "./public-display-model";

describe("public showcase display", () => {
  it("labels rich public record without inventing private state", () => {
    const display = getPublicRecordShowcaseDisplay({
      sessionId: "s1",
      sessionNumber: 7,
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "긴 대화의 공개 요약입니다.",
      highlightCount: 3,
      oneLinerCount: 2,
    });

    expect(display.recordDensityLabel).toBe("하이라이트 3 · 한줄평 2");
    expect(display.showcaseStateLabel).toBe("기록 준비됨");
    expect(JSON.stringify(display)).not.toContain("HOST");
    expect(JSON.stringify(display)).not.toContain("member1@example.com");
  });

  it("keeps sparse public session honest", () => {
    const display = getPublicSessionShowcaseDisplay({
      sessionId: "s1",
      sessionNumber: 7,
      bookTitle: "E2E 책",
      bookAuthor: "저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "",
      highlights: [],
      oneLiners: [],
    });

    expect(display.showcaseStateLabel).toBe("요약 중심 기록");
  });
});
