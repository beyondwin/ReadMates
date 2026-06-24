import { describe, expect, it } from "vitest";
import { classifyAuditId, summarizeLhr } from "./finding-classifier";
import type { LighthouseRouteDefinition } from "./types";

const route: LighthouseRouteDefinition = {
  id: "public-home",
  group: "public",
  path: "/",
  mode: "navigation",
  auth: "none",
  description: "Public home",
};

describe("classifyAuditId", () => {
  it.each([
    ["unused-javascript", "local_dev_noise"],
    ["legacy-javascript", "bundle_js_cost"],
    ["uses-responsive-images", "image_media"],
    ["cumulative-layout-shift", "layout_stability"],
    ["button-name", "accessibility"],
    ["meta-description", "seo_public_metadata"],
    ["errors-in-console", "security_best_practices"],
  ] as const)("maps %s to %s", (auditId, bucket) => {
    expect(classifyAuditId(auditId)).toBe(bucket);
  });
});

describe("summarizeLhr", () => {
  it("extracts category scores and failed audits", () => {
    const result = summarizeLhr(route, {
      categories: {
        performance: { score: 0.82 },
        accessibility: { score: 0.91 },
        "best-practices": { score: 1 },
        seo: { score: null },
      },
      audits: {
        "unused-javascript": {
          id: "unused-javascript",
          title: "Reduce unused JavaScript",
          score: 0,
          numericValue: 1234,
        },
        "document-title": {
          id: "document-title",
          title: "Document has a title",
          score: 1,
        },
      },
    });

    expect(result.scores).toEqual({
      performance: 0.82,
      accessibility: 0.91,
      bestPractices: 1,
      seo: null,
    });
    expect(result.findings).toEqual([
      {
        auditId: "unused-javascript",
        title: "Reduce unused JavaScript",
        score: 0,
        numericValue: 1234,
        bucket: "local_dev_noise",
      },
    ]);
  });
});
