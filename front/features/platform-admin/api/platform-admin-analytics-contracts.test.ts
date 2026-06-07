import { describe, expect, it } from "vitest";

const validOverview = {
  schema: "admin.analytics_overview.v2",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      availability: "AVAILABLE",
      current: 80,
      prior: 60,
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
    const legacyPayload = {
      ...validOverview,
      schema: "admin.analytics_overview.v1",
    };
    delete (legacyPayload as { series?: unknown }).series;

    expect(parseAdminAnalyticsOverview(legacyPayload)).toMatchObject({
      schema: "admin.analytics_overview.v2",
      series: [],
      kpis: [{ key: "SESSION_COMPLETION" }],
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
