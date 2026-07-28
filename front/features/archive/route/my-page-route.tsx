import { useLoaderData } from "react-router-dom";
import { buildParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";
import { LogoutButton } from "@/features/auth/route/logout-button";

export function MyPageRoute() {
  const { profile, journey } = useLoaderData() as MyPageRouteData;
  const viewModel = buildParticipationJourneyViewModel({
    profile,
    summary: journey.summary,
    today: new Date(),
  });

  return (
    <MyPage
      viewModel={viewModel}
      logoutControl={
        <LogoutButton className="rm-member-space-logout" redirectHref="/">
          로그아웃
        </LogoutButton>
      }
    />
  );
}
