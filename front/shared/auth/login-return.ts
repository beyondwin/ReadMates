const excludedReturnPathPatterns = [
  /^\/login(?:[/?#]|$)/,
  /^\/oauth2(?:[/?#]|$)/,
  /^\/login\/oauth2(?:[/?#]|$)/,
  /^\/reset-password(?:[/?#]|$)/,
  /^\/invite(?:[/?#]|$)/,
  /^\/clubs\/[^/]+\/invite(?:[/?#]|$)/,
];

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
  if (isRootPath(value) || excludedReturnPathPatterns.some((pattern) => pattern.test(value))) {
    return null;
  }
  return value;
}

export function loginPathForReturnTo(rawValue: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(rawValue);
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
}

export function oauthHrefForReturnTo(rawValue: string | null | undefined) {
  const returnTo = safeRelativeReturnTo(rawValue);
  return returnTo
    ? `/oauth2/authorization/google?returnTo=${encodeURIComponent(returnTo)}`
    : "/oauth2/authorization/google";
}

function isRootPath(value: string) {
  return value === "/" || value.startsWith("/?") || value.startsWith("/#");
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
