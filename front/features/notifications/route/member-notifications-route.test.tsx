import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("member notifications transition owner", () => {
  it("registers mark-read work and publishes refresh only after accepted settlement", () => {
    const source = readFileSync("features/notifications/route/member-notifications-route.tsx", "utf8");
    expect(source).toContain("useTransitionSafetyOwner");
    expect(source).toContain("publishMemberNotificationsRefresh");
    expect(source).toMatch(/settle\("succeeded"\)[\s\S]*publishMemberNotificationsRefresh/);
  });
});
