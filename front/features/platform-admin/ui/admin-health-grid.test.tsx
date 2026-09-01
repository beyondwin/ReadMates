import { existsSync, readFileSync } from "node:fs";
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

const SERVICE_STATUS_CSS_PATH = path.resolve(
  "features/platform-admin/ui/admin-service-status.css",
);
const SERVICE_STATUS_CSS = existsSync(SERVICE_STATUS_CSS_PATH)
  ? readFileSync(SERVICE_STATUS_CSS_PATH, "utf8")
  : "";

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
    expect(screen.getByText("서비스 상태")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "서비스 건강" })).toHaveClass("admin-page-frame");
    expect(screen.getByRole("region", { name: "서비스 신호" })).toHaveClass("admin-evidence-ledger");
    expect(screen.getByText("현재 자료로 확인했습니다.")).toBeInTheDocument();
    expect(container.querySelector(".admin-case-docket")).toBeNull();
    expect(container.querySelector(".admin-action-dock")).toBeNull();
    expect(container.querySelector(".admin-safe-action-dock")).toBeNull();
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
    expect(container.querySelector(".admin-work-view-bar")).toBeNull();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("shows only actual abnormal sources and keeps all normal known sources in one quiet list", () => {
    renderGrid();

    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "partial");
    expect(screen.getByRole("heading", { name: "AI 작업 대기열" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Redis" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "알림 대기열" })).not.toBeInTheDocument();
    const normalSources = screen.getByRole("region", { name: "정상 범위 서비스" });
    expect(within(normalSources).getByText("알림 대기열")).toBeInTheDocument();
    expect(within(normalSources).getByText("데이터베이스 연결")).toBeInTheDocument();
    expect(within(normalSources).getByText("알림 전송")).toBeInTheDocument();
    expect(within(normalSources).getByText("AI 제공자")).toBeInTheDocument();
    expect(within(normalSources).getByText("외부 연결 보호")).toBeInTheDocument();
    expect(normalSources.querySelector(".admin-health-card__pill--ok")).toBeNull();
    expect(screen.getByRole("heading", { name: "최근에 바뀐 것" })).toBeInTheDocument();
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
    ["FRESH", 0, "현재 자료로 확인했습니다."],
    ["REFRESHING", 12, "새 상태를 확인하고 있습니다."],
    ["STALE", 125, "마지막 확인 자료가 2분 5초 전입니다."],
    ["UNAVAILABLE", 0, "최근 상태 자료를 확인할 수 없습니다."],
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

    expect(screen.getByText("현재 자료로 확인했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요청 중" })).toBeDisabled();
  });

  it("keeps successful cards when a partial source is unavailable", () => {
    renderGrid();

    expect(screen.getByText("일부만 확인됨")).toBeInTheDocument();
    expect(screen.getByTestId("admin-health-grid")).toHaveAttribute("data-page-state", "partial");
    const redis = screen.getByRole("article", { name: "Redis" });
    expect(within(redis).getByText("확인 불가")).toBeInTheDocument();
    expect(within(redis).queryByText("정상")).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "알림 대기열" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "정상 범위 서비스" })).getByText("알림 대기열")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근에 바뀐 것" })).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "알림 대기열" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Redis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근에 바뀐 것" })).toBeInTheDocument();
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
    expect(within(screen.getByRole("article", { name: "Redis" })).getAllByText("사용 안 함")).toHaveLength(2);
    expect(within(screen.getByRole("article", { name: "AI 작업 대기열" })).getAllByText("사용 안 함")).toHaveLength(2);
    expect(within(screen.getByRole("article", { name: "AI 제공자" })).getAllByText("사용 안 함")).toHaveLength(2);
    expect(within(screen.getByRole("article", { name: "Redis" })).queryByText("확인 불가")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redis 다시 확인" })).not.toBeInTheDocument();
    const narrative = document.querySelector(".admin-health-grid__narrative");
    expect(narrative).toHaveTextContent(
      "사용하지 않는 서비스가 3곳 있습니다. 현재 자료로 확인했습니다.",
    );
    expect(narrative).not.toHaveTextContent("모든 서비스가 정상 범위입니다.");
  });

  it.each([
    ["WARN", { status: "WARN" as const, metric: { value: 75, unit: "records", label: "max" }, reason: null }, "주의해서 살펴볼 서비스가 1곳 있습니다."],
    ["CRIT", { status: "CRIT" as const, metric: { value: 750, unit: "records", label: "max" }, reason: null }, "지금 확인이 필요한 서비스가 1곳 있습니다."],
    ["empty", { status: "UNKNOWN" as const, metric: null, reason: "no_data" }, "일부 서비스는 아직 판단할 자료가 없습니다."],
    ["disabled", { status: "UNKNOWN" as const, metric: null, reason: "kafka_disabled" }, "사용하지 않는 서비스가 1곳 있습니다."],
  ])("keeps a stale %s deviation without publishing current-evidence copy", (_kind, kafka, prefix) => {
    renderGrid({
      snapshot: snapshotWith(
        HEALTH_SNAPSHOT.cards.map((item) => {
          if (item.id === "kafka_consumer_lag") return { ...item, ...kafka };
          if (item.id === "redis") {
            return {
              ...item,
              status: "OK" as const,
              metric: { value: 0, unit: "errors", label: "current" },
              reason: null,
            };
          }
          return item;
        }),
        { refreshState: "STALE", staleAgeSeconds: 125 },
      ),
    });

    const narrative = document.querySelector(".admin-health-grid__narrative");
    expect(narrative).toHaveTextContent(`${prefix} 마지막 확인 자료가 오래되었습니다.`);
    expect(narrative).not.toHaveTextContent("현재 자료");
  });

  it.each([
    ["REFRESHING", "주의해서 살펴볼 서비스가 1곳 있습니다. 새 상태를 확인하고 있습니다."],
    ["UNAVAILABLE", "주의해서 살펴볼 서비스가 1곳 있습니다. 최근 상태 자료를 확인할 수 없어 정상 여부를 확정할 수 없습니다."],
  ] as const)("keeps mixed deviation evidence truthful while freshness is %s", (refreshState, expected) => {
    renderGrid({
      snapshot: snapshotWith(
        HEALTH_SNAPSHOT.cards.map((item) => (
          item.id === "redis"
            ? {
                ...item,
                status: "OK" as const,
                metric: { value: 0, unit: "errors", label: "current" },
                reason: null,
              }
            : item
        )),
        { refreshState },
      ),
    });

    expect(document.querySelector(".admin-health-grid__narrative")).toHaveTextContent(expected);
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
    expect(screen.getByRole("heading", { name: "사용 안 함" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".admin-health-card__pill--ok")).toBeNull();
    expect(screen.getByRole("heading", { name: "알림 대기열" })).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "최근에 바뀐 것" })).toBeInTheDocument();
    const deploy = screen.getByRole("region", { name: "최근에 바뀐 것" });
    expect(within(deploy).getByText("상태를 확인할 수 없습니다")).toBeInTheDocument();
    expect(within(deploy).getByText("원천에서 상태 자료를 받지 못했습니다.")).toBeInTheDocument();
    expect(within(deploy).getByText("최근 변경의 적용 상태를 확인하기 어렵습니다.")).toBeInTheDocument();
    expect(within(deploy).getByText("배포 기록을 다시 확인하세요.")).toBeInTheDocument();
    expect(within(deploy).getByText("배포 원장을 확인할 수 없습니다.")).toBeInTheDocument();
    const technical = within(deploy).getByRole("group", { name: "기술 정보" });
    expect(within(technical).getByText("ledger_unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/readmates-api:dev-20260526/)).not.toBeInTheDocument();
    expect(document.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
  });

  it("still surfaces a missing deploy ledger when the card is omitted", () => {
    renderGrid({
      snapshot: snapshotWith(HEALTH_SNAPSHOT.cards.filter((item) => item.id !== "deploy_attempts_strip")),
    });

    expect(screen.getByRole("heading", { name: "최근에 바뀐 것" })).toBeInTheDocument();
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

  it("locks 44px targets, 1240px containment, responsive wrapping, and reduced motion in the service stylesheet", () => {
    expect(SERVICE_STATUS_CSS).toMatch(/\.admin-service-status[\s\S]*max-width:\s*1240px/);
    expect(SERVICE_STATUS_CSS).toMatch(/\.admin-service-status[\s\S]*min-height:\s*44px/);
    expect(SERVICE_STATUS_CSS).toContain("overflow-wrap: anywhere");
    expect(SERVICE_STATUS_CSS).toContain("prefers-reduced-motion");
    expect(SERVICE_STATUS_CSS).toContain(":focus-visible");
    expect(SERVICE_STATUS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-service-status[\s\S]*animation-duration:\s*0\.01ms/,
    );
    expect(SERVICE_STATUS_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });

  it("renders an all-ok snapshot as one narrative, names in details, and no percent readings", () => {
    renderGrid({
      snapshot: snapshotWith(
        HEALTH_SNAPSHOT.cards.map((item) => (
          item.id === "deploy_attempts_strip"
            ? item
            : {
                ...item,
                status: "OK" as const,
                reason: null,
                metric: item.metric ?? { value: 1, unit: "rows", label: "ok" },
                deployStrip: null,
              }
        )),
      ),
    });

    const narrative = screen.getByText("모든 서비스가 정상 범위입니다. 현재 자료로 확인했습니다.");
    expect(narrative.tagName).toBe("P");
    expect(screen.queryByText(/마지막 이상은/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ ?%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Outbox backlog" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Notification dispatch success" })).not.toBeInTheDocument();

    const okSignals = screen.getByRole("region", { name: "정상 범위 서비스" });
    expect(within(okSignals).getByText("알림 대기열")).toBeInTheDocument();
    expect(within(okSignals).getByText("AI 작업 대기열")).toBeInTheDocument();
    expect(within(okSignals).getByText("Redis")).toBeInTheDocument();
    expect(within(okSignals).getByText("데이터베이스 연결")).toBeInTheDocument();
    expect(within(okSignals).getByText("알림 전송")).toBeInTheDocument();
    expect(within(okSignals).getByText("AI 제공자")).toBeInTheDocument();
    expect(within(okSignals).getByText("외부 연결 보호")).toBeInTheDocument();
    expect(within(okSignals).queryByText(/\d+ ?%/)).not.toBeInTheDocument();
    expect(within(okSignals).queryByText("42 rows")).not.toBeInTheDocument();
    expect(okSignals.querySelector(".admin-health-card__pill--ok")).toBeNull();
    expect(document.querySelector(".admin-health-card__pill--ok")).toBeNull();
  });

  it("renders the single deviation card immediately after the narrative, with its reading", () => {
    renderGrid({
      snapshot: snapshotWith(
        HEALTH_SNAPSHOT.cards.map((item) => {
          if (item.id === "deploy_attempts_strip") return item;
          if (item.id === "kafka_consumer_lag") {
            return {
              ...item,
              status: "WARN" as const,
              metric: { value: 0.75, unit: "ratio", label: "max across partitions" },
            };
          }
          return {
            ...item,
            status: "OK" as const,
            reason: null,
            metric: item.metric ?? { value: 1, unit: "rows", label: "ok" },
            deployStrip: null,
          };
        }),
      ),
    });

    const narrative = screen.getByText("주의해서 살펴볼 서비스가 1곳 있습니다. 현재 자료로 확인했습니다.");
    const article = screen.getByRole("article", { name: "AI 작업 대기열" });
    expect(narrative.nextElementSibling).toContainElement(article);
    expect(within(article).getByText("관측값이 주의 범위에 들어왔습니다.")).toBeInTheDocument();
    expect(article.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("75.00%");
    expect(screen.queryByRole("article", { name: "알림 대기열" })).not.toBeInTheDocument();
  });

  it("names the deploy strip 최근에 바뀐 것", () => {
    renderGrid();

    expect(screen.getByRole("heading", { name: "최근에 바뀐 것" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "최근 deploy" })).not.toBeInTheDocument();
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

      const deploy = screen.getByRole("region", { name: "최근에 바뀐 것" });
      expect(within(deploy).getByText("1건")).toBeInTheDocument();
      expect(within(deploy).getByText(refreshState === "STALE" ? "오래됨" : "확인 불가")).toBeInTheDocument();
      expect(deploy.querySelector(".admin-health-card__pill--ok")).toBeNull();
      expect(deploy.querySelector(".admin-health-card__pill--last-known")).not.toBeNull();
      expect(deploy.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
      expect(deploy.querySelector(".admin-health-deploy-strip__dot--last-known")).not.toBeNull();
    },
  );
});
