import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { HostClubOperationsCard } from "./host-club-operations-card";

function snapshot(overrides: Partial<HostClubOperationsSnapshot> = {}): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-05-31T00:00:00Z",
    club: { clubId: "club-1", slug: "club-one", name: "Club One" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    sessionProgress: {
      upcomingCount: 1,
      currentOpenCount: 1,
      closedCount: 4,
      publishedRecordCount: 3,
      incompleteRecordCount: 0,
    },
    aiUsage: {
      activeJobs: 1,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.5000",
      state: "READY",
      priorFailedJobs7d: 0,
    },
    ...overrides,
  };
}

describe("HostClubOperationsCard", () => {
  it("renders a READY operating judgment with host-safe links", () => {
    render(<HostClubOperationsCard snapshot={snapshot()} />);

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByRole("heading", { name: "운영 신호" })).toBeInTheDocument();
    expect(within(card).getByText("READY")).toBeInTheDocument();
    expect(within(card).getByText("현재 막힌 항목은 없습니다. 열린 세션을 기준으로 운영을 이어갈 수 있습니다.")).toBeInTheDocument();
    expect(within(card).getByText("열린 세션")).toBeInTheDocument();
    expect(within(card).getByText("마감 대기")).toBeInTheDocument();
    expect(within(card).getByText("AI 실패")).toBeInTheDocument();
    expect(within(card).getByText("전주 대비")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "세션 문서 열기" })).toHaveAttribute("href", "/app/host/sessions/new");
    expect(within(card).getByRole("link", { name: "알림 장부 보기" })).toHaveAttribute("href", "/app/host/notifications");
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("prioritizes blocking reasons over other signals", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          readiness: {
            state: "NEEDS_ATTENTION",
            blockingReasons: ["HOST_REQUIRED", "PUBLIC_METADATA_REQUIRED"],
            nextAction: null,
          },
          sessionProgress: {
            upcomingCount: 2,
            currentOpenCount: 1,
            closedCount: 4,
            publishedRecordCount: 3,
            incompleteRecordCount: 2,
          },
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 3,
            staleCandidates: 1,
            costEstimateUsd: "0.7500",
            state: "DEGRADED",
            priorFailedJobs7d: 1,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByText("NEEDS_ATTENTION")).toBeInTheDocument();
    expect(within(card).getByText("운영 준비를 막는 항목이 있습니다. 먼저 차단 사유를 확인하세요.")).toBeInTheDocument();
    expect(within(card).getByText("HOST_REQUIRED")).toBeInTheDocument();
    expect(within(card).getByText("PUBLIC_METADATA_REQUIRED")).toBeInTheDocument();
  });

  it("shows due-record guidance before AI guidance", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          sessionProgress: {
            upcomingCount: 1,
            currentOpenCount: 1,
            closedCount: 5,
            publishedRecordCount: 3,
            incompleteRecordCount: 2,
          },
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 1,
            staleCandidates: 0,
            costEstimateUsd: "0.5000",
            state: "DEGRADED",
            priorFailedJobs7d: 0,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByText("마감 대기 중인 세션 기록이 있습니다. 공개 전 기록 완성을 먼저 확인하세요.")).toBeInTheDocument();
    expect(within(card).getByText("2")).toBeInTheDocument();
  });

  it("shows AI failure delta guidance when recent failures increase", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 3,
            staleCandidates: 0,
            costEstimateUsd: "0.5000",
            state: "DEGRADED",
            priorFailedJobs7d: 1,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).getByText("최근 AI 실패가 늘었습니다. 알림 장부와 세션 준비 상태를 함께 확인하세요.")).toBeInTheDocument();
    expect(within(card).getByText("+2")).toBeInTheDocument();
  });

  it("does not create admin or mutation controls", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({
          readiness: { state: "BLOCKED", blockingReasons: ["AI_RECOVERY_REQUIRED"], nextAction: "ADMIN_ROUTE" },
          aiUsage: {
            activeJobs: 0,
            failedRecentJobs: 5,
            staleCandidates: 2,
            costEstimateUsd: "1.2500",
            state: "DEGRADED",
            priorFailedJobs7d: 0,
          },
        })}
      />,
    );

    const card = screen.getByRole("region", { name: "운영 신호" });
    expect(within(card).queryByText("ADMIN_ROUTE")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).getAllByRole("link")).toHaveLength(2);
  });
});
