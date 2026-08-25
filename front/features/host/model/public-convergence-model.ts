import type { HostPublicConvergenceView } from "@/features/host/api/host-contracts";

export type PublicConvergenceStatus = {
  tone: "pending" | "succeeded" | "failed";
  originLabel: "origin 반영 완료";
  providerLabel: "회수 진행 중" | "회수 완료" | "회수 실패";
  expectation: string;
  canRetry: boolean;
  lastAttemptAt: string | null;
};

export function buildPublicConvergenceStatus(
  view: HostPublicConvergenceView | null | undefined,
): PublicConvergenceStatus | null {
  if (!view) return null;

  if (view.status === "PENDING" || view.status === "QUEUED") {
    return {
      tone: "pending",
      originLabel: "origin 반영 완료",
      providerLabel: "회수 진행 중",
      expectation: "새로 여는 공개 화면은 최대 120초 안에 반영될 예정입니다.",
      canRetry: false,
      lastAttemptAt: view.lastAttemptAt,
    };
  }
  if (view.status === "FAILED" || view.status === "EXPIRED") {
    return {
      tone: "failed",
      originLabel: "origin 반영 완료",
      providerLabel: "회수 실패",
      expectation: "원본 반영은 완료됐지만 120초 수렴 목표를 확인하지 못했습니다.",
      canRetry: view.status === "FAILED" && view.retryable,
      lastAttemptAt: view.lastAttemptAt,
    };
  }
  return {
    tone: "succeeded",
    originLabel: "origin 반영 완료",
    providerLabel: "회수 완료",
    expectation: "새로 여는 공개 화면의 회수가 완료되었습니다.",
    canRetry: false,
    lastAttemptAt: view.lastAttemptAt,
  };
}
