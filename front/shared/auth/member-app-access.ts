import type { AuthJoinedClub, AuthMeResponse } from "@/shared/auth/auth-contracts";

export function canReadMemberContent(auth: AuthMeResponse) {
  return (
    auth.authenticated &&
    (auth.membershipStatus === "VIEWER" || auth.membershipStatus === "ACTIVE" || auth.membershipStatus === "SUSPENDED")
  );
}

export function canWriteMemberActivity(auth: AuthMeResponse) {
  return auth.authenticated && auth.membershipStatus === "ACTIVE" && auth.approvalState === "ACTIVE";
}

export function canUseHostApp(auth: AuthMeResponse) {
  return canWriteMemberActivity(auth) && auth.role === "HOST";
}

export function canUseJoinedClubHostApp(auth: Pick<AuthMeResponse, "authenticated">, club: AuthJoinedClub) {
  return auth.authenticated && club.role === "HOST" && club.status === "ACTIVE" && club.approvalState === "ACTIVE";
}

export function canEditOwnProfile(auth: AuthMeResponse) {
  return canWriteMemberActivity(auth);
}

export function canUseMemberApp(auth: AuthMeResponse) {
  return canReadMemberContent(auth);
}
