import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { PlatformHealthSnapshot } from "@/features/platform-admin/model/platform-admin-health-model";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";

const readmatesFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  readmatesFetch: readmatesFetchMock,
}));

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
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
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
      drill: { kind: "ADMIN_ROUTE", target: "/admin/notifications" },
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

function renderGrid() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminHealthGrid />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("AdminHealthGrid", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    readmatesFetchMock.mockReset();
  });

  it("renders six health cards plus a separate deploy strip from the seven-card snapshot", async () => {
    readmatesFetchMock.mockResolvedValueOnce(HEALTH_SNAPSHOT);

    renderGrid();

    expect(await screen.findByText("Outbox backlog")).toBeInTheDocument();
    expect(screen.getByText("Kafka consumer lag")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.getByText("DB pool")).toBeInTheDocument();
    expect(screen.getByText("Notification dispatch success")).toBeInTheDocument();
    expect(screen.getByText("AI provider availability")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getByText(/readmates-api:dev-20260526/)).toBeInTheDocument();
  });

  it("refresh button fetches a second snapshot", async () => {
    readmatesFetchMock.mockResolvedValueOnce(HEALTH_SNAPSHOT).mockResolvedValueOnce(HEALTH_SNAPSHOT);
    const user = userEvent.setup();

    renderGrid();

    await screen.findByText("Outbox backlog");
    await user.click(screen.getByRole("button", { name: "새로고침" }));

    await waitFor(() => expect(readmatesFetchMock).toHaveBeenCalledTimes(2));
  });

  it("marks the snapshot stale after thirty seconds", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-26T00:00:05Z") });
    const fakeSetInterval = window.setInterval;
    vi.spyOn(window, "setInterval").mockImplementation((handler, timeout, ...args) => {
      if (timeout === 15_000) return 0;
      return fakeSetInterval(handler, timeout, ...args);
    });
    readmatesFetchMock.mockResolvedValueOnce(HEALTH_SNAPSHOT);

    renderGrid();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("최신")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(screen.getByText("30초 이상 경과")).toBeInTheDocument();
  });
});
