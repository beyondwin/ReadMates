import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host notification route owner", () => {
  it("registers L3 commands and gates cache publication on accepted settlement", () => {
    const source = readFileSync("features/host/route/host-notifications-route.tsx", "utf8");
    expect(source).toContain("useTransitionSafetyOwner");
    expect(source).toContain('transitionOwner.begin(operationId, "L3"');
    expect(source).toMatch(/settle\("succeeded"\)[\s\S]*await publish/);
    expect(source).toContain("publishManualNotificationConfirm");
    expect(source).toContain("publishHostNotificationPolicy");
  });
});
