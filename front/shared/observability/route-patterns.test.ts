import { describe, expect, it } from "vitest";

import { frontendApiGroupFromPath, normalizeFrontendRoutePattern } from "./route-patterns";

describe("frontend route observability patterns", () => {
  it("normalizes public member host and admin paths without raw identifiers", () => {
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/app/session/current")).toBe(
      "/clubs/:slug/app/session/current",
    );
    expect(
      normalizeFrontendRoutePattern(
        "/clubs/reading-sai/app/host/sessions/123e4567-e89b-12d3-a456-426614174000/edit",
      ),
    ).toBe("/clubs/:slug/app/host/sessions/:sessionId/edit");
    expect(normalizeFrontendRoutePattern("/admin/clubs/123e4567-e89b-12d3-a456-426614174000")).toBe(
      "/admin/clubs/:clubId",
    );
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/sessions/session-7?draft=1#body")).toBe(
      "/clubs/:slug/sessions/:sessionId",
    );
  });

  it("returns unknown for unrecognized or unsafe paths", () => {
    expect(normalizeFrontendRoutePattern("https://readmates.example.com/admin")).toBe("unknown");
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/private/export")).toBe("unknown");
    expect(normalizeFrontendRoutePattern("/clubs/reading-sai/app/host/sessions/abc/raw-token")).toBe("unknown");
  });

  it("groups API paths without retaining concrete ids or query strings", () => {
    expect(frontendApiGroupFromPath("/api/host/sessions/session-7?clubSlug=reading-sai")).toBe("host-session");
    expect(frontendApiGroupFromPath("/api/host/notifications/items/item-1/retry")).toBe("notification");
    expect(frontendApiGroupFromPath("/api/admin/ai-generation/jobs/job-1")).toBe("admin-ai");
    expect(frontendApiGroupFromPath("/api/public/clubs/reading-sai")).toBe("public");
    expect(frontendApiGroupFromPath("/api/app/me")).toBe("member");
    expect(frontendApiGroupFromPath("/api/unclassified/raw-token")).toBe("unknown");
  });
});
