import { canAdmin, type PlatformAdminCapabilities } from "./platform-admin-capabilities";
import type {
  TakedownPreview,
  TakedownPreviewRequest,
  TakedownReceipt,
  TakedownReasonCategory,
} from "../api/platform-admin-takedown-contracts";

export type { TakedownPreviewRequest, TakedownReasonCategory };

export type AdminTakedownState =
  | { kind: "idle" }
  | { kind: "preview"; preview: TakedownPreview }
  | { kind: "confirming"; preview: TakedownPreview }
  | { kind: "origin-denied"; receipt: TakedownReceipt };

export function canOperatePublicTakedown(
  capabilities: PlatformAdminCapabilities | null | undefined,
): boolean {
  return capabilities != null && canAdmin(capabilities, "EMERGENCY_PUBLIC_TAKEDOWN");
}

export function normalizeTakedownReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) throw new Error("회수 사유를 입력해 주세요.");
  return normalized;
}

export function remoteCopyLimitationLabel(limitation: string): string {
  return limitation;
}

export function stateFromReceipt(receipt: TakedownReceipt): AdminTakedownState {
  return { kind: "origin-denied", receipt };
}
