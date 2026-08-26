import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type { PlatformAdminAiOpsJob } from "@/features/platform-admin/api/platform-admin-contracts";
import {
  platformAdminAiOpsJobQuery,
  platformAdminAiOpsJobsInfiniteQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  purgePlatformAdminState,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminAiOpsRoute } from "./admin-ai-ops-route";

vi.mock("@/features/platform-admin/api/platform-admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-api")>()),
  fetchPlatformAdminSummary: vi.fn(() => new Promise(() => {})),
  fetchPlatformAdminAiOpsJob: vi.fn(),
  fetchPlatformAdminAiOpsSummary: vi.fn(),
  fetchPlatformAdminAiOpsJobs: vi.fn(),
  previewForceCancelPlatformAdminAiJob: vi.fn(),
  previewRetryCommitPlatformAdminAiJob: vi.fn(),
  confirmForceCancelPlatformAdminAiJob: vi.fn(),
  confirmRetryCommitPlatformAdminAiJob: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(() => new Promise(() => {})),
}));

import {
  confirmForceCancelPlatformAdminAiJob,
  fetchPlatformAdminAiOpsJob,
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  previewForceCancelPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";

const runningJob: PlatformAdminAiOpsJob = {
  jobId: "job-1",
  club: { clubId: "club-1", slug: "han-river", name: "한강 독서회" },
  session: { sessionId: "session-1", number: 8, bookTitle: "작별하지 않는다" },
  status: "RUNNING",
  stage: "GENERATING",
  provider: "OPENAI",
  model: "gpt-model",
  errorCode: null,
  safeErrorMessage: null,
  costEstimateUsd: "0.1200",
  createdAt: "2026-08-24T00:00:00Z",
  lastUpdatedAt: "2026-08-24T00:30:00Z",
  expiresAt: "2026-08-25T00:00:00Z",
  staleCandidate: true,
  revision: 7,
  cleanupPending: false,
  availableActions: ["FORCE_CANCEL"],
};

const summary = {
  activeJobCount: 1,
  failedLast24h: 0,
  monthToDateCostEstimateUsd: "0.1200",
  failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 2 }],
  providerCosts: [],
  staleCandidateCount: 1,
  costTrend: {
    window: "30d" as const,
    currentCostUsd: "0.1200",
    priorCostUsd: "0.1000",
    currentJobCount: 1,
    priorJobCount: 1,
    deltaDirection: "UP" as const,
    availability: "AVAILABLE" as const,
  },
};

function renderRoute(
  initialEntry = "/admin/ai-ops",
  options: {
    canManage?: boolean;
    pages?: PlatformAdminAiOpsJob[][];
    job?: PlatformAdminAiOpsJob;
    seedAdminContext?: boolean;
    summaryError?: unknown;
    jobsError?: unknown;
    jobError?: unknown;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  if (options.seedAdminContext !== false) {
    queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
      platformRole: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      domainsRequiringAction: [],
    });
    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_AI_OPERATIONS", ...(options.canManage === false ? [] : ["MANAGE_AI_OPERATIONS"])],
      generatedAt: "2026-08-25T00:00:00Z",
    });
  }
  if (options.summaryError === undefined) {
    queryClient.setQueryData(platformAdminAiOpsSummaryQuery("30d").queryKey, summary);
  } else {
    vi.mocked(fetchPlatformAdminAiOpsSummary).mockRejectedValue(options.summaryError);
  }
  const pages = options.pages ?? [[]];
  if (options.jobsError === undefined) {
    queryClient.setQueryData(platformAdminAiOpsJobsInfiniteQuery().queryKey, {
      pages: pages.map((items, index) => ({
        items,
        nextCursor: index < pages.length - 1 ? `cursor-${index + 2}` : null,
      })),
      pageParams: pages.map((_, index) => (index === 0 ? undefined : `cursor-${index + 1}`)),
    });
  } else {
    vi.mocked(fetchPlatformAdminAiOpsJobs).mockRejectedValue(options.jobsError);
  }
  queryClient.setQueryData(platformAdminAiOpsJobsInfiniteQuery({ errorCode: "PROVIDER_RATE_LIMITED" }).queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
  if (options.jobError !== undefined) {
    vi.mocked(fetchPlatformAdminAiOpsJob).mockRejectedValue(options.jobError);
  } else if (options.job) {
    queryClient.setQueryData(platformAdminAiOpsJobQuery(options.job.jobId).queryKey, options.job);
  }
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AdminAiOpsRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.mocked(fetchPlatformAdminAiOpsSummary).mockReset();
  vi.mocked(fetchPlatformAdminAiOpsSummary).mockResolvedValue(summary);
  vi.mocked(fetchPlatformAdminAiOpsJobs).mockReset();
  vi.mocked(fetchPlatformAdminAiOpsJobs).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(fetchPlatformAdminAiOpsJob).mockReset();
  vi.mocked(previewForceCancelPlatformAdminAiJob).mockReset();
  vi.mocked(confirmForceCancelPlatformAdminAiJob).mockReset();
});

describe("AdminAiOpsRoute", () => {
  it("renders the AI Ops heading and delegates to PlatformAdminAiOps", () => {
    const { container } = renderRoute();
    expect(screen.getByRole("heading", { name: /AI Ops/, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("selecting a failure code pushes the errorCode filter to the URL", async () => {
    renderRoute();
    await userEvent.click(screen.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }));
    expect(await screen.findByRole("button", { name: "전체 보기" })).toBeInTheDocument();
  });

  it("renders the active filter banner when navigated with an errorCode", () => {
    renderRoute("/admin/ai-ops?errorCode=PROVIDER_RATE_LIMITED");
    const banner = screen.getByRole("status");
    expect(within(banner).getByText(/PROVIDER_RATE_LIMITED/)).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "전체 보기" })).toBeInTheDocument();
  });

  it("flattens cursor pages without rendering a duplicate boundary job", () => {
    renderRoute("/admin/ai-ops", { pages: [[runningJob], [runningJob, { ...runningJob, jobId: "job-2" }]] });
    expect(screen.getAllByText(/한강 독서회/)).toHaveLength(2);
  });

  it("uses authoritative capabilities instead of inferring mutations from role", () => {
    renderRoute("/admin/ai-ops", { canManage: false, pages: [[runningJob]] });
    expect(screen.queryByRole("button", { name: "강제 취소 검토" })).not.toBeInTheDocument();
    expect(screen.getByText("현재 권한으로는 AI 작업을 변경할 수 없습니다.")).toBeInTheDocument();
  });

  it("keeps partial jobs visible for a transport-unknown summary and does not present missing metrics as zero", async () => {
    renderRoute("/admin/ai-ops", { pages: [[runningJob]], summaryError: new TypeError("network failed") });

    expect(await screen.findByRole("alert")).toHaveTextContent("일부 AI 운영 데이터를 불러오지 못했습니다.");
    expect(screen.getByText(/한강 독서회/)).toBeInTheDocument();
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 실패 코드 없음")).not.toBeInTheDocument();
  });

  it("distinguishes an unavailable ledger from an honestly empty ledger", async () => {
    renderRoute("/admin/ai-ops", { jobsError: new TypeError("jobs transport failed") });

    expect(await screen.findByRole("alert")).toHaveTextContent("AI 작업 목록을 불러오지 못했습니다.");
    expect(screen.queryByText("표시할 AI job이 없습니다.")).not.toBeInTheDocument();
  });

  it("surfaces a failed deep-linked detail instead of silently opening nothing", async () => {
    renderRoute("/admin/ai-ops?jobId=job-1", {
      pages: [[runningJob]],
      jobError: Object.assign(new Error("gone"), { status: 404 }),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("선택한 AI 작업 상세를 불러오지 못했습니다.");
    expect(screen.queryByRole("dialog", { name: "AI 작업 상세" })).not.toBeInTheDocument();
  });

  it("fails closed without crashing while admin authority caches are absent", () => {
    expect(() => renderRoute("/admin/ai-ops", { seedAdminContext: false, pages: [[runningJob]] })).not.toThrow();
    expect(screen.getByRole("status", { name: "관리자 권한 확인 중" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "강제 취소 검토" })).not.toBeInTheDocument();
  });

  it("purges an in-flight safe command when platform authority is lost", async () => {
    vi.mocked(previewForceCancelPlatformAdminAiJob).mockResolvedValue({
      previewId: "preview-1",
      jobId: "job-1",
      action: "FORCE_CANCEL",
      jobStatus: "RUNNING",
      jobRevision: 7,
      effectType: "AI_JOB_CANCEL",
      impactCodes: ["CANCEL_JOB"],
      expiresAt: "2026-08-25T01:00:00Z",
      fingerprintPrefix: "00112233",
    });
    const { queryClient } = renderRoute("/admin/ai-ops", { pages: [[runningJob]] });
    await userEvent.click(screen.getByRole("button", { name: "강제 취소 검토" }));
    expect(await screen.findByRole("dialog", { name: "강제 취소 확인" })).toBeInTheDocument();

    act(() => {
      purgePlatformAdminState(queryClient);
      queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
        platformRole: "OWNER",
        activeClubCount: 0,
        domainActionRequiredCount: 0,
        domainsRequiringAction: [],
      });
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: ["VIEW_AI_OPERATIONS"],
        generatedAt: "2026-08-25T00:00:00Z",
      });
    });

    expect(screen.queryByRole("dialog", { name: "강제 취소 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "강제 취소 확인" })).not.toBeInTheDocument();
    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: ["VIEW_AI_OPERATIONS", "MANAGE_AI_OPERATIONS"],
        generatedAt: "2026-08-25T00:00:00Z",
      });
    });
    expect(screen.queryByRole("dialog", { name: "강제 취소 확인" })).not.toBeInTheDocument();
  });

  it("opens a safe deep-linked drill-down without placing content in the URL", () => {
    renderRoute("/admin/ai-ops?jobId=job-1", { pages: [[runningJob]], job: runningJob });
    const dialog = screen.getByRole("dialog", { name: "AI 작업 상세" });
    expect(within(dialog).getByText(/job-1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/revision 7/)).toBeInTheDocument();
  });

  it("retries an ambiguous confirmation with the exact same idempotency request", async () => {
    const preview = {
      previewId: "preview-1",
      jobId: "job-1",
      action: "FORCE_CANCEL" as const,
      jobStatus: "RUNNING",
      jobRevision: 7,
      effectType: "AI_JOB_CANCEL",
      impactCodes: ["CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD"],
      expiresAt: "2026-08-25T01:00:00Z",
      fingerprintPrefix: "00112233",
    };
    vi.mocked(previewForceCancelPlatformAdminAiJob).mockResolvedValue(preview);
    vi.mocked(confirmForceCancelPlatformAdminAiJob)
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({
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
        safeErrorCode: null,
      });
    renderRoute("/admin/ai-ops", { pages: [[runningJob]] });

    await userEvent.click(screen.getByRole("button", { name: "강제 취소 검토" }));
    await userEvent.click(await screen.findByRole("button", { name: "강제 취소 확인" }));
    await userEvent.click(await screen.findByRole("button", { name: "같은 명령으로 다시 확인" }));

    await waitFor(() => expect(confirmForceCancelPlatformAdminAiJob).toHaveBeenCalledTimes(2));
    expect(vi.mocked(confirmForceCancelPlatformAdminAiJob).mock.calls[0]).toEqual(
      vi.mocked(confirmForceCancelPlatformAdminAiJob).mock.calls[1],
    );
    expect(await screen.findByRole("status", { name: "AI 명령 영수증" })).toHaveTextContent("receipt-1");
    expect(await screen.findByRole("region", { name: "명령 기록" })).toHaveTextContent("receipt-1");
    expect(screen.queryByText("공개 반영 추적")).not.toBeInTheDocument();
  });

  it("does not call preview when MANAGE_AI_OPERATIONS is absent even if the handler is invoked", async () => {
    renderRoute("/admin/ai-ops", { canManage: false, pages: [[runningJob]] });
    expect(screen.queryByRole("button", { name: "강제 취소 검토" })).not.toBeInTheDocument();
    expect(previewForceCancelPlatformAdminAiJob).not.toHaveBeenCalled();
    expect(confirmForceCancelPlatformAdminAiJob).not.toHaveBeenCalled();
  });

  it("purges preview and receipt after a confirm 403 without automatic retry", async () => {
    const preview = {
      previewId: "preview-1",
      jobId: "job-1",
      action: "FORCE_CANCEL" as const,
      jobStatus: "RUNNING",
      jobRevision: 7,
      effectType: "AI_JOB_CANCEL",
      impactCodes: ["CANCEL_JOB"],
      expiresAt: "2026-08-25T01:00:00Z",
      fingerprintPrefix: "00112233",
    };
    vi.mocked(previewForceCancelPlatformAdminAiJob).mockResolvedValue(preview);
    vi.mocked(confirmForceCancelPlatformAdminAiJob).mockRejectedValue(await forbiddenAiError());
    const { queryClient } = renderRoute("/admin/ai-ops", { pages: [[runningJob]] });

    await userEvent.click(screen.getByRole("button", { name: "강제 취소 검토" }));
    await userEvent.click(await screen.findByRole("button", { name: "강제 취소 확인" }));

    await waitFor(() => {
      expect(confirmForceCancelPlatformAdminAiJob).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
    });
    expect(screen.queryByRole("dialog", { name: "강제 취소 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
        platformRole: "OWNER",
        activeClubCount: 0,
        domainActionRequiredCount: 0,
        domainsRequiringAction: [],
      });
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: ["VIEW_AI_OPERATIONS", "MANAGE_AI_OPERATIONS"],
        generatedAt: "2026-08-25T00:00:00Z",
      });
    });
    expect(screen.queryByRole("dialog", { name: "강제 취소 확인" })).not.toBeInTheDocument();
    expect(confirmForceCancelPlatformAdminAiJob).toHaveBeenCalledTimes(1);
  });
});

async function forbiddenAiError() {
  return apiErrorFromResponse(
    new Response(
      JSON.stringify({
        code: "PERMISSION_DENIED",
        message: "이 작업을 수행할 권한이 없습니다.",
        status: 403,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
  );
}
