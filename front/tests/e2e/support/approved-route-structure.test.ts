import { describe, expect, it } from "vitest";
import { APPROVED_MOCKUPS } from "./approved-mockup-manifest";
import { APPROVED_ROUTE_STRUCTURE } from "./approved-route-structure";

describe("approved route structure contract", () => {
  it("registers rules for all 18 approved ids", () => {
    expect(Object.keys(APPROVED_ROUTE_STRUCTURE).sort()).toEqual(APPROVED_MOCKUPS.map((e) => e.id).sort());
    for (const rules of Object.values(APPROVED_ROUTE_STRUCTURE)) {
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.selector.trim().length).toBeGreaterThan(0);
        if (rule.presence === "text-absent") expect(rule.text.length).toBeGreaterThan(0);
      }
    }
  });
});
