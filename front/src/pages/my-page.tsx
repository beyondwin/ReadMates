import { LogoutButton } from "@/features/auth/components/logout-button";
import { MyPageRoute } from "@/features/archive/route/my-page-route";

export default function MyRoutePage() {
  return <MyPageRoute LogoutButtonComponent={LogoutButton} />;
}
