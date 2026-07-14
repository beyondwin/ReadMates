import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/bff/[[path]]";
import { stripCookieDomain } from "../../functions/_shared/proxy";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
};

function context(
  request: Request,
  params: Record<string, string | string[] | undefined>,
  env: Env = {
    READMATES_API_BASE_URL: "https://api.example.com",
    READMATES_BFF_SECRET: "secret",
  },
) {
  return {
    request,
    env,
    params,
    waitUntil: vi.fn(),
  } as Parameters<typeof onRequest>[0];
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

describe("Cloudflare BFF function", () => {
  it("forwards api requests with bff secret and Cloudflare client ip", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me", {
          headers: {
            "CF-Connecting-IP": "203.0.113.10",
            "X-Forwarded-For": "198.51.100.10, 198.51.100.11",
            "X-Readmates-Bff-Secret": "attacker",
            "X-Readmates-Client-IP": "attacker",
            "X-Readmates-Club-Host": "attacker.example.test",
          },
        }),
        {
          path: ["api", "auth", "me"],
        },
        {
          READMATES_API_BASE_URL: "https://api.example.com",
          READMATES_BFF_SECRET: "test-bff-secret",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
        redirect: "manual",
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("test-bff-secret");
    expect((init.headers as Headers).get("X-Readmates-Client-IP")).toBe("203.0.113.10");
    expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe("readmates.pages.dev");
  });

  it("uses the dedicated bff secret and strips API base URL query parameters", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me"),
        {
          path: ["api", "auth", "me"],
        },
        {
          READMATES_API_BASE_URL: "https://api.example.com?ignored=value",
          READMATES_BFF_SECRET: "direct-secret",
        },
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/me",
      expect.any(Object),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("direct-secret");
  });

  it("forwards normalized club host from request host and overwrites browser header", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await onRequest(
      context(
        new Request("https://reading-sai.example.test./api/bff/api/auth/me", {
          headers: {
            "X-Readmates-Club-Host": "attacker.example.test",
          },
        }),
        {
          path: ["api", "auth", "me"],
        },
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Club-Host")).toBe(
      "reading-sai.example.test",
    );
  });

  it("forwards a route-selected club slug as trusted server context", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me?clubSlug=reading-sai", {
          headers: {
            "X-Readmates-Club-Slug": "attacker-club",
          },
        }),
        {
          path: ["api", "auth", "me"],
        },
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/me?clubSlug=reading-sai",
      expect.any(Object),
    );
    expect((init.headers as Headers).get("X-Readmates-Club-Slug")).toBe("reading-sai");
  });

  it("normalizes a route-selected club slug before trusting it as server context", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me?clubSlug=%20Reading-Sai%20"),
        {
          path: ["api", "auth", "me"],
        },
      ),
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Club-Slug")).toBe("reading-sai");
  });

  it("does not send a trusted slug header when the route does not select one", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me", {
          headers: {
            "X-Readmates-Club-Slug": "attacker-club",
          },
        }),
        {
          path: ["api", "auth", "me"],
        },
      ),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Club-Slug")).toBeNull();
  });

  it("rejects invalid route-selected club slugs before calling upstream", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me?clubSlug=bad--slug"),
        {
          path: ["api", "auth", "me"],
        },
      ),
    );

    await expectApiErrorBody(response, { status: 400, code: "INVALID_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to first x-forwarded-for value for client ip handoff", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me", {
          headers: {
            "X-Forwarded-For": "198.51.100.10, 198.51.100.11",
          },
        }),
        {
          path: ["api", "auth", "me"],
        },
      ),
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get("X-Readmates-Client-IP")).toBe("198.51.100.10");
  });

  it("supports Cloudflare slash-delimited catch-all path params", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(new Request("https://readmates.pages.dev/api/bff/api/auth/me"), {
        path: "api/auth/me",
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/auth/me",
      expect.any(Object),
    );
  });

  it("forwards query string, cookies, and content type while preserving mutating request body bytes", async () => {
    const payload = new Uint8Array([0x2d, 0x2d, 0x72, 0x0d, 0x0a, 0xc3, 0x28, 0xff]);
    let forwardedInit: RequestInit | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedInit = init;
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "readmates.sid=next",
            "X-Readmates-Bff-Secret": "upstream-placeholder-secret",
            "X-Readmates-Client-IP": "upstream-placeholder-client",
            "X-Readmates-Club-Host": "upstream-placeholder-club",
          },
        });
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/uploads?draft=true", {
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data; boundary=readmates",
            Cookie: "readmates.sid=current",
            Origin: "https://readmates.pages.dev",
          },
          body: payload,
        }),
        { path: ["api", "uploads"] },
      ),
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/uploads?draft=true",
      expect.any(Object),
    );
    expect(forwardedInit?.method).toBe("POST");
    expect((forwardedInit?.headers as Headers).get("Content-Type")).toBe(
      "multipart/form-data; boundary=readmates",
    );
    expect((forwardedInit?.headers as Headers).get("Cookie")).toBe("readmates.sid=current");
    expect(forwardedInit?.body).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(forwardedInit?.body as ArrayBuffer)).toEqual(payload);
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBe("readmates.sid=next");
    expect(response.headers.get("x-readmates-bff-secret")).toBeNull();
    expect(response.headers.get("x-readmates-client-ip")).toBeNull();
    expect(response.headers.get("x-readmates-club-host")).toBeNull();
  });

  it("preserves AI transcript multipart bytes and bounded 422 problem details without logging", async () => {
    const payload = new Uint8Array([0x2d, 0x2d, 0x61, 0x69, 0x0d, 0x0a, 0xef, 0xbb, 0xbf]);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let forwardedInit: RequestInit | undefined;
    const problem = {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      detail: "대본의 화자 이름을 확인해 주세요.",
      code: "TRANSCRIPT_SPEAKER_NOT_MEMBER",
      invalidSpeakerLabels: ["화자 하나"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedInit = init;
        return new Response(JSON.stringify(problem), {
          status: 422,
          headers: {
            "Content-Type": "application/problem+json",
            "X-Readmates-Request-Id": "request-safe-1",
          },
        });
      }),
    );

    const response = await onRequest(
      context(
        new Request(
          "https://readmates.pages.dev/api/bff/api/host/sessions/session-1/ai-generate/jobs",
          {
            method: "POST",
            headers: {
              "Content-Type": "multipart/form-data; boundary=ai",
              Origin: "https://readmates.pages.dev",
              Cookie: "readmates.sid=current",
              "X-Readmates-Request-Id": "request-safe-1",
            },
            body: payload,
          },
        ),
        { path: ["api", "host", "sessions", "session-1", "ai-generate", "jobs"] },
      ),
    );

    expect(forwardedInit?.body).toBeInstanceOf(ReadableStream);
    expect(
      new Uint8Array(await new Response(forwardedInit?.body as ReadableStream).arrayBuffer()),
    ).toEqual(payload);
    expect((forwardedInit?.headers as Headers).get("Content-Type")).toBe(
      "multipart/form-data; boundary=ai",
    );
    expect((forwardedInit?.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("secret");
    expect((forwardedInit?.headers as Headers).get("X-Readmates-Request-Id")).toBe(
      "request-safe-1",
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(problem);
    expect(response.headers.get("X-Readmates-Request-Id")).toBe("request-safe-1");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("forwards multiple logout Set-Cookie headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const upstream = new Response(null, { status: 204 });
        Object.defineProperty(upstream.headers, "getSetCookie", {
          value: () => [
            "readmates_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
            "JSESSIONID=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
          ],
        });
        return upstream;
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
          method: "POST",
          headers: { Origin: "https://readmates.pages.dev" },
        }),
        { path: ["api", "auth", "logout"] },
      ),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("readmates_session=;");
    expect(response.headers.get("set-cookie")).toContain("JSESSIONID=;");
  });

  it("rejects non-api paths without calling upstream", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(new Request("https://readmates.pages.dev/api/bff/internal/health"), {
        path: ["internal", "health"],
      }),
    );

    await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-api mutation paths with 404 before same-origin checks", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/internal/health", {
          method: "POST",
        }),
        { path: ["internal", "health"] },
      ),
    );

    await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["literal parent-directory segment", ["api", "..", "internal", "health"]],
    ["encoded current-directory segment", ["api", "%2e", "auth", "me"]],
    ["encoded parent-directory segment", ["api", "%2e%2e", "internal", "health"]],
    ["encoded slash traversal segment", ["api", "%2e%2e%2finternal", "health"]],
    ["encoded backslash traversal segment", ["api", "%2e%2e%5Cinternal", "health"]],
  ])("rejects %s without calling upstream", async (_name, path) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(new Request(`https://readmates.pages.dev/api/bff/${path.join("/")}`), { path }),
    );

    await expectApiErrorBody(response, { status: 404, code: "RESOURCE_NOT_FOUND" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation requests before calling upstream", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
          method: "POST",
          headers: {
            Origin: "https://attacker.example",
          },
        }),
        { path: ["api", "auth", "logout"] },
      ),
    );

    await expectApiErrorBody(response, { status: 403, code: "PERMISSION_DENIED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects mutation requests without Origin or Referer before calling upstream", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
          method: "POST",
        }),
        { path: ["api", "auth", "logout"] },
      ),
    );

    await expectApiErrorBody(response, { status: 403, code: "PERMISSION_DENIED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows same-origin mutations with Referer when Origin is absent", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
          method: "POST",
          headers: {
            Referer: "https://readmates.pages.dev/app",
          },
        }),
        { path: ["api", "auth", "logout"] },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses server-controlled origin headers for upstream mutations and drops browser security headers", async () => {
    let forwardedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedInit = init;
        return new Response("{}", { status: 200 });
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: "Bearer browser-token",
            "Content-Type": "application/json",
            Origin: "https://readmates.pages.dev",
            Referer: "https://readmates.pages.dev/app",
          },
          body: JSON.stringify({}),
        }),
        { path: ["api", "auth", "logout"] },
      ),
    );

    const forwardedHeaders = forwardedInit?.headers as Headers;
    expect(response.status).toBe(200);
    expect(forwardedHeaders.get("Origin")).toBe("https://readmates.pages.dev");
    expect(forwardedHeaders.get("Referer")).toBe("https://readmates.pages.dev");
    expect(forwardedHeaders.get("Authorization")).toBeNull();
    expect(forwardedHeaders.get("Content-Type")).toBe("application/json");
  });

  it("forwards HEAD without a request body and returns no response body", async () => {
    let forwardedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedInit = init;
        return new Response("body must not be exposed", { status: 200 });
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/me", {
          method: "HEAD",
        }),
        { path: ["api", "auth", "me"] },
      ),
    );

    expect(forwardedInit?.method).toBe("HEAD");
    expect(forwardedInit?.body).toBeUndefined();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});

describe("Cloudflare BFF cache layer", () => {
  it("returns cached response on cache hit without calling upstream fetch", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const cachedResponse = new Response('{"cached":true}', {
      status: 200,
      headers: { "Cache-Control": "public, max-age=120" },
    });
    const cacheMatch = vi.fn(async () => cachedResponse);
    const cachePut = vi.fn(async () => undefined);
    vi.stubGlobal("caches", { default: { match: cacheMatch, put: cachePut } });

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/public/clubs/reading-sai"),
        { path: ["api", "public", "clubs", "reading-sai"] },
      ),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ cached: true });
  });

  it("fetches from upstream and stores in cache on cache miss for cacheable public path", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('{"fresh":true}', {
          status: 200,
          headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const cacheMatch = vi.fn(async () => undefined);
    const cachePut = vi.fn(async () => undefined);
    const ctx = context(
      new Request("https://readmates.pages.dev/api/bff/api/public/clubs/reading-sai"),
      { path: ["api", "public", "clubs", "reading-sai"] },
    );
    vi.stubGlobal("caches", { default: { match: cacheMatch, put: cachePut } });

    const response = await onRequest(ctx);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("does not store in cache when upstream response has Set-Cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const upstream = new Response("{}", {
          status: 200,
          headers: { "Cache-Control": "public, max-age=120" },
        });
        Object.defineProperty(upstream.headers, "getSetCookie", {
          value: () => ["session=abc; HttpOnly"],
        });
        return upstream;
      }),
    );

    const cacheMatch = vi.fn(async () => undefined);
    const cachePut = vi.fn(async () => undefined);
    const ctx = context(
      new Request("https://readmates.pages.dev/api/bff/api/public/clubs/reading-sai"),
      { path: ["api", "public", "clubs", "reading-sai"] },
    );
    vi.stubGlobal("caches", { default: { match: cacheMatch, put: cachePut } });

    await onRequest(ctx);

    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("does not use cache for mutation requests on public paths", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const cacheMatch = vi.fn(async () => undefined);
    const cachePut = vi.fn(async () => undefined);
    const ctx = context(
      new Request("https://readmates.pages.dev/api/bff/api/public/clubs/reading-sai", {
        method: "POST",
        headers: { Origin: "https://readmates.pages.dev" },
        body: "{}",
      }),
      { path: ["api", "public", "clubs", "reading-sai"] },
    );
    vi.stubGlobal("caches", { default: { match: cacheMatch, put: cachePut } });

    await onRequest(ctx);

    expect(cacheMatch).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});

describe("stripCookieDomain", () => {
  it("strips Domain attribute from a Set-Cookie header value", () => {
    const raw = "foo=bar; Path=/; Domain=upstream.example.com; HttpOnly";
    const result = stripCookieDomain(raw);
    expect(result).toBe("foo=bar; Path=/; HttpOnly");
    expect(result).not.toMatch(/Domain=/i);
  });

  it("returns the cookie unchanged when no Domain attribute is present", () => {
    const raw = "foo=bar; Path=/; HttpOnly";
    expect(stripCookieDomain(raw)).toBe("foo=bar; Path=/; HttpOnly");
  });

  it("strips Domain from all cookies when upstream sends multiple Set-Cookie lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const upstream = new Response(null, { status: 204 });
        Object.defineProperty(upstream.headers, "getSetCookie", {
          value: () => [
            "session=abc; Path=/; Domain=upstream.example.com; HttpOnly",
            "pref=dark; Path=/; Domain=upstream.example.com",
          ],
        });
        return upstream;
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
          method: "POST",
          headers: { Origin: "https://readmates.pages.dev" },
        }),
        { path: ["api", "auth", "logout"] },
      ),
    );

    expect(response.status).toBe(204);
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).not.toMatch(/Domain=/i);
    expect(setCookieHeader).toContain("session=abc");
    expect(setCookieHeader).toContain("pref=dark");
  });

  it("forwards POST /api/host/sessions/{id}/ai-generate/jobs multipart with preserved boundary", async () => {
    const payload = new Uint8Array([
      0x2d, 0x2d, 0x72, 0x6d, 0x2d, 0x62, 0x6f, 0x75, 0x6e, 0x64, 0x0d, 0x0a,
      0xc3, 0x28, 0xff, 0x00,
    ]);
    let forwardedInit: RequestInit | undefined;
    let forwardedUrl: string | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        forwardedUrl = typeof input === "string" ? input : (input as Request).url;
        forwardedInit = init;
        return new Response(JSON.stringify({ jobId: "j-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const response = await onRequest(
      context(
        new Request(
          "https://readmates.pages.dev/api/bff/api/host/sessions/12345/ai-generate/jobs",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "multipart/form-data; boundary=----ReadMatesAiGenBoundary-XYZ",
              Cookie: "readmates.sid=current",
              Origin: "https://readmates.pages.dev",
            },
            body: payload,
          },
        ),
        {
          path: [
            "api",
            "host",
            "sessions",
            "12345",
            "ai-generate",
            "jobs",
          ],
        },
      ),
    );

    expect(forwardedUrl).toBe(
      "https://api.example.com/api/host/sessions/12345/ai-generate/jobs",
    );
    expect(forwardedInit?.method).toBe("POST");
    expect((forwardedInit?.headers as Headers).get("Content-Type")).toBe(
      "multipart/form-data; boundary=----ReadMatesAiGenBoundary-XYZ",
    );
    expect((forwardedInit?.headers as Headers).get("X-Readmates-Bff-Secret")).toBe(
      "secret",
    );
    expect(forwardedInit?.body).toBeInstanceOf(ReadableStream);
    expect(
      new Uint8Array(await new Response(forwardedInit?.body as ReadableStream).arrayBuffer()),
    ).toEqual(payload);
    expect(response.status).toBe(202);
  });

  it("rejects an oversized AI transcript multipart request before buffering", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request(
      "https://readmates.pages.dev/api/bff/api/host/sessions/12345/ai-generate/jobs",
      {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=ai",
          "Content-Length": String(2 * 1024 * 1024 + 1),
          Origin: "https://readmates.pages.dev",
        },
        body: new Uint8Array([1]),
      },
    );
    const arrayBuffer = vi.spyOn(request, "arrayBuffer");

    const response = await onRequest(
      context(request, {
        path: ["api", "host", "sessions", "12345", "ai-generate", "jobs"],
      }),
    );

    await expectApiErrorBody(response, { status: 413, code: "REQUEST_TOO_LARGE" });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams an AI transcript multipart request when content length is absent", async () => {
    let forwardedBody: BodyInit | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedBody = init?.body;
        return new Response("{}", { status: 202 });
      }),
    );
    const request = new Request(
      "https://readmates.pages.dev/api/bff/api/host/sessions/12345/ai-generate/jobs",
      {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=ai",
          Origin: "https://readmates.pages.dev",
        },
        body: new Uint8Array([1, 2, 3]),
      },
    );
    const arrayBuffer = vi.spyOn(request, "arrayBuffer");

    const response = await onRequest(
      context(request, {
        path: ["api", "host", "sessions", "12345", "ai-generate", "jobs"],
      }),
    );

    expect(response.status).toBe(202);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(forwardedBody).toBeInstanceOf(ReadableStream);
  });

  it("forwards GET /api/host/sessions/{id}/ai-generate/jobs/{jobId} unchanged", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request(
          "https://readmates.pages.dev/api/bff/api/host/sessions/42/ai-generate/jobs/job-abc",
        ),
        {
          path: [
            "api",
            "host",
            "sessions",
            "42",
            "ai-generate",
            "jobs",
            "job-abc",
          ],
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/host/sessions/42/ai-generate/jobs/job-abc",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards GET /api/host/clubs/{clubSlug}/ai-defaults unchanged", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ defaultModel: "gpt-x" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(
      context(
        new Request(
          "https://readmates.pages.dev/api/bff/api/host/clubs/my-club/ai-defaults",
        ),
        { path: ["api", "host", "clubs", "my-club", "ai-defaults"] },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/host/clubs/my-club/ai-defaults",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("forwards PUT /api/host/clubs/{clubSlug}/ai-defaults with JSON body", async () => {
    let forwardedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        forwardedInit = init;
        return new Response(null, { status: 204 });
      }),
    );

    const body = JSON.stringify({ defaultModel: "gpt-x" });
    const response = await onRequest(
      context(
        new Request(
          "https://readmates.pages.dev/api/bff/api/host/clubs/my-club/ai-defaults",
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://readmates.pages.dev",
            },
            body,
          },
        ),
        { path: ["api", "host", "clubs", "my-club", "ai-defaults"] },
      ),
    );

    expect(response.status).toBe(204);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/host/clubs/my-club/ai-defaults",
      expect.any(Object),
    );
    expect(forwardedInit?.method).toBe("PUT");
    expect((forwardedInit?.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect((forwardedInit?.headers as Headers).get("X-Readmates-Bff-Secret")).toBe(
      "secret",
    );
    expect(new TextDecoder().decode(forwardedInit?.body as ArrayBuffer)).toBe(body);
  });
});
