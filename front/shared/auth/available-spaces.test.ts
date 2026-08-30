import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "./auth-contracts";
import { normalizeAuthAvailableSpaces } from "./available-spaces";
import { authMeContractFixture } from "@/tests/unit/api-contract-fixtures";
import { loadMemberAppAuth } from "./member-app-loader";
import { requirePlatformAdminLoaderAuth } from "./platform-admin-loader";

const baseAuth: AuthMeResponse = {
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
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeAuthAvailableSpaces", () => {
  it("keeps only v1 spaces, canonicalizes ordering, and deduplicates club perspectives", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS", "PLATFORM", "CLUBS"],
        clubs: [
          {
            clubId: "club-1",
            clubSlug: "reading-sai",
            clubName: "읽는 사이",
            perspectives: ["HOST", "MEMBER", "HOST"],
          },
          {
            clubId: "club-1",
            clubSlug: "reading-sai",
            clubName: "읽는 사이",
            perspectives: ["MEMBER"],
          },
        ],
      },
    });

    expect(auth.availableSpaces).toEqual({
      version: 1,
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는 사이",
          perspectives: ["MEMBER", "HOST"],
        },
      ],
    });
  });

  it("falls back only to legacy destinations that are already readable or actively host-authorized", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      role: "HOST",
      platformAdmin: { userId: "admin-1", email: "admin@example.test", role: "OWNER" },
      joinedClubs: [
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는 사이",
          membershipId: "membership-1",
          role: "HOST",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: null,
        },
        {
          clubId: "club-2",
          clubSlug: "viewer-club",
          clubName: "둘러보기 클럽",
          membershipId: "membership-2",
          role: "MEMBER",
          status: "VIEWER",
          approvalState: "VIEWER",
          primaryHost: null,
        },
      ],
    });

    expect(auth.availableSpaces).toEqual({
      version: 1,
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [
        { clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER", "HOST"] },
        { clubId: "club-2", clubSlug: "viewer-club", clubName: "둘러보기 클럽", perspectives: ["MEMBER"] },
      ],
    });
  });

  it("does not infer a host perspective for inactive host-shaped memberships", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      role: "HOST",
      joinedClubs: [
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는 사이",
          membershipId: "membership-1",
          role: "HOST",
          status: "SUSPENDED",
          approvalState: "SUSPENDED",
          primaryHost: null,
        },
      ],
    });

    expect(auth.availableSpaces).toEqual({
      version: 1,
      kinds: ["CLUBS"],
      clubs: [{ clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER"] }],
    });
  });

  it("ignores malformed legacy club rows while using the narrower fallback", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      joinedClubs: [
        null,
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는 사이",
          membershipId: "membership-1",
          role: "MEMBER",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: null,
        },
      ],
    } as unknown as AuthMeResponse);

    expect(auth.availableSpaces).toEqual({
      version: 1,
      kinds: ["CLUBS"],
      clubs: [{ clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER"] }],
    });
  });

  it("fails closed for an unknown projection version instead of widening to legacy fields", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      platformAdmin: { userId: "admin-1", email: "admin@example.test", role: "OWNER" },
      availableSpaces: {
        version: 2,
        kinds: ["PLATFORM", "CLUBS"],
        clubs: [],
      } as never,
    });

    expect(auth.availableSpaces).toEqual({ version: 1, kinds: [], clubs: [] });
  });

  it("drops malformed club entries and malformed perspectives without creating a club destination", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [
          { clubId: "", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER"] },
          { clubId: "club-2", clubSlug: "NOT A SLUG", clubName: "둘러보기", perspectives: ["MEMBER"] },
          { clubId: "club-3", clubSlug: "host-club", clubName: "호스트", perspectives: ["ADMIN"] },
        ],
      } as never,
    });

    expect(auth.availableSpaces).toEqual({ version: 1, kinds: [], clubs: [] });
  });

  it("keeps the representative API fixture additive and ready for the v1 contract", () => {
    expect(authMeContractFixture.availableSpaces).toEqual({
      version: 1,
      kinds: ["CLUBS"],
      clubs: [
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는 사이",
          perspectives: ["MEMBER"],
        },
      ],
    });
  });

  it("normalizes the selected-club member loader through the narrow legacy fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-1",
          clubSlug: "reading-sai",
          clubName: "읽는 사이",
          membershipId: "membership-1",
          role: "MEMBER",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: null,
        },
      ],
    })));

    await expect(loadMemberAppAuth({ params: { clubSlug: "reading-sai" } })).resolves.toMatchObject({
      auth: {
        availableSpaces: {
          version: 1,
          kinds: ["CLUBS"],
          clubs: [{ clubId: "club-1", clubSlug: "reading-sai", perspectives: ["MEMBER"] }],
        },
      },
    });
  });

  it.each([
    [
      "platform-only",
      {
        ...baseAuth,
        role: null,
        membershipStatus: null,
        approvalState: "INACTIVE",
        platformAdmin: { userId: "admin-1", email: "admin@example.test", role: "OWNER" },
        availableSpaces: { version: 1, kinds: ["PLATFORM"], clubs: [] },
      },
      ["PLATFORM"],
    ],
    [
      "mixed-authority",
      {
        ...baseAuth,
        platformAdmin: { userId: "admin-1", email: "admin@example.test", role: "OWNER" },
        availableSpaces: {
          version: 1,
          kinds: ["CLUBS", "PLATFORM"],
          clubs: [{ clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["HOST", "MEMBER"] }],
        },
      },
      ["PLATFORM", "CLUBS"],
    ],
  ] as const)("normalizes %s platform-loader projection without changing the platform guard", async (_name, auth, kinds) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(auth)));

    await expect(requirePlatformAdminLoaderAuth()).resolves.toMatchObject({
      availableSpaces: { version: 1, kinds },
    });
  });

  it("keeps the ingress inventory on the common normalizer while the public probe remains status-only", () => {
    const ingress = [
      ["src/app/auth-context.tsx", "modify"],
      ["shared/auth/member-app-loader.ts", "modify"],
      ["shared/auth/platform-admin-loader.ts", "modify"],
      ["features/host/route/host-loader-auth.ts", "modify"],
      ["features/guest-browse/route/club-app-audience-loader.ts", "modify"],
      ["features/club-selection/route/club-selection-data.ts", "modify"],
      ["shared/ui/public-auth-action-state.ts", "verified-no-change"],
    ] as const;

    for (const [path, classification] of ingress) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      if (classification === "modify") {
        expect(source, path).toContain("normalizeAuthAvailableSpaces");
      } else {
        expect(source, path).toContain("type AuthMeProbe = {");
        expect(source, path).toContain("authenticated?: boolean;");
        expect(source, path).not.toContain("AuthMeResponse");
        expect(source, path).not.toContain("AvailableSpacesV1");
      }
    }
  });
});
