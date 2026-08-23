import type { ClubWorkspace } from "@/shared/model/app-club-shell";

const committedWorkspaceRouteKey = "readmates:committed-workspace-route";
const legacyPendingWorkspaceTransitionKey = "readmates:pending-workspace-transition";
const receiptMaxAgeMs = 6 * 60 * 60 * 1000;

export type CommittedWorkspaceRoute = {
  workspace: ClubWorkspace;
  clubScope: string;
  href: string;
  locationKey: string;
};

export type WorkspaceRouteReceipt = CommittedWorkspaceRoute & {
  version: 1;
  pageSessionId: string;
  committedAt: number;
  transitionSource: CommittedWorkspaceRoute | null;
  announcementPending: boolean;
};

type ReceiptContext = {
  pageSessionId: string;
  now: number;
};

type RouteReceiptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type WorkspaceRouteTransitionStore = {
  prepare: (route: CommittedWorkspaceRoute) => boolean;
  consume: (route: CommittedWorkspaceRoute) => boolean;
};

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

function readPersistedReceipt(
  raw: string | null,
  pageSessionId: string,
  now: number,
): WorkspaceRouteReceipt | null {
  if (!raw) {
    return null;
  }
  try {
    const candidate = JSON.parse(raw) as Partial<WorkspaceRouteReceipt>;
    return candidate.version === 1
      && candidate.pageSessionId === pageSessionId
      && isCommittedRoute(candidate)
      && typeof candidate.committedAt === "number"
      && typeof candidate.announcementPending === "boolean"
      && (candidate.transitionSource === null || isCommittedRoute(candidate.transitionSource))
      && candidate.committedAt <= now
      && now - candidate.committedAt <= receiptMaxAgeMs
      ? candidate as WorkspaceRouteReceipt
      : null;
  } catch {
    return null;
  }
}

export function prepareWorkspaceRouteReceipt(
  previous: WorkspaceRouteReceipt | null,
  route: CommittedWorkspaceRoute,
  context: ReceiptContext,
) {
  if (previous && sameRoute(previous, route)) {
    return {
      receipt: previous,
      announcementPending: previous.announcementPending,
    };
  }

  const workspaceChanged = previous !== null && previous.workspace !== route.workspace;
  const receipt: WorkspaceRouteReceipt = {
    version: 1,
    pageSessionId: context.pageSessionId,
    committedAt: context.now,
    ...route,
    transitionSource: workspaceChanged ? {
      workspace: previous.workspace,
      clubScope: previous.clubScope,
      href: previous.href,
      locationKey: previous.locationKey,
    } : null,
    announcementPending: workspaceChanged,
  };
  return { receipt, announcementPending: workspaceChanged };
}

export function consumeWorkspaceRouteReceipt(
  receipt: WorkspaceRouteReceipt | null,
  route: CommittedWorkspaceRoute,
) {
  if (!receipt || !receipt.announcementPending || !sameRoute(receipt, route)) {
    return { receipt, consumed: false };
  }
  return {
    receipt: { ...receipt, announcementPending: false },
    consumed: true,
  };
}

function browserSessionStorage(): RouteReceiptStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function createWorkspaceRouteTransitionStore({
  storage = browserSessionStorage(),
  pageSessionId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  now = Date.now,
}: {
  storage?: RouteReceiptStorage | null;
  pageSessionId?: string;
  now?: () => number;
} = {}): WorkspaceRouteTransitionStore {
  let memoryReceipt: WorkspaceRouteReceipt | null = null;

  const read = () => {
    if (memoryReceipt) {
      return memoryReceipt;
    }
    if (!storage) {
      return null;
    }
    try {
      memoryReceipt = readPersistedReceipt(
        storage.getItem(committedWorkspaceRouteKey),
        pageSessionId,
        now(),
      );
      return memoryReceipt;
    } catch {
      return null;
    }
  };

  const write = (receipt: WorkspaceRouteReceipt) => {
    memoryReceipt = receipt;
    if (!storage) {
      return;
    }
    try {
      storage.setItem(committedWorkspaceRouteKey, JSON.stringify(receipt));
      storage.removeItem(legacyPendingWorkspaceTransitionKey);
    } catch {
      // Page-session memory is authoritative; storage is only a reload mirror.
    }
  };

  return {
    prepare(route) {
      const prepared = prepareWorkspaceRouteReceipt(read(), route, {
        pageSessionId,
        now: now(),
      });
      write(prepared.receipt);
      return prepared.announcementPending;
    },
    consume(route) {
      const consumed = consumeWorkspaceRouteReceipt(read(), route);
      if (consumed.receipt) {
        write(consumed.receipt);
      }
      return consumed.consumed;
    },
  };
}

const appRouteTransitionStore = createWorkspaceRouteTransitionStore();

export function prepareWorkspaceRoute(route: CommittedWorkspaceRoute) {
  return appRouteTransitionStore.prepare(route);
}

export function consumePreparedWorkspaceTransition(route: CommittedWorkspaceRoute) {
  return appRouteTransitionStore.consume(route);
}
