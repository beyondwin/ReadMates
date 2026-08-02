import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { requireHostLoaderAuth } from "./host-loader-auth";

const hostAuth: AuthMeResponse = {
  authenticated: true,
  email: "host@example.test",
  displayName: "Host",
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

describe("requireHostLoaderAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares scoped host authorization for concurrent loaders on the same request", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(hostAuth)));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://readmates.local/clubs/alpha/app/host");
    const args = { params: { clubSlug: "alpha" }, request };

    const [parent, child, nested] = await Promise.all([
      requireHostLoaderAuth(args),
      requireHostLoaderAuth(args),
      requireHostLoaderAuth(args),
    ]);

    expect(parent).toBe(child);
    expect(child).toBe(nested);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a failed scoped authorization attempt so the same request can retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ code: "TEMPORARY" }, 500)).mockResolvedValueOnce(jsonResponse(hostAuth));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://readmates.local/clubs/alpha/app/host");
    const args = { params: { clubSlug: "alpha" }, request };

    const [first, second] = await Promise.allSettled([requireHostLoaderAuth(args), requireHostLoaderAuth(args)]);

    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(requireHostLoaderAuth(args)).resolves.toEqual(hostAuth);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps unscoped host authorization requests independent", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(hostAuth)));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([requireHostLoaderAuth(), requireHostLoaderAuth()]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
