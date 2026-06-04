import { describe, expect, it } from "vitest";
import { groupHistoryByBook, mergeActivityTimeline, readingCompletionRate } from "./reading-journey-model";

describe("readingCompletionRate", () => {
  it("is completed / total as a rounded percent", () => {
    expect(readingCompletionRate({ completedReadingCount: 3, totalSessionCount: 4 })).toBe(75);
  });
  it("is 0 when there are no sessions", () => {
    expect(readingCompletionRate({ completedReadingCount: 0, totalSessionCount: 0 })).toBe(0);
  });
});

describe("groupHistoryByBook", () => {
  it("groups my questions and reviews by session, newest session first", () => {
    const groups = groupHistoryByBook(
      [
        { sessionId: "s2", sessionNumber: 2, bookTitle: "B", date: "2026-05-02", text: "q", priority: 1, draftThought: null },
        { sessionId: "s1", sessionNumber: 1, bookTitle: "A", date: "2026-04-01", text: "q0", priority: 1, draftThought: null },
      ],
      [{ sessionId: "s2", sessionNumber: 2, bookTitle: "B", date: "2026-05-02", kind: "LONG_REVIEW", text: "r" }],
    );
    expect(groups.map((g) => g.sessionNumber)).toEqual([2, 1]);
    expect(groups[0].questionCount).toBe(1);
    expect(groups[0].reviewCount).toBe(1);
  });
});

describe("mergeActivityTimeline", () => {
  it("merges questions and reviews newest-first by date", () => {
    const items = mergeActivityTimeline(
      [{ sessionId: "s1", sessionNumber: 1, bookTitle: "A", date: "2026-04-01", text: "q", priority: 1, draftThought: null }],
      [{ sessionId: "s2", sessionNumber: 2, bookTitle: "B", date: "2026-05-02", kind: "LONG_REVIEW", text: "r" }],
    );
    expect(items.map((i) => i.kind)).toEqual(["REVIEW", "QUESTION"]);
  });
});
