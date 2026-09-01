import { describe, expect, it } from "vitest";
import type {
  AdminOperationCase,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  adminTodayReducer,
  createAdminTodayState,
  type AdminTodayMutationTarget,
} from "./admin-today-state";

const scopeKey = "queue:all";

function operationCase(
  id: string,
  overrides: Partial<AdminOperationCase> = {},
): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id,
    sourceType,
    clubId: null,
    state: "OPEN",
    severity: "WARNING",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-04T08:00:00Z",
    lastObservedAt: "2026-08-04T09:55:00Z",
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications?focus=delivery",
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source: {
      sourceType,
      status: "AVAILABLE",
      generatedAt: "2026-08-04T10:00:00Z",
      lastSuccessfulAt: "2026-08-04T10:00:00Z",
      authoritative: true,
    },
    ...overrides,
  };
}

function response(
  items: AdminOperationCase[],
  overrides: Partial<AdminOperationCasesResponse> = {},
): AdminOperationCasesResponse {
  return {
    schema: "admin.operation_cases.v1",
    generatedAt: "2026-08-04T10:00:00Z",
    counts: {
      open: items.filter((item) => item.state !== "RESOLVED").length,
      critical: items.filter((item) => item.severity === "CRITICAL").length,
      assignedToMe: items.filter((item) => item.assignedToMe).length,
      snoozed: items.filter((item) => item.state === "SNOOZED").length,
    },
    sources: items[0] ? [items[0].source] : [],
    items,
    nextCursor: null,
    ...overrides,
  };
}

function observe(
  state: ReturnType<typeof createAdminTodayState>,
  latest: AdminOperationCasesResponse,
  pageCount = 1,
) {
  return adminTodayReducer(state, {
    type: "list-observed",
    response: latest,
    scopeKey,
    pageCount,
    failed: false,
  });
}

function target(caseId = "case-a", version = 3): AdminTodayMutationTarget {
  return { caseId, version, confirmationKey: `${caseId}:${version}:ACKNOWLEDGE` };
}

describe("adminTodayReducer", () => {
  it("creates a list snapshot and freezes newly polled rows until they are accepted", () => {
    const first = operationCase("case-a");
    const pending = operationCase("case-new", { severity: "CRITICAL" });

    const seeded = observe(createAdminTodayState("case-a"), response([first]));
    const polled = observe(seeded, response([pending, { ...first, version: 4 }]));

    expect(polled.snapshot?.displayed.items.map((item) => item.id)).toEqual(["case-a"]);
    expect(polled.snapshot?.displayed.items[0]?.version).toBe(4);
    expect(polled.snapshot?.pendingNewIds).toEqual(["case-new"]);
    expect(polled.snapshot?.urgentNewCriticalIds).toEqual(["case-new"]);
    expect(polled.urgentAnnouncement).toBe("새 긴급 신호 1건");

    const repeated = observe(polled, response([pending, { ...first, version: 4 }]));
    expect(repeated.urgentAnnouncement).toBe("새 긴급 신호 1건");
    expect(repeated.announcedUrgentIds).toEqual(["case-new"]);

    const accepted = adminTodayReducer(repeated, { type: "pending-accepted" });
    expect(accepted.snapshot?.displayed.items.map((item) => item.id)).toEqual([
      "case-new",
      "case-a",
    ]);
    expect(accepted.snapshot?.pendingNewIds).toEqual([]);
    expect(accepted.urgentAnnouncement).toBeNull();
    expect(accepted.selectedCaseId).toBe("case-a");
  });

  it("accumulates continuation pages once and keeps the selected case", () => {
    const first = operationCase("case-a");
    const continued = operationCase("case-b");
    const seeded = observe(createAdminTodayState("case-a"), response([first], {
      nextCursor: "cursor-2",
    }));

    const paginated = observe(
      seeded,
      response([first, continued, continued]),
      2,
    );

    expect(paginated.snapshot?.displayed.items.map((item) => item.id)).toEqual([
      "case-a",
      "case-b",
    ]);
    expect(paginated.selectedCaseId).toBe("case-a");
    expect(paginated.snapshot?.pendingNewIds).toEqual([]);
  });

  it("keeps the last known snapshot when a background or load-more request fails", () => {
    const seeded = observe(
      createAdminTodayState("case-a"),
      response([operationCase("case-a")]),
    );

    const failed = adminTodayReducer(seeded, {
      type: "list-observed",
      response: response([operationCase("case-new")]),
      scopeKey,
      pageCount: 2,
      failed: true,
    });

    expect(failed.snapshot?.displayed.items.map((item) => item.id)).toEqual(["case-a"]);
    expect(failed.selectedCaseId).toBe("case-a");
  });

  it("resets snapshot, announcements, selection, and feedback when list scope changes", () => {
    const seeded = adminTodayReducer(
      observe(createAdminTodayState("case-a"), response([
        operationCase("case-a"),
        operationCase("case-new", { severity: "CRITICAL" }),
      ])),
      { type: "mutation-started", target: target() },
    );

    const changed = adminTodayReducer(seeded, {
      type: "list-observed",
      response: response([operationCase("case-filtered")]),
      scopeKey: "queue:filtered",
      pageCount: 1,
      failed: false,
    });

    expect(changed.snapshot?.scopeKey).toBe("queue:filtered");
    expect(changed.snapshot?.displayed.items.map((item) => item.id)).toEqual([
      "case-filtered",
    ]);
    expect(changed.announcedUrgentIds).toEqual([]);
    expect(changed.urgentAnnouncement).toBeNull();
    expect(changed.actionState).toBe("ready");
    expect(changed.mutationTarget).toBeNull();
  });

  it("keeps URL selection explicit and clears another case's feedback", () => {
    const started = adminTodayReducer(createAdminTodayState("case-a"), {
      type: "mutation-started",
      target: target("case-a"),
    });
    const complete = adminTodayReducer(started, { type: "mutation-succeeded" });
    const selected = adminTodayReducer(complete, {
      type: "selection-changed",
      caseId: "case-b",
    });

    expect(selected.selectedCaseId).toBe("case-b");
    expect(selected.actionState).toBe("ready");
    expect(selected.actionMessage).toBeNull();
    expect(selected.mutationTarget).toEqual(target("case-a"));
  });

  it("releases a completed pin and pending-removal snapshot on explicit selection", () => {
    const observed = observe(
      createAdminTodayState("case-a"),
      response([operationCase("case-a"), operationCase("case-b")]),
    );
    const pendingRemoval = adminTodayReducer(observed, {
      type: "list-observed",
      response: response([
        operationCase("case-b"),
        operationCase("case-new"),
      ], { generatedAt: "2026-08-04T10:10:00Z" }),
      scopeKey,
      pageCount: 1,
      failed: false,
    });
    const complete = adminTodayReducer(
      adminTodayReducer(pendingRemoval, {
        type: "mutation-started",
        target: target("case-a"),
      }),
      { type: "mutation-succeeded" },
    );
    const explicitSelection = {
      type: "selection-changed" as const,
      caseId: "case-b",
      explicit: true,
    };

    const selected = adminTodayReducer(complete, explicitSelection);

    expect(selected.selectedCaseId).toBe("case-b");
    expect(selected.snapshot?.displayed.items.map((item) => item.id)).toEqual(["case-b"]);
    expect(selected.snapshot?.pendingNewIds).toEqual(["case-new"]);
    expect(selected.snapshot?.pendingRemovalIds).toEqual([]);
    expect(selected.mutationTarget).toBeNull();
    expect(selected.actionState).toBe("ready");
    expect(selected.actionMessage).toBeNull();
  });

  it("models pending, conflict, unknown outcome, recovery, and a changed confirmation", () => {
    const started = adminTodayReducer(createAdminTodayState("case-a"), {
      type: "mutation-started",
      target: target(),
    });
    expect(started.actionState).toBe("pending");

    const conflict = adminTodayReducer(started, { type: "mutation-conflict" });
    expect(conflict.actionState).toBe("conflict");
    expect(conflict.actionMessage?.kind).toBe("conflict");

    const unknown = adminTodayReducer(started, {
      type: "mutation-unknown",
      message: "명령 응답을 확인하지 못했습니다.",
    });
    expect(unknown.actionState).toBe("unknown-outcome");
    expect(unknown.actionMessage).toEqual({
      kind: "unknown-outcome",
      text: "명령 응답을 확인하지 못했습니다.",
    });

    const recovered = adminTodayReducer(unknown, {
      type: "authoritative-recovery-completed",
      outcome: "still-unknown",
    });
    expect(recovered.actionState).toBe("unknown-outcome");

    const succeeded = adminTodayReducer(started, { type: "mutation-succeeded" });
    const nextVersion = adminTodayReducer(succeeded, {
      type: "confirmation-changed",
      confirmationKey: "case-a:4:SNOOZE,RESOLVE",
    });
    expect(nextVersion.actionState).toBe("ready");
    expect(nextVersion.actionMessage).toEqual({
      kind: "success",
      text: "케이스 상태를 반영했습니다.",
    });
  });

  it("clears sensitive workflow state before authority-loss rendering", () => {
    const started = adminTodayReducer(
      observe(createAdminTodayState("case-a"), response([operationCase("case-a")])),
      { type: "mutation-started", target: target() },
    );
    const denied = adminTodayReducer(started, { type: "mutation-permission-lost" });

    expect(denied.permissionDenied).toBe(true);
    expect(denied.actionState).toBe("forbidden");

    const lost = adminTodayReducer(denied, { type: "authority-lost" });
    expect(lost.authorityLost).toBe(true);
    expect(lost.snapshot).toBeNull();
    expect(lost.selectedCaseId).toBeNull();
    expect(lost.mutationTarget).toBeNull();
    expect(lost.actionMessage).toBeNull();
    expect(lost.announcedUrgentIds).toEqual([]);
  });

  it("advances to the next visible case and retains the last selection", () => {
    const initial = createAdminTodayState("case-b");
    const next = adminTodayReducer(initial, {
      type: "queue-exit-completed",
      visibleIds: ["case-a", "case-b", "case-c"],
      selectedId: "case-b",
    });
    expect(next.selectedCaseId).toBe("case-c");
    expect(next.focusQueueSummary).toBe(false);

    const last = adminTodayReducer(next, {
      type: "queue-exit-completed",
      visibleIds: ["case-a", "case-b", "case-c"],
      selectedId: "case-c",
    });
    expect(last.selectedCaseId).toBe("case-c");
    expect(last.focusQueueSummary).toBe(true);
  });
});
