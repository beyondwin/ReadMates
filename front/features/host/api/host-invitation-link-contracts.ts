import { z } from "zod";

const OffsetDateTimeSchema = z.string().datetime({ offset: true });
const ReceiptSchema = z.object({
  receiptId: z.string().min(1), action: z.enum(["CREATED", "UPDATED"]), linkId: z.string().min(1),
  revision: z.number().int().nonnegative(), replayed: z.boolean(),
}).strict();

export const HostInvitationLinkSchema = z.object({
  linkId: z.string().min(1), name: z.string().min(1).max(120),
  status: z.enum(["ACTIVE", "PAUSED", "EXHAUSTED", "EXPIRED"]),
  maxUses: z.number().int().min(1).max(10_000), usedCount: z.number().int().nonnegative(),
  expiresAt: OffsetDateTimeSchema, revision: z.number().int().nonnegative(),
  createdAt: OffsetDateTimeSchema, updatedAt: OffsetDateTimeSchema,
}).strict().refine((value) => value.usedCount <= value.maxUses, "usedCount exceeds maxUses");

export const HostInvitationLinkListSchema = z.object({ items: z.array(HostInvitationLinkSchema), nextCursor: z.string().min(1).nullable() }).strict();
export const HostInvitationLinkCreateResultSchema = z.object({ link: HostInvitationLinkSchema, oneTimeSharePath: z.string().regex(/^\/clubs\/[a-z0-9-]+\/invite\/lnk_[A-Za-z0-9_-]{43}$/).nullable(), receipt: ReceiptSchema }).strict();
export const HostInvitationLinkUpdateResultSchema = z.object({ link: HostInvitationLinkSchema, receipt: ReceiptSchema }).strict();
export const HostInvitationLinkHistorySchema = z.object({
  items: z.array(z.object({
    receiptId: z.string().min(1), revision: z.number().int().nonnegative(), action: z.enum(["CREATED", "UPDATED", "ACCEPTED"]),
    beforeSettings: z.record(z.string(), z.string().nullable()), afterSettings: z.record(z.string(), z.string().nullable()),
    occurredAt: OffsetDateTimeSchema,
  }).strict()), nextCursor: z.string().min(1).nullable(),
}).strict();

export type HostInvitationLink = z.infer<typeof HostInvitationLinkSchema>;
export type HostInvitationLinkList = z.infer<typeof HostInvitationLinkListSchema>;
export type HostInvitationLinkCreateResult = z.infer<typeof HostInvitationLinkCreateResultSchema>;
export type HostInvitationLinkUpdateResult = z.infer<typeof HostInvitationLinkUpdateResultSchema>;
export type HostInvitationLinkHistory = z.infer<typeof HostInvitationLinkHistorySchema>;
export type CreateHostInvitationLinkRequest = { name: string; maxUses: number; expiresAt: string; idempotencyKey: string };
export type UpdateHostInvitationLinkRequest = CreateHostInvitationLinkRequest & { expectedRevision: number; status: HostInvitationLink["status"] };
