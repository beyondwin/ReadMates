import { describe, expect, it } from "vitest";
import { buildPublicConvergenceStatus } from "./public-convergence-model";

const baseView = {
  convergenceId: "10000000-0000-4000-8000-000000000001",
  originResult: "APPLIED" as const,
  committedGeneration: 7,
  lastAttemptAt: "2026-08-26T04:30:00Z",
};

describe("buildPublicConvergenceStatus", () => {
  it("keeps origin success distinct from a provider purge that is still pending", () => {
    expect(buildPublicConvergenceStatus({
      ...baseView,
      status: "PENDING",
      retryable: false,
    })).toEqual({
      tone: "pending",
      originLabel: "origin 반영 완료",
      providerLabel: "회수 진행 중",
      expectation: "새로 여는 공개 화면은 최대 120초 안에 반영될 예정입니다.",
      canRetry: false,
      lastAttemptAt: "2026-08-26T04:30:00Z",
    });
  });

  it("renders provider failure honestly without turning the committed mutation into a failure", () => {
    expect(buildPublicConvergenceStatus({
      ...baseView,
      status: "FAILED",
      retryable: true,
    })).toEqual({
      tone: "failed",
      originLabel: "origin 반영 완료",
      providerLabel: "회수 실패",
      expectation: "원본 반영은 완료됐지만 120초 수렴 목표를 확인하지 못했습니다.",
      canRetry: true,
      lastAttemptAt: "2026-08-26T04:30:00Z",
    });
  });

  it("allows retry only for a retryable terminal failure", () => {
    expect(buildPublicConvergenceStatus({
      ...baseView,
      status: "FAILED",
      retryable: false,
    }).canRetry).toBe(false);
    expect(buildPublicConvergenceStatus({
      ...baseView,
      status: "SUCCEEDED",
      retryable: true,
    })).toMatchObject({
      tone: "succeeded",
      originLabel: "origin 반영 완료",
      providerLabel: "회수 완료",
      canRetry: false,
    });
  });

  it("maps the durable queue and expired work states without reporting success", () => {
    expect(buildPublicConvergenceStatus({
      ...baseView,
      originResult: "DENIED",
      status: "QUEUED",
      retryable: false,
    })).toMatchObject({ tone: "pending", providerLabel: "회수 진행 중" });
    expect(buildPublicConvergenceStatus({
      ...baseView,
      originResult: "DENIED",
      status: "EXPIRED",
      retryable: false,
    })).toMatchObject({ tone: "failed", providerLabel: "회수 실패", canRetry: false });
  });
});
