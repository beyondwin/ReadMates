import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { PlatformHealthSnapshot } from "@/features/platform-admin/model/platform-admin-health-model";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";

const HEALTH_SNAPSHOT: PlatformHealthSnapshot = {
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

function renderGrid(
  props: Partial<ComponentProps<typeof AdminHealthGrid>> = {},
) {
  const defaultProps: ComponentProps<typeof AdminHealthGrid> = {
    snapshot: HEALTH_SNAPSHOT,
    loading: false,
    error: false,
    fetching: false,
    stale: false,
    onRefresh: vi.fn(),
  };
  render(
    <MemoryRouter>
      <AdminHealthGrid {...defaultProps} {...props} />
    </MemoryRouter>,
  );
  return { onRefresh: defaultProps.onRefresh };
}

describe("AdminHealthGrid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders six health cards plus a separate deploy strip from the seven-card snapshot", () => {
    renderGrid();

    expect(screen.getByText("Outbox backlog")).toBeInTheDocument();
    expect(screen.getByText("Kafka consumer lag")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.getByText("DB pool")).toBeInTheDocument();
    expect(screen.getByText("Notification dispatch success")).toBeInTheDocument();
    expect(screen.getByText("AI provider availability")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getByText(/readmates-api:dev-20260526/)).toBeInTheDocument();
  });

  it("calls the refresh callback", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    renderGrid({ onRefresh });

    await user.click(screen.getByRole("button", { name: "새로고침" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("marks the snapshot stale when the route says it is stale", () => {
    renderGrid({ stale: true });

    expect(screen.getByText("30초 이상 경과")).toBeInTheDocument();
  });
});
