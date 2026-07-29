import { useLoaderData, useRevalidator } from "react-router-dom";
import { leaveMembership } from "@/features/archive/api/archive-api";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsPage } from "@/features/archive/ui/account-settings-page";
import { useProfileUpdateController } from "./profile-update-controller";

export type AccountSettingsRouteProps = {
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
};

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function AccountSettingsRoute({ canEditProfile, onProfileUpdated }: AccountSettingsRouteProps) {
  const data = useLoaderData() as MyPageResponse;
  const revalidator = useRevalidator();
  const { profile, updateProfile } = useProfileUpdateController({
    sourceProfile: data,
    canEditProfile,
    onProfileUpdated,
    onRevalidate: revalidator.revalidate,
  });

  return (
    <AccountSettingsPage
      data={profile}
      canEditProfile={canEditProfile}
      onUpdateProfile={updateProfile}
      onLeaveMembership={submitLeaveMembership}
    />
  );
}
