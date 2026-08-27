import { describe, expect, it } from "vitest";
import type { AdminOperationCase, AdminOperationCasesResponse } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { HealthCard, PlatformHealthSnapshot } from "@/features/platform-admin/model/platform-admin-health-model";
import { adminOperationSummaryLabel } from "@/features/platform-admin/model/platform-admin-operations-model";
import { buildAdminAlarmSummary } from "./admin-alarm-summary";

const generatedAt = "2026-08-04T12:36:00Z";

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

function operations(
  overrides: Partial<AdminOperationCasesResponse> = {},
): AdminOperationCasesResponse {
  const items = overrides.items ?? [operationCase()];
  return {
    schema: "admin.operation_cases.v1",
    generatedAt,
    counts: { open: items.length, critical: 0, assignedToMe: 0, snoozed: 0 },
    sources: [operationCase().source],
    items,
    nextCursor: null,
    ...overrides,
  };
}

function healthCard(overrides: Partial<HealthCard> = {}): HealthCard {
  return {
    id: "outbox_backlog",
    title: "Outbox backlog",
    status: "OK",
    metric: { value: 0, unit: "rows", label: "pending" },
    thresholds: { warn: 100, crit: 1000 },
    lastCheckedAt: generatedAt,
    source: "IN_PROCESS",
    drill: null,
    reason: null,
    deployStrip: null,
    ...overrides,
  };
}

function health(overrides: Partial<PlatformHealthSnapshot> = {}): PlatformHealthSnapshot {
  return {
    schema: "platform.health_snapshot.v1",
    generatedAt,
    lastSuccessfulAt: generatedAt,
    refreshState: "FRESH",
    staleAgeSeconds: 0,
    cards: [healthCard()],
    ...overrides,
  };
}

describe("buildAdminAlarmSummary", () => {
  it("counts briefing cases as attention and uses the top summary as the headline", () => {
    const summary = buildAdminAlarmSummary({
      operations: operations({
        counts: { open: 1, critical: 1, assignedToMe: 0, snoozed: 0 },
        items: [
          operationCase({
            id: "acked",
            state: "ACKNOWLEDGED",
            severity: "CRITICAL",
            summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
          }),
        ],
      }),
      health: health(),
    });

    expect(summary.attention).toEqual({
      count: 1,
      headline: adminOperationSummaryLabel("NOTIFICATION_DELIVERY_FAILURE").title,
    });
    expect(summary.unacknowledged).toBe(0);
    expect(summary.serviceState).toBe("ok");
    expect(summary.asOf).toBe(generatedAt);
  });

  it("returns a quiet zero summary when the queue is empty and health is ok", () => {
    const summary = buildAdminAlarmSummary({
      operations: operations({
        counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
        items: [],
      }),
      health: health(),
    });

    expect(summary).toEqual({
      attention: { count: 0, headline: null },
      unacknowledged: 0,
      serviceState: "ok",
      asOf: generatedAt,
    });
  });

  it("ignores snoozed and resolved cases and counts only OPEN as unacknowledged", () => {
    const summary = buildAdminAlarmSummary({
      operations: operations({
        counts: { open: 3, critical: 0, assignedToMe: 0, snoozed: 1 },
        items: [
          operationCase({ id: "open", state: "OPEN", severity: "WARNING" }),
          operationCase({ id: "acked", state: "ACKNOWLEDGED", severity: "INFO" }),
          operationCase({ id: "snoozed", state: "SNOOZED", severity: "CRITICAL" }),
          operationCase({ id: "resolved", state: "RESOLVED", severity: "CRITICAL" }),
        ],
      }),
      health: health(),
    });

    expect(summary.attention.count).toBe(2);
    expect(summary.unacknowledged).toBe(1);
    expect(summary.attention.headline).toBe(
      adminOperationSummaryLabel("NOTIFICATION_DELIVERY_FAILURE").title,
    );
  });

  it("marks serviceState degraded when a health card is warning", () => {
    const summary = buildAdminAlarmSummary({
      operations: operations({ items: [] }),
      health: health({
        cards: [healthCard({ status: "WARN" })],
      }),
    });
    expect(summary.serviceState).toBe("degraded");
  });

  it("marks serviceState unknown when health is missing or unavailable", () => {
    expect(
      buildAdminAlarmSummary({
        operations: operations({ items: [] }),
        health: null,
      }).serviceState,
    ).toBe("unknown");
    expect(
      buildAdminAlarmSummary({
        operations: operations({ items: [] }),
        health: health({
          refreshState: "UNAVAILABLE",
          lastSuccessfulAt: null,
          cards: [healthCard({ status: "UNKNOWN", reason: "metrics_unavailable", metric: null })],
        }),
      }).serviceState,
    ).toBe("unknown");
  });

  it("omits asOf when neither snapshot has a usable generatedAt", () => {
    const summary = buildAdminAlarmSummary({ operations: null, health: null });
    expect(summary.asOf).toBeNull();
    expect(summary.attention).toEqual({ count: 0, headline: null });
    expect(summary.serviceState).toBe("unknown");
  });
});
