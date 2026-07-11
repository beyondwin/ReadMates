import { describe, expect, it } from "vitest";

import {
  FRONTEND_OBSERVABILITY_BROWSER_PATH,
  FRONTEND_OBSERVABILITY_UPSTREAM_PATH,
  rewriteFrontendObservabilityProxyPath,
} from "./frontend-observability-paths";

describe("frontend observability paths", () => {
  it("rewrites the exact browser path to the Spring upstream path", () => {
    expect(FRONTEND_OBSERVABILITY_BROWSER_PATH).toBe(
      "/api/bff/observability/frontend-events",
    );
    expect(FRONTEND_OBSERVABILITY_UPSTREAM_PATH).toBe(
      "/api/observability/frontend-events",
    );
    expect(
      rewriteFrontendObservabilityProxyPath(
        FRONTEND_OBSERVABILITY_BROWSER_PATH,
      ),
    ).toBe(FRONTEND_OBSERVABILITY_UPSTREAM_PATH);
  });

  it("preserves the query string", () => {
    expect(
      rewriteFrontendObservabilityProxyPath(
        `${FRONTEND_OBSERVABILITY_BROWSER_PATH}?source=route`,
      ),
    ).toBe(`${FRONTEND_OBSERVABILITY_UPSTREAM_PATH}?source=route`);
  });

  it("does not claim general or lookalike BFF paths", () => {
    expect(
      rewriteFrontendObservabilityProxyPath("/api/bff/api/auth/me"),
    ).toBeNull();
    expect(
      rewriteFrontendObservabilityProxyPath(
        "/api/bff/observability/frontend-events/extra",
      ),
    ).toBeNull();
  });
});
