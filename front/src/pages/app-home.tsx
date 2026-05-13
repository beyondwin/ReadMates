import { useLoaderData } from "react-router-dom";
import { memberHomeViewFromRouteData } from "@/features/member-home/model/member-home-view-model";
import MemberHome from "@/features/member-home/ui/member-home";
import type { MemberHomeRouteData } from "@/features/member-home/route/member-home-data";
import { useAuth } from "@/src/app/auth-state";
import { Link as AppRouterLink } from "@/src/app/router-link";
import { ReadmatesRouteLoading } from "./readmates-page";

export default function AppHomePage() {
  const authState = useAuth();
  const data = useLoaderData() as MemberHomeRouteData;

  if (authState.status !== "ready") {
    return <ReadmatesRouteLoading label="계정 상태를 확인하는 중" variant="member" />;
  }

  const view = memberHomeViewFromRouteData({
    auth: authState.auth,
    current: data.current,
    noteFeedItems: data.noteFeedItems,
    upcomingSessions: data.upcomingSessions,
  });

  return <MemberHome {...view} LinkComponent={AppRouterLink} />;
}
