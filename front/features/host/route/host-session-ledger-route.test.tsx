import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host session ledger transition owner", () => {
  it("registers restore and publishes the returned canonical detail after acceptance", () => {
    const source = readFileSync("features/host/route/host-session-ledger-route.tsx", "utf8");
    expect(source).toContain("useTransitionSafetyOwner");
    expect(source).toContain('transitionOwner.begin(operationId, "L2"');
    expect(source).toMatch(/settle\("succeeded"\)[\s\S]*publishRestoredHostSession/);
  });
});
