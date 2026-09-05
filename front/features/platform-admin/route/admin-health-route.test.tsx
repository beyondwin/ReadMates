import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import * as api from "@/features/platform-admin/api/platform-admin-health-api";
import { AdminHealthRoute } from "@/features/platform-admin/route/admin-health-route";
import type { PlatformHealthSnapshotResponse } from "@/features/platform-admin/api/platform-admin-health-contracts";
import {
  findNestedLiveRegions,
  findUnnamedInteractiveElements,
} from "@/shared/testing/accessibility-checks";

vi.mock("@/features/platform-admin/route/admin-shell-status-context", () => ({
  useAdminShellStatus: vi.fn(),
}));

import { useAdminShellStatus } from "./admin-shell-status-context";

const HEALTH_SNAPSHOT: PlatformHealthSnapshotResponse = {
  schema: "platform.health_snapshot.v1",
  generatedAt: "2026-05-26T00:00:00Z",
  lastSuccessfulAt: "2026-05-26T00:00:00Z",
  refreshState: "FRESH",
  staleAgeSeconds: 0,
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
      id: "outbound-resilience",
      title: "Outbound resilience",
      status: "OK",
      metric: { value: 0, unit: "open circuits", label: "current" },
      thresholds: { warn: 1, crit: 1 },
      lastCheckedAt: "2026-05-26T00:00:00Z",
      source: "IN_PROCESS",
      drill: null,
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

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminHealthRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminHealthRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the full health snapshot without a 서비스 건강 page title", async () => {
    const fetchSpy = vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockResolvedValueOnce(HEALTH_SNAPSHOT);
    const { container } = renderRoute();
    expect(screen.queryByRole("heading", { name: "서비스 건강" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(await screen.findByRole("heading", { name: "AI 작업 대기열" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "서비스 신호" })).toHaveClass("admin-evidence-ledger");
    expect(container.querySelector(".admin-case-docket")).toBeNull();
    expect(container.querySelector(".admin-action-dock")).toBeNull();
    expect(container.querySelector(".admin-safe-action-dock")).toBeNull();
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(findNestedLiveRegions(container)).toEqual([]);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "도메인 상세 펼치기" }));
    expect(screen.getByRole("heading", { name: "Redis" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "알림 대기열" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "데이터베이스 연결" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "정상 범위 서비스" })).getByText("알림 대기열")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "정상 범위 서비스" })).getByText("외부 연결 보호")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "최근에 바뀐 것" })).not.toBeInTheDocument();
    expect(screen.getByText("주의해서 살펴볼 서비스가 1곳 있습니다. 현재 자료로 확인했습니다.")).toBeInTheDocument();
    expect(screen.getByText(/생성 시각/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Platform Health" })).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("shows a loading skeleton before the first snapshot arrives", () => {
    vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockImplementation(() => new Promise(() => {}));
    renderRoute();

    expect(screen.getByRole("region", { name: "서비스 신호" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByTestId("admin-health-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Outbox backlog")).not.toBeInTheDocument();
  });

  it("retries one unavailable card through the existing snapshot query", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(api, "fetchPlatformAdminHealthSnapshot")
      .mockResolvedValue(HEALTH_SNAPSHOT);
    renderRoute();

    expect(await screen.findByRole("heading", { name: "AI 작업 대기열" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "도메인 상세 펼치기" }));
    expect(screen.getByRole("heading", { name: "Redis" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redis 다시 확인" }));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps the server stale state after a successful manual refetch", async () => {
    const user = userEvent.setup();
    const staleSnapshot: PlatformHealthSnapshotResponse = {
      ...HEALTH_SNAPSHOT,
      refreshState: "STALE",
      staleAgeSeconds: 125,
    };
    const fetchSpy = vi
      .spyOn(api, "fetchPlatformAdminHealthSnapshot")
      .mockResolvedValueOnce(HEALTH_SNAPSHOT)
      .mockResolvedValueOnce(staleSnapshot);
    renderRoute();

    expect(await screen.findByText("현재 자료로 확인했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "서비스 신호" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "새로 확인" })[0]!);

    expect(await screen.findByText("마지막 확인 자료가 2분 5초 전입니다.")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("publishes a degraded header status sentence from the loaded snapshot", async () => {
    vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockResolvedValueOnce(HEALTH_SNAPSHOT);
    renderRoute();

    expect(await screen.findByRole("heading", { name: "AI 작업 대기열" })).toBeInTheDocument();
    expect(useAdminShellStatus).toHaveBeenLastCalledWith({
      tone: "warn",
      text: "대체로 정상이며, AI 작업 전달을 확인해야 합니다.",
      aside: "마지막 전체 확인 09:00",
    });
  });

  it("reports every service as healthy in the header when no card is degraded", async () => {
    const healthySnapshot: PlatformHealthSnapshotResponse = {
      ...HEALTH_SNAPSHOT,
      cards: HEALTH_SNAPSHOT.cards.map((card) => ({
        ...card,
        status: "OK",
        reason: null,
        metric: card.metric ?? { value: 0, unit: "ok", label: "ok" },
      })),
    };
    vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockResolvedValueOnce(healthySnapshot);
    renderRoute();

    expect(await screen.findByText("모든 서비스가 정상 범위입니다. 현재 자료로 확인했습니다.")).toBeInTheDocument();
    expect(useAdminShellStatus).toHaveBeenLastCalledWith({
      tone: "ok",
      text: "모든 서비스가 정상입니다.",
      aside: "마지막 전체 확인 09:00",
    });
  });

  it("clears the header status sentence while the snapshot is loading", () => {
    vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockImplementation(() => new Promise(() => {}));
    renderRoute();

    expect(screen.getByTestId("admin-health-skeleton")).toBeInTheDocument();
    expect(useAdminShellStatus).toHaveBeenLastCalledWith(null);
  });

  it("clears the header status sentence when the snapshot is unavailable", async () => {
    vi.spyOn(api, "fetchPlatformAdminHealthSnapshot").mockRejectedValueOnce(new Error("unavailable"));
    renderRoute();

    expect(await screen.findByText("스냅샷을 불러오지 못했습니다")).toBeInTheDocument();
    expect(useAdminShellStatus).toHaveBeenLastCalledWith(null);
  });
});
