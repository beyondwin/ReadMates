import type { PublicSessionListItemView } from "@/features/public/model/public-display-model";
import { BASELINE_PUBLIC_CLUB_SLUG } from "@/features/public/model/public-url-policy";
import { normalizedClubSlug } from "@/shared/security/club-slug";

export function publicAboutHref(publicBasePath = "") {
  return `${publicBasePath}/about`;
}

export function publicRecordsHref(publicBasePath = "") {
  return `${publicBasePath}/records`;
}

export function publicSessionHref(session: PublicSessionListItemView, publicBasePath = "") {
  return `${publicBasePath}/sessions/${encodeURIComponent(session.sessionId)}`;
}

export function publicClubAppEntry(publicBasePath = "") {
  const match = /^\/clubs\/([^/]+)$/.exec(publicBasePath);
  const candidate = match ? decodeURIComponent(match[1]) : BASELINE_PUBLIC_CLUB_SLUG;
  const clubSlug = normalizedClubSlug(candidate) || BASELINE_PUBLIC_CLUB_SLUG;
  const appHref = `/clubs/${encodeURIComponent(clubSlug)}/app`;
  return { appHref, clubSlug };
}
