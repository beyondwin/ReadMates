import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberProfileErrorCode, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import {
  type EditableMemberProfile,
  type ProfileSaveResult,
  profileFailureField,
  ProfileUpdateFailure,
} from "@/features/archive/model/profile-update";
import { publishUpdatedProfile, useUpdateMyProfileMutation } from "@/features/archive/queries/profile-queries";
import { isReadmatesApiError } from "@/shared/api/errors";
import { normalizeBookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import {
  isTransitionOwnerObsoleteError,
  publishTransitionAction,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";

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
  saveProfile: (profile: EditableMemberProfile) => Promise<ProfileSaveResult>;
} {
  const queryClient = useQueryClient();
  const transitionOwner = useTransitionSafetyOwner("member-profile-update");
  const { mutateAsync: updateMyProfile } = useUpdateMyProfileMutation(clubSlug ? { clubSlug } : undefined);
  const [savedState, setSavedState] = useState<{
    clubSlug: string | null | undefined;
    override: SavedProfileOverride;
  } | null>(null);
  const latestRequestGeneration = useRef(0);
  const savedOverride = savedState && savedState.clubSlug === clubSlug ? savedState.override : null;
  const source = editableProfile(sourceProfile);

  const sourceIsAuthoritative = savedOverride !== null && profilesEqual(source, savedOverride.saved);
  const overrideCurrent = savedOverride !== null && overrideIsCurrent(savedOverride, source);
  const sourceReconcilesWithOverride = sourceIsAuthoritative || overrideCurrent;
  if (savedOverride && !sourceReconcilesWithOverride) {
    setSavedState(null);
  }
  const profile = sourceReconcilesWithOverride
    ? { ...sourceProfile, ...savedOverride.saved }
    : sourceProfile;

  const saveProfile = useCallback(async (editable: EditableMemberProfile): Promise<ProfileSaveResult> => {
    const code = canEditProfile ? null : "MEMBERSHIP_NOT_ALLOWED" as const;
    if (code) {
      throw new ProfileUpdateFailure(profileSaveErrorMessage(code), code, "form");
    }
    const requestGeneration = latestRequestGeneration.current + 1;
    latestRequestGeneration.current = requestGeneration;
    const operationId = `profile-update-${globalThis.crypto.randomUUID()}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));

    try {
      const updated = await updateMyProfile(editable);
      if (await handle.settle("succeeded") !== "accepted") return { status: "obsolete" };
      if (requestGeneration !== latestRequestGeneration.current) return { status: "obsolete" };
      const saved = editableProfile(updated);
      await publishTransitionAction(handle, "cache", () => publishUpdatedProfile(queryClient));
      await publishTransitionAction(handle, "receiptCallback", onProfileUpdated);
      if (requestGeneration !== latestRequestGeneration.current) return { status: "obsolete" };
      await publishTransitionAction(handle, "ui", () => {
        setSavedState((currentState) => {
          const current = currentState && currentState.clubSlug === clubSlug ? currentState.override : null;
          return {
            clubSlug,
            override: {
              source: editableProfile(sourceProfile),
              saved,
              generation: requestGeneration,
              staleSources: current
                ? [...current.staleSources, { ...current.saved, generation: current.generation }]
                : [],
            },
          };
        });
        onRevalidate();
      });
      return { status: "accepted", profile: updated };
    } catch (error) {
      if (isTransitionOwnerObsoleteError(error)) return { status: "obsolete" };
      if (await handle.settle("failed") !== "accepted") return { status: "obsolete" };
      if (error instanceof ProfileUpdateFailure) throw error;
      const errorCode = isReadmatesApiError(error) ? error.code as MemberProfileErrorCode : null;
      throw new ProfileUpdateFailure(
        profileSaveErrorMessage(errorCode),
        errorCode,
        profileFailureField(errorCode),
        { cause: error },
      );
    } finally {
      handle.completePublication();
    }
  }, [canEditProfile, clubSlug, onProfileUpdated, onRevalidate, queryClient, sourceProfile, transitionOwner, updateMyProfile]);

  return { profile, saveProfile };
}
