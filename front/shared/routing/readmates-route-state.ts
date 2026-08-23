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

export function readHostRecordsReturnTarget(
  state: unknown,
  currentPathname: string,
): ReadmatesReturnTarget | null {
  const currentScope = /^\/clubs\/([^/]+)\/app(?:\/|$)/.exec(currentPathname)?.[1] ?? null;
  const expectedRecordsPath = currentScope
    ? `/clubs/${currentScope}/app/host/records`
    : "/app/host/records";
  const allowedAppPrefix = currentScope ? `/clubs/${currentScope}/app/` : "/app/";
  const baseOrigin = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
  const visited = new Set<object>();
  let current = state;

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) {
      return null;
    }
    visited.add(current);
    const routeState = current as Partial<ReadmatesReturnState>;
    if (typeof routeState.readmatesReturnTo !== "string") {
      return null;
    }
    try {
      const target = new URL(routeState.readmatesReturnTo, baseOrigin);
      if (target.origin !== baseOrigin || !target.pathname.startsWith(allowedAppPrefix)) {
        return null;
      }
      const href = `${target.pathname}${target.search}${target.hash}`;
      if (target.pathname.replace(/\/+$/, "") === expectedRecordsPath) {
        return {
          href,
          label: typeof routeState.readmatesReturnLabel === "string"
            ? routeState.readmatesReturnLabel
            : "",
        };
      }
    } catch {
      return null;
    }
    current = routeState.readmatesReturnState;
  }
  return null;
}

export function hasHostRecordsReturnState(state: unknown, currentPathname: string): boolean {
  return readHostRecordsReturnTarget(state, currentPathname) !== null;
}
