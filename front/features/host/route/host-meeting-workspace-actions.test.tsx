import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host meeting workspace action adapter", () => {
  it("registers every command and publishes only through explicit query publishers", () => {
    const source = readFileSync("features/host/route/host-meeting-workspace-actions.ts", "utf8");
    expect(source).toContain("useTransitionSafetyOwner");
    expect(source).toMatch(/settle\("succeeded"\)[\s\S]*await publish/);
    for (const publisher of [
      "publishHostSessionCreated", "publishHostSessionResponse", "publishDeletedHostSession",
      "publishRestoredHostSession", "publishHostSessionAttendance", "publishHostSessionImport",
      "publishHostSessionVisibility",
    ]) expect(source).toContain(publisher);
  });
});
