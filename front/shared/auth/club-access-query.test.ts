import { describe, expect, it, vi } from "vitest";
import { touchClubAccessOnce } from "./club-access-query";

describe("touchClubAccessOnce", () => {
  it("touches once per club in a client episode without awaiting the request", () => {
    const touchedClubs = new Set<string>();
    const requests: string[] = [];
    const touch = vi.fn((clubSlug: string) => {
      requests.push(clubSlug);
      return new Promise<unknown>(() => undefined);
    });

    expect(touchClubAccessOnce(touchedClubs, "reading-sai", touch)).toBeUndefined();
    touchClubAccessOnce(touchedClubs, "reading-sai", touch);
    touchClubAccessOnce(touchedClubs, "sample-book-club", touch);

    expect(requests).toEqual(["reading-sai", "sample-book-club"]);
  });

  it("keeps a failed touch silent and does not loop within the same episode", async () => {
    const touchedClubs = new Set<string>();
    const touch = vi.fn().mockRejectedValue(new Error("offline"));

    touchClubAccessOnce(touchedClubs, "reading-sai", touch);
    await Promise.resolve();
    touchClubAccessOnce(touchedClubs, "reading-sai", touch);

    expect(touch).toHaveBeenCalledTimes(1);
  });
});
