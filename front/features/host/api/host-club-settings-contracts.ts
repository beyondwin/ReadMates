import { z } from "zod";

const OffsetDateTimeSchema = z.string().datetime({ offset: true });
export const HostClubSettingsSchema = z.object({
  clubId: z.string().min(1), clubSlug: z.string().min(1), name: z.string().min(1).max(120),
  approvalPolicy: z.enum(["INVITE_ONLY", "HOST_APPROVAL"]), defaultTimezone: z.string().min(1).max(64),
  scheduleReminderEnabled: z.boolean(), recordPublicationDefault: z.enum(["HOST_ONLY", "MEMBER", "PUBLIC"]),
  revision: z.number().int().nonnegative(), status: z.enum(["SETUP_REQUIRED", "ACTIVE", "SUSPENDED", "ARCHIVED"]),
}).strict();
const ReceiptSchema = z.object({ receiptId: z.string().min(1), action: z.string().min(1), revision: z.number().int().nonnegative(), replayed: z.boolean() }).strict();
export const HostClubSettingsMutationResultSchema = z.object({ settings: HostClubSettingsSchema, receipt: ReceiptSchema }).strict();
export const HostCoHostMutationResultSchema = z.object({ membershipId: z.string().min(1), role: z.enum(["MEMBER", "HOST"]), revision: z.number().int().nonnegative(), receipt: ReceiptSchema }).strict();
export const HostClubSettingsHistorySchema = z.object({
  items: z.array(z.object({ historyId: z.string().min(1), revision: z.number().int().nonnegative(), action: z.enum(["SETTINGS_UPDATED", "CO_HOST_PROMOTED", "CO_HOST_DEMOTED", "CLUB_ENDED"]), subjectMembershipId: z.string().min(1).nullable(), beforeSettings: z.record(z.string(), z.string().nullable()), afterSettings: z.record(z.string(), z.string().nullable()), occurredAt: OffsetDateTimeSchema }).strict()),
  nextCursor: z.string().min(1).nullable(),
}).strict();
export const HostClubClosePreviewSchema = z.object({
  previewId: z.string().min(1), clubId: z.string().min(1), actorMembershipId: z.string().min(1), clubRevision: z.number().int().nonnegative(),
  effectHash: z.string().regex(/^[a-f0-9]{64}$/), effects: z.object({ clubStatus: z.literal("ARCHIVED"), memberAccess: z.literal("ENDED"), publicRecords: z.literal("UNCHANGED") }).strict(), expiresAt: OffsetDateTimeSchema,
}).strict();
export const HostClubCloseResultSchema = z.object({ receiptId: z.string().min(1), status: z.literal("ARCHIVED"), revision: z.number().int().nonnegative(), replayed: z.boolean() }).strict();

export type HostClubSettings = z.infer<typeof HostClubSettingsSchema>;
export type HostClubSettingsHistory = z.infer<typeof HostClubSettingsHistorySchema>;
export type HostClubClosePreview = z.infer<typeof HostClubClosePreviewSchema>;
export type UpdateHostClubSettingsRequest = Omit<HostClubSettings, "clubId" | "clubSlug" | "revision" | "status"> & { expectedRevision: number; idempotencyKey: string };
