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
  HostWorkboxDeferralRequestSchema,
  parseOptionalHostWorkboxCursor,
  parseHostWorkboxDeferralReceipt,
  parseHostWorkboxPage,
  type HostWorkboxDeferralReceipt,
  type HostWorkboxDeferralRequest,
  type HostWorkboxPage,
  type HostWorkboxState,
} from "./host-workbox-contracts";

export type HostWorkboxPageRequest = {
  state: HostWorkboxState;
  cursor?: string | null;
  limit?: number;
};

export function fetchHostWorkboxPage(
  request: HostWorkboxPageRequest,
  context: ExplicitReadmatesApiContext,
): Promise<HostWorkboxPage> {
  const cursor = parseOptionalHostWorkboxCursor(request.cursor);
  const params = new URLSearchParams();
  params.set("state", request.state);
  if (request.limit !== undefined) params.set("limit", String(request.limit));
  if (cursor !== null) params.set("cursor", cursor);
  return readmatesFetch<unknown>(
    `/api/host/workbox?${params.toString()}`,
    undefined,
    context,
  ).then(parseHostWorkboxPage);
}

export function deferHostWorkboxItem(
  key: string,
  request: HostWorkboxDeferralRequest,
  context: ExplicitReadmatesApiContext,
): Promise<HostWorkboxDeferralReceipt> {
  const parsedRequest = HostWorkboxDeferralRequestSchema.parse(request);
  return readmatesFetch<unknown>(
    `/api/host/workbox/items/${encodeURIComponent(key)}/deferral`,
    { method: "PUT", body: JSON.stringify(parsedRequest) },
    context,
  ).then(parseHostWorkboxDeferralReceipt);
}

export async function removeHostWorkboxDeferral(
  key: string,
  context: ExplicitReadmatesApiContext,
): Promise<void> {
  const response = await readmatesFetchResponse(
    `/api/host/workbox/items/${encodeURIComponent(key)}/deferral`,
    { method: "DELETE" },
    context,
  );
  if (!response.ok) {
    throw await hostApiErrorFromResponse(response, {
      clubSlug: context.clubSlug,
      requestKind: "HOST_WORKBOX_DEFERRAL_DELETE",
    });
  }
  await readHostResponseJson<void>(response);
}
