import { LogoutButton } from "@/features/auth/route/logout-button";
import { MyPageRoute } from "@/features/archive/route/my-page-route";
import { useAuthActions } from "@/src/app/auth-state";
import type { LogoutControlComponent } from "@/features/archive/ui/my-page";

const MyPageLogoutButton: LogoutControlComponent = (props) => {
  const { markLoggedOut } = useAuthActions();

  return <LogoutButton {...props} onLoggedOut={markLoggedOut} />;
};

export default function MyRoutePage() {
  return <MyPageRoute LogoutButtonComponent={MyPageLogoutButton} />;
}
