import {
  clientIpFromRequest,
  copyUpstreamHeaders,
  normalizedHostFromRequest,
  safeRouteSegment,
} from "../../_shared/proxy";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
};

type PagesFunction<Env> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}) => Response | Promise<Response>;

function forwardedRequestHeaders(request: Request, env: Env) {
  const sourceUrl = new URL(request.url);
  const headers = new Headers();

  for (const name of ["accept", "accept-language", "cookie", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));
  headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(request));

  const bffSecret = env.READMATES_BFF_SECRET?.trim();
  if (bffSecret) {
    headers.set("X-Readmates-Bff-Secret", bffSecret);
  }

  const clientIp = clientIpFromRequest(request);
  if (clientIp) {
    headers.set("X-Readmates-Client-IP", clientIp);
  }

  return headers;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const registrationId = safeRouteSegment(params.registrationId);
  if (!registrationId) {
    return new Response(null, { status: 404 });
  }

  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(`/oauth2/authorization/${registrationId}`, env.READMATES_API_BASE_URL);
  upstreamUrl.search = sourceUrl.search;

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: forwardedRequestHeaders(request, env),
    redirect: "manual",
  });

  const responseBody = [204, 304].includes(upstream.status) ? null : upstream.body;
  return new Response(responseBody, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
};
