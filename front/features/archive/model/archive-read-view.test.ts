import { describe, expect, it } from "vitest";
import { guestArchiveReadView } from "./archive-read-view";

const guestArchivePage = {
  items: [
    {
      sessionId: "s1",
      sessionNumber: 1,
      title: "첫 기록",
      bookTitle: "파도",
      bookAuthor: "작가",
      bookImageUrl: null,
      date: "2026-08-02",
      attendance: 4,
      total: 5,
      state: "CLOSED",
    },
  ],
  nextCursor: "next-page",
};

describe("guestArchiveReadView", () => {
  it("adapts the public archive into the regular archive page without personal or feedback metadata", () => {
    const view = guestArchiveReadView(guestArchivePage);

    expect(view.sessions.items[0]).toMatchObject({
      sessionId: "s1",
      published: false,
      state: "CLOSED",
    });
    expect(view.sessions.nextCursor).toBe("next-page");
    expect(view.questions).toEqual({ items: [], nextCursor: null });
    expect(view.reviews).toEqual({ items: [], nextCursor: null });
    expect(view.reports).toEqual({ items: [], nextCursor: null });
    expect(view.capabilities.canReadFeedback).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/fileName|uploadedAt|feedbackDocument/);
  });

  it("drops public sessions whose state is outside the regular archive contract", () => {
    const view = guestArchiveReadView({
      ...guestArchivePage,
      items: [
        ...guestArchivePage.items,
        { ...guestArchivePage.items[0], sessionId: "unknown", state: "DELETED" },
      ],
    });

    expect(view.sessions.items.map((session) => session.sessionId)).toEqual(["s1"]);
  });
});
