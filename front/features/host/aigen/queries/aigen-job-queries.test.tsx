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
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

function cacheState(client: QueryClient) {
  return client.getQueryCache().getAll().map((query) => ({
    queryKey: query.queryKey,
    data: query.state.data,
    isInvalidated: query.state.isInvalidated,
  }));
}

function seedCommitSurfaces(client: QueryClient) {
  const context = { clubSlug: "reading-sai" };
  const entries = [
    [aiJobKeys.recent("session-1"), recentJob("SUCCEEDED")],
    [aiJobKeys.detail("session-1", "job-1"), { jobId: "job-1", status: "SUCCEEDED" }],
    [aiJobKeys.models("session-1"), { models: [{ id: "model-1", provider: "test", isDefault: true }] }],
    [hostSessionKeys.detail("session-1", context), { sessionId: "session-1" }],
    [hostSessionKeys.closingStatus("session-1", context), { status: "OPEN" }],
    [hostSessionKeys.list({ limit: 50 }, context), { items: [{ sessionId: "session-1" }] }],
    [hostSessionKeys.dashboard(context), { sessions: ["session-1"] }],
    [hostSessionKeys.current(context), { sessionId: "session-1" }],
    [hostSessionKeys.manualDispatches({ sessionId: "session-1" }, context), { items: ["dispatch-1"] }],
  ] as const;
  for (const [key, value] of entries) {
    client.setQueryData(key, value);
  }
  return entries.map(([key]) => key);
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

  it("writes recent, detail, and model responses to their normalized cache keys", async () => {
    const recent = recentJob("RUNNING");
    const detail = {
      ...recentJob("RUNNING"),
      result: null,
      tokens: null,
      warnings: [],
    };
    const models = { models: [{ id: "model-1", provider: "test", isDefault: true }] };
    vi.mocked(getRecentJob).mockResolvedValue(recent);
    vi.mocked(getJob).mockResolvedValue(detail);
    vi.mocked(getAvailableModels).mockResolvedValue(models);
    const { client } = createWrapper();
    const recentOptions = recentAiJobQuery("session-1");
    const detailOptions = aiJobDetailQuery("session-1", "job-1");
    const modelsOptions = availableAiModelsQuery("session-1");

    await Promise.all([
      client.fetchQuery(recentOptions),
      client.fetchQuery(detailOptions),
      client.fetchQuery(modelsOptions),
    ]);

    expect(recentOptions.queryKey).toEqual(aiJobKeys.recent("session-1"));
    expect(detailOptions.queryKey).toEqual(aiJobKeys.detail("session-1", "job-1"));
    expect(modelsOptions.queryKey).toEqual(aiJobKeys.models("session-1"));
    expect(getRecentJob).toHaveBeenCalledWith("session-1");
    expect(getJob).toHaveBeenCalledWith("session-1", "job-1");
    expect(getAvailableModels).toHaveBeenCalledWith("session-1");
    expect(client.getQueryData(aiJobKeys.recent("session-1"))).toEqual(recent);
    expect(client.getQueryData(aiJobKeys.detail("session-1", "job-1"))).toEqual(detail);
    expect(client.getQueryData(aiJobKeys.models("session-1"))).toEqual(models);
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

  it("invalidates AI and record-only session caches while retaining their values after draft commit", async () => {
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
    const seededKeys = seedCommitSurfaces(client);
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
    for (const key of seededKeys.slice(0, -1)) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
      expect(client.getQueryData(key), JSON.stringify(key)).toBeDefined();
    }
    const manualDispatchKey = seededKeys.at(-1)!;
    expect(client.getQueryState(manualDispatchKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(manualDispatchKey)).toEqual({ items: ["dispatch-1"] });
  });

  it("leaves AI and host-session caches unchanged when draft commit fails", async () => {
    vi.mocked(commitGeneration).mockRejectedValue(new Error("commit failed"));
    const { client, Wrapper } = createWrapper();
    seedCommitSurfaces(client);
    const before = cacheState(client);
    const { result } = renderHook(
      () => useCommitAiJobMutation(
        "session-1",
        "job-1",
        { clubSlug: "reading-sai" },
      ),
      { wrapper: Wrapper },
    );

    await expect(result.current.mutateAsync({ recordVisibility: "MEMBER" })).rejects.toThrow("commit failed");
    expect(cacheState(client)).toEqual(before);
  });
});
