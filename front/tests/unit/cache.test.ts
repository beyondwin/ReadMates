import { describe, expect, it } from "vitest";
import {
  buildPublicCacheKey,
  isCacheableUpstreamResponse,
  isPublicCacheableRequest,
  PUBLIC_CACHEABLE_PATH_PREFIXES,
} from "../../functions/_shared/cache";

describe("PUBLIC_CACHEABLE_PATH_PREFIXES", () => {
  it("contains clubs and records prefixes with trailing slashes", () => {
    expect(PUBLIC_CACHEABLE_PATH_PREFIXES).toContain("/api/public/clubs/");
    expect(PUBLIC_CACHEABLE_PATH_PREFIXES).toContain("/api/public/records/");
  });
});

describe("isPublicCacheableRequest", () => {
  it("returns true for GET requests to clubs paths", () => {
    expect(isPublicCacheableRequest("GET", "/api/public/clubs/reading-sai")).toBe(true);
  });

  it("returns true for GET requests to clubs session paths", () => {
    expect(isPublicCacheableRequest("GET", "/api/public/clubs/reading-sai/sessions/123")).toBe(
      true,
    );
  });

  it("returns true for GET requests to records paths", () => {
    expect(isPublicCacheableRequest("GET", "/api/public/records/some-item")).toBe(true);
  });

  it("returns false for POST requests even on cacheable paths", () => {
    expect(isPublicCacheableRequest("POST", "/api/public/clubs/reading-sai")).toBe(false);
  });

  it("returns false for non-public paths", () => {
    expect(isPublicCacheableRequest("GET", "/api/auth/me")).toBe(false);
  });

  it("returns false for /api/public/recordstore (not matched by /api/public/records/ prefix)", () => {
    expect(isPublicCacheableRequest("GET", "/api/public/recordstore")).toBe(false);
  });

  it("returns false for /api/public/clubs without trailing slash", () => {
    expect(isPublicCacheableRequest("GET", "/api/public/clubs")).toBe(false);
  });

  it("returns true for /api/public/clubs/sample", () => {
    expect(isPublicCacheableRequest("GET", "/api/public/clubs/sample")).toBe(true);
  });
});

describe("buildPublicCacheKey", () => {
  it("returns a GET request with pathname and search only, stripping hash and other context", () => {
    const request = new Request(
      "https://readmates.pages.dev/api/public/clubs/reading-sai?v=1",
    );
    const cacheKey = buildPublicCacheKey(request);
    expect(cacheKey.method).toBe("GET");
    expect(new URL(cacheKey.url).pathname).toBe("/api/public/clubs/reading-sai");
    expect(new URL(cacheKey.url).search).toBe("?v=1");
  });

  it("uses the same origin", () => {
    const request = new Request("https://readmates.pages.dev/api/public/clubs/reading-sai");
    const cacheKey = buildPublicCacheKey(request);
    expect(new URL(cacheKey.url).origin).toBe("https://readmates.pages.dev");
  });
});

describe("isCacheableUpstreamResponse", () => {
  it("returns true for 200 ok with Cache-Control: public, max-age=120", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(true);
  });

  it("returns false for non-ok responses", () => {
    const response = new Response("{}", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=120" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });

  it("returns false when Cache-Control contains no-store", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });

  it("returns false when Cache-Control contains private", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "private, max-age=120" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });

  it("returns false when Vary contains cookie", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "public, max-age=120", Vary: "Cookie" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });

  it("returns false when Vary contains authorization", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "public, max-age=120", Vary: "Authorization" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });

  it("returns false when response has Set-Cookie headers", () => {
    const response = new Response("{}", { status: 200 });
    Object.defineProperty(response.headers, "getSetCookie", {
      value: () => ["session=abc; HttpOnly"],
    });
    Object.defineProperty(response.headers, "get", {
      value: (name: string) => {
        if (name === "Cache-Control") return "public, max-age=120";
        return null;
      },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });

  it("returns false when response has no cacheable Cache-Control directive", () => {
    const response = new Response("{}", {
      status: 200,
      headers: { "Cache-Control": "must-revalidate" },
    });
    expect(isCacheableUpstreamResponse(response)).toBe(false);
  });
});
