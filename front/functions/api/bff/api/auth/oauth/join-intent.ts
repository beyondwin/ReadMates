import { bffErrorResponse } from "../../../../../_shared/errors";
import {
  apiBaseUrlFromEnv,
  bffSecretFromEnv,
  clientIpFromRequest,
  copyUpstreamHeaders,
  normalizedHostFromRequest,
  READMATES_REQUEST_ID_HEADER,
  requestIdForUpstream,
} from "../../../../../_shared/proxy";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
  READMATES_BFF_SECRETS?: string;
};

type Context = { request: Request; env: Env };

export async function onRequestPost({ request, env }: Context) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site")?.toLowerCase();
  const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    origin !== requestUrl.origin ||
    mediaType !== "application/json" ||
    (fetchSite != null && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    return bffErrorResponse(403, "PERMISSION_DENIED");
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: requestUrl.origin,
    Referer: `${requestUrl.origin}/`,
    "X-Readmates-Club-Host": normalizedHostFromRequest(request),
  });
  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);
  const bffSecret = bffSecretFromEnv(env);
  if (bffSecret) headers.set("X-Readmates-Bff-Secret", bffSecret);
  const clientIp = clientIpFromRequest(request);
  if (clientIp) headers.set("X-Readmates-Client-IP", clientIp);
  const requestId = requestIdForUpstream(request);
  headers.set(READMATES_REQUEST_ID_HEADER, requestId);

  const upstreamUrl = new URL("/api/auth/oauth/join-intent", apiBaseUrlFromEnv(env));
  const upstream = await fetch(upstreamUrl.toString(), {
    method: "POST",
    headers,
    body: await request.arrayBuffer(),
    redirect: "manual",
  });
  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
  response.headers.set(READMATES_REQUEST_ID_HEADER, requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
