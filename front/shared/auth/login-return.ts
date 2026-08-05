import { normalizedClubSlug } from "../security/club-slug";

const excludedReturnPathPatterns = [
  /^\/login(?:[/?#]|$)/i,
  /^\/oauth2(?:[/?#]|$)/i,
  /^\/login\/oauth2(?:[/?#]|$)/i,
  /^\/reset-password(?:[/?#]|$)/i,
  /^\/invite(?:[/?#]|$)/i,
  /^\/clubs\/[^/]+\/invite(?:[/?#]|$)/i,
];

const returnPathClassificationOrigin = "https://return.readmates.invalid";

export function currentRelativeReturnTo(locationLike: Pick<Location, "pathname" | "search" | "hash"> = window.location) {
  return safeRelativeReturnTo(`${locationLike.pathname}${locationLike.search}${locationLike.hash}`);
}

export function safeRelativeReturnTo(rawValue: string | null | undefined) {
  const value = rawValue?.trim();
  if (!value || value.length > 2048) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || hasControlCharacter(value)) {
    return null;
  }
  if (hasMalformedPercentEscape(value)) {
    return null;
  }
  const canonicalPath = canonicalRoutePath(value);
  if (
    !canonicalPath ||
    canonicalPath.includes("\\") ||
    hasControlCharacter(canonicalPath) ||
    isRootPath(canonicalPath) ||
    excludedReturnPathPatterns.some((pattern) => pattern.test(canonicalPath))
  ) {
    return null;
  }
  return value;
}

export function loginPathForReturnTo(rawValue: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(rawValue);
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
}

export function oauthHrefForReturnTo(
  rawValue: string | null | undefined,
  { chooseAccount = false, joinClub, joinIntent }: { chooseAccount?: boolean; joinClub?: string; joinIntent?: string } = {},
) {
  const returnTo = safeRelativeReturnTo(rawValue);
  const query = new URLSearchParams();
  if (returnTo) query.set("returnTo", returnTo);
  if (chooseAccount) query.set("chooseAccount", "true");
  const scopedClubSlug = scopedAppClubSlug(returnTo);
  const normalizedJoinClub = normalizedClubSlug(joinClub);
  if (scopedClubSlug && normalizedJoinClub === scopedClubSlug && joinIntent && /^[A-Za-z0-9_-]{32,128}$/.test(joinIntent)) {
    query.set("joinClub", scopedClubSlug);
    query.set("joinIntent", joinIntent);
  }
  const search = query.toString();
  return `/oauth2/authorization/google${search ? `?${search}` : ""}`;
}

export function scopedAppClubSlug(rawValue: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(rawValue);
  const rawPath = returnTo?.split(/[?#]/, 1)[0];
  if (!rawPath) return null;

  const rawSegments = rawPath.split("/").slice(1);
  const pathSegments = rawSegments.at(-1) === "" ? rawSegments.slice(0, -1) : rawSegments;
  if (
    pathSegments.length < 3 ||
    pathSegments[0] !== "clubs" ||
    pathSegments[2] !== "app" ||
    pathSegments.some((segment) => !canonicalRawPathSegment.test(segment) || segment === "." || segment === "..")
  ) {
    return null;
  }

  const clubSlug = normalizedClubSlug(pathSegments[1]);
  return clubSlug && clubSlug === pathSegments[1] ? clubSlug : null;
}

function isRootPath(value: string) {
  return value === "/";
}

function canonicalRoutePath(value: string) {
  try {
    const url = new URL(value, returnPathClassificationOrigin);
    if (url.origin !== returnPathClassificationOrigin) {
      return null;
    }
    return url.pathname
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

const canonicalRawPathSegment = /^[a-zA-Z0-9._~-]+$/;
