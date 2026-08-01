import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMyAvatar, updateMyProfile } from "@/features/archive/api/archive-api";
import type { MemberProfileResponse } from "@/features/archive/api/archive-contracts";
import { apiErrorFromResponse } from "@/shared/api/errors";
import { archiveKeys } from "./archive-queries";

async function updatedProfileFromResponse(response: Response): Promise<MemberProfileResponse> {
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return response.json() as Promise<MemberProfileResponse>;
}

export function useUpdateMyProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (displayName: string) => updatedProfileFromResponse(await updateMyProfile(displayName)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: archiveKeys.all }),
  });
}

export function useUpdateMyAvatarMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (avatarKey: string) => updatedProfileFromResponse(await updateMyAvatar(avatarKey)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: archiveKeys.all }),
  });
}
