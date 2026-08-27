import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  PlatformAdminAiOps,
  type PlatformAdminAiOpsCommandState,
  type PlatformAdminAiOpsJobView,
  type PlatformAdminAiOpsSummaryView,
} from "@/features/platform-admin/ui/platform-admin-ai-ops";

const LEDGER_CSS = readFileSync(
  path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"),
  "utf8",
);

const summary: PlatformAdminAiOpsSummaryView = {
  activeJobCount: 2,
  failedLast24h: 1,
  monthToDateCostEstimateUsd: "0.2000",
  failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 1 }],
  providerCosts: [{ provider: "OPENAI", model: "gpt-model", costEstimateUsd: "0.2000" }],
  staleCandidateCount: 1,
  costTrend: {
    window: "30d",
    currentCostUsd: "0.0000",
    priorCostUsd: "0.0000",
    currentJobCount: 0,
    priorJobCount: 0,
    deltaDirection: "NONE",
    availability: "NOT_ENOUGH_DATA",
  },
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

const committingJob: PlatformAdminAiOpsJobView = {
  ...runningJob,
  jobId: "job-2",
  status: "COMMITTING",
  stage: "READY",
  availableActions: ["FORCE_CANCEL", "RETRY_COMMIT"],
  revision: 2,
  cleanupPending: true,
};

const reviewState: PlatformAdminAiOpsCommandState = {
  phase: "REVIEW",
  job: runningJob,
  action: "FORCE_CANCEL",
  idempotencyKey: "preview-1",
  preview: {
    previewId: "preview-1",
    jobId: "job-1",
    action: "FORCE_CANCEL",
    jobStatus: "RUNNING",
    jobRevision: 7,
    effectType: "AI_JOB_CANCEL",
    impactCodes: ["CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD"],
    expiresAt: "2026-08-25T01:00:00Z",
    fingerprintPrefix: "00112233",
  },
};

describe("PlatformAdminAiOps", () => {
  it("shows safe aggregate and job metadata without raw content fields", () => {
    render(<PlatformAdminAiOps role="SUPPORT" summary={summary} jobs={[runningJob]} />);

    const section = screen.getByRole("region", { name: "AI 운영" });
    expect(within(section).getByText("Active")).toBeInTheDocument();
    expect(within(section).getByText("2")).toBeInTheDocument();
    expect(within(section).getByText("$0.2000")).toBeInTheDocument();
    expect(within(section).getByText(/읽는사이/)).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "강제 취소 검토" })).not.toBeInTheDocument();
    expect(section.textContent).not.toContain("transcript");
    expect(section.textContent).not.toContain("feedbackDocumentMarkdown");
    expect(section.textContent).not.toContain("instructions");
  });

  it("shows recovery revision and cleanup state without exposing generation content", () => {
    render(<PlatformAdminAiOps role="OWNER" summary={summary} jobs={[committingJob]} />);

    const section = screen.getByRole("region", { name: "AI 운영" });
    expect(within(section).getByText(/revision 2/)).toBeInTheDocument();
    expect(within(section).getByText(/cleanup pending/)).toBeInTheDocument();
    expect(section.textContent).not.toContain("transcript");
    expect(section.textContent).not.toContain("evidence");
    expect(section.textContent).not.toContain("result");
  });

  it("opens preview instead of executing an actionable job", async () => {
    const onRequestPreview = vi.fn();
    const user = userEvent.setup();

    render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        onRequestPreview={onRequestPreview}
      />,
    );

    await user.click(screen.getByRole("button", { name: "강제 취소 검토" }));

    expect(onRequestPreview).toHaveBeenCalledWith("job-1", "FORCE_CANCEL");
  });

  it("shows a focus-safe impact review and requires an explicit final confirmation", async () => {
    const onConfirmCommand = vi.fn();
    const onDismissCommand = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        commandState={reviewState}
        commandTrigger={trigger}
        onConfirmCommand={onConfirmCommand}
        onDismissCommand={onDismissCommand}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "강제 취소 확인" });
    expect(within(dialog).getByText("RUNNING · revision 7")).toBeInTheDocument();
    expect(within(dialog).getByText("DELETE_TRANSIENT_PAYLOAD")).toBeInTheDocument();
    expect(within(dialog).getByText(/00112233/)).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.click(within(dialog).getByRole("button", { name: "강제 취소 확인" }));
    expect(onConfirmCommand).toHaveBeenCalledTimes(1);
    trigger.remove();
  });

  it("keeps an ambiguous command open for same-key reconciliation and shows its receipt", async () => {
    const onRetrySameCommand = vi.fn();
    const unknown: PlatformAdminAiOpsCommandState = {
      ...reviewState,
      phase: "UNKNOWN",
      message: "명령 응답을 확인하지 못했습니다. 같은 명령으로 다시 확인해 주세요.",
      code: "NETWORK_UNKNOWN",
    };
    const { rerender } = render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        commandState={unknown}
        onRetrySameCommand={onRetrySameCommand}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "같은 명령으로 다시 확인" }));
    expect(onRetrySameCommand).toHaveBeenCalledTimes(1);

    rerender(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        onRetrySameCommand={onRetrySameCommand}
        commandState={{
          ...reviewState,
          phase: "RECEIPT",
          receipt: {
            receiptId: "receipt-1",
            previewId: "preview-1",
            jobId: "job-1",
            action: "FORCE_CANCEL",
            beforeJobStatus: "RUNNING",
            beforeJobRevision: 7,
            afterJobStatus: "RUNNING",
            afterJobRevision: 7,
            originStatus: "ACCEPTED",
            effectStatus: "PENDING",
            safeErrorCode: "AI_EFFECT_UNAVAILABLE",
          },
        }}
      />,
    );

    const receipt = screen.getByRole("status", { name: "AI 명령 영수증" });
    expect(within(receipt).getByText(/receipt-1/)).toBeInTheDocument();
    expect(within(receipt).getByText(/PENDING/)).toBeInTheDocument();
    expect(within(receipt).getByText(/AI_EFFECT_UNAVAILABLE/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "같은 명령으로 상태 다시 확인" }));
    expect(onRetrySameCommand).toHaveBeenCalledTimes(2);
  });

  it("shows errors without hiding the ledger", () => {
    render(<PlatformAdminAiOps role="OPERATOR" summary={summary} jobs={[runningJob]} error="AI 작업 로딩 실패" />);

    expect(screen.getByRole("alert")).toHaveTextContent("AI 작업 로딩 실패");
    expect(screen.getByText(/Book/)).toBeInTheDocument();
  });

  it("renders failure codes as buttons and reports selection", async () => {
    const onSelectFailureCode = vi.fn();
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={summary}
        jobs={[]}
        onSelectFailureCode={onSelectFailureCode}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }));
    expect(onSelectFailureCode).toHaveBeenCalledWith("PROVIDER_RATE_LIMITED");
  });

  it("shows an active-filter banner with a clear control", async () => {
    const onClearFilter = vi.fn();
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={summary}
        jobs={[]}
        activeFilter={{ errorCode: "PROVIDER_RATE_LIMITED", clubId: null }}
        onClearFilter={onClearFilter}
      />,
    );
    const banner = screen.getByRole("status");
    expect(within(banner).getByText(/PROVIDER_RATE_LIMITED/)).toBeInTheDocument();
    await userEvent.click(within(banner).getByRole("button", { name: "전체 보기" }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it("shows an honest filtered empty state when a filter yields no jobs", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={summary}
        jobs={[]}
        activeFilter={{ errorCode: "PROVIDER_RATE_LIMITED", clubId: null }}
      />,
    );
    expect(screen.getByText("이 필터에 해당하는 AI job이 없습니다.")).toBeInTheDocument();
  });

  it("lets a capable operator review retry-commit on an eligible job", async () => {
    const onRequestPreview = vi.fn();
    const user = userEvent.setup();

    render(
      <PlatformAdminAiOps
        role="OPERATOR"
        canManageActions
        summary={summary}
        jobs={[committingJob]}
        onRequestPreview={onRequestPreview}
      />,
    );

    await user.click(screen.getByRole("button", { name: "커밋 복구 검토" }));

    expect(onRequestPreview).toHaveBeenCalledWith("job-2", "RETRY_COMMIT");
  });

  it("hides retry-commit from support role", () => {
    render(<PlatformAdminAiOps role="SUPPORT" summary={summary} jobs={[committingJob]} />);

    expect(screen.queryByRole("button", { name: "커밋 복구 검토" })).not.toBeInTheDocument();
  });

  it("does not show retry-commit when the job does not offer it", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        onRequestPreview={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "커밋 복구 검토" })).not.toBeInTheDocument();
  });

  it("uses the authoritative capability instead of role inference", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions={false}
        summary={summary}
        jobs={[runningJob]}
        onRequestPreview={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "강제 취소 검토" })).not.toBeInTheDocument();
    expect(screen.getByText("현재 권한으로는 AI 작업을 변경할 수 없습니다.")).toBeInTheDocument();
  });

  it("shows the windowed cost trend with a delta direction", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={{
          activeJobCount: 0,
          failedLast24h: 0,
          monthToDateCostEstimateUsd: "1.0000",
          failureCodes: [],
          providerCosts: [],
          staleCandidateCount: 0,
          costTrend: {
            window: "30d",
            currentCostUsd: "2.0000",
            priorCostUsd: "1.0000",
            currentJobCount: 5,
            priorJobCount: 4,
            deltaDirection: "UP",
            availability: "AVAILABLE",
          },
        }}
        jobs={[]}
        window="30d"
      />,
    );
    expect(screen.getByText(/\$2\.0000/)).toBeInTheDocument();
    expect(screen.getByLabelText(/cost trend direction/i)).toHaveTextContent(/▲|UP/);
  });

  it("shows an honest empty state when the trend lacks prior data", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={{
          activeJobCount: 0,
          failedLast24h: 0,
          monthToDateCostEstimateUsd: "0.0000",
          failureCodes: [],
          providerCosts: [],
          staleCandidateCount: 0,
          costTrend: {
            window: "7d",
            currentCostUsd: "0.5000",
            priorCostUsd: "0.0000",
            currentJobCount: 3,
            priorJobCount: 0,
            deltaDirection: "NONE",
            availability: "NOT_ENOUGH_DATA",
          },
        }}
        jobs={[]}
        window="7d"
      />,
    );
    expect(screen.getByText("데이터 부족")).toBeInTheDocument();
  });

  it("composes page context and an evidence ledger without inventing L3 convergence", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        onRequestPreview={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "AI 운영" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "AI 작업" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(screen.queryByText("공개 반영 추적")).not.toBeInTheDocument();
  });

  it("renders an L2 receipt timeline only after an actual command receipt", () => {
    const { rerender } = render(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        commandState={reviewState}
      />,
    );

    expect(document.querySelector(".admin-safe-action-dock")).toHaveAttribute("data-level", "L2");
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();

    rerender(
      <PlatformAdminAiOps
        role="OWNER"
        canManageActions
        summary={summary}
        jobs={[runningJob]}
        commandState={{
          ...reviewState,
          phase: "RECEIPT",
          receipt: {
            receiptId: "receipt-1",
            previewId: "preview-1",
            jobId: "job-1",
            action: "FORCE_CANCEL",
            beforeJobStatus: "RUNNING",
            beforeJobRevision: 7,
            afterJobStatus: "RUNNING",
            afterJobRevision: 7,
            originStatus: "ACCEPTED",
            effectStatus: "PENDING",
            safeErrorCode: "AI_EFFECT_UNAVAILABLE",
          },
        }}
      />,
    );

    expect(screen.getByRole("region", { name: "명령 기록" })).toHaveTextContent("receipt-1");
    expect(screen.queryByText("공개 반영 추적")).not.toBeInTheDocument();
  });

  it("locks 44px targets and reduced motion in the scoped AI 작업 stylesheet", () => {
    expect(LEDGER_CSS).toMatch(/\.admin-ai-ops[\s\S]*min-height:\s*44px/);
    expect(LEDGER_CSS).toContain(".admin-ai-ops");
    expect(LEDGER_CSS).toContain(":focus-visible");
    expect(LEDGER_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.admin-ai-ops[\s\S]*animation-duration:\s*0\.01ms/,
    );
    expect(LEDGER_CSS).not.toMatch(/backdrop-filter|linear-gradient/);
  });
});
