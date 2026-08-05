import {
  apiBaseUrlFromEnv,
  forwardedOAuthRequestHeaders,
  READMATES_REQUEST_ID_HEADER,
  requestIdForUpstream,
  safeRouteSegment,
} from "../../../_shared/proxy";
import {
  invalidOAuthRouteResponse,
  oauthProxyNetworkErrorResponse,
  oauthProxyResponse,
} from "../../../_shared/oauth-error-response";

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
  const requestId = requestIdForUpstream(request);
  const registrationId = safeRouteSegment(params.registrationId);
  if (!registrationId) {
    return invalidOAuthRouteResponse(request, "callback", requestId);
  }

  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(`/login/oauth2/code/${registrationId}`, apiBaseUrlFromEnv(env));
  upstreamUrl.search = sourceUrl.search;

  const forwardHeaders = forwardedOAuthRequestHeaders(request, env);
  forwardHeaders.set(READMATES_REQUEST_ID_HEADER, requestId);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: forwardHeaders,
      redirect: "manual",
    });
    return oauthProxyResponse(request, upstream, "callback", requestId);
  } catch {
    return oauthProxyNetworkErrorResponse(request, "callback", requestId);
  }
};
