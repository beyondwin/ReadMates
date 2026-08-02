import { useLoaderData, useLocation, useRevalidator } from "react-router-dom";
import {
  buildMemberSpaceViewModel,
  buildRecentReadingPreview,
} from "@/features/archive/model/my-reading-shelf-model";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { useProfileUpdateController } from "./profile-update-controller";

export type MyPageRouteProps = {
  canEditProfile: boolean;
  clubSlug: string | null;
  onProfileUpdated: () => Promise<void>;
};

export function MyPageRoute({ canEditProfile, clubSlug, onProfileUpdated }: MyPageRouteProps) {
  const { profile: sourceProfile, journey } = useLoaderData() as MyPageRouteData;
  const location = useLocation();
  const revalidator = useRevalidator();
  const { profile, saveProfile } = useProfileUpdateController({
    sourceProfile,
    canEditProfile,
    clubSlug,
    onProfileUpdated,
    onRevalidate: revalidator.revalidate,
  });
  const viewModel = buildMemberSpaceViewModel({
    profile,
    summary: journey.summary,
    today: new Date(),
  });
  const scopedHref = (target: string) =>
    scopedAppLinkTarget(location.pathname, target);
  const recentReadings = buildRecentReadingPreview(journey.items).map((item) => ({
    ...item,
    href: scopedHref(
      `/app/sessions/${encodeURIComponent(item.sessionId)}`,
    ),
  }));

  return (
    <MyPage
      profile={profile}
      viewModel={viewModel}
      recentReadings={recentReadings}
      canEditProfile={canEditProfile}
      notificationsHref={scopedHref("/app/notifications")}
      settingsHref={scopedHref("/app/me/settings")}
      archiveSessionsHref={scopedHref("/app/archive?view=sessions")}
      onSaveProfile={saveProfile}
    />
  );
}
