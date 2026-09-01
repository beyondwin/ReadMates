import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host session editor presentation chain", () => {
  it("keeps the editor callback-driven and free of write/query imports", () => {
    const source = readFileSync("features/host/ui/host-session-editor.tsx", "utf8");
    expect(source).toContain("actions");
    expect(source).not.toMatch(/from ["'][^"']*\/(queries|api|route|app|pages?)\//);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
