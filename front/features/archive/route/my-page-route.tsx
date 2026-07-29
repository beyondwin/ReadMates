import { useLoaderData, useLocation, useRevalidator } from "react-router-dom";
import { buildMemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { useProfileUpdateController } from "./profile-update-controller";

export type MyPageRouteProps = {
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
};

export function MyPageRoute({ canEditProfile, onProfileUpdated }: MyPageRouteProps) {
  const { profile: sourceProfile, journey } = useLoaderData() as MyPageRouteData;
  const location = useLocation();
  const revalidator = useRevalidator();
  const { profile, updateProfile } = useProfileUpdateController({
    sourceProfile,
    canEditProfile,
    onProfileUpdated,
    onRevalidate: revalidator.revalidate,
  });
  const viewModel = buildMemberSpaceViewModel({
    profile,
    summary: journey.summary,
    today: new Date(),
  });

  return (
    <MyPage
      profile={profile}
      viewModel={viewModel}
      canEditProfile={canEditProfile}
      accountSettingsHref={scopedAppLinkTarget(location.pathname, "/app/me/settings")}
      onUpdateProfile={updateProfile}
    />
  );
}
