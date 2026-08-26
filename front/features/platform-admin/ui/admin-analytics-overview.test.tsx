import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminAnalyticsOverview } from "@/features/platform-admin/model/platform-admin-analytics-model";
import { AdminAnalyticsOverviewView } from "./admin-analytics-overview";

const overview: AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v2",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    { key: "SESSION_COMPLETION", label: "모임 완료율", definition: "완료된 모임 비율", unit: "PERCENT", availability: "AVAILABLE", current: 80, prior: 50, delta: 30, deltaDirection: "UP" },
    { key: "RSVP_RATE", label: "참석 응답률", definition: "참석 응답 비율", unit: "PERCENT", availability: "NOT_ENOUGH_DATA", current: null, prior: null, delta: null, deltaDirection: "NONE" },
    { key: "ACTIVE_MEMBERS", label: "활성 멤버", definition: "활성 멤버 수", unit: "COUNT", availability: "AVAILABLE", current: 0, prior: 0, delta: 0, deltaDirection: "FLAT" },
    { key: "AI_COST_PER_SESSION", label: "AI 비용/모임", definition: "모임당 AI 비용", unit: "USD", availability: "AVAILABLE", current: 1.5, prior: 1.2, delta: 0.3, deltaDirection: "UP" },
    { key: "NOTIFICATION_DELIVERY", label: "알림 도달률", definition: "종결 알림 중 전송 비율", unit: "PERCENT", availability: "MEASUREMENT_UNAVAILABLE", current: null, prior: null, delta: null, deltaDirection: "NONE" },
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
    {
      key: "ACTIVE_MEMBERS",
      unit: "COUNT",
      points: [
        { bucketStart: "2026-05-15", availability: "AVAILABLE", value: 0 },
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
        exportStatus="idle"
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "분석" })).toBeInTheDocument();
    expect(screen.getAllByText("모임 완료율").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getAllByText("측정 불가").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("완료된 모임 비율")).toBeInTheDocument();
    expect(screen.getAllByText("데이터 부족").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("클럽 비교에 충분한 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "KPI 추세" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "KPI 추세" })).toBeInTheDocument();
    expect(screen.getByText("2026-05-01")).toBeInTheDocument();
    expect(screen.getByText("2026-05-15")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "클럽 운영 보기" }).at(0)).toHaveAttribute("href", "/admin/clubs");
    expect(screen.getByRole("link", { name: "AI Ops 보기" })).toHaveAttribute("href", "/admin/ai-ops");
    expect(screen.getByRole("link", { name: "알림 운영 보기" })).toHaveAttribute("href", "/admin/notifications");
    expect(screen.getByRole("link", { name: "AI Ops 보기" })).toHaveClass("small");
    expect(screen.getByRole("link", { name: "알림 운영 보기" })).toHaveClass("small");
    expect(screen.getByRole("button", { name: "CSV 내려받기" })).toBeEnabled();
  });

  it("hides export when the export capability is absent and does not invoke the handler", () => {
    const onExport = vi.fn();
    render(
      <AdminAnalyticsOverviewView
        overview={overview}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={vi.fn()}
        exportStatus="idle"
        canExport={false}
        onExport={onExport}
      />,
    );

    expect(screen.queryByRole("button", { name: "CSV 내려받기" })).not.toBeInTheDocument();
    expect(screen.getByText("현재 권한으로는 CSV를 내려받을 수 없습니다.")).toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("shows a forbidden overview state without KPI evidence", () => {
    render(
      <AdminAnalyticsOverviewView
        overview={null}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={vi.fn()}
        exportStatus="idle"
        canView={false}
        canExport={false}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText(/권한이 없습니다|분석 권한이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CSV 내려받기" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("핵심 지표")).not.toBeInTheDocument();
  });

  it("renders an honest empty trend state when KPI series are unavailable", () => {
    render(
      <AdminAnalyticsOverviewView
        overview={{ ...overview, series: [] }}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={vi.fn()}
        exportStatus="pending"
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText("KPI 추세를 만들 충분한 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "KPI 추세" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV 내려받는 중" })).toBeDisabled();
  });

  it("supports arrow-key period selection and export errors", () => {
    const onWindowChange = vi.fn();
    render(
      <AdminAnalyticsOverviewView
        overview={overview}
        window="30d"
        loading={false}
        error={null}
        onWindowChange={onWindowChange}
        exportStatus="error"
        onExport={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "최근 30일" }), { key: "ArrowRight" });
    expect(onWindowChange).toHaveBeenCalledWith("90d");
    expect(screen.getByRole("alert")).toHaveTextContent("CSV 파일을 만들지 못했습니다");
  });
});
