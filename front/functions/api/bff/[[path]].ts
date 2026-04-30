import {
  apiBaseUrlFromEnv,
  bffSecretFromEnv,
  clientIpFromRequest,
  copyUpstreamHeaders,
  normalizedHostFromRequest,
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

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CLUB_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

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

function normalizedClubSlugFromRequest(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!params.has("clubSlug")) {
    return null;
  }

  const value = params.get("clubSlug") ?? "";
  const normalized = value.trim();
  return CLUB_SLUG_PATTERN.test(normalized) && !normalized.includes("--") ? normalized : "";
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const upstreamPath = buildApiUpstreamPath(pathSegments(context.params.path));
  if (!upstreamPath) {
    return new Response(null, { status: 404 });
  }

  const upstreamUrl = new URL(upstreamPath, apiBaseUrlFromEnv(context.env));
  if (upstreamUrl.pathname !== "/api" && !upstreamUrl.pathname.startsWith("/api/")) {
    return new Response(null, { status: 404 });
  }

  if (!isSameOriginMutation(context.request)) {
    return new Response(null, { status: 403 });
  }

  const requestUrl = new URL(context.request.url);
  const clubSlug = normalizedClubSlugFromRequest(context.request);
  if (clubSlug === "") {
    return new Response(null, { status: 400 });
  }

  upstreamUrl.search = requestUrl.search;

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
  if (clubSlug) {
    headers.set("X-Readmates-Club-Slug", clubSlug);
  }

  const bffSecret = bffSecretFromEnv(context.env);
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
