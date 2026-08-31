import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import type { HealthCard } from "@/features/platform-admin/model/platform-admin-health-model";
import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";

function card(overrides: Partial<HealthCard> = {}): HealthCard {
  return {
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
    ...overrides,
  };
}

function renderCard(
  value: HealthCard,
  extra: { refreshState?: "FRESH" | "REFRESHING" | "STALE" | "UNAVAILABLE"; onRetry?: (id: string) => void } = {},
) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<AdminHealthCard card={value} {...extra} />} />
        <Route path="/admin/notifications" element={<p>알림 운영</p>} />
        <Route path="/admin/ai-ops" element={<p>AI 작업</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function articleNamed(name: string) {
  return screen.getByRole("article", { name });
}

describe("AdminHealthCard", () => {
  it("renders state, primary reading, source, last evidence, freshness, and one drill", () => {
    renderCard(card());

    const article = articleNamed("Outbox backlog");
    expect(within(article).getByText("정상")).toBeInTheDocument();
    expect(within(article).getByText("42 rows")).toBeInTheDocument();
    expect(within(article).getByText("원천")).toBeInTheDocument();
    expect(within(article).getByText("프로세스")).toBeInTheDocument();
    expect(within(article).getByText("최근 근거")).toBeInTheDocument();
    expect(within(article).getByText("최신성")).toBeInTheDocument();
    expect(within(article).getByText("최신")).toBeInTheDocument();
    expect(within(article).getByRole("link", { name: /자세히/ })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=outbox_backlog",
    );
    expect(within(article).queryAllByRole("link")).toHaveLength(1);
  });

  it("keeps a true zero reading distinct from unavailable", () => {
    renderCard(card({ metric: { value: 0, unit: "rows", label: "pending" } }));

    const article = articleNamed("Outbox backlog");
    expect(within(article).getByText("0 rows")).toBeInTheDocument();
    expect(within(article).getByText("정상")).toBeInTheDocument();
    expect(within(article).queryByText("확인 불가")).not.toBeInTheDocument();
    expect(within(article).queryByText("비활성")).not.toBeInTheDocument();
  });

  it("does not synthesize a reading when the metric is unavailable", () => {
    renderCard(card({ status: "UNKNOWN", metric: null, reason: "prometheus_unreachable" }));

    const article = articleNamed("Outbox backlog");
    expect(within(article).getByText("확인 불가")).toBeInTheDocument();
    expect(within(article).getByText("prometheus_unreachable")).toBeInTheDocument();
    expect(within(article).queryByText("정상")).not.toBeInTheDocument();
    expect(within(article).queryByText("0 rows")).not.toBeInTheDocument();
    expect(article.querySelector(".admin-health-card__pill--ok")).toBeNull();
  });

  it("treats disabled Redis as configured absence, not an error", () => {
    const onRetry = vi.fn();
    renderCard(
      card({
        id: "redis",
        title: "Redis",
        status: "UNKNOWN",
        metric: null,
        reason: "redis_disabled",
        drill: null,
      }),
      { onRetry },
    );

    const article = articleNamed("Redis");
    expect(within(article).getByText("비활성")).toBeInTheDocument();
    expect(within(article).queryByText("확인 불가")).not.toBeInTheDocument();
    expect(within(article).queryByText("정상")).not.toBeInTheDocument();
    expect(within(article).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(article).queryByRole("button", { name: /다시 확인/ })).not.toBeInTheDocument();
    expect(article.querySelector(".admin-health-card__pill--ok")).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries only the unavailable card", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderCard(
      card({
        id: "redis",
        title: "Redis",
        status: "UNKNOWN",
        metric: null,
        reason: "redis_metrics_unavailable",
        drill: null,
      }),
      { onRetry },
    );

    await user.click(screen.getByRole("button", { name: "Redis 다시 확인" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith("redis");
  });

  it("reaches the drill target from the keyboard", async () => {
    const user = userEvent.setup();
    renderCard(card());

    const drill = screen.getByRole("link", { name: /자세히/ });
    drill.focus();
    expect(drill).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("알림 운영")).toBeInTheDocument();
  });

  it.each(["STALE", "UNAVAILABLE"] as const)(
    "keeps an OK reading but removes current-green evidence when the snapshot is %s",
    (refreshState) => {
      renderCard(card(), { refreshState });

      const article = articleNamed("Outbox backlog");
      expect(within(article).getByText("42 rows")).toBeInTheDocument();
      expect(within(article).getByText("정상")).toBeInTheDocument();
      expect(within(article).getByText(refreshState === "STALE" ? "오래됨" : "확인 불가")).toBeInTheDocument();
      expect(article.querySelector(".admin-health-card__pill--ok")).toBeNull();
      expect(article.querySelector(".admin-health-card__pill--last-known")).not.toBeNull();
    },
  );

  it("does not render a drill link when drill is null", () => {
    renderCard(card({ drill: null }));
    expect(screen.queryByRole("link", { name: /자세히/ })).toBeNull();
  });

  it("keeps source-specific retry and one drill without case or receipt chrome", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderCard(
      card({
        status: "UNKNOWN",
        metric: null,
        reason: "prometheus_unreachable",
      }),
      { onRetry },
    );

    await user.click(screen.getByRole("button", { name: "Outbox backlog 다시 확인" }));
    expect(onRetry).toHaveBeenCalledWith("outbox_backlog");
    expect(screen.getByRole("link", { name: /자세히/ })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=outbox_backlog",
    );
    expect(document.querySelector(".admin-case-docket")).toBeNull();
    expect(document.querySelector(".admin-action-dock")).toBeNull();
    expect(document.querySelector(".admin-receipt-timeline")).toBeNull();
  });

  it("does not render NaN for invalid last checked timestamps", () => {
    renderCard(card({ lastCheckedAt: "not-a-date" }));
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByText(/확인 시각 없음/)).toBeInTheDocument();
  });
});
