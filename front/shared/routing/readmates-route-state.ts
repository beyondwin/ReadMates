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

function appScopeRoot(currentPathname: string) {
  const scopedMatch = /^(\/clubs\/[^/]+\/app)(?:\/|$)/.exec(currentPathname);
  if (scopedMatch) {
    return scopedMatch[1]!;
  }
  if (currentPathname === "/app" || currentPathname.startsWith("/app/")) {
    return "/app";
  }
  return null;
}

function isPathInsideAppScope(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function hrefInsideAppScope(target: URL, root: string) {
  const pathname = root !== "/app"
    && (target.pathname === "/app" || target.pathname.startsWith("/app/"))
    ? `${root}${target.pathname.slice("/app".length)}`
    : target.pathname;
  return isPathInsideAppScope(pathname, root)
    ? `${pathname}${target.search}${target.hash}`
    : null;
}

export function readAppReturnTarget(
  state: unknown,
  currentPathname: string,
  fallback: ReadmatesReturnTarget,
): ReadmatesReturnTarget {
  const root = appScopeRoot(currentPathname);
  if (!root) {
    return fallback;
  }

  const baseOrigin = typeof window === "undefined" ? "https://readmates.local" : window.location.origin;
  const visited = new Set<object>();
  const chain: Array<{ href: string; label: string }> = [];
  let current = state;

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) {
      return fallback;
    }
    visited.add(current);
    const routeState = current as Partial<ReadmatesReturnState>;
    if (typeof routeState.readmatesReturnTo !== "string") {
      return fallback;
    }

    try {
      const target = new URL(routeState.readmatesReturnTo, baseOrigin);
      const href = target.origin === baseOrigin ? hrefInsideAppScope(target, root) : null;
      if (!href) {
        return fallback;
      }
      chain.push({
        href,
        label: typeof routeState.readmatesReturnLabel === "string"
          ? routeState.readmatesReturnLabel
          : "",
      });
    } catch {
      return fallback;
    }

    if (routeState.readmatesReturnState === undefined) {
      let resolved: ReadmatesReturnTarget | null = null;
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        const entry = chain[index]!;
        resolved = {
          href: entry.href,
          label: entry.label,
          ...(resolved ? { state: readmatesReturnState(resolved) } : {}),
        };
      }
      if (!resolved) {
        return fallback;
      }
      return {
        ...resolved,
        label: resolved.label || fallback.label,
      };
    }
    current = routeState.readmatesReturnState;
  }

  return fallback;
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
