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
  });
});
