import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingJudgmentRail } from "./meeting-judgment-rail";

const judgment = {
  title: "지금 확인할 일",
  summary: "모임 상태와 노출 결과를 확인합니다.",
  checks: [] as string[],
  projections: [
    { audience: "호스트" as const, result: "운영 기록 계속 편집" },
    { audience: "게스트·멤버" as const, result: "허용된 아카이브에서 읽음" },
    { audience: "공개 기록" as const, result: "공개 기록에 게시" },
  ],
};

describe("MeetingJudgmentRail public convergence", () => {
  it("announces committed origin and pending cache purge as separate facts", () => {
    render(
      <MeetingJudgmentRail
        judgment={{
          ...judgment,
          convergence: {
            tone: "pending",
            originLabel: "origin 반영 완료",
            providerLabel: "회수 진행 중",
            expectation: "새로 여는 공개 화면은 최대 120초 안에 반영될 예정입니다.",
            canRetry: false,
            lastAttemptAt: "2026-08-26T04:30:00Z",
          },
        }}
        primaryAction={{ kind: "EDIT", label: "기록 계속 편집" }}
        onPrimaryAction={() => undefined}
      />,
    );

    expect(screen.getByText("origin 반영 완료")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("회수 진행 중");
    expect(screen.queryByRole("button", { name: "공개 캐시 회수 다시 시도" })).not.toBeInTheDocument();
  });

  it("announces provider failure without hiding the origin success and offers bounded retry", () => {
    const onRetry = vi.fn();
    render(
      <MeetingJudgmentRail
        judgment={{
          ...judgment,
          convergence: {
            tone: "failed",
            originLabel: "origin 반영 완료",
            providerLabel: "회수 실패",
            expectation: "원본 반영은 완료됐지만 120초 수렴 목표를 확인하지 못했습니다.",
            canRetry: true,
            lastAttemptAt: "2026-08-26T04:30:00Z",
          },
        }}
        primaryAction={{ kind: "EDIT", label: "기록 계속 편집" }}
        onPrimaryAction={() => undefined}
        onRetryConvergence={onRetry}
      />,
    );

    expect(screen.getByText("origin 반영 완료")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("회수 실패");
    fireEvent.click(screen.getByRole("button", { name: "공개 캐시 회수 다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
