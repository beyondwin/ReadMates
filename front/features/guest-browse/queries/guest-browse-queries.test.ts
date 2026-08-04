import { describe, expect, it } from "vitest";
import { guestBrowseKeys } from "./guest-browse-queries";

describe("guest browse query keys", () => {
  it("isolates every resource by guest scope and club slug", () => {
    expect(guestBrowseKeys.shell("alpha")).toEqual(["guest-browse", "alpha", "shell"]);
    expect(guestBrowseKeys.archive("alpha", { cursor: "page-2" })).toEqual([
      "guest-browse",
      "alpha",
      "archive",
      20,
      "page-2",
    ]);
    expect(guestBrowseKeys.archive("beta", { cursor: "page-2" })).not.toEqual(
      guestBrowseKeys.archive("alpha", { cursor: "page-2" }),
    );
    expect(guestBrowseKeys.noteFeed("alpha", { cursor: "next", sessionId: "session-3" })).toEqual([
      "guest-browse",
      "alpha",
      "note-feed",
      20,
      "next",
      "session-3",
    ]);
    expect(guestBrowseKeys.noteFeed("alpha", { sessionId: "session-4" })).not.toEqual(
      guestBrowseKeys.noteFeed("alpha", { sessionId: "session-3" }),
    );
  });
});
