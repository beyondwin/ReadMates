import { useCallback, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { leaveMembership, updateMyProfile } from "@/features/archive/api/archive-api";
import type { MemberProfileErrorCode, MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import { AccountSettingsPage } from "@/features/archive/ui/account-settings-page";

export type AccountSettingsRouteProps = {
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function profileErrorCodeFromResponse(response: Response): Promise<MemberProfileErrorCode | null> {
  try {
    const body: unknown = await response.json();
    const code = isRecord(body) ? body.code : null;

    return typeof code === "string" ? (code as MemberProfileErrorCode) : null;
  } catch {
    return null;
  }
}

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

export function AccountSettingsRoute({ canEditProfile, onProfileUpdated }: AccountSettingsRouteProps) {
  const data = useLoaderData() as MyPageResponse;
  const [profileOverrideState, setProfileOverrideState] = useState<{
    sourceData: MyPageResponse;
    profile: MemberProfileResponse;
  } | null>(null);
  const revalidator = useRevalidator();
  const profileOverride = profileOverrideState?.sourceData === data ? profileOverrideState.profile : null;
  const profile = profileOverride ? { ...data, ...profileOverride } : data;

  const submitProfileUpdate = useCallback(
    async (displayName: string): Promise<MemberProfileResponse> => {
      if (!canEditProfile) {
        throw new Error(profileSaveErrorMessage("MEMBERSHIP_NOT_ALLOWED"));
      }

      const response = await updateMyProfile(displayName);

      if (!response.ok) {
        throw new Error(profileSaveErrorMessage(await profileErrorCodeFromResponse(response)));
      }

      const updatedProfile = await response.json();
      await onProfileUpdated();
      setProfileOverrideState({ sourceData: data, profile: updatedProfile });
      revalidator.revalidate();
      return updatedProfile;
    },
    [canEditProfile, data, onProfileUpdated, revalidator],
  );

  return (
    <AccountSettingsPage
      data={profile}
      canEditProfile={canEditProfile}
      onUpdateProfile={submitProfileUpdate}
      onLeaveMembership={submitLeaveMembership}
    />
  );
}
