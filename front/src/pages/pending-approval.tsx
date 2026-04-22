import { useAuth } from "@/src/app/auth-state";
import { PendingApprovalRoute } from "@/features/auth/route/pending-approval-route";

export default function PendingApprovalPage() {
  return <PendingApprovalRoute state={useAuth()} />;
}
