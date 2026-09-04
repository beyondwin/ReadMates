import { describe, expect, it } from "vitest";
import type {
  AdminOperationCase,
  AdminOperationCasesResponse,
  AdminOperationSummaryCode,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  adminOperationSummaryLabel,
  adminOperationsScopeKey,
  buildAdminOperationWorkViews,
  buildAdminOperationsView,
  effectiveAdminOperationsFilter,
  filterAdminOperationItems,
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
  it("uses the centralized case lifecycle language in actual case views", () => {
    const states = ["OPEN", "ACKNOWLEDGED", "SNOOZED", "RESOLVED"] as const;
    const labels = states.map((state) => buildAdminOperationsView(
      response({ items: [operationCase({ state })] }),
      null,
      new Date(generatedAt),
    ).items[0]?.stateLabel);

    expect(labels).toEqual(["확인 전", "확인함", "잠시 미룸", "처리함"]);
  });
  it("uses three priority rows until queue=all is present", () => {
    expect(parseAdminOperationsSearch(new URLSearchParams("case=case-1")).queueDisclosure)
      .toBe("priority");
    expect(parseAdminOperationsSearch(new URLSearchParams("queue=all")).queueDisclosure)
      .toBe("all");
    expect(serializeAdminOperationsSearch({
      caseId: "case-1",
      filter: {},
      queueDisclosure: "all",
    }).toString()).toBe("case=case-1&queue=all");
  });

  it("round-trips case state severity source assignee and cursor filters", () => {
    const parsed = parseAdminOperationsSearch(
      new URLSearchParams(
        "case=case-notification&state=open%2Cacknowledged&severity=critical%2Cwarning&source=notification%2Cai_job&assignee=me&cursor=opaque%2B%2F%3Dcursor",
      ),
    );

    expect(parsed).toEqual({
      caseId: "case-notification",
      mode: "list",
      workView: "briefing",
      query: "",
      filter: {
        states: ["OPEN", "ACKNOWLEDGED"],
        severities: ["CRITICAL", "WARNING"],
        sources: ["NOTIFICATION", "AI_JOB"],
        assignee: "ME",
        cursor: "opaque+/=cursor",
      },
      queueDisclosure: "priority",
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
      mode: "list",
      workView: "briefing",
      query: "",
      filter: {
        states: ["OPEN"],
        severities: ["CRITICAL"],
        sources: ["NOTIFICATION"],
      },
      queueDisclosure: "priority",
    });
    expect(serializeAdminOperationsSearch(parsed).toString()).toBe(
      "state=open&severity=critical&source=notification",
    );
  });

  it("keeps work view query and mode in the URL without forwarding q to the API", () => {
    const state = parseAdminOperationsSearch(
      new URLSearchParams("view=mine&q=%EC%95%8C%EB%A6%BC&mode=detail&severity=critical"),
    );

    expect(state).toMatchObject({
      mode: "detail",
      workView: "mine",
      query: "알림",
    });
    expect(effectiveAdminOperationsFilter(state)).toEqual({
      states: ["OPEN", "ACKNOWLEDGED", "SNOOZED"],
      severities: ["CRITICAL"],
      assignee: "ME",
    });
    expect(serializeAdminOperationsSearch(state).toString()).toBe(
      "view=mine&q=%EC%95%8C%EB%A6%BC&mode=detail&severity=critical",
    );
  });

  it("round-trips case work view query mode and current filters", () => {
    const parsed = parseAdminOperationsSearch(
      new URLSearchParams(
        "case=case-notification&view=snoozed&q=%EC%95%8C%EB%A6%BC&mode=detail&state=open%2Cacknowledged&severity=critical%2Cwarning&source=notification%2Cai_job&assignee=me&cursor=opaque%2B%2F%3Dcursor",
      ),
    );

    expect(parsed).toEqual({
      caseId: "case-notification",
      mode: "detail",
      workView: "snoozed",
      query: "알림",
      filter: {
        states: ["OPEN", "ACKNOWLEDGED"],
        severities: ["CRITICAL", "WARNING"],
        sources: ["NOTIFICATION", "AI_JOB"],
        assignee: "ME",
        cursor: "opaque+/=cursor",
      },
      queueDisclosure: "priority",
    });
    expect(serializeAdminOperationsSearch(parsed).toString()).toBe(
      "case=case-notification&view=snoozed&q=%EC%95%8C%EB%A6%BC&mode=detail&state=open%2Cacknowledged&severity=critical%2Cwarning&source=notification%2Cai_job&assignee=me&cursor=opaque%2B%2F%3Dcursor",
    );
  });

  it("drops unknown view and mode instead of inventing API filters", () => {
    const parsed = parseAdminOperationsSearch(
      new URLSearchParams("view=unexpected&mode=inspect&q=&case="),
    );

    expect(parsed).toEqual({
      caseId: null,
      mode: "list",
      workView: "briefing",
      query: "",
      filter: {},
      queueDisclosure: "priority",
    });
    expect(serializeAdminOperationsSearch(parsed).toString()).toBe("");
    expect(adminOperationsScopeKey(parsed.workView, parsed.filter)).toBe(
      adminOperationsScopeKey("briefing", {}),
    );
    expect(adminOperationsScopeKey("briefing", { cursor: "page-2" })).toBe(
      adminOperationsScopeKey("briefing", {}),
    );
  });

  it("assigns locators before search filtering and keeps them stable on loaded rows only", () => {
    const originalItems = [
      operationCase({
        id: "case-info",
        sourceType: "CLUB_READINESS",
        severity: "INFO",
        summaryCode: "CLUB_READY_TO_PUBLISH",
        firstObservedAt: "2026-08-04T06:00:00Z",
      }),
      operationCase({
        id: "case-warning",
        severity: "WARNING",
        firstObservedAt: "2026-08-04T07:00:00Z",
      }),
      operationCase({
        id: "case-unloaded-shape",
        severity: "CRITICAL",
        summaryCode: "AI_JOB_FAILED",
        firstObservedAt: "2026-08-04T05:00:00Z",
      }),
    ];
    const originalOrder = originalItems.map((item) => item.id);
    const loaded = originalItems.slice(0, 2);
    const view = buildAdminOperationsView(
      response({ items: loaded }),
      "case-info",
      new Date(generatedAt),
      new Map([["club-1", "읽는사이"]]),
    );
    const missing = buildAdminOperationsView(
      response({ items: loaded }),
      "case-not-visible",
      new Date(generatedAt),
    );
    const filtered = filterAdminOperationItems(
      view.items,
      parseAdminOperationsSearch(new URLSearchParams("q=%EC%95%8C%EB%A6%BC")),
      new Date(generatedAt),
    );
    const unloadedMatch = filterAdminOperationItems(
      view.items,
      parseAdminOperationsSearch(new URLSearchParams("q=%EC%9E%91%EC%97%85")),
      new Date(generatedAt),
    );

    expect(view.items.map((item) => [item.id, item.locatorLabel])).toEqual([
      ["case-warning", "02"],
      ["case-info", "01"],
    ]);
    expect(view.items[0]?.scopeLabel).toBe("읽는사이");
    expect(view.selectedCase?.id).toBe("case-info");
    expect(missing.selectedCase).toBeNull();
    expect(missing.selectionExcluded).toBe(true);
    expect(filtered.map((item) => [item.id, item.locatorLabel])).toEqual([["case-warning", "02"]]);
    expect(unloadedMatch).toEqual([]);
    expect(originalItems.map((item) => item.id)).toEqual(originalOrder);
  });

  it("does not invent an exact count for resolved-today", () => {
    expect(buildAdminOperationWorkViews(response().counts)).toEqual([
      { id: "briefing", label: "오늘의 브리핑", count: 1 },
      { id: "mine", label: "내 담당", count: 1 },
      { id: "snoozed", label: "보류", count: 1 },
      { id: "resolved-today", label: "오늘 해결", count: null },
    ]);
  });

  it("filters today-resolved loaded rows in Seoul without changing the API filter", () => {
    const items = buildAdminOperationsView(
      response({
        items: [
          operationCase({ id: "resolved-today", state: "RESOLVED", resolvedAt: "2026-08-04T00:30:00Z" }),
          operationCase({ id: "resolved-yesterday", state: "RESOLVED", resolvedAt: "2026-08-03T14:59:00Z" }),
          operationCase({ id: "open-match", summaryCode: "NOTIFICATION_PLATFORM_BACKLOG" }),
        ],
      }),
      null,
      new Date(generatedAt),
    ).items;
    const state = parseAdminOperationsSearch(new URLSearchParams("view=resolved-today&q=%EC%95%8C%EB%A6%BC"));

    expect(filterAdminOperationItems(items, state, new Date(generatedAt)).map((item) => item.id)).toEqual([
      "resolved-today",
    ]);
    expect(effectiveAdminOperationsFilter(state)).toEqual({ states: ["RESOLVED"] });
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
        title: "모임 마감이 완료되지 않았습니다",
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

  it("keeps SUMMARY_LABELS when a case has no presentation extras", () => {
    const view = buildAdminOperationsView(
      response({ items: [operationCase({ clubId: null, impactCount: 2 })] }),
      null,
      new Date(generatedAt),
    );

    expect(view.items[0]?.summary).toEqual({
      title: "알림 전달 실패가 반복되고 있습니다",
      description: "같은 원인의 실패를 확인하세요.",
    });
    expect(view.items[0]?.scopeLabel).toBe("플랫폼 전체");
    expect(view.items[0]?.impactLabel).toBe("영향 2건");
    expect(view.items[0]?.evidenceLines).toBeUndefined();
    expect(view.items[0]?.recommendation).toBeUndefined();
  });

  it("applies optional case presentation without rewriting SUMMARY_LABELS", () => {
    const item = {
      ...operationCase({ clubId: null, impactCount: 2 }),
      summaryTitle: "알림 전달 지연",
      summaryDescription: "일부 안내가 늦게 전달되고 있습니다.",
      scopeLabel: "클럽 2곳 · 멤버 6명",
      impactLabel: "클럽 2곳 · 멤버 6명",
      evidenceLines: ["데이터 손실 없음", "마지막 정상 전달 13:52"],
      recommendation: "중복 발송을 확인한 뒤 실패한 안내만 다시 보냅니다.",
    };
    const view = buildAdminOperationsView(
      response({ items: [item] }),
      null,
      new Date(generatedAt),
    );

    expect(adminOperationSummaryLabel("NOTIFICATION_DELIVERY_FAILURE")).toEqual({
      title: "알림 전달 실패가 반복되고 있습니다",
      description: "같은 원인의 실패를 확인하세요.",
    });
    expect(view.items[0]?.summary).toEqual({
      title: "알림 전달 지연",
      description: "일부 안내가 늦게 전달되고 있습니다.",
    });
    expect(view.items[0]?.scopeLabel).toBe("클럽 2곳 · 멤버 6명");
    expect(view.items[0]?.impactLabel).toBe("클럽 2곳 · 멤버 6명");
    expect(view.items[0]?.evidenceLines).toEqual(["데이터 손실 없음", "마지막 정상 전달 13:52"]);
    expect(view.items[0]?.recommendation).toBe("중복 발송을 확인한 뒤 실패한 안내만 다시 보냅니다.");
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
      { sourceType: "NOTIFICATION", message: "확인 가능 · 19:00 기준", canRetry: false },
      { sourceType: "AI_JOB", message: "확인 불가 · 마지막 정상 18:30", canRetry: true },
      { sourceType: "CLOSING_RISK", message: "사용 안 함", canRetry: false },
    ]);
  });
});
