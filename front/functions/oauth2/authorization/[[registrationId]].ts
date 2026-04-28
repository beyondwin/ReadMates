type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
};

type PagesFunction<Env> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}) => Response | Promise<Response>;

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

const MAX_CLIENT_IP_LENGTH = 128;

function safeRouteSegment(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      return null;
    }
    return safeRouteSegment(value[0]);
  }

  if (!value) {
    return null;
  }

  let decodedValue: string;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (decodedValue === "." || decodedValue === ".." || decodedValue.includes("/") || decodedValue.includes("\\")) {
    return null;
  }

  return encodeURIComponent(decodedValue);
}

function copyUpstreamHeaders(headers: Headers) {
  const copiedHeaders = new Headers(headers);
  copiedHeaders.delete("set-cookie");
  copiedHeaders.delete("x-readmates-bff-secret");
  copiedHeaders.delete("x-readmates-client-ip");

  const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      copiedHeaders.append("set-cookie", cookie);
    }
    return copiedHeaders;
  }

  const setCookie = headers.get("set-cookie");
  if (setCookie) {
    copiedHeaders.append("set-cookie", setCookie);
  }

  return copiedHeaders;
}

function clientIpFromRequest(request: Request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareIp) {
    return cloudflareIp.slice(0, MAX_CLIENT_IP_LENGTH);
  }

  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, MAX_CLIENT_IP_LENGTH) : null;
}

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
