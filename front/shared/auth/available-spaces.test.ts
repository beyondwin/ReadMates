import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
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

  it("keeps normalized fallback spaces enumerable through copy, JSON, and structured-clone boundaries", () => {
    const auth = normalizeAuthAvailableSpaces({
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
    });

    expect({ ...auth }.availableSpaces).toEqual(auth.availableSpaces);
    expect(JSON.parse(JSON.stringify(auth)).availableSpaces).toEqual(auth.availableSpaces);
    expect(structuredClone(auth).availableSpaces).toEqual(auth.availableSpaces);
  });

  it("fails closed for duplicate club IDs with conflicting destination identity", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [
          { clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER"] },
          { clubId: "club-1", clubSlug: "reading-sai", clubName: "다른 이름", perspectives: ["HOST"] },
        ],
      },
    });

    expect(auth.availableSpaces).toEqual({ version: 1, kinds: [], clubs: [] });
  });

  it("fails closed for duplicate club slugs that identify different club IDs", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [
          { clubId: "club-1", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["MEMBER"] },
          { clubId: "club-2", clubSlug: "reading-sai", clubName: "읽는 사이", perspectives: ["HOST"] },
        ],
      },
    });

    expect(auth.availableSpaces).toEqual({ version: 1, kinds: [], clubs: [] });
  });

  it("propagates rejected identity tombstones through chained duplicate conflicts", () => {
    const auth = normalizeAuthAvailableSpaces({
      ...baseAuth,
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [
          { clubId: "club-1", clubSlug: "slug-a", clubName: "A", perspectives: ["MEMBER"] },
          { clubId: "club-1", clubSlug: "slug-b", clubName: "B", perspectives: ["MEMBER"] },
          { clubId: "club-2", clubSlug: "slug-b", clubName: "B", perspectives: ["MEMBER"] },
          { clubId: "club-2", clubSlug: "slug-c", clubName: "C", perspectives: ["MEMBER"] },
        ],
      },
    });

    expect(auth.availableSpaces).toEqual({ version: 1, kinds: [], clubs: [] });
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

  it("normalizes each auth ingress from its fetch result before its guard, audience, redirect, or state sink", () => {
    const ingress = [
      { path: "src/app/auth-context.tsx", functionName: "fetchAuthMeOutcome", fetchName: "response.json", sinkName: "setState", sinkArgument: "outcome.auth" },
      { path: "shared/auth/member-app-loader.ts", functionName: "loadMemberAppAuth", fetchName: "readmatesFetch", sinkName: "canUseMemberApp", sinkArgument: "auth" },
      { path: "shared/auth/platform-admin-loader.ts", functionName: "requirePlatformAdminLoaderAuth", fetchName: "readmatesFetch", sinkName: "canUsePlatformAdmin", sinkArgument: "auth" },
      { path: "features/host/route/host-loader-auth.ts", functionName: "requireScopedHostLoaderAuth", fetchName: "readmatesPublicFetch", sinkName: "canUseHostApp", sinkArgument: "auth" },
      { path: "features/host/route/host-loader-auth.ts", functionName: "requireHostLoaderAuth", fetchName: "readmatesFetch", sinkName: "canUseHostApp", sinkArgument: "auth" },
      { path: "features/guest-browse/route/club-app-audience-loader.ts", functionName: "loadClubAppAudienceForRequest", fetchName: "readmatesPublicFetch", sinkName: "deriveClubAppAudience", sinkArgument: "auth" },
      { path: "features/club-selection/route/club-selection-data.ts", functionName: "clubSelectionLoader", fetchName: "readmatesFetch", sinkName: "recommendedClubEntryUrl", sinkArgument: "auth" },
    ] as const;

    for (const check of ingress) {
      const source = readFileSync(resolve(process.cwd(), check.path), "utf8");
      const file = ts.createSourceFile(check.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const functionNode = findNamedFunction(file, check.functionName);
      const calls = findCalls(check.functionName === "fetchAuthMeOutcome" ? file : functionNode);
      const normalizer = check.functionName === "fetchAuthMeOutcome"
        ? calls.find((call) => calleeName(call) === "normalizeAuthAvailableSpaces" && isAuthProperty(call, file))
        : normalizedAuthBinding(functionNode);
      const sink = calls.find(
        (call) => calleeName(call) === check.sinkName && call.arguments[0]?.getText(file).includes(check.sinkArgument),
      );

      expect(normalizer, `${check.path}:${check.functionName} must normalize the fetched auth value`).toBeDefined();
      expect(normalizer?.getText(file), `${check.path}:${check.functionName} normalizer must wrap the fetch result`).toContain(check.fetchName);
      expect(sink, `${check.path}:${check.functionName} must send normalized auth to ${check.sinkName}`).toBeDefined();
      expect(normalizer!.getStart(file), `${check.path}:${check.functionName} normalization must precede ${check.sinkName}`).toBeLessThan(sink!.getStart(file));
    }

    const publicProbe = readFileSync(resolve(process.cwd(), "shared/ui/public-auth-action-state.ts"), "utf8");
    expect(publicProbe).toContain("type AuthMeProbe = {");
    expect(publicProbe).toContain("authenticated?: boolean;");
    expect(publicProbe).not.toContain("AuthMeResponse");
    expect(publicProbe).not.toContain("AvailableSpacesV1");
    expect(publicProbe).not.toContain("availableSpaces");
  });
});

function findNamedFunction(file: ts.SourceFile, name: string): ts.FunctionLikeDeclarationBase {
  let found: ts.FunctionLikeDeclarationBase | undefined;
  const visit = (node: ts.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      && node.name?.getText(file) === name) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
  if (!found) throw new Error(`Missing function ${name}`);
  return found;
}

function findCalls(node: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) calls.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return calls;
}

function normalizedAuthBinding(functionNode: ts.FunctionLikeDeclarationBase) {
  let normalizer: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "auth"
      && node.initializer) {
      normalizer = (ts.isCallExpression(node.initializer) ? [node.initializer, ...findCalls(node.initializer)] : findCalls(node.initializer))
        .find((call) => calleeName(call) === "normalizeAuthAvailableSpaces");
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(functionNode, visit);
  return normalizer;
}

function isAuthProperty(call: ts.CallExpression, file: ts.SourceFile) {
  return ts.isPropertyAssignment(call.parent)
    && call.parent.name.getText(file) === "auth";
}

function calleeName(call: ts.CallExpression) {
  return ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : "";
}
