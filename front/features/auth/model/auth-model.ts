export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type AuthMeView = {
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
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type InvitationPreviewView = {
  clubName: string;
  email: string;
  name: string;
  emailHint: string;
  status: InvitationStatus;
  expiresAt: string;
  canAccept: boolean;
};
