import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMyProfile } from "@/features/archive/api/archive-api";
import type { MemberProfileResponse } from "@/features/archive/api/archive-contracts";
import type { EditableMemberProfile } from "@/features/archive/model/profile-update";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import { archiveKeys } from "./archive-queries";

async function updatedProfileFromResponse(response: Response): Promise<MemberProfileResponse> {
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return response.json() as Promise<MemberProfileResponse>;
}

export function useUpdateMyProfileMutation(context?: ReadmatesApiContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: EditableMemberProfile) =>
      updatedProfileFromResponse(await updateMyProfile(profile, context)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: archiveKeys.all }),
  });
}
