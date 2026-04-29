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

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_CLIENT_IP_LENGTH = 128;

function pathSegments(path: string | string[] | undefined) {
  if (Array.isArray(path)) {
    return path;
  }

  return path ? path.split("/") : [];
}

function buildApiUpstreamPath(path: string[]) {
  const safeSegments: string[] = [];

  for (const segment of path) {
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      return null;
    }

    if (
      decodedSegment === "" ||
      decodedSegment === "." ||
      decodedSegment === ".." ||
      decodedSegment.includes("/") ||
      decodedSegment.includes("\\")
    ) {
      return null;
    }

    safeSegments.push(encodeURIComponent(decodedSegment));
  }

  if (safeSegments[0] !== "api") {
    return null;
  }

  return `/${safeSegments.join("/")}`;
}

function copyUpstreamHeaders(headers: Headers) {
  const copiedHeaders = new Headers(headers);
  copiedHeaders.delete("set-cookie");
  copiedHeaders.delete("x-readmates-bff-secret");
  copiedHeaders.delete("x-readmates-client-ip");
  copiedHeaders.delete("x-readmates-club-host");

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

function isSameOriginMutation(request: Request) {
  if (!MUTATING_METHODS.has(request.method)) {
    return true;
  }

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === requestOrigin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

function clientIpFromRequest(request: Request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareIp) {
    return cloudflareIp.slice(0, MAX_CLIENT_IP_LENGTH);
  }

  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, MAX_CLIENT_IP_LENGTH) : null;
}

function normalizedHostFromRequest(request: Request) {
  const host = new URL(request.url).host.trim().toLowerCase();
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const upstreamPath = buildApiUpstreamPath(pathSegments(context.params.path));
  if (!upstreamPath) {
    return new Response(null, { status: 404 });
  }

  const upstreamUrl = new URL(upstreamPath, context.env.READMATES_API_BASE_URL);
  if (upstreamUrl.pathname !== "/api" && !upstreamUrl.pathname.startsWith("/api/")) {
    return new Response(null, { status: 404 });
  }

  if (!isSameOriginMutation(context.request)) {
    return new Response(null, { status: 403 });
  }

  upstreamUrl.search = new URL(context.request.url).search;

  const headers = new Headers();
  const contentType = context.request.headers.get("content-type");
  const cookie = context.request.headers.get("cookie");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  if (MUTATING_METHODS.has(context.request.method)) {
    const origin = new URL(context.request.url).origin;
    headers.set("Origin", origin);
    headers.set("Referer", origin);
  }

  headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));

  const bffSecret = context.env.READMATES_BFF_SECRET?.trim();
  if (bffSecret) {
    headers.set("X-Readmates-Bff-Secret", bffSecret);
  }

  const clientIp = clientIpFromRequest(context.request);
  if (clientIp) {
    headers.set("X-Readmates-Client-IP", clientIp);
  }

  const body = ["GET", "HEAD"].includes(context.request.method)
    ? undefined
    : await context.request.arrayBuffer();
  const upstream = await fetch(upstreamUrl.toString(), {
    method: context.request.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseBody = ["HEAD"].includes(context.request.method) || [204, 304].includes(upstream.status)
    ? null
    : upstream.body;

  return new Response(responseBody, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
};
