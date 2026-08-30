import { describe, expect, it } from "vitest";
import source from "./host-invitations.tsx?raw";

describe("HostInvitations presentation boundary", () => {
  it("has no direct API, query, router, or fetch dependency", () => {
    expect(source).not.toMatch(/features\/host\/(api|queries|route)|react-router|\bfetch\s*\(/);
  });
});
