import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsOverview } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { AdminAnalyticsOverviewView } from "./admin-analytics-overview";

const overview: AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v1",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    { key: "SESSION_COMPLETION", unit: "PERCENT", availability: "AVAILABLE", current: 80, prior: 50, deltaDirection: "UP" },
    { key: "RSVP_RATE", unit: "PERCENT", availability: "NOT_ENOUGH_DATA", current: null, prior: null, deltaDirection: "NONE" },
    { key: "ACTIVE_MEMBERS", unit: "COUNT", availability: "AVAILABLE", current: 12, prior: 9, deltaDirection: "UP" },
    { key: "AI_COST_PER_SESSION", unit: "USD", availability: "AVAILABLE", current: 1.5, prior: 1.2, deltaDirection: "UP" },
    { key: "NOTIFICATION_DELIVERY", unit: "PERCENT", availability: "AVAILABLE", current: 95, prior: 95, deltaDirection: "FLAT" },
  ],
  clubBenchmark: { availability: "NOT_ENOUGH_DATA", rows: [] },
  series: [],
};

describe("AdminAnalyticsOverviewView", () => {
  it("renders KPI values and a not-enough-data benchmark empty state", () => {
    render(
      <AdminAnalyticsOverviewView
        overview={overview}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(screen.getByText("세션 완료율")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("데이터 부족").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("클럽 비교에 충분한 데이터가 없습니다.")).toBeInTheDocument();
  });
});
