import {
  readmatesFetch,
  readmatesFetchResponse,
  type ExplicitReadmatesApiContext,
} from "@/shared/api/client";
import {
  hostApiErrorFromResponse,
  readHostResponseJson,
} from "@/shared/api/host-authority-event";
import {
  parseHostSessionChangeReceipt,
  parseHostSessionRestorePreview,
  type HostSessionChangeReceipt,
  type HostSessionRestorePreview,
  HostSessionRestoreMutationEnvelopeSchema,
  type HostSessionRestoreMutationEnvelope,
} from "./host-session-recovery-contracts";

function changePath(sessionId: string, changeId: string, suffix: string) {
  return `/api/host/sessions/${encodeURIComponent(sessionId)}/changes/${encodeURIComponent(changeId)}/${suffix}`;
}

export function fetchHostSessionRestorePreview(
  sessionId: string,
  changeId: string,
  context: ExplicitReadmatesApiContext,
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
  request: HostSessionRestoreMutationEnvelope,
  context: ExplicitReadmatesApiContext,
): Promise<HostSessionChangeReceipt> {
  const response = await readmatesFetchResponse(
    changePath(sessionId, changeId, "restore"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(HostSessionRestoreMutationEnvelopeSchema.parse(request)),
    },
    context,
  );
  if (!response.ok) {
    throw await hostApiErrorFromResponse(response, {
      clubSlug: context.clubSlug,
      requestKind: "SESSION_CHANGE_RESTORE",
    });
  }
  return parseHostSessionChangeReceipt(await readHostResponseJson(response));
}
