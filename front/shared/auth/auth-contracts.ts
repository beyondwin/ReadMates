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
  currentMembership?: AuthCurrentMembership | null;
  joinedClubs?: AuthJoinedClub[];
  platformAdmin?: AuthPlatformAdmin | null;
  recommendedAppEntryUrl?: string | null;
};

export type AuthCurrentMembership = {
  membershipId: string;
  clubId: string;
  clubSlug: string;
  displayName: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  approvalState: ApprovalState;
};

export type AuthJoinedClub = {
  clubId: string;
  clubSlug: string;
  clubName: string;
  membershipId: string;
  role: MemberRole;
  status: MembershipStatus;
  primaryHost: string | null;
};

export type AuthPlatformAdmin = {
  userId: string;
  email: string;
  role: string;
};
