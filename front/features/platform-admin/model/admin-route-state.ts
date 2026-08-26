export type AdminRouteReturnState = {
  returnTo: string;
  focusId: string | null;
  scrollTop: number;
};

const SENTINEL_ORIGIN = "https://admin-return.readmates.invalid";
const MAX_RETURN_TO_LENGTH = 2048;
const MAX_SCROLL_TOP = 1_000_000;
const FOCUS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function buildAdminDetailHref(
  detailPath: string,
  state: AdminRouteReturnState,
): string {
  const params = new URLSearchParams();
  params.set("returnTo", state.returnTo);
  if (state.focusId) {
    params.set("focusId", state.focusId);
  }
  if (state.scrollTop > 0) {
    params.set("scrollTop", String(state.scrollTop));
  }
  const query = params.toString();
  return query ? `${detailPath}?${query}` : detailPath;
}

export function parseAdminRouteReturnState(
  params: URLSearchParams,
  options: { fallback: string; allowedPath: string },
): AdminRouteReturnState {
  return {
    returnTo: sanitizeReturnTo(params.get("returnTo"), options.allowedPath) ?? options.fallback,
    focusId: sanitizeFocusId(params.get("focusId")),
    scrollTop: sanitizeScrollTop(params.get("scrollTop")),
  };
}

function sanitizeReturnTo(raw: string | null, allowedPath: string): string | null {
  if (!raw || raw.length > MAX_RETURN_TO_LENGTH) {
    return null;
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || hasControlCharacter(raw)) {
    return null;
  }
  if (hasMalformedPercentEscape(raw)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== SENTINEL_ORIGIN || url.username || url.password) {
    return null;
  }

  const pathname = decodePathname(url.pathname);
  if (!pathname || hasControlCharacter(pathname) || pathname.includes("\\")) {
    return null;
  }
  if (!isAllowedAdminPath(pathname, allowedPath)) {
    return null;
  }
  return `${pathname}${url.search}${url.hash}`;
}

function sanitizeFocusId(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (hasControlCharacter(decoded) || !FOCUS_ID_PATTERN.test(decoded)) {
    return null;
  }
  return decoded;
}

function sanitizeScrollTop(raw: string | null): number {
  if (!raw) {
    return 0;
  }
  if (!/^\d+$/.test(raw)) {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SCROLL_TOP) {
    return 0;
  }
  return value;
}

function isAllowedAdminPath(pathname: string, allowedPath: string): boolean {
  const normalized = normalizeAdminPath(pathname);
  const allowed = normalizeAdminPath(allowedPath);
  if (!isAdminPath(normalized) || !isAdminPath(allowed)) {
    return false;
  }
  return normalized === allowed || normalized.startsWith(`${allowed}/`);
}

function normalizeAdminPath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function decodePathname(pathname: string): string | null {
  try {
    return pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment).replaceAll("/", "%2F"))
      .join("/");
  } catch {
    return null;
  }
}

function hasMalformedPercentEscape(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "%") continue;
    if (!/^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))) {
      return true;
    }
    index += 2;
  }
  return false;
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}
