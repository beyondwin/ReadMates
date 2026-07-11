import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequest } from "../../../functions/api/bff/observability/frontend-events";
import { FRONTEND_OBSERVABILITY_UPSTREAM_PATH } from "../../../shared/observability/frontend-observability-paths";

const env = {
  READMATES_API_BASE_URL: "https://api.example.com",
  READMATES_BFF_SECRET: "test-bff-secret",
};

function context(request: Request, waitUntil = vi.fn()) {
  return { request, env, params: {}, waitUntil };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("frontend observability BFF endpoint", () => {
  it("rejects non-POST and non-JSON requests", async () => {
    const getResponse = await onRequest(
      context(new Request("https://readmates.example.com/api/bff/observability/frontend-events")),
    );
    expect(getResponse.status).toBe(405);

    const textResponse = await onRequest(
      context(
        new Request("https://readmates.example.com/api/bff/observability/frontend-events", {
          method: "POST",
          body: "x",
        }),
      ),
    );
    expect(textResponse.status).toBe(415);
  });

  it("forwards sanitized JSON with BFF secret and strips browser internal headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: 1, dropped: 0 }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "X-Readmates-Bff-Secret": "must-not-return",
          "X-Readmates-Club-Slug": "must-not-return",
        },
      }),
    );

    const response = await onRequest(
      context(
        new Request("https://readmates.example.com/api/bff/observability/frontend-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://readmates.example.com",
            "X-Readmates-Bff-Secret": "browser-secret",
            "X-Readmates-Club-Slug": "browser-club",
          },
          body: JSON.stringify({
            events: [
              {
                type: "ROUTE_LOAD",
                routePattern: "/clubs/:slug/app",
                durationMs: 100,
                navigationType: "LOAD",
                result: "success",
              },
            ],
          }),
        }),
      ),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("X-Readmates-Bff-Secret")).toBeNull();
    expect(response.headers.get("X-Readmates-Club-Slug")).toBeNull();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      `https://api.example.com${FRONTEND_OBSERVABILITY_UPSTREAM_PATH}`,
    );
    const headers = init?.headers as Headers;
    expect(headers.get("X-Readmates-Bff-Secret")).toBe("test-bff-secret");
    expect(headers.get("X-Readmates-Club-Slug")).toBeNull();
    expect(headers.get("Origin")).toBe("https://readmates.example.com");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string).events).toHaveLength(1);
  });

  it("forwards sanitized drop reasons for events removed by the BFF", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accepted: 1, dropped: 1 }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await onRequest(
      context(
        new Request("https://readmates.example.com/api/bff/observability/frontend-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: [
              {
                type: "ROUTE_LOAD",
                routePattern: "/clubs/raw-club/app",
                durationMs: 100,
                navigationType: "LOAD",
                result: "success",
              },
              {
                type: "ROUTE_LOAD",
                routePattern: "/clubs/:slug/app",
                durationMs: 100,
                navigationType: "LOAD",
                result: "success",
              },
            ],
          }),
        }),
      ),
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      events: [
        {
          type: "ROUTE_LOAD",
          routePattern: "/clubs/:slug/app",
          durationMs: 100,
          navigationType: "LOAD",
          result: "success",
        },
      ],
      droppedReasons: ["invalid_route_pattern"],
    });
  });

  it("returns 413 for oversized payloads before forwarding", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const response = await onRequest(
      context(
        new Request("https://readmates.example.com/api/bff/observability/frontend-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: [], padding: "x".repeat(16_500) }),
        }),
      ),
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
