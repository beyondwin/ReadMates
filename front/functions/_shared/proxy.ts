export type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

const MAX_CLIENT_IP_LENGTH = 128;

export function stripCookieDomain(rawSetCookie: string): string {
  return rawSetCookie.replace(/;\s*Domain=[^;]*/i, "");
}

export function copyUpstreamHeaders(headers: Headers) {
  const copiedHeaders = new Headers(headers);
  copiedHeaders.delete("set-cookie");
  copiedHeaders.delete("x-readmates-bff-secret");
  copiedHeaders.delete("x-readmates-client-ip");
  copiedHeaders.delete("x-readmates-club-host");
  copiedHeaders.delete("x-readmates-club-slug");

  const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    copiedHeaders.append("set-cookie", stripCookieDomain(cookie));
  }

  if (setCookies.length === 0) {
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      copiedHeaders.append("set-cookie", stripCookieDomain(setCookie));
    }
  }

  return copiedHeaders;
}

export function normalizedHostFromRequest(request: Request) {
  const host = new URL(request.url).host.trim().toLowerCase();
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

export function clientIpFromRequest(request: Request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareIp) {
    return cloudflareIp.slice(0, MAX_CLIENT_IP_LENGTH);
  }

  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, MAX_CLIENT_IP_LENGTH) : null;
}

export function apiBaseUrlFromEnv(env: { READMATES_API_BASE_URL: string }) {
  const apiBaseUrl = new URL(env.READMATES_API_BASE_URL);
  apiBaseUrl.search = "";
  apiBaseUrl.hash = "";
  return apiBaseUrl;
}

export function bffSecretFromEnv(env: {
  READMATES_BFF_SECRETS?: string;
  READMATES_BFF_SECRET?: string;
}): string | null {
  const list = env.READMATES_BFF_SECRETS?.trim();
  if (list) {
    const first = list
      .split(",")
      .map((s) => s.trim())
      .find((s) => s.length > 0);
    if (first) return first;
  }
  const legacy = env.READMATES_BFF_SECRET?.trim();
  if (legacy) return legacy;
  return null;
}

export function getConfiguredBffSecrets(env: {
  READMATES_BFF_SECRETS?: string;
  READMATES_BFF_SECRET?: string;
}): string[] {
  const list = env.READMATES_BFF_SECRETS?.trim();
  if (list) {
    return list
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  const legacy = env.READMATES_BFF_SECRET?.trim();
  return legacy ? [legacy] : [];
}

export function getRotationStage(env: {
  BFF_SECRET_ROTATION_STAGE?: string;
}): "stable" | "staging" {
  const raw = env.BFF_SECRET_ROTATION_STAGE?.trim().toLowerCase();
  return raw === "staging" ? "staging" : "stable";
}

export async function secretFingerprint(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 6);
}

export function forwardedOAuthRequestHeaders(
  request: Request,
  env: { READMATES_BFF_SECRETS?: string; READMATES_BFF_SECRET?: string },
) {
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

  const bffSecret = bffSecretFromEnv(env);
  if (bffSecret) {
    headers.set("X-Readmates-Bff-Secret", bffSecret);
  }

  const clientIp = clientIpFromRequest(request);
  if (clientIp) {
    headers.set("X-Readmates-Client-IP", clientIp);
  }

  return headers;
}

export function safeRouteSegment(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length === 1 ? safeRouteSegment(value[0]) : null;
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
