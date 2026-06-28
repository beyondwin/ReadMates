import { describe, expect, it } from "vitest";
import { buildPreviewCommand, buildPreviewServerEnv, isExpectedPreviewShutdown, previewOutputDir } from "./lighthouse-preview";

describe("lighthouse preview helpers", () => {
  it("creates a stable output directory under tmp performance", () => {
    expect(previewOutputDir("2026-06-28T00-00-00-000Z")).toBe(
      "../.tmp/performance/lighthouse-preview/2026-06-28T00-00-00-000Z",
    );
  });

  it("builds the existing diagnostic command with preview env", () => {
    const command = buildPreviewCommand({
      baseUrl: "http://127.0.0.1:4173",
      outputDir: "../.tmp/performance/lighthouse-preview/run",
      group: "public",
      limit: 2,
    });

    expect(command).toEqual({
      command: "tsx",
      args: ["scripts/lighthouse-diagnostic.ts", "--group", "public", "--limit", "2"],
      env: {
        LIGHTHOUSE_BASE_URL: "http://127.0.0.1:4173",
        LIGHTHOUSE_OUTPUT_DIR: "../.tmp/performance/lighthouse-preview/run",
        LIGHTHOUSE_SERVER_PROFILE: "vite-preview",
      },
    });
  });

  it("builds preview server env with a local API mock upstream", () => {
    expect(buildPreviewServerEnv({ apiBaseUrl: "http://127.0.0.1:5137" })).toEqual({
      READMATES_API_BASE_URL: "http://127.0.0.1:5137",
    });
  });

  it("treats SIGTERM from preview shutdown as expected cleanup", () => {
    expect(isExpectedPreviewShutdown({ code: null, signal: "SIGTERM" })).toBe(true);
    expect(isExpectedPreviewShutdown({ code: 0, signal: null })).toBe(true);
    expect(isExpectedPreviewShutdown({ code: 143, signal: null })).toBe(true);
    expect(isExpectedPreviewShutdown({ code: 1, signal: null })).toBe(false);
  });
});
