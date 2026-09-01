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

  it("does not redirect through a legacy recommended entry when the supplied projection version is unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
      recommendedAppEntryUrl: "/clubs/reading-sai/app",
      availableSpaces: { version: 2, kinds: ["CLUBS"], clubs: [] },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(clubSelectionLoader()).resolves.toMatchObject({
      availableSpaces: { version: 1, kinds: [], clubs: [] },
    });
  });

  it("does not redirect through a single readable legacy club when the supplied projection is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      userId: "user-1",
      membershipId: "membership-1",
      clubId: "club-1",
      email: "member@example.test",
      displayName: "Member",
      accountName: "member",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      joinedClubs: [{
        clubId: "club-1",
        clubSlug: "reading-sai",
        clubName: "읽는 사이",
        membershipId: "membership-1",
        role: "MEMBER",
        status: "ACTIVE",
        approvalState: "ACTIVE",
        primaryHost: null,
      }],
      availableSpaces: { version: 1, kinds: ["CLUBS"], clubs: "not-an-array" },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(clubSelectionLoader()).resolves.toMatchObject({
      availableSpaces: { version: 1, kinds: [], clubs: [] },
    });
  });

  it("redirects only when the recommended member destination exactly matches a normalized club space", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true,
      userId: "user-1",
      membershipId: "membership-1",
      clubId: "club-1",
      email: "member@example.test",
      displayName: "Member",
      accountName: "member",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      recommendedAppEntryUrl: "/clubs/reading-sai/app",
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [{ clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER"] }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(clubSelectionLoader()).rejects.toMatchObject({ status: 302 });
  });
});
