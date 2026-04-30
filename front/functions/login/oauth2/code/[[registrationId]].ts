import {
  copyUpstreamHeaders,
  forwardedOAuthRequestHeaders,
  safeRouteSegment,
} from "../../../_shared/proxy";

type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
};

type PagesFunction<Env> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}) => Response | Promise<Response>;

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const registrationId = safeRouteSegment(params.registrationId);
  if (!registrationId) {
    return new Response(null, { status: 404 });
  }

  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(`/login/oauth2/code/${registrationId}`, env.READMATES_API_BASE_URL);
  upstreamUrl.search = sourceUrl.search;

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: forwardedOAuthRequestHeaders(request, env),
    redirect: "manual",
  });

  const responseBody = [204, 304].includes(upstream.status) ? null : upstream.body;
  return new Response(responseBody, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
};
