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

export type TakedownReceiptOutcomeChannel = "bff" | "cdn" | "browser";
export type TakedownReceiptOutcomePresentation = {
  label: string;
  state: "pending" | "unknown";
};

const UNKNOWN_OUTCOME_LABELS: Record<TakedownReceiptOutcomeChannel, string> = {
  bff: "브라우저 앞단 캐시 결과를 확인해야 합니다.",
  cdn: "공개 캐시 결과를 확인해야 합니다.",
  browser: "브라우저 캐시 결과를 확인해야 합니다.",
};

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

export function takedownReceiptOutcomePresentation(
  channel: TakedownReceiptOutcomeChannel,
  value: string,
): TakedownReceiptOutcomePresentation {
  if (channel === "bff" && value === "NOT_STARTED") {
    return {
      label: "브라우저 앞단 캐시 회수는 아직 시작되지 않았습니다.",
      state: "unknown",
    };
  }
  if (channel === "cdn" && value === "QUEUED") {
    return {
      label: "공개 캐시 회수가 대기열에 등록되었습니다.",
      state: "pending",
    };
  }
  if (channel === "browser" && value === "BOUNDED_BY_CACHE_POLICY") {
    return {
      label: "브라우저 캐시는 정책이 허용하는 범위에서 다시 확인됩니다.",
      state: "unknown",
    };
  }
  return { label: UNKNOWN_OUTCOME_LABELS[channel], state: "unknown" };
}

export function takedownReasonRecordLabel(reasonRedacted: boolean): string {
  return reasonRedacted
    ? "회수 사유 원문은 영수증에 남기지 않았습니다."
    : "회수 사유 원문이 영수증에 포함될 수 있습니다.";
}

export function stateFromReceipt(receipt: TakedownReceipt): AdminTakedownState {
  return { kind: "origin-denied", receipt };
}
