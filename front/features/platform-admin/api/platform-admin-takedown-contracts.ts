import { z } from "zod";

const UuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const UtcInstantSchema = z.string().datetime({ offset: true }).refine((value) => value.endsWith("Z"));
export const TakedownReasonCategorySchema = z.enum([
  "PRIVATE_DATA",
  "LEGAL_REQUEST",
  "SECURITY_INCIDENT",
  "PUBLIC_SAFETY",
]);

const TakedownTargetSchema = {
  clubId: UuidSchema,
  sessionId: UuidSchema,
  publicationId: UuidSchema,
} as const;

export const TakedownPreviewSchema = z.object({
  schema: z.literal("admin.public_takedown.preview.v1"),
  previewId: UuidSchema,
  expiresAt: UtcInstantSchema,
  ...TakedownTargetSchema,
  targetGeneration: z.number().int().positive(),
  currentSurfaces: z.array(z.string().min(1)),
  confirmEnabled: z.boolean(),
  activationBoundary: z.string().min(1),
  remoteCopyLimitation: z.string().min(1),
}).strict();

export const TakedownReceiptSchema = z.object({
  schema: z.literal("admin.public_takedown.receipt.v1"),
  receiptId: UuidSchema,
  convergenceId: UuidSchema,
  ...TakedownTargetSchema,
  originResult: z.literal("DENIED"),
  committedGeneration: z.number().int().positive(),
  reasonCategory: TakedownReasonCategorySchema,
  reasonRedacted: z.boolean(),
  createdAt: UtcInstantSchema,
  bffEvictionOutcome: z.string().min(1),
  cdnPurgeOutcome: z.string().min(1),
  browserRevalidationOutcome: z.string().min(1),
  remoteCopyLimitation: z.string().min(1),
}).strict();

export type TakedownPreview = z.infer<typeof TakedownPreviewSchema>;
export type TakedownReceipt = z.infer<typeof TakedownReceiptSchema>;
export type TakedownReasonCategory = z.infer<typeof TakedownReasonCategorySchema>;

export type TakedownPreviewRequest = Pick<TakedownPreview, "clubId" | "sessionId" | "publicationId">;
export type ConfirmTakedownRequest = {
  previewId: string;
  reasonCategory: TakedownReasonCategory;
  reason: string;
  idempotencyKey: string;
};

export const parseAdminTakedownPreview = (value: unknown): TakedownPreview => TakedownPreviewSchema.parse(value);
export const parseAdminTakedownReceipt = (value: unknown): TakedownReceipt => TakedownReceiptSchema.parse(value);
