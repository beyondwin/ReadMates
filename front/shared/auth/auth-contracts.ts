export type MemberRole = "HOST" | "MEMBER";
export type MembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type ProductSpaceKind = "PLATFORM" | "CLUBS";
export type ClubPerspective = "MEMBER" | "HOST";

export type AvailableClubSpaceV1 = {
  clubId: string;
  clubSlug: string;
  clubName: string;
  perspectives: ClubPerspective[];
};

export type AvailableSpacesV1 = {
  version: 1;
  kinds: ProductSpaceKind[];
  clubs: AvailableClubSpaceV1[];
};

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
  currentMembership?: AuthCurrentMembership | null;
  joinedClubs?: AuthJoinedClub[];
  platformAdmin?: AuthPlatformAdmin | null;
  recommendedAppEntryUrl?: string | null;
  availableSpaces?: AvailableSpacesV1;
};

export type AuthCurrentMembership = {
  membershipId: string;
  clubId: string;
  clubSlug: string;
  displayName: string;
  role: MemberRole;
  membershipStatus: MembershipStatus;
  approvalState: ApprovalState;
  avatarKey: string;
};

export type AuthJoinedClub = {
  clubId: string;
  clubSlug: string;
  clubName: string;
  membershipId: string;
  role: MemberRole;
  status: MembershipStatus;
  approvalState: ApprovalState;
  primaryHost: string | null;
};

export type AuthPlatformAdmin = {
  userId: string;
  email: string;
  role: string;
};
