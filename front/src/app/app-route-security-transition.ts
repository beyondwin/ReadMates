import type { ClubWorkspace } from "@/shared/model/app-club-shell";

const committedWorkspaceRouteKey = "readmates:committed-workspace-route";
const legacyPendingWorkspaceTransitionKey = "readmates:pending-workspace-transition";
const receiptMaxAgeMs = 6 * 60 * 60 * 1000;
const pageSessionId = globalThis.crypto?.randomUUID?.()
  ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type CommittedWorkspaceRoute = {
  workspace: ClubWorkspace;
  clubScope: string;
  href: string;
  locationKey: string;
};

type StoredWorkspaceRouteReceipt = CommittedWorkspaceRoute & {
  version: 1;
  pageSessionId: string;
  committedAt: number;
  transitionSource: CommittedWorkspaceRoute | null;
  announcementPending: boolean;
};

let memoryWorkspaceRouteReceipt: StoredWorkspaceRouteReceipt | null = null;

function isWorkspace(value: unknown): value is ClubWorkspace {
  return value === "member" || value === "host";
}

function isCommittedRoute(value: unknown): value is CommittedWorkspaceRoute {
  if (!value || typeof value !== "object") {
    return false;
  }
  const route = value as Partial<CommittedWorkspaceRoute>;
  return isWorkspace(route.workspace)
    && typeof route.clubScope === "string"
    && typeof route.href === "string"
    && typeof route.locationKey === "string";
}

function sameRoute(left: CommittedWorkspaceRoute, right: CommittedWorkspaceRoute) {
  return left.workspace === right.workspace
    && left.clubScope === right.clubScope
    && left.href === right.href
    && left.locationKey === right.locationKey;
}

function isValidStoredReceipt(receipt: unknown): receipt is StoredWorkspaceRouteReceipt {
  if (!receipt || typeof receipt !== "object") {
    return false;
  }
  const candidate = receipt as Partial<StoredWorkspaceRouteReceipt>;
  return candidate.version === 1
    && candidate.pageSessionId === pageSessionId
    && isCommittedRoute(candidate)
    && typeof candidate.committedAt === "number"
    && typeof candidate.announcementPending === "boolean"
    && (candidate.transitionSource === null || isCommittedRoute(candidate.transitionSource))
    && candidate.committedAt <= Date.now()
    && Date.now() - candidate.committedAt <= receiptMaxAgeMs;
}

function readStoredWorkspaceRoute(): StoredWorkspaceRouteReceipt | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(committedWorkspaceRouteKey);
  } catch {
    return isValidStoredReceipt(memoryWorkspaceRouteReceipt)
      ? memoryWorkspaceRouteReceipt
      : null;
  }
  if (!raw) {
    memoryWorkspaceRouteReceipt = null;
    return null;
  }
  try {
    const receipt = JSON.parse(raw) as unknown;
    memoryWorkspaceRouteReceipt = isValidStoredReceipt(receipt) ? receipt : null;
    return memoryWorkspaceRouteReceipt;
  } catch {
    memoryWorkspaceRouteReceipt = null;
    return null;
  }
}

function writeStoredWorkspaceRoute(receipt: StoredWorkspaceRouteReceipt) {
  memoryWorkspaceRouteReceipt = receipt;
  try {
    window.sessionStorage.setItem(committedWorkspaceRouteKey, JSON.stringify(receipt));
    window.sessionStorage.removeItem(legacyPendingWorkspaceTransitionKey);
  } catch {
    // The page-session receipt still covers in-app transitions when storage is unavailable.
  }
}

export function prepareWorkspaceRoute(route: CommittedWorkspaceRoute) {
  const previous = readStoredWorkspaceRoute();
  if (previous && sameRoute(previous, route)) {
    return previous.announcementPending;
  }
  const continuingWorkspaceTransition = previous !== null
    && previous.workspace === route.workspace
    && previous.announcementPending
    && previous.transitionSource !== null;
  const workspaceChanged = previous !== null && previous.workspace !== route.workspace;
  const transitionPending = workspaceChanged || continuingWorkspaceTransition;
  const receipt: StoredWorkspaceRouteReceipt = {
    version: 1,
    pageSessionId,
    committedAt: Date.now(),
    ...route,
    transitionSource: workspaceChanged ? {
      workspace: previous.workspace,
      clubScope: previous.clubScope,
      href: previous.href,
      locationKey: previous.locationKey,
    } : continuingWorkspaceTransition ? previous.transitionSource : null,
    announcementPending: transitionPending,
  };
  writeStoredWorkspaceRoute(receipt);
  return transitionPending;
}

export function consumePreparedWorkspaceTransition(route: CommittedWorkspaceRoute) {
  const receipt = readStoredWorkspaceRoute();
  if (!receipt || !receipt.announcementPending || !sameRoute(receipt, route)) {
    return false;
  }
  writeStoredWorkspaceRoute({
    ...receipt,
    announcementPending: false,
  });
  return true;
}
