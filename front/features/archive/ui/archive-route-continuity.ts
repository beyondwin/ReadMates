import type { ArchiveView } from "@/features/archive/model/archive-model";

const ARCHIVE_SCROLL_KEY = "readmates:archive-scroll";
const ARCHIVE_SCROLL_RESTORE_DELAYS = [0, 80, 180, 360, 720, 1200];

type ReadmatesScrollSnapshot = {
  pathname?: string;
  search?: string;
  scrollY?: number;
};

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

function toUrlPath(to: string) {
  const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
  const url = new URL(to, base);
  return { pathname: url.pathname, search: url.search };
}

function toSafeReadmatesHref(value: string) {
  try {
    const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
    const url = new URL(value, base);

    if (url.origin !== base) {
      return null;
    }

    const isAppHref = url.pathname === "/app" || url.pathname.startsWith("/app/");
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

export function rememberReadmatesArchiveScroll(fromPathname: string, fromSearch: string, to: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (fromPathname !== "/app/archive") {
    return;
  }

  const target = toUrlPath(to);

  if (!target.pathname.startsWith("/app/sessions/") && !target.pathname.startsWith("/app/feedback/")) {
    return;
  }

  window.sessionStorage.setItem(ARCHIVE_SCROLL_KEY, JSON.stringify({ pathname: fromPathname, search: fromSearch, scrollY: window.scrollY }));
}

export function restoreReadmatesArchiveScroll(pathname: string, search: string) {
  if (typeof window === "undefined" || pathname !== "/app/archive") {
    return noopCleanup;
  }

  const raw = window.sessionStorage.getItem(ARCHIVE_SCROLL_KEY);

  if (!raw) {
    return noopCleanup;
  }

  try {
    const stored = JSON.parse(raw) as ReadmatesScrollSnapshot;

    if (stored.pathname !== pathname || stored.search !== search || typeof stored.scrollY !== "number" || stored.scrollY <= 0) {
      window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
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
      window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
    };

    if (typeof window.requestAnimationFrame === "function") {
      animationFrameId = window.requestAnimationFrame(restore);
    }

    ARCHIVE_SCROLL_RESTORE_DELAYS.forEach((delay) => {
      const timeoutId = window.setTimeout(restore, delay);
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
    window.sessionStorage.removeItem(ARCHIVE_SCROLL_KEY);
    return noopCleanup;
  }
}
