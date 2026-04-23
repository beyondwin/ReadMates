const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";
const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";
const MOBILE_WORKSPACE_KEY = "readmates:mobile-workspace";

export type ReadmatesReturnTarget = {
  href: string;
  label: string;
  state?: ReadmatesReturnState;
};

export type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

type ReadmatesRouteState = {
  readmatesReturnTo?: unknown;
  readmatesReturnLabel?: unknown;
  readmatesReturnState?: unknown;
  readmatesWorkspace?: unknown;
};

export type ReadmatesMobileWorkspace = "member" | "host";

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
  label: "운영으로",
};

function toSafeReadmatesHref(value: string, scope: "app" | "public") {
  try {
    const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
    const url = new URL(value, base);

    if (url.origin !== base) {
      return null;
    }

    const isAppHref = url.pathname === "/app" || url.pathname.startsWith("/app/");
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

export function readmatesReturnState(target: ReadmatesReturnTarget) {
  const state: ReadmatesReturnState = {
    readmatesReturnTo: target.href,
    readmatesReturnLabel: target.label,
  };

  if (target.state) {
    state.readmatesReturnState = target.state;
  }

  return state;
}

export function readReadmatesWorkspaceState(state: unknown): ReadmatesMobileWorkspace | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const workspace = (state as ReadmatesRouteState).readmatesWorkspace;

  return workspace === "host" || workspace === "member" ? workspace : null;
}

export function readStoredReadmatesMobileWorkspace(): ReadmatesMobileWorkspace | null {
  if (typeof window === "undefined") {
    return null;
  }

  let workspace: string | null = null;

  try {
    workspace = window.sessionStorage.getItem(MOBILE_WORKSPACE_KEY);
  } catch {
    return null;
  }

  return workspace === "host" || workspace === "member" ? workspace : null;
}

export function rememberReadmatesMobileWorkspace(workspace: ReadmatesMobileWorkspace) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(MOBILE_WORKSPACE_KEY, workspace);
  } catch {
    // Workspace memory is only a navigation hint; unavailable storage should not break routing.
  }
}

function readReturnTargetFromState(state: unknown, scope: "app" | "public"): ReadmatesReturnTarget | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const routeState = state as ReadmatesRouteState;
  const href = typeof routeState.readmatesReturnTo === "string" ? toSafeReadmatesHref(routeState.readmatesReturnTo, scope) : null;

  if (!href) {
    return null;
  }

  const nestedTarget = readReturnTargetFromState(routeState.readmatesReturnState, scope);

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
