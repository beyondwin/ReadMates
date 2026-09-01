import { z } from "zod";

const OffsetDateTimeSchema = z.string().datetime({ offset: true });
const SafeCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
export const HostWorkboxCursorSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  "workbox cursor must contain a non-whitespace byte",
);

export const HostWorkboxStateSchema = z.enum(["NOW", "DEFERRED", "COMPLETED"]);
export const HostWorkItemTypeSchema = z.enum([
  "SCHEDULE_UNSEEN",
  "MEMBER_APPROVAL",
  "RECORD_CLOSING",
  "INVITATION_EXPIRY",
  "NOTIFICATION_FAILURE",
]);

export type HostWorkboxState = z.infer<typeof HostWorkboxStateSchema>;
export type HostWorkItemType = z.infer<typeof HostWorkItemTypeSchema>;

const FAILURE_CODE_BY_TYPE = {
  SCHEDULE_UNSEEN: "SCHEDULE_SOURCE_UNAVAILABLE",
  MEMBER_APPROVAL: "MEMBER_SOURCE_UNAVAILABLE",
  RECORD_CLOSING: "RECORD_SOURCE_UNAVAILABLE",
  INVITATION_EXPIRY: "INVITATION_SOURCE_UNAVAILABLE",
  NOTIFICATION_FAILURE: "NOTIFICATION_SOURCE_UNAVAILABLE",
} as const satisfies Record<HostWorkItemType, string>;

export type HostWorkSourceFailureCode = (typeof FAILURE_CODE_BY_TYPE)[HostWorkItemType];

function availableSource<T extends HostWorkItemType>(type: T) {
  return z.object({
    type: z.literal(type),
    state: z.literal("AVAILABLE"),
    failureCode: z.null().optional(),
  }).strict();
}

function unavailableSource<T extends HostWorkItemType>(type: T) {
  return z.object({
    type: z.literal(type),
    state: z.literal("UNAVAILABLE"),
    failureCode: z.literal(FAILURE_CODE_BY_TYPE[type]),
  }).strict();
}

export const HostWorkSourceAvailabilitySchema = z.union([
  availableSource("SCHEDULE_UNSEEN"),
  unavailableSource("SCHEDULE_UNSEEN"),
  availableSource("MEMBER_APPROVAL"),
  unavailableSource("MEMBER_APPROVAL"),
  availableSource("RECORD_CLOSING"),
  unavailableSource("RECORD_CLOSING"),
  availableSource("INVITATION_EXPIRY"),
  unavailableSource("INVITATION_EXPIRY"),
  availableSource("NOTIFICATION_FAILURE"),
  unavailableSource("NOTIFICATION_FAILURE"),
]);

export const HostWorkboxReceiptSummarySchema = z.object({
  operation: SafeCodeSchema,
  outcome: SafeCodeSchema,
  affectedCount: z.number().int().nonnegative().nullable(),
}).strict();

function safeAppRelativeDestination(value: string): boolean {
  if (!value.startsWith("/app/") || value.includes("://") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, "https://readmates.local");
    return parsed.origin === "https://readmates.local" && parsed.pathname.startsWith("/app/");
  } catch {
    return false;
  }
}

export const HostWorkboxItemSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[\x21-\x7e]+$/),
  type: HostWorkItemTypeSchema,
  state: HostWorkboxStateSchema,
  title: z.string().min(1).refine((value) => value.trim().length > 0),
  description: z.string().min(1).refine((value) => value.trim().length > 0),
  count: z.number().int().nonnegative(),
  dueAt: OffsetDateTimeSchema.nullable(),
  deferredUntil: OffsetDateTimeSchema.nullable(),
  resolvedAt: OffsetDateTimeSchema.nullable(),
  destinationHref: z.string().refine(safeAppRelativeDestination, "unsafe workbox destination"),
  receiptSummary: HostWorkboxReceiptSummarySchema.nullable(),
}).strict().superRefine((item, context) => {
  if (!item.key.startsWith(`${item.type}:`)) {
    context.addIssue({ code: "custom", path: ["key"], message: "workbox key type mismatch" });
  }
  const validLifecycle = item.state === "NOW"
    ? item.deferredUntil === null && item.resolvedAt === null
    : item.state === "DEFERRED"
      ? item.deferredUntil !== null && item.resolvedAt === null
      : item.deferredUntil === null && item.resolvedAt !== null;
  if (!validLifecycle) {
    context.addIssue({
      code: "custom",
      path: ["state"],
      message: "workbox state and lifecycle timestamps disagree",
    });
  }
});

export const HostWorkboxPageSchema = z.object({
  state: HostWorkboxStateSchema,
  evaluatedAt: OffsetDateTimeSchema,
  sourceAvailability: z.array(HostWorkSourceAvailabilitySchema).length(5),
  items: z.array(HostWorkboxItemSchema),
  nextCursor: HostWorkboxCursorSchema.nullable(),
}).strict().superRefine((page, context) => {
  const types = page.sourceAvailability.map(({ type }) => type);
  if (new Set(types).size !== 5 || !HostWorkItemTypeSchema.options.every((type) => types.includes(type))) {
    context.addIssue({
      code: "custom",
      path: ["sourceAvailability"],
      message: "workbox source inventory must contain each source exactly once",
    });
  }
  page.items.forEach((item, index) => {
    if (item.state !== page.state) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "state"],
        message: "workbox item state must match page state",
      });
    }
  });
});

export const HostWorkboxDeferralRequestSchema = z.object({
  deferredUntil: OffsetDateTimeSchema,
}).strict();

export const HostWorkboxDeferralReceiptSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[\x21-\x7e]+$/),
  deferredUntil: OffsetDateTimeSchema,
}).strict();

export type HostWorkSourceAvailability = z.infer<typeof HostWorkSourceAvailabilitySchema>;
export type HostWorkboxReceiptSummary = z.infer<typeof HostWorkboxReceiptSummarySchema>;
export type HostWorkboxItem = z.infer<typeof HostWorkboxItemSchema>;
export type HostWorkboxPage = z.infer<typeof HostWorkboxPageSchema>;
export type HostWorkboxDeferralRequest = z.infer<typeof HostWorkboxDeferralRequestSchema>;
export type HostWorkboxDeferralReceipt = z.infer<typeof HostWorkboxDeferralReceiptSchema>;

export function parseHostWorkboxPage(value: unknown): HostWorkboxPage {
  return HostWorkboxPageSchema.parse(value);
}

export function parseHostWorkboxDeferralReceipt(value: unknown): HostWorkboxDeferralReceipt {
  return HostWorkboxDeferralReceiptSchema.parse(value);
}

export function parseOptionalHostWorkboxCursor(value: string | null | undefined): string | null {
  return value == null ? null : HostWorkboxCursorSchema.parse(value);
}
