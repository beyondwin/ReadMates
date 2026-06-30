import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
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

describe("AdminHealthCard", () => {
  it("renders title, metric value, and drill link when status OK", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Outbox backlog")).toBeInTheDocument();
    expect(screen.getByText("42 rows")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /자세히/ })).toHaveAttribute(
      "href",
      "/admin/notifications?focus=outbox_backlog",
    );
  });

  it("renders reason when status is UNKNOWN and metric is null", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card({ status: "UNKNOWN", metric: null, reason: "prometheus_unreachable" })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/prometheus_unreachable/)).toBeInTheDocument();
  });

  it("does not render drill link when drill is null", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card({ drill: null })} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /자세히/ })).toBeNull();
  });

  it("does not render NaN for invalid last checked timestamps", () => {
    render(
      <MemoryRouter>
        <AdminHealthCard card={card({ lastCheckedAt: "not-a-date" })} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByText(/확인 시각 없음/)).toBeInTheDocument();
  });
});
