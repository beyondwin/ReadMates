import { afterEach, describe, expect, it, vi } from "vitest";
import { clubSelectionLoader } from "./club-selection-data";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clubSelectionLoader", () => {
  it("does not turn a malformed projection into a redirect destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: true,
            userId: "user-1",
            membershipId: null,
            clubId: null,
            email: "member@example.test",
            displayName: "Member",
            accountName: "member",
            role: null,
            membershipStatus: null,
            approvalState: "INACTIVE",
            joinedClubs: [],
            availableSpaces: {
              version: 1,
              kinds: ["CLUBS"],
              clubs: [{ clubId: "", clubSlug: "not a slug", clubName: "broken", perspectives: ["HOST"] }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(clubSelectionLoader()).resolves.toMatchObject({
      availableSpaces: { version: 1, kinds: [], clubs: [] },
    });
  });
});
