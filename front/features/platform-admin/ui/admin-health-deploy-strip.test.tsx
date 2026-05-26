import { render, screen } from "@testing-library/react";
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
    render(<AdminHealthDeployStrip entries={[]} />);

    expect(screen.getByText("아직 기록된 배포가 없습니다.")).toBeInTheDocument();
  });

  it("renders Korean labels for succeeded, failed, and running entries", () => {
    render(
      <AdminHealthDeployStrip
        entries={[
          entry({ finalStatus: "SUCCEEDED", attemptId: "deploy-dev-001" }),
          entry({ finalStatus: "FAILED", attemptId: "deploy-dev-000", imageTag: "readmates-api:previous" }),
          entry({ finalStatus: "RUNNING", attemptId: "deploy-dev-002", imageTag: null, endedAt: null }),
        ]}
      />,
    );

    expect(screen.getByText(/성공/)).toBeInTheDocument();
    expect(screen.getByText(/실패/)).toBeInTheDocument();
    expect(screen.getByText(/진행 중/)).toBeInTheDocument();
  });

  it("uses attempt id, image tag, and started timestamp as visible row context", () => {
    const { container } = render(<AdminHealthDeployStrip entries={[entry()]} />);

    expect(screen.getByText(/deploy-dev-001/)).toBeInTheDocument();
    expect(screen.getByText(/readmates-api:dev-20260526/)).toBeInTheDocument();
    const startedAt = container.querySelector("time");
    expect(startedAt).toHaveAttribute("datetime", "2026-05-26T00:00:00Z");
    expect(startedAt?.textContent).toContain("2026");
  });
});
