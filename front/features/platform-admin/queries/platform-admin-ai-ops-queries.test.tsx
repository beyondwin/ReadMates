import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformAdminAiOpsJobListResponse,
  PlatformAdminAiOpsSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

vi.mock("@/features/platform-admin/api/platform-admin-api", () => ({
  fetchPlatformAdminAiOpsJobs: vi.fn(),
  fetchPlatformAdminAiOpsSummary: vi.fn(),
  forceCancelPlatformAdminAiJob: vi.fn(),
  retryCommitPlatformAdminAiJob: vi.fn(),
}));

import {
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  forceCancelPlatformAdminAiJob,
  retryCommitPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsKeys,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
  useRetryCommitPlatformAdminAiJobMutation,
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
  vi.mocked(fetchPlatformAdminAiOpsSummary).mockReset();
  vi.mocked(fetchPlatformAdminAiOpsJobs).mockReset();
  vi.mocked(forceCancelPlatformAdminAiJob).mockReset();
  vi.mocked(retryCommitPlatformAdminAiJob).mockReset();
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
    expect(platformAdminAiOpsKeys.jobs({ status: "RUNNING" })).toEqual([
      "platform-admin",
      "ai-ops",
      "jobs",
      { status: "RUNNING", clubId: null, errorCode: null, cursor: null },
    ]);
    expect(platformAdminAiOpsKeys.jobs()).toEqual([
      "platform-admin",
      "ai-ops",
      "jobs",
      { status: null, clubId: null, errorCode: null, cursor: null },
    ]);
  });

  it("query functions call AI Ops API wrappers", async () => {
    vi.mocked(fetchPlatformAdminAiOpsSummary).mockResolvedValue(summary);
    vi.mocked(fetchPlatformAdminAiOpsJobs).mockResolvedValue(jobs);

    await runQuery(platformAdminAiOpsSummaryQuery());
    await runQuery(platformAdminAiOpsJobsQuery({ errorCode: "RATE_LIMITED" }));

    expect(fetchPlatformAdminAiOpsSummary).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminAiOpsJobs).toHaveBeenCalledWith({ errorCode: "RATE_LIMITED" });
  });
});

describe("platform admin AI Ops mutation cache behavior", () => {
  it("invalidates summary and ledger queries after force cancel", async () => {
    vi.mocked(forceCancelPlatformAdminAiJob).mockResolvedValue({
      jobId: "job-1",
      previousStatus: "RUNNING",
      nextStatus: "CANCELLED",
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useForceCancelPlatformAdminAiJobMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("job-1");
    });

    expect(forceCancelPlatformAdminAiJob).toHaveBeenCalledWith("job-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: platformAdminAiOpsKeys.all });
  });

  it("invalidates summary and ledger queries after retry commit", async () => {
    vi.mocked(retryCommitPlatformAdminAiJob).mockResolvedValue({
      jobId: "job-1",
      previousStatus: "COMMITTING",
      nextStatus: "SUCCEEDED",
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRetryCommitPlatformAdminAiJobMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("job-1");
    });

    expect(retryCommitPlatformAdminAiJob).toHaveBeenCalledWith("job-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: platformAdminAiOpsKeys.all });
  });
});
