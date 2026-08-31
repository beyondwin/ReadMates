import type { RecoveryObservation } from "@/shared/model/global-space";
import {
  advanceAdminOperationsSnapshot,
  applyPendingAdminOperationsSnapshot,
  type AdminOperationsSnapshot,
} from "./platform-admin-operations-snapshot";
import type { AdminOperationCasesResponse } from "../api/platform-admin-operations-contracts";

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
  | { type: "selection-changed"; caseId: string | null }
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
      if (state.selectedCaseId === action.caseId) return state;
      return {
        ...state,
        selectedCaseId: action.caseId,
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
      const index = action.visibleIds.indexOf(action.selectedId);
      const nextId = index >= 0 ? action.visibleIds[index + 1] ?? null : null;
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

const resetActionState: Pick<
  AdminTodayState,
  "actionState" | "actionMessage" | "mutationTarget" | "permissionDenied"
> = {
  actionState: "ready",
  actionMessage: null,
  mutationTarget: null,
  permissionDenied: false,
};
