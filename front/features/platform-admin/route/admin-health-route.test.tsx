import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import * as api from "@/features/platform-admin/api/platform-admin-health-api";
import { AdminHealthRoute } from "@/features/platform-admin/route/admin-health-route";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";

const HEALTH_SNAPSHOT: PlatformHealthSnapshotResponse = {
  schema: "platform.health_snapshot.v1",
  generatedAt: "2026-05-26T00:00:00Z",
  cards: [
    {
      id: "outbox_backlog",
      title: "Outbox backlog",
      status: "OK",
      metric: { value: 42, unit: "rows", label: "pending" },
      thresholds: { warn: 100, crit: 1000 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications?focus=outbox_backlog" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "kafka_consumer_lag",
      title: "Kafka consumer lag",
      status: "WARN",
      metric: { value: 75, unit: "records", label: "max across partitions" },
      thresholds: { warn: 50, crit: 500 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: null,
      reason: null,
      deployStrip: null,
    },
    {
      id: "redis",
      title: "Redis",
      status: "UNKNOWN",
      metric: null,
      thresholds: { warn: 1, crit: 50 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: "redis_metrics_unavailable",
      deployStrip: null,
    },
    {
      id: "db_pool",
      title: "DB pool",
      status: "OK",
      metric: { value: 3, unit: "connections", label: "active" },
      thresholds: { warn: 8, crit: 12 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
      reason: null,
      deployStrip: null,
    },
    {
      id: "notification_dispatch_success",
      title: "Notification dispatch success",
      status: "OK",
      metric: { value: 0.997, unit: "ratio", label: "last 5m" },
      thresholds: { warn: 0.95, crit: 0.9 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications?focus=notification_dispatch_success" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "ai_provider_availability",
      title: "AI provider availability",
      status: "OK",
      metric: { value: 1, unit: "ratio", label: "last 5m" },
      thresholds: { warn: 0.98, crit: 0.9 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "PROMETHEUS",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
      reason: null,
      deployStrip: null,
    },
    {
      id: "deploy_attempts_strip",
      title: "Deploy attempts",
      status: "OK",
      metric: null,
      thresholds: null,
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "FILE",
      drill: null,
      reason: null,
      deployStrip: [
        {
          attemptId: "deploy-dev-001",
          startedAt: "2026-05-26T00:00:00Z",
          endedAt: "2026-05-26T00:02:00Z",
          finalStatus: "SUCCEEDED",
          imageTag: "readmates-api:dev-20260526",
          durationSeconds: 120,
        },
      ],
    },
  ],
};

describe("AdminHealthRoute", () => {
  it("renders the full health snapshot and deploy strip", async () => {
    const fetchSpy = vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockResolvedValueOnce(HEALTH_SNAPSHOT);
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminHealthRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Platform Health" })).toBeInTheDocument();
    expect(await screen.findByText("Outbox backlog")).toBeInTheDocument();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(screen.getByText("Kafka consumer lag")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.getByText("DB pool")).toBeInTheDocument();
    expect(screen.getByText("Notification dispatch success")).toBeInTheDocument();
    expect(screen.getByText("AI provider availability")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getByText(/readmates-api:dev-20260526/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
