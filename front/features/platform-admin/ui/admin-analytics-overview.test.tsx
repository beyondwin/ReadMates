import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsOverview } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { AdminAnalyticsOverviewView } from "./admin-analytics-overview";

const overview: AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v2",
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
  series: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      points: [
        { bucketStart: "2026-05-01", availability: "AVAILABLE", value: 75 },
        { bucketStart: "2026-05-08", availability: "NOT_ENOUGH_DATA", value: null },
      ],
    },
  ],
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
    expect(screen.getAllByText("세션 완료율").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("데이터 부족").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("클럽 비교에 충분한 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "KPI 추세" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "KPI 추세" })).toBeInTheDocument();
    expect(screen.getByText("2026-05-01")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "클럽 운영 보기" }).at(0)).toHaveAttribute("href", "/admin/clubs");
    expect(screen.getByRole("link", { name: "AI Ops 보기" })).toHaveAttribute("href", "/admin/ai-ops");
    expect(screen.getByRole("link", { name: "알림 운영 보기" })).toHaveAttribute("href", "/admin/notifications");
    const exportLink = screen.getByRole("link", { name: "CSV 내려받기" });
    expect(exportLink).toHaveAttribute("download", "readmates-admin-analytics-30d-2026-05-30.csv");
    expect(exportLink.getAttribute("href")).toContain("data:text/csv");
  });

  it("renders an honest empty trend state when KPI series are unavailable", () => {
    render(
      <AdminAnalyticsOverviewView
        overview={{ ...overview, series: [] }}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={vi.fn()}
      />,
    );

    expect(screen.getByText("KPI 추세를 만들 충분한 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "KPI 추세" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CSV 내려받기" })).toHaveAttribute(
      "download",
      "readmates-admin-analytics-30d-2026-05-30.csv",
    );
  });
});
