import { describe, expect, it } from "vitest";
import { draftsByDate, memberVisibilityLabel } from "./upcoming-book-list-model";

describe("draftsByDate", () => {
  it("orders drafts by date ascending", () => {
    expect(draftsByDate([
      { sessionId: "b", state: "DRAFT", date: "2026-07-09", bookTitle: "B", accessScope: "HOST_ONLY" },
      { sessionId: "a", state: "DRAFT", date: "2026-06-11", bookTitle: "A", accessScope: "GUEST_READABLE" },
      { sessionId: "open", state: "OPEN", date: "2026-04-15", bookTitle: "Now", accessScope: "GUEST_READABLE" },
    ]).map((item) => item.sessionId)).toEqual(["a", "b"]);
  });
});

describe("memberVisibilityLabel", () => {
  it("uses member-facing visibility copy", () => {
    expect(memberVisibilityLabel("GUEST_READABLE")).toBe("멤버에게 보이기");
    expect(memberVisibilityLabel("HOST_ONLY")).toBe("호스트만");
  });
});
