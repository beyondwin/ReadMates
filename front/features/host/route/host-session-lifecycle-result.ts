import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
import type { HostSessionLifecycleResult } from "@/features/host/model/host-session-lifecycle-model";
import { hostApiErrorFromResponse, readHostResponseJson } from "@/shared/api/host-authority-event";

export async function hostSessionLifecycleResultFromResponse(
  response: Response,
  context: { clubSlug: string; requestKind: string },
): Promise<HostSessionLifecycleResult> {
  if (response.ok) {
    return {
      ok: true,
      session: await readHostResponseJson<HostSessionDetailResponse>(response),
    };
  }

  const error = await hostApiErrorFromResponse(response, context);
  return {
    ok: false,
    message: error.message,
    openSessionId: error.code === "SESSION_OPEN_ALREADY_EXISTS" ? error.openSessionId : null,
  };
}
