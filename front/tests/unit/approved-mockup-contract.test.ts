import { describe, expect, it } from "vitest";
import { APPROVED_MOCKUPS, approvedMockupsAffectedBy } from "../e2e/support/approved-mockup-manifest";
import { expectGeometryWithinTolerance, verifyApprovedReference } from "../e2e/support/approved-mockup-contract";

describe("approved mockup contract", () => {
  it("registers the exact 7 Admin and 11 Host authorities with unique ids", () => {
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "admin")).toHaveLength(7);
    expect(APPROVED_MOCKUPS.filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(new Set(APPROVED_MOCKUPS.map((entry) => entry.id)).size).toBe(18);
    for (const entry of APPROVED_MOCKUPS) verifyApprovedReference(entry);
  });

  it("fails closed above the 4 CSS px major-region tolerance", () => {
    expect(() => expectGeometryWithinTolerance(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 0, y: 0, width: 104.01, height: 80 },
      4,
    )).toThrow(/width delta 4.01px/);
  });

  it("maps shared visual dependencies to every downstream authority", () => {
    expect(approvedMockupsAffectedBy(["shared/ui/app-club-shell.tsx"])
      .filter((entry) => entry.role === "host")).toHaveLength(11);
    expect(approvedMockupsAffectedBy(["features/platform-admin/ui/admin-shell.css"]))
      .toHaveLength(7);
  });
});
