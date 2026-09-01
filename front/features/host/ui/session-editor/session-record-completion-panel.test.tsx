import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("session record completion panel presentation chain", () => {
  it("renders the injected AI workflow without owning a mutation or router", () => {
    const source = readFileSync("features/host/ui/session-editor/session-record-completion-panel.tsx", "utf8");
    expect(source).toContain("renderAiGeneration");
    expect(source).not.toMatch(/from ["'][^"']*\/(queries|api|route|app|pages?)\//);
    expect(source).not.toMatch(/\b(fetch|useMutation|useNavigate)\s*\(/);
  });
});
