import {
  readmatesReturnState,
  type ReadmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/shared/routing/readmates-route-state";
import { HOST_ROUTE_HREFS, scopedHostRouteHref } from "@/shared/routing/host-route-destinations";

const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";
const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";

export { readmatesReturnState };
export type { ReadmatesReturnState, ReadmatesReturnTarget };

type ReadmatesRouteState = {
  readmatesReturnTo?: unknown;
  readmatesReturnLabel?: unknown;
  readmatesReturnState?: unknown;
};

export const archiveSessionsReturnTarget: ReadmatesReturnTarget = {
  href: "/app/archive?view=sessions",
  label: "아카이브로",
};

export const archiveReportReturnTarget: ReadmatesReturnTarget = {
  href: "/app/archive?view=report",
  label: "아카이브로 돌아가기",
};

export const publicRecordsReturnTarget: ReadmatesReturnTarget = {
  href: "/records",
  label: "공개 기록",
};

export const hostDashboardReturnTarget: ReadmatesReturnTarget = {
  href: "/app/host",
  label: "오늘로",
};

export type HostRouteDestinationInventoryEntry = {
  owner: string;
  kind: "host-primary" | "host-secondary" | "member-primary" | "public-primary" | "detail" | "compatibility";
  href: string;
  scopedHref: string;
  lifecycle: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED" | null;
};

export const HOST_ROUTE_DESTINATION_INVENTORY: readonly HostRouteDestinationInventoryEntry[] = [
  { owner: "host-today", kind: "host-primary", href: HOST_ROUTE_HREFS.today, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.today), lifecycle: null },
  { owner: "host-meetings", kind: "host-primary", href: HOST_ROUTE_HREFS.meetings, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.meetings), lifecycle: null },
  { owner: "host-members", kind: "host-primary", href: HOST_ROUTE_HREFS.members, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.members), lifecycle: null },
  { owner: "host-records", kind: "host-primary", href: HOST_ROUTE_HREFS.records, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.records), lifecycle: null },
  { owner: "host-invitations", kind: "host-secondary", href: HOST_ROUTE_HREFS.invitations, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.invitations), lifecycle: null },
  { owner: "host-notifications", kind: "host-secondary", href: HOST_ROUTE_HREFS.notifications, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.notifications), lifecycle: null },
  { owner: "host-operations", kind: "host-secondary", href: HOST_ROUTE_HREFS.operations, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.operations), lifecycle: null },
  { owner: "host-new-meeting", kind: "detail", href: HOST_ROUTE_HREFS.newSession, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.newSession), lifecycle: "DRAFT" },
  { owner: "host-draft-list", kind: "detail", href: HOST_ROUTE_HREFS.meetings, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.meetings), lifecycle: "DRAFT" },
  { owner: "host-open-list", kind: "detail", href: HOST_ROUTE_HREFS.meetings, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.meetings), lifecycle: "OPEN" },
  { owner: "host-closed-list", kind: "detail", href: HOST_ROUTE_HREFS.records, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.records), lifecycle: "CLOSED" },
  { owner: "host-published-list", kind: "detail", href: HOST_ROUTE_HREFS.records, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.records), lifecycle: "PUBLISHED" },
  { owner: "host-meeting-detail", kind: "detail", href: HOST_ROUTE_HREFS.sessionDetail, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.sessionDetail), lifecycle: "OPEN" },
  { owner: "host-record-detail", kind: "detail", href: HOST_ROUTE_HREFS.sessionDetail, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.sessionDetail), lifecycle: "CLOSED" },
  { owner: "host-session-edit", kind: "detail", href: HOST_ROUTE_HREFS.sessionEdit, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.sessionEdit), lifecycle: null },
  { owner: "host-session-closing", kind: "detail", href: HOST_ROUTE_HREFS.sessionClosing, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.sessionClosing), lifecycle: "CLOSED" },
  { owner: "host-feedback-document", kind: "detail", href: HOST_ROUTE_HREFS.feedbackDocument, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.feedbackDocument), lifecycle: "CLOSED" },
  { owner: "host-trash-compatibility", kind: "compatibility", href: HOST_ROUTE_HREFS.trashCompatibility, scopedHref: scopedHostRouteHref(HOST_ROUTE_HREFS.trashCompatibility), lifecycle: null },
  { owner: "member-today", kind: "member-primary", href: "/app", scopedHref: "/clubs/:slug/app", lifecycle: null },
  { owner: "member-notes", kind: "member-primary", href: "/app/notes", scopedHref: "/clubs/:slug/app/notes", lifecycle: null },
  { owner: "member-records", kind: "member-primary", href: "/app/archive", scopedHref: "/clubs/:slug/app/archive", lifecycle: null },
  { owner: "member-space", kind: "member-primary", href: "/app/me", scopedHref: "/clubs/:slug/app/me", lifecycle: null },
  { owner: "member-record-detail", kind: "detail", href: "/app/sessions/:sessionId", scopedHref: "/clubs/:slug/app/sessions/:sessionId", lifecycle: "CLOSED" },
  { owner: "public-home", kind: "public-primary", href: "/", scopedHref: "/clubs/:slug", lifecycle: null },
  { owner: "public-about", kind: "public-primary", href: "/about", scopedHref: "/clubs/:slug/about", lifecycle: null },
  { owner: "public-records", kind: "public-primary", href: "/records", scopedHref: "/clubs/:slug/records", lifecycle: null },
  { owner: "public-record-detail", kind: "detail", href: "/sessions/:sessionId", scopedHref: "/clubs/:slug/sessions/:sessionId", lifecycle: "PUBLISHED" },
] as const;

function toSafeReadmatesHref(value: string, scope: "app" | "public") {
  try {
    const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
    const url = new URL(value, base);

    if (url.origin !== base) {
      return null;
    }

    const isAppHref =
      url.pathname === "/app" ||
      url.pathname.startsWith("/app/") ||
      /^\/clubs\/[^/]+\/app(?:\/|$)/.test(url.pathname);
    const isPublicHref = url.pathname === "/" || url.pathname === "/records" || url.pathname.startsWith("/sessions/");

    if ((scope === "app" && !isAppHref) || (scope === "public" && !isPublicHref)) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function archiveViewHref(view: "sessions" | "reviews" | "questions" | "report") {
  return `/app/archive?view=${view}`;
}

export function appSessionHref(sessionId: string, hash?: string) {
  return `/app/sessions/${encodeURIComponent(sessionId)}${hash ? `#${hash}` : ""}`;
}

export function appFeedbackHref(sessionId: string, printMode = false) {
  return `/app/feedback/${encodeURIComponent(sessionId)}${printMode ? "/print" : ""}`;
}

function readReturnTargetFromState(
  state: unknown,
  scope: "app" | "public",
  visited = new Set<object>(),
  depth = 0,
): ReadmatesReturnTarget | null {
  if (depth >= 8 || !state || typeof state !== "object" || visited.has(state)) {
    return null;
  }
  visited.add(state);

  const routeState = state as ReadmatesRouteState;
  const href = typeof routeState.readmatesReturnTo === "string" ? toSafeReadmatesHref(routeState.readmatesReturnTo, scope) : null;

  if (!href) {
    return null;
  }

  const nestedTarget = readReturnTargetFromState(
    routeState.readmatesReturnState,
    scope,
    visited,
    depth + 1,
  );

  return {
    href,
    label: typeof routeState.readmatesReturnLabel === "string" ? routeState.readmatesReturnLabel : "",
    ...(nestedTarget ? { state: readmatesReturnState(nestedTarget) } : {}),
  };
}

export function readReadmatesReturnTarget(state: unknown, fallback: ReadmatesReturnTarget): ReadmatesReturnTarget {
  const target = readReturnTargetFromState(state, "app");

  if (!target) {
    return fallback;
  }

  return {
    ...target,
    label: target.label || fallback.label,
  };
}

export function readPublicReadmatesReturnTarget(state: unknown, fallback: ReadmatesReturnTarget): ReadmatesReturnTarget {
  const target = readReturnTargetFromState(state, "public");

  if (!target) {
    return fallback;
  }

  return {
    ...target,
    label: target.label || fallback.label,
  };
}

export function rememberReadmatesListScroll(_fromPathname: string, _fromSearch: string, _to: string) {
  void _fromPathname;
  void _fromSearch;
  void _to;

  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
  window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
}

export function resetReadmatesNavigationScroll() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
  window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function rememberReadmatesArchiveScroll(fromPathname: string, fromSearch: string, to: string) {
  rememberReadmatesListScroll(fromPathname, fromSearch, to);
}

function noopCleanup() {
  return undefined;
}

export function restoreReadmatesListScroll(_pathname: string, _search: string) {
  void _pathname;
  void _search;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
    window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
  }

  return noopCleanup;
}

export function restoreReadmatesArchiveScroll(pathname: string, search: string) {
  return restoreReadmatesListScroll(pathname, search);
}
