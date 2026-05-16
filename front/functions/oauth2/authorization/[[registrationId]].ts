import {
  apiBaseUrlFromEnv,
  copyUpstreamHeaders,
  forwardedOAuthRequestHeaders,
  READMATES_REQUEST_ID_HEADER,
  requestIdForUpstream,
  safeRouteSegment,
} from "../../_shared/proxy";
import { bffErrorResponse } from "../../_shared/errors";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;    // legacy fallback
  READMATES_BFF_SECRETS?: string;   // comma-separated, primary first
};

type PagesFunction<Env> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}) => Response | Promise<Response>;

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const registrationId = safeRouteSegment(params.registrationId);
  if (!registrationId) {
    return bffErrorResponse(404, "RESOURCE_NOT_FOUND");
  }

  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(`/oauth2/authorization/${registrationId}`, apiBaseUrlFromEnv(env));
  upstreamUrl.search = sourceUrl.search;

  const requestId = requestIdForUpstream(request);
  const forwardHeaders = forwardedOAuthRequestHeaders(request, env);
  forwardHeaders.set(READMATES_REQUEST_ID_HEADER, requestId);

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: forwardHeaders,
    redirect: "manual",
  });

  const responseBody = [204, 304].includes(upstream.status) ? null : upstream.body;
  const outboundResponse = new Response(responseBody, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
  outboundResponse.headers.set(READMATES_REQUEST_ID_HEADER, requestId);
  return outboundResponse;
};
