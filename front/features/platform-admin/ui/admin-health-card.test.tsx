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
    status: "WARN",
    metric: { value: 142, unit: "rows", label: "pending" },
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
  it("explains a known abnormal source with reason, observation, impact, and next action", () => {
    renderCard(card());

    const article = articleNamed("알림 대기열");
    expect(within(article).getByText("주의해서 살펴봐야 합니다.")).toBeInTheDocument();
    expect(within(article).getByText("관측값이 주의 범위에 들어왔습니다.")).toBeInTheDocument();
    expect(within(article).getByText("알림 처리가 늦어질 수 있습니다.")).toBeInTheDocument();
    expect(within(article).getByText("알림 상태에서 대기 항목을 확인하세요.")).toBeInTheDocument();
    expect(within(article).getByText("확인 시각")).toBeInTheDocument();
    expect(within(article).getByRole("link", { name: "알림 상태 열기" })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=outbox_backlog",
    );

    const disclosure = article.querySelector("[data-admin-technical-disclosure]");
    expect(disclosure).not.toBeNull();
    expect(disclosure).toHaveTextContent("Outbox backlog");
    expect(disclosure).toHaveTextContent("WARN");
    expect(disclosure).toHaveTextContent("142 rows");
    expect(disclosure).toHaveTextContent("IN_PROCESS");
    expect(article.querySelector(".admin-health-card__metric")).toBeNull();
    expect(article.querySelector(".admin-health-card__thresholds")).toBeNull();
  });

  it("keeps a true zero reading in technical evidence rather than treating it as unavailable", () => {
    renderCard(card({ status: "OK", metric: { value: 0, unit: "rows", label: "pending" } }));

    const article = articleNamed("알림 대기열");
    expect(within(article).getByText("현재 정상 범위입니다.")).toBeInTheDocument();
    expect(within(article).queryByText("상태를 확인할 수 없습니다")).not.toBeInTheDocument();
    expect(article.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("0 rows");
  });

  it("derives no-data from the reason without adding a wire status", () => {
    renderCard(card({
      id: "ai_provider_availability",
      title: "AI provider availability",
      status: "UNKNOWN",
      metric: null,
      reason: "no_data",
      drill: { kind: "ADMIN_ROUTE", target: "/admin/ai-ops" },
    }));

    const article = articleNamed("AI 제공자");
    expect(within(article).getByText("아직 판단할 자료가 없습니다.")).toBeInTheDocument();
    expect(within(article).getByText("원천에 아직 판단할 관측 자료가 없습니다.")).toBeInTheDocument();
    expect(article).toHaveAttribute("data-evidence", "empty");
    expect(article.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("UNKNOWN");
    expect(within(article).queryByRole("button", { name: /다시 확인/ })).not.toBeInTheDocument();
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
    expect(within(article).getByText("현재 운영 설정에서 사용하지 않습니다.")).toBeInTheDocument();
    expect(within(article).queryByText("상태를 확인할 수 없습니다")).not.toBeInTheDocument();
    expect(within(article).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(article).queryByRole("button", { name: /다시 확인/ })).not.toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries only an unavailable known source", async () => {
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

  it("reaches the domain detail from the keyboard", async () => {
    const user = userEvent.setup();
    renderCard(card());

    const drill = screen.getByRole("link", { name: "알림 상태 열기" });
    drill.focus();
    expect(drill).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("알림 운영")).toBeInTheDocument();
  });

  it.each(["STALE", "UNAVAILABLE"] as const)(
    "does not present cached OK evidence as current when the snapshot is %s",
    (refreshState) => {
      renderCard(card({ status: "OK" }), { refreshState });

      const article = articleNamed("알림 대기열");
      expect(within(article).getByText(refreshState === "STALE" ? "오래됨" : "확인 불가")).toBeInTheDocument();
      expect(article.querySelector(".admin-health-card__pill--ok")).toBeNull();
      expect(article.querySelector(".admin-health-card__pill--last-known")).not.toBeNull();
    },
  );

  it("fails closed for an unknown card without fabricated impact or action", () => {
    renderCard(card({
      id: "api_latency",
      title: "API latency",
      status: "OK",
      drill: null,
    }));

    const article = articleNamed("알 수 없는 서비스");
    expect(within(article).getByText("상태를 확인할 수 없습니다")).toBeInTheDocument();
    expect(within(article).queryByText("영향")).not.toBeInTheDocument();
    expect(within(article).queryByText("다음 확인")).not.toBeInTheDocument();
    expect(article.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("api_latency");
    expect(article.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("API latency");
  });

  it("does not render NaN for invalid last checked timestamps", () => {
    renderCard(card({ lastCheckedAt: "not-a-date" }));
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByText("확인 시각 없음")).toBeInTheDocument();
  });
});
