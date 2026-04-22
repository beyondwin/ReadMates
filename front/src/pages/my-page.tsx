import { LogoutButton } from "@/features/auth/route/logout-button";
import { MyPageRoute } from "@/features/archive/route/my-page-route";

export default function MyRoutePage() {
  return <MyPageRoute LogoutButtonComponent={LogoutButton} />;
}
