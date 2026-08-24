import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformAdminAiOpsJobListResponse,
  PlatformAdminAiOpsSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

vi.mock("@/features/platform-admin/api/platform-admin-api", () => ({
  fetchPlatformAdminAiGenerationCapabilities: vi.fn(),
  fetchPlatformAdminAiOpsJobs: vi.fn(),
  fetchPlatformAdminAiOpsSummary: vi.fn(),
  previewForceCancelPlatformAdminAiJob: vi.fn(),
  previewRetryCommitPlatformAdminAiJob: vi.fn(),
  confirmForceCancelPlatformAdminAiJob: vi.fn(),
  confirmRetryCommitPlatformAdminAiJob: vi.fn(),
}));

import {
  fetchPlatformAdminAiGenerationCapabilities,
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  previewForceCancelPlatformAdminAiJob,
  previewRetryCommitPlatformAdminAiJob,
  confirmForceCancelPlatformAdminAiJob,
  confirmRetryCommitPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
import {
  platformAdminAiGenerationCapabilitiesQuery,
  platformAdminAiOpsJobsInfiniteQuery,
  platformAdminAiOpsKeys,
  platformAdminAiOpsSummaryQuery,
  useConfirmPlatformAdminAiJobCommandMutation,
  usePreviewPlatformAdminAiJobCommandMutation,
} from "./platform-admin-ai-ops-queries";

const summary: PlatformAdminAiOpsSummaryResponse = {
  activeJobCount: 1,
  failedLast24h: 2,
  monthToDateCostEstimateUsd: "0.2500",
  failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 2 }],
  providerCosts: [{ provider: "OPENAI", model: "gpt-model", costEstimateUsd: "0.2500" }],
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

const jobs: PlatformAdminAiOpsJobListResponse = {
  items: [],
  nextCursor: null,
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) {
    throw new Error("Missing queryFn");
  }
  return query.queryFn({} as never);
}

beforeEach(() => {
  vi.mocked(fetchPlatformAdminAiGenerationCapabilities).mockReset();
  vi.mocked(fetchPlatformAdminAiOpsSummary).mockReset();
  vi.mocked(fetchPlatformAdminAiOpsJobs).mockReset();
  vi.mocked(previewForceCancelPlatformAdminAiJob).mockReset();
  vi.mocked(previewRetryCommitPlatformAdminAiJob).mockReset();
  vi.mocked(confirmForceCancelPlatformAdminAiJob).mockReset();
  vi.mocked(confirmRetryCommitPlatformAdminAiJob).mockReset();
});

describe("platform admin AI Ops query keys", () => {
  it("normalizes filters into stable query keys", () => {
    expect(platformAdminAiOpsKeys.summary()).toEqual(["platform-admin", "ai-ops", "summary", null]);
    expect(platformAdminAiOpsKeys.summary("7d")).toEqual([
      "platform-admin",
      "ai-ops",
      "summary",
      "7d",
    ]);
    expect(platformAdminAiOpsKeys.jobs({ status: "RUNNING", cursor: "ignored" })).toEqual([
      "platform-admin",
      "ai-ops",
      "jobs",
      { status: "RUNNING", clubId: null, errorCode: null },
    ]);
    expect(platformAdminAiOpsKeys.jobs()).toEqual([
      "platform-admin",
      "ai-ops",
      "jobs",
      { status: null, clubId: null, errorCode: null },
    ]);
  });

  it("query functions call AI Ops API wrappers", async () => {
    vi.mocked(fetchPlatformAdminAiGenerationCapabilities).mockResolvedValue({ enabled: false });
    vi.mocked(fetchPlatformAdminAiOpsSummary).mockResolvedValue(summary);
    vi.mocked(fetchPlatformAdminAiOpsJobs).mockResolvedValue(jobs);

    await runQuery(platformAdminAiGenerationCapabilitiesQuery());
    await runQuery(platformAdminAiOpsSummaryQuery());
    const query = platformAdminAiOpsJobsInfiniteQuery({ errorCode: "RATE_LIMITED" });
    await query.queryFn?.({ pageParam: undefined } as never);

    expect(fetchPlatformAdminAiGenerationCapabilities).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminAiOpsSummary).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminAiOpsJobs).toHaveBeenCalledWith({ errorCode: "RATE_LIMITED" });
  });

  it("uses the server cursor for continuation pages and stops at the last page", async () => {
    const first = { items: [], nextCursor: "cursor-2" };
    const last = { items: [], nextCursor: null };
    vi.mocked(fetchPlatformAdminAiOpsJobs).mockResolvedValueOnce(first).mockResolvedValueOnce(last);
    const query = platformAdminAiOpsJobsInfiniteQuery({ status: "RUNNING" });

    await query.queryFn?.({ pageParam: undefined } as never);
    await query.queryFn?.({ pageParam: "cursor-2" } as never);

    expect(fetchPlatformAdminAiOpsJobs).toHaveBeenNthCalledWith(1, { status: "RUNNING" });
    expect(fetchPlatformAdminAiOpsJobs).toHaveBeenNthCalledWith(2, {
      status: "RUNNING",
      cursor: "cursor-2",
    });
    expect(query.getNextPageParam?.(first, [first], undefined, [undefined])).toBe("cursor-2");
    expect(query.getNextPageParam?.(last, [first, last], "cursor-2", [undefined, "cursor-2"])).toBeUndefined();
  });
});

describe("platform admin AI Ops mutation cache behavior", () => {
  it("previews the selected safe action without invalidating the ledger", async () => {
    vi.mocked(previewForceCancelPlatformAdminAiJob).mockResolvedValue({
      previewId: "preview-1",
      jobId: "job-1",
      action: "FORCE_CANCEL",
      jobStatus: "RUNNING",
      jobRevision: 7,
      effectType: "AI_JOB_CANCEL",
      impactCodes: ["CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD"],
      expiresAt: "2026-08-25T01:00:00Z",
      fingerprintPrefix: "00112233",
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => usePreviewPlatformAdminAiJobCommandMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ jobId: "job-1", action: "FORCE_CANCEL" });
    });

    expect(previewForceCancelPlatformAdminAiJob).toHaveBeenCalledWith("job-1");
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("confirms with the caller-owned idempotency key and invalidates the ledger", async () => {
    const request = {
      previewId: "preview-1",
      idempotencyKey: "preview-1",
      expectedJobRevision: 7,
      confirmed: true,
    };
    vi.mocked(confirmRetryCommitPlatformAdminAiJob).mockResolvedValue({
      receiptId: "receipt-1",
      previewId: "preview-1",
      jobId: "job-1",
      action: "RETRY_COMMIT",
      beforeJobStatus: "COMMIT_RETRY",
      beforeJobRevision: 7,
      afterJobStatus: "COMMIT_RETRY",
      afterJobRevision: 7,
      originStatus: "ACCEPTED",
      effectStatus: "PENDING",
      safeErrorCode: null,
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useConfirmPlatformAdminAiJobCommandMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ jobId: "job-1", action: "RETRY_COMMIT", request });
    });

    expect(confirmRetryCommitPlatformAdminAiJob).toHaveBeenCalledWith("job-1", request);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: platformAdminAiOpsKeys.all });
  });
});
