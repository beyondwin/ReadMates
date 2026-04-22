import { useLoaderData } from "react-router-dom";
import { leaveMembership } from "@/features/archive/api/archive-api";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import type { LogoutControlComponent } from "@/features/archive/ui/my-page";
import MyPage from "@/features/archive/ui/my-page";

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function MyPageRoute({
  LogoutButtonComponent,
}: {
  LogoutButtonComponent: LogoutControlComponent;
}) {
  const data = useLoaderData() as MyPageRouteData;

  return (
    <MyPage
      {...data}
      LogoutButtonComponent={LogoutButtonComponent}
      onLeaveMembership={submitLeaveMembership}
    />
  );
}
