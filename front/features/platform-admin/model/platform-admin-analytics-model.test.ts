import { describe, expect, it } from "vitest";
import {
  analyticsCsvFilename,
  analyticsSearchFromWindow,
  analyticsWindowFromSearchParams,
  buildAnalyticsCsv,
  formatAvailabilityLabel,
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
    deltaDirection: "UP",
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

  it("formats measurement unavailable separately from not enough data", () => {
    expect(formatAvailabilityLabel("NOT_ENOUGH_DATA")).toBe("데이터 부족");
    expect(formatAvailabilityLabel("MEASUREMENT_UNAVAILABLE")).toBe("측정 불가");
    expect(formatKpiValue(card({ availability: "MEASUREMENT_UNAVAILABLE", current: null }))).toBe("측정 불가");
  });

  it("labels each KPI in Korean", () => {
    expect(labelKpi("NOTIFICATION_DELIVERY")).toBe("알림 도달률");
  });

  it("formats trend point values and keeps unavailable buckets honest", () => {
    expect(formatSeriesPointValue({ bucketStart: "2026-05-01", availability: "NOT_ENOUGH_DATA", value: null }, "PERCENT"))
      .toBe("데이터 부족");
    expect(formatSeriesPointValue({ bucketStart: "2026-05-08", availability: "AVAILABLE", value: 75 }, "PERCENT"))
      .toBe("75%");
    expect(formatSeriesPointValue({ bucketStart: "2026-05-08", availability: "AVAILABLE", value: 0.5 }, "USD"))
      .toBe("$0.5000");
  });

  it("builds a CSV export from KPI series and club benchmark rows", () => {
    const overview: AdminAnalyticsOverview = {
      schema: "admin.analytics_overview.v2",
      generatedAt: "2026-05-30T00:00:00Z",
      window: "30d",
      kpis: [card({ key: "SESSION_COMPLETION", unit: "PERCENT", current: 80, prior: 50 })],
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

    const csv = buildAnalyticsCsv(overview);

    expect(csv).toContain("section,window,kpi,bucketStart,value,availability,clubSlug,clubName");
    expect(csv).toContain("series,30d,세션 완료율,2026-05-01,75%,AVAILABLE,,");
    expect(csv).toContain("series,30d,세션 완료율,2026-05-08,데이터 부족,NOT_ENOUGH_DATA,,");
    expect(csv).toContain("benchmark,30d,,,,AVAILABLE,fiction,Fiction Club");
    expect(analyticsCsvFilename(overview)).toBe("readmates-admin-analytics-30d-2026-05-30.csv");
  });
});
