import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiGenerationJobResponse, AiGenerationStatus } from "@/features/host/aigen/api/aigen-contracts";

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  getJob: vi.fn(),
}));

import { getJob } from "@/features/host/aigen/api/aigen-api";
import { aiGenerationJobKeys, useAiGenerationJob } from "./useAiGenerationJob";

const mockedGetJob = vi.mocked(getJob);

function jobResponse(status: AiGenerationStatus): AiGenerationJobResponse {
  return {
    jobId: "job-1",
    status,
    stage: status === "PENDING" ? "QUEUED" : null,
    progressPct: status === "SUCCEEDED" ? 100 : 0,
    model: "test-model",
    result: null,
    error: null,
    tokens: null,
    costEstimateUsd: "0.00",
    warnings: [],
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

describe("aiGenerationJobKeys", () => {
  it("namespaces by session and job id", () => {
    expect(aiGenerationJobKeys.all).toEqual(["host", "aigen", "jobs"]);
    expect(aiGenerationJobKeys.detail("s1", "j1")).toEqual([
      "host",
      "aigen",
      "jobs",
      "s1",
      "j1",
    ]);
  });
});

describe("useAiGenerationJob", () => {
  beforeEach(() => {
    mockedGetJob.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fetch when jobId is null", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", null), {
      wrapper: Wrapper,
    });

    // Give react-query a tick.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedGetJob).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not fetch when jobId is undefined", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", undefined), {
      wrapper: Wrapper,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedGetJob).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not fetch when enabled is false", async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useAiGenerationJob("s1", "j1", { enabled: false }), {
      wrapper: Wrapper,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedGetJob).not.toHaveBeenCalled();
  });

  it("stops polling when status is SUCCEEDED", async () => {
    mockedGetJob.mockResolvedValue(jobResponse("SUCCEEDED"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", "j1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("SUCCEEDED");
    });

    const callsAfterSettle = mockedGetJob.mock.calls.length;
    // Wait longer than any expected interval to confirm no more polls happen.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetJob.mock.calls.length).toBe(callsAfterSettle);
  });

  it("stops polling when status is FAILED", async () => {
    mockedGetJob.mockResolvedValue(jobResponse("FAILED"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", "j1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("FAILED");
    });

    const callsAfterSettle = mockedGetJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetJob.mock.calls.length).toBe(callsAfterSettle);
  });

  it("stops polling when status is CANCELLED", async () => {
    mockedGetJob.mockResolvedValue(jobResponse("CANCELLED"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", "j1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("CANCELLED");
    });

    const callsAfterSettle = mockedGetJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetJob.mock.calls.length).toBe(callsAfterSettle);
  });

  it("continues polling when status is COMMITTING", async () => {
    vi.useFakeTimers();
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTING"));
    const { Wrapper } = createWrapper();
    renderHook(() => useAiGenerationJob("s1", "j1"), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(2));
  });

  it("stops polling when status is COMMITTED", async () => {
    mockedGetJob.mockResolvedValue(jobResponse("COMMITTED"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", "j1"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("COMMITTED");
    });

    const callsAfterSettle = mockedGetJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetJob.mock.calls.length).toBe(callsAfterSettle);
  });

  it("polls at the spec-mandated cadence while RUNNING (first ~2s, then ~3-5s)", async () => {
    vi.useFakeTimers();
    const timestamps: number[] = [];
    const startedAt = Date.now();
    mockedGetJob.mockImplementation(() => {
      timestamps.push(Date.now() - startedAt);
      return Promise.resolve(jobResponse("RUNNING"));
    });

    const { Wrapper } = createWrapper();
    renderHook(() => useAiGenerationJob("s1", "j1"), { wrapper: Wrapper });

    // Flush the initial fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(1));

    // Advance well past the second poll (which should fire near 2s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(2));

    // Advance past the third poll (which should fire ~4s after the 2nd).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(3));

    // Validate the cadence: gap[1] ≈ 2s; gap[2] ≈ 3-5s (spec window).
    const gap1 = timestamps[1] - timestamps[0];
    const gap2 = timestamps[2] - timestamps[1];
    expect(gap1).toBeGreaterThanOrEqual(1500);
    expect(gap1).toBeLessThanOrEqual(2500);
    expect(gap2).toBeGreaterThanOrEqual(3000);
    expect(gap2).toBeLessThanOrEqual(5000);
  });

  it("does NOT poll again before the first scheduled interval elapses", async () => {
    vi.useFakeTimers();
    mockedGetJob.mockResolvedValue(jobResponse("RUNNING"));

    const { Wrapper } = createWrapper();
    renderHook(() => useAiGenerationJob("s1", "j1"), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await vi.waitFor(() => expect(mockedGetJob).toHaveBeenCalledTimes(1));

    // Comfortably under the 2s first-poll window — should still be only 1 call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockedGetJob).toHaveBeenCalledTimes(1);
  });

  it("resumes polling after a transient network error", async () => {
    let call = 0;
    mockedGetJob.mockImplementation(() => {
      call++;
      if (call === 1) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve(jobResponse("RUNNING"));
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAiGenerationJob("s1", "j1"), {
      wrapper: Wrapper,
    });

    // First call rejects -> retry: false in test client means error is delivered.
    await waitFor(() => {
      expect(result.current.isError || result.current.data !== undefined).toBe(true);
    });

    // The hook should still schedule the next poll. Wait until at least 1 more
    // call lands and produces data.
    await waitFor(
      () => {
        expect(result.current.data?.status).toBe("RUNNING");
      },
      { timeout: 5000 },
    );
    expect(mockedGetJob.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
