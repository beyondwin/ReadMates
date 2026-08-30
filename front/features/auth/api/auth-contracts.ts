export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type AuthMeResponse = {
  authenticated: boolean;
  userId: string | null;
  membershipId: string | null;
  clubId: string | null;
  email: string | null;
  displayName: string | null;
  accountName: string | null;
  role: MemberRole | null;
  membershipStatus: MembershipStatus | null;
  approvalState: ApprovalState;
  avatarKey?: string | null;
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

const invitationPreviewCommon = {
  clubSlug: z.string().min(1),
  clubName: z.string().min(1),
  status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]),
  expiresAt: z.string().datetime({ offset: true }),
  canAccept: z.boolean(),
};

export const InvitationPreviewResponseSchema = z.discriminatedUnion("invitationType", [
  z.object({
    ...invitationPreviewCommon,
    invitationType: z.literal("EMAIL"),
    canonicalPath: z.string().regex(/^\/clubs\/[a-z0-9-]+\/invite\/(?!lnk_)[A-Za-z0-9_-]+$/),
    email: z.string().email(),
    name: z.string().min(1),
    emailHint: z.string().min(1),
  }).strict(),
  z.object({
    ...invitationPreviewCommon,
    invitationType: z.literal("NAMED_LINK"),
    canonicalPath: z.string().regex(/^\/clubs\/[a-z0-9-]+\/invite\/lnk_[A-Za-z0-9_-]{43}$/),
    email: z.null(),
    name: z.null(),
    emailHint: z.null(),
  }).strict(),
]).superRefine((value, context) => {
  const prefix = `/clubs/${value.clubSlug}/invite/`;
  if (!value.canonicalPath.startsWith(prefix)) {
    context.addIssue({ code: "custom", path: ["canonicalPath"], message: "canonicalPath must match clubSlug" });
  }
});

export type InvitationPreviewResponse = z.infer<typeof InvitationPreviewResponseSchema>;

export type DevLoginRequest = {
  email: string;
};
import { z } from "zod";
