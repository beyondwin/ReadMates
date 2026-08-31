import { describe, expect, it } from "vitest";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  aiOpsDrilldownForAuditItem,
  buildAdminAuditOperationSummary,
  formatAdminAuditLedgerSentence,
  adminAuditActorPrimaryLabel,
  mergeAdminAuditLedgerPages,
  labelAdminAuditOutcome,
  labelAdminAuditActorRole,
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

  it("keeps only normalized share-safe filters and never serializes cursor or target search", () => {
    const filters = adminAuditFiltersFromSearchParams(
      new URLSearchParams(
        "range=30d&from=2026-08-01T00%3A00%3A00Z&to=invalid&clubId=club-1&actorRole=OWNER&sourceSlice=S6&actionCategory=AI_OPS&outcome=FAILED&cursor=signed-secret&email=private%40example.com",
      ),
    );

    expect(filters).toEqual({
      range: "30d",
      from: "2026-08-01T00:00:00.000Z",
      clubId: "club-1",
      actorRole: "OWNER",
      sourceSlice: "S6",
      actionCategory: "AI_OPS",
      outcome: "FAILED",
    });
    expect(adminAuditSearchFromFilters({ ...filters, cursor: "must-not-leak" } as never).toString()).toBe(
      "range=30d&from=2026-08-01T00%3A00%3A00.000Z&clubId=club-1&actorRole=OWNER&sourceSlice=S6&actionCategory=AI_OPS&outcome=FAILED",
    );
  });

  it("labels outcomes for ledger chips", () => {
    expect((["SUCCESS", "FAILED", "DENIED", "PREPARED", "UNKNOWN"] as const).map(labelAdminAuditOutcome)).toEqual([
      "완료",
      "실패",
      "차단됨",
      "실행 전 준비됨",
      "결과 확인 필요",
    ]);
  });

  it("translates platform roles in audit detail instead of exposing raw values", () => {
    expect((["OWNER", "OPERATOR", "SUPPORT"] as const).map(labelAdminAuditActorRole)).toEqual([
      "소유자",
      "운영자",
      "지원 담당",
    ]);
  });

  it("preserves human actor names but rejects enum and future machine fallback labels", () => {
    expect(adminAuditActorPrimaryLabel({ role: "OWNER", displayLabel: "OWNER" })).toBe("소유자");
    expect(adminAuditActorPrimaryLabel({ role: "OPERATOR", displayLabel: "운영 담당자" })).toBe("운영 담당자 · 운영자");
    expect(adminAuditActorPrimaryLabel({ role: "SUPPORT", displayLabel: "SUPPORT" })).toBe("지원 담당");
    expect(adminAuditActorPrimaryLabel({ role: "FUTURE_ROLE" as never, displayLabel: "FUTURE_ROLE" })).toBe("확인 필요");
  });

  it("reads a target query as the initial clubId filter without serializing target", () => {
    expect(adminAuditFiltersFromSearchParams(new URLSearchParams("target=club-reading-sai"))).toEqual({
      range: "7d",
      clubId: "club-reading-sai",
    });
    expect(
      adminAuditFiltersFromSearchParams(new URLSearchParams("target=case-notification&clubId=club-1")),
    ).toEqual({
      range: "7d",
      clubId: "club-1",
    });
    expect(adminAuditSearchFromFilters({ range: "7d", clubId: "club-reading-sai" }).toString()).toBe(
      "range=7d&clubId=club-reading-sai",
    );
    expect(adminAuditSearchFromFilters({ range: "7d", clubId: "club-reading-sai" }).has("target")).toBe(false);
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

describe("formatAdminAuditLedgerSentence", () => {
  it("renders one sentence with 사유 없음 when reason metadata is absent", () => {
    const sentence = formatAdminAuditLedgerSentence(auditItem({
      actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
      summary: "알림 재처리가 확정되었습니다.",
      outcome: "SUCCESS",
      safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
    }));

    expect(sentence).toContain("소유자가 Replay preview에 알림 재처리가 확정되었습니다.");
    expect(sentence).not.toContain("OWNER");
    expect(sentence).toContain("사유: 사유 없음");
    expect(sentence).toContain("완료");
    expect(sentence).not.toContain("preview-1");
    expect(sentence).not.toContain("ADMIN_AI_OPS_RETRY_COMMIT");
  });

  it("labels a DENIED outcome as 차단", () => {
    expect(formatAdminAuditLedgerSentence(auditItem({ outcome: "DENIED" }))).toContain("차단");
  });
});

describe("aiOpsDrilldownForAuditItem", () => {
  it("returns an ai-ops club and job path for an AI_OPS item", () => {
    expect(aiOpsDrilldownForAuditItem(auditItem())).toBe("/admin/ai-ops?clubId=club-1&jobId=job-1");
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

describe("buildAdminAuditOperationSummary", () => {
  it("marks failed and denied events as review-needed", () => {
    expect(buildAdminAuditOperationSummary(auditItem({ outcome: "FAILED" }))).toMatchObject({
      state: "NEEDS_REVIEW",
      label: "확인 필요",
      nextHref: "/admin/ai-ops?clubId=club-1&jobId=job-1",
    });

    expect(buildAdminAuditOperationSummary(auditItem({ outcome: "DENIED", actionCategory: "SUPPORT" }))).toMatchObject(
      {
        state: "NEEDS_REVIEW",
        label: "확인 필요",
        nextHref: null,
      },
    );
  });

  it("marks unavailable metadata as limited detail", () => {
    expect(buildAdminAuditOperationSummary(auditItem({ metadataState: "UNAVAILABLE" }))).toEqual({
      state: "LIMITED_DETAIL",
      label: "세부 정보 제한",
      detail: "안전 정책 또는 source 상태 때문에 세부 정보를 표시하지 않습니다.",
      nextHref: "/admin/ai-ops?clubId=club-1&jobId=job-1",
      nextLabel: "AI 작업에서 보기",
    });
  });

  it("surfaces AI 작업 drilldown as follow-up when the event succeeded", () => {
    expect(buildAdminAuditOperationSummary(auditItem())).toEqual({
      state: "FOLLOW_UP_AVAILABLE",
      label: "후속 화면 있음",
      detail: "AI 작업 화면에서 같은 클럽 범위로 이어서 확인할 수 있습니다.",
      nextHref: "/admin/ai-ops?clubId=club-1&jobId=job-1",
      nextLabel: "AI 작업에서 보기",
    });
  });

  it("marks safe successful events as recorded evidence", () => {
    expect(
      buildAdminAuditOperationSummary(
        auditItem({
          actionCategory: "SUPPORT",
          sourceSlice: "S4",
          target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
          safeMetadata: [{ label: "scope", value: "HOST_SUPPORT_READ", kind: "code" }],
        }),
      ),
    ).toEqual({
      state: "RECORDED",
      label: "기록 보존",
      detail: "지원 접근 이벤트가 감사 가능한 안전한 메타데이터와 함께 기록되었습니다.",
      nextHref: null,
      nextLabel: null,
    });
  });
});

describe("mergeAdminAuditLedgerPages", () => {
  it("appends and deduplicates while preserving the first snapshot and unavailable sources", () => {
    const first = {
      generatedAt: "2026-08-25T00:00:00Z",
      filters: { from: "2026-08-18T00:00:00Z", to: "2026-08-25T00:00:00Z" },
      summary: { visibleCount: 2, sourceUnavailableCount: 1, metadataUnavailableCount: 0, unavailableSources: ["source-a"] },
      items: [auditItem({ id: "a" }), auditItem({ id: "boundary" })],
      nextCursor: "cursor-1",
    };
    const second = {
      ...first,
      generatedAt: "2026-08-25T00:01:00Z",
      filters: { from: "wrong", to: "wrong" },
      summary: { visibleCount: 2, sourceUnavailableCount: 2, metadataUnavailableCount: 1, unavailableSources: ["source-a", "source-b"] },
      items: [auditItem({ id: "boundary" }), auditItem({ id: "b", metadataState: "UNAVAILABLE" })],
      nextCursor: null,
    };

    expect(mergeAdminAuditLedgerPages([first, second])).toEqual({
      generatedAt: first.generatedAt,
      filters: first.filters,
      summary: {
        visibleCount: 3,
        sourceUnavailableCount: 2,
        metadataUnavailableCount: 1,
        unavailableSources: ["source-a", "source-b"],
      },
      items: [first.items[0], first.items[1], second.items[1]],
      nextCursor: null,
    });
  });
});
