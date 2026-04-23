const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";
const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";
const ARCHIVE_SCROLL_RESTORE_DELAYS = [0, 80, 180, 360, 720, 1200];

type ReadmatesScrollSnapshot = {
  pathname?: string;
  search?: string;
  scrollY?: number;
};

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
  label: "운영으로",
};

function toUrlPath(to: string) {
  const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
  const url = new URL(to, base);
  return { pathname: url.pathname, search: url.search };
}

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

function shouldSnapshotArchiveScroll(pathname: string) {
  return pathname.startsWith("/app/sessions/") || pathname.startsWith("/app/feedback/");
}

function shouldSnapshotPublicRecordsScroll(pathname: string) {
  return pathname.startsWith("/sessions/");
}

function scrollConfigForList(pathname: string) {
  if (pathname === "/app/archive") {
    return {
      key: ARCHIVE_SCROLL_KEY,
      shouldSnapshot: shouldSnapshotArchiveScroll,
    };
  }

  if (pathname === "/records") {
    return {
      key: PUBLIC_RECORDS_SCROLL_KEY,
      shouldSnapshot: shouldSnapshotPublicRecordsScroll,
    };
  }

  return null;
}

export function rememberReadmatesListScroll(fromPathname: string, fromSearch: string, to: string) {
  if (typeof window === "undefined") {
    return;
  }

  const config = scrollConfigForList(fromPathname);

  if (!config) {
    return;
  }

  const target = toUrlPath(to);

  if (!config.shouldSnapshot(target.pathname)) {
    return;
  }

  window.sessionStorage.setItem(config.key, JSON.stringify({ pathname: fromPathname, search: fromSearch, scrollY: window.scrollY }));
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

function restoreReadmatesScroll(key: string, pathname: string, search: string) {
  if (typeof window === "undefined") {
    return noopCleanup;
  }

  const raw = window.sessionStorage.getItem(key);

  if (!raw) {
    return noopCleanup;
  }

  try {
    const stored = JSON.parse(raw) as ReadmatesScrollSnapshot;

    if (stored.pathname !== pathname || stored.search !== search || typeof stored.scrollY !== "number" || stored.scrollY <= 0) {
      window.sessionStorage.removeItem(key);
      return noopCleanup;
    }

    let active = true;
    let animationFrameId: number | null = null;
    const timeoutIds: number[] = [];
    const restore = () => {
      if (!active || window.location.pathname !== pathname || window.location.search !== search) {
        return;
      }

      window.scrollTo({ top: stored.scrollY, behavior: "auto" });
      window.sessionStorage.removeItem(key);
    };

    if (typeof window.requestAnimationFrame === "function") {
      animationFrameId = window.requestAnimationFrame(restore);
    }

    ARCHIVE_SCROLL_RESTORE_DELAYS.forEach((delay) => {
      const timeoutId = window.setTimeout(() => {
        restore();
      }, delay);
      timeoutIds.push(timeoutId);
    });

    return () => {
      active = false;

      if (animationFrameId !== null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(animationFrameId);
      }

      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  } catch {
    window.sessionStorage.removeItem(key);
    return noopCleanup;
  }
}

export function restoreReadmatesListScroll(pathname: string, search: string) {
  const config = scrollConfigForList(pathname);

  if (!config) {
    return noopCleanup;
  }

  return restoreReadmatesScroll(config.key, pathname, search);
}

export function restoreReadmatesArchiveScroll(pathname: string, search: string) {
  return restoreReadmatesListScroll(pathname, search);
}
