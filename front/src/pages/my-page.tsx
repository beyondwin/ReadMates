import { MyPageRoute } from "@/features/archive/route/my-page-route";
import { useAuth, useAuthActions } from "@/src/app/auth-state";
import { canEditOwnProfile } from "@/shared/auth/member-app-access";

export default function MyRoutePage() {
  const authState = useAuth();
  const { refreshAuth } = useAuthActions();
  const canEditProfile = authState.status === "ready" && canEditOwnProfile(authState.auth);

  return <MyPageRoute canEditProfile={canEditProfile} onProfileUpdated={refreshAuth} />;
}
