const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";
const PUBLIC_SCROLL_RESTORE_DELAYS = [0, 80, 180, 360, 720, 1200];

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

export const publicRecordsReturnTarget: ReadmatesReturnTarget = {
  href: "/records",
  label: "공개 기록 색인",
};

function noopCleanup() {
  return undefined;
}

function toUrlPath(to: string) {
  const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
  const url = new URL(to, base);
  return { pathname: url.pathname, search: url.search };
}

function toSafePublicHref(value: string) {
  try {
    const base = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
    const url = new URL(value, base);

    if (url.origin !== base) {
      return null;
    }

    const isPublicHref = url.pathname === "/" || url.pathname === "/records" || url.pathname.startsWith("/sessions/");
    return isPublicHref ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function readReturnTargetFromState(state: unknown): ReadmatesReturnTarget | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const routeState = state as ReadmatesRouteState;
  const href = typeof routeState.readmatesReturnTo === "string" ? toSafePublicHref(routeState.readmatesReturnTo) : null;

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

export function readPublicReadmatesReturnTarget(state: unknown, fallback: ReadmatesReturnTarget): ReadmatesReturnTarget {
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

export function rememberReadmatesPublicRecordsScroll(fromPathname: string, fromSearch: string, to: string) {
  if (typeof window === "undefined" || fromPathname !== "/records") {
    return;
  }

  const target = toUrlPath(to);

  if (!target.pathname.startsWith("/sessions/")) {
    return;
  }

  window.sessionStorage.setItem(
    PUBLIC_RECORDS_SCROLL_KEY,
    JSON.stringify({ pathname: fromPathname, search: fromSearch, scrollY: window.scrollY }),
  );
}

export function restoreReadmatesPublicRecordsScroll(pathname: string, search: string) {
  if (typeof window === "undefined" || pathname !== "/records") {
    return noopCleanup;
  }

  const raw = window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY);

  if (!raw) {
    return noopCleanup;
  }

  try {
    const stored = JSON.parse(raw) as ReadmatesScrollSnapshot;

    if (stored.pathname !== pathname || stored.search !== search || typeof stored.scrollY !== "number" || stored.scrollY <= 0) {
      window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
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
      window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
    };

    if (typeof window.requestAnimationFrame === "function") {
      animationFrameId = window.requestAnimationFrame(restore);
    }

    PUBLIC_SCROLL_RESTORE_DELAYS.forEach((delay) => {
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
    window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
    return noopCleanup;
  }
}
