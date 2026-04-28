import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as authorizationGet } from "../../functions/oauth2/authorization/[[registrationId]]";
import { onRequestGet as callbackGet } from "../../functions/login/oauth2/code/[[registrationId]]";

function context(request: Request, registrationId: string | string[]) {
  return {
    request,
    env: {
      READMATES_API_BASE_URL: "https://api.example.com",
      READMATES_BFF_SECRET: "test-bff-secret",
    },
    params: {
      registrationId,
    },
  } as Parameters<typeof authorizationGet>[0];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Cloudflare OAuth proxy functions", () => {
  it("proxies authorization requests to backend OAuth with query, cookies, and forwarded host headers", async () => {
    const fetchMock = vi.fn(async () => (
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://accounts.google.com/o/oauth2/v2/auth",
          "Set-Cookie": "OAUTH2_STATE=state; Path=/; HttpOnly",
          "X-Readmates-Bff-Secret": "upstream-placeholder-secret",
          "X-Readmates-Client-IP": "upstream-placeholder-client",
        },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authorizationGet(
      context(
        new Request("https://readmates.pages.dev/oauth2/authorization/google?inviteToken=abc", {
          headers: {
            Cookie: "readmates_session=existing",
            "CF-Connecting-IP": "203.0.113.10",
            "User-Agent": "vitest",
          },
        }),
        "google",
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/oauth2/authorization/google?inviteToken=abc",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
        redirect: "manual",
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("cookie")).toBe("readmates_session=existing");
    expect((init.headers as Headers).get("user-agent")).toBe("vitest");
    expect((init.headers as Headers).get("x-forwarded-host")).toBe("readmates.pages.dev");
    expect((init.headers as Headers).get("x-forwarded-proto")).toBe("https");
    expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("test-bff-secret");
    expect((init.headers as Headers).get("X-Readmates-Client-IP")).toBe("203.0.113.10");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(response.headers.get("set-cookie")).toBe("OAUTH2_STATE=state; Path=/; HttpOnly");
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(response.headers.get("x-readmates-client-ip")).toBeNull();
  });

  it("proxies OAuth callback requests to backend OAuth with query, cookies, and forwarded host headers", async () => {
    const fetchMock = vi.fn(async () => (
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://readmates.pages.dev/app",
          "Set-Cookie": "readmates_session=issued; Path=/; HttpOnly",
          "X-Readmates-Bff-Secret": "upstream-placeholder-secret",
          "X-Readmates-Client-IP": "upstream-placeholder-client",
        },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callbackGet(
      context(
        new Request("https://readmates.pages.dev/login/oauth2/code/google?code=test&state=xyz", {
          headers: {
            Cookie: "OAUTH2_STATE=state",
            "X-Forwarded-For": "198.51.100.10, 198.51.100.11",
          },
        }),
        "google",
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/login/oauth2/code/google?code=test&state=xyz",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
        redirect: "manual",
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("cookie")).toBe("OAUTH2_STATE=state");
    expect((init.headers as Headers).get("x-forwarded-host")).toBe("readmates.pages.dev");
    expect((init.headers as Headers).get("x-forwarded-proto")).toBe("https");
    expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("test-bff-secret");
    expect((init.headers as Headers).get("X-Readmates-Client-IP")).toBe("198.51.100.10");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://readmates.pages.dev/app");
    expect(response.headers.get("set-cookie")).toBe("readmates_session=issued; Path=/; HttpOnly");
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(response.headers.get("x-readmates-client-ip")).toBeNull();
  });

  it.each([
    ["parent-directory segment", ".."],
    ["encoded parent-directory segment", "%2e%2e"],
    ["encoded slash segment", "google%2fextra"],
    ["multi-segment catch-all value", ["google", "extra"]],
  ])("rejects unsafe authorization registration id: %s", async (_name, registrationId) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authorizationGet(
      context(
        new Request("https://readmates.pages.dev/oauth2/authorization/google"),
        registrationId,
      ),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["current-directory segment", "."],
    ["encoded backslash segment", "google%5cextra"],
    ["multi-segment catch-all value", ["google", "extra"]],
  ])("rejects unsafe callback registration id: %s", async (_name, registrationId) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callbackGet(
      context(
        new Request("https://readmates.pages.dev/login/oauth2/code/google"),
        registrationId,
      ),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
