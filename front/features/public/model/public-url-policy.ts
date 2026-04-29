export type PublicCanonicalUrlInput = {
  host: string;
  clubSlug: string;
  path: string;
  primaryDomain: string;
};

export const BASELINE_PUBLIC_CLUB_SLUG = "reading-sai";

function hostnameFromHost(host: string) {
  const trimmed = host.trim();

  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/:\d+$/, "");
  }
}

function domainFromHost(host: string) {
  return hostnameFromHost(host).replace(/^\.+|\.+$/g, "");
}

function normalizedPath(path: string) {
  const trimmed = path.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function stripClubPrefix(path: string, clubSlug: string) {
  const pathname = normalizedPath(path);
  const prefixes = [`/clubs/${encodeURIComponent(clubSlug)}`, `/clubs/${clubSlug}`];

  for (const prefix of prefixes) {
    if (pathname === prefix || pathname === `${prefix}/`) {
      return "/";
    }

    if (pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length) || "/";
    }
  }

  return pathname || "/";
}

export function shouldNoIndex(host: string) {
  const hostname = hostnameFromHost(host);
  return hostname === "readmates.pages.dev" || hostname.endsWith(".pages.dev");
}

export function publicClubSlugFromPath(path: string) {
  const pathname = normalizedPath(path);
  const scopedMatch = /^\/clubs\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?\/?$/.exec(pathname);

  if (scopedMatch) {
    const [, slug, section, item] = scopedMatch;
    const isCanonicalPublicRoute =
      section === undefined ||
      section === "about" ||
      section === "records" ||
      (section === "sessions" && item !== undefined);

    return isCanonicalPublicRoute ? decodeURIComponent(slug) : null;
  }

  if (pathname === "/" || pathname === "/about" || pathname === "/records" || pathname.startsWith("/sessions/")) {
    return BASELINE_PUBLIC_CLUB_SLUG;
  }

  return null;
}

export function buildCanonicalUrl({ clubSlug, path, primaryDomain }: PublicCanonicalUrlInput) {
  const canonicalHost = `${clubSlug}.${domainFromHost(primaryDomain)}`;
  const canonicalPath = stripClubPrefix(path, clubSlug);

  return new URL(canonicalPath, `https://${canonicalHost}`).toString();
}
