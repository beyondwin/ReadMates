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

export function hasHostRecordsReturnState(state: unknown): boolean {
  if (!state || typeof state !== "object") {
    return false;
  }
  const routeState = state as Partial<ReadmatesReturnState>;
  if (typeof routeState.readmatesReturnTo === "string") {
    try {
      const pathname = new URL(routeState.readmatesReturnTo, "https://readmates.local").pathname;
      if (/^(?:\/clubs\/[^/]+)?\/app\/host\/records\/?$/.test(pathname)) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return hasHostRecordsReturnState(routeState.readmatesReturnState);
}
