import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export function canUseMemberApp(auth: AuthMeResponse) {
  return auth.approvalState === "VIEWER" || auth.approvalState === "ACTIVE" || auth.approvalState === "SUSPENDED";
}
