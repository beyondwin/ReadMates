import { describe, expect, it } from "vitest";
import { buildPreviewCommand, previewOutputDir } from "./lighthouse-preview";

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
});
