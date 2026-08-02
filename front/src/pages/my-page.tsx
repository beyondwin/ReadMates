import { useRouteLoaderData } from "react-router";
import { MyPageRoute } from "@/features/archive/route/my-page-route";
import type { MemberAppAccess } from "@/shared/auth/member-app-loader";
import { useAuth, useAuthActions } from "@/src/app/auth-state";
import { canEditOwnProfile } from "@/shared/auth/member-app-access";

export default function MyRoutePage() {
  const authState = useAuth();
  const scopedMemberAccess = useRouteLoaderData("club-app") as MemberAppAccess | undefined;
  const { refreshAuth } = useAuthActions();
  const profileAuth = scopedMemberAccess?.auth ?? (authState.status === "ready" ? authState.auth : null);
  const clubSlug = profileAuth?.currentMembership?.clubSlug ?? null;
  const canEditProfile = clubSlug !== null && profileAuth !== null && canEditOwnProfile(profileAuth);

  return <MyPageRoute canEditProfile={canEditProfile} clubSlug={clubSlug} onProfileUpdated={refreshAuth} />;
}
