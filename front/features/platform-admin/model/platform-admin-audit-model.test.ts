import { describe, expect, it } from "vitest";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  aiOpsDrilldownForAuditItem,
  labelAdminAuditOutcome,
  shouldShowAdminAuditDetailValue,
} from "./platform-admin-audit-model";
import type { AdminAuditLedgerItem } from "./platform-admin-audit-model";

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

function auditItem(overrides: Partial<AdminAuditLedgerItem> = {}): AdminAuditLedgerItem {
  return {
    id: "platform_audit_events:event-ai",
    occurredAt: "2026-05-31T00:00:00Z",
    sourceSlice: "S6",
    sourceTable: "platform_audit_events",
    actionCategory: "AI_OPS",
    actionType: "ADMIN_AI_OPS_RETRY_COMMIT",
    outcome: "SUCCESS",
    actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
    target: { clubId: "club-1", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
    summary: "AI 커밋 재시도를 실행했습니다.",
    safeMetadata: [],
    metadataState: "AVAILABLE",
    ...overrides,
  };
}

describe("aiOpsDrilldownForAuditItem", () => {
  it("returns an ai-ops clubId path for an AI_OPS item with a club target", () => {
    expect(aiOpsDrilldownForAuditItem(auditItem())).toBe("/admin/ai-ops?clubId=club-1");
  });

  it("returns null when the action category is not AI_OPS", () => {
    expect(aiOpsDrilldownForAuditItem(auditItem({ actionCategory: "NOTIFICATION" }))).toBeNull();
  });

  it("returns null when the AI_OPS item has no club target", () => {
    expect(
      aiOpsDrilldownForAuditItem(
        auditItem({ target: { clubId: null, userId: null, jobId: "job-1", eventId: null, label: "AI job" } }),
      ),
    ).toBeNull();
  });
});
