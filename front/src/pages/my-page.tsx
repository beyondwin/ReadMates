import { MyPageRoute } from "@/features/archive/route/my-page-route";
import { LogoutButton } from "@/features/auth/route/logout-button";

export default function MyRoutePage() {
  return (
    <MyPageRoute
      logoutControl={
        <LogoutButton className="rm-member-space-logout" redirectHref="/">
          로그아웃
        </LogoutButton>
      }
    />
  );
}
