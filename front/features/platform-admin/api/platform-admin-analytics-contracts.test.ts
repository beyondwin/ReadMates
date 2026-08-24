import { describe, expect, it } from "vitest";

const validOverview = {
  schema: "admin.analytics_overview.v2",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    {
      key: "SESSION_COMPLETION",
      label: "모임 완료율",
      definition: "완료된 모임 비율",
      unit: "PERCENT",
      availability: "AVAILABLE",
      current: 80,
      prior: 60,
      delta: 20,
      deltaDirection: "UP",
    },
  ],
  clubBenchmark: {
    availability: "AVAILABLE",
    rows: [
      {
        clubId: "club-1",
        slug: "reading-sai",
        name: "Reading Sai",
        activeMembers: 6,
        sessionCompletionRate: 83,
        rsvpRate: 75,
        aiCostUsd: "1.2500",
        notificationDeliveryRate: 96,
      },
    ],
  },
  series: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      points: [{ bucketStart: "2026-05-01", availability: "AVAILABLE", value: 80 }],
    },
  ],
};

describe("platform-admin analytics zod parser", () => {
  it("parses a valid analytics overview", async () => {
    const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");

    expect(parseAdminAnalyticsOverview(validOverview)).toMatchObject({
      schema: "admin.analytics_overview.v2",
      kpis: [{ key: "SESSION_COMPLETION" }],
    });
  });

  it("normalizes an older overview payload without KPI series", async () => {
    const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");
    const legacyKpi = { ...validOverview.kpis[0] };
    delete (legacyKpi as Partial<typeof legacyKpi>).label;
    delete (legacyKpi as Partial<typeof legacyKpi>).definition;
    delete (legacyKpi as Partial<typeof legacyKpi>).delta;
    const legacyPayload = {
      ...validOverview,
      schema: "admin.analytics_overview.v1",
      kpis: [legacyKpi],
    };
    delete (legacyPayload as { series?: unknown }).series;

    expect(parseAdminAnalyticsOverview(legacyPayload)).toMatchObject({
      schema: "admin.analytics_overview.v2",
      series: [],
      kpis: [{ key: "SESSION_COMPLETION", label: "모임 완료율", definition: "", delta: null, deltaDirection: "NONE" }],
    });
  });

  it("normalizes additive KPI fields missing during a v2 deployment skew", async () => {
    const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");
    const skewedKpi = { ...validOverview.kpis[0] };
    delete (skewedKpi as Partial<typeof skewedKpi>).label;
    delete (skewedKpi as Partial<typeof skewedKpi>).definition;
    delete (skewedKpi as Partial<typeof skewedKpi>).delta;

    expect(parseAdminAnalyticsOverview({ ...validOverview, kpis: [skewedKpi] })).toMatchObject({
      schema: "admin.analytics_overview.v2",
      kpis: [{ key: "SESSION_COMPLETION", label: "모임 완료율", definition: "", delta: null, deltaDirection: "NONE" }],
    });
  });

  it("throws when a nested KPI delta direction is missing", async () => {
    const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");
    const invalid = {
      ...validOverview,
      kpis: [{ ...validOverview.kpis[0], deltaDirection: undefined }],
    };

    expect(() => parseAdminAnalyticsOverview(invalid)).toThrow();
  });
});
