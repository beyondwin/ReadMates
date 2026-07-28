import { AccountSettingsRoute } from "@/features/archive/route/account-settings-route";
import { useAuth, useAuthActions } from "@/src/app/auth-state";
import { canEditOwnProfile } from "@/shared/auth/member-app-access";

export default function AccountSettingsRoutePage() {
  const authState = useAuth();
  const { refreshAuth } = useAuthActions();
  const canEditProfile = authState.status === "ready" && canEditOwnProfile(authState.auth);

  return <AccountSettingsRoute canEditProfile={canEditProfile} onProfileUpdated={refreshAuth} />;
}
