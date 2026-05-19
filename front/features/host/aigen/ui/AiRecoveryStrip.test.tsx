import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AiRecentJobResponse } from "@/features/host/aigen/api/aigen-contracts";
import { AiRecoveryStrip } from "./AiRecoveryStrip";

const job: AiRecentJobResponse = {
  jobId: "job-1",
  status: "SUCCEEDED",
  stage: "READY",
  progressPct: 100,
  model: "claude-sonnet-4-6",
  error: null,
  costEstimateUsd: "0.12",
  createdAt: "2026-05-18T00:00:00Z",
  lastUpdatedAt: "2026-05-18T00:01:00Z",
  expiresAt: "2026-05-18T06:00:00Z",
  availableActions: ["POLL", "CANCEL", "COMMIT_RETRY", "START_NEW"],
};

describe("AiRecoveryStrip", () => {
  it("renders safe job status and invokes action callbacks", async () => {
    const onCommitRetry = vi.fn();
    const onResumePolling = vi.fn();

    render(
      <AiRecoveryStrip
        job={job}
        onResumePolling={onResumePolling}
        onCancel={vi.fn()}
        onCommitRetry={onCommitRetry}
        onStartNew={vi.fn()}
      />,
    );

    expect(screen.getByText("SUCCEEDED")).toBeInTheDocument();
    expect(screen.getByText(/READY/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Polling 재개" }));
    await userEvent.click(screen.getByRole("button", { name: "Commit 재시도" }));

    expect(onResumePolling).toHaveBeenCalledWith("job-1");
    expect(onCommitRetry).toHaveBeenCalledWith("job-1");
  });

  it("renders nothing when there is no recent job", () => {
    const { container } = render(
      <AiRecoveryStrip
        job={null}
        onResumePolling={vi.fn()}
        onCancel={vi.fn()}
        onCommitRetry={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
