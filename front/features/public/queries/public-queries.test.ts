import { describe, expect, it } from "vitest";
import { publicClubQuery, publicKeys, publicSessionQuery } from "./public-queries";

describe("public query helpers", () => {
  it("scopes public club data by club slug", () => {
    expect(publicClubQuery("bookclub").queryKey).toEqual(["public", "club", "bookclub"]);
  });

  it("scopes public session data by club slug and session id", () => {
    expect(publicSessionQuery("bookclub", "session-1").queryKey).toEqual([
      "public",
      "club",
      "bookclub",
      "session",
      "session-1",
    ]);
  });

  it("exposes a club root for invalidation", () => {
    expect(publicKeys.club("bookclub")).toEqual(["public", "club", "bookclub"]);
  });
});
