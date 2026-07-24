import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AiRecentJobResponse } from "@/features/host/aigen/api/aigen-contracts";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  cancelGeneration: vi.fn(),
  commitGeneration: vi.fn(),
  getJob: vi.fn(),
  getRecentJob: vi.fn(),
  getAvailableModels: vi.fn(),
  regenerateItem: vi.fn(),
  startGeneration: vi.fn(),
}));

import {
  commitGeneration,
  getAvailableModels,
  getJob,
  getRecentJob,
} from "@/features/host/aigen/api/aigen-api";
import { hostSessionKeys } from "@/features/host/queries/host-session-queries";
import {
  aiJobDetailQuery,
  aiJobKeys,
  availableAiModelsQuery,
  recentAiJobQuery,
  useCommitAiJobMutation,
} from "./aigen-job-queries";

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) {
    throw new Error("Missing queryFn");
  }
  return query.queryFn({} as never);
}

function recentJob(status: AiRecentJobResponse["status"]): AiRecentJobResponse {
  return {
    jobId: "job-1",
    status,
    stage: "READY",
    progressPct: 100,
    model: "claude-sonnet-4-6",
    error: null,
    costEstimateUsd: "0.12",
    createdAt: "2026-05-18T00:00:00Z",
    lastUpdatedAt: "2026-05-18T00:01:00Z",
    expiresAt: "2026-05-18T06:00:00Z",
    availableActions: ["POLL", "CANCEL"],
  };
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("AI job query helpers", () => {
  it("scopes recent and detail keys by host session", () => {
    expect(aiJobKeys.recent("session-1")).toEqual([
      "host",
      "aigen",
      "jobs",
      "session",
      "session-1",
      "recent",
    ]);
    expect(aiJobKeys.detail("session-1", "job-1")).toEqual([
      "host",
      "aigen",
      "jobs",
      "session",
      "session-1",
      "detail",
      "job-1",
    ]);
    expect(aiJobKeys.models("session-1")).toEqual([
      "host", "aigen", "jobs", "session", "session-1", "models",
    ]);
  });

  it("query functions call host AI API wrappers", async () => {
    vi.mocked(getRecentJob).mockResolvedValue(null);
    vi.mocked(getJob).mockResolvedValue({
      ...recentJob("RUNNING"),
      result: null,
      tokens: null,
      warnings: [],
    });
    vi.mocked(getAvailableModels).mockResolvedValue({ models: [] });

    await runQuery(recentAiJobQuery("session-1"));
    await runQuery(aiJobDetailQuery("session-1", "job-1"));
    await runQuery(availableAiModelsQuery("session-1"));

    expect(getRecentJob).toHaveBeenCalledWith("session-1");
    expect(getJob).toHaveBeenCalledWith("session-1", "job-1");
    expect(getAvailableModels).toHaveBeenCalledWith("session-1");
  });

  it("polls recent recoverable jobs until the server stops returning one", () => {
    const options = recentAiJobQuery("session-1");
    const interval = options.refetchInterval;
    if (typeof interval !== "function") {
      throw new Error("Expected functional refetchInterval");
    }

    expect(interval({ state: { data: null } } as never)).toBe(false);
    expect(interval({ state: { data: recentJob("RUNNING") } } as never)).toBe(4000);
  });

  it("invalidates AI and record-only session surfaces after draft commit", async () => {
    vi.mocked(commitGeneration).mockResolvedValue({
      sessionId: "session-1",
      status: "COMMITTED",
      recovered: false,
      participantUpdatesCount: 2,
      draftRevision: 2,
      baseLiveRevision: 1,
      liveApplied: false,
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => useCommitAiJobMutation(
        "session-1",
        "job-1",
        { clubSlug: "reading-sai" },
      ),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ recordVisibility: "MEMBER" });
    });

    expect(commitGeneration).toHaveBeenCalledWith(
      "session-1",
      "job-1",
      { recordVisibility: "MEMBER" },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: aiJobKeys.session("session-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.detail("session-1", { clubSlug: "reading-sai" }),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }),
    });
  });
});
