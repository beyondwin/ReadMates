import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOperationCasesResponse } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";
import { adminOperationSummaryLabel } from "@/features/platform-admin/model/platform-admin-operations-model";

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", () => ({
  fetchAdminOperationCases: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-health-api", () => ({
  fetchPlatformAdminHealthSnapshot: vi.fn(),
}));

import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { fetchPlatformAdminHealthSnapshot } from "@/features/platform-admin/api/platform-admin-health-api";
import { useAdminAlarmSummary } from "./admin-alarm-summary";

const generatedAt = "2026-08-04T12:36:00Z";

const operations: AdminOperationCasesResponse = {
  schema: "admin.operation_cases.v1",
  generatedAt,
  counts: { open: 1, critical: 1, assignedToMe: 0, snoozed: 0 },
  sources: [
    {
      sourceType: "NOTIFICATION",
      status: "AVAILABLE",
      generatedAt,
      lastSuccessfulAt: generatedAt,
      authoritative: true,
    },
  ],
  items: [
    {
      id: "case-notification",
      sourceType: "NOTIFICATION",
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
        sourceType: "NOTIFICATION",
        status: "AVAILABLE",
        generatedAt,
        lastSuccessfulAt: generatedAt,
        authoritative: true,
      },
    },
  ],
  nextCursor: null,
};

const health: PlatformHealthSnapshotResponse = {
  schema: "platform.health_snapshot.v1",
  generatedAt,
  lastSuccessfulAt: generatedAt,
  refreshState: "FRESH",
  staleAgeSeconds: 0,
  cards: [
    {
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
    },
  ],
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("useAdminAlarmSummary", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminOperationCases).mockReset();
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockReset();
  });

  it("synthesizes a ready summary from operations and health snapshots", async () => {
    vi.mocked(fetchAdminOperationCases).mockResolvedValue(operations);
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockResolvedValue(health);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAdminAlarmSummary(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.summary).toEqual({
      attention: {
        count: 1,
        headline: adminOperationSummaryLabel("NOTIFICATION_DELIVERY_FAILURE").title,
      },
      unacknowledged: 1,
      serviceState: "ok",
      asOf: generatedAt,
    });
  });

  it("returns unavailable without throwing when both queries reject", async () => {
    vi.mocked(fetchAdminOperationCases).mockRejectedValue(new Error("operations down"));
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockRejectedValue(new Error("health down"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAdminAlarmSummary(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    expect(result.current.summary).toBeNull();
  });

  it("stays loading while both queries are pending", () => {
    vi.mocked(fetchAdminOperationCases).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockReturnValue(new Promise(() => {}));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAdminAlarmSummary(), { wrapper: Wrapper });

    expect(result.current).toEqual({ summary: null, state: "loading" });
  });

  it("stays ready with unknown service when only health rejects", async () => {
    vi.mocked(fetchAdminOperationCases).mockResolvedValue(operations);
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockRejectedValue(new Error("health down"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAdminAlarmSummary(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.summary?.serviceState).toBe("unknown");
    expect(result.current.summary?.attention.count).toBe(1);
  });
});
