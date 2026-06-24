import { describe, expect, it, vi } from "vitest";
import { runRouteDiagnostic } from "./lighthouse-runner";
import type { LighthouseRouteDefinition } from "./types";

const route: LighthouseRouteDefinition = {
  id: "public-home",
  group: "public",
  path: "/",
  mode: "navigation",
  auth: "none",
  description: "Public home",
  expectedText: "읽는사이",
};

describe("runRouteDiagnostic", () => {
  it("records route failure before running Lighthouse when route entry fails", async () => {
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      getByText: vi.fn(() => ({ waitFor: vi.fn().mockRejectedValue(new Error("missing text")) })),
    };
    const lighthouse = vi.fn();

    const result = await runRouteDiagnostic(
      {
        baseUrl: "http://localhost:3100",
        page,
        lighthouse,
        outputDir: ".tmp/lighthouse/test",
      },
      route,
    );

    expect(result.status).toBe("route_failure");
    expect(result.failureReason).toContain("missing text");
    expect(lighthouse).not.toHaveBeenCalled();
  });

  it("summarizes Lighthouse output after route entry succeeds", async () => {
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      getByText: vi.fn(() => ({ waitFor: vi.fn().mockResolvedValue(undefined) })),
    };
    const lighthouse = vi.fn().mockResolvedValue({
      lhr: {
        categories: {
          performance: { score: 0.9 },
          accessibility: { score: 1 },
          "best-practices": { score: 1 },
          seo: { score: 1 },
        },
        audits: {},
      },
      report: ["{}", "<html></html>"],
    });

    const result = await runRouteDiagnostic(
      {
        baseUrl: "http://localhost:3100",
        page,
        lighthouse,
        outputDir: ".tmp/lighthouse/test",
      },
      route,
    );

    expect(page.goto).toHaveBeenCalledWith("http://localhost:3100/");
    expect(lighthouse).toHaveBeenCalledWith("http://localhost:3100/", route);
    expect(result.status).toBe("passed");
    expect(result.scores.performance).toBe(0.9);
  });
});
