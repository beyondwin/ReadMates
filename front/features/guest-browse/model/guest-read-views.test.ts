import { describe, expect, it } from "vitest";
import {
  guestNoteFeedReadPage,
  guestNoteKind,
  guestNoteSessionsReadPage,
  guestNotesReadView,
  guestSessionReadView,
} from "./guest-read-views";

describe("guest read view allowlists", () => {
  it("keeps a missing current session as a normal empty view", () => {
    expect(guestSessionReadView({ currentSession: null })).toEqual({ currentSession: null });
  });

  it("omits unknown note kinds instead of displaying them as highlights", () => {
    expect(guestNoteKind("PRIVATE_DRAFT")).toBeNull();

    const view = guestNotesReadView(
      { items: [], nextCursor: null },
      { items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: "book", kind: "PRIVATE_DRAFT", text: "비공개", membershipId: "must-not-leak" }], nextCursor: null },
    );

    expect(view.feed.items).toEqual([]);
    expect(view.capabilities).toEqual({ canWrite: false });
  });

  it("maps public guest note pages into the shared notes feed contract without fabricating an avatar", () => {
    const guestSessions = {
      items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", questionCount: 0, oneLinerCount: 0, longReviewCount: 0, highlightCount: 1, totalCount: 1 }],
      nextCursor: "next-session",
    };
    const guestFeed = {
      items: [{ sessionId: "s1", sessionNumber: 1, bookTitle: "책", date: "2026-08-02", authorName: "이름", authorShortName: "이", avatarKey: null, kind: "HIGHLIGHT", text: "문장" }],
      nextCursor: "next-feed",
    };

    expect(guestNoteSessionsReadPage(guestSessions)).toEqual(guestSessions);
    expect(guestNoteFeedReadPage(guestFeed).items[0]).toEqual({
      sessionId: "s1",
      sessionNumber: 1,
      bookTitle: "책",
      date: "2026-08-02",
      authorName: "이름",
      authorShortName: "이",
      avatarKey: null,
      kind: "HIGHLIGHT",
      text: "문장",
    });
  });
});
