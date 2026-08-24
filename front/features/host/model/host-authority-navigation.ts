import type { HostSecurityPurgeCode } from "./host-authority-loss";

export const HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY = "readmatesHostAuthorityLossHandoffId";

type HostAuthorityNavigationLocation = {
  pathname: string;
  state?: unknown;
};

type PendingHostAuthorityNavigation = {
  code: HostSecurityPurgeCode;
  handoffId: string;
  targetPathname: string;
};

let pendingNavigation: PendingHostAuthorityNavigation | null = null;

export function stageHostAuthorityNavigation(
  navigation: PendingHostAuthorityNavigation,
): void {
  pendingNavigation = navigation;
}

function handoffIdFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[HOST_AUTHORITY_LOSS_HANDOFF_STATE_KEY];
  return typeof value === "string" ? value : null;
}

function matchesPendingNavigation(location: HostAuthorityNavigationLocation): boolean {
  const handoffId = handoffIdFromState(location.state);
  return Boolean(
    handoffId
    && pendingNavigation?.targetPathname === location.pathname
    && pendingNavigation.handoffId === handoffId,
  );
}

export function isPendingHostAuthorityNavigation(
  location: HostAuthorityNavigationLocation,
): boolean {
  return matchesPendingNavigation(location);
}

export function consumeHostAuthorityNavigation(
  pathname: string,
  state: unknown,
): HostSecurityPurgeCode | null {
  const location = { pathname, state };
  if (!matchesPendingNavigation(location)) return null;
  const code = pendingNavigation?.code ?? null;
  pendingNavigation = null;
  return code;
}
