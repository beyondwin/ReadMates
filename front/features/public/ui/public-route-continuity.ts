const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";

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
  label: "공개 기록",
};

function noopCleanup() {
  return undefined;
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

export function rememberReadmatesPublicRecordsScroll(_fromPathname: string, _fromSearch: string, _to: string) {
  void _fromPathname;
  void _fromSearch;
  void _to;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
  }
}

export function restoreReadmatesPublicRecordsScroll(_pathname: string, _search: string) {
  void _pathname;
  void _search;

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(PUBLIC_RECORDS_SCROLL_KEY);
  }

  return noopCleanup;
}
