import { describe, expect, it } from "vitest";
import type {
  AdminOperationCase,
  AdminOperationCasesResponse,
  AdminOperationSummaryCode,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  adminOperationSummaryLabel,
  buildAdminOperationsView,
  parseAdminOperationsSearch,
  serializeAdminOperationsSearch,
} from "./platform-admin-operations-model";

const generatedAt = "2026-08-04T10:00:00Z";

function operationCase(overrides: Partial<AdminOperationCase> = {}): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id: "case-notification",
    sourceType,
    clubId: "club-1",
    state: "OPEN",
    severity: "WARNING",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-04T08:00:00Z",
    lastObservedAt: "2026-08-04T09:55:00Z",
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: false,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications",
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source: {
      sourceType,
      status: "AVAILABLE",
      generatedAt,
      lastSuccessfulAt: generatedAt,
      authoritative: true,
    },
    ...overrides,
  };
}

function response(overrides: Partial<AdminOperationCasesResponse> = {}): AdminOperationCasesResponse {
  return {
    schema: "admin.operation_cases.v1",
    generatedAt,
    counts: { open: 2, critical: 1, assignedToMe: 1, snoozed: 1 },
    sources: [operationCase().source],
    items: [operationCase()],
    nextCursor: null,
    ...overrides,
  };
}

describe("platform admin operations model", () => {
  it("round-trips case state severity source assignee and cursor filters", () => {
    const parsed = parseAdminOperationsSearch(
      new URLSearchParams(
        "case=case-notification&state=open%2Cacknowledged&severity=critical%2Cwarning&source=notification%2Cai_job&assignee=me&cursor=opaque%2B%2F%3Dcursor",
      ),
    );

    expect(parsed).toEqual({
      caseId: "case-notification",
      filter: {
        states: ["OPEN", "ACKNOWLEDGED"],
        severities: ["CRITICAL", "WARNING"],
        sources: ["NOTIFICATION", "AI_JOB"],
        assignee: "ME",
        cursor: "opaque+/=cursor",
      },
    });
    expect(serializeAdminOperationsSearch(parsed).toString()).toBe(
      "case=case-notification&state=open%2Cacknowledged&severity=critical%2Cwarning&source=notification%2Cai_job&assignee=me&cursor=opaque%2B%2F%3Dcursor",
    );
  });

  it("drops unknown URL values instead of forwarding them to the API", () => {
    const parsed = parseAdminOperationsSearch(
      new URLSearchParams(
        "case=&state=open%2Cdeleted&severity=critical%2Csecret&source=notification%2Cprovider_raw&assignee=anyone&cursor=",
      ),
    );

    expect(parsed).toEqual({
      caseId: null,
      filter: {
        states: ["OPEN"],
        severities: ["CRITICAL"],
        sources: ["NOTIFICATION"],
      },
    });
    expect(serializeAdminOperationsSearch(parsed).toString()).toBe(
      "state=open&severity=critical&source=notification",
    );
  });

  it("selects requested case or first visible case without mutating the list", () => {
    const originalItems = [
      operationCase({ id: "case-info", severity: "INFO", firstObservedAt: "2026-08-04T06:00:00Z" }),
      operationCase({ id: "case-warning", severity: "WARNING", firstObservedAt: "2026-08-04T07:00:00Z" }),
    ];
    const originalOrder = originalItems.map((item) => item.id);

    const requested = buildAdminOperationsView(
      response({ items: originalItems }),
      "case-info",
      new Date(generatedAt),
    );
    const fallback = buildAdminOperationsView(
      response({ items: originalItems }),
      "case-not-visible",
      new Date(generatedAt),
    );

    expect(requested.selectedCase?.id).toBe("case-info");
    expect(fallback.selectedCase?.id).toBe("case-warning");
    expect(originalItems.map((item) => item.id)).toEqual(originalOrder);
  });

  it("labels every summary code without showing unknown raw code", () => {
    const expected: Record<AdminOperationSummaryCode, { title: string; description: string }> = {
      CLUB_SETUP_REQUIRED: {
        title: "클럽 설정이 필요합니다",
        description: "공개 전 필수 조건을 확인하세요.",
      },
      CLUB_DOMAIN_ACTION_REQUIRED: {
        title: "도메인 확인이 필요합니다",
        description: "연결 상태를 확인하세요.",
      },
      CLUB_READY_TO_PUBLISH: {
        title: "클럽이 공개 준비를 마쳤습니다",
        description: "클럽 상세에서 조건을 검토하세요.",
      },
      NOTIFICATION_DELIVERY_FAILURE: {
        title: "알림 전달 실패가 반복되고 있습니다",
        description: "같은 원인의 실패를 확인하세요.",
      },
      NOTIFICATION_PLATFORM_BACKLOG: {
        title: "알림 처리 지연이 감지되었습니다",
        description: "알림 운영 상태를 확인하세요.",
      },
      AI_JOB_FAILED: {
        title: "AI 작업이 실패했습니다",
        description: "안전한 작업 정보만 확인합니다.",
      },
      AI_JOB_STALE: {
        title: "AI 작업 갱신이 지연되고 있습니다",
        description: "작업 상태를 확인하세요.",
      },
      SESSION_CLOSING_BLOCKED: {
        title: "회차 마감이 완료되지 않았습니다",
        description: "호스트 클로징 보드를 확인하세요.",
      },
    };

    for (const [code, label] of Object.entries(expected)) {
      expect(adminOperationSummaryLabel(code)).toEqual(label);
    }

    const unknown = adminOperationSummaryLabel("PROVIDER_RAW_FAILURE");
    expect(unknown).toEqual({
      title: "운영 상태 확인 필요",
      description: "안전한 운영 상세에서 상태를 확인하세요.",
    });
    expect(JSON.stringify(unknown)).not.toContain("PROVIDER_RAW_FAILURE");
  });

  it("sorts critical before warning before ready before info and then by age", () => {
    const items = [
      operationCase({ id: "info-old", severity: "INFO", firstObservedAt: "2026-08-01T00:00:00Z" }),
      operationCase({ id: "warning-new", severity: "WARNING", firstObservedAt: "2026-08-04T09:00:00Z" }),
      operationCase({ id: "critical-new", severity: "CRITICAL", firstObservedAt: "2026-08-04T09:30:00Z" }),
      operationCase({ id: "ready-old", severity: "READY", firstObservedAt: "2026-08-02T00:00:00Z" }),
      operationCase({ id: "critical-old", severity: "CRITICAL", firstObservedAt: "2026-08-03T00:00:00Z" }),
    ];

    const view = buildAdminOperationsView(response({ items }), null, new Date(generatedAt));

    expect(view.items.map((item) => item.id)).toEqual([
      "critical-old",
      "critical-new",
      "warning-new",
      "ready-old",
      "info-old",
    ]);
    expect(view.items[0]?.severityLabel).toBe("긴급");
    expect(view.items[0]?.ageLabel).toBe("1일 전");
  });

  it("uses a safe age fallback for an invalid observed timestamp", () => {
    const view = buildAdminOperationsView(
      response({ items: [operationCase({ firstObservedAt: "not-a-timestamp" })] }),
      null,
      new Date(generatedAt),
    );

    expect(view.items[0]?.ageLabel).toBe("시간 확인 필요");
  });

  it("builds mobile counts and source freshness messages", () => {
    const view = buildAdminOperationsView(
      response({
        sources: [
          {
            sourceType: "NOTIFICATION",
            status: "AVAILABLE",
            generatedAt,
            lastSuccessfulAt: generatedAt,
            authoritative: true,
          },
          {
            sourceType: "AI_JOB",
            status: "UNAVAILABLE",
            generatedAt,
            lastSuccessfulAt: "2026-08-04T09:30:00Z",
            authoritative: false,
          },
          {
            sourceType: "CLOSING_RISK",
            status: "DISABLED",
            generatedAt,
            lastSuccessfulAt: null,
            authoritative: false,
          },
        ],
      }),
      null,
      new Date(generatedAt),
    );

    expect(view.mobileSummary).toEqual({
      open: "활성 2건",
      critical: "긴급 1건",
      assignedToMe: "내 담당 1건",
      snoozed: "보류 1건",
      label: "활성 2건 · 긴급 1건 · 내 담당 1건 · 보류 1건",
    });
    expect(view.sources.map(({ sourceType, message, canRetry }) => ({ sourceType, message, canRetry }))).toEqual([
      { sourceType: "NOTIFICATION", message: "정상 · 19:00 기준", canRetry: false },
      { sourceType: "AI_JOB", message: "확인 불가 · 마지막 정상 18:30", canRetry: true },
      { sourceType: "CLOSING_RISK", message: "비활성", canRetry: false },
    ]);
  });
});
