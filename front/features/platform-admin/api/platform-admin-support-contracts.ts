import { z } from "zod";

const UuidSchema = z.string().uuid();
const OffsetDateTimeSchema = z.string().datetime({ offset: true });
const UtcInstantSchema = OffsetDateTimeSchema.refine((value) => value.endsWith("Z"));

const SupportGrantScopeSchema = z.enum(["METADATA_READ", "HOST_SUPPORT_READ"]);
const SupportGrantReasonCategorySchema = z.enum([
  "INCIDENT_INVESTIGATION",
  "MEMBER_ASSISTANCE",
  "DATA_CORRECTION",
  "SECURITY_REVIEW",
]);
const SupportGrantImpactCodeSchema = z.enum([
  "SUPPORT_ACCESS_WILL_BECOME_ACTIVE",
  "SUPPORT_ACCESS_WILL_BE_REVOKED",
]);

export const AdminSupportGrantPreviewSchema = z.object({
  previewId: UuidSchema,
  commandType: z.enum(["CREATE", "REVOKE"]),
  grantId: UuidSchema.nullable(),
  clubId: UuidSchema,
  scope: SupportGrantScopeSchema,
  grantExpiresAt: OffsetDateTimeSchema,
  reasonCategory: SupportGrantReasonCategorySchema,
  notePresent: z.boolean(),
  impactCodes: z.array(SupportGrantImpactCodeSchema),
  expiresAt: UtcInstantSchema,
  fingerprintPrefix: z.string().min(1),
}).strict();

export const AdminSupportGrantReceiptSchema = z.object({
  receiptId: UuidSchema,
  previewId: UuidSchema,
  commandType: z.enum(["CREATE", "REVOKE"]),
  grantId: UuidSchema,
  clubId: UuidSchema,
  scope: SupportGrantScopeSchema,
  grantExpiresAt: OffsetDateTimeSchema,
  reasonCategory: SupportGrantReasonCategorySchema,
  notePresent: z.boolean(),
  beforeStatus: z.string().min(1),
  afterStatus: z.string().min(1),
  outcome: z.string().min(1),
  createdAt: UtcInstantSchema,
}).strict();

export type AdminSupportGrantPreviewWire = z.infer<typeof AdminSupportGrantPreviewSchema>;
export type AdminSupportGrantReceiptWire = z.infer<typeof AdminSupportGrantReceiptSchema>;

export const parseAdminSupportGrantPreview = (value: unknown): AdminSupportGrantPreviewWire =>
  AdminSupportGrantPreviewSchema.parse(value);

export const parseAdminSupportGrantReceipt = (value: unknown): AdminSupportGrantReceiptWire =>
  AdminSupportGrantReceiptSchema.parse(value);
