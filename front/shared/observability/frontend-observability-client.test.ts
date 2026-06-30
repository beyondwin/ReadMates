import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFrontendObservabilityClient } from "./frontend-observability-client";

describe("frontend observability client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("flushes sanitized batches with sendBeacon", async () => {
    const sendBeacon = vi.fn(() => true);
    const client = createFrontendObservabilityClient({
      endpoint: "/api/bff/observability/frontend-events",
      sendBeacon,
      fetchImpl: vi.fn(),
    });

    client.record({
      type: "ROUTE_LOAD",
      routePattern: "/app",
      durationMs: 42,
      navigationType: "LOAD",
      result: "success",
    });
    await client.flush();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = sendBeacon.mock.calls[0];
    expect(url).toBe("/api/bff/observability/frontend-events");
    expect(JSON.parse(body as string)).toEqual({
      events: [
        {
          type: "ROUTE_LOAD",
          routePattern: "/app",
          durationMs: 42,
          navigationType: "LOAD",
          result: "success",
        },
      ],
    });
  });

  it("falls back to keepalive fetch when sendBeacon fails", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const client = createFrontendObservabilityClient({
      endpoint: "/api/bff/observability/frontend-events",
      sendBeacon: vi.fn(() => false),
      fetchImpl,
    });

    client.record({
      type: "API_FAILURE",
      routePattern: "/clubs/:slug/app",
      apiGroup: "host-session",
      statusClass: "5xx",
      errorCode: "INTERNAL_ERROR",
    });
    await client.flush();

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/bff/observability/frontend-events",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("drops invalid events and never throws from flush", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network blocked");
    });
    const client = createFrontendObservabilityClient({
      endpoint: "/api/bff/observability/frontend-events",
      sendBeacon: undefined,
      fetchImpl,
    });

    client.record({
      type: "ROUTE_LOAD",
      routePattern: "/clubs/raw-slug/app",
      durationMs: 1,
      navigationType: "LOAD",
      result: "success",
    });
    client.record({
      type: "RUNTIME_ERROR",
      routePattern: "/admin",
      errorKind: "render",
      errorCode: "REACT_ROUTE_ERROR",
      severity: "error",
    });

    await expect(client.flush()).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.pendingCount()).toBe(0);
  });
});
