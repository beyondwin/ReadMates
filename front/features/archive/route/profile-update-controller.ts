import { useCallback, useState } from "react";
import { updateMyProfile } from "@/features/archive/api/archive-api";
import type { MemberProfileErrorCode, MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";

type ProfileUpdateControllerInput = {
  sourceProfile: MyPageResponse;
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
  onRevalidate: () => void;
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

export function useProfileUpdateController({
  sourceProfile,
  canEditProfile,
  onProfileUpdated,
  onRevalidate,
}: ProfileUpdateControllerInput): {
  profile: MyPageResponse;
  updateProfile: (displayName: string) => Promise<MemberProfileResponse>;
} {
  const [profileOverrideState, setProfileOverrideState] = useState<{
    sourceDisplayName: string;
    profile: MemberProfileResponse;
  } | null>(null);
  const profileOverride =
    profileOverrideState &&
    (sourceProfile.displayName === profileOverrideState.sourceDisplayName ||
      sourceProfile.displayName === profileOverrideState.profile.displayName)
      ? profileOverrideState.profile
      : null;
  const profile = profileOverride ? { ...sourceProfile, ...profileOverride } : sourceProfile;

  const updateProfile = useCallback(
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
      setProfileOverrideState({ sourceDisplayName: sourceProfile.displayName, profile: updatedProfile });
      onRevalidate();
      return updatedProfile;
    },
    [canEditProfile, onProfileUpdated, onRevalidate, sourceProfile],
  );

  return { profile, updateProfile };
}
