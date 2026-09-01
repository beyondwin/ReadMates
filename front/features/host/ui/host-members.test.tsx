import { describe, expect, it } from "vitest";
import source from "./host-members.tsx?raw";

describe("HostMembers presentation boundary", () => {
  it("has no direct API, query, router, or fetch dependency", () => {
    expect(source).not.toMatch(/features\/host\/(api|queries|route)|react-router|\bfetch\s*\(/);
  });
});
