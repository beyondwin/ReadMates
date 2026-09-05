import { describe, expect, it } from "vitest";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  aiOpsDrilldownForAuditItem,
  buildAdminAuditLedgerRow,
  buildAdminAuditOperationSummary,
  formatAdminAuditOccurredAt,
  formatAdminAuditLedgerSentence,
  adminAuditReasonLabel,
  adminAuditActorPrimaryLabel,
  adminAuditPeriodFromFilters,
  buildAdminAuditDetailSections,
  formatAdminAuditRowClock,
  mergeAdminAuditLedgerPages,
  labelAdminAuditOutcome,
  labelAdminAuditActorRole,
  labelAdminAuditActionCategory,
  labelAdminAuditSourceSlice,
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

  it("translates every visible filter option while preserving the wire enum separately", () => {
    expect(([
      "NOTIFICATION",
      "SUPPORT",
      "CLUB_LIFECYCLE",
      "AI_OPS",
      "AUTH_SECURITY",
      "PLATFORM_ADMIN",
    ] as const).map(labelAdminAuditActionCategory)).toEqual([
      "알림",
      "지원 접근",
      "클럽 운영",
      "AI 작업",
      "인증·보안",
      "플랫폼 운영",
    ]);
    expect((["S3", "S4", "S5", "S6", "PLATFORM", "CLUB"] as const).map(labelAdminAuditSourceSlice)).toEqual([
      "클럽 운영",
      "지원 접근",
      "알림",
      "AI 작업",
      "플랫폼",
      "클럽",
    ]);
  });

  it("preserves every nonempty human actor label and translates only exact role fallbacks", () => {
    expect(adminAuditActorPrimaryLabel({ role: "OWNER", displayLabel: "OWNER" })).toBe("소유자");
    expect(adminAuditActorPrimaryLabel({ role: "OPERATOR", displayLabel: "운영 담당자" })).toBe("운영 담당자 · 운영자");
    expect(adminAuditActorPrimaryLabel({ role: "OPERATOR", displayLabel: "KIM" })).toBe("KIM · 운영자");
    expect(adminAuditActorPrimaryLabel({ role: "SUPPORT", displayLabel: "JANE_DOE" })).toBe("JANE_DOE · 지원 담당");
    expect(adminAuditActorPrimaryLabel({ role: "SUPPORT", displayLabel: "SUPPORT" })).toBe("지원 담당");
    expect(adminAuditActorPrimaryLabel({ role: "FUTURE_ROLE" as never, displayLabel: "FUTURE_ROLE" })).toBe("확인 필요");
    expect(adminAuditActorPrimaryLabel({ role: "FUTURE_ROLE" as never, displayLabel: "KIM" })).toBe("KIM · 확인 필요");
    expect(adminAuditActorPrimaryLabel({ role: "FUTURE_ROLE" as never, displayLabel: "" })).toBe("확인 필요");
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
    actionType: "AI_COMMAND_RETRY_COMMIT",
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
  it("renders the exact time, actor, target action, and result order without primary identifiers", () => {
    const item = auditItem({
      sourceSlice: "S5",
      actionCategory: "NOTIFICATION",
      actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
      actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
      summary: "알림 재처리가 확정되었습니다.",
      outcome: "SUCCESS",
      safeMetadata: [
        { label: "receiptId", value: "receipt-1", kind: "id" },
        { label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" },
      ],
    });

    expect(buildAdminAuditLedgerRow(item)).toEqual({
      occurredAt: formatAdminAuditOccurredAt(item.occurredAt),
      actor: "소유자",
      action: "알림 재처리 대상에 알림 재처리를 확정했습니다.",
      result: "완료",
    });
    expect(formatAdminAuditLedgerSentence(item)).toBe(
      `${formatAdminAuditOccurredAt(item.occurredAt)} · 소유자 · 알림 재처리 대상에 알림 재처리를 확정했습니다. · 완료`,
    );
    expect(formatAdminAuditLedgerSentence(item)).not.toContain("OWNER");
    expect(formatAdminAuditLedgerSentence(item)).not.toContain("사유");
    expect(formatAdminAuditLedgerSentence(item)).not.toContain("preview-1");
    expect(formatAdminAuditLedgerSentence(item)).not.toContain("receipt-1");
    expect(formatAdminAuditLedgerSentence(item)).not.toContain("AI_COMMAND_RETRY_COMMIT");
  });

  it("maps representative server-shaped audit evidence without using raw summaries as primary copy", () => {
    const supportReceiptCreate = auditItem({
      sourceSlice: "S4",
      sourceTable: "platform_admin_support_command_receipts",
      actionCategory: "SUPPORT",
      actionType: "SUPPORT_ACCESS_GRANT_CREATE",
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "receipt-1", label: "사용자 숨김" },
      summary: "SUPPORT 감사 증거가 기록되었습니다.",
      safeMetadata: [
        { label: "commandType", value: "CREATE", kind: "code" },
        { label: "scope", value: "METADATA_READ", kind: "code" },
      ],
    });
    const supportReceiptRevoke = auditItem({
      sourceSlice: "S4",
      sourceTable: "platform_admin_support_command_receipts",
      actionCategory: "SUPPORT",
      actionType: "SUPPORT_ACCESS_GRANT_REVOKE",
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "receipt-2", label: "사용자 숨김" },
      summary: "SUPPORT 감사 증거가 기록되었습니다.",
      safeMetadata: [{ label: "commandType", value: "REVOKE", kind: "code" }],
    });
    const replayPreview = auditItem({
      sourceSlice: "S5",
      sourceTable: "admin_notification_replay_previews",
      actionCategory: "NOTIFICATION",
      actionType: "ADMIN_NOTIFICATION_REPLAY_PREVIEW_PREPARED",
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
      summary: "알림 재처리 대상이 미리 확인되었습니다.",
      outcome: "PREPARED",
    });
    const platformAdmin = auditItem({
      sourceSlice: "PLATFORM",
      sourceTable: "platform_audit_events",
      actionCategory: "PLATFORM_ADMIN",
      actionType: "ADMIN_CLUB_METADATA_UPDATED",
      target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "대상 없음" },
      summary: "platform admin 이벤트가 기록되었습니다.",
    });

    expect(buildAdminAuditLedgerRow(supportReceiptCreate).action).toBe("지원 접근 대상에 지원 접근 권한을 부여했습니다.");
    expect(buildAdminAuditLedgerRow(supportReceiptRevoke).action).toBe("지원 접근 대상에 지원 접근 권한을 회수했습니다.");
    expect(buildAdminAuditLedgerRow(replayPreview).action).toBe("알림 재처리 대상에 재처리 대상을 미리 확인했습니다.");
    expect(buildAdminAuditLedgerRow(platformAdmin).action).toBe("대상 클럽에 클럽 기본 정보를 수정했습니다.");
    for (const item of [supportReceiptCreate, supportReceiptRevoke, replayPreview, platformAdmin]) {
      expect(buildAdminAuditLedgerRow(item).action).not.toContain(item.summary);
    }
  });

  it.each([
    ["SUPPORT_ACCESS_GRANT_CREATED", "support grant가 생성되었습니다.", "지원 접근 권한을 부여했습니다."],
    ["SUPPORT_ACCESS_GRANT_REVOKED", "support grant가 회수되었습니다.", "지원 접근 권한을 회수했습니다."],
  ] as const)("keeps the platform-event support mapping %s separate from receipt actions", (actionType, summary, expected) => {
    const platformEvent = auditItem({
      sourceSlice: "S4",
      sourceTable: "platform_audit_events",
      actionCategory: "SUPPORT",
      actionType,
      target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
      summary,
    });

    expect(buildAdminAuditLedgerRow(platformEvent).action).toBe(`지원 접근 대상에 ${expected}`);
    expect(buildAdminAuditLedgerRow(platformEvent).action).not.toContain(summary);
  });

  it.each([
    ["ADMIN_NOTIFICATION_REPLAY_PREVIEW_PREPARED", "PREPARED", "재처리 대상을 미리 확인했습니다."],
    ["ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONSUMED", "SUCCESS", "재처리 미리보기를 사용했습니다."],
    ["ADMIN_NOTIFICATION_REPLAY_PREVIEW_LEGACY", "UNKNOWN", "이전 재처리 미리보기 증거를 기록했습니다."],
  ] as const)("maps server preview variant %s", (actionType, outcome, expectedAction) => {
    const item = auditItem({
      sourceSlice: "S5",
      sourceTable: "admin_notification_replay_previews",
      actionCategory: "NOTIFICATION",
      actionType,
      outcome,
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
      summary: "알림 재처리 preview 증거가 기록되었습니다.",
    });

    expect(buildAdminAuditLedgerRow(item).action).toBe(`알림 재처리 대상에 ${expectedAction}`);
    expect(buildAdminAuditLedgerRow(item).action).not.toContain("preview");
  });

  it("fails closed for unknown action evidence and never promotes its raw summary", () => {
    const unknown = auditItem({
      sourceSlice: "PLATFORM",
      sourceTable: "platform_audit_events",
      actionCategory: "PLATFORM_ADMIN",
      actionType: "FUTURE_UNRECOGNIZED_ACTION",
      target: { clubId: null, userId: null, jobId: null, eventId: null, label: "대상 없음" },
      summary: "future raw summary MUST_NOT_BE_PRIMARY",
      outcome: "UNKNOWN",
    });

    expect(buildAdminAuditLedgerRow(unknown).action).toBe("플랫폼 운영 대상의 처리 내용을 확인해야 합니다.");
    expect(formatAdminAuditLedgerSentence(unknown)).not.toContain("future raw summary");
    expect(formatAdminAuditLedgerSentence(unknown)).not.toContain("FUTURE_UNRECOGNIZED_ACTION");
  });

  it("uses 진행 중 only for an actual convergence PENDING source", () => {
    const convergence = auditItem({
      sourceTable: "admin_service_command_convergence_events:ai",
      outcome: "PREPARED",
      safeMetadata: [{ label: "state", value: "PENDING", kind: "code" }],
    });
    const ordinaryPrepared = auditItem({
      sourceTable: "ai_generation_audit_log",
      outcome: "PREPARED",
      safeMetadata: [{ label: "status", value: "PENDING", kind: "code" }],
    });
    const convergenceWithoutPending = auditItem({
      sourceTable: "public_convergence_events",
      outcome: "PREPARED",
      safeMetadata: [{ label: "state", value: "SUCCEEDED", kind: "code" }],
    });

    expect(buildAdminAuditLedgerRow(convergence).result).toBe("진행 중");
    expect(buildAdminAuditLedgerRow(ordinaryPrepared).result).toBe("실행 전 준비됨");
    expect(buildAdminAuditLedgerRow(convergenceWithoutPending).result).toBe("실행 전 준비됨");
  });

  it("states when no reason information was recorded without inventing one", () => {
    expect(adminAuditReasonLabel(auditItem())).toBe("기록된 사유 정보가 없습니다.");
    expect(
      adminAuditReasonLabel(
        auditItem({ safeMetadata: [{ label: "reasonRedacted", value: "true", kind: "boolean" }] }),
      ),
    ).toBe("사유 내용은 보호되어 표시되지 않습니다.");
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

  it("maps existing range filters onto period labels and formats clocks from timestamps", () => {
    expect(adminAuditPeriodFromFilters({ range: "24h" }).label).toBe("오늘");
    expect(adminAuditPeriodFromFilters({ range: "7d" }).label).toBe("이번 주");
    expect(adminAuditPeriodFromFilters({ range: "30d" }).label).toBe("이번 달");
    expect(adminAuditPeriodFromFilters({ from: "2026-08-01T00:00:00.000Z" }).label).toBe("기간 지정");
    expect(formatAdminAuditRowClock("2026-08-26T05:52:00Z")).toBe("14:52");
  });

  it("builds five docket sections from share-safe metadata without inventing missing before/after values", () => {
    const labeled = buildAdminAuditDetailSections(auditItem({
      safeMetadata: [
        { label: "처리한 이유", value: "전달 지연을 확인했습니다.", kind: "text" },
        { label: "영향 범위", value: "클럽 2곳", kind: "text" },
        { label: "beforeStatus", value: "FAILED", kind: "code" },
        { label: "afterStatus", value: "SUCCEEDED", kind: "code" },
        { label: "처리 결과", value: "정상 반영 확인", kind: "text" },
      ],
    }));
    expect(labeled.map((section) => section.heading)).toEqual([
      "처리한 이유",
      "영향 범위",
      "변경 전",
      "변경 후",
      "처리 결과",
    ]);
    expect(labeled.map((section) => section.body)).toEqual([
      "전달 지연을 확인했습니다.",
      "클럽 2곳",
      "FAILED",
      "SUCCEEDED",
      "정상 반영 확인",
    ]);
    expect(buildAdminAuditDetailSections(auditItem()).map((section) => section.body)).toEqual([
      "기록된 사유 정보가 없습니다.",
      "AI 작업",
      "—",
      "—",
      "정상",
    ]);
  });
});
