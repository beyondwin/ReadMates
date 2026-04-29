import type { PublicSessionListItemView } from "@/features/public/model/public-display-model";

export function publicAboutHref(publicBasePath = "") {
  return `${publicBasePath}/about`;
}

export function publicRecordsHref(publicBasePath = "") {
  return `${publicBasePath}/records`;
}

export function publicSessionHref(session: PublicSessionListItemView, publicBasePath = "") {
  return `${publicBasePath}/sessions/${encodeURIComponent(session.sessionId)}`;
}
