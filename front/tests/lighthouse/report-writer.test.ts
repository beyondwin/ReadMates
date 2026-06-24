import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeLighthouseDiagnosticReport } from "./report-writer";
import type { NormalizedLighthouseResult } from "./types";

let outputDir = "";

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), "readmates-lighthouse-"));
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

const result: NormalizedLighthouseResult = {
  routeId: "public-home",
  group: "public",
  path: "/",
  mode: "navigation",
  status: "passed",
  scores: {
    performance: 0.82,
    accessibility: 0.91,
    bestPractices: 1,
    seo: 0.89,
  },
  findings: [
    {
      auditId: "unused-javascript",
      title: "Reduce unused JavaScript",
      score: 0,
      numericValue: 1234,
      bucket: "bundle_js_cost",
    },
  ],
  reportJsonPath: "results/public-home.json",
  reportHtmlPath: "reports/public-home.html",
};

describe("writeLighthouseDiagnosticReport", () => {
  it("writes summary routes and findings files", async () => {
    const written = await writeLighthouseDiagnosticReport({
      outputDir,
      runContext: {
        commit: "abc123",
        timestamp: "2026-06-25T00:00:00.000Z",
        deviceProfile: "desktop-chromium",
        serverProfile: "local-dev",
      },
      results: [result],
    });

    expect(written.summaryPath.endsWith("summary.md")).toBe(true);

    const summary = await readFile(join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("# ReadMates Lighthouse Diagnostic");
    expect(summary).toContain("| public | public-home | navigation | passed | 0.82 | 0.91 | 1.00 | 0.89 | unused-javascript |");
    expect(summary).toContain("bundle_js_cost");

    const routesJson = JSON.parse(await readFile(join(outputDir, "routes.json"), "utf8"));
    expect(routesJson).toEqual([
      { routeId: "public-home", group: "public", path: "/", mode: "navigation", status: "passed" },
    ]);

    const findingsJson = JSON.parse(await readFile(join(outputDir, "findings.json"), "utf8"));
    expect(findingsJson[0].findings[0].bucket).toBe("bundle_js_cost");
  });

  it("separates local-dev diagnostic noise from release-actionable repeated causes", async () => {
    await writeLighthouseDiagnosticReport({
      outputDir,
      runContext: {
        commit: "abc123",
        timestamp: "2026-06-25T00:00:00.000Z",
        deviceProfile: "desktop-chromium",
        serverProfile: "local-dev",
      },
      results: [
        {
          ...result,
          findings: [
            {
              auditId: "unminified-javascript",
              title: "JavaScript is not minified",
              score: 0,
              numericValue: null,
              bucket: "local_dev_noise",
            },
          ],
        },
      ],
    });

    const summary = await readFile(join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("| none | none | no release-actionable failed Lighthouse audits | keep baseline |");
    expect(summary).toContain("| local_dev_noise | public-home | Lighthouse audit findings | local-dev diagnostic only |");
  });
});
