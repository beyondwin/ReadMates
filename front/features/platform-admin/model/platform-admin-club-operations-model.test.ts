import { describe, expect, it } from "vitest";
import {
  aiFailureDelta,
  blockerNextAction,
  notificationFailureDelta,
  type AdminClubOperationsSnapshot,
} from "./platform-admin-club-operations-model";

function snapshot(overrides: Partial<AdminClubOperationsSnapshot> = {}): AdminClubOperationsSnapshot {
  return {
    schema: "admin.club_operations_snapshot.v1",
    generatedAt: "2026-05-30T00:00:00Z",
    club: { clubId: "c1", slug: "alpha", name: "Alpha", status: "ACTIVE", publicVisibility: "PUBLIC" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    memberActivity: { activeCount: 0, dormantCount: 0, pendingViewerCount: 0, hostCount: 0 },
    sessionProgress: { upcomingCount: 0, currentOpenCount: 0, closedCount: 0, publishedRecordCount: 0, incompleteRecordCount: 0 },
    notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 0, priorFailed7d: 0 },
    aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "NO_RECENT_USAGE", priorFailedJobs7d: 0 },
    safeLinks: [],
    ...overrides,
  };
}

describe("club operations trend helpers", () => {
  it("computes a rising notification delta", () => {
    const s = snapshot({ notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 5, priorFailed7d: 2 } });
    expect(notificationFailureDelta(s)).toBe(3);
  });

  it("computes a falling ai delta as negative", () => {
    const s = snapshot({ aiUsage: { activeJobs: 0, failedRecentJobs: 1, staleCandidates: 0, costEstimateUsd: "0.0000", state: "HAS_ACTIVITY", priorFailedJobs7d: 4 } });
    expect(aiFailureDelta(s)).toBe(-3);
  });

  it("returns zero delta when both windows are empty", () => {
    expect(notificationFailureDelta(snapshot())).toBe(0);
    expect(aiFailureDelta(snapshot())).toBe(0);
  });

  it("maps known blocker codes to host next actions", () => {
    expect(blockerNextAction("HOST_REQUIRED", "alpha")).toEqual({ label: "호스트 지정", href: "/clubs/alpha/app", kind: "HOST_ROUTE" });
    expect(blockerNextAction("DOMAIN_ACTION_REQUIRED", "alpha")?.href).toBe("/clubs/alpha/app");
    expect(blockerNextAction("CLUB_NOT_ACTIVE", "alpha")?.label).toBe("클럽 상태 확인");
  });

  it("returns null for an unknown blocker code", () => {
    expect(blockerNextAction("MYSTERY_CODE", "alpha")).toBeNull();
  });
});
