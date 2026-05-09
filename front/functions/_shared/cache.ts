export const PUBLIC_CACHEABLE_PATH_PREFIXES = [
  "/api/public/clubs/",
  "/api/public/records/",
] as const;

export function isPublicCacheableRequest(method: string, upstreamPath: string): boolean {
  if (method !== "GET") return false;
  return PUBLIC_CACHEABLE_PATH_PREFIXES.some((p) => upstreamPath.startsWith(p));
}

export function buildPublicCacheKey(request: Request): Request {
  const url = new URL(request.url);
  const cacheUrl = new URL(url.pathname + url.search, url.origin);
  return new Request(cacheUrl.toString(), { method: "GET" });
}

export function isCacheableUpstreamResponse(response: Response): boolean {
  if (!response.ok) return false;
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  if (setCookies.length > 0) return false;
  const vary = response.headers.get("Vary")?.toLowerCase() ?? "";
  if (vary.includes("cookie") || vary.includes("authorization")) return false;
  return cacheControl.includes("public") || cacheControl.includes("max-age");
}
