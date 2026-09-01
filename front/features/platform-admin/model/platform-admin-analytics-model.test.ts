import { describe, expect, it } from "vitest";
import {
  analyticsActionForKpi,
  buildAnalyticsKpiDecisionView,
  analyticsSearchFromWindow,
  analyticsWindowFromSearchParams,
  deltaLabel,
  formatAvailabilityLabel,
  formatAnalyticsGeneratedAt,
  formatKpiValue,
  formatSeriesPointValue,
  labelKpi,
  type AdminAnalyticsKpiCard,
  type AdminAnalyticsOverview,
} from "./platform-admin-analytics-model";

function card(partial: Partial<AdminAnalyticsKpiCard>): AdminAnalyticsKpiCard {
  return {
    key: "SESSION_COMPLETION",
    unit: "PERCENT",
    availability: "AVAILABLE",
    current: 80,
    prior: 50,
    delta: 30,
    deltaDirection: "UP",
    label: "모임 완료율",
    definition: "기간 내 완료된 모임 비율",
    ...partial,
  };
}

describe("platform-admin-analytics-model", () => {
  it("defaults the window to 30d for missing or invalid params", () => {
    expect(analyticsWindowFromSearchParams(new URLSearchParams(""))).toBe("30d");
    expect(analyticsWindowFromSearchParams(new URLSearchParams("window=bogus"))).toBe("30d");
    expect(analyticsWindowFromSearchParams(new URLSearchParams("window=7d"))).toBe("7d");
  });

  it("serializes the window back to a search param", () => {
    expect(analyticsSearchFromWindow("90d").toString()).toBe("window=90d");
  });

  it("formats values per unit and shows a not-enough-data label", () => {
    expect(formatKpiValue(card({ unit: "PERCENT", current: 80 }))).toBe("80%");
    expect(formatKpiValue(card({ unit: "USD", current: 1.5 }))).toBe("$1.5000");
    expect(formatKpiValue(card({ unit: "COUNT", current: 12 }))).toBe("12");
    expect(formatKpiValue(card({ availability: "NOT_ENOUGH_DATA", current: null }))).toBe("데이터 부족");
  });

  it("uses the server-projected numeric delta without recalculating it", () => {
    expect(deltaLabel(card({ current: 80, prior: 50, delta: 12.5, deltaDirection: "UP" }))).toBe(
      "▲ +12.5 (이전 구간 대비)",
    );
    expect(deltaLabel(card({ current: 0, prior: 0, delta: 0, deltaDirection: "FLAT" }))).toBe(
      "→ 0 (이전 구간 대비)",
    );
  });

  it("formats measurement unavailable separately from not enough data", () => {
    expect(formatAvailabilityLabel("NOT_ENOUGH_DATA")).toBe("데이터 부족");
    expect(formatAvailabilityLabel("MEASUREMENT_UNAVAILABLE")).toBe("측정 불가");
    expect(formatKpiValue(card({ availability: "MEASUREMENT_UNAVAILABLE", current: null }))).toBe("측정 불가");
  });

  it("labels each KPI in Korean", () => {
    expect(labelKpi("NOTIFICATION_DELIVERY")).toBe("알림 도달률");
  });

  it("maps KPI cards to operator drilldown routes", () => {
    expect(analyticsActionForKpi("NOTIFICATION_DELIVERY")).toEqual({
      label: "알림 운영 보기",
      href: "/admin/notifications",
    });
    expect(analyticsActionForKpi("AI_COST_PER_SESSION")).toEqual({
      label: "AI 작업 보기",
      href: "/admin/ai-ops",
    });
    expect(analyticsActionForKpi("SESSION_COMPLETION")).toEqual({
      label: "클럽 운영 보기",
      href: "/admin/clubs",
    });
  });

  it("formats trend point values and keeps unavailable buckets honest", () => {
    expect(formatSeriesPointValue({ bucketStart: "2026-05-01", availability: "NOT_ENOUGH_DATA", value: null }, "PERCENT"))
      .toBe("데이터 부족");
    expect(formatSeriesPointValue({ bucketStart: "2026-05-08", availability: "AVAILABLE", value: 75 }, "PERCENT"))
      .toBe("75%");
    expect(formatSeriesPointValue({ bucketStart: "2026-05-08", availability: "AVAILABLE", value: 0.5 }, "USD"))
      .toBe("$0.5000");
  });

  it("builds a decision view from the server definition and availability before optional values", () => {
    expect(buildAnalyticsKpiDecisionView(card({
      label: "서버가 정의한 완료율",
      definition: "선택 기간에 끝난 모임의 비율",
      availability: "AVAILABLE",
      current: 80,
      delta: 12.5,
      deltaDirection: "UP",
    }))).toEqual({
      key: "SESSION_COMPLETION",
      label: "서버가 정의한 완료율",
      definition: "선택 기간에 끝난 모임의 비율",
      availability: "측정됨",
      value: "80%",
      comparison: "▲ +12.5 (이전 구간 대비)",
      action: { label: "클럽 운영 보기", href: "/admin/clubs" },
    });

    expect(buildAnalyticsKpiDecisionView(card({
      availability: "NOT_ENOUGH_DATA",
      current: null,
      delta: null,
      deltaDirection: "NONE",
    }))).toMatchObject({
      availability: "데이터 부족",
      value: null,
      comparison: "이전 구간 대비 비교 불가",
    });
  });

  it("formats the aggregate generation time in the operator timezone", () => {
    expect(formatAnalyticsGeneratedAt("2026-05-30T00:00:00Z")).toBe("2026. 05. 30. 09:00 기준");
    expect(formatAnalyticsGeneratedAt("not-a-time")).toBe("집계 시각 확인 필요");
  });

  it("keeps zero values distinct from unavailable values", () => {
    const overview: AdminAnalyticsOverview = {
      schema: "admin.analytics_overview.v2",
      generatedAt: "2026-05-30T00:00:00Z",
      window: "30d",
      kpis: [card({ key: "SESSION_COMPLETION", unit: "PERCENT", current: 0, prior: 0, delta: 0 })],
      clubBenchmark: {
        availability: "AVAILABLE",
        rows: [
          {
            clubId: "club-1",
            slug: "fiction",
            name: "Fiction Club",
            activeMembers: 8,
            sessionCompletionRate: 75,
            rsvpRate: 90,
            aiCostUsd: "1.0000",
            notificationDeliveryRate: 95,
          },
        ],
      },
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

    expect(formatKpiValue(overview.kpis[0])).toBe("0%");
    expect(formatKpiValue(card({ availability: "MEASUREMENT_UNAVAILABLE", current: null }))).toBe("측정 불가");
  });
});
