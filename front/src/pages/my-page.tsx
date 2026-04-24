import { LogoutButton } from "@/features/auth/route/logout-button";
import { MyPageRoute } from "@/features/archive/route/my-page-route";
import { canEditOwnProfile } from "@/shared/auth/member-app-access";
import { useAuth, useAuthActions } from "@/src/app/auth-state";
import type { LogoutControlComponent } from "@/features/archive/ui/my-page";

const MyPageLogoutButton: LogoutControlComponent = (props) => {
  const { markLoggedOut } = useAuthActions();

  return <LogoutButton {...props} onLoggedOut={markLoggedOut} />;
};

export default function MyRoutePage() {
  const authState = useAuth();
  const { refreshAuth } = useAuthActions();
  const canEditProfile = authState.status === "ready" && canEditOwnProfile(authState.auth);

  return (
    <MyPageRoute
      LogoutButtonComponent={MyPageLogoutButton}
      canEditProfile={canEditProfile}
      onProfileUpdated={refreshAuth}
    />
  );
}
