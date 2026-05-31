import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { HostClubOperationsCard } from "./host-club-operations-card";

function snapshot(overrides: Partial<HostClubOperationsSnapshot> = {}): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-05-31T00:00:00Z",
    club: { clubId: "club-1", slug: "club-one", name: "Club One" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    sessionProgress: { upcomingCount: 1, currentOpenCount: 1, closedCount: 4, publishedRecordCount: 3, incompleteRecordCount: 1 },
    aiUsage: { activeJobs: 1, failedRecentJobs: 3, staleCandidates: 0, costEstimateUsd: "0.5000", state: "DEGRADED", priorFailedJobs7d: 1 },
    ...overrides,
  };
}

describe("HostClubOperationsCard", () => {
  it("renders readiness, session, and AI usage signals read-only", () => {
    render(<HostClubOperationsCard snapshot={snapshot()} />);
    expect(screen.getByText("운영 신호")).toBeInTheDocument();
    expect(screen.getByText(/READY/)).toBeInTheDocument();
    expect(screen.getByText(/AI 실패/)).toBeInTheDocument();
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows blocking reasons when readiness is not ready", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({ readiness: { state: "BLOCKED", blockingReasons: ["HOST_REQUIRED"], nextAction: null } })}
      />,
    );
    expect(screen.getByText(/HOST_REQUIRED/)).toBeInTheDocument();
  });
});
