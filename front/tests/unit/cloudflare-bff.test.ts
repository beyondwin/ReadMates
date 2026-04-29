import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/bff/[[path]]";

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
  } as Parameters<typeof onRequest>[0];
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
          },
        }),
        {
          path: ["api", "auth", "me"],
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
    expect((init.headers as Headers).get("X-Readmates-Bff-Secret")).toBe("secret");
    expect((init.headers as Headers).get("X-Readmates-Client-IP")).toBe("203.0.113.10");
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

    expect(response.status).toBe(400);
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

    expect(response.status).toBe(404);
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

    expect(response.status).toBe(404);
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

    expect(response.status).toBe(404);
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

    expect(response.status).toBe(403);
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

    expect(response.status).toBe(403);
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
