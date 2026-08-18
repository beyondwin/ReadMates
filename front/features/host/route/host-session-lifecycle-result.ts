import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import type { HostSessionLifecycleResult } from "@/features/host/model/host-session-lifecycle-model";
import { apiErrorFromResponse } from "@/shared/api/errors";

export async function hostSessionLifecycleResultFromResponse(
  response: Response,
): Promise<HostSessionLifecycleResult> {
  if (response.ok) {
    return {
      ok: true,
      session: await response.json() as HostSessionDetailResponse,
    };
  }

  const error = await apiErrorFromResponse(response);
  return {
    ok: false,
    message: error.message,
    openSessionId: error.code === "SESSION_OPEN_ALREADY_EXISTS" ? error.openSessionId : null,
  };
}
