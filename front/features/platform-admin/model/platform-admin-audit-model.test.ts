import { describe, expect, it } from "vitest";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  labelAdminAuditOutcome,
  shouldShowAdminAuditDetailValue,
} from "./platform-admin-audit-model";

describe("platform-admin-audit-model", () => {
  it("defaults to 7d range and drops unknown enum values", () => {
    const filters = adminAuditFiltersFromSearchParams(new URLSearchParams("range=invalid&sourceSlice=S5&outcome=FAILED"));

    expect(filters).toEqual({
      range: "7d",
      sourceSlice: "S5",
      outcome: "FAILED",
    });
  });

  it("serializes only meaningful filter values", () => {
    const search = adminAuditSearchFromFilters({ range: "30d", clubId: "club-1", actorRole: null, sourceSlice: "S4" });

    expect(search.toString()).toBe("range=30d&clubId=club-1&sourceSlice=S4");
  });

  it("labels outcomes for ledger chips", () => {
    expect(labelAdminAuditOutcome("SUCCESS")).toBe("성공");
    expect(labelAdminAuditOutcome("PREPARED")).toBe("준비됨");
  });

  it("suppresses unsafe metadata values in defensive UI helpers", () => {
    expect(shouldShowAdminAuditDetailValue("rawJson", "{\"secret\":\"value\"}")).toBe(false);
    expect(shouldShowAdminAuditDetailValue("scope", "METADATA_READ")).toBe(true);
  });
});
