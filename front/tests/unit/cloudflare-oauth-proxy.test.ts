import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as authorizationGet } from "../../functions/oauth2/authorization/[[registrationId]]";
import { onRequestGet as callbackGet } from "../../functions/login/oauth2/code/[[registrationId]]";

type OAuthHandler = typeof authorizationGet;

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function context(
  request: Request,
  registrationId: string | string[],
  env = {
    READMATES_API_BASE_URL: "https://api.example.com",
    READMATES_BFF_SECRET: "test-bff-secret",
  },
) {
  return {
    request,
    env,
    params: {
      registrationId,
    },
  } as Parameters<typeof authorizationGet>[0];
}

async function expectApiErrorBody(response: Response, expected: { status: number; code: string }) {
  expect(response.status).toBe(expected.status);
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    code: expected.code,
    status: expected.status,
  });
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
          "X-Readmates-Club-Host": "upstream-placeholder-club",
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
            "X-Readmates-Bff-Secret": "attacker",
            "X-Readmates-Client-IP": "attacker",
            "X-Readmates-Club-Host": "attacker.example.test",
            "X-Readmates-Club-Slug": "attacker-club",
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
    expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe("readmates.pages.dev");
    expect((init.headers as Headers).get("X-Readmates-Club-Slug")).toBeNull();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(response.headers.get("set-cookie")).toBe("OAUTH2_STATE=state; Path=/; HttpOnly");
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(response.headers.get("x-readmates-client-ip")).toBeNull();
    expect(response.headers.get("x-readmates-club-host")).toBeNull();
  });

  it.each([
    {
      name: "authorization start",
      handler: authorizationGet as OAuthHandler,
      requestUrl: "https://readmates.pages.dev/oauth2/authorization/google?returnTo=/app",
      upstreamUrl: "https://api.example.com/oauth2/authorization/google?returnTo=/app",
    },
    {
      name: "callback",
      handler: callbackGet as OAuthHandler,
      requestUrl: "https://readmates.pages.dev/login/oauth2/code/google?code=test&state=opaque",
      upstreamUrl: "https://api.example.com/login/oauth2/code/google?code=test&state=opaque",
    },
  ])("uses the dedicated bff secret and ignores API base URL query parameters for $name", async ({
    handler,
    requestUrl,
    upstreamUrl,
  }) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    await handler(
      context(new Request(requestUrl), "google", {
        READMATES_API_BASE_URL: "https://api.example.com?ignored=value",
        READMATES_BFF_SECRET: "direct-secret",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      upstreamUrl,
      expect.any(Object),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("direct-secret");
  });

  it("forwards club host during OAuth authorization start", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    await authorizationGet(
      context(
        new Request("https://reading-sai.example.test/oauth2/authorization/google?returnTo=/app"),
        "google",
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe(
      "reading-sai.example.test",
    );
  });

  it("forwards the ReadMates account-choice intent without interpreting it", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    await authorizationGet(
      context(
        new Request(
          "https://readmates.pages.dev/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=true",
        ),
        "google",
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=true",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
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
          "X-Readmates-Club-Host": "upstream-placeholder-club",
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
            "X-Readmates-Bff-Secret": "attacker",
            "X-Readmates-Client-IP": "attacker",
            "X-Readmates-Club-Host": "attacker.example.test",
            "X-Readmates-Club-Slug": "attacker-club",
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
    expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe("readmates.pages.dev");
    expect((init.headers as Headers).get("X-Readmates-Club-Slug")).toBeNull();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://readmates.pages.dev/app");
    expect(response.headers.get("set-cookie")).toBe("readmates_session=issued; Path=/; HttpOnly");
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(response.headers.get("x-readmates-client-ip")).toBeNull();
    expect(response.headers.get("x-readmates-club-host")).toBeNull();
  });

  it("overwrites browser-provided club host during OAuth callback", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    await callbackGet(
      context(
        new Request("https://reading-sai.example.test./login/oauth2/code/google?code=test", {
          headers: {
            "X-Readmates-Club-Host": "attacker.example.test",
          },
        }),
        "google",
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe(
      "reading-sai.example.test",
    );
  });

  it("preserves the backend fallback redirect for malformed OAuth state", async () => {
    const fetchMock = vi.fn(async () => (
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://readmates.pages.dev/app",
        },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callbackGet(
      context(
        new Request(
          "https://readmates.pages.dev/login/oauth2/code/google?code=test&state=not-a-state",
        ),
        "google",
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/login/oauth2/code/google?code=test&state=not-a-state",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://readmates.pages.dev/app");
  });

  it.each([
    {
      name: "authorization start",
      handler: authorizationGet as OAuthHandler,
      requestUrl: "https://readmates.pages.dev/oauth2/authorization/google?returnTo=/app",
      location: "https://accounts.example.test/oauth/authorize",
    },
    {
      name: "callback",
      handler: callbackGet as OAuthHandler,
      requestUrl: "https://readmates.pages.dev/login/oauth2/code/google?code=test&state=opaque",
      location: "https://readmates.pages.dev/app?from=oauth",
    },
  ])("preserves a sanitized multi-cookie redirect for OAuth $name", async ({
    handler,
    requestUrl,
    location,
  }) => {
    const serverSecret = "server-only-placeholder";
    const internalSecret = "upstream-internal-placeholder";
    const upstreamCookies = [
      "oauth_state=opaque; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/oauth2; Domain=api.example.com; HttpOnly; Secure; SameSite=Lax",
      "readmates_session=issued; Path=/; Domain=.example.com; HttpOnly; Secure; SameSite=Strict",
    ];
    const expectedCookies = [
      "oauth_state=opaque; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/oauth2; HttpOnly; Secure; SameSite=Lax",
      "readmates_session=issued; Path=/; HttpOnly; Secure; SameSite=Strict",
    ];
    let forwardedInit: RequestInit | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedInit = init;
        const upstream = new Response("redirecting", {
          status: 307,
          headers: {
            Location: location,
            "X-Readmates-Bff-Secret": internalSecret,
            "X-Readmates-Client-IP": "upstream-internal-client",
            "X-Readmates-Club-Host": "upstream-internal-host",
            "X-Readmates-Club-Slug": "upstream-internal-slug",
          },
        });
        Object.defineProperty(upstream.headers, "getSetCookie", {
          value: () => upstreamCookies,
        });
        return upstream;
      }),
    );

    const response = await handler(
      context(
        new Request(requestUrl, {
          headers: {
            Authorization: "Bearer browser-token-placeholder",
            "CF-Connecting-IP": "203.0.113.10",
            "X-Forwarded-For": "198.51.100.10, 198.51.100.11",
            "X-Readmates-Bff-Secret": "browser-secret-placeholder",
            "X-Readmates-Client-IP": "browser-client-placeholder",
            "X-Readmates-Club-Host": "browser-host.example.test",
            "X-Readmates-Club-Slug": "browser-slug-placeholder",
          },
        }),
        "google",
        {
          READMATES_API_BASE_URL: "https://api.example.com?ignored=value",
          READMATES_BFF_SECRET: serverSecret,
        },
      ),
    );

    const forwardedHeaders = forwardedInit?.headers as Headers;
    expect(forwardedHeaders.get("X-Readmates-Bff-Secret")).toBe(serverSecret);
    expect(forwardedHeaders.get("X-Readmates-Client-IP")).toBe("203.0.113.10");
    expect(forwardedHeaders.get("X-Readmates-Club-Host")).toBe("readmates.pages.dev");
    expect(forwardedHeaders.get("X-Readmates-Club-Slug")).toBeNull();
    expect(forwardedHeaders.get("Authorization")).toBeNull();

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(location);
    expect((response.headers as HeadersWithSetCookie).getSetCookie?.()).toEqual(
      expectedCookies,
    );
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(response.headers.get("x-readmates-client-ip")).toBeNull();
    expect(response.headers.get("x-readmates-club-host")).toBeNull();
    expect(response.headers.get("x-readmates-club-slug")).toBeNull();

    const publicResponse = [
      ...[...response.headers.entries()].map(([name, value]) => `${name}:${value}`),
      await response.text(),
    ].join("\n");
    expect(publicResponse).not.toContain(serverSecret);
    expect(publicResponse).not.toContain(internalSecret);
    expect(publicResponse).not.toContain("browser-secret-placeholder");
    expect(publicResponse).not.toContain("browser-client-placeholder");
    expect(publicResponse).not.toContain("browser-host.example.test");
    expect(publicResponse).not.toContain("browser-slug-placeholder");
    expect(publicResponse).not.toContain("browser-token-placeholder");
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

    await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
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

    await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects an HTML authorization 404 to the safe OAuth unavailable route", async () => {
    const upstream = new Response("provider detail must stay upstream", {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "oauth_state=expired; Path=/; Domain=api.example.com; Max-Age=0; HttpOnly",
        "X-Readmates-Bff-Secret": "upstream-secret-placeholder",
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => upstream));

    const response = await authorizationGet(
      context(
        new Request(
          "https://readmates.pages.dev/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&joinClub=reading-sai&joinIntent=issued-placeholder&state=opaque-placeholder&inviteToken=invite-placeholder",
          {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "Sec-Fetch-Dest": "document",
            },
          },
        ),
        "google",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
    expect(response.headers.get("set-cookie")).toBe(
      "oauth_state=expired; Path=/; Max-Age=0; HttpOnly",
    );
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(await response.text()).toBe("");
    expect(response.headers.get("location")).not.toMatch(
      /joinIntent|state|inviteToken|issued-placeholder|opaque-placeholder|provider detail/,
    );
  });

  it.each([
    { handler: authorizationGet as OAuthHandler, phase: "authorization", status: 429, kind: "rate_limited" },
    { handler: authorizationGet as OAuthHandler, phase: "authorization", status: 500, kind: "internal_error" },
    { handler: authorizationGet as OAuthHandler, phase: "authorization", status: 503, kind: "service_unavailable" },
    { handler: callbackGet as OAuthHandler, phase: "callback", status: 410, kind: "request_expired" },
    { handler: callbackGet as OAuthHandler, phase: "callback", status: 500, kind: "internal_error" },
  ] as const)(
    "maps HTML $phase $status responses to $kind",
    async ({ handler, phase, status, kind }) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream failure", { status })));
      const requestUrl =
        phase === "authorization"
          ? "https://readmates.pages.dev/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp"
          : "https://readmates.pages.dev/login/oauth2/code/google?code=provider-placeholder&state=opaque-placeholder";

      const response = await handler(
        context(
          new Request(requestUrl, { headers: { Accept: "text/html", "Sec-Fetch-Dest": "document" } }),
          "google",
        ),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`/auth/error?kind=${kind}` + (
        phase === "authorization" ? "&returnTo=%2Fclubs%2Freading-sai%2Fapp" : ""
      ));
      expect(response.headers.get("location")).not.toMatch(/provider-placeholder|opaque-placeholder/);
    },
  );

  it("preserves an upstream error response for JSON clients", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "UPSTREAM_NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })),
    );

    const response = await authorizationGet(
      context(
        new Request("https://readmates.pages.dev/oauth2/authorization/google?returnTo=/app", {
          headers: { Accept: "application/json" },
        }),
        "google",
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({ code: "UPSTREAM_NOT_FOUND" });
  });

  it("translates an HTML upstream connection failure without exposing the exception", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connect ECONNREFUSED private-upstream-placeholder");
    }));

    const response = await authorizationGet(
      context(
        new Request(
          "https://readmates.pages.dev/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&joinIntent=issued-placeholder",
          { headers: { Accept: "text/html", "Sec-Fetch-Dest": "document" } },
        ),
        "google",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/error?kind=service_unavailable&returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
    expect(await response.text()).not.toContain("ECONNREFUSED");
  });

  it("returns a sanitized JSON service error for a programmatic connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connect ECONNREFUSED private-upstream-placeholder");
    }));

    const response = await callbackGet(
      context(
        new Request("https://readmates.pages.dev/login/oauth2/code/google?state=opaque-placeholder", {
          headers: { Accept: "application/json" },
        }),
        "google",
      ),
    );

    const publicCopy = response.clone();
    await expectApiErrorBody(response, { status: 503, code: "OAUTH_UPSTREAM_UNAVAILABLE" });
    expect(await publicCopy.text()).not.toContain("private-upstream-placeholder");
  });

  it("turns an unsafe document registration id into a fixed invalid-request route", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authorizationGet(
      context(
        new Request("https://readmates.pages.dev/oauth2/authorization/google%2fextra", {
          headers: { Accept: "text/html", "Sec-Fetch-Dest": "document" },
        }),
        "google%2fextra",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth/error?kind=request_invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
