import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { hostOperationsLoader } from "./host-operations-data";

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-host",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.test",
  displayName: "Host",
  accountName: "Host",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hostOperationsLoader", () => {
  it("is auth-only and does not start card queries", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      hostOperationsLoader({
        request: new Request("https://readmates.test/app/host/operations"),
      } as unknown as LoaderFunctionArgs),
    ).resolves.toEqual({
      auth: hostAuth,
      clubSlug: undefined,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("returns the scoped club slug after host auth", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(hostAuth));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      hostOperationsLoader({
        params: { clubSlug: "reading-sai" },
        request: new Request("https://readmates.test/clubs/reading-sai/app/host/operations"),
      } as unknown as LoaderFunctionArgs),
    ).resolves.toEqual({
      auth: hostAuth,
      clubSlug: "reading-sai",
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/bff/api/auth/me?clubSlug=reading-sai",
    ]);
  });
});
