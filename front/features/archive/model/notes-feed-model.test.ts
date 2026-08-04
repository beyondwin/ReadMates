import { describe, expect, it } from "vitest";
import { noteKindLabel, noteSessionSearchPlaceholder } from "./notes-feed-model";

describe("noteSessionSearchPlaceholder", () => {
  it("uses the highest session number even when sessions are not sorted", () => {
    expect(
      noteSessionSearchPlaceholder([
        { sessionNumber: 3 },
        { sessionNumber: 8 },
        { sessionNumber: 6 },
      ]),
    ).toBe("책 제목 또는 No.08");
  });

  it("uses a generic example when there are no sessions", () => {
    expect(noteSessionSearchPlaceholder([])).toBe("책 제목 또는 세션 번호");
  });
});

describe("noteKindLabel", () => {
  it("uses a Korean public label for a long review", () => {
    expect(noteKindLabel({ kind: "LONG_REVIEW" })).toBe("서평");
  });
});
