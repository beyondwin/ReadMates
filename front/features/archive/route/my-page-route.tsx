import type { ReactNode } from "react";
import { useLoaderData } from "react-router-dom";
import { buildParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";

export function MyPageRoute({ logoutControl }: { logoutControl: ReactNode }) {
  const { profile, journey } = useLoaderData() as MyPageRouteData;
  const viewModel = buildParticipationJourneyViewModel({
    profile,
    summary: journey.summary,
    today: new Date(),
  });

  return (
    <MyPage
      viewModel={viewModel}
      logoutControl={logoutControl}
    />
  );
}
