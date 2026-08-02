import { useCallback, useState } from "react";
import type { MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import {
  type EditableMemberProfile,
  profileFailureField,
  ProfileUpdateFailure,
} from "@/features/archive/model/profile-update";
import { useUpdateMyProfileMutation } from "@/features/archive/queries/profile-queries";
import { isReadmatesApiError } from "@/shared/api/errors";
import { normalizeBookClubAvatarKey } from "@/shared/ui/book-club-avatar";

type ProfileUpdateControllerInput = {
  sourceProfile: MyPageResponse;
  canEditProfile: boolean;
  clubSlug?: string | null;
  onProfileUpdated: () => Promise<void>;
  onRevalidate: () => void;
};

type SavedProfileOverride = {
  source: EditableMemberProfile;
  saved: EditableMemberProfile;
  generation: number;
  staleSources: Array<EditableMemberProfile & { generation: number }>;
};

function editableProfile(profile: Pick<MyPageResponse, "displayName" | "avatarKey">): EditableMemberProfile {
  return { displayName: profile.displayName, avatarKey: normalizeBookClubAvatarKey(profile.avatarKey) };
}

function profilesEqual(left: EditableMemberProfile, right: EditableMemberProfile) {
  return left.displayName === right.displayName && left.avatarKey === right.avatarKey;
}

function overrideIsCurrent(override: SavedProfileOverride, source: EditableMemberProfile) {
  return profilesEqual(source, override.source) || override.staleSources.some(
    (candidate) => candidate.generation < override.generation && profilesEqual(source, candidate),
  );
}

export function useProfileUpdateController({
  sourceProfile,
  canEditProfile,
  clubSlug,
  onProfileUpdated,
  onRevalidate,
}: ProfileUpdateControllerInput): {
  profile: MyPageResponse;
  saveProfile: (profile: EditableMemberProfile) => Promise<MemberProfileResponse>;
} {
  const { mutateAsync: updateMyProfile } = useUpdateMyProfileMutation(clubSlug ? { clubSlug } : undefined);
  const [savedState, setSavedState] = useState<{
    clubSlug: string | null | undefined;
    override: SavedProfileOverride;
  } | null>(null);
  const savedOverride = savedState?.clubSlug === clubSlug ? savedState.override : null;
  const source = editableProfile(sourceProfile);

  const sourceIsAuthoritative = savedOverride !== null && profilesEqual(source, savedOverride.saved);
  const overrideCurrent = savedOverride !== null && overrideIsCurrent(savedOverride, source);
  if (savedOverride && (sourceIsAuthoritative || !overrideCurrent)) {
    setSavedState(null);
  }
  const profile = overrideCurrent
    ? { ...sourceProfile, ...savedOverride.saved }
    : sourceProfile;

  const saveProfile = useCallback(async (editable: EditableMemberProfile) => {
    const code = canEditProfile ? null : "MEMBERSHIP_NOT_ALLOWED" as const;
    if (code) {
      throw new ProfileUpdateFailure(profileSaveErrorMessage(code), code, "form");
    }

    try {
      const updated = await updateMyProfile(editable);
      const saved = editableProfile(updated as MyPageResponse);
      await onProfileUpdated();
      setSavedState((currentState) => {
        const current = currentState?.clubSlug === clubSlug ? currentState.override : null;
        return {
          clubSlug,
          override: {
            source: editableProfile(sourceProfile),
            saved,
            generation: (current?.generation ?? 0) + 1,
            staleSources: current
              ? [...current.staleSources, { ...current.saved, generation: current.generation }]
              : [],
          },
        };
      });
      onRevalidate();
      return updated;
    } catch (error) {
      if (error instanceof ProfileUpdateFailure) throw error;
      const errorCode = isReadmatesApiError(error) ? error.code : null;
      throw new ProfileUpdateFailure(
        profileSaveErrorMessage(errorCode),
        errorCode,
        profileFailureField(errorCode),
        { cause: error },
      );
    }
  }, [canEditProfile, clubSlug, onProfileUpdated, onRevalidate, sourceProfile, updateMyProfile]);

  return { profile, saveProfile };
}
