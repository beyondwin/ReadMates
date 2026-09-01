import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PreviewView presentation boundary", () => {
  it("receives commands as callbacks and imports no execution boundary", () => {
    const source = readFileSync("features/host/aigen/ui/PreviewView.tsx", "utf8");
    expect(source).toContain("onRegenerate");
    expect(source).toContain("onCommit");
    expect(source).not.toMatch(/from ["'][^"']*\/(queries|api|route|app|pages?)\//);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
