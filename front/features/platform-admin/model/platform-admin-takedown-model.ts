import type { PlatformAdminRole } from "./platform-admin-domain-types";
import { canDo } from "./platform-admin-permissions";
import type {
  ConvergenceView,
  TakedownPreview,
  TakedownReceipt,
} from "../api/platform-admin-takedown-contracts";

export type AdminTakedownState =
  | { kind: "idle" }
  | { kind: "preview"; preview: TakedownPreview }
  | { kind: "confirming"; preview: TakedownPreview }
  | { kind: "origin-denied"; receipt: TakedownReceipt; convergence: ConvergenceView }
  | { kind: "convergence-failed"; receipt: TakedownReceipt; convergence: ConvergenceView };

export function canOperatePublicTakedown(role: PlatformAdminRole): boolean {
  return canDo(role, "emergency_public_takedown");
}

export function normalizeTakedownReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) throw new Error("회수 사유를 입력해 주세요.");
  return normalized;
}

export function remoteCopyLimitationLabel(code: TakedownPreview["limitationCode"]): string {
  if (code === "STORED_OR_OFFLINE_COPY_MAY_REMAIN") {
    return "이미 저장하거나 오프라인으로 보관한 사본은 남아 있을 수 있습니다.";
  }
  return "원격 사본은 별도로 남아 있을 수 있습니다.";
}

export function initialConvergenceFromReceipt(receipt: TakedownReceipt): ConvergenceView {
  return {
    schema: "admin.public_takedown.convergence.v1",
    convergenceId: receipt.convergenceId,
    originResult: receipt.originResult,
    committedGeneration: receipt.committedGeneration,
    status: "PENDING",
    lastAttemptAt: null,
    retryable: false,
    attempts: [],
  };
}

export function stateFromReceipt(
  receipt: TakedownReceipt,
  convergence: ConvergenceView | undefined,
): AdminTakedownState {
  const current = convergence ?? initialConvergenceFromReceipt(receipt);
  return current.status === "FAILED"
    ? { kind: "convergence-failed", receipt, convergence: current }
    : { kind: "origin-denied", receipt, convergence: current };
}
