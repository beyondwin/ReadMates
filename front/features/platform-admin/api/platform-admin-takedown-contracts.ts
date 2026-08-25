import { z } from "zod";

const UuidSchema = z.string().uuid();
const UtcInstantSchema = z.string().datetime({ offset: true }).refine((value) => value.endsWith("Z"));
const LimitationSchema = z.literal("STORED_OR_OFFLINE_COPY_MAY_REMAIN");
const ConvergenceStatusSchema = z.enum(["PENDING", "SUCCEEDED", "FAILED"]);
export const TakedownReasonCategorySchema = z.enum([
  "PRIVACY",
  "SECURITY",
  "LEGAL",
  "CONTENT_POLICY",
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
  limitationCode: LimitationSchema,
}).strict();

export const TakedownReceiptSchema = z.object({
  schema: z.literal("admin.public_takedown.receipt.v1"),
  receiptId: UuidSchema,
  convergenceId: UuidSchema,
  ...TakedownTargetSchema,
  originResult: z.literal("DENIED"),
  committedGeneration: z.number().int().positive(),
  committedClubGeneration: z.number().int().positive(),
  reasonCategory: TakedownReasonCategorySchema,
  createdAt: UtcInstantSchema,
  limitationCode: LimitationSchema,
}).strict();

export const ConvergenceAttemptSchema = z.object({
  attemptNo: z.number().int().positive(),
  status: ConvergenceStatusSchema,
  observedAt: UtcInstantSchema,
  resultCategory: z.enum([
    "PURGED",
    "TEMPORARY_FAILURE",
    "PERMANENT_FAILURE",
    "NOT_CONFIGURED",
  ]).nullable(),
}).strict();

export const TakedownConvergenceSchema = z.object({
  schema: z.literal("admin.public_takedown.convergence.v1"),
  convergenceId: UuidSchema,
  originResult: z.literal("DENIED"),
  committedGeneration: z.number().int().positive(),
  status: ConvergenceStatusSchema,
  lastAttemptAt: UtcInstantSchema.nullable(),
  retryable: z.boolean(),
  attempts: z.array(ConvergenceAttemptSchema),
}).strict().superRefine((value, context) => {
  for (let index = 1; index < value.attempts.length; index += 1) {
    if (value.attempts[index - 1].attemptNo >= value.attempts[index].attemptNo) {
      context.addIssue({ code: "custom", path: ["attempts", index, "attemptNo"], message: "attempts must be ascending and unique" });
    }
  }
});

export type TakedownPreview = z.infer<typeof TakedownPreviewSchema>;
export type TakedownReceipt = z.infer<typeof TakedownReceiptSchema>;
export type ConvergenceAttempt = z.infer<typeof ConvergenceAttemptSchema>;
export type ConvergenceView = z.infer<typeof TakedownConvergenceSchema>;
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
export const parseAdminTakedownConvergence = (value: unknown): ConvergenceView => TakedownConvergenceSchema.parse(value);
