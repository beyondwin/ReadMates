import { useLoaderData } from "react-router-dom";
import MemberHome from "@/features/member-home/components/member-home";
import type { MemberHomeRouteData } from "@/features/member-home/route/member-home-data";
import { useAuth } from "@/src/app/auth-state";
import { ReadmatesRouteLoading } from "./readmates-page";

export default function AppHomePage() {
  const authState = useAuth();
  const data = useLoaderData() as MemberHomeRouteData;

  if (authState.status !== "ready") {
    return <ReadmatesRouteLoading label="계정 상태를 확인하는 중" variant="member" />;
  }

  return (
    <MemberHome
      auth={authState.auth}
      current={data.current}
      noteFeedItems={data.noteFeedItems}
      upcomingSessions={data.upcomingSessions}
    />
  );
}
