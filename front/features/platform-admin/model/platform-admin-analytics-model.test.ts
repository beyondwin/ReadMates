import { describe, expect, it } from "vitest";
import {
  analyticsWindowFromSearchParams,
  analyticsSearchFromWindow,
  formatKpiValue,
  labelKpi,
  type AdminAnalyticsKpiCard,
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

  it("labels each KPI in Korean", () => {
    expect(labelKpi("NOTIFICATION_DELIVERY")).toBe("알림 도달률");
  });
});
