import { describe, expect, it } from "vitest";
import {
  analyzeBuildAssets,
  defaultBudgetRules,
  formatBytes,
  renderBuildBudgetMarkdown,
  type BuildAssetInput,
} from "./build-budget";

const assets: BuildAssetInput[] = [
  { fileName: "vendor-react-abc.js", bytes: 140_000, gzipBytes: 45_000 },
  { fileName: "vendor-misc-def.js", bytes: 220_000, gzipBytes: 72_000 },
  { fileName: "host-dashboard-route-aaa.js", bytes: 118_000, gzipBytes: 36_000 },
  { fileName: "host-session-editor-route-bbb.js", bytes: 135_000, gzipBytes: 41_000 },
  { fileName: "public-home-ccc.js", bytes: 31_000, gzipBytes: 10_000 },
  { fileName: "index-entry.js", bytes: 73_000, gzipBytes: 18_000 },
  { fileName: "index-style.css", bytes: 104_000, gzipBytes: 18_000 },
  { fileName: "unexpected-worker.js", bytes: 12_000, gzipBytes: 4_000 },
];

describe("build budget analyzer", () => {
  it("classifies production build assets into budget buckets", () => {
    const report = analyzeBuildAssets(assets, defaultBudgetRules);

    expect(report.assets.map((asset) => [asset.fileName, asset.bucket])).toEqual([
      ["vendor-misc-def.js", "vendor-misc"],
      ["vendor-react-abc.js", "vendor-framework"],
      ["host-session-editor-route-bbb.js", "host-route"],
      ["host-dashboard-route-aaa.js", "host-route"],
      ["index-style.css", "css-global"],
      ["index-entry.js", "app-entry"],
      ["public-home-ccc.js", "route"],
      ["unexpected-worker.js", "uncategorized"],
    ]);
  });

  it("fails hard-gated buckets and leaves measured CSS as a warning", () => {
    const report = analyzeBuildAssets(assets, defaultBudgetRules);

    expect(report.status).toBe("failed");
    expect(report.violations).toEqual([
      {
        bucket: "host-route",
        fileName: "host-session-editor-route-bbb.js",
        bytes: 135_000,
        gzipBytes: 41_000,
        limitBytes: 120_000,
        severity: "error",
      },
    ]);
    expect(report.warnings).toEqual([
      {
        bucket: "css-global",
        fileName: "index-style.css",
        bytes: 104_000,
        gzipBytes: 18_000,
        limitBytes: 100_000,
        severity: "warn",
      },
    ]);
  });

  it("renders a markdown report with largest assets and budget results", () => {
    const report = analyzeBuildAssets(assets, defaultBudgetRules);
    const markdown = renderBuildBudgetMarkdown(report);

    expect(markdown).toContain("# ReadMates Build Budget");
    expect(markdown).toContain(
      "| host-route | host-session-editor-route-bbb.js | 135.0 kB | 41.0 kB | 120.0 kB | error |",
    );
    expect(markdown).toContain("| css-global | index-style.css | 104.0 kB | 18.0 kB | 100.0 kB | warn |");
    expect(markdown).toContain("unexpected-worker.js");
  });

  it("formats bytes in stable base-10 units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 kB");
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
  });
});
