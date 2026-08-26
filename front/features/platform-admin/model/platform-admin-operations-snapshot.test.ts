import { describe, expect, it } from "vitest";
import type {
  AdminOperationAction,
  AdminOperationCase,
  AdminOperationCasesResponse,
  AdminOperationSourceFreshness,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  applyPendingAdminOperationsSnapshot,
  createAdminOperationsSnapshot,
  paginateAdminOperationsSnapshot,
  receiveAdminOperationsSnapshot,
  retryAdminOperationsSnapshot,
} from "./platform-admin-operations-snapshot";

const generatedAt = "2026-08-12T00:00:00Z";
const SCOPE = "today:briefing";

function item(
  id: string,
  version: number,
  overrides: Partial<AdminOperationCase> = {},
): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id,
    sourceType,
    clubId: "club-1",
    state: "OPEN",
    severity: "WARNING",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: generatedAt,
    lastObservedAt: generatedAt,
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: false,
    reopenCount: 0,
    version,
    impactCount: 1,
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

function list(
  items: AdminOperationCase[],
  overrides: Partial<AdminOperationCasesResponse> = {},
): AdminOperationCasesResponse {
  return {
    schema: "admin.operation_cases.v1",
    generatedAt,
    counts: { open: items.length, critical: 0, assignedToMe: 0, snoozed: 0 },
    sources: [item("source", 1).source],
    items,
    nextCursor: null,
    ...overrides,
  };
}

describe("platform admin operations snapshot", () => {
  it("freezes existing id order and updates matching rows in place", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1), item("b", 1)]), SCOPE);
    const received = receiveAdminOperationsSnapshot(
      initial,
      list([item("b", 2), item("a", 3), item("pending-warning", 1)]),
    );

    expect(received.scopeKey).toBe(SCOPE);
    expect(received.displayed.items.map((entry) => [entry.id, entry.version])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    expect(received.pendingNewIds).toEqual(["pending-warning"]);
    expect(received.urgentNewCriticalIds).toEqual([]);
    expect(received.pendingRemovalIds).toEqual([]);
  });

  it("keeps the higher version and uses the latest equal-version list projection", () => {
    const previous = item("a", 4, {
      allowedActions: ["ACKNOWLEDGE"],
      impactCount: 1,
      lastObservedAt: "2026-08-12T00:00:00Z",
      source: freshness("2026-08-12T00:00:00Z"),
    });
    const lower = item("a", 3, {
      allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
      impactCount: 9,
    });
    const equalLatest = item("a", 4, {
      allowedActions: ["ACKNOWLEDGE", "RESOLVE"],
      impactCount: 4,
      lastObservedAt: "2026-08-12T00:10:00Z",
      source: freshness("2026-08-12T00:10:00Z", false),
    });

    const initial = createAdminOperationsSnapshot(list([previous]), SCOPE);
    const downgraded = receiveAdminOperationsSnapshot(initial, list([lower]));
    const projected = receiveAdminOperationsSnapshot(downgraded, list([equalLatest]));

    expect(downgraded.displayed.items[0]).toMatchObject({
      version: 4,
      allowedActions: ["ACKNOWLEDGE"],
      impactCount: 1,
    });
    expect(projected.displayed.items[0]).toMatchObject({
      version: 4,
      allowedActions: ["ACKNOWLEDGE", "RESOLVE"],
      impactCount: 4,
      lastObservedAt: "2026-08-12T00:10:00Z",
    });
    expect(projected.displayed.items[0]?.source).toEqual(equalLatest.source);
    expect(projected.latest.items[0]?.version).toBe(4);
  });

  it("keeps a missing row in displayed order as pending removal", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1), item("removed", 1)]), SCOPE);
    const received = receiveAdminOperationsSnapshot(initial, list([item("a", 2)]));

    expect(received.displayed.items.map((entry) => entry.id)).toEqual(["a", "removed"]);
    expect(received.displayed.items[0]?.version).toBe(2);
    expect(received.pendingRemovalIds).toEqual(["removed"]);
    expect(received.latest.items.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("classifies new noncritical rows as pending and new critical rows as urgent", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1)]), SCOPE);
    const received = receiveAdminOperationsSnapshot(
      initial,
      list([
        item("critical-new", 1, { severity: "CRITICAL" }),
        item("ready-new", 1, { severity: "READY" }),
        item("info-new", 1, { severity: "INFO" }),
        item("warning-new", 1, { severity: "WARNING" }),
        item("a", 2),
      ]),
    );

    expect(received.displayed.items.map((entry) => entry.id)).toEqual(["a"]);
    expect(received.pendingNewIds).toEqual(["critical-new", "ready-new", "info-new", "warning-new"]);
    expect(received.urgentNewCriticalIds).toEqual(["critical-new"]);
  });

  it("does not re-add a previously announced critical id on a later poll", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1)]), SCOPE);
    const first = receiveAdminOperationsSnapshot(
      initial,
      list([item("critical-new", 1, { severity: "CRITICAL" }), item("a", 1)]),
    );
    const second = receiveAdminOperationsSnapshot(
      first,
      list([
        item("critical-new", 2, { severity: "CRITICAL" }),
        item("warning-new", 1, { severity: "WARNING" }),
        item("a", 1),
      ]),
    );

    expect(second.pendingNewIds).toEqual(["critical-new", "warning-new"]);
    expect(second.urgentNewCriticalIds).toEqual(["critical-new"]);
  });

  it("updates counts sources and generatedAt immediately while the displayed order stays frozen", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1), item("b", 1)]), SCOPE);
    const laterGeneratedAt = "2026-08-12T00:15:00Z";
    const laterSource = freshness(laterGeneratedAt, false);
    const received = receiveAdminOperationsSnapshot(
      initial,
      list([item("pending-warning", 1), item("a", 2), item("b", 1)], {
        generatedAt: laterGeneratedAt,
        counts: { open: 4, critical: 1, assignedToMe: 2, snoozed: 1 },
        sources: [laterSource],
      }),
    );

    expect(received.displayed.items.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(received.displayed.generatedAt).toBe(laterGeneratedAt);
    expect(received.displayed.counts).toEqual({ open: 4, critical: 1, assignedToMe: 2, snoozed: 1 });
    expect(received.displayed.sources).toEqual([laterSource]);
    expect(received.latest.generatedAt).toBe(laterGeneratedAt);
  });

  it("appends explicit continuation immediately without applying concurrent first-page new rows", () => {
    const initial = createAdminOperationsSnapshot(
      list([item("a", 3)], { nextCursor: "page-1" }),
      SCOPE,
    );
    const polled = receiveAdminOperationsSnapshot(
      initial,
      list([item("pending-warning", 1), item("a", 4)], { nextCursor: "page-1" }),
    );
    const paged = paginateAdminOperationsSnapshot(
      polled,
      list(
        [item("pending-warning", 1), item("a", 4), item("continuation-b", 1), item("continuation-a", 1)],
        { nextCursor: "page-2" },
      ),
      ["continuation-b", "continuation-a"],
    );

    expect(paged.displayed.items.map((entry) => entry.id)).toEqual([
      "a",
      "continuation-b",
      "continuation-a",
    ]);
    expect(paged.displayed.nextCursor).toBe("page-2");
    expect(paged.pendingNewIds).toEqual(["pending-warning"]);
    expect(paged.urgentNewCriticalIds).toEqual([]);
  });

  it("preserves old rows and the opaque cursor when a retry fails", () => {
    const initial = createAdminOperationsSnapshot(
      list([item("a", 3), item("b", 1)], { nextCursor: "opaque+/=cursor" }),
      SCOPE,
    );
    const failed = list([], { generatedAt: "2026-08-12T00:20:00Z", nextCursor: null, counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 } });
    const retried = retryAdminOperationsSnapshot(initial, failed);

    expect(retried.displayed.items.map((entry) => [entry.id, entry.version])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(retried.displayed.nextCursor).toBe("opaque+/=cursor");
    expect(retried.latest.nextCursor).toBe("opaque+/=cursor");
    expect(retried.pendingNewIds).toEqual([]);
  });

  it("applies latest server priority order and the explicit selected and focus target", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1), item("removed", 1)]), SCOPE);
    const received = receiveAdminOperationsSnapshot(
      initial,
      list([
        item("critical-new", 1, { severity: "CRITICAL" }),
        item("a", 2),
        item("ready-new", 1, { severity: "READY" }),
      ]),
    );

    const applied = applyPendingAdminOperationsSnapshot(received, {
      selectedId: "a",
      focusId: "critical-new",
    });
    const missingTarget = applyPendingAdminOperationsSnapshot(received, {
      selectedId: "removed",
      focusId: "removed",
    });

    expect(applied.snapshot.displayed.items.map((entry) => entry.id)).toEqual([
      "critical-new",
      "a",
      "ready-new",
    ]);
    expect(applied.snapshot.pendingNewIds).toEqual([]);
    expect(applied.snapshot.urgentNewCriticalIds).toEqual([]);
    expect(applied.snapshot.pendingRemovalIds).toEqual([]);
    expect(applied.selectedId).toBe("a");
    expect(applied.focusId).toBe("critical-new");
    expect(missingTarget.selectedId).toBeNull();
    expect(missingTarget.focusId).toBeNull();
  });

  it("replaces the snapshot when the incoming scope key changes", () => {
    const initial = createAdminOperationsSnapshot(list([item("a", 1)]), SCOPE);
    const received = receiveAdminOperationsSnapshot(
      initial,
      list([item("mine-1", 1), item("mine-2", 1)]),
      "today:mine",
    );

    expect(received.scopeKey).toBe("today:mine");
    expect(received.displayed.items.map((entry) => entry.id)).toEqual(["mine-1", "mine-2"]);
    expect(received.pendingNewIds).toEqual([]);
    expect(received.pendingRemovalIds).toEqual([]);
  });

  it("does not mutate responses or item arrays while receiving a poll", () => {
    const initialResponse = list([item("a", 3), item("removed", 1)]);
    const incomingResponse = list([
      item("new", 1, { allowedActions: ["ACKNOWLEDGE"] }),
      item("a", 2),
    ]);
    const initialItems = initialResponse.items.map((entry) => ({
      ...entry,
      allowedActions: [...entry.allowedActions],
    }));
    const incomingItems = incomingResponse.items.map((entry) => ({
      ...entry,
      allowedActions: [...entry.allowedActions],
    }));

    const initial = createAdminOperationsSnapshot(initialResponse, SCOPE);
    const received = receiveAdminOperationsSnapshot(initial, incomingResponse);
    received.displayed.items.reverse();
    received.displayed.items[0]?.allowedActions.push("RESOLVE" as AdminOperationAction);
    incomingResponse.items[0]?.allowedActions.push("SNOOZE");

    expect(initialResponse.items).toEqual(initialItems);
    expect(incomingResponse.items.map((entry) => entry.id)).toEqual(["new", "a"]);
    expect(initial.displayed.items).toEqual(initialItems);
    expect(incomingItems[0]?.allowedActions).toEqual(["ACKNOWLEDGE"]);
  });
});

function freshness(at: string, authoritative = true): AdminOperationSourceFreshness {
  return {
    sourceType: "NOTIFICATION",
    status: "AVAILABLE",
    generatedAt: at,
    lastSuccessfulAt: at,
    authoritative,
  };
}
