import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  PlatformAdminAiOps,
  type PlatformAdminAiOpsJobView,
  type PlatformAdminAiOpsSummaryView,
} from "@/features/platform-admin/ui/platform-admin-ai-ops";

const summary: PlatformAdminAiOpsSummaryView = {
  activeJobCount: 2,
  failedLast24h: 1,
  monthToDateCostEstimateUsd: "0.2000",
  failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 1 }],
  providerCosts: [{ provider: "OPENAI", model: "gpt-model", costEstimateUsd: "0.2000" }],
  staleCandidateCount: 1,
};

const runningJob: PlatformAdminAiOpsJobView = {
  jobId: "job-1",
  club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
  session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
  status: "RUNNING",
  stage: "GENERATING_SUMMARY",
  provider: "OPENAI",
  model: "gpt-model",
  errorCode: null,
  safeErrorMessage: null,
  costEstimateUsd: "0.1200",
  createdAt: "2026-05-18T00:00:00Z",
  lastUpdatedAt: "2026-05-18T00:01:00Z",
  expiresAt: "2026-05-18T06:00:00Z",
  staleCandidate: true,
  availableActions: ["FORCE_CANCEL"],
};

describe("PlatformAdminAiOps", () => {
  it("shows safe aggregate and job metadata without raw content fields", () => {
    render(<PlatformAdminAiOps role="SUPPORT" summary={summary} jobs={[runningJob]} />);

    const section = screen.getByRole("region", { name: "AI 운영" });
    expect(within(section).getByText("Active")).toBeInTheDocument();
    expect(within(section).getByText("2")).toBeInTheDocument();
    expect(within(section).getByText("$0.2000")).toBeInTheDocument();
    expect(within(section).getByText(/읽는사이/)).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Force cancel" })).not.toBeInTheDocument();
    expect(section.textContent).not.toContain("transcript");
    expect(section.textContent).not.toContain("feedbackDocumentMarkdown");
    expect(section.textContent).not.toContain("instructions");
  });

  it("lets owner and operator roles force cancel actionable jobs", async () => {
    const onForceCancel = vi.fn();
    const user = userEvent.setup();

    render(<PlatformAdminAiOps role="OWNER" summary={summary} jobs={[runningJob]} onForceCancel={onForceCancel} />);

    await user.click(screen.getByRole("button", { name: "Force cancel" }));

    expect(onForceCancel).toHaveBeenCalledWith("job-1");
  });

  it("shows errors without hiding the ledger", () => {
    render(<PlatformAdminAiOps role="OPERATOR" summary={summary} jobs={[runningJob]} error="AI Ops 로딩 실패" />);

    expect(screen.getByRole("alert")).toHaveTextContent("AI Ops 로딩 실패");
    expect(screen.getByText(/Book/)).toBeInTheDocument();
  });
});
