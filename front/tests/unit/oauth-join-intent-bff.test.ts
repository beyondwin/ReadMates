import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../../functions/api/bff/api/auth/oauth/join-intent";

const env = {
  READMATES_API_BASE_URL: "https://api.example.test",
  READMATES_BFF_SECRET: "test-bff-key",
};

function request(headers: Record<string, string> = {}, body = JSON.stringify({ clubSlug: "reading-sai", returnTo: "/clubs/reading-sai/app" })) {
  return new Request("https://readmates.example.test/api/bff/api/auth/oauth/join-intent", {
    method: "POST",
    headers,
    body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rejectedRequests: Array<{ headers: Record<string, string>; reason: string }> = [
  { headers: { "Content-Type": "application/json" }, reason: "missing Origin" },
  { headers: { "Content-Type": "application/json", Origin: "https://evil.example.test" }, reason: "cross-site Origin" },
  { headers: { "Content-Type": "application/json", Origin: "https://readmates.example.test", "Sec-Fetch-Site": "cross-site" }, reason: "cross-site fetch metadata" },
  { headers: { "Content-Type": "text/plain", Origin: "https://readmates.example.test" }, reason: "form-compatible content type" },
];

describe("OAuth join intent BFF", () => {
  it.each(rejectedRequests)("rejects $reason before issuing an intent", async ({ headers }) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({ request: request(headers), env });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only exact same-origin JSON POST with trusted server headers", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ intent: "nonce", expiresAt: "2026-08-02T01:00:00Z" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": "JSESSIONID=abc; Path=/; Domain=api.example.test; HttpOnly" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({ request: request({
      "Content-Type": "application/json",
      Origin: "https://readmates.example.test",
      "Sec-Fetch-Site": "same-origin",
      Cookie: "JSESSIONID=old",
    }), env });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    if (!init || !(init.headers instanceof Headers)) throw new Error("Expected trusted upstream headers");
    expect(url).toBe("https://api.example.test/api/auth/oauth/join-intent");
    expect(init.method).toBe("POST");
    expect(init.headers.get("X-Readmates-Bff-Secret")).toBe("test-bff-key");
    expect(init.headers.get("Origin")).toBe("https://readmates.example.test");
    expect(response.headers.get("set-cookie")).not.toMatch(/Domain=/i);
  });
});
