import { z } from "zod";
import type {
  AdminAnalyticsKpiSeries,
  AdminAnalyticsOverview,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

const KpiKeySchema = z.enum([
  "ACTIVE_MEMBERS",
  "SESSION_COMPLETION",
  "RSVP_RATE",
  "AI_COST_PER_SESSION",
  "NOTIFICATION_DELIVERY",
]);

const UnitSchema = z.enum(["COUNT", "PERCENT", "USD"]);
const AvailabilitySchema = z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]);

const KpiSchema = z.object({
  key: KpiKeySchema,
  unit: UnitSchema,
  availability: AvailabilitySchema,
  current: z.number().nullable(),
  prior: z.number().nullable(),
  deltaDirection: z.enum(["UP", "DOWN", "FLAT", "NONE"]),
});

const BenchmarkSchema = z.object({
  availability: AvailabilitySchema,
  rows: z.array(
    z.object({
      clubId: z.string(),
      slug: z.string(),
      name: z.string(),
      activeMembers: z.number(),
      sessionCompletionRate: z.number().nullable(),
      rsvpRate: z.number().nullable(),
      aiCostUsd: z.string(),
      notificationDeliveryRate: z.number().nullable(),
    }),
  ),
});

const SeriesSchema = z.array(
  z.object({
    key: KpiKeySchema,
    unit: UnitSchema,
    points: z.array(
      z.object({
        bucketStart: z.string(),
        availability: AvailabilitySchema,
        value: z.number().nullable(),
      }),
    ),
  }),
);

export const AdminAnalyticsWireOverviewSchema = import.meta.env.DEV
  ? z.object({
      schema: z.enum(["admin.analytics_overview.v1", "admin.analytics_overview.v2"]),
      generatedAt: z.string(),
      window: z.enum(["7d", "30d", "90d"]),
      kpis: z.array(KpiSchema),
      clubBenchmark: BenchmarkSchema,
      series: SeriesSchema.optional().default([]),
    })
  : (null as never);

type AdminAnalyticsWireOverview = Omit<AdminAnalyticsOverview, "schema" | "series"> & {
  schema: "admin.analytics_overview.v1" | "admin.analytics_overview.v2";
  series?: AdminAnalyticsKpiSeries[];
};

function normalizeAdminAnalyticsOverview(value: AdminAnalyticsWireOverview): AdminAnalyticsOverview {
  return {
    ...value,
    schema: "admin.analytics_overview.v2",
    series: Array.isArray(value.series) ? value.series : [],
  };
}

export function parseAdminAnalyticsOverview(value: unknown): AdminAnalyticsOverview {
  if (import.meta.env.DEV) {
    return normalizeAdminAnalyticsOverview(AdminAnalyticsWireOverviewSchema.parse(value));
  }
  return normalizeAdminAnalyticsOverview(value as AdminAnalyticsWireOverview);
}
