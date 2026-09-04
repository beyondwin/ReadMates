import type { RecoveryObservation } from "@/shared/model/global-space";
import {
  advanceAdminOperationsSnapshot,
  applyPendingAdminOperationsSnapshot,
  type AdminOperationsSnapshot,
} from "./platform-admin-operations-snapshot";
import type {
  AdminOperationCaseFilter,
  AdminOperationCasesResponse,
} from "../api/platform-admin-operations-contracts";
import {
  buildAdminOperationsView,
  filterAdminOperationItems,
  type AdminOperationsSearchState,
  type AdminOperationsView,
} from "./platform-admin-operations-model";

export type AdminTodayActionState =
  | "ready"
  | "pending"
  | "complete"
  | "stale"
  | "conflict"
  | "unknown-outcome"
  | "forbidden";

export type AdminTodayActionMessage = {
  kind: "success" | "error" | "conflict" | "unknown-outcome";
  text: string;
};

export type AdminTodayMutationTarget = {
  caseId: string;
  version: number;
  confirmationKey: string;
};

export type AdminTodayState = {
  snapshot: AdminOperationsSnapshot | null;
  observedPageCount: number;
  selectedCaseId: string | null;
  announcedUrgentIds: readonly string[];
  urgentAnnouncement: string | null;
  authorityLost: boolean;
  permissionDenied: boolean;
  mutationTarget: AdminTodayMutationTarget | null;
  actionState: AdminTodayActionState;
  actionMessage: AdminTodayActionMessage | null;
  focusQueueSummary: boolean;
};

export type AdminTodayAction =
  | {
      type: "list-observed";
      response: AdminOperationCasesResponse;
      scopeKey: string;
      pageCount: number;
      failed: boolean;
    }
  | { type: "selection-changed"; caseId: string | null; explicit?: boolean }
  | { type: "pending-accepted" }
  | { type: "urgent-announcement-cleared" }
  | { type: "mutation-started"; target: AdminTodayMutationTarget }
  | { type: "mutation-succeeded" }
  | { type: "mutation-conflict" }
  | { type: "mutation-error"; message: string }
  | { type: "mutation-unknown"; message: string }
  | { type: "mutation-permission-lost" }
  | { type: "mutation-ready" }
  | {
      type: "authoritative-recovery-completed";
      outcome: RecoveryObservation["outcome"];
    }
  | { type: "confirmation-changed"; confirmationKey: string | null }
  | {
      type: "queue-exit-completed";
      visibleIds: readonly string[];
      selectedId: string;
    }
  | { type: "queue-summary-focus-consumed" }
  | { type: "authority-lost" };

export function createAdminTodayState(
  selectedCaseId: string | null = null,
): AdminTodayState {
  return {
    snapshot: null,
    observedPageCount: 0,
    selectedCaseId,
    announcedUrgentIds: [],
    urgentAnnouncement: null,
    authorityLost: false,
    permissionDenied: false,
    mutationTarget: null,
    actionState: "ready",
    actionMessage: null,
    focusQueueSummary: false,
  };
}

export function adminTodayReducer(
  state: AdminTodayState,
  action: AdminTodayAction,
): AdminTodayState {
  switch (action.type) {
    case "list-observed": {
      const scopeChanged = state.snapshot?.scopeKey !== action.scopeKey;
      const snapshot = advanceAdminOperationsSnapshot(state.snapshot, {
        response: action.response,
        scopeKey: action.scopeKey,
        pageCount: action.pageCount,
        previousPageCount: scopeChanged ? 0 : state.observedPageCount,
        failed: action.failed,
      });
      const announcedUrgentIds = scopeChanged ? [] : state.announcedUrgentIds;
      const freshUrgentIds = snapshot.urgentNewCriticalIds.filter(
        (id) => !announcedUrgentIds.includes(id),
      );
      return {
        ...state,
        snapshot,
        observedPageCount: action.pageCount,
        announcedUrgentIds: [...announcedUrgentIds, ...freshUrgentIds],
        urgentAnnouncement: freshUrgentIds.length > 0
          ? `새 긴급 신호 ${freshUrgentIds.length}건`
          : scopeChanged
            ? null
            : state.urgentAnnouncement,
        ...(scopeChanged ? resetActionState : {}),
      };
    }
    case "selection-changed": {
      const releasesCompletedPin = Boolean(
        action.explicit
        && state.mutationTarget
        && state.mutationTarget.caseId !== action.caseId
        && state.actionMessage?.kind === "success",
      );
      if (state.selectedCaseId === action.caseId && !releasesCompletedPin) return state;
      const releasedSnapshot = releasesCompletedPin && state.snapshot && state.mutationTarget
        ? releaseCompletedMutationSnapshot(state.snapshot, state.mutationTarget.caseId)
        : null;
      return {
        ...state,
        snapshot: releasedSnapshot ?? state.snapshot,
        selectedCaseId: action.caseId,
        mutationTarget: releasesCompletedPin ? null : state.mutationTarget,
        actionState: "ready",
        actionMessage: null,
        focusQueueSummary: false,
      };
    }
    case "pending-accepted": {
      if (!state.snapshot) return state;
      const applied = applyPendingAdminOperationsSnapshot(state.snapshot, {
        selectedId: state.selectedCaseId,
        focusId: state.selectedCaseId,
      });
      return {
        ...state,
        snapshot: applied.snapshot,
        selectedCaseId: applied.selectedId,
        announcedUrgentIds: [],
        urgentAnnouncement: null,
      };
    }
    case "urgent-announcement-cleared":
      return state.urgentAnnouncement === null
        ? state
        : { ...state, urgentAnnouncement: null };
    case "mutation-started":
      return {
        ...state,
        mutationTarget: action.target,
        actionState: "pending",
        actionMessage: null,
        focusQueueSummary: false,
      };
    case "mutation-succeeded":
      return {
        ...state,
        actionState: "complete",
        actionMessage: { kind: "success", text: "케이스 상태를 반영했습니다." },
      };
    case "mutation-conflict":
      return {
        ...state,
        actionState: "conflict",
        actionMessage: { kind: "conflict", text: "최신 상태 확인이 필요합니다." },
      };
    case "mutation-error":
      return {
        ...state,
        actionState: "ready",
        actionMessage: { kind: "error", text: action.message },
      };
    case "mutation-unknown":
      return {
        ...state,
        actionState: "unknown-outcome",
        actionMessage: { kind: "unknown-outcome", text: action.message },
      };
    case "mutation-permission-lost":
      return {
        ...state,
        permissionDenied: true,
        actionState: "forbidden",
        actionMessage: null,
      };
    case "mutation-ready":
      return {
        ...state,
        actionState: "ready",
        actionMessage: null,
      };
    case "authoritative-recovery-completed":
      if (action.outcome === "succeeded") {
        return {
          ...state,
          actionState: "complete",
          actionMessage: { kind: "success", text: "케이스 상태를 반영했습니다." },
        };
      }
      if (action.outcome === "failed") {
        return {
          ...state,
          actionState: "ready",
          actionMessage: {
            kind: "error",
            text: "상태를 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
          },
        };
      }
      return state;
    case "confirmation-changed":
      if (
        state.actionState !== "complete"
        || !state.mutationTarget
        || action.confirmationKey === null
        || action.confirmationKey === state.mutationTarget.confirmationKey
      ) {
        return state;
      }
      return {
        ...state,
        actionState: "ready",
      };
    case "queue-exit-completed": {
      const nextId = nextAdminTodayCaseId(action.visibleIds, action.selectedId);
      return {
        ...state,
        selectedCaseId: nextId ?? action.selectedId,
        focusQueueSummary: nextId === null,
      };
    }
    case "queue-summary-focus-consumed":
      return state.focusQueueSummary
        ? { ...state, focusQueueSummary: false }
        : state;
    case "authority-lost":
      return {
        ...createAdminTodayState(),
        authorityLost: true,
        permissionDenied: true,
        actionState: "forbidden",
      };
  }
}

function releaseCompletedMutationSnapshot(
  snapshot: AdminOperationsSnapshot,
  mutationCaseId: string,
): AdminOperationsSnapshot {
  const latestMutationCase = snapshot.latest.items.find(
    (item) => item.id === mutationCaseId,
  );
  const displayedItems = snapshot.displayed.items.flatMap((item) => {
    if (item.id !== mutationCaseId) return [item];
    if (!latestMutationCase) return [];
    return [{
      ...latestMutationCase,
      allowedActions: [...latestMutationCase.allowedActions],
      source: { ...latestMutationCase.source },
    }];
  });

  return {
    ...snapshot,
    displayed: {
      ...snapshot.displayed,
      items: displayedItems,
    },
    pendingRemovalIds: snapshot.pendingRemovalIds.filter(
      (id) => id !== mutationCaseId,
    ),
  };
}

export function nextAdminTodayCaseId(
  visibleIds: readonly string[],
  selectedId: string,
): string | null {
  const index = visibleIds.indexOf(selectedId);
  return index >= 0 ? visibleIds[index + 1] ?? null : null;
}

export function buildAdminTodayView(
  snapshot: AdminOperationsSnapshot,
  searchState: AdminOperationsSearchState,
  now?: Date,
  pinnedCaseId: string | null = null,
): AdminOperationsView {
  const clock = now ?? new Date(snapshot.displayed.generatedAt);
  const built = buildAdminOperationsView(
    snapshot.displayed,
    searchState.caseId,
    clock,
    new Map(),
    "preserve",
  );
  const filteredItems = filterAdminOperationItems(built.items, searchState, clock);
  const items = pinnedCaseId === searchState.caseId
    ? built.items.filter((item) => item.id === pinnedCaseId || filteredItems.includes(item))
    : filteredItems;
  const requested = searchState.caseId
    ? items.find((item) => item.id === searchState.caseId) ?? null
    : null;
  const selectionExcluded = searchState.caseId !== null && requested === null;
  const selectedCase = searchState.caseId === null ? items[0] ?? null : requested;
  return {
    ...built,
    items,
    selectedCase,
    selectedCaseId: selectedCase?.id ?? null,
    selectionExcluded,
    selectionFellBack: selectionExcluded,
    workViews: built.workViews,
  };
}

export function isAdminTodayPostMutationAuthoritative(input: {
  detail: { status: string; dataUpdatedAt: number; data?: unknown } | undefined;
  list: { status: string; dataUpdatedAt: number } | undefined;
  beforeDetailAt: number;
  beforeListAt: number;
  expectedMinVersion: number;
}): boolean {
  if (!input.detail || input.detail.status !== "success") return false;
  if (!input.list || input.list.status !== "success") return false;
  if (input.detail.dataUpdatedAt <= input.beforeDetailAt) return false;
  if (input.list.dataUpdatedAt <= input.beforeListAt) return false;
  const version = (input.detail.data as { item?: { version?: number } } | undefined)?.item?.version;
  return typeof version === "number" && version > input.expectedMinVersion;
}

export function deriveAdminTodayCommandState(input: {
  permissionDenied: boolean;
  actionState: AdminTodayActionState;
  mutationPending: boolean;
  detailBehindList: boolean;
  pendingRemoval: boolean;
  nonAuthoritative: boolean;
}): AdminTodayActionState {
  if (input.permissionDenied) return "forbidden";
  if (input.actionState === "unknown-outcome") return "unknown-outcome";
  if (input.actionState === "conflict") return "conflict";
  if (input.actionState === "complete") return "complete";
  if (input.mutationPending || input.actionState === "pending") return "pending";
  if (input.detailBehindList || input.pendingRemoval || input.nonAuthoritative) return "stale";
  return "ready";
}

export function adminTodayCommandReasonCopy(
  state: AdminTodayActionState,
): string | undefined {
  if (state === "stale") return "최신 상태가 아닙니다. 다시 확인한 뒤 작업을 이어가세요.";
  if (state === "unknown-outcome") {
    return "명령 응답을 확인하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  if (state === "conflict") {
    return "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.";
  }
  return undefined;
}

export function adminTodayFiltersFrom(filter: AdminOperationCaseFilter) {
  return {
    state: filter.states?.[0]?.toLowerCase() ?? "",
    severity: filter.severities?.[0]?.toLowerCase() ?? "",
    source: filter.sources?.[0]?.toLowerCase() ?? "",
    assignee: filter.assignee?.toLowerCase() ?? "",
  };
}

const resetActionState: Pick<
  AdminTodayState,
  "actionState" | "actionMessage" | "mutationTarget" | "permissionDenied"
> = {
  actionState: "ready",
  actionMessage: null,
  mutationTarget: null,
  permissionDenied: false,
};
