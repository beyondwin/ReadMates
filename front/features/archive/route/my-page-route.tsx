import { useCallback } from "react";
import { useLoaderData, useRevalidator } from "react-router-dom";
import { leaveMembership, updateMyProfile } from "@/features/archive/api/archive-api";
import type { MemberProfileErrorCode, MemberProfileResponse } from "@/features/archive/api/archive-contracts";
import { profileSaveErrorMessage } from "@/features/archive/model/archive-model";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import type { LogoutControlComponent } from "@/features/archive/ui/my-page";
import MyPage from "@/features/archive/ui/my-page";

async function submitLeaveMembership() {
  const response = await leaveMembership();

  if (!response.ok) {
    throw new Error("Leave membership failed");
  }
}

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

export function MyPageRoute({
  LogoutButtonComponent,
  canEditProfile,
  onProfileUpdated,
}: {
  LogoutButtonComponent: LogoutControlComponent;
  canEditProfile: boolean;
  onProfileUpdated: () => Promise<void>;
}) {
  const data = useLoaderData() as MyPageRouteData;
  const revalidator = useRevalidator();
  const submitProfileUpdate = useCallback(
    async (displayName: string): Promise<MemberProfileResponse> => {
      if (!canEditProfile) {
        throw new Error(profileSaveErrorMessage("MEMBERSHIP_NOT_ALLOWED"));
      }

      const response = await updateMyProfile(displayName);

      if (!response.ok) {
        throw new Error(profileSaveErrorMessage(await profileErrorCodeFromResponse(response)));
      }

      const profile = (await response.json()) as MemberProfileResponse;
      await onProfileUpdated();
      revalidator.revalidate();
      return profile;
    },
    [canEditProfile, onProfileUpdated, revalidator],
  );

  return (
    <MyPage
      {...data}
      LogoutButtonComponent={LogoutButtonComponent}
      onLeaveMembership={submitLeaveMembership}
      canEditProfile={canEditProfile}
      onUpdateProfile={submitProfileUpdate}
    />
  );
}
