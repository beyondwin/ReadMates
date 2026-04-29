import type { ArchiveView } from "@/features/archive/model/archive-model";

const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";

export type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

export type ReadmatesReturnTarget = {
  href: string;
  label: string;
  state?: ReadmatesReturnState;
};

type ReadmatesRouteState = {
  readmatesReturnTo?: unknown;
  readmatesReturnLabel?: unknown;
  readmatesReturnState?: unknown;
};

export const archiveSessionsReturnTarget: ReadmatesReturnTarget = {
  href: "/app/archive?view=sessions",
  label: "아카이브로",
};

function noopCleanup() {
  return undefined;
}

function toSafeReadmatesHref(value: string) {
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
    return isAppHref ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function readReturnTargetFromState(state: unknown): ReadmatesReturnTarget | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const routeState = state as ReadmatesRouteState;
  const href = typeof routeState.readmatesReturnTo === "string" ? toSafeReadmatesHref(routeState.readmatesReturnTo) : null;

  if (!href) {
    return null;
  }

  const nestedTarget = readReturnTargetFromState(routeState.readmatesReturnState);

  return {
    href,
    label: typeof routeState.readmatesReturnLabel === "string" ? routeState.readmatesReturnLabel : "",
    ...(nestedTarget ? { state: readmatesReturnState(nestedTarget) } : {}),
  };
}

export function readReadmatesReturnTarget(state: unknown, fallback: ReadmatesReturnTarget): ReadmatesReturnTarget {
  const target = readReturnTargetFromState(state);

  if (!target) {
    return fallback;
  }

  return {
    ...target,
    label: target.label || fallback.label,
  };
}

export function readmatesReturnState(target: ReadmatesReturnTarget): ReadmatesReturnState {
  const state: ReadmatesReturnState = {
    readmatesReturnTo: target.href,
    readmatesReturnLabel: target.label,
  };

  if (target.state) {
    state.readmatesReturnState = target.state;
  }

  return state;
}

export function archiveViewHref(view: ArchiveView) {
  return `/app/archive?view=${view}`;
}

export function appSessionHref(sessionId: string, hash?: string) {
  return `/app/sessions/${encodeURIComponent(sessionId)}${hash ? `#${hash}` : ""}`;
}

export function appFeedbackHref(sessionId: string, printMode = false) {
  return `/app/feedback/${encodeURIComponent(sessionId)}${printMode ? "/print" : ""}`;
}

export function rememberReadmatesArchiveScroll(_fromPathname: string, _fromSearch: string, _to: string) {
  void _fromPathname;
  void _fromSearch;
  void _to;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
  }
}

export function restoreReadmatesArchiveScroll(_pathname: string, _search: string) {
  void _pathname;
  void _search;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
  }

  return noopCleanup;
}
