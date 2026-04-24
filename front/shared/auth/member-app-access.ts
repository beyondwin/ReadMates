import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

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

export function canEditOwnProfile(auth: AuthMeResponse) {
  void auth;
  return false;
}

export function canUseMemberApp(auth: AuthMeResponse) {
  return canReadMemberContent(auth);
}
