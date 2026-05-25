import { describe, expect, it } from "vitest";
import { combineArchiveListPages } from "./archive-queries";

describe("combineArchiveListPages", () => {
  it("appends next-page items per archive surface and keeps the trailing cursor", () => {
    const current = {
      sessions: { items: [{ sessionId: "s1" }], nextCursor: "s2" },
      questions: { items: [{ id: "q1" }], nextCursor: null },
      reviews: { items: [{ id: "r1" }], nextCursor: null },
      reports: { items: [{ sessionId: "f1" }], nextCursor: null },
    };
    const next = {
      sessions: { items: [{ sessionId: "s2" }], nextCursor: null },
      questions: { items: [], nextCursor: null },
      reviews: { items: [], nextCursor: null },
      reports: { items: [], nextCursor: null },
    };

    const combined = combineArchiveListPages([current, next]);

    expect(combined.sessions.items.map((item) => item.sessionId)).toEqual(["s1", "s2"]);
    expect(combined.sessions.nextCursor).toBeNull();
  });
});
