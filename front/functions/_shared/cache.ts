export const PUBLIC_CACHEABLE_PATH_PREFIXES = [
  "/api/public/clubs/",
  "/api/public/records/",
  "/api/public/sessions/",
] as const;

const PUBLIC_CACHEABLE_EXACT_PATHS = ["/api/public/club"] as const;

const PUBLIC_DETAIL_PATHS = [
  /^\/api\/public\/clubs\/[^/]+\/sessions\/[^/]+$/,
  /^\/api\/public\/records\/[^/]+$/,
  /^\/api\/public\/sessions\/[^/]+$/,
] as const;

function isPublicCacheablePath(upstreamPath: string): boolean {
  return PUBLIC_CACHEABLE_EXACT_PATHS.some((path) => path === upstreamPath) ||
    PUBLIC_CACHEABLE_PATH_PREFIXES.some((prefix) => upstreamPath.startsWith(prefix));
}

export function isPublicCacheableRequest(method: string, upstreamPath: string): boolean {
  if (method !== "GET") return false;
  return isPublicCacheablePath(upstreamPath);
}

export function buildPublicCacheKey(request: Request): Request {
  const url = new URL(request.url);
  const cacheUrl = new URL(url.pathname + url.search, url.origin);
  return new Request(cacheUrl.toString(), { method: "GET" });
}

export function boundedPublicCacheControl(
  upstreamPath: string,
  cacheControl: string,
): string {
  const normalized = cacheControl.trim();
  const lower = normalized.toLowerCase();
  if (lower.includes("no-store") || lower.includes("private")) {
    return normalized;
  }
  if (!lower.includes("public") && !lower.includes("max-age")) {
    return normalized;
  }
  if (!isPublicCacheablePath(upstreamPath)) {
    return normalized;
  }
  const upstreamMaxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(normalized)?.[1] ?? 60);
  const policyMaxAge = PUBLIC_DETAIL_PATHS.some((pattern) => pattern.test(upstreamPath)) ? 60 : 120;
  const boundedMaxAge = Math.min(Math.max(upstreamMaxAge, 0), policyMaxAge);
  return `public, max-age=${boundedMaxAge}, must-revalidate`;
}

export function isCacheableUpstreamResponse(response: Response): boolean {
  if (!response.ok) return false;
  const cacheControl = response.headers.get("Cache-Control")?.toLowerCase() ?? "";
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  if (setCookies.length > 0 || response.headers.has("Set-Cookie")) return false;
  const vary = response.headers.get("Vary")?.toLowerCase() ?? "";
  const varyNames = vary.split(",").map((name) => name.trim()).filter(Boolean);
  if (varyNames.some((name) => name !== "accept-encoding")) return false;
  return cacheControl.includes("public") || cacheControl.includes("max-age");
}
