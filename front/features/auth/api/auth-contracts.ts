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

export type InvitationPreviewResponse = {
  invitationType: "EMAIL" | "NAMED_LINK";
  clubSlug: string;
  clubName: string;
  canonicalPath: string;
  email: string | null;
  name: string | null;
  emailHint: string | null;
  status: InvitationStatus;
  expiresAt: string;
  canAccept: boolean;
};

export const InvitationPreviewResponseSchema = z.object({
  invitationType: z.enum(["EMAIL", "NAMED_LINK"]),
  clubSlug: z.string().min(1),
  clubName: z.string().min(1),
  canonicalPath: z.string().regex(/^\/clubs\/[a-z0-9-]+\/invite\/[A-Za-z0-9_-]+$/),
  email: z.string().email().nullable(),
  name: z.string().min(1).nullable(),
  emailHint: z.string().min(1).nullable(),
  status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]),
  expiresAt: z.string().datetime({ offset: true }),
  canAccept: z.boolean(),
}).strict();

export type DevLoginRequest = {
  email: string;
};
import { z } from "zod";
