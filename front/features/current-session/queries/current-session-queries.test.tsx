import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVER_READ_SESSION_EXPIRY } from "@/shared/api/client";

vi.mock("@/features/current-session/api/current-session-api", () => ({
  getCurrentSession: vi.fn(),
  saveCurrentSessionCheckin: vi.fn(),
  saveCurrentSessionLongReview: vi.fn(),
  saveCurrentSessionOneLineReview: vi.fn(),
  saveCurrentSessionQuestions: vi.fn(),
  updateCurrentSessionRsvp: vi.fn(),
}));

import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import {
  currentSessionKeys,
  currentSessionQuery,
  invalidateCurrentSession,
  useSaveCurrentSessionCheckinMutation,
  useSaveCurrentSessionLongReviewMutation,
  useSaveCurrentSessionOneLineReviewMutation,
  useSaveCurrentSessionQuestionsMutation,
  useUpdateCurrentSessionRsvpMutation,
} from "./current-session-queries";

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

beforeEach(() => {
  vi.mocked(getCurrentSession).mockReset();
  vi.mocked(updateCurrentSessionRsvp).mockReset();
  vi.mocked(saveCurrentSessionCheckin).mockReset();
  vi.mocked(saveCurrentSessionQuestions).mockReset();
  vi.mocked(saveCurrentSessionLongReview).mockReset();
  vi.mocked(saveCurrentSessionOneLineReview).mockReset();
});

describe("current session query keys", () => {
  it("scopes keys by club slug and uses null for unscoped routes", () => {
    expect(currentSessionKeys.scope({ clubSlug: "reading-sai" })).toEqual([
      "current-session",
      "scope",
      "reading-sai",
    ]);
    expect(currentSessionKeys.current({ clubSlug: "reading-sai" })).toEqual([
      "current-session",
      "scope",
      "reading-sai",
      "current",
    ]);
    expect(currentSessionKeys.scope()).toEqual(["current-session", "scope", null]);
  });

  it("writes the scoped query result to the normalized cache key", async () => {
    const response = { currentSession: null };
    const context = { clubSlug: "reading-sai" };
    vi.mocked(getCurrentSession).mockResolvedValue(response);
    const { client } = createWrapper();
    const options = currentSessionQuery(context);

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual(currentSessionKeys.current(context));
    expect(getCurrentSession).toHaveBeenCalledWith(context);
    expect(client.getQueryData(currentSessionKeys.current(context))).toEqual(response);
  });

  it("opts only an explicitly mounted current-session query into read recovery", async () => {
    const response = { currentSession: null };
    const context = { clubSlug: "reading-sai" };
    vi.mocked(getCurrentSession).mockResolvedValue(response);
    const { client } = createWrapper();

    await client.fetchQuery(currentSessionQuery(context, RECOVER_READ_SESSION_EXPIRY));

    expect(getCurrentSession).toHaveBeenCalledWith(context, RECOVER_READ_SESSION_EXPIRY);
  });

  it("invalidates only the selected current-session scope while preserving values", async () => {
    const { client } = createWrapper();
    const selectedKey = currentSessionKeys.current({ clubSlug: "reading-sai" });
    const otherKey = currentSessionKeys.current({ clubSlug: "other-club" });
    client.setQueryData(selectedKey, { currentSession: { sessionId: "session-7" } });
    client.setQueryData(otherKey, { currentSession: { sessionId: "session-9" } });

    await invalidateCurrentSession(client, { clubSlug: "reading-sai" });

    expect(client.getQueryState(selectedKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(selectedKey)).toEqual({ currentSession: { sessionId: "session-7" } });
    expect(client.getQueryData(otherKey)).toEqual({ currentSession: { sessionId: "session-9" } });
  });
});

describe("current session mutation hooks", () => {
  it.each([
    [
      "rsvp",
      () => useUpdateCurrentSessionRsvpMutation({ clubSlug: "reading-sai" }),
      updateCurrentSessionRsvp,
      "GOING" as const,
    ],
    [
      "checkin",
      () => useSaveCurrentSessionCheckinMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionCheckin,
      72,
    ],
    [
      "questions",
      () => useSaveCurrentSessionQuestionsMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionQuestions,
      [{ priority: 1, text: "토론 질문" }],
    ],
    [
      "long review",
      () => useSaveCurrentSessionLongReviewMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionLongReview,
      "긴 서평",
    ],
    [
      "one-line review",
      () => useSaveCurrentSessionOneLineReviewMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionOneLineReview,
      "한줄평",
    ],
  ] as const)("invalidates the scoped cache and preserves its value after successful %s save", async (_name, hook, apiFn, payload) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const selectedKey = currentSessionKeys.current({ clubSlug: "reading-sai" });
    const otherKey = currentSessionKeys.current({ clubSlug: "other-club" });
    client.setQueryData(selectedKey, { currentSession: { sessionId: "session-7" } });
    client.setQueryData(otherKey, { currentSession: { sessionId: "session-9" } });
    const { result } = renderHook(hook, { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(payload as never);
    });

    expect(apiFn).toHaveBeenCalledWith(payload, { clubSlug: "reading-sai" });
    expect(client.getQueryState(selectedKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(selectedKey)).toEqual({ currentSession: { sessionId: "session-7" } });
  });

  it.each([
    [
      "rsvp",
      () => useUpdateCurrentSessionRsvpMutation({ clubSlug: "reading-sai" }),
      updateCurrentSessionRsvp,
      "GOING" as const,
    ],
    [
      "checkin",
      () => useSaveCurrentSessionCheckinMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionCheckin,
      72,
    ],
    [
      "questions",
      () => useSaveCurrentSessionQuestionsMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionQuestions,
      [{ priority: 1, text: "토론 질문" }],
    ],
    [
      "long review",
      () => useSaveCurrentSessionLongReviewMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionLongReview,
      "긴 서평",
    ],
    [
      "one-line review",
      () => useSaveCurrentSessionOneLineReviewMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionOneLineReview,
      "한줄평",
    ],
  ] as const)("leaves every cached scope unchanged when %s save fails", async (_name, hook, apiFn, payload) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("bad request", { status: 400 }) as never);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(
      currentSessionKeys.current({ clubSlug: "reading-sai" }),
      { currentSession: { sessionId: "session-7" } },
    );
    client.setQueryData(
      currentSessionKeys.current({ clubSlug: "other-club" }),
      { currentSession: { sessionId: "session-9" } },
    );
    const before = cacheState(client);
    const { result } = renderHook(hook, { wrapper: Wrapper });

    await expect(result.current.mutateAsync(payload as never)).rejects.toThrow("Current session save failed");
    expect(cacheState(client)).toEqual(before);
  });
});
