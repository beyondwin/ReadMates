import { z } from "zod";

export const AdminAnalyticsOverviewSchema = import.meta.env.DEV
  ? z.object({
      schema: z.literal("admin.analytics_overview.v2"),
      generatedAt: z.string(),
      window: z.enum(["7d", "30d", "90d"]),
      kpis: z.array(
        z.object({
          key: z.enum([
            "ACTIVE_MEMBERS",
            "SESSION_COMPLETION",
            "RSVP_RATE",
            "AI_COST_PER_SESSION",
            "NOTIFICATION_DELIVERY",
          ]),
          unit: z.enum(["COUNT", "PERCENT", "USD"]),
          availability: z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]),
          current: z.number().nullable(),
          prior: z.number().nullable(),
          deltaDirection: z.enum(["UP", "DOWN", "FLAT", "NONE"]),
        }),
      ),
      clubBenchmark: z.object({
        availability: z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]),
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
      }),
      series: z.array(
        z.object({
          key: z.enum([
            "ACTIVE_MEMBERS",
            "SESSION_COMPLETION",
            "RSVP_RATE",
            "AI_COST_PER_SESSION",
            "NOTIFICATION_DELIVERY",
          ]),
          unit: z.enum(["COUNT", "PERCENT", "USD"]),
          points: z.array(
            z.object({
              bucketStart: z.string(),
              availability: z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]),
              value: z.number().nullable(),
            }),
          ),
        }),
      ),
    })
  : (null as never);
