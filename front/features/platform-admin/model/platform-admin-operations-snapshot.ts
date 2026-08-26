import type {
  AdminOperationCase,
  AdminOperationCasesResponse,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";

export type AdminOperationsSnapshot = {
  scopeKey: string;
  displayed: AdminOperationCasesResponse;
  latest: AdminOperationCasesResponse;
  pendingNewIds: readonly string[];
  urgentNewCriticalIds: readonly string[];
  pendingRemovalIds: readonly string[];
};

export type AdminOperationsRestoreTarget = {
  selectedId: string | null;
  focusId: string | null;
};

export type AdminOperationsApplyResult = AdminOperationsRestoreTarget & {
  snapshot: AdminOperationsSnapshot;
};

export function createAdminOperationsSnapshot(
  response: AdminOperationCasesResponse,
  scopeKey: string,
): AdminOperationsSnapshot {
  const cloned = cloneResponse(response);
  return {
    scopeKey,
    displayed: cloned,
    latest: cloneResponse(cloned),
    pendingNewIds: [],
    urgentNewCriticalIds: [],
    pendingRemovalIds: [],
  };
}

export function receiveAdminOperationsSnapshot(
  snapshot: AdminOperationsSnapshot,
  latest: AdminOperationCasesResponse,
  scopeKey: string = snapshot.scopeKey,
): AdminOperationsSnapshot {
  if (scopeKey !== snapshot.scopeKey) {
    return createAdminOperationsSnapshot(latest, scopeKey);
  }

  const normalizedLatest = normalizeLatestResponse(snapshot, latest);
  return projectSnapshot(snapshot, normalizedLatest, snapshot.displayed.nextCursor);
}

export function paginateAdminOperationsSnapshot(
  snapshot: AdminOperationsSnapshot,
  latest: AdminOperationCasesResponse,
  continuationIds: readonly string[],
  scopeKey: string = snapshot.scopeKey,
): AdminOperationsSnapshot {
  if (scopeKey !== snapshot.scopeKey) {
    return createAdminOperationsSnapshot(latest, scopeKey);
  }

  const normalizedLatest = normalizeLatestResponse(snapshot, latest);
  const latestById = indexById(normalizedLatest.items);
  const displayedItems = snapshot.displayed.items.map((item) => {
    const incoming = latestById.get(item.id);
    return cloneItem(incoming ?? item);
  });
  const displayedIds = new Set(displayedItems.map((item) => item.id));

  for (const id of continuationIds) {
    if (displayedIds.has(id)) continue;
    const continuation = latestById.get(id);
    if (!continuation) continue;
    displayedItems.push(cloneItem(continuation));
    displayedIds.add(id);
  }

  return finishSnapshot(snapshot, normalizedLatest, displayedItems, normalizedLatest.nextCursor);
}

export function retryAdminOperationsSnapshot(
  snapshot: AdminOperationsSnapshot,
  incoming?: AdminOperationCasesResponse,
): AdminOperationsSnapshot {
  void incoming;
  return cloneSnapshot(snapshot);
}

export function applyPendingAdminOperationsSnapshot(
  snapshot: AdminOperationsSnapshot,
  target: AdminOperationsRestoreTarget,
): AdminOperationsApplyResult {
  const latest = normalizeLatestResponse(snapshot, snapshot.latest);
  const displayedIds = new Set(latest.items.map((item) => item.id));
  const applied: AdminOperationsSnapshot = {
    scopeKey: snapshot.scopeKey,
    displayed: cloneResponse(latest),
    latest: cloneResponse(latest),
    pendingNewIds: [],
    urgentNewCriticalIds: [],
    pendingRemovalIds: [],
  };

  return {
    snapshot: applied,
    selectedId: target.selectedId && displayedIds.has(target.selectedId) ? target.selectedId : null,
    focusId: target.focusId && displayedIds.has(target.focusId) ? target.focusId : null,
  };
}

function projectSnapshot(
  snapshot: AdminOperationsSnapshot,
  latest: AdminOperationCasesResponse,
  nextCursor: string | null,
): AdminOperationsSnapshot {
  const latestById = indexById(latest.items);
  const displayedItems = snapshot.displayed.items.map((item) => {
    const incoming = latestById.get(item.id);
    return cloneItem(incoming ?? item);
  });
  return finishSnapshot(snapshot, latest, displayedItems, nextCursor);
}

function finishSnapshot(
  snapshot: AdminOperationsSnapshot,
  latest: AdminOperationCasesResponse,
  displayedItems: AdminOperationCase[],
  nextCursor: string | null,
): AdminOperationsSnapshot {
  const displayedIds = new Set(displayedItems.map((item) => item.id));
  const latestIds = new Set(latest.items.map((item) => item.id));
  const pendingNewIds = latest.items
    .filter((item) => !displayedIds.has(item.id))
    .map((item) => item.id);
  const pendingRemovalIds = displayedItems
    .filter((item) => !latestIds.has(item.id))
    .map((item) => item.id);
  const pendingNewIdSet = new Set(pendingNewIds);
  const retainedUrgent = snapshot.urgentNewCriticalIds.filter((id) => pendingNewIdSet.has(id));
  const announcedUrgent = new Set(retainedUrgent);
  const newlyUrgent = pendingNewIds.filter((id) => {
    if (announcedUrgent.has(id)) return false;
    return latest.items.find((item) => item.id === id)?.severity === "CRITICAL";
  });

  return {
    scopeKey: snapshot.scopeKey,
    displayed: {
      ...cloneEnvelope(latest),
      items: displayedItems,
      nextCursor,
    },
    latest: cloneResponse(latest),
    pendingNewIds,
    urgentNewCriticalIds: [...retainedUrgent, ...newlyUrgent],
    pendingRemovalIds,
  };
}

function normalizeLatestResponse(
  snapshot: AdminOperationsSnapshot,
  latest: AdminOperationCasesResponse,
): AdminOperationCasesResponse {
  const previousById = new Map<string, AdminOperationCase>();
  for (const item of [...snapshot.latest.items, ...snapshot.displayed.items]) {
    const previous = previousById.get(item.id);
    if (!previous || item.version >= previous.version) previousById.set(item.id, item);
  }

  return {
    ...cloneEnvelope(latest),
    items: latest.items.map((item) => {
      const previous = previousById.get(item.id);
      return previous && previous.version > item.version ? cloneItem(previous) : cloneItem(item);
    }),
    nextCursor: latest.nextCursor,
  };
}

function cloneSnapshot(snapshot: AdminOperationsSnapshot): AdminOperationsSnapshot {
  return {
    scopeKey: snapshot.scopeKey,
    displayed: cloneResponse(snapshot.displayed),
    latest: cloneResponse(snapshot.latest),
    pendingNewIds: [...snapshot.pendingNewIds],
    urgentNewCriticalIds: [...snapshot.urgentNewCriticalIds],
    pendingRemovalIds: [...snapshot.pendingRemovalIds],
  };
}

function cloneResponse(response: AdminOperationCasesResponse): AdminOperationCasesResponse {
  return {
    ...cloneEnvelope(response),
    items: response.items.map(cloneItem),
    nextCursor: response.nextCursor,
  };
}

function cloneEnvelope(
  response: AdminOperationCasesResponse,
): Omit<AdminOperationCasesResponse, "items"> {
  return {
    schema: response.schema,
    generatedAt: response.generatedAt,
    counts: { ...response.counts },
    sources: response.sources.map((source) => ({ ...source })),
    nextCursor: response.nextCursor,
  };
}

function cloneItem(item: AdminOperationCase): AdminOperationCase {
  return {
    ...item,
    allowedActions: [...item.allowedActions],
    source: { ...item.source },
  };
}

function indexById(items: readonly AdminOperationCase[]): Map<string, AdminOperationCase> {
  return new Map(items.map((item) => [item.id, item]));
}
