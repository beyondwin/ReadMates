import {
  archiveReportReturnTarget,
  readmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/features/feedback/model/feedback-document-model";

type ReadmatesRouteState = {
  readmatesReturnTo?: unknown;
  readmatesReturnLabel?: unknown;
  readmatesReturnState?: unknown;
};

function toSafeAppHref(value: string) {
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
  const href = typeof routeState.readmatesReturnTo === "string" ? toSafeAppHref(routeState.readmatesReturnTo) : null;

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

export function readFeedbackReturnTarget(state: unknown, fallback = archiveReportReturnTarget): ReadmatesReturnTarget {
  const target = readReturnTargetFromState(state);

  if (!target) {
    return fallback;
  }

  return {
    ...target,
    label: target.label || fallback.label,
  };
}
