import { useCallback, useState } from "react";
import type { MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import { useUpdateMyAvatarMutation, useUpdateMyProfileMutation } from "@/features/archive/queries/profile-queries";
import { isReadmatesApiError } from "@/shared/api/errors";

type ProfileUpdateControllerInput = {
  sourceProfile: MyPageResponse;
  canEditProfile: boolean;
  clubSlug?: string | null;
  onProfileUpdated: () => Promise<void>;
  onRevalidate: () => void;
};

type SavedFieldOverride = {
  source: string;
  saved: string;
  generation: number;
  staleRevalidationSources: Array<{
    value: string;
    generation: number;
  }>;
};

function savedFieldOverrideIsCurrent(override: SavedFieldOverride | null, source: string) {
  return (
    override !== null &&
    (source === override.source ||
      source === override.saved ||
      override.staleRevalidationSources.some(
        (candidate) => candidate.value === source && candidate.generation < override.generation,
      ))
  );
}

function nextSavedFieldOverride(
  current: SavedFieldOverride | null,
  source: string,
  saved: string,
): SavedFieldOverride {
  return {
    source,
    saved,
    generation: (current?.generation ?? 0) + 1,
    staleRevalidationSources: current
      ? [
          ...current.staleRevalidationSources,
          { value: current.saved, generation: current.generation },
        ]
      : [],
  };
}

function profileUpdateErrorMessage(error: unknown) {
  return profileSaveErrorMessage(isReadmatesApiError(error) ? error.code : null);
}

export function useProfileUpdateController({
  sourceProfile,
  canEditProfile,
  clubSlug,
  onProfileUpdated,
  onRevalidate,
}: ProfileUpdateControllerInput): {
  profile: MyPageResponse;
  updateProfile: (displayName: string) => Promise<MemberProfileResponse>;
  updateAvatar: (avatarKey: string) => Promise<MemberProfileResponse>;
} {
  const { mutateAsync: updateMyProfile } = useUpdateMyProfileMutation();
  const { mutateAsync: updateMyAvatar } = useUpdateMyAvatarMutation(clubSlug ? { clubSlug } : undefined);
  const [displayNameOverride, setDisplayNameOverride] = useState<SavedFieldOverride | null>(null);
  const [avatarKeyOverride, setAvatarKeyOverride] = useState<SavedFieldOverride | null>(null);
  const displayNameOverrideIsCurrent = savedFieldOverrideIsCurrent(displayNameOverride, sourceProfile.displayName);
  const avatarKeyOverrideIsCurrent = savedFieldOverrideIsCurrent(avatarKeyOverride, sourceProfile.avatarKey);

  if (displayNameOverride && !displayNameOverrideIsCurrent) {
    setDisplayNameOverride(null);
  }
  if (avatarKeyOverride && !avatarKeyOverrideIsCurrent) {
    setAvatarKeyOverride(null);
  }
  const profile: MyPageResponse = {
    ...sourceProfile,
    displayName: displayNameOverrideIsCurrent ? displayNameOverride.saved : sourceProfile.displayName,
    avatarKey: avatarKeyOverrideIsCurrent ? avatarKeyOverride.saved : sourceProfile.avatarKey,
  };

  const updateProfile = useCallback(
    async (displayName: string): Promise<MemberProfileResponse> => {
      if (!canEditProfile) {
        throw new Error(profileSaveErrorMessage("MEMBERSHIP_NOT_ALLOWED"));
      }

      try {
        const updatedProfile = await updateMyProfile(displayName);
        await onProfileUpdated();
        setDisplayNameOverride((current) =>
          nextSavedFieldOverride(current, sourceProfile.displayName, updatedProfile.displayName),
        );
        onRevalidate();
        return updatedProfile;
      } catch (error) {
        throw new Error(profileUpdateErrorMessage(error), { cause: error });
      }
    },
    [canEditProfile, onProfileUpdated, onRevalidate, sourceProfile.displayName, updateMyProfile],
  );

  const updateAvatar = useCallback(
    async (avatarKey: string): Promise<MemberProfileResponse> => {
      if (!canEditProfile) {
        throw new Error(profileSaveErrorMessage("MEMBERSHIP_NOT_ALLOWED"));
      }

      try {
        const updatedProfile = await updateMyAvatar(avatarKey);
        await onProfileUpdated();
        setAvatarKeyOverride((current) =>
          nextSavedFieldOverride(current, sourceProfile.avatarKey, updatedProfile.avatarKey),
        );
        onRevalidate();
        return updatedProfile;
      } catch (error) {
        throw new Error(profileUpdateErrorMessage(error), { cause: error });
      }
    },
    [canEditProfile, onProfileUpdated, onRevalidate, sourceProfile.avatarKey, updateMyAvatar],
  );

  return { profile, updateProfile, updateAvatar };
}
