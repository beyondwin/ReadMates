import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import {
  parseHostSessionChangeReceipt,
  parseHostSessionRestorePreview,
  type HostSessionChangeReceipt,
  type HostSessionRestorePreview,
  type HostSessionRestoreRequest,
} from "./host-session-recovery-contracts";

function changePath(sessionId: string, changeId: string, suffix: string) {
  return `/api/host/sessions/${encodeURIComponent(sessionId)}/changes/${encodeURIComponent(changeId)}/${suffix}`;
}

export function fetchHostSessionRestorePreview(
  sessionId: string,
  changeId: string,
  context?: ReadmatesApiContext,
): Promise<HostSessionRestorePreview> {
  return readmatesFetch<HostSessionRestorePreview>(
    changePath(sessionId, changeId, "restore-preview"),
    undefined,
    context,
  ).then(parseHostSessionRestorePreview);
}

export async function restoreHostSessionChange(
  sessionId: string,
  changeId: string,
  request: HostSessionRestoreRequest,
  context?: ReadmatesApiContext,
): Promise<HostSessionChangeReceipt> {
  const response = await readmatesFetchResponse(
    changePath(sessionId, changeId, "restore"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    context,
  );
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return parseHostSessionChangeReceipt(await response.json());
}
