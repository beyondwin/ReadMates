import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DeployAttemptStripEntry } from "@/features/platform-admin/model/platform-admin-health-model";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";

function entry(overrides: Partial<DeployAttemptStripEntry> = {}): DeployAttemptStripEntry {
  return {
    attemptId: "deploy-dev-001",
    startedAt: "2026-05-26T00:00:00Z",
    endedAt: "2026-05-26T00:02:00Z",
    finalStatus: "SUCCEEDED",
    imageTag: "readmates-api:dev-20260526",
    durationSeconds: 120,
    ...overrides,
  };
}

describe("AdminHealthDeployStrip", () => {
  it("renders an empty message when no deploy entries exist", () => {
    render(<AdminHealthDeployStrip entries={[]} evidenceState="empty" />);

    expect(screen.getByText("아직 기록된 배포가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("배포 원장을 확인할 수 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("성공")).not.toBeInTheDocument();
  });

  it("does not treat a missing ledger as an empty success history", () => {
    render(<AdminHealthDeployStrip entries={null} evidenceState="unavailable" />);

    expect(screen.getByText("배포 원장을 확인할 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("아직 기록된 배포가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("성공")).not.toBeInTheDocument();
    expect(document.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
  });

  it("treats a disabled ledger as configured absence", () => {
    render(<AdminHealthDeployStrip entries={null} evidenceState="disabled" />);

    expect(screen.getByText("배포 기록은 사용 안 함 상태입니다.")).toBeInTheDocument();
    expect(screen.queryByText("배포 원장을 확인할 수 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("성공")).not.toBeInTheDocument();
  });

  it("renders Korean labels for succeeded, failed, and running entries", () => {
    render(
      <AdminHealthDeployStrip
        evidenceState="ok"
        entries={[
          entry({ finalStatus: "SUCCEEDED", attemptId: "deploy-dev-001" }),
          entry({ finalStatus: "FAILED", attemptId: "deploy-dev-000", imageTag: "readmates-api:previous" }),
          entry({ finalStatus: "RUNNING", attemptId: "deploy-dev-002", imageTag: null, endedAt: null }),
        ]}
      />,
    );

    expect(screen.getByText("배포 성공")).toBeInTheDocument();
    expect(screen.getByText("배포 실패")).toBeInTheDocument();
    expect(screen.getByText("배포 진행 중")).toBeInTheDocument();
    expect(document.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
  });

  it("keeps last-known-good rows without current-green evidence or action chrome", () => {
    render(
      <AdminHealthDeployStrip evidenceState="ok" lastKnown entries={[entry()]} />,
    );

    expect(screen.getByText(/deploy-dev-001/)).toBeInTheDocument();
    expect(document.querySelector(".admin-health-deploy-strip__dot--ok")).toBeNull();
    expect(document.querySelector(".admin-health-deploy-strip__dot--last-known")).not.toBeNull();
    expect(document.querySelector(".admin-action-dock")).toBeNull();
    expect(document.querySelector(".admin-receipt-timeline")).toBeNull();
  });

  it("keeps attempt id and image tag inside technical disclosure", () => {
    const { container } = render(<AdminHealthDeployStrip evidenceState="ok" entries={[entry()]} />);

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("배포 성공")).toBeInTheDocument();
    const disclosure = within(row).getByRole("group", { name: "기술 정보" });
    expect(within(disclosure).getByText("deploy-dev-001")).toBeInTheDocument();
    expect(within(disclosure).getByText("readmates-api:dev-20260526")).toBeInTheDocument();
    expect(row.querySelector(".admin-health-deploy-strip__title")?.textContent).toBe("배포 성공");
    const startedAt = container.querySelector("time");
    expect(startedAt).toHaveAttribute("datetime", "2026-05-26T00:00:00Z");
    expect(startedAt?.textContent).toContain("2026");
  });

  it("does not render an invalid started timestamp as NaN", () => {
    render(<AdminHealthDeployStrip evidenceState="ok" entries={[entry({ startedAt: "not-a-date" })]} />);

    expect(screen.getByText("시각 확인 불가")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
