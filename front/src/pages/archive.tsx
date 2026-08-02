import { useRouteLoaderData } from "react-router";
import { ArchiveListRoute } from "@/features/archive/route/archive-list-route";
import type { MemberAppAccess } from "@/shared/auth/member-app-loader";
import { readSurfaceCapabilitiesForAuth } from "@/shared/model/read-surface-capabilities";
import { useAuth } from "@/src/app/auth-state";

export default function ArchiveRoutePage() {
  const authState = useAuth();
  const scopedMemberAccess = useRouteLoaderData("club-app") as MemberAppAccess | undefined;
  const currentAuth = scopedMemberAccess?.auth ?? (authState.status === "ready" ? authState.auth : null);
  const reviewAuthorName = currentAuth?.displayName ?? null;
  const capabilities = readSurfaceCapabilitiesForAuth({
    membershipStatus: currentAuth?.membershipStatus ?? null,
    approvalState: currentAuth?.approvalState ?? null,
  });

  return <ArchiveListRoute capabilities={capabilities} reviewAuthorName={reviewAuthorName} />;
}
