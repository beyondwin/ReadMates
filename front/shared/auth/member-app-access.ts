import type { AuthMeResponse } from "@/shared/api/readmates";

export function canUseMemberApp(auth: AuthMeResponse) {
  return auth.approvalState === "VIEWER" || auth.approvalState === "ACTIVE" || auth.approvalState === "SUSPENDED";
}
