import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host operations page presentation boundary", () => {
  it("delegates AI defaults through owner-supplied props", () => {
    const source = readFileSync("features/host/ui/host-operations-page.tsx", "utf8");
    expect(source).toContain("aiDefaults");
    expect(source).not.toMatch(/from ["'][^"']*\/(queries|api|route|app|pages?)\//);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
