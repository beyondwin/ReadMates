import type { AuthMeResponse } from "@/features/auth/api/auth-contracts";
import { AuthRouteLoading } from "@/features/auth/ui/auth-route-loading";
import { PendingApprovalPage } from "@/features/auth/ui/pending-approval-page";

export type PendingApprovalAuthState =
  | { status: "loading" }
  | { status: "ready"; auth: AuthMeResponse };

export function PendingApprovalRoute({ state }: { state: PendingApprovalAuthState }) {
  if (state.status === "loading") {
    return <AuthRouteLoading label="계정 승인 상태를 확인하는 중" />;
  }

  return <PendingApprovalPage auth={state.auth} />;
}
