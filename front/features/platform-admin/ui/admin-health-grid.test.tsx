import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type {
  HealthCard,
  PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";

const LEDGER_CSS = readFileSync(
  path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"),
  "utf8",
);

const HEALTH_SNAPSHOT: PlatformHealthSnapshot = {
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

function unavailableCard(overrides: Partial<HealthCard>): HealthCard {
  return {
    id: "outbox_backlog",
    title: "Outbox backlog",
    status: "UNKNOWN",
    metric: null,
    thresholds: null,
    lastCheckedAt: "2026-05-26T00:00:00Z",
    source: "IN_PROCESS",
    drill: null,
    reason: "provider_error",
    deployStrip: null,
    ...overrides,
  };
}

function snapshotWith(cards: HealthCard[], overrides: Partial<PlatformHealthSnapshot> = {}): PlatformHealthSnapshot {
  return {
    ...HEALTH_SNAPSHOT,
    ...overrides,
    cards,
  };
}

type GridProps = ComponentProps<typeof AdminHealthGrid> & {
  onRetryCard?: (cardId: string) => void;
};

function renderGrid(props: Partial<GridProps> = {}) {
  const defaultProps: GridProps = {
    snapshot: HEALTH_SNAPSHOT,
    loading: false,
    error: false,
    fetching: false,
    onRefresh: vi.fn(),
  };
  render(
    <MemoryRouter>
      <AdminHealthGrid {...defaultProps} {...props} />
    </MemoryRouter>,
  );
  return { onRefresh: (props.onRefresh ?? defaultProps.onRefresh) as ReturnType<typeof vi.fn> };
}

describe("AdminHealthGrid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("composes page context and an evidence ledger without case lifecycle chrome", () => {
    const { container } = render(
      <MemoryRouter>
        <AdminHealthGrid
          snapshot={HEALTH_SNAPSHOT}
          loading={false}
          error={false}
          fetching={false}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "서비스 건강" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("서비스")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "서비스 건강" })).toHaveClass("admin-page-frame");
    expect(screen.getByRole("region", { name: "서비스 신호" })).toHaveClass("admin-evidence-ledger");
    expect(screen.getByText("정상 갱신 완료")).toBeInTheDocument();
    expect(container.querySelector(".admin-case-docket")).toBeNull();
    expect(container.querySelector(".admin-action-dock")).toBeNull();
    expect(container.querySelector(".admin-safe-action-dock")).toBeNull();
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(container.querySelector(".admin-work-view-bar")).toBeNull();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("renders six health cards plus a separate deploy strip from the seven-card snapshot", () => {
    renderGrid();

    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "partial");
    expect(screen.getByRole("heading", { name: "Outbox backlog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kafka consumer lag" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Redis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DB pool" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notification dispatch success" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI provider availability" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getByText(/readmates-api:dev-20260526/)).toBeInTheDocument();
  });

  it("labels generated-at separately from the actual last successful refresh", () => {
    renderGrid({
      snapshot: {
        ...HEALTH_SNAPSHOT,
        generatedAt: "2026-05-26T00:00:00Z",
        lastSuccessfulAt: "2026-05-25T23:55:00Z",
      },
    });

    const generated = screen.getByText(/생성 시각/);
    expect(generated.closest("time")).toHaveAttribute("datetime", "2026-05-26T00:00:00Z");
    const lastSuccessful = screen.getByText(/마지막 정상 갱신/);
    expect(lastSuccessful.closest("time")).toHaveAttribute("datetime", "2026-05-25T23:55:00Z");
  });

  it("calls the refresh callback", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    renderGrid({ onRefresh });

    await user.click(screen.getByRole("button", { name: "새로고침" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["FRESH", 0, "정상 갱신 완료"],
    ["REFRESHING", 12, "서버에서 갱신 중"],
    ["STALE", 125, "마지막 정상 갱신 2분 5초 전"],
    ["UNAVAILABLE", 0, "정상 갱신 이력 없음"],
  ] as const)("renders the %s state from server metadata", (refreshState, staleAgeSeconds, copy) => {
    renderGrid({
      snapshot: {
        ...HEALTH_SNAPSHOT,
        lastSuccessfulAt: refreshState === "UNAVAILABLE" ? null : HEALTH_SNAPSHOT.lastSuccessfulAt,
        refreshState,
        staleAgeSeconds,
      },
    });

    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("shows transport activity without replacing the fresh server state", () => {
    renderGrid({ fetching: true });

    expect(screen.getByText("정상 갱신 완료")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요청 중" })).toBeDisabled();
  });

  it("keeps successful cards when a partial source is unavailable", () => {
    renderGrid();

    expect(screen.getByText("일부만 확인됨")).toBeInTheDocument();
    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "partial");
    const redis = screen.getByRole("article", { name: "Redis" });
    expect(within(redis).getByText("확인 불가")).toBeInTheDocument();
    expect(within(redis).queryByText("정상")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Outbox backlog" })).getByText("정상")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
  });

  it("keeps card evidence when every source is unavailable", () => {
    renderGrid({
      snapshot: snapshotWith(HEALTH_SNAPSHOT.cards.map((item) => unavailableCard({
        id: item.id,
        title: item.title,
        source: item.source,
        drill: item.drill,
        deployStrip: null,
      }))),
    });

    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "unavailable");
    expect(screen.getByRole("heading", { name: "Outbox backlog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Redis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getAllByText("확인 불가").length).toBeGreaterThan(1);
    expect(document.querySelector(".admin-health-card__pill--ok")).toBeNull();
    expect(screen.queryByText("42 rows")).not.toBeInTheDocument();
  });

  it("treats disabled Redis, Kafka, and provider as absence, not page failure", () => {
    renderGrid({
      snapshot: snapshotWith([
        ...HEALTH_SNAPSHOT.cards.filter((item) => (
          item.id !== "redis"
          && item.id !== "kafka_consumer_lag"
          && item.id !== "ai_provider_availability"
        )),
        unavailableCard({
          id: "redis",
          title: "Redis",
          reason: "redis_disabled",
        }),
        unavailableCard({
          id: "kafka_consumer_lag",
          title: "Kafka consumer lag",
          source: "PROMETHEUS",
          reason: "kafka_disabled",
        }),
        unavailableCard({
          id: "ai_provider_availability",
          title: "AI provider availability",
          source: "PROMETHEUS",
          reason: "provider_disabled",
          drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
        }),
      ]),
    });

    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "ready");
    expect(screen.queryByText("일부만 확인됨")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Redis" })).getByText("비활성")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Kafka consumer lag" })).getByText("비활성")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "AI provider availability" })).getByText("비활성")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Redis" })).queryByText("확인 불가")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redis 다시 확인" })).not.toBeInTheDocument();
  });

  it("aggregates an all-disabled snapshot without a green ready claim", () => {
    renderGrid({
      snapshot: snapshotWith(HEALTH_SNAPSHOT.cards.map((item) => unavailableCard({
        id: item.id,
        title: item.title,
        source: item.source,
        reason: `${item.id}_disabled`,
        deployStrip: null,
      }))),
    });

    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "disabled");
    expect(screen.getByText("비활성 구성")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".admin-health-card__pill--ok")).toBeNull();
    expect(screen.getByRole("heading", { name: "Outbox backlog" })).toBeInTheDocument();
  });

  it("shows missing deploy ledger evidence without a success history", () => {
    renderGrid({
      snapshot: snapshotWith(
        HEALTH_SNAPSHOT.cards.map((item) => (
          item.id === "deploy_attempts_strip"
            ? unavailableCard({
                id: "deploy_attempts_strip",
                title: "Deploy attempts",
                source: "FILE",
                reason: "ledger_unavailable",
              })
            : item
        )),
      ),
    });

    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getByText("배포 원장을 확인할 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/readmates-api:dev-20260526/)).not.toBeInTheDocument();
    expect(document.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
  });

  it("still surfaces a missing deploy ledger when the card is omitted", () => {
    renderGrid({
      snapshot: snapshotWith(HEALTH_SNAPSHOT.cards.filter((item) => item.id !== "deploy_attempts_strip")),
    });

    expect(screen.getByRole("heading", { name: "최근 deploy" })).toBeInTheDocument();
    expect(screen.getByText("배포 원장을 확인할 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("성공")).not.toBeInTheDocument();
  });

  it("retries a single unavailable card without retrying disabled or ready cards", async () => {
    const user = userEvent.setup();
    const onRetryCard = vi.fn();
    renderGrid({ onRetryCard });

    await user.click(screen.getByRole("button", { name: "Redis 다시 확인" }));
    expect(onRetryCard).toHaveBeenCalledTimes(1);
    expect(onRetryCard).toHaveBeenCalledWith("redis");
    expect(screen.queryByRole("button", { name: "Outbox backlog 다시 확인" })).not.toBeInTheDocument();
  });

  it("renders a loading skeleton instead of a ready grid", () => {
    renderGrid({ snapshot: null, loading: true });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByTestId("admin-health-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Outbox backlog")).not.toBeInTheDocument();
    expect(screen.queryByText("정상")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses an alert for transport failure without leftover green cards", () => {
    renderGrid({ snapshot: null, loading: false, error: true });

    expect(screen.getByRole("alert")).toHaveTextContent("스냅샷을 불러오지 못했습니다");
    expect(screen.queryByText("정상")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-health-skeleton")).not.toBeInTheDocument();
  });

  it("locks 44px targets and reduced motion in the scoped health ledger stylesheet", () => {
    expect(LEDGER_CSS).toMatch(/\.admin-health-grid[\s\S]*min-height:\s*44px/);
    expect(LEDGER_CSS).toContain(".admin-health-grid");
    expect(LEDGER_CSS).toContain("prefers-reduced-motion");
    expect(LEDGER_CSS).toContain(":focus-visible");
    expect(LEDGER_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-health-grid[\s\S]*animation-duration:\s*0\.01ms/,
    );
    expect(LEDGER_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });

  it("does not import route, query, or API modules", () => {
    const source = readFileSync(
      path.resolve("features/platform-admin/ui/admin-health-grid.tsx"),
      "utf8",
    );
    expect(source).not.toContain("platform-admin-queries");
    expect(source).not.toContain("platform-admin-health-api");
    expect(source).not.toContain("admin-health-route");
    expect(/fetch\s*\(/.test(source)).toBe(false);
  });

  it("omits evidence count while loading or unavailable", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AdminHealthGrid
          snapshot={null}
          loading
          error={false}
          fetching={false}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "서비스 신호" })).toBeInTheDocument();
    expect(screen.queryByText(/건$/)).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AdminHealthGrid
          snapshot={null}
          loading={false}
          error
          fetching={false}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "서비스 신호" })).toBeInTheDocument();
    expect(screen.queryByText(/건$/)).not.toBeInTheDocument();
  });

  it.each(["STALE", "UNAVAILABLE"] as const)(
    "keeps deploy text but removes current-green evidence when the snapshot is %s",
    (refreshState) => {
      renderGrid({
        snapshot: {
          ...HEALTH_SNAPSHOT,
          refreshState,
          lastSuccessfulAt: refreshState === "UNAVAILABLE" ? null : HEALTH_SNAPSHOT.lastSuccessfulAt,
        },
      });

      const deploy = screen.getByRole("region", { name: "최근 deploy" });
      expect(within(deploy).getByText("정상")).toBeInTheDocument();
      expect(deploy.querySelector(".admin-health-card__pill--ok")).toBeNull();
      expect(deploy.querySelector(".admin-health-card__pill--last-known")).not.toBeNull();
      expect(deploy.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
      expect(deploy.querySelector(".admin-health-deploy-strip__dot--last-known")).not.toBeNull();
    },
  );
});
