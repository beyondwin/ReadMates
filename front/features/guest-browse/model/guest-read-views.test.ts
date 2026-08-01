import { describe, expect, it } from "vitest";
import { guestNoteKind, guestNotesReadView } from "./guest-read-views";

describe("guest read view allowlists", () => {
  it("omits unknown note kinds instead of displaying them as highlights", () => {
    expect(guestNoteKind("PRIVATE_DRAFT")).toBeNull();

    const view = guestNotesReadView(
      { items: [], nextCursor: null },
      { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: "book", kind: "PRIVATE_DRAFT", text: "비공개", membershipId: "must-not-leak" }], nextCursor: null },
    );

    expect(view.feed.items).toEqual([]);
    expect(view.capabilities).toEqual({ canWrite: false });
  });
});
